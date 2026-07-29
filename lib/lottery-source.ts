export const SOURCE_API =
  "https://api.loteriasdominicanas.com/dominicana/sessions";

export const TARGET_LOTTERIES = [
  {
    slug: "nacional",
    name: "Quiniela Nacional",
    externalGameId: "6966a6d1ea7015c3b8a3d482",
  },
  {
    slug: "leidsa",
    name: "Quiniela Palé Leidsa",
    externalGameId: "6966a6d1ea7015c3b8a3d453",
  },
  {
    slug: "loteka",
    name: "Quiniela Palé Loteka",
    externalGameId: "6966a6d2ea7015c3b8a3d4d7",
  },
] as const;

type SourceSession = {
  _id: string;
  game_id: string;
  date: string;
  score: string[][];
  createdAt?: string;
  updatedAt?: string;
};

type SourceGame = {
  game_id: string;
  sessions?: SourceSession[];
};

export type NormalizedDraw = {
  externalGameId: string;
  externalResultId: string;
  drawDate: string;
  drawDatetime: string;
  firstNumber: string;
  secondNumber: string;
  thirdNumber: string;
  sourcePayload: string;
};

function twoDigits(value: unknown): string {
  return String(value ?? "").trim().padStart(2, "0").slice(-2);
}

export function normalizeSourceGames(
  games: SourceGame[],
  requestedDate: string,
): NormalizedDraw[] {
  const allowedIds = new Set(TARGET_LOTTERIES.map((item) => item.externalGameId));

  return games.flatMap((game) => {
    if (!allowedIds.has(game.game_id as (typeof TARGET_LOTTERIES)[number]["externalGameId"])) {
      return [];
    }

    const session = game.sessions?.find((item) =>
      item.date.startsWith(requestedDate),
    );
    const row = session?.score?.[0];
    if (!session || !row || row.length < 3) return [];

    return [
      {
        externalGameId: game.game_id,
        externalResultId: session._id,
        drawDate: requestedDate,
        drawDatetime: session.date,
        firstNumber: twoDigits(row[0]),
        secondNumber: twoDigits(row[1]),
        thirdNumber: twoDigits(row[2]),
        sourcePayload: JSON.stringify(session),
      },
    ];
  });
}

export async function fetchDrawsForDate(date: string): Promise<NormalizedDraw[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("La fecha debe usar el formato YYYY-MM-DD.");
  }

  const isoDate = `${date}T04:00:00.000Z`;
  const url = new URL(SOURCE_API);
  url.searchParams.set("date", isoDate);
  url.searchParams.set("limit", "3");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "NexoLoto/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`La fuente respondió con HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as SourceGame[];
  return normalizeSourceGames(payload, date);
}

export function calendarParts(date: string) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;
  const weekday = parsed.getUTCDay();

  const thursday = new Date(parsed);
  const normalizedDay = (thursday.getUTCDay() + 6) % 7;
  thursday.setUTCDate(thursday.getUTCDate() - normalizedDay + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstNormalizedDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstNormalizedDay + 3);
  const calendarWeek =
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604800000);

  return { year, month, weekday, calendarWeek };
}
