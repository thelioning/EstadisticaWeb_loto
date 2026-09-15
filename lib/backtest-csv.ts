import type { BacktestDraw } from "./backtest";

export type ParsedBacktestCsv = {
  draws: BacktestDraw[];
  rejectedRows: number;
  duplicateRows: number;
};

function normalizedHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseDelimitedLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current.trim());
  return values;
}

function indexFor(headers: string[], alternatives: string[]) {
  return headers.findIndex((header) => alternatives.includes(header));
}

function normalizeLottery(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (normalized.includes("nacional")) {
    return { lottery: "nacional", lotteryName: "Quiniela Nacional" };
  }
  if (normalized.includes("leidsa")) {
    return { lottery: "leidsa", lotteryName: "Quiniela Palé Leidsa" };
  }
  if (normalized.includes("loteka")) {
    return { lottery: "loteka", lotteryName: "Quiniela Palé Loteka" };
  }

  const lottery = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return lottery ? { lottery, lotteryName: value.trim() } : null;
}

function normalizeNumber(value: string) {
  if (!/^\d{1,2}$/.test(value.trim())) return null;
  const number = Number.parseInt(value, 10);
  return number >= 0 && number <= 99 ? String(number).padStart(2, "0") : null;
}

export function parseBacktestCsv(text: string): ParsedBacktestCsv {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new Error("El CSV debe contener encabezados y al menos una fila de datos.");
  }

  const delimiter =
    (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const headers = parseDelimitedLine(lines[0], delimiter).map(normalizedHeader);
  const dateIndex = indexFor(headers, ["fecha", "date", "draw_date"]);
  const lotteryIndex = indexFor(headers, ["loteria", "lottery", "lottery_name"]);
  const firstIndex = indexFor(headers, ["p1", "primero", "first", "first_number"]);
  const secondIndex = indexFor(headers, ["p2", "segundo", "second", "second_number"]);
  const thirdIndex = indexFor(headers, ["p3", "tercero", "third", "third_number"]);

  if ([dateIndex, lotteryIndex, firstIndex, secondIndex, thirdIndex].some((index) => index < 0)) {
    throw new Error(
      "Faltan columnas requeridas. Usa: fecha,loteria,p1,p2,p3.",
    );
  }

  const draws: BacktestDraw[] = [];
  const seen = new Set<string>();
  let rejectedRows = 0;
  let duplicateRows = 0;

  for (const line of lines.slice(1)) {
    const cells = parseDelimitedLine(line, delimiter);
    const drawDate = cells[dateIndex]?.trim() ?? "";
    const lottery = normalizeLottery(cells[lotteryIndex] ?? "");
    const firstNumber = normalizeNumber(cells[firstIndex] ?? "");
    const secondNumber = normalizeNumber(cells[secondIndex] ?? "");
    const thirdNumber = normalizeNumber(cells[thirdIndex] ?? "");

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(drawDate) ||
      !lottery ||
      firstNumber === null ||
      secondNumber === null ||
      thirdNumber === null
    ) {
      rejectedRows += 1;
      continue;
    }

    const key = `${lottery.lottery}:${drawDate}`;
    if (seen.has(key)) {
      duplicateRows += 1;
      continue;
    }
    seen.add(key);

    draws.push({
      drawDate,
      lottery: lottery.lottery,
      lotteryName: lottery.lotteryName,
      firstNumber,
      secondNumber,
      thirdNumber,
    });
  }

  if (draws.length === 0) {
    throw new Error("El CSV no contiene filas válidas para analizar.");
  }

  return { draws, rejectedRows, duplicateRows };
}
