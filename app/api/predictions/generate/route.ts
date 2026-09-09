import { and, asc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { drawResults, lotteries } from "../../../../db/schema";
import {
  addUtcDays,
  formatIsoDate,
  isoWeekInfo,
  isoWeekRange,
  rangeContainsDate,
  type IsoWeekRange,
} from "../../../../lib/iso-week";

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

type Draw = {
  drawDate: string;
  year: number;
  month: number;
  firstNumber: string;
  secondNumber: string;
  thirdNumber: string;
};

type NumberStat = {
  number: string;
  count: number;
  score: number;
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

function frequencyRanking(draws: Draw[]): NumberStat[] {
  const counts = new Map<string, number>();
  for (let value = 0; value < 100; value += 1) {
    counts.set(String(value).padStart(2, "0"), 0);
  }

  for (const draw of draws) {
    for (const number of drawNumbers(draw)) {
      counts.set(number, (counts.get(number) ?? 0) + 1);
    }
  }

  const ordered = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const maxCount = ordered[0]?.[1] ?? 0;

  return ordered.map(([number, count]) => ({
    number,
    count,
    score: maxCount > 0 ? Math.round((count / maxCount) * 100) : 0,
  }));
}

function rankedNumbers(draws: Draw[], limit = 15) {
  return frequencyRanking(draws)
    .filter((item) => item.count > 0)
    .slice(0, limit)
    .map((item) => item.number);
}

function drawsInRange(draws: Draw[], range: IsoWeekRange) {
  return draws.filter((draw) => rangeContainsDate(draw.drawDate, range));
}

function drawsForEquivalentWeekday(
  draws: Draw[],
  ranges: IsoWeekRange[],
  weekdayIndex: number,
) {
  const dates = new Set(
    ranges.map((range) => formatIsoDate(addUtcDays(range.monday, weekdayIndex))),
  );
  return draws.filter((draw) => dates.has(draw.drawDate));
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { targetDate?: string };
    const targetDate = parseTargetDate(body.targetDate ?? "");
    const period = analysisPeriod(targetDate);
    const targetMonth = targetDate.getUTCMonth() + 1;
    const selectedWeekdayIndex = (targetDate.getUTCDay() + 6) % 7;
    const validHistoricalRanges = period.historicalWeeks
      .map((item) => item.range)
      .filter((range): range is IsoWeekRange => range !== null);

    const queryYears = [
      ...period.historicalYears,
      ...validHistoricalRanges.flatMap((range) => [
        range.monday.getUTCFullYear(),
        range.sunday.getUTCFullYear(),
      ]),
    ].filter((year, index, years) => years.indexOf(year) === index);

    const db = getDb();
    const lotteryRows = await db
      .select()
      .from(lotteries)
      .where(inArray(lotteries.slug, ["nacional", "leidsa", "loteka"]))
      .orderBy(asc(lotteries.id));

    const responseLotteries = [];
    let latestConfirmedDate = "";
    let totalHistoricalDraws = 0;

    for (const lottery of lotteryRows) {
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
      const equivalentWeekDraws = validHistoricalRanges.flatMap((range) =>
        drawsInRange(allDraws, range),
      );
      const selectedDayDraws = drawsForEquivalentWeekday(
        allDraws,
        validHistoricalRanges,
        selectedWeekdayIndex,
      );
      const monthDraws = allDraws.filter(
        (draw) =>
          period.historicalYears.includes(draw.year) && draw.month === targetMonth,
      );

      totalHistoricalDraws += equivalentWeekDraws.length;

      const weeklyRanking = frequencyRanking(equivalentWeekDraws);
      const weeklyHotNumbers = weeklyRanking
        .filter((item) => item.count > 0)
        .slice(0, 15)
        .map((item) => item.number);
      const dailyHotNumbers = rankedNumbers(selectedDayDraws);
      const monthlyHotNumbers = rankedNumbers(monthDraws);
      const candidates = weeklyRanking
        .filter((item) => item.count > 0)
        .slice(0, 5)
        .map((item) => ({
          number: item.number,
          score: item.score,
          signal: `${item.count} apariciones en semanas ISO equivalentes`,
        }));

      const weeklyCoincidences = Array.from({ length: 7 }, (_, index) => {
        const targetDay = addUtcDays(period.targetRange.monday, index);
        const dayHotNumbers = rankedNumbers(
          drawsForEquivalentWeekday(allDraws, validHistoricalRanges, index),
        );
        const reinforced = new Set([...weeklyHotNumbers, ...dayHotNumbers]);

        return {
          day: DAYS[index],
          date: formatIsoDate(targetDay),
          dateLabel: formatShortDate(targetDay),
          isSelected: formatIsoDate(targetDay) === period.selectedDate,
          numbers: coincidencesForWeekday(
            index,
            allDraws,
            validHistoricalRanges,
            reinforced,
          ),
        };
      });

      const weeklyDates = equivalentWeekDraws.map((draw) => draw.drawDate).sort();
      const latest = weeklyDates.at(-1) ?? "";
      if (latest > latestConfirmedDate) latestConfirmedDate = latest;

      const meta = LOTTERY_META[lottery.slug] ?? {
        shortName: lottery.name.toUpperCase(),
        accent: "#0b6a4f",
      };

      const hasSufficientData =
        period.historicalWeeks.every((item) => item.range !== null) &&
        validHistoricalRanges.every(
          (range) => drawsInRange(allDraws, range).length > 0,
        );

      responseLotteries.push({
        id: lottery.slug,
        name: lottery.name,
        shortName: meta.shortName,
        accent: meta.accent,
        candidates,
        dailyHotNumbers,
        monthlyHotNumbers,
        weeklyHotNumbers,
        weeklyCoincidences,
        pairs: recurrentPairs(equivalentWeekDraws),
        historicalDrawCount: equivalentWeekDraws.length,
        hasSufficientData,
      });
    }

    const isComplete =
      responseLotteries.length === 3 &&
      responseLotteries.every((lottery) => lottery.hasSufficientData);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      selectedDate: period.selectedDate,
      isoWeek: period.isoWeek,
      dataThrough: latestConfirmedDate || "Sin resultados históricos confirmados",
      dataStatus: isComplete ? "complete" : "insufficient",
      dataStatusLabel: isComplete
        ? `Semana ISO ${period.isoWeek}: datos históricos reales disponibles`
        : `Semana ISO ${period.isoWeek}: datos históricos insuficientes; no se generan valores simulados`,
      historicalDrawCount: totalHistoricalDraws,
      weekLabel: `${formatShortDate(period.targetRange.monday)} — ${formatShortDate(period.targetRange.sunday)} ${period.targetRange.sunday.getUTCFullYear()}`,
      weekRange: `${formatShortDate(period.targetRange.monday).toUpperCase()} — ${formatShortDate(period.targetRange.sunday).toUpperCase()}`,
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
      source: "cloudflare-d1-verified-results",
      lotteries: responseLotteries,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible calcular las estadísticas reales.",
      },
      { status: 500 },
    );
  }
}
