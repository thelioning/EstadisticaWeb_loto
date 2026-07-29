import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const lotteries = sqliteTable(
  "lotteries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    externalGameId: text("external_game_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    source: text("source").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("lotteries_external_game_id_unique").on(table.externalGameId),
    uniqueIndex("lotteries_slug_unique").on(table.slug),
  ],
);

export const drawResults = sqliteTable(
  "draw_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    lotteryId: integer("lottery_id").notNull().references(() => lotteries.id),
    externalResultId: text("external_result_id").notNull(),
    drawDate: text("draw_date").notNull(),
    drawDatetime: text("draw_datetime"),
    weekday: integer("weekday").notNull(),
    calendarWeek: integer("calendar_week").notNull(),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    firstNumber: text("first_number").notNull(),
    secondNumber: text("second_number").notNull(),
    thirdNumber: text("third_number").notNull(),
    source: text("source").notNull(),
    sourcePayload: text("source_payload"),
    collectedAt: text("collected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("draw_results_lottery_external_unique").on(table.lotteryId, table.externalResultId),
    index("draw_results_date_idx").on(table.drawDate),
    index("draw_results_period_idx").on(table.lotteryId, table.year, table.month),
  ],
);

export const predictions = sqliteTable(
  "predictions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    lotteryId: integer("lottery_id").notNull().references(() => lotteries.id),
    weekStart: text("week_start").notNull(),
    weekEnd: text("week_end").notNull(),
    generatedAt: text("generated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    dataAvailableThrough: text("data_available_through").notNull(),
    methodVersion: text("method_version").notNull(),
    methodParameters: text("method_parameters").notNull(),
    status: text("status").notNull().default("generated"),
  },
  (table) => [index("predictions_week_idx").on(table.weekStart, table.weekEnd)],
);

export const predictionCandidates = sqliteTable(
  "prediction_candidates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    predictionId: integer("prediction_id").notNull().references(() => predictions.id),
    number: text("number").notNull(),
    ranking: integer("ranking").notNull(),
    score: real("score").notNull(),
    monthlyScore: real("monthly_score").notNull().default(0),
    weeklyScore: real("weekly_score").notNull().default(0),
    weekdayScore: real("weekday_score").notNull().default(0),
    positionScore: real("position_score").notNull().default(0),
    coincidenceScore: real("coincidence_score").notNull().default(0),
    recencyScore: real("recency_score").notNull().default(0),
    explanation: text("explanation").notNull(),
  },
  (table) => [
    uniqueIndex("prediction_candidates_rank_unique").on(table.predictionId, table.ranking),
  ],
);

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    dateFrom: text("date_from").notNull(),
    dateTo: text("date_to").notNull(),
    status: text("status").notNull(),
    recordsCreated: integer("records_created").notNull().default(0),
    recordsUpdated: integer("records_updated").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
  },
  (table) => [index("sync_runs_started_idx").on(table.startedAt)],
);
