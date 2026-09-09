const DAY_MS = 86_400_000;

export type IsoWeekInfo = {
  isoYear: number;
  isoWeek: number;
};

export type IsoWeekRange = IsoWeekInfo & {
  monday: Date;
  sunday: Date;
};

export function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function formatIsoDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function isoWeekInfo(date: Date): IsoWeekInfo {
  const normalized = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      12,
    ),
  );

  const isoWeekday = normalized.getUTCDay() || 7;
  normalized.setUTCDate(normalized.getUTCDate() + 4 - isoWeekday);

  const isoYear = normalized.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1, 12));
  const daysSinceYearStart = Math.floor(
    (normalized.getTime() - yearStart.getTime()) / DAY_MS,
  );
  const isoWeek = Math.ceil((daysSinceYearStart + 1) / 7);

  return { isoYear, isoWeek };
}

export function isoWeekRange(
  isoYear: number,
  isoWeek: number,
): IsoWeekRange | null {
  if (!Number.isInteger(isoYear) || !Number.isInteger(isoWeek) || isoWeek < 1 || isoWeek > 53) {
    return null;
  }

  const januaryFourth = new Date(Date.UTC(isoYear, 0, 4, 12));
  const mondayOffset = (januaryFourth.getUTCDay() + 6) % 7;
  const firstMonday = addUtcDays(januaryFourth, -mondayOffset);
  const monday = addUtcDays(firstMonday, (isoWeek - 1) * 7);
  const verified = isoWeekInfo(monday);

  if (verified.isoYear !== isoYear || verified.isoWeek !== isoWeek) {
    return null;
  }

  return {
    isoYear,
    isoWeek,
    monday,
    sunday: addUtcDays(monday, 6),
  };
}

export function rangeContainsDate(
  drawDate: string,
  range: IsoWeekRange,
) {
  const start = formatIsoDate(range.monday);
  const end = formatIsoDate(range.sunday);
  return drawDate >= start && drawDate <= end;
}
