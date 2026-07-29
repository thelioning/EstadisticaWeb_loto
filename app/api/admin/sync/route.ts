import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { drawResults, lotteries, syncRuns } from "../../../../db/schema";
import {
  calendarParts,
  fetchDrawsForDate,
  TARGET_LOTTERIES,
} from "../../../../lib/lottery-source";

export async function POST(request: NextRequest) {
  const startedAt = new Date().toISOString();
  let requestedDate = "";

  try {
    const body = (await request.json()) as { date?: string };
    requestedDate = body.date ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return NextResponse.json(
        { error: "Debes enviar una fecha con formato YYYY-MM-DD." },
        { status: 400 },
      );
    }

    const db = getDb();
    const draws = await fetchDrawsForDate(requestedDate);
    let createdOrUpdated = 0;

    for (const definition of TARGET_LOTTERIES) {
      await db
        .insert(lotteries)
        .values({
          externalGameId: definition.externalGameId,
          name: definition.name,
          slug: definition.slug,
          source: "loteriasdominicanas.com",
          active: true,
          updatedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: lotteries.externalGameId,
          set: {
            name: definition.name,
            slug: definition.slug,
            active: true,
            updatedAt: new Date().toISOString(),
          },
        });
    }

    for (const draw of draws) {
      const lottery = await db.query.lotteries.findFirst({
        where: eq(lotteries.externalGameId, draw.externalGameId),
      });
      if (!lottery) continue;

      const parts = calendarParts(draw.drawDate);
      await db
        .insert(drawResults)
        .values({
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
          source: "loteriasdominicanas.com",
          sourcePayload: draw.sourcePayload,
          updatedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: [drawResults.lotteryId, drawResults.externalResultId],
          set: {
            firstNumber: draw.firstNumber,
            secondNumber: draw.secondNumber,
            thirdNumber: draw.thirdNumber,
            sourcePayload: draw.sourcePayload,
            updatedAt: new Date().toISOString(),
          },
        });
      createdOrUpdated += 1;
    }

    await db.insert(syncRuns).values({
      source: "loteriasdominicanas.com",
      dateFrom: requestedDate,
      dateTo: requestedDate,
      status: "succeeded",
      recordsCreated: createdOrUpdated,
      recordsUpdated: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      date: requestedDate,
      recordsProcessed: createdOrUpdated,
      expectedLotteries: TARGET_LOTTERIES.length,
      missingLotteries: TARGET_LOTTERIES.length - draws.length,
    });
  } catch (error) {
    try {
      const db = getDb();
      await db.insert(syncRuns).values({
        source: "loteriasdominicanas.com",
        dateFrom: requestedDate || "unknown",
        dateTo: requestedDate || "unknown",
        status: "failed",
        recordsCreated: 0,
        recordsUpdated: 0,
        errorMessage: error instanceof Error ? error.message : "Error desconocido",
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    } catch {
      // The original error remains the relevant response.
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible sincronizar la fecha.",
      },
      { status: 502 },
    );
  }
}
