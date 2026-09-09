import { NextRequest, NextResponse } from "next/server";
import { SOURCE_API, TARGET_LOTTERIES } from "../../../../lib/lottery-source";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function summarizeItem(value: unknown) {
  const item = asRecord(value);
  if (!item) return { type: typeof value };

  const sessions = Array.isArray(item.sessions) ? item.sessions : [];
  const sessionDates = sessions
    .map((session) => asRecord(session)?.date)
    .filter((date): date is string => typeof date === "string")
    .slice(0, 5);

  return {
    keys: Object.keys(item),
    game_id: typeof item.game_id === "string" ? item.game_id : null,
    gameId: typeof item.gameId === "string" ? item.gameId : null,
    id: typeof item._id === "string" ? item._id : null,
    sessionsCount: sessions.length,
    sessionDates,
  };
}

function summarizePayload(payload: unknown) {
  if (Array.isArray(payload)) {
    return {
      topLevelType: "array",
      itemCount: payload.length,
      sampleItems: payload.slice(0, 10).map(summarizeItem),
    };
  }

  const record = asRecord(payload);
  if (!record) {
    return {
      topLevelType: typeof payload,
      valuePreview: String(payload).slice(0, 200),
    };
  }

  const arrays = Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [
        key,
        {
          itemCount: (value as unknown[]).length,
          sampleItems: (value as unknown[]).slice(0, 5).map(summarizeItem),
        },
      ]),
  );

  return {
    topLevelType: "object",
    keys: Object.keys(record),
    arrays,
  };
}

async function probe(date: string, limit: number) {
  const isoDate = `${date}T04:00:00.000Z`;
  const url = new URL(SOURCE_API);
  url.searchParams.set("date", isoDate);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "NexoLoto/0.1",
    },
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
    url: url.toString(),
    bodyLength: text.length,
    textPreview: payload === null ? text.slice(0, 300) : null,
    payload: payload === null ? null : summarizePayload(payload),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { date?: string };
    const date = body.date ?? "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Debes enviar date con formato YYYY-MM-DD." },
        { status: 400 },
      );
    }

    const [limit3, limit100] = await Promise.all([
      probe(date, 3),
      probe(date, 100),
    ]);

    return NextResponse.json({
      date,
      expectedGameIds: TARGET_LOTTERIES.map((item) => ({
        slug: item.slug,
        name: item.name,
        externalGameId: item.externalGameId,
      })),
      limit3,
      limit100,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No fue posible inspeccionar la fuente.",
      },
      { status: 500 },
    );
  }
}
