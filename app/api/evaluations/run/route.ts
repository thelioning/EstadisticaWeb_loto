import { and, asc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import {
  drawResults,
  lotteries,
  predictionCandidates,
  predictionEvaluations,
  predictions,
} from "../../../../db/schema";
import {
  HISTORICAL_SOURCE_NAME,
  fetchHistoricalDrawsForDate,
} from "../../../../lib/historical-lottery-source";
import { addUtcDays, formatIsoDate, isoWeekInfo, isoWeekRange } from "../../../../lib/iso-week";
import { calendarParts } from "../../../../lib/lottery-source";
import { currentDominicanDate } from "../../../../lib/prediction-freeze";
import { STAT_V1_METHOD_VERSION } from "../../../../lib/stat-v1";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

type MatchedPosition = {
  position: 1 | 2 | 3;
  number: string;
};

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Debes enviar targetDate con formato YYYY-MM-DD.");
  }
  return new Date(`${value}T12:00:00.000Z`);
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function parseMatchedPositions(value: string): MatchedPosition[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is MatchedPosition =>
        item &&
        (item.position === 1 || item.position === 2 || item.position === 3) &&
        typeof item.number === "string",
    );
  } catch {
    return [];
  }
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function matchedPositions(resultNumbers: string[], candidates: string[]): MatchedPosition[] {
  const candidateSet = new Set(candidates);
  return resultNumbers.flatMap((number, index) =>
    candidateSet.has(number)
      ? [{ position: (index + 1) as 1 | 2 | 3, number }]
      : [],
  );
}

function comparisonBasisLabel(kind: string) {
  return kind === "prospective"
    ? "Candidatos congelados antes del inicio de la semana"
    : "Candidatos reconstruidos y congelados retrospectivamente";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { targetDate?: string };
    const requestedDate = body.targetDate ?? "";
    const targetDate = parseDate(requestedDate);
    const targetWeek = isoWeekInfo(targetDate);
    const targetRange = isoWeekRange(targetWeek.isoYear, targetWeek.isoWeek);

    if (!targetRange) {
      return NextResponse.json(
        { error: "No fue posible determinar la semana ISO objetivo." },
        { status: 422 },
      );
    }

    const weekStart = formatIsoDate(targetRange.monday);
    const weekEnd = formatIsoDate(targetRange.sunday);
    const weekDates = Array.from({ length: 7 }, (_, index) =>
      formatIsoDate(addUtcDays(targetRange.monday, index)),
    );
    const today = currentDominicanDate();
    const evaluableDates = weekDates.filter((date) => date < today);
    const db = getDb();

    const frozenPredictions = await db
      .select()
      .from(predictions)
      .where(
        and(
          eq(predictions.weekStart, weekStart),
          eq(predictions.weekEnd, weekEnd),
          eq(predictions.methodVersion, STAT_V1_METHOD_VERSION),
          eq(predictions.status, "frozen"),
        ),
      )
      .orderBy(asc(predictions.lotteryId));

    if (frozenPredictions.length !== 3) {
      return NextResponse.json(
        {
          error:
            "La semana debe tener exactamente tres snapshots congelados antes de ejecutar la evaluación diaria.",
          weekStart,
          weekEnd,
          snapshotsFound: frozenPredictions.length,
        },
        { status: 409 },
      );
    }

    const lotteryIds = frozenPredictions.map((prediction) => prediction.lotteryId);
    const lotteryRows = await db
      .select({
        id: lotteries.id,
        slug: lotteries.slug,
        name: lotteries.name,
        externalGameId: lotteries.externalGameId,
      })
      .from(lotteries)
      .where(inArray(lotteries.id, lotteryIds));

    const lotteryById = new Map(lotteryRows.map((lottery) => [lottery.id, lottery]));
    const lotteryByExternal = new Map(
      lotteryRows.map((lottery) => [lottery.externalGameId, lottery]),
    );

    const sync = [] as Array<{
      date: string;
      status: "ok" | "no_results" | "error";
      drawsFound: number;
      error?: string;
    }>;

    for (const date of evaluableDates) {
      try {
        const draws = await fetchHistoricalDrawsForDate(date);
        if (draws.length === 0) {
          sync.push({ date, status: "no_results", drawsFound: 0 });
          continue;
        }

        for (const draw of draws) {
          const lottery = lotteryByExternal.get(draw.externalGameId);
          if (!lottery) continue;

          const parts = calendarParts(draw.drawDate);
          const values = {
            lotteryId: lottery.id,
            externalResultId: draw.externalResultId,
            drawDate: draw.drawDate,
            drawDatetime: draw.drawDatetime,
            weekday: parts.weekday,
            calendarWeek: parts.calendarWeek,
            month: parts.month,
            year: parts.year,
            firstNumber: draw.firstNumber,
            secondNumber: draw.secondNumber,
            thirdNumber: draw.thirdNumber,
            source: HISTORICAL_SOURCE_NAME,
            sourcePayload: draw.sourcePayload,
            updatedAt: new Date().toISOString(),
          };

          const existingDraw = await db.query.drawResults.findFirst({
            where: and(
              eq(drawResults.lotteryId, lottery.id),
              eq(drawResults.drawDate, draw.drawDate),
            ),
          });

          if (existingDraw) {
            await db.update(drawResults).set(values).where(eq(drawResults.id, existingDraw.id));
          } else {
            await db.insert(drawResults).values(values);
          }
        }

        sync.push({ date, status: "ok", drawsFound: draws.length });
      } catch (error) {
        sync.push({
          date,
          status: "error",
          drawsFound: 0,
          error: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }

    const predictionIds = frozenPredictions.map((prediction) => prediction.id);
    const allCandidates = await db
      .select()
      .from(predictionCandidates)
      .where(inArray(predictionCandidates.predictionId, predictionIds))
      .orderBy(
        asc(predictionCandidates.predictionId),
        asc(predictionCandidates.scope),
        asc(predictionCandidates.targetDate),
        asc(predictionCandidates.ranking),
      );

    const weekResults = await db
      .select()
      .from(drawResults)
      .where(
        and(
          inArray(drawResults.lotteryId, lotteryIds),
          inArray(drawResults.drawDate, weekDates),
        ),
      )
      .orderBy(asc(drawResults.drawDate), asc(drawResults.lotteryId));

    const existingEvaluations = await db
      .select()
      .from(predictionEvaluations)
      .where(inArray(predictionEvaluations.predictionId, predictionIds));
    const evaluationByKey = new Map(
      existingEvaluations.map((evaluation) => [
        `${evaluation.predictionId}:${evaluation.targetDate}`,
        evaluation,
      ]),
    );

    const responseEvaluations = [] as Array<Record<string, unknown>>;

    for (const prediction of frozenPredictions) {
      const lottery = lotteryById.get(prediction.lotteryId);
      if (!lottery) continue;

      const predictionRows = allCandidates.filter(
        (candidate) => candidate.predictionId === prediction.id,
      );
      const weeklyRows = predictionRows
        .filter((candidate) => candidate.scope === "weekly" && candidate.targetDate === "")
        .sort((a, b) => a.ranking - b.ranking);
      const weeklyTop5 = weeklyRows.slice(0, 5).map((candidate) => candidate.number);
      const weeklyTop10 = weeklyRows.slice(0, 10).map((candidate) => candidate.number);
      const weeklyTop15 = weeklyRows.slice(0, 15).map((candidate) => candidate.number);

      for (let weekday = 0; weekday < weekDates.length; weekday += 1) {
        const date = weekDates[weekday];
        const dailyTop5 = predictionRows
          .filter(
            (candidate) =>
              candidate.scope === "daily" && candidate.targetDate === date,
          )
          .sort((a, b) => a.ranking - b.ranking)
          .slice(0, 5)
          .map((candidate) => candidate.number);

        const key = `${prediction.id}:${date}`;
        let existing = evaluationByKey.get(key);
        const result = weekResults.find(
          (draw) => draw.lotteryId === prediction.lotteryId && draw.drawDate === date,
        );
        const isEvaluable = date < today;

        const snapshotValues = {
          dailyCandidatesSnapshot: JSON.stringify(dailyTop5),
          weeklyTop5Snapshot: JSON.stringify(weeklyTop5),
          weeklyTop10Snapshot: JSON.stringify(weeklyTop10),
          weeklyTop15Snapshot: JSON.stringify(weeklyTop15),
          updatedAt: new Date().toISOString(),
        };

        if (!isEvaluable || !result) {
          if (!existing) {
            const inserted = await db
              .insert(predictionEvaluations)
              .values({
                predictionId: prediction.id,
                lotteryId: prediction.lotteryId,
                targetDate: date,
                weekday,
                status: "pending",
                ...snapshotValues,
              })
              .returning();
            existing = inserted[0];
            if (existing) evaluationByKey.set(key, existing);
          } else if (existing.status === "pending") {
            await db
              .update(predictionEvaluations)
              .set(snapshotValues)
              .where(eq(predictionEvaluations.id, existing.id));
          }

          responseEvaluations.push({
            date,
            day: DAYS[weekday],
            lottery: lottery.slug,
            lotteryName: lottery.name,
            predictionId: prediction.id,
            projectionKind: prediction.projectionKind,
            comparisonBasis: comparisonBasisLabel(prediction.projectionKind),
            status: existing?.status ?? "pending",
            dailyCandidates: dailyTop5,
            result: null,
            coincidences: [],
            coincidenceCount: 0,
            hitTop5: false,
            hitTop10: false,
            hitTop15: false,
            positionEvaluation: "not_applicable_stat_v1",
            positionNote: "STAT-V1.0 no publica una posición exacta prevista.",
          });
          continue;
        }

        const resultNumbers = [result.firstNumber, result.secondNumber, result.thirdNumber];

        if (existing && (existing.status === "confirmed" || existing.status === "review_required")) {
          const frozenResult = parseStringArray(existing.resultNumbers);
          if (existing.status === "confirmed" && !sameStringArray(frozenResult, resultNumbers)) {
            const note = `La fuente actual reporta ${resultNumbers.join("-")} pero la evaluación congelada conserva ${frozenResult.join("-")}. Revisión manual requerida.`;
            await db
              .update(predictionEvaluations)
              .set({
                status: "review_required",
                reviewNote: note,
                updatedAt: new Date().toISOString(),
              })
              .where(eq(predictionEvaluations.id, existing.id));
            existing = { ...existing, status: "review_required", reviewNote: note };
          }

          responseEvaluations.push({
            date,
            day: DAYS[weekday],
            lottery: lottery.slug,
            lotteryName: lottery.name,
            predictionId: prediction.id,
            projectionKind: prediction.projectionKind,
            comparisonBasis: comparisonBasisLabel(prediction.projectionKind),
            status: existing.status,
            dailyCandidates: parseStringArray(existing.dailyCandidatesSnapshot),
            result: parseStringArray(existing.resultNumbers),
            coincidences: parseMatchedPositions(existing.dailyMatchedPositions),
            coincidenceCount: existing.dailyMatchCount,
            hitTop5: existing.hitTop5,
            hitTop10: existing.hitTop10,
            hitTop15: existing.hitTop15,
            positionEvaluation: existing.positionEvaluation,
            positionNote: "STAT-V1.0 no publica una posición exacta prevista.",
            evaluatedAt: existing.evaluatedAt,
            reviewNote: existing.reviewNote,
          });
          continue;
        }

        const dailyMatches = matchedPositions(resultNumbers, dailyTop5);
        const top5Matches = matchedPositions(resultNumbers, weeklyTop5);
        const top10Matches = matchedPositions(resultNumbers, weeklyTop10);
        const top15Matches = matchedPositions(resultNumbers, weeklyTop15);
        const evaluatedAt = new Date().toISOString();
        const confirmedValues = {
          drawResultId: result.id,
          status: "confirmed",
          ...snapshotValues,
          resultNumbers: JSON.stringify(resultNumbers),
          dailyMatchedPositions: JSON.stringify(dailyMatches),
          dailyMatchCount: dailyMatches.length,
          top5MatchedPositions: JSON.stringify(top5Matches),
          top10MatchedPositions: JSON.stringify(top10Matches),
          top15MatchedPositions: JSON.stringify(top15Matches),
          hitTop5: top5Matches.length > 0,
          hitTop10: top10Matches.length > 0,
          hitTop15: top15Matches.length > 0,
          positionEvaluation: "not_applicable_stat_v1",
          reviewNote: null,
          evaluatedAt,
        };

        if (existing) {
          await db
            .update(predictionEvaluations)
            .set(confirmedValues)
            .where(eq(predictionEvaluations.id, existing.id));
        } else {
          const inserted = await db
            .insert(predictionEvaluations)
            .values({
              predictionId: prediction.id,
              lotteryId: prediction.lotteryId,
              targetDate: date,
              weekday,
              ...confirmedValues,
            })
            .returning();
          existing = inserted[0];
          if (existing) evaluationByKey.set(key, existing);
        }

        responseEvaluations.push({
          date,
          day: DAYS[weekday],
          lottery: lottery.slug,
          lotteryName: lottery.name,
          predictionId: prediction.id,
          projectionKind: prediction.projectionKind,
          comparisonBasis: comparisonBasisLabel(prediction.projectionKind),
          status: "confirmed",
          dailyCandidates: dailyTop5,
          result: resultNumbers,
          coincidences: dailyMatches,
          coincidenceCount: dailyMatches.length,
          hitTop5: top5Matches.length > 0,
          hitTop10: top10Matches.length > 0,
          hitTop15: top15Matches.length > 0,
          positionEvaluation: "not_applicable_stat_v1",
          positionNote: "STAT-V1.0 no publica una posición exacta prevista.",
          evaluatedAt,
          reviewNote: null,
        });
      }
    }

    const confirmed = responseEvaluations.filter((item) => item.status === "confirmed");
    const pending = responseEvaluations.filter((item) => item.status === "pending");
    const reviewRequired = responseEvaluations.filter(
      (item) => item.status === "review_required",
    );
    const withCoincidences = confirmed.filter(
      (item) => typeof item.coincidenceCount === "number" && item.coincidenceCount > 0,
    );
    const zeroCoincidences = confirmed.filter((item) => item.coincidenceCount === 0);

    return NextResponse.json({
      methodVersion: STAT_V1_METHOD_VERSION,
      isoYear: targetWeek.isoYear,
      isoWeek: targetWeek.isoWeek,
      weekStart,
      weekEnd,
      currentDominicanDate: today,
      evaluationRule: "Solo se confirman automáticamente fechas anteriores al día actual en America/Santo_Domingo.",
      source: HISTORICAL_SOURCE_NAME,
      sync,
      summary: {
        totalRows: responseEvaluations.length,
        confirmed: confirmed.length,
        pending: pending.length,
        reviewRequired: reviewRequired.length,
        withCoincidences: withCoincidences.length,
        zeroCoincidences: zeroCoincidences.length,
      },
      evaluations: responseEvaluations,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible ejecutar la evaluación diaria.",
      },
      { status: 500 },
    );
  }
}
