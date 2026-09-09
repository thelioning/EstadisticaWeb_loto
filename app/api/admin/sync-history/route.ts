import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { drawResults, lotteries, syncRuns } from "../../../../db/schema";
import {
  HISTORICAL_SOURCE_NAME,
  fetchHistoricalDrawsForDate,
} from "../../../../lib/historical-lottery-source";
import {
  calendarParts,
  TARGET_LOTTERIES,
} from "../../../../lib/lottery-source";
import {
  addUtcDays,
  formatIsoDate,
  isoWeekInfo,
  isoWeekRange,
  type IsoWeekRange,
} from "../../../../lib/iso-week";

function datesForRange(range: IsoWeekRange) {
  return Array.from({ length: 7 }, (_, index) =>
    formatIsoDate(addUtcDays(range.monday, index)),
  );
}

export async function POST(request: NextRequest) {
  const startedAt = new Date().toISOString();

  try {
    const body = (await request.json().catch(() => ({}))) as {
      targetDate?: string;
    };
    const targetDate = body.targetDate ?? "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return NextResponse.json(
        { error: "Debes enviar targetDate con formato YYYY-MM-DD." },
        { status: 400 },
      );
    }

    const target = new Date(`${targetDate}T12:00:00.000Z`);
    const targetWeek = isoWeekInfo(target);
    const historicalYears = [
      targetWeek.isoYear - 3,
      targetWeek.isoYear - 2,
      targetWeek.isoYear - 1,
    ];

    const historicalWeeks = historicalYears.map((isoYear) => ({
      isoYear,
      range: isoWeekRange(isoYear, targetWeek.isoWeek),
    }));

    const invalidWeek = historicalWeeks.find((item) => item.range === null);
    if (invalidWeek) {
      return NextResponse.json(
        {
          error: `La semana ISO ${targetWeek.isoWeek} no existe en ${invalidWeek.isoYear}.`,
        },
        { status: 422 },
      );
    }

    const ranges = historicalWeeks.map((item) => item.range as IsoWeekRange);
    const dates = ranges.flatMap(datesForRange);
    const db = getDb();

    for (const definition of TARGET_LOTTERIES) {
      await db
        .insert(lotteries)
        .values({
          externalGameId: definition.externalGameId,
          name: definition.name,
          slug: definition.slug,
          source: HISTORICAL_SOURCE_NAME,
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

    let recordsCreated = 0;
    let recordsUpdated = 0;
    let datesWithResults = 0;
    const datesWithoutResults: string[] = [];
    const missingLotteryDraws: Array<{ date: string; lotteries: string[] }> = [];
    const failures: Array<{ date: string; error: string }> = [];

    for (const date of dates) {
      try {
        const draws = await fetchHistoricalDrawsForDate(date);

        if (draws.length === 0) {
          datesWithoutResults.push(date);
          continue;
        }

        datesWithResults += 1;
        const foundIds = new Set(draws.map((draw) => draw.externalGameId));
        const missing = TARGET_LOTTERIES
          .filter((definition) => !foundIds.has(definition.externalGameId))
          .map((definition) => definition.slug);

        if (missing.length > 0) {
          missingLotteryDraws.push({ date, lotteries: missing });
        }

        for (const draw of draws) {
          const lottery = await db.query.lotteries.findFirst({
            where: eq(lotteries.externalGameId, draw.externalGameId),
          });
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

          const existing = await db.query.drawResults.findFirst({
            where: and(
              eq(drawResults.lotteryId, lottery.id),
              eq(drawResults.drawDate, draw.drawDate),
            ),
          });

          if (existing) {
            await db
              .update(drawResults)
              .set(values)
              .where(eq(drawResults.id, existing.id));
            recordsUpdated += 1;
          } else {
            await db.insert(drawResults).values(values);
            recordsCreated += 1;
          }
        }
      } catch (error) {
        failures.push({
          date,
          error: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }

    const sortedDates = [...dates].sort();
    await db.insert(syncRuns).values({
      source: HISTORICAL_SOURCE_NAME,
      dateFrom: sortedDates[0] ?? targetDate,
      dateTo: sortedDates.at(-1) ?? targetDate,
      status:
        failures.length === 0 && missingLotteryDraws.length === 0
          ? "succeeded"
          : "partial",
      recordsCreated,
      recordsUpdated,
      errorMessage:
        failures.length > 0 || missingLotteryDraws.length > 0
          ? JSON.stringify({ failures, missingLotteryDraws })
          : null,
      startedAt,
      finishedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      targetDate,
      targetIsoYear: targetWeek.isoYear,
      isoWeek: targetWeek.isoWeek,
      source: HISTORICAL_SOURCE_NAME,
      historicalWeeks: historicalWeeks.map((item) => ({
        isoYear: item.isoYear,
        start: formatIsoDate((item.range as IsoWeekRange).monday),
        end: formatIsoDate((item.range as IsoWeekRange).sunday),
      })),
      datesRequested: dates.length,
      datesWithResults,
      datesWithoutResults,
      expectedRecords: dates.length * TARGET_LOTTERIES.length,
      recordsCreated,
      recordsUpdated,
      recordsProcessed: recordsCreated + recordsUpdated,
      missingLotteryDraws,
      failures,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible sincronizar las semanas históricas.",
      },
      { status: 500 },
    );
  }
}
