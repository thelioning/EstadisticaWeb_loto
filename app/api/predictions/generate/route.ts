import { and, asc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { drawResults, lotteries } from "../../../../db/schema";

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

function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatIsoDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

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
  const weekdayIndex = (targetDate.getUTCDay() + 6) % 7;
  const monday = addUtcDays(targetDate, -weekdayIndex);
  const sunday = addUtcDays(monday, 6);
  const targetYear = targetDate.getUTCFullYear();
  return {
    monday,
    sunday,
    targetYear,
    selectedDate: formatIsoDate(targetDate),
    historicalYears: [targetYear - 3, targetYear - 2, targetYear - 1],
  };
}

function drawNumbers(draw: Draw) {
  return [draw.firstNumber, draw.secondNumber, draw.thirdNumber];
}

function rankedNumbers(draws: Draw[], limit = 15) {
  const counts = new Map<string, number>();
  for (const draw of draws) {
    for (const number of drawNumbers(draw)) {
      counts.set(number, (counts.get(number) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([number]) => number);
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

function coincidencesForDate(
  date: Date,
  draws: Draw[],
  historicalYears: number[],
  dailyHotNumbers: string[],
  monthlyHotNumbers: string[],
) {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const yearsByNumber = new Map<string, Set<number>>();

  for (const draw of draws) {
    const drawDay = Number(draw.drawDate.slice(8, 10));
    if (draw.month !== month || drawDay !== day) continue;
    for (const number of new Set(drawNumbers(draw))) {
      const years = yearsByNumber.get(number) ?? new Set<number>();
      years.add(draw.year);
      yearsByNumber.set(number, years);
    }
  }

  return [...yearsByNumber.entries()]
    .map(([number, years]) => ({
      number,
      years: [...years].sort(),
      occurrences: years.size,
      reinforced:
        dailyHotNumbers.includes(number) || monthlyHotNumbers.includes(number),
    }))
    .filter((item) => item.occurrences >= 2)
    .sort((a, b) => b.occurrences - a.occurrences || a.number.localeCompare(b.number))
    .slice(0, 8)
    .map((item) => ({
      ...item,
      years: item.years.filter((year) => historicalYears.includes(year)),
    }));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { targetDate?: string };
    const targetDate = parseTargetDate(body.targetDate ?? "");
    const period = analysisPeriod(targetDate);
    const targetMonth = targetDate.getUTCMonth() + 1;
    const targetDay = targetDate.getUTCDate();
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
            inArray(drawResults.year, period.historicalYears),
          ),
        )
        .orderBy(asc(drawResults.drawDate));

      const allDraws = history as Draw[];
      totalHistoricalDraws += allDraws.length;
      const monthDraws = allDraws.filter((draw) => draw.month === targetMonth);
      const dayDraws = monthDraws.filter(
        (draw) => Number(draw.drawDate.slice(8, 10)) === targetDay,
      );
      const monthlyHotNumbers = rankedNumbers(monthDraws);
      const dailyHotNumbers = rankedNumbers(dayDraws);
      const candidates = rankedNumbers([...dayDraws, ...monthDraws], 5).map(
        (number, index) => ({
          number,
          score: Math.max(50, 90 - index * 8),
          signal: index === 0 ? "Mayor frecuencia real" : "Frecuencia histórica",
        }),
      );

      const weeklyCoincidences = Array.from({ length: 7 }, (_, index) => {
        const date = addUtcDays(period.monday, index);
        return {
          day: DAYS[index],
          date: formatIsoDate(date),
          dateLabel: formatShortDate(date),
          isSelected: formatIsoDate(date) === period.selectedDate,
          numbers: coincidencesForDate(
            date,
            allDraws,
            period.historicalYears,
            dailyHotNumbers,
            monthlyHotNumbers,
          ),
        };
      });

      const latest = allDraws.at(-1)?.drawDate ?? "";
      if (latest > latestConfirmedDate) latestConfirmedDate = latest;
      const meta = LOTTERY_META[lottery.slug] ?? {
        shortName: lottery.name.toUpperCase(),
        accent: "#0b6a4f",
      };

      responseLotteries.push({
        id: lottery.slug,
        name: lottery.name,
        shortName: meta.shortName,
        accent: meta.accent,
        candidates,
        dailyHotNumbers,
        monthlyHotNumbers,
        weeklyCoincidences,
        pairs: recurrentPairs(monthDraws),
        historicalDrawCount: allDraws.length,
        hasSufficientData:
          new Set(allDraws.map((draw) => draw.year)).size === period.historicalYears.length,
      });
    }

    const isComplete =
      responseLotteries.length === 3 &&
      responseLotteries.every((lottery) => lottery.hasSufficientData);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      selectedDate: period.selectedDate,
      dataThrough: latestConfirmedDate || "Sin resultados históricos confirmados",
      dataStatus: isComplete ? "complete" : "insufficient",
      dataStatusLabel: isComplete
        ? "Datos históricos reales disponibles"
        : "Datos históricos insuficientes; no se generan valores simulados",
      historicalDrawCount: totalHistoricalDraws,
      weekLabel: `${formatShortDate(period.monday)} — ${formatShortDate(period.sunday)} ${period.sunday.getUTCFullYear()}`,
      weekRange: `${formatShortDate(period.monday).toUpperCase()} — ${formatShortDate(period.sunday).toUpperCase()}`,
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
