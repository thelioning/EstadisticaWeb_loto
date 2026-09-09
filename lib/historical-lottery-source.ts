import { TARGET_LOTTERIES } from "./lottery-source";

export const HISTORICAL_SOURCE_NAME = "loteriadominicana.com.do";
export const HISTORICAL_SOURCE_BASE = "https://www.loteriadominicana.com.do/";

type TargetSlug = (typeof TARGET_LOTTERIES)[number]["slug"];

export type HistoricalNormalizedDraw = {
  externalGameId: string;
  externalResultId: string;
  drawDate: string;
  drawDatetime: null;
  firstNumber: string;
  secondNumber: string;
  thirdNumber: string;
  sourcePayload: string;
};

const RESULT_MARKERS: Record<TargetSlug, string> = {
  nacional: "Loteria Nacional- Noche",
  leidsa: "Quiniela Pale",
  loteka: "Quiniela Loteka",
};

function reverse(value: string) {
  return [...value].reverse().join("");
}

export function historicalSourceUrl(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error("La fecha debe usar el formato YYYY-MM-DD.");
  }

  const [, year, month, day] = match;
  const decimalText = `${reverse(year)}${reverse(month)}${reverse(day)}`;
  const decimalValue = Number.parseInt(decimalText, 10);
  const hexValue = decimalValue.toString(16).toUpperCase();
  const encoded = btoa(hexValue);

  return `${HISTORICAL_SOURCE_BASE}?d=${encodeURIComponent(encoded)}`;
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    nbsp: " ",
    amp: "&",
    quot: '"',
    apos: "'",
    aacute: "á",
    eacute: "é",
    iacute: "í",
    oacute: "ó",
    uacute: "ú",
    ntilde: "ñ",
    Aacute: "Á",
    Eacute: "É",
    Iacute: "Í",
    Oacute: "Ó",
    Uacute: "Ú",
    Ntilde: "Ñ",
  };

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&([A-Za-z]+);/g, (entity, name: string) => named[name] ?? entity);
}

function htmlToSearchText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function flexibleMarker(marker: string) {
  return escapeRegex(marker)
    .replace(/\\ /g, "\\s+")
    .replace(/\\-/g, "\\s*-\\s*");
}

function displayDate(date: string) {
  return `${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(0, 4)}`;
}

function twoDigits(value: string) {
  return value.padStart(2, "0");
}

function extractNumbers(text: string, marker: string, date: string) {
  const dateText = escapeRegex(displayDate(date));
  const pattern = new RegExp(
    `${flexibleMarker(marker)}[\\s\\S]{0,700}?(\\d{1,2})\\s+1ro\\s+(\\d{1,2})\\s+2do\\s+(\\d{1,2})\\s+3ro\\s+${dateText}`,
    "i",
  );
  const match = pattern.exec(text);
  if (!match) return null;

  return [twoDigits(match[1]), twoDigits(match[2]), twoDigits(match[3])] as const;
}

export async function fetchHistoricalDrawsForDate(
  date: string,
): Promise<HistoricalNormalizedDraw[]> {
  const url = historicalSourceUrl(date);
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "NexoLoto/0.1",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `La fuente histórica respondió con HTTP ${response.status} para ${date}.`,
    );
  }

  const html = await response.text();
  const text = htmlToSearchText(html);
  const expectedDate = displayDate(date);

  if (!text.includes(expectedDate)) {
    throw new Error(
      `La fuente histórica no confirmó la fecha ${expectedDate}; no se guardaron datos.`,
    );
  }

  return TARGET_LOTTERIES.flatMap((definition) => {
    const marker = RESULT_MARKERS[definition.slug];
    const numbers = extractNumbers(text, marker, date);
    if (!numbers) return [];

    const [firstNumber, secondNumber, thirdNumber] = numbers;
    return [
      {
        externalGameId: definition.externalGameId,
        externalResultId: `historical:${definition.slug}:${date}`,
        drawDate: date,
        drawDatetime: null,
        firstNumber,
        secondNumber,
        thirdNumber,
        sourcePayload: JSON.stringify({
          source: HISTORICAL_SOURCE_NAME,
          url,
          marker,
          date,
          numbers,
        }),
      },
    ];
  });
}
