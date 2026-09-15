import { isoWeekInfo, isoWeekRange } from "./iso-week";
import {
  buildStatV1Ranking,
  STAT_V1_METHOD_VERSION,
  type HistoricalWeekContext,
  type StatDraw,
} from "./stat-v1";

export const BACKTEST_K_VALUES = [5, 10, 15] as const;

export type BacktestK = (typeof BACKTEST_K_VALUES)[number];

export type BacktestDraw = StatDraw & {
  lottery: string;
  lotteryName: string;
};

export type BacktestEvidence =
  | "advantage_in_backtest"
  | "not_demonstrated"
  | "small_sample";

export type BacktestMetric = {
  k: BacktestK;
  evaluatedDraws: number;
  hits: number;
  hitRate: number;
  matches: number;
  matchesPerDraw: number;
  simpleFrequencyHits: number;
  simpleFrequencyRate: number;
  randomExpectedHits: number;
  randomHitRate: number;
  differenceFromRandomPoints: number;
  differenceFromSimplePoints: number;
  liftVsRandom: number;
  confidenceLow: number;
  confidenceHigh: number;
  pValueVsRandom: number;
  evidence: BacktestEvidence;
};

export type BacktestBreakdown = {
  lottery: string;
  lotteryName: string;
  evaluatedDraws: number;
  weeksEvaluated: number;
  weeksSkippedForHistory: number;
  metrics: BacktestMetric[];
};

export type BacktestResult = {
  methodVersion: string;
  targetYear: number;
  historicalYears: number[];
  generatedAt: string;
  drawCountReceived: number;
  evaluatedDraws: number;
  weeksEvaluated: number;
  weeksSkippedForHistory: number;
  dateFrom: string | null;
  dateTo: string | null;
  metrics: BacktestMetric[];
  lotteries: BacktestBreakdown[];
  verdict: "advantage_in_backtest" | "not_demonstrated" | "insufficient_data";
  verdictLabel: string;
  notes: string[];
};

type Observation = {
  lottery: string;
  lotteryName: string;
  isoWeek: number;
  drawDate: string;
  methodHits: Record<BacktestK, boolean>;
  methodMatches: Record<BacktestK, number>;
  simpleHits: Record<BacktestK, boolean>;
  randomProbability: Record<BacktestK, number>;
};

type LotteryAccumulator = {
  lottery: string;
  lotteryName: string;
  observations: Observation[];
  evaluatedWeeks: Set<number>;
  skippedWeeks: Set<number>;
};

function parseDrawDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function distinctDrawDates(draws: BacktestDraw[]) {
  return new Set(draws.map((draw) => draw.drawDate)).size;
}

function drawNumbers(draw: BacktestDraw) {
  return [draw.firstNumber, draw.secondNumber, draw.thirdNumber];
}

function simpleFrequencyRanking(draws: BacktestDraw[]) {
  const counts = new Map<string, number>();

  for (const draw of draws) {
    for (const number of drawNumbers(draw)) {
      counts.set(number, (counts.get(number) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort(([numberA, countA], [numberB, countB]) =>
      countB - countA || numberA.localeCompare(numberB),
    )
    .map(([number]) => number);
}

function randomHitProbability(candidateCount: number, distinctWinningNumbers: number) {
  if (candidateCount <= 0 || distinctWinningNumbers <= 0) return 0;
  if (candidateCount > 100 - distinctWinningNumbers) return 1;

  let missProbability = 1;
  for (let index = 0; index < candidateCount; index += 1) {
    missProbability *=
      (100 - distinctWinningNumbers - index) / (100 - index);
  }
  return 1 - missProbability;
}

function wilsonInterval(successes: number, total: number) {
  if (total === 0) return { low: 0, high: 0 };

  const z = 1.959963984540054;
  const proportion = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (proportion + (z * z) / (2 * total)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt(
      (proportion * (1 - proportion)) / total +
        (z * z) / (4 * total * total),
    );

  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

/** Exact upper-tail probability for independent Bernoulli trials with varying p. */
function poissonBinomialUpperTail(probabilities: number[], observedHits: number) {
  if (observedHits <= 0) return 1;
  if (probabilities.length === 0 || observedHits > probabilities.length) return 0;

  const distribution = Array.from({ length: probabilities.length + 1 }, () => 0);
  distribution[0] = 1;

  probabilities.forEach((probability, trialIndex) => {
    for (let hits = trialIndex + 1; hits >= 0; hits -= 1) {
      const withHit = hits > 0 ? distribution[hits - 1] * probability : 0;
      const withoutHit = distribution[hits] * (1 - probability);
      distribution[hits] = withHit + withoutHit;
    }
  });

  return distribution
    .slice(observedHits)
    .reduce((total, probability) => total + probability, 0);
}

function metricFor(observations: Observation[], k: BacktestK): BacktestMetric {
  const evaluatedDraws = observations.length;
  const hits = observations.filter((item) => item.methodHits[k]).length;
  const matches = observations.reduce(
    (total, item) => total + item.methodMatches[k],
    0,
  );
  const simpleFrequencyHits = observations.filter(
    (item) => item.simpleHits[k],
  ).length;
  const probabilities = observations.map((item) => item.randomProbability[k]);
  const randomExpectedHits = probabilities.reduce((total, value) => total + value, 0);
  const hitRate = evaluatedDraws > 0 ? hits / evaluatedDraws : 0;
  const simpleFrequencyRate =
    evaluatedDraws > 0 ? simpleFrequencyHits / evaluatedDraws : 0;
  const randomHitRate =
    evaluatedDraws > 0 ? randomExpectedHits / evaluatedDraws : 0;
  const confidence = wilsonInterval(hits, evaluatedDraws);
  const pValueVsRandom = poissonBinomialUpperTail(probabilities, hits);
  const correctedAlpha = 0.05 / BACKTEST_K_VALUES.length;

  let evidence: BacktestEvidence = "not_demonstrated";
  if (evaluatedDraws < 30) {
    evidence = "small_sample";
  } else if (
    hitRate > randomHitRate &&
    confidence.low > randomHitRate &&
    pValueVsRandom < correctedAlpha
  ) {
    evidence = "advantage_in_backtest";
  }

  return {
    k,
    evaluatedDraws,
    hits,
    hitRate,
    matches,
    matchesPerDraw: evaluatedDraws > 0 ? matches / evaluatedDraws : 0,
    simpleFrequencyHits,
    simpleFrequencyRate,
    randomExpectedHits,
    randomHitRate,
    differenceFromRandomPoints: (hitRate - randomHitRate) * 100,
    differenceFromSimplePoints: (hitRate - simpleFrequencyRate) * 100,
    liftVsRandom: randomHitRate > 0 ? hitRate / randomHitRate : 0,
    confidenceLow: confidence.low,
    confidenceHigh: confidence.high,
    pValueVsRandom,
    evidence,
  };
}

function isCompleteHistoricalWeek(
  draws: BacktestDraw[],
  historicalYears: number[],
  isoWeek: number,
) {
  return historicalYears.every((isoYear) => {
    const yearDraws = draws.filter((draw) => {
      const parsed = parseDrawDate(draw.drawDate);
      if (!parsed) return false;
      const info = isoWeekInfo(parsed);
      return info.isoYear === isoYear && info.isoWeek === isoWeek;
    });
    return distinctDrawDates(yearDraws) === 7;
  });
}

function historiesForWeek(
  draws: BacktestDraw[],
  historicalYears: number[],
  isoWeek: number,
) {
  return draws.filter((draw) => {
    const parsed = parseDrawDate(draw.drawDate);
    if (!parsed) return false;
    const info = isoWeekInfo(parsed);
    return historicalYears.includes(info.isoYear) && info.isoWeek === isoWeek;
  });
}

function targetDrawsForWeek(draws: BacktestDraw[], targetYear: number, isoWeek: number) {
  return draws.filter((draw) => {
    const parsed = parseDrawDate(draw.drawDate);
    if (!parsed) return false;
    const info = isoWeekInfo(parsed);
    return info.isoYear === targetYear && info.isoWeek === isoWeek;
  });
}

function observationFor(
  draw: BacktestDraw,
  isoWeek: number,
  methodRanking: string[],
  simpleRanking: string[],
): Observation {
  const results = drawNumbers(draw);
  const distinctResults = new Set(results).size;
  const methodHits = {} as Record<BacktestK, boolean>;
  const methodMatches = {} as Record<BacktestK, number>;
  const simpleHits = {} as Record<BacktestK, boolean>;
  const randomProbability = {} as Record<BacktestK, number>;

  for (const k of BACKTEST_K_VALUES) {
    const methodCandidates = new Set(methodRanking.slice(0, k));
    const simpleCandidates = new Set(simpleRanking.slice(0, k));
    const matchedPositions = results.filter((number) => methodCandidates.has(number));

    methodHits[k] = matchedPositions.length > 0;
    methodMatches[k] = matchedPositions.length;
    simpleHits[k] = results.some((number) => simpleCandidates.has(number));
    randomProbability[k] = randomHitProbability(
      methodCandidates.size,
      distinctResults,
    );
  }

  return {
    lottery: draw.lottery,
    lotteryName: draw.lotteryName,
    isoWeek,
    drawDate: draw.drawDate,
    methodHits,
    methodMatches,
    simpleHits,
    randomProbability,
  };
}

export function runBacktest(
  draws: BacktestDraw[],
  targetYear: number,
): BacktestResult {
  const historicalYears = [targetYear - 3, targetYear - 2, targetYear - 1];
  const validDraws = draws.filter((draw) => parseDrawDate(draw.drawDate));
  const lotteryDefinitions = new Map<string, string>();

  for (const draw of validDraws) {
    lotteryDefinitions.set(draw.lottery, draw.lotteryName || draw.lottery);
  }

  const accumulators = [...lotteryDefinitions.entries()].map(
    ([lottery, lotteryName]): LotteryAccumulator => ({
      lottery,
      lotteryName,
      observations: [],
      evaluatedWeeks: new Set<number>(),
      skippedWeeks: new Set<number>(),
    }),
  );

  for (const accumulator of accumulators) {
    const lotteryDraws = validDraws.filter(
      (draw) => draw.lottery === accumulator.lottery,
    );

    for (let isoWeek = 1; isoWeek <= 53; isoWeek += 1) {
      if (!isoWeekRange(targetYear, isoWeek)) continue;

      const targetDraws = targetDrawsForWeek(lotteryDraws, targetYear, isoWeek);
      if (targetDraws.length === 0) continue;

      if (!isCompleteHistoricalWeek(lotteryDraws, historicalYears, isoWeek)) {
        accumulator.skippedWeeks.add(isoWeek);
        continue;
      }

      const historicalDraws = historiesForWeek(
        lotteryDraws,
        historicalYears,
        isoWeek,
      );
      const weeks = historicalYears.map((isoYear) => {
        const range = isoWeekRange(isoYear, isoWeek);
        if (!range) return null;
        return { isoYear, monday: range.monday } satisfies HistoricalWeekContext;
      });

      if (weeks.some((week) => week === null)) {
        accumulator.skippedWeeks.add(isoWeek);
        continue;
      }

      const methodRanking = buildStatV1Ranking(
        historicalDraws,
        weeks as HistoricalWeekContext[],
      ).map((candidate) => candidate.number);
      const simpleRanking = simpleFrequencyRanking(historicalDraws);

      for (const targetDraw of targetDraws) {
        accumulator.observations.push(
          observationFor(
            targetDraw,
            isoWeek,
            methodRanking,
            simpleRanking,
          ),
        );
      }
      accumulator.evaluatedWeeks.add(isoWeek);
    }
  }

  const observations = accumulators.flatMap((item) => item.observations);
  const metrics = BACKTEST_K_VALUES.map((k) => metricFor(observations, k));
  const lotteries = accumulators.map((item) => ({
    lottery: item.lottery,
    lotteryName: item.lotteryName,
    evaluatedDraws: item.observations.length,
    weeksEvaluated: item.evaluatedWeeks.size,
    weeksSkippedForHistory: item.skippedWeeks.size,
    metrics: BACKTEST_K_VALUES.map((k) => metricFor(item.observations, k)),
  }));
  const evaluatedWeekKeys = new Set(
    observations.map((item) => `${item.lottery}:${item.isoWeek}`),
  );
  const skippedWeekKeys = new Set(
    accumulators.flatMap((item) =>
      [...item.skippedWeeks].map((week) => `${item.lottery}:${week}`),
    ),
  );
  const dates = validDraws.map((draw) => draw.drawDate).sort();
  const hasMeasuredAdvantage = metrics.some(
    (metric) => metric.evidence === "advantage_in_backtest",
  );
  const verdict = observations.length === 0
    ? "insufficient_data"
    : hasMeasuredAdvantage
      ? "advantage_in_backtest"
      : "not_demonstrated";

  const verdictLabel = verdict === "insufficient_data"
    ? "Datos insuficientes para ejecutar el backtest sin sustituir semanas faltantes."
    : verdict === "advantage_in_backtest"
      ? "Existe una ventaja retrospectiva en al menos un corte, pero todavía requiere validación prospectiva independiente."
      : "El backtest no demuestra una ventaja medible frente al azar."

  return {
    methodVersion: STAT_V1_METHOD_VERSION,
    targetYear,
    historicalYears,
    generatedAt: new Date().toISOString(),
    drawCountReceived: validDraws.length,
    evaluatedDraws: observations.length,
    weeksEvaluated: evaluatedWeekKeys.size,
    weeksSkippedForHistory: skippedWeekKeys.size,
    dateFrom: dates[0] ?? null,
    dateTo: dates.at(-1) ?? null,
    metrics,
    lotteries,
    verdict,
    verdictLabel,
    notes: [
      "Cada semana objetivo usa exclusivamente la misma semana ISO de los tres años anteriores.",
      "El baseline aleatorio es la probabilidad exacta de seleccionar la misma cantidad de candidatos sin reemplazo entre 00 y 99.",
      "El valor p usa la cola superior Poisson-binomial; el umbral exploratorio se corrige para tres cortes: 0.05/3.",
      "STAT-V1.0 no asigna una posición futura, por lo que no se informa exactitud de posición como si fuera una predicción.",
    ],
  };
}
