import { and, asc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import {
  drawResults,
  lotteries,
  predictionCandidates,
  predictions,
} from "../../../../db/schema";
import {
  addUtcDays,
  formatIsoDate,
  isoWeekInfo,
  isoWeekRange,
  rangeContainsDate,
  type IsoWeekRange,
} from "../../../../lib/iso-week";
import {
  projectionKindForWeekStart,
  projectionKindLabel,
} from "../../../../lib/prediction-freeze";
import {
  buildStatV1DailyRanking,
  buildStatV1Ranking,
  STAT_V1_METHOD_VERSION,
  statV1Signal,
  type HistoricalWeekContext,
  type StatDraw,
} from "../../../../lib/stat-v1";

type Draw = StatDraw & {
  year: number;
  month: number;
};

type LotteryRow = {
  id: number;
  slug: string;
  name: string;
};

type SnapshotParameters = {
  methodVersion: string;
  isoYear: number;
  isoWeek: number;
  historicalYears: number[];
  historicalWeeks: Array<{ isoYear: number; start: string; end: string }>;
  rankingRules: string[];
  weeklyLimit: number;
  dailyLimit: number;
  historicalDraws: Draw[];
};

const CANDIDATE_BATCH_SIZE = 4;

function parseTargetDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("targetDate debe usar el formato YYYY-MM-DD.");
  }

  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("targetDate no contiene una fecha válida.");
  }

  return date;
}

function drawsInRange(draws: Draw[], range: IsoWeekRange) {
  return draws.filter((draw) => rangeContainsDate(draw.drawDate, range));
}

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

export async function POST(request: NextRequest) {
  const createdPredictionIds: number[] = [];

  try {
    const body = (await request.json().catch(() => ({}))) as {
      targetDate?: string;
    };
    const targetDate = parseTargetDate(body.targetDate ?? "");
    const targetInfo = isoWeekInfo(targetDate);
    const targetRange = isoWeekRange(targetInfo.isoYear, targetInfo.isoWeek);

    if (!targetRange) {
      throw new Error("No fue posible determinar la semana ISO objetivo.");
    }

    const historicalYears = [
      targetInfo.isoYear - 3,
      targetInfo.isoYear - 2,
      targetInfo.isoYear - 1,
    ];

    const historicalWeeks = historicalYears.map((isoYear) => ({
      isoYear,
      range: isoWeekRange(isoYear, targetInfo.isoWeek),
    }));

    if (historicalWeeks.some((item) => item.range === null)) {
      throw new Error(
        "Una de las tres semanas ISO históricas equivalentes no existe; no se congeló ninguna proyección.",
      );
    }

    const validHistoricalWeeks = historicalWeeks as Array<{
      isoYear: number;
      range: IsoWeekRange;
    }>;
    const statContexts: HistoricalWeekContext[] = validHistoricalWeeks.map(
      (item) => ({
        isoYear: item.isoYear,
        monday: item.range.monday,
      }),
    );

    const weekStart = formatIsoDate(targetRange.monday);
    const weekEnd = formatIsoDate(targetRange.sunday);
    const queryYears = [
      ...historicalYears,
      ...validHistoricalWeeks.flatMap((item) => [
        item.range.monday.getUTCFullYear(),
        item.range.sunday.getUTCFullYear(),
      ]),
    ].filter((year, index, years) => years.indexOf(year) === index);

    const db = getDb();
    const lotteryRows = (await db
      .select({ id: lotteries.id, slug: lotteries.slug, name: lotteries.name })
      .from(lotteries)
      .where(inArray(lotteries.slug, ["nacional", "leidsa", "loteka"]))
      .orderBy(asc(lotteries.id))) as LotteryRow[];

    if (lotteryRows.length !== 3) {
      throw new Error(
        `Se esperaban 3 loterías configuradas y se encontraron ${lotteryRows.length}.`,
      );
    }

    const existingSnapshots = await db
      .select()
      .from(predictions)
      .where(
        and(
          inArray(
            predictions.lotteryId,
            lotteryRows.map((lottery) => lottery.id),
          ),
          eq(predictions.weekStart, weekStart),
          eq(predictions.weekEnd, weekEnd),
          eq(predictions.methodVersion, STAT_V1_METHOD_VERSION),
        ),
      )
      .orderBy(asc(predictions.lotteryId));

    if (existingSnapshots.length === 3) {
      const storedKind = existingSnapshots[0]?.projectionKind;
      const kind =
        storedKind === "prospective" ? "prospective" : "retrospective_demo";

      return NextResponse.json({
        status: "already_frozen",
        kind,
        label: projectionKindLabel(kind),
        newlyFrozen: false,
        frozenAt:
          existingSnapshots.map((item) => item.generatedAt).sort()[0] ?? null,
        predictionIds: existingSnapshots.map((item) => item.id),
      });
    }

    if (existingSnapshots.length !== 0) {
      throw new Error(
        "Existe un congelamiento parcial previo. No se modificó nada; primero debe revisarse la integridad de esos registros.",
      );
    }

    const analyses: Array<{
      lottery: LotteryRow;
      draws: Draw[];
      weeklyRanking: ReturnType<typeof buildStatV1Ranking>;
      dailyRankings: ReturnType<typeof buildStatV1DailyRanking>[];
    }> = [];

    let latestConfirmedDate = "";

    for (const lottery of lotteryRows) {
      const history = (await db
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
        .orderBy(asc(drawResults.drawDate))) as Draw[];

      const equivalentDraws = validHistoricalWeeks.flatMap((item) =>
        drawsInRange(history, item.range),
      );

      for (const item of validHistoricalWeeks) {
        const count = drawsInRange(history, item.range).length;
        if (count !== 7) {
          throw new Error(
            `${lottery.name}: la semana ISO ${targetInfo.isoWeek} de ${item.isoYear} contiene ${count} sorteos; se requieren exactamente 7.`,
          );
        }
      }

      if (equivalentDraws.length !== 21) {
        throw new Error(
          `${lottery.name}: se esperaban 21 sorteos históricos y se encontraron ${equivalentDraws.length}.`,
        );
      }

      const latest = equivalentDraws.map((draw) => draw.drawDate).sort().at(-1) ?? "";
      if (latest > latestConfirmedDate) latestConfirmedDate = latest;

      analyses.push({
        lottery,
        draws: equivalentDraws,
        weeklyRanking: buildStatV1Ranking(equivalentDraws, statContexts),
        dailyRankings: Array.from({ length: 7 }, (_, weekday) =>
          buildStatV1DailyRanking(equivalentDraws, statContexts, weekday),
        ),
      });
    }

    const projectionKind = projectionKindForWeekStart(weekStart);
    const frozenAt = new Date().toISOString();
    const frozen: Array<{
      lottery: string;
      predictionId: number;
      candidateRows: number;
    }> = [];

    for (const analysis of analyses) {
      const methodParameters: SnapshotParameters = {
        methodVersion: STAT_V1_METHOD_VERSION,
        isoYear: targetInfo.isoYear,
        isoWeek: targetInfo.isoWeek,
        historicalYears,
        historicalWeeks: validHistoricalWeeks.map((item) => ({
          isoYear: item.isoYear,
          start: formatIsoDate(item.range.monday),
          end: formatIsoDate(item.range.sunday),
        })),
        rankingRules: [
          "totalCount desc",
          "yearSupport desc",
          "dayRecurrenceCount desc",
          "exactPositionRecurrenceCount desc",
          "number asc technical tie-break only",
        ],
        weeklyLimit: 15,
        dailyLimit: 9,
        historicalDraws: analysis.draws,
      };

      const inserted = await db
        .insert(predictions)
        .values({
          lotteryId: analysis.lottery.id,
          isoYear: targetInfo.isoYear,
          isoWeek: targetInfo.isoWeek,
          weekStart,
          weekEnd,
          generatedAt: frozenAt,
          dataAvailableThrough: latestConfirmedDate,
          methodVersion: STAT_V1_METHOD_VERSION,
          methodParameters: JSON.stringify(methodParameters),
          projectionKind,
          status: "frozen",
        })
        .returning({ id: predictions.id });

      const predictionId = inserted[0]?.id;
      if (!predictionId) {
        throw new Error(`No fue posible crear el snapshot de ${analysis.lottery.name}.`);
      }
      createdPredictionIds.push(predictionId);

      const candidateRows = [
        ...analysis.weeklyRanking.slice(0, 15).map((item) => ({
          predictionId,
          scope: "weekly",
          targetDate: "",
          weekday: null,
          number: item.number,
          ranking: item.ranking,
          score: item.score,
          totalCount: item.totalCount,
          yearSupport: item.yearSupport,
          dayRecurrenceCount: item.dayRecurrenceCount,
          exactPositionRecurrenceCount: item.exactPositionRecurrenceCount,
          positionCounts: JSON.stringify(item.positionCounts),
          years: JSON.stringify(item.years),
          explanation: statV1Signal(item),
        })),
        ...analysis.dailyRankings.flatMap((ranking, weekday) => {
          const targetDateForDay = formatIsoDate(addUtcDays(targetRange.monday, weekday));
          return ranking.slice(0, 9).map((item) => ({
            predictionId,
            scope: "daily",
            targetDate: targetDateForDay,
            weekday,
            number: item.number,
            ranking: item.ranking,
            score: item.score,
            totalCount: item.totalCount,
            yearSupport: item.yearSupport,
            dayRecurrenceCount: item.dayRecurrenceCount,
            exactPositionRecurrenceCount: item.exactPositionRecurrenceCount,
            positionCounts: JSON.stringify(item.positionCounts),
            years: JSON.stringify(item.years),
            explanation: statV1Signal(item),
          }));
        }),
      ];

      for (const batch of chunkRows(candidateRows, CANDIDATE_BATCH_SIZE)) {
        await db.insert(predictionCandidates).values(batch);
      }

      frozen.push({
        lottery: analysis.lottery.slug,
        predictionId,
        candidateRows: candidateRows.length,
      });
    }

    return NextResponse.json({
      status: "frozen",
      kind: projectionKind,
      label: projectionKindLabel(projectionKind),
      newlyFrozen: true,
      frozenAt,
      isoYear: targetInfo.isoYear,
      isoWeek: targetInfo.isoWeek,
      weekStart,
      weekEnd,
      dataAvailableThrough: latestConfirmedDate,
      batchSize: CANDIDATE_BATCH_SIZE,
      frozen,
    });
  } catch (error) {
    try {
      if (createdPredictionIds.length > 0) {
        const db = getDb();
        for (const predictionId of createdPredictionIds.reverse()) {
          await db
            .delete(predictionCandidates)
            .where(eq(predictionCandidates.predictionId, predictionId));
          await db.delete(predictions).where(eq(predictions.id, predictionId));
        }
      }
    } catch {
      // Si el rollback también falla, el siguiente intento detectará el snapshot parcial
      // y se negará a sobrescribirlo silenciosamente.
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible congelar la proyección.",
      },
      { status: 500 },
    );
  }
}
