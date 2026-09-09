import { NextRequest, NextResponse } from "next/server";

const SOURCE_BASE = "https://www.loteriadominicana.com.do/";

function reverse(value: string) {
  return [...value].reverse().join("");
}

function encodeHistoricalDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error("La fecha debe usar el formato YYYY-MM-DD.");
  }

  const [, year, month, day] = match;
  const decimalText = `${reverse(year)}${reverse(month)}${reverse(day)}`;
  const decimalValue = Number.parseInt(decimalText, 10);
  const hexValue = decimalValue.toString(16).toUpperCase();
  const encoded = btoa(hexValue);

  return {
    decimalText,
    hexValue,
    encoded,
    url: `${SOURCE_BASE}?d=${encodeURIComponent(encoded)}`,
  };
}

function stripTags(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function excerptAround(html: string, marker: string) {
  const index = html.toLowerCase().indexOf(marker.toLowerCase());
  if (index === -1) {
    return {
      found: false,
      marker,
      excerpt: null,
    };
  }

  const start = Math.max(0, index - 400);
  const end = Math.min(html.length, index + 1800);

  return {
    found: true,
    marker,
    excerpt: stripTags(html.slice(start, end)).slice(0, 1200),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { date?: string };
    const date = body.date ?? "";
    const encoded = encodeHistoricalDate(date);

    const response = await fetch(encoded.url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "NexoLoto/0.1",
      },
      redirect: "follow",
    });

    const html = await response.text();

    return NextResponse.json({
      date,
      requestedUrl: encoded.url,
      finalUrl: response.url,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
      htmlLength: html.length,
      encoding: {
        decimalText: encoded.decimalText,
        hexValue: encoded.hexValue,
        encoded: encoded.encoded,
      },
      expectedDateText: `${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(0, 4)}`,
      containsExpectedDate: html.includes(
        `${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(0, 4)}`,
      ),
      targets: {
        nacional: excerptAround(html, "Loteria Nacional- Noche"),
        leidsa: excerptAround(html, "Quiniela Palé"),
        loteka: excerptAround(html, "Quiniela Loteka"),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible inspeccionar la fuente histórica.",
      },
      { status: 500 },
    );
  }
}
