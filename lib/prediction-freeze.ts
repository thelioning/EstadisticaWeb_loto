const TIME_ZONE = "America/Santo_Domingo";

export type ProjectionKind = "prospective" | "retrospective_demo";

export function currentDominicanDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

/**
 * Conservative scientific classification:
 * a projection is prospective only if it was frozen on a calendar date
 * strictly before the Monday that starts the target ISO week.
 * Anything created on Monday or later is explicitly retrospective/demo.
 */
export function projectionKindForWeekStart(weekStart: string): ProjectionKind {
  return currentDominicanDate() < weekStart
    ? "prospective"
    : "retrospective_demo";
}

export function projectionKindLabel(kind: ProjectionKind) {
  return kind === "prospective"
    ? "PROYECCIÓN PROSPECTIVA CONGELADA"
    : "DEMOSTRACIÓN RETROSPECTIVA CONGELADA";
}

export function parseNumberArray(value: string, fallback: number[] = []) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "number")
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}
