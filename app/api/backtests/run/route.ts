import { and, eq, gte, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { drawResults, lotteries } from "../../../../db/schema";
import { runBacktest, type BacktestDraw } from "../../../../lib/backtest";

function validTargetYear(value: unknown) {
  const year = typeof value === "number" ? value : Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      targetYear?: number;
    };
    const targetYear = validTargetYear(body.targetYear);

    if (targetYear === null) {
      return NextResponse.json(
        { error: "El año objetivo debe ser un entero entre 2000 y 2100." },
        { status: 400 },
      );
    }

    // ISO years can begin in late December and end in early January.
    const dateFrom = `${targetYear - 4}-12-28`;
    const dateTo = `${targetYear + 1}-01-04`;
    const db = getDb();
    const rows = await db
      .select({
        lottery: lotteries.slug,
        lotteryName: lotteries.name,
        drawDate: drawResults.drawDate,
        firstNumber: drawResults.firstNumber,
        secondNumber: drawResults.secondNumber,
        thirdNumber: drawResults.thirdNumber,
      })
      .from(drawResults)
      .innerJoin(lotteries, eq(drawResults.lotteryId, lotteries.id))
      .where(
        and(
          gte(drawResults.drawDate, dateFrom),
          lte(drawResults.drawDate, dateTo),
        ),
      );

    const result = runBacktest(rows satisfies BacktestDraw[], targetYear);
    return NextResponse.json({ source: "project_database", ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible ejecutar el backtest.",
      },
      { status: 500 },
    );
  }
}
