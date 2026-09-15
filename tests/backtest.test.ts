import assert from "node:assert/strict";
import test from "node:test";
import { parseBacktestCsv } from "../lib/backtest-csv";
import { runBacktest, type BacktestDraw } from "../lib/backtest";
import { addUtcDays, formatIsoDate, isoWeekRange } from "../lib/iso-week";

function syntheticDraws(targetContainsSignal: boolean): BacktestDraw[] {
  const draws: BacktestDraw[] = [];
  const lottery = "prueba";
  const lotteryName = "Lotería de prueba";

  for (let isoWeek = 1; isoWeek <= 5; isoWeek += 1) {
    for (const isoYear of [2022, 2023, 2024]) {
      const range = isoWeekRange(isoYear, isoWeek);
      assert.ok(range);

      for (let day = 0; day < 7; day += 1) {
        const offset = (isoYear - 2022) * 35 + (isoWeek - 1) * 7 + day;
        draws.push({
          lottery,
          lotteryName,
          drawDate: formatIsoDate(addUtcDays(range.monday, day)),
          firstNumber: "07",
          secondNumber: String(20 + (offset % 40)).padStart(2, "0"),
          thirdNumber: String(60 + (offset % 40)).padStart(2, "0"),
        });
      }
    }

    const targetRange = isoWeekRange(2025, isoWeek);
    assert.ok(targetRange);
    for (let day = 0; day < 7; day += 1) {
      draws.push({
        lottery,
        lotteryName,
        drawDate: formatIsoDate(addUtcDays(targetRange.monday, day)),
        firstNumber: targetContainsSignal ? "07" : "01",
        secondNumber: "02",
        thirdNumber: "03",
      });
    }
  }

  return draws;
}

test("CSV parser normalizes numbers and excludes duplicate lottery dates", () => {
  const parsed = parseBacktestCsv([
    "fecha,loteria,p1,p2,p3",
    "2022-01-03,Nacional,1,24,78",
    "2022-01-03,Nacional,9,9,9",
    "fila-invalida,Nacional,1,2,3",
  ].join("\n"));

  assert.equal(parsed.draws.length, 1);
  assert.equal(parsed.draws[0].firstNumber, "01");
  assert.equal(parsed.duplicateRows, 1);
  assert.equal(parsed.rejectedRows, 1);
});

test("backtest detects a strong historical signal without using target-year data", () => {
  const result = runBacktest(syntheticDraws(true), 2025);
  const hit5 = result.metrics.find((metric) => metric.k === 5);

  assert.equal(result.evaluatedDraws, 35);
  assert.equal(result.weeksEvaluated, 5);
  assert.equal(hit5?.hits, 35);
  assert.equal(hit5?.evidence, "advantage_in_backtest");
  assert.ok((hit5?.randomHitRate ?? 1) < 0.15);
});

test("target results do not enter the historical ranking", () => {
  const result = runBacktest(syntheticDraws(false), 2025);
  const hit5 = result.metrics.find((metric) => metric.k === 5);

  assert.equal(hit5?.hits, 0);
  assert.equal(hit5?.evidence, "not_demonstrated");
  assert.equal(result.verdict, "not_demonstrated");
});

test("incomplete historical weeks are counted and never substituted", () => {
  const draws = syntheticDraws(true).filter(
    (draw) => draw.drawDate !== "2023-01-02",
  );
  const result = runBacktest(draws, 2025);

  assert.equal(result.weeksEvaluated, 4);
  assert.equal(result.weeksSkippedForHistory, 1);
  assert.equal(result.evaluatedDraws, 28);
});
