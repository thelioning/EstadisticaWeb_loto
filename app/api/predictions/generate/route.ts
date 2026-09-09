import { and, asc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import {
  drawResults,
  lotteries,
  predictionCandidates,
  predictions,
} from "../../../../db/schema";
import {
  addUtcDays,
  formatIsoDate,
  isoWeekInfo,
  isoWeekRange,
  rangeContainsDate,
  type IsoWeekRange,
} from "../../../../lib/iso-week";
import {
  parseNumberArray,
  projectionKindForWeekStart,
  projectionKindLabel,
  type ProjectionKind,
} from "../../../../lib/prediction-freeze";
import {
  buildStatV1DailyRanking,
  buildStatV1Ranking,
  STAT_V1_METHOD_VERSION,
  statV1Signal,
  type HistoricalWeekContext,
  type StatDraw,
  type StatV1Candidate,
} from "../../../../lib/stat-v1";

const TIME_ZONE = "America/Santo_Domingo";
const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const LOTTERY_META: Record<string, { shortName: string; accent: string }> = {
  nacional: { shortName: "LOTERÍA NACIONAL", accent: "#1a5e9a" },
  leidsa: { shortName: "LEIDSA", accent: "#0b6a4f" },
  loteka: { shortName: "LOTEKA", accent: "#9a4e20" },
};

type Draw = StatDraw & {
  year: number;
  month: number;
};

type LotteryRow = {
  id: number;
  slug: string;
  name: string;
};

type LotteryAnalysis = {
  lottery: LotteryRow;
  equivalentWeekDraws: Draw[];
  weeklyRanking: StatV1Candidate[];
  dailyRankings: StatV1Candidate[][];
  payload: {
    id: string;
    name: string;
    shortName: string;
    accent: string;
    methodVersion: string;
    candidates: ReturnType<typeof candidatePayload>[];
    dailyHotNumbers: string[];
    weeklyHotNumbers: string[];
    weeklyCoincidences: ReturnType<typeof coincidenceDayPayload>[];
    pairs: string[];
    historicalDrawCount: number;
    hasSufficientData: boolean;
  };
};

type SnapshotParameters = {
  methodVersion: string;
  isoYear: number;
  isoWeek: number;
  historicalYears: number[];
  historicalWeeks: Array<{ isoYear: number; start: string; end: string }>;
  rankingRules: string[];
  weeklyLimit: number;
  dailyLimit: number;
  historicalDraws: Draw[];
};

function formatShortDate(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTHS[date.getUTCMonth()]}`;
}

function parseTargetDate(requestedDate: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return new Date(`${requestedDate}T12:00:00.000Z`);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return new Date(`${value("year")}-${value("month")}-${value("day")}T12:00:00.000Z`);
}

function analysisPeriod(targetDate: Date) {
  const targetWeek = isoWeekInfo(targetDate);
  const targetRange = isoWeekRange(targetWeek.isoYear, targetWeek.isoWeek);
  if (!targetRange) {
    throw new Error("No fue posible determinar la semana ISO objetivo.");
  }

  const historicalYears = [
    targetWeek.isoYear - 3,
    targetWeek.isoYear - 2,
    targetWeek.isoYear - 1,
  ];

  const historicalWeeks = historicalYears.map((isoYear) => ({
    isoYear,
    range: isoWeekRange(isoYear, targetWeek.isoWeek),
  }));

  return {
    targetRange,
    targetYear: targetWeek.isoYear,
    isoWeek: targetWeek.isoWeek,
    selectedDate: formatIsoDate(targetDate),
    historicalYears,
    historicalWeeks,
  };
}

function drawNumbers(draw: Draw) {
  return [draw.firstNumber, draw.secondNumber, draw.thirdNumber];
}

function drawsInRange(draws: Draw[], range: IsoWeekRange) {
  return draws.filter((draw) => rangeContainsDate(draw.drawDate, range));
}

function recurrentPairs(draws: Draw[], limit = 3) {
  const counts = new Map<string, number>();
  for (const draw of draws) {
    const numbers = [...new Set(drawNumbers(draw))].sort();
    for (let left = 0; left < numbers.length; left += 1) {
      for (let right = left + 1; right < numbers.length; right += 1) {
        const pair = `${numbers[left]}–${numbers[right]}`;
        counts.set(pair, (counts.get(pair) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([pair]) => pair);
}

function coincidencesForWeekday(
  weekdayIndex: number,
  draws: Draw[],
  historicalRanges: IsoWeekRange[],
  reinforcedNumbers: Set<string>,
) {
  const yearsByNumber = new Map<string, Set<number>>();

  for (const range of historicalRanges) {
    const historicalDate = formatIsoDate(addUtcDays(range.monday, weekdayIndex));
    const dayDraws = draws.filter((draw) => draw.drawDate === historicalDate);
    const numbers = new Set(dayDraws.flatMap(drawNumbers));

    for (const number of numbers) {
      const years = yearsByNumber.get(number) ?? new Set<number>();
      years.add(range.isoYear);
      yearsByNumber.set(number, years);
    }
  }

  return [...yearsByNumber.entries()]
    .map(([number, years]) => ({
      number,
      years: [...years].sort(),
      occurrences: years.size,
      reinforced: reinforcedNumbers.has(number),
    }))
    .filter((item) => item.occurrences >= 2)
    .sort((a, b) => b.occurrences - a.occurrences || a.number.localeCompare(b.number))
    .slice(0, 8);
}

function historicalWeekPayload(
  isoYear: number,
  isoWeek: number,
  range: IsoWeekRange | null,
) {
  if (!range) {
    return {
      isoYear,
      isoWeek,
      available: false,
      start: null,
      end: null,
      label: `Semana ISO ${isoWeek} no existe en ${isoYear}`,
    };
  }

  return {
    isoYear,
    isoWeek,
    available: true,
    start: formatIsoDate(range.monday),
    end: formatIsoDate(range.sunday),
    label: `${formatShortDate(range.monday)} — ${formatShortDate(range.sunday)} ${range.sunday.getUTCFullYear()}`,
  };
}

function candidatePayload(item: StatV1Candidate) {
  return {
    number: item.number,
    ranking: item.ranking,
    score: item.score,
    signal: statV1Signal(item),
    totalCount: item.totalCount,
    yearSupport: item.yearSupport,
    dayRecurrenceCount: item.dayRecurrenceCount,
    exactPositionRecurrenceCount: item.exactPositionRecurrenceCount,
    positionCounts: item.positionCounts,
    years: item.years,
  };
}

function coincidenceDayPayload(
  index: number,
  targetRange: IsoWeekRange,
  selectedDate: string,
  draws: Draw[],
  historicalRanges: IsoWeekRange[],
  weeklyHotNumbers: string[],
  dailyRanking: StatV1Candidate[],
) {
  const targetDay = addUtcDays(targetRange.monday, index);
  const dailyNumbers = dailyRanking.map((item) => item.number);
  const reinforced = new Set([...weeklyHotNumbers, ...dailyNumbers]);

  return {
    day: DAYS[index],
    date: formatIsoDate(targetDay),
    dateLabel: formatShortDate(targetDay),
    isSelected: formatIsoDate(targetDay) === selectedDate,
    numbers: coincidencesForWeekday(
      index,
      draws,
      historicalRanges,
      reinforced,
    ),
  };
}

function parseSnapshotDraws(methodParameters: string): Draw[] | null {
  try {
    const parsed = JSON.parse(methodParameters) as Partial<SnapshotParameters>;
    if (!Array.isArray(parsed.historicalDraws)) return null;

    const draws = parsed.historicalDraws.filter(
      (draw): draw is Draw =>
        typeof draw?.drawDate === "string" &&
        typeof draw?.year === "number" &&
        typeof draw?.month === "number" &&
        typeof draw?.firstNumber === "string" &&
        typeof draw?.secondNumber === "string" &&
        typeof draw?.thirdNumber === "string",
    );

    return draws.length === parsed.historicalDraws.length ? draws : null;
  } catch {
    return null;
  }
}

function storedCandidatePayload(row: typeof predictionCandidates.$inferSelect) {
  const positionCounts = parseNumberArray(row.positionCounts, [0, 0, 0]);
  const years = parseNumberArray(row.years, []);

  return {
    number: row.number,
    ranking: row.ranking,
    score: row.score,
    signal: row.explanation,
    totalCount: row.totalCount,
    yearSupport: row.yearSupport,
    dayRecurrenceCount: row.dayRecurrenceCount,
    exactPositionRecurrenceCount: row.exactPositionRecurrenceCount,
    positionCounts: [
      positionCounts[0] ?? 0,
      positionCounts[1] ?? 0,
      positionCounts[2] ?? 0,
    ] as [number, number, number],
    years,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { targetDate?: string };
    const targetDate = parseTargetDate(body.targetDate ?? "");
    const period = analysisPeriod(targetDate);
    const selectedWeekdayIndex = (targetDate.getUTCDay() + 6) % 7;
    const validHistoricalWeeks = period.historicalWeeks.filter(
      (item): item is { isoYear: number; range: IsoWeekRange } => item.range !== null,
    );
    const validHistoricalRanges = validHistoricalWeeks.map((item) => item.range);
    const statContexts: HistoricalWeekContext[] = validHistoricalWeeks.map((item) => ({
      isoYear: item.isoYear,
      monday: item.range.monday,
    }));
    const weekStart = formatIsoDate(period.targetRange.monday);
    const weekEnd = formatIsoDate(period.targetRange.sunday);

    const queryYears = [
      ...period.historicalYears,
      ...validHistoricalRanges.flatMap((range) => [
        range.monday.getUTCFullYear(),
        range.sunday.getUTCFullYear(),
      ]),
    ].filter((year, index, years) => years.indexOf(year) === index);

    const db = getDb();
    const lotteryRows = (await db
      .select({ id: lotteries.id, slug: lotteries.slug, name: lotteries.name })
      .from(lotteries)
      .where(inArray(lotteries.slug, ["nacional", "leidsa", "loteka"]))
      .orderBy(asc(lotteries.id))) as LotteryRow[];

    const lotteryIds = lotteryRows.map((lottery) => lottery.id);
    const existingSnapshots = lotteryIds.length
      ? await db
          .select()
          .from(predictions)
          .where(
            and(
              inArray(predictions.lotteryId, lotteryIds),
              eq(predictions.weekStart, weekStart),
              eq(predictions.weekEnd, weekEnd),
              eq(predictions.methodVersion, STAT_V1_METHOD_VERSION),
            ),
          )
          .orderBy(asc(predictions.lotteryId))
      : [];

    if (existingSnapshots.length > 0 && existingSnapshots.length !== lotteryRows.length) {
      throw new Error(
        "Integridad de congelamiento inválida: existe un snapshot parcial para esta semana. No se recalculó ni sobrescribió ningún dato.",
      );
    }

    const existingByLottery = new Map(
      existingSnapshots.map((snapshot) => [snapshot.lotteryId, snapshot]),
    );

    const analyses: LotteryAnalysis[] = [];
    let latestConfirmedDate = "";
    let totalHistoricalDraws = 0;

    for (const lottery of lotteryRows) {
      const existingSnapshot = existingByLottery.get(lottery.id);
      let equivalentWeekDraws: Draw[];

      if (existingSnapshot) {
        const frozenDraws = parseSnapshotDraws(existingSnapshot.methodParameters);
        if (!frozenDraws || frozenDraws.length !== 21) {
          throw new Error(
            `El snapshot congelado de ${lottery.name} no contiene las 21 observaciones históricas requeridas. No se recalculó.`,
          );
        }
        equivalentWeekDraws = frozenDraws;
        if (existingSnapshot.dataAvailableThrough > latestConfirmedDate) {
          latestConfirmedDate = existingSnapshot.dataAvailableThrough;
        }
      } else {
        const history = await db
          .select({
            drawDate: drawResults.drawDate,
            year: drawResults.year,
            month: drawResults.month,
            firstNumber: drawResults.firstNumber,
            secondNumber: drawResults.secondNumber,
            thirdNumber: drawResults.thirdNumber,
          })
          .from(drawResults)
          .where(
            and(
              eq(drawResults.lotteryId, lottery.id),
              inArray(drawResults.year, queryYears),
            ),
          )
          .orderBy(asc(drawResults.drawDate));

        const allDraws = history as Draw[];
        equivalentWeekDraws = validHistoricalRanges.flatMap((range) =>
          drawsInRange(allDraws, range),
        );
        const latest = equivalentWeekDraws.map((draw) => draw.drawDate).sort().at(-1) ?? "";
        if (latest > latestConfirmedDate) latestConfirmedDate = latest;
      }

      totalHistoricalDraws += equivalentWeekDraws.length;

      const weeklyRanking = buildStatV1Ranking(equivalentWeekDraws, statContexts);
      const dailyRankings = Array.from({ length: 7 }, (_, index) =>
        buildStatV1DailyRanking(equivalentWeekDraws, statContexts, index),
      );
      const weeklyHotNumbers = weeklyRanking.slice(0, 15).map((item) => item.number);
      const dailyHotNumbers = dailyRankings[selectedWeekdayIndex]
        .slice(0, 9)
        .map((item) => item.number);
      const candidates = weeklyRanking.slice(0, 5).map(candidatePayload);

      const weeklyCoincidences = Array.from({ length: 7 }, (_, index) =>
        coincidenceDayPayload(
          index,
          period.targetRange,
          period.selectedDate,
          equivalentWeekDraws,
          validHistoricalRanges,
          weeklyHotNumbers,
          dailyRankings[index],
        ),
      );

      const meta = LOTTERY_META[lottery.slug] ?? {
        shortName: lottery.name.toUpperCase(),
        accent: "#0b6a4f",
      };

      const hasSufficientData =
        period.historicalWeeks.every((item) => item.range !== null) &&
        validHistoricalRanges.length === 3 &&
        validHistoricalRanges.every(
          (range) => drawsInRange(equivalentWeekDraws, range).length === 7,
        );

      analyses.push({
        lottery,
        equivalentWeekDraws,
        weeklyRanking,
        dailyRankings,
        payload: {
          id: lottery.slug,
          name: lottery.name,
          shortName: meta.shortName,
          accent: meta.accent,
          methodVersion: STAT_V1_METHOD_VERSION,
          candidates,
          dailyHotNumbers,
          weeklyHotNumbers,
          weeklyCoincidences,
          pairs: recurrentPairs(equivalentWeekDraws),
          historicalDrawCount: equivalentWeekDraws.length,
          hasSufficientData,
        },
      });
    }

    const isComplete =
      analyses.length === 3 && analyses.every((analysis) => analysis.payload.hasSufficientData);

    let frozenAt: string | null = null;
    let projectionKind: ProjectionKind | null = null;
    let newlyFrozen = false;

    if (existingSnapshots.length === 3) {
      frozenAt = existingSnapshots
        .map((snapshot) => snapshot.generatedAt)
        .sort()[0] ?? null;
      const storedKind = existingSnapshots[0]?.projectionKind;
      projectionKind = storedKind === "prospective" ? "prospective" : "retrospective_demo";

      const snapshotIds = existingSnapshots.map((snapshot) => snapshot.id);
      const storedCandidates = await db
        .select()
        .from(predictionCandidates)
        .where(inArray(predictionCandidates.predictionId, snapshotIds))
        .orderBy(
          asc(predictionCandidates.predictionId),
          asc(predictionCandidates.scope),
          asc(predictionCandidates.targetDate),
          asc(predictionCandidates.ranking),
        );
      const snapshotByLottery = new Map(
        existingSnapshots.map((snapshot) => [snapshot.lotteryId, snapshot]),
      );

      for (const analysis of analyses) {
        const snapshot = snapshotByLottery.get(analysis.lottery.id);
        if (!snapshot) continue;
        const rows = storedCandidates.filter((row) => row.predictionId === snapshot.id);
        const weeklyRows = rows
          .filter((row) => row.scope === "weekly" && row.targetDate === "")
          .sort((a, b) => a.ranking - b.ranking);
        const selectedDailyRows = rows
          .filter(
            (row) => row.scope === "daily" && row.targetDate === period.selectedDate,
          )
          .sort((a, b) => a.ranking - b.ranking);

        if (weeklyRows.length < 5) {
          throw new Error(
            `El snapshot congelado de ${analysis.lottery.name} no contiene el Top 5 semanal requerido. No se recalculó.`,
          );
        }

        analysis.payload.candidates = weeklyRows.slice(0, 5).map(storedCandidatePayload);
        analysis.payload.weeklyHotNumbers = weeklyRows.slice(0, 15).map((row) => row.number);
        analysis.payload.dailyHotNumbers = selectedDailyRows.slice(0, 9).map((row) => row.number);
      }
    } else if (isComplete) {
      projectionKind = projectionKindForWeekStart(weekStart);
      frozenAt = new Date().toISOString();
      newlyFrozen = true;
      const createdPredictionIds: number[] = [];

      try {
        for (const analysis of analyses) {
          const methodParameters: SnapshotParameters = {
            methodVersion: STAT_V1_METHOD_VERSION,
            isoYear: period.targetYear,
            isoWeek: period.isoWeek,
            historicalYears: period.historicalYears,
            historicalWeeks: validHistoricalWeeks.map((item) => ({
              isoYear: item.isoYear,
              start: formatIsoDate(item.range.monday),
              end: formatIsoDate(item.range.sunday),
            })),
            rankingRules: [
              "totalCount desc",
              "yearSupport desc",
              "dayRecurrenceCount desc",
              "exactPositionRecurrenceCount desc",
              "number asc technical tie-break only",
            ],
            weeklyLimit: 15,
            dailyLimit: 9,
            historicalDraws: analysis.equivalentWeekDraws,
          };

          const inserted = await db
            .insert(predictions)
            .values({
              lotteryId: analysis.lottery.id,
              isoYear: period.targetYear,
              isoWeek: period.isoWeek,
              weekStart,
              weekEnd,
              generatedAt: frozenAt,
              dataAvailableThrough: latestConfirmedDate,
              methodVersion: STAT_V1_METHOD_VERSION,
              methodParameters: JSON.stringify(methodParameters),
              projectionKind,
              status: "frozen",
            })
            .returning({ id: predictions.id });

          const predictionId = inserted[0]?.id;
          if (!predictionId) {
            throw new Error(`No fue posible congelar ${analysis.lottery.name}.`);
          }
          createdPredictionIds.push(predictionId);

          const candidateRows = [
            ...analysis.weeklyRanking.slice(0, 15).map((item) => ({
              predictionId,
              scope: "weekly",
              targetDate: "",
              weekday: null,
              number: item.number,
              ranking: item.ranking,
              score: item.score,
              totalCount: item.totalCount,
              yearSupport: item.yearSupport,
              dayRecurrenceCount: item.dayRecurrenceCount,
              exactPositionRecurrenceCount: item.exactPositionRecurrenceCount,
              positionCounts: JSON.stringify(item.positionCounts),
              years: JSON.stringify(item.years),
              explanation: statV1Signal(item),
            })),
            ...analysis.dailyRankings.flatMap((ranking, weekday) => {
              const targetDate = formatIsoDate(addUtcDays(period.targetRange.monday, weekday));
              return ranking.slice(0, 9).map((item) => ({
                predictionId,
                scope: "daily",
                targetDate,
                weekday,
                number: item.number,
                ranking: item.ranking,
                score: item.score,
                totalCount: item.totalCount,
                yearSupport: item.yearSupport,
                dayRecurrenceCount: item.dayRecurrenceCount,
                exactPositionRecurrenceCount: item.exactPositionRecurrenceCount,
                positionCounts: JSON.stringify(item.positionCounts),
                years: JSON.stringify(item.years),
                explanation: statV1Signal(item),
              }));
            }),
          ];

          if (candidateRows.length > 0) {
            await db.insert(predictionCandidates).values(candidateRows);
          }
        }
      } catch (error) {
        for (const predictionId of createdPredictionIds.reverse()) {
          await db
            .delete(predictionCandidates)
            .where(eq(predictionCandidates.predictionId, predictionId));
          await db.delete(predictions).where(eq(predictions.id, predictionId));
        }
        throw error;
      }
    }

    const freezeStatus = isComplete && projectionKind && frozenAt ? "frozen" : "not_frozen";

    return NextResponse.json({
      generatedAt: frozenAt ?? new Date().toISOString(),
      selectedDate: period.selectedDate,
      isoWeek: period.isoWeek,
      methodVersion: STAT_V1_METHOD_VERSION,
      dataThrough: latestConfirmedDate || "Sin resultados históricos confirmados",
      dataStatus: isComplete ? "complete" : "insufficient",
      dataStatusLabel: isComplete
        ? `Semana ISO ${period.isoWeek}: datos históricos reales disponibles`
        : `Semana ISO ${period.isoWeek}: datos históricos insuficientes; no se genera ni congela una proyección`,
      historicalDrawCount: totalHistoricalDraws,
      freeze: {
        status: freezeStatus,
        kind: projectionKind,
        label:
          freezeStatus === "frozen" && projectionKind
            ? projectionKindLabel(projectionKind)
            : "PROYECCIÓN NO CONGELADA",
        frozenAt,
        newlyFrozen,
      },
      weekLabel: `${formatShortDate(period.targetRange.monday)} — ${formatShortDate(period.targetRange.sunday)} ${period.targetRange.sunday.getUTCFullYear()}`,
      weekRange: `${formatShortDate(period.targetRange.monday).toUpperCase()} — ${formatShortDate(period.targetRange.sunday).toUpperCase()}`,
      weekStart,
      weekEnd,
      targetYear: period.targetYear,
      monthLabel: new Intl.DateTimeFormat("es-DO", {
        timeZone: "UTC",
        month: "long",
        year: "numeric",
      }).format(targetDate),
      dayLabel: new Intl.DateTimeFormat("es-DO", {
        timeZone: "UTC",
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(targetDate),
      historicalYears: period.historicalYears,
      historicalWeeks: period.historicalWeeks.map((item) =>
        historicalWeekPayload(item.isoYear, period.isoWeek, item.range),
      ),
      source: existingSnapshots.length === 3
        ? "frozen-prediction-snapshot"
        : "cloudflare-d1-verified-results",
      lotteries: analyses.map((analysis) => analysis.payload),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible calcular o congelar las estadísticas reales.",
      },
      { status: 500 },
    );
  }
}
