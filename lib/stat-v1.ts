import { addUtcDays, formatIsoDate } from "./iso-week";

export const STAT_V1_METHOD_VERSION = "STAT-V1.0";

export type StatDraw = {
  drawDate: string;
  firstNumber: string;
  secondNumber: string;
  thirdNumber: string;
};

export type HistoricalWeekContext = {
  isoYear: number;
  monday: Date;
};

export type StatV1Candidate = {
  number: string;
  ranking: number;
  score: number;
  totalCount: number;
  yearSupport: number;
  dayRecurrenceCount: number;
  exactPositionRecurrenceCount: number;
  positionCounts: [number, number, number];
  years: number[];
};

type DateContext = {
  isoYear: number;
  weekdayIndex: number;
};

type MutableStat = {
  number: string;
  totalCount: number;
  years: Set<number>;
  positionCounts: [number, number, number];
  dayYears: Array<Set<number>>;
  exactPositionYears: Array<Array<Set<number>>>;
};

function drawNumbers(draw: StatDraw): [string, string, string] {
  return [draw.firstNumber, draw.secondNumber, draw.thirdNumber];
}

function makeDateContext(weeks: HistoricalWeekContext[]) {
  const contexts = new Map<string, DateContext>();

  for (const week of weeks) {
    for (let weekdayIndex = 0; weekdayIndex < 7; weekdayIndex += 1) {
      contexts.set(formatIsoDate(addUtcDays(week.monday, weekdayIndex)), {
        isoYear: week.isoYear,
        weekdayIndex,
      });
    }
  }

  return contexts;
}

function emptyStat(number: string): MutableStat {
  return {
    number,
    totalCount: 0,
    years: new Set<number>(),
    positionCounts: [0, 0, 0],
    dayYears: Array.from({ length: 7 }, () => new Set<number>()),
    exactPositionYears: Array.from({ length: 7 }, () =>
      Array.from({ length: 3 }, () => new Set<number>()),
    ),
  };
}

function collectStats(draws: StatDraw[], weeks: HistoricalWeekContext[]) {
  const dateContext = makeDateContext(weeks);
  const stats = new Map<string, MutableStat>();

  for (let value = 0; value < 100; value += 1) {
    const number = String(value).padStart(2, "0");
    stats.set(number, emptyStat(number));
  }

  for (const draw of draws) {
    const context = dateContext.get(draw.drawDate);
    if (!context) continue;

    drawNumbers(draw).forEach((number, positionIndex) => {
      const stat = stats.get(number);
      if (!stat) return;

      stat.totalCount += 1;
      stat.years.add(context.isoYear);
      stat.positionCounts[positionIndex] += 1;
      stat.dayYears[context.weekdayIndex].add(context.isoYear);
      stat.exactPositionYears[context.weekdayIndex][positionIndex].add(
        context.isoYear,
      );
    });
  }

  return [...stats.values()];
}

function finalize(stat: MutableStat) {
  const dayRecurrenceCount = stat.dayYears.filter(
    (years) => years.size >= 2,
  ).length;
  const exactPositionRecurrenceCount = stat.exactPositionYears
    .flat()
    .filter((years) => years.size >= 2).length;

  return {
    number: stat.number,
    totalCount: stat.totalCount,
    yearSupport: stat.years.size,
    dayRecurrenceCount,
    exactPositionRecurrenceCount,
    positionCounts: stat.positionCounts,
    years: [...stat.years].sort((a, b) => a - b),
  };
}

/**
 * STAT-V1.0 intentionally uses no fitted weights.
 *
 * Ranking order, all descending except the final technical tie-break:
 * 1) total appearances in the three equivalent ISO weeks;
 * 2) number of historical years containing the number;
 * 3) number of equivalent weekdays where it appears in >= 2 historical years;
 * 4) number of weekday-position cells repeated in >= 2 historical years;
 * 5) numeric value ascending only to make an otherwise exact tie deterministic.
 *
 * score is only a relative frequency index: totalCount / maxTotalCount * 100.
 * It is not a probability.
 */
export function buildStatV1Ranking(
  draws: StatDraw[],
  weeks: HistoricalWeekContext[],
): StatV1Candidate[] {
  const observed = collectStats(draws, weeks)
    .map(finalize)
    .filter((item) => item.totalCount > 0)
    .sort(
      (a, b) =>
        b.totalCount - a.totalCount ||
        b.yearSupport - a.yearSupport ||
        b.dayRecurrenceCount - a.dayRecurrenceCount ||
        b.exactPositionRecurrenceCount - a.exactPositionRecurrenceCount ||
        a.number.localeCompare(b.number),
    );

  const maxTotalCount = observed[0]?.totalCount ?? 0;

  return observed.map((item, index) => ({
    ...item,
    ranking: index + 1,
    score:
      maxTotalCount > 0
        ? Math.round((item.totalCount / maxTotalCount) * 100)
        : 0,
  }));
}

export function buildStatV1DailyRanking(
  draws: StatDraw[],
  weeks: HistoricalWeekContext[],
  weekdayIndex: number,
): StatV1Candidate[] {
  const allowedDates = new Set(
    weeks.map((week) => formatIsoDate(addUtcDays(week.monday, weekdayIndex))),
  );

  return buildStatV1Ranking(
    draws.filter((draw) => allowedDates.has(draw.drawDate)),
    weeks,
  );
}

export function statV1Signal(candidate: StatV1Candidate) {
  const parts = [
    `${candidate.totalCount} apariciones`,
    `${candidate.yearSupport}/3 años`,
  ];

  if (candidate.dayRecurrenceCount > 0) {
    parts.push(
      `${candidate.dayRecurrenceCount} día${candidate.dayRecurrenceCount === 1 ? "" : "s"} recurrente${candidate.dayRecurrenceCount === 1 ? "" : "s"}`,
    );
  }

  if (candidate.exactPositionRecurrenceCount > 0) {
    parts.push(
      `${candidate.exactPositionRecurrenceCount} recurrencia${candidate.exactPositionRecurrenceCount === 1 ? "" : "s"} de posición`,
    );
  }

  return parts.join(" · ");
}
