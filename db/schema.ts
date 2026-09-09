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
    isoYear: integer("iso_year").notNull().default(0),
    isoWeek: integer("iso_week").notNull().default(0),
    weekStart: text("week_start").notNull(),
    weekEnd: text("week_end").notNull(),
    generatedAt: text("generated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    dataAvailableThrough: text("data_available_through").notNull(),
    methodVersion: text("method_version").notNull(),
    methodParameters: text("method_parameters").notNull(),
    projectionKind: text("projection_kind").notNull().default("unspecified"),
    status: text("status").notNull().default("generated"),
  },
  (table) => [
    index("predictions_week_idx").on(table.weekStart, table.weekEnd),
    uniqueIndex("predictions_freeze_unique").on(
      table.lotteryId,
      table.weekStart,
      table.weekEnd,
      table.methodVersion,
    ),
  ],
);

export const predictionCandidates = sqliteTable(
  "prediction_candidates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    predictionId: integer("prediction_id").notNull().references(() => predictions.id),
    scope: text("scope").notNull().default("weekly"),
    targetDate: text("target_date").notNull().default(""),
    weekday: integer("weekday"),
    number: text("number").notNull(),
    ranking: integer("ranking").notNull(),
    score: real("score").notNull(),
    totalCount: integer("total_count").notNull().default(0),
    yearSupport: integer("year_support").notNull().default(0),
    dayRecurrenceCount: integer("day_recurrence_count").notNull().default(0),
    exactPositionRecurrenceCount: integer("exact_position_recurrence_count").notNull().default(0),
    positionCounts: text("position_counts").notNull().default("[0,0,0]"),
    years: text("years").notNull().default("[]"),
    monthlyScore: real("monthly_score").notNull().default(0),
    weeklyScore: real("weekly_score").notNull().default(0),
    weekdayScore: real("weekday_score").notNull().default(0),
    positionScore: real("position_score").notNull().default(0),
    coincidenceScore: real("coincidence_score").notNull().default(0),
    recencyScore: real("recency_score").notNull().default(0),
    explanation: text("explanation").notNull(),
  },
  (table) => [
    uniqueIndex("prediction_candidates_scope_rank_unique").on(
      table.predictionId,
      table.scope,
      table.targetDate,
      table.ranking,
    ),
  ],
);

export const predictionEvaluations = sqliteTable(
  "prediction_evaluations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    predictionId: integer("prediction_id").notNull().references(() => predictions.id),
    lotteryId: integer("lottery_id").notNull().references(() => lotteries.id),
    drawResultId: integer("draw_result_id").references(() => drawResults.id),
    targetDate: text("target_date").notNull(),
    weekday: integer("weekday").notNull(),
    status: text("status").notNull().default("pending"),
    dailyCandidatesSnapshot: text("daily_candidates_snapshot").notNull().default("[]"),
    weeklyTop5Snapshot: text("weekly_top5_snapshot").notNull().default("[]"),
    weeklyTop10Snapshot: text("weekly_top10_snapshot").notNull().default("[]"),
    weeklyTop15Snapshot: text("weekly_top15_snapshot").notNull().default("[]"),
    resultNumbers: text("result_numbers").notNull().default("[]"),
    dailyMatchedPositions: text("daily_matched_positions").notNull().default("[]"),
    dailyMatchCount: integer("daily_match_count").notNull().default(0),
    top5MatchedPositions: text("top5_matched_positions").notNull().default("[]"),
    top10MatchedPositions: text("top10_matched_positions").notNull().default("[]"),
    top15MatchedPositions: text("top15_matched_positions").notNull().default("[]"),
    hitTop5: integer("hit_top5", { mode: "boolean" }).notNull().default(false),
    hitTop10: integer("hit_top10", { mode: "boolean" }).notNull().default(false),
    hitTop15: integer("hit_top15", { mode: "boolean" }).notNull().default(false),
    positionEvaluation: text("position_evaluation").notNull().default("not_applicable_stat_v1"),
    reviewNote: text("review_note"),
    evaluatedAt: text("evaluated_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("prediction_evaluations_prediction_date_unique").on(
      table.predictionId,
      table.targetDate,
    ),
    index("prediction_evaluations_date_status_idx").on(table.targetDate, table.status),
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
