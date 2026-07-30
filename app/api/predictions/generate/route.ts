import { NextRequest, NextResponse } from "next/server";

const TIME_ZONE = "America/Santo_Domingo";
const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const LOTTERIES = [
  {
    id: "nacional",
    name: "Quiniela Nacional",
    shortName: "LOTERÍA NACIONAL",
    accent: "#1a5e9a",
    seed: 17,
  },
  {
    id: "leidsa",
    name: "Quiniela Palé Leidsa",
    shortName: "LEIDSA",
    accent: "#0b6a4f",
    seed: 41,
  },
  {
    id: "loteka",
    name: "Quiniela Palé Loteka",
    shortName: "LOTEKA",
    accent: "#9a4e20",
    seed: 73,
  },
];

function seededNumbers(seed: number, count: number) {
  const values: string[] = [];
  let state = seed;
  while (values.length < count) {
    state = (state * 73 + 41) % 1009;
    const value = String(state % 100).padStart(2, "0");
    if (!values.includes(value)) values.push(value);
  }
  return values;
}

function getDominicanDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: value("weekday"),
  };
}

function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatShortDate(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTHS[date.getUTCMonth()]}`;
}

function formatIsoDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getAnalysisPeriod(targetDate: Date) {
  const local = getDominicanDateParts(targetDate);
  const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const weekdayIndex = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  }[local.weekday] ?? 0;

  const monday = addUtcDays(localDate, -weekdayIndex);
  const sunday = addUtcDays(monday, 6);
  const targetYear = sunday.getUTCFullYear();
  const historicalYears = [targetYear - 3, targetYear - 2, targetYear - 1];

  return {
    local,
    historicalYears,
    weekLabel: `${formatShortDate(monday)} — ${formatShortDate(sunday)} ${sunday.getUTCFullYear()}`,
    weekRange: `${formatShortDate(monday).toUpperCase()} — ${formatShortDate(sunday).toUpperCase()}`,
    targetYear,
    monday,
    selectedDate: formatIsoDate(localDate),
    monthLabel: new Intl.DateTimeFormat("es-DO", {
      timeZone: TIME_ZONE,
      month: "long",
      year: "numeric",
    }).format(targetDate),
    dayLabel: new Intl.DateTimeFormat("es-DO", {
      timeZone: TIME_ZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(targetDate),
  };
}

export async function POST(request: NextRequest) {
  const now = new Date();
  const body = (await request.json().catch(() => ({}))) as { targetDate?: string };
  const requestedDate = body.targetDate ?? "";
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? new Date(`${requestedDate}T12:00:00.000Z`)
    : now;
  const period = getAnalysisPeriod(targetDate);
  const dateSeed =
    period.local.year * 10000 + period.local.month * 100 + period.local.day;

  const lotteries = LOTTERIES.map((lottery) => {
    const numbers = seededNumbers(dateSeed + lottery.seed, 35);
    const dailyHotNumbers = numbers.slice(5, 20);
    const monthlyHotNumbers = numbers.slice(20, 35);
    const weeklyCoincidences = Array.from({ length: 7 }, (_, index) => {
      const date = addUtcDays(period.monday, index);
      const daySeed =
        date.getUTCFullYear() * 10000 +
        (date.getUTCMonth() + 1) * 100 +
        date.getUTCDate();
      const coincidenceNumbers = seededNumbers(daySeed + lottery.seed * 3, 3);

      return {
        day: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][index],
        date: formatIsoDate(date),
        dateLabel: formatShortDate(date),
        isSelected: formatIsoDate(date) === period.selectedDate,
        numbers: coincidenceNumbers.map((number, numberIndex) => {
          const occurrences = numberIndex === 0 && (daySeed + lottery.seed) % 3 === 0 ? 3 : 2;
          return {
            number,
            occurrences,
            years: period.historicalYears.slice(0, occurrences),
            reinforced:
              dailyHotNumbers.includes(number) || monthlyHotNumbers.includes(number),
          };
        }),
      };
    });

    return {
      id: lottery.id,
      name: lottery.name,
      shortName: lottery.shortName,
      accent: lottery.accent,
      candidates: numbers.slice(0, 5).map((number, index) => ({
        number,
        score: 91 - index * 5 - (lottery.seed % 4),
        signal: ["Mes + semana", "Coincidencia alta", "Fuerza mensual", "Señal por posición", "Recurrencia semanal"][index],
      })),
      dailyHotNumbers,
      monthlyHotNumbers,
      weeklyCoincidences,
      pairs: [`${numbers[0]}–${numbers[1]}`, `${numbers[1]}–${numbers[2]}`, `${numbers[0]}–${numbers[3]}`],
    };
  });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    dataThrough: new Intl.DateTimeFormat("es-DO", {
      timeZone: TIME_ZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(now),
    selectedDate: period.selectedDate,
    weekLabel: period.weekLabel,
    weekRange: period.weekRange,
    targetYear: period.targetYear,
    monthLabel: period.monthLabel,
    dayLabel: period.dayLabel,
    historicalYears: period.historicalYears,
    source: "prototype-v1",
    lotteries,
  });
}
