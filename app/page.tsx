"use client";

import { useMemo, useState, type CSSProperties } from "react";

type PairSignal = {
  pair: string;
  numbers: [string, string];
  sharedYears: number[];
  weekSupport: number;
  exactDrawCount: number;
  combinedOccurrences: number;
};

type LotteryPrediction = {
  id: string;
  name: string;
  shortName: string;
  accent: string;
  methodVersion: string;
  candidates: Array<{ number: string; score: number; signal: string }>;
  dailyHotNumbers: string[];
  weeklyHotNumbers: string[];
  weeklyCoincidences: Array<{
    day: string;
    date: string;
    dateLabel: string;
    isSelected: boolean;
    numbers: Array<{
      number: string;
      occurrences: number;
      years: number[];
      reinforced: boolean;
    }>;
  }>;
  pairs: PairSignal[];
  historicalDrawCount: number;
  hasSufficientData: boolean;
};

type HistoricalWeek = {
  isoYear: number;
  isoWeek: number;
  available: boolean;
  start: string | null;
  end: string | null;
  label: string;
};

type PredictionResponse = {
  generatedAt: string;
  selectedDate: string;
  isoWeek: number;
  methodVersion: string;
  dataThrough: string;
  weekLabel: string;
  weekRange: string;
  targetYear: number;
  monthLabel: string;
  dayLabel: string;
  historicalYears: number[];
  historicalWeeks: HistoricalWeek[];
  dataStatus: "complete" | "insufficient";
  dataStatusLabel: string;
  historicalDrawCount: number;
  lotteries: LotteryPrediction[];
};

type MatchedPosition = {
  position: 1 | 2 | 3;
  number: string;
};

type EvaluationRow = {
  date: string;
  day: string;
  lottery: string;
  lotteryName: string;
  predictionId: number;
  projectionKind: string;
  comparisonBasis: string;
  status: "pending" | "confirmed" | "review_required";
  dailyCandidates: string[];
  result: string[] | null;
  coincidences: MatchedPosition[];
  coincidenceCount: number;
  hitTop5: boolean;
  hitTop10: boolean;
  hitTop15: boolean;
  positionEvaluation: string;
  positionNote: string;
  evaluatedAt?: string | null;
  reviewNote?: string | null;
};

type EvaluationResponse = {
  methodVersion: string;
  isoYear: number;
  isoWeek: number;
  weekStart: string;
  weekEnd: string;
  currentDominicanDate: string;
  evaluationRule: string;
  source: string;
  summary: {
    totalRows: number;
    confirmed: number;
    pending: number;
    reviewRequired: number;
    withCoincidences: number;
    zeroCoincidences: number;
  };
  evaluations: EvaluationRow[];
};

type WeeklyPerformance = {
  slug: string;
  name: string;
  confirmed: number;
  hitTop5: number;
  hitTop10: number;
  hitTop15: number;
};

const LOTTERY_TABS = [
  { id: "all", label: "Todas" },
  { id: "nacional", label: "Nacional" },
  { id: "leidsa", label: "Leidsa" },
  { id: "loteka", label: "Loteka" },
];

const evaluationStyles: Record<string, CSSProperties> = {
  section: {
    marginTop: 28,
    padding: 24,
    border: "1px solid rgba(17,58,44,.12)",
    borderRadius: 19,
    background: "#fbfaf6",
    boxShadow: "0 16px 45px rgba(24,54,43,.04)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 18,
    flexWrap: "wrap",
  },
  title: {
    margin: "6px 0 0",
    fontFamily: "Georgia, serif",
    fontSize: 28,
    fontWeight: 500,
  },
  refreshButton: {
    minHeight: 42,
    padding: "0 16px",
    border: 0,
    borderRadius: 11,
    background: "#0b6a4f",
    color: "white",
    fontSize: 12,
    fontWeight: 720,
  },
  notice: {
    marginTop: 12,
    padding: "12px 14px",
    borderRadius: 12,
    background: "#fff7e5",
    border: "1px solid #ead49f",
    color: "#75530a",
    fontSize: 11,
    lineHeight: 1.55,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
    gap: 8,
    marginTop: 18,
  },
  summaryCard: {
    padding: "13px 14px",
    borderRadius: 12,
    border: "1px solid rgba(17,58,44,.1)",
    background: "white",
  },
  summaryValue: {
    display: "block",
    fontFamily: "Georgia, serif",
    fontSize: 24,
    lineHeight: 1,
    marginBottom: 6,
  },
  summaryLabel: {
    color: "#66756f",
    fontSize: 10,
    lineHeight: 1.35,
  },
  performancePanel: {
    marginTop: 18,
    padding: 16,
    borderRadius: 14,
    border: "1px solid rgba(17,58,44,.12)",
    background: "#f4f8f5",
  },
  performanceTitle: {
    margin: 0,
    fontFamily: "Georgia, serif",
    fontSize: 20,
    fontWeight: 500,
  },
  performanceIntro: {
    margin: "6px 0 12px",
    color: "#66756f",
    fontSize: 10,
    lineHeight: 1.5,
  },
  performanceTableWrap: {
    overflowX: "auto",
  },
  performanceTable: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 560,
    background: "white",
    borderRadius: 12,
    overflow: "hidden",
  },
  performanceTh: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(17,58,44,.12)",
    color: "#66756f",
    fontSize: 9,
    letterSpacing: ".05em",
    textTransform: "uppercase",
    textAlign: "left",
  },
  performanceTd: {
    padding: "11px 12px",
    borderBottom: "1px solid rgba(17,58,44,.08)",
    fontSize: 11,
  },
  dayBlock: {
    marginTop: 22,
    paddingTop: 20,
    borderTop: "1px solid rgba(17,58,44,.12)",
  },
  dayHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    marginBottom: 10,
  },
  dayTitle: {
    margin: 0,
    fontFamily: "Georgia, serif",
    fontSize: 21,
    fontWeight: 500,
  },
  dayDate: {
    color: "#66756f",
    fontSize: 10,
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 10,
  },
  card: {
    padding: 16,
    borderRadius: 14,
    border: "1px solid rgba(17,58,44,.12)",
    background: "white",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 13,
  },
  lottery: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: ".08em",
    textTransform: "uppercase",
  },
  status: {
    padding: "5px 8px",
    borderRadius: 999,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: ".04em",
  },
  label: {
    margin: "10px 0 5px",
    color: "#66756f",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: ".07em",
    textTransform: "uppercase",
  },
  numberRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  number: {
    minWidth: 34,
    height: 34,
    padding: "0 8px",
    display: "inline-grid",
    placeItems: "center",
    borderRadius: 999,
    border: "1px solid rgba(17,58,44,.14)",
    background: "#fbfaf6",
    fontSize: 11,
    fontWeight: 750,
  },
  resultNumber: {
    minWidth: 38,
    height: 38,
    display: "inline-grid",
    placeItems: "center",
    borderRadius: 999,
    background: "#13231d",
    color: "white",
    fontSize: 12,
    fontWeight: 800,
  },
  zero: {
    marginTop: 12,
    padding: "9px 10px",
    borderRadius: 10,
    background: "#fff0ec",
    color: "#9f341e",
    fontSize: 11,
    fontWeight: 800,
  },
  hit: {
    marginTop: 12,
    padding: "9px 10px",
    borderRadius: 10,
    background: "#edf9f4",
    color: "#07563f",
    fontSize: 11,
    fontWeight: 800,
  },
  pending: {
    marginTop: 12,
    padding: "9px 10px",
    borderRadius: 10,
    background: "#f4f2eb",
    color: "#66756f",
    fontSize: 11,
    fontWeight: 700,
  },
  metrics: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 11,
  },
  metric: {
    padding: "5px 8px",
    borderRadius: 999,
    border: "1px solid rgba(17,58,44,.12)",
    fontSize: 9,
    color: "#66756f",
  },
  footerNote: {
    margin: "15px 0 0",
    color: "#66756f",
    fontSize: 10,
    lineHeight: 1.55,
  },
};

function Ball({ value, size = "normal" }: { value: string; size?: "normal" | "small" }) {
  return <span className={`ball ${size === "small" ? "ballSmall" : ""}`}>{value}</span>;
}

function currentDominicanDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function formatEvaluationDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString("es-DO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Santo_Domingo",
  });
}

function formatHitRate(hits: number, confirmed: number) {
  if (confirmed === 0) return "0/0";
  return `${hits}/${confirmed} (${Math.round((hits / confirmed) * 100)}%)`;
}

function statusAppearance(row: EvaluationRow) {
  if (row.status === "review_required") {
    return { text: "REVISIÓN REQUERIDA", background: "#fff0ec", color: "#9f341e" };
  }
  if (row.status === "pending") {
    return { text: "PENDIENTE", background: "#f4f2eb", color: "#66756f" };
  }
  if (row.coincidenceCount > 0) {
    return { text: "COINCIDENCIA", background: "#edf9f4", color: "#07563f" };
  }
  return { text: "0 COINCIDENCIAS", background: "#fff0ec", color: "#9f341e" };
}

export default function Home() {
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResponse | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(false);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [error, setError] = useState("");
  const [evaluationError, setEvaluationError] = useState("");
  const [selectedDate, setSelectedDate] = useState(currentDominicanDate);

  const visibleLotteries = useMemo(() => {
    if (!result) return [];
    return activeTab === "all"
      ? result.lotteries
      : result.lotteries.filter((lottery) => lottery.id === activeTab);
  }, [activeTab, result]);

  const visibleEvaluations = useMemo(() => {
    if (!evaluation) return [];
    return activeTab === "all"
      ? evaluation.evaluations
      : evaluation.evaluations.filter((item) => item.lottery === activeTab);
  }, [activeTab, evaluation]);

  const evaluationDates = useMemo(
    () => [...new Set(visibleEvaluations.map((item) => item.date))].sort(),
    [visibleEvaluations],
  );

  const weeklyPerformance = useMemo<WeeklyPerformance[]>(() => {
    if (!evaluation) return [];
    const slugs = activeTab === "all"
      ? ["nacional", "leidsa", "loteka"]
      : [activeTab];

    return slugs.map((slug) => {
      const rows = evaluation.evaluations.filter(
        (item) => item.lottery === slug && item.status === "confirmed",
      );
      const name = evaluation.evaluations.find((item) => item.lottery === slug)?.lotteryName ?? slug;
      return {
        slug,
        name,
        confirmed: rows.length,
        hitTop5: rows.filter((item) => item.hitTop5).length,
        hitTop10: rows.filter((item) => item.hitTop10).length,
        hitTop15: rows.filter((item) => item.hitTop15).length,
      };
    });
  }, [activeTab, evaluation]);

  const weeklyPerformanceTotal = useMemo(
    () => weeklyPerformance.reduce(
      (total, item) => ({
        slug: "total",
        name: "TOTAL",
        confirmed: total.confirmed + item.confirmed,
        hitTop5: total.hitTop5 + item.hitTop5,
        hitTop10: total.hitTop10 + item.hitTop10,
        hitTop15: total.hitTop15 + item.hitTop15,
      }),
      { slug: "total", name: "TOTAL", confirmed: 0, hitTop5: 0, hitTop10: 0, hitTop15: 0 } as WeeklyPerformance,
    ),
    [weeklyPerformance],
  );

  async function loadEvaluations(date: string) {
    setEvaluationLoading(true);
    setEvaluationError("");
    try {
      const response = await fetch("/api/evaluations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDate: date }),
      });
      const payload = (await response.json().catch(() => null)) as
        | EvaluationResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        const message =
          payload && "error" in payload && payload.error
            ? payload.error
            : `No fue posible actualizar el seguimiento (HTTP ${response.status}).`;
        throw new Error(message);
      }
      if (!payload || "error" in payload) {
        throw new Error("El servidor devolvió una respuesta de evaluación inválida.");
      }
      setEvaluation(payload);
    } catch (caught) {
      setEvaluationError(
        caught instanceof Error ? caught.message : "No fue posible cargar el seguimiento real.",
      );
    } finally {
      setEvaluationLoading(false);
    }
  }

  async function generatePredictions(date = selectedDate) {
    setLoading(true);
    setError("");
    setEvaluation(null);
    setEvaluationError("");
    try {
      const syncResponse = await fetch("/api/admin/sync-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDate: date }),
      });
      const syncPayload = (await syncResponse.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!syncResponse.ok) {
        throw new Error(
          syncPayload?.error ??
            `No fue posible cargar el histórico real (HTTP ${syncResponse.status}).`,
        );
      }

      const response = await fetch("/api/predictions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDate: date }),
      });

      const payload = (await response.json().catch(() => null)) as
        | PredictionResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        const serverMessage =
          payload && "error" in payload && payload.error
            ? payload.error
            : `No fue posible generar el análisis (HTTP ${response.status}).`;
        throw new Error(serverMessage);
      }

      if (!payload || "error" in payload) {
        throw new Error("El servidor devolvió una respuesta de análisis inválida.");
      }

      setResult(payload);
      if (payload.dataStatus === "complete") {
        void loadEvaluations(date);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  function clearScreen() {
    setResult(null);
    setEvaluation(null);
    setError("");
    setEvaluationError("");
    setActiveTab("all");
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Nexo Loto, inicio">
          <span className="brandMark">N</span>
          <span>NEXO <b>LOTO</b></span>
        </a>
        <div className="statusPill">
          <span className="statusDot" />
          Motor estadístico disponible
        </div>
      </header>

      <section className="hero">
        <div className="heroGlow heroGlowOne" />
        <div className="heroGlow heroGlowTwo" />
        <div className="heroContent">
          <div className="eyebrow">ANÁLISIS HISTÓRICO · REPÚBLICA DOMINICANA</div>
          <h1>Decisiones con datos.<br /><span>Predicciones con contexto.</span></h1>
          <p className="heroCopy">
            Compara la misma semana ISO de los tres años anteriores, de lunes a
            domingo, para observar recurrencias históricas y generar candidatos.
          </p>
          <div className="heroActions">
            <button className="primaryButton" onClick={() => void generatePredictions(selectedDate)} disabled={loading}>
              <span className="spark">✦</span>
              {loading ? "Generando…" : result ? "Actualizar análisis" : "Generar predicciones"}
            </button>
            <button className="secondaryButton" onClick={clearScreen} disabled={!result && !error}>
              Limpiar pantalla
            </button>
          </div>
          <p className="finePrint">
            Análisis estadístico orientativo. No garantiza premios; el uso de la información es decisión del usuario.
          </p>
        </div>

        <aside className="weekCard">
          <span className="weekLabel">SEMANA OBJETIVO</span>
          <strong>{result?.weekRange ?? "LUNES — DOMINGO"}</strong>
          <span className="weekYear">{result?.targetYear ?? new Date().getFullYear()}</span>
          <div className="weekDivider" />
          <div className="yearsRow">
            <span>{result ? `SEMANA ISO ${result.isoWeek}` : "BASE HISTÓRICA"}</span>
            <b>{result?.historicalYears.join(" · ") ?? "3 años anteriores"}</b>
          </div>
        </aside>
      </section>

      <section className="workspace">
        <div className="workspaceHeader">
          <div>
            <span className="sectionKicker">PANEL DE ANÁLISIS</span>
            <h2>Señales de la semana</h2>
          </div>
          <nav className="tabs" aria-label="Filtrar lotería">
            {LOTTERY_TABS.map((tab) => (
              <button
                key={tab.id}
                className={activeTab === tab.id ? "activeTab" : ""}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <form
          className="calendarBar"
          onSubmit={(event) => {
            event.preventDefault();
            void generatePredictions(selectedDate);
          }}
        >
          <div>
            <label htmlFor="analysis-date">Semana de referencia</label>
            <p>Elige una fecha. El sistema localizará su semana ISO y la misma semana en los tres años anteriores.</p>
          </div>
          <div className="calendarControls">
            <input
              id="analysis-date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              required
            />
            <button type="submit" disabled={loading || !selectedDate}>
              {loading ? "Consultando…" : "Consultar fecha"}
            </button>
          </div>
        </form>

        {!result && !loading && !error && (
          <div className="emptyState">
            <div className="orbit">
              <span>03</span><span>51</span><span>87</span>
              <div className="orbitCenter">✦</div>
            </div>
            <h3>Tu lectura semanal comienza aquí</h3>
            <p>Genera el análisis para comparar la misma semana ISO de los tres años históricos.</p>
          </div>
        )}

        {loading && (
          <div className="loadingState">
            <div className="loadingBars"><i /><i /><i /><i /></div>
            <h3>Procesando señales históricas</h3>
            <p>Localizando la misma semana ISO en los tres años anteriores…</p>
          </div>
        )}

        {error && <div className="errorBox">{error}</div>}

        {result && (
          <>
            <div className="summaryStrip">
              <span><b>Semana ISO {result.isoWeek}</b> Referencia oficial</span>
              <span><b>{result.weekLabel}</b> Semana objetivo</span>
              <span><b>{result.dataThrough}</b> Último dato histórico usado</span>
              <span><b>{result.dayLabel}</b> Día seleccionado</span>
            </div>

            <div className="summaryStrip">
              {result.historicalWeeks.map((week) => (
                <span key={week.isoYear}>
                  <b>{week.isoYear}</b> {week.label}
                </span>
              ))}
            </div>

            <div className={`dataNotice ${result.dataStatus === "complete" ? "dataComplete" : "dataInsufficient"}`}>
              <div>
                <strong>{result.dataStatusLabel}</strong>
                <span>{result.historicalDrawCount} sorteos históricos verificados en las semanas ISO equivalentes.</span>
              </div>
              <b>{result.dataStatus === "complete" ? `DATOS REALES · ${result.methodVersion}` : "SIN SIMULACIÓN"}</b>
            </div>

            <section className="coincidenceBoard" aria-labelledby="coincidence-title">
              <div className="coincidenceHeader">
                <div>
                  <span className="sectionKicker">SEGUIMIENTO SEMANAL</span>
                  <h3 id="coincidence-title">Recurrencias por día equivalente</h3>
                </div>
                <span className="prototypeBadge">
                  {result.dataStatus === "complete" ? "Datos reales" : "Datos insuficientes"}
                </span>
              </div>
              <p className="coincidenceIntro">
                Cada columna compara el mismo día de la semana ISO en {result.historicalYears.join(", ")}.
                La estrella señala un número reforzado por la frecuencia semanal o diaria.
              </p>

              {visibleLotteries.map((lottery) => (
                <div className="lotteryWeek" key={`${lottery.id}-week`}>
                  <div className="lotteryWeekTitle" style={{ "--accent": lottery.accent } as CSSProperties}>
                    <span>{lottery.shortName}</span>
                    <b>Semana ISO {result.isoWeek} · {result.historicalYears.join(" · ")}</b>
                  </div>
                  <div className="weekDays">
                    {lottery.weeklyCoincidences.map((day) => (
                      <article className={`dayTile ${day.isSelected ? "selectedDay" : ""}`} key={day.date}>
                        <div className="dayTileHeader">
                          <strong>{day.day}</strong>
                          <span>{day.dateLabel}</span>
                        </div>
                        <div className="coincidenceNumbers">
                          {day.numbers.map((item) => (
                            <div className="coincidenceNumber" key={item.number}>
                              <Ball value={item.number} size="small" />
                              <span>{item.occurrences}/3 {item.reinforced ? "★" : ""}</span>
                              <small>{item.years.join(" · ")}</small>
                            </div>
                          ))}
                          {day.numbers.length === 0 && (
                            <span className="noVerifiedData">Sin recurrencias en 2 o más años</span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <div className="lotteryGrid">
              {visibleLotteries.map((lottery) => (
                <article className="lotteryCard" key={lottery.id} style={{ "--accent": lottery.accent } as CSSProperties}>
                  <div className="cardTop">
                    <div>
                      <span className="lotteryCode">{lottery.shortName}</span>
                      <h3>{lottery.name}</h3>
                    </div>
                    <span className="signalBadge">{lottery.methodVersion}</span>
                  </div>

                  <div className="cardSection">
                    <div className="sectionTitle">
                      <span>Candidatos principales</span>
                      <small>Índice relativo / 100</small>
                    </div>
                    <div className="candidateList">
                      {lottery.candidates.map((candidate, index) => (
                        <div className="candidate" key={candidate.number}>
                          <span className="candidateRank">0{index + 1}</span>
                          <Ball value={candidate.number} />
                          <div className="candidateMeta">
                            <div className="scoreLine">
                              <span>{candidate.signal}</span>
                              <b>{candidate.score}</b>
                            </div>
                            <div className="scoreTrack"><i style={{ width: `${candidate.score}%` }} /></div>
                          </div>
                        </div>
                      ))}
                      {lottery.candidates.length === 0 && (
                        <p className="noCardData">No hay suficientes resultados reales para calcular candidatos.</p>
                      )}
                    </div>
                  </div>

                  <div className="cardSection hotSection">
                    <div className="sectionTitle">
                      <span>Fuertes del día equivalente</span>
                      <small>{result.dayLabel} · máximo 9 distintos</small>
                    </div>
                    <div className="ballCloud">
                      {lottery.dailyHotNumbers.map((number) => <Ball key={number} value={number} size="small" />)}
                      {lottery.dailyHotNumbers.length === 0 && (
                        <span className="noCardData">Sin datos suficientes para este día equivalente.</span>
                      )}
                    </div>
                  </div>

                  <div className="cardSection monthHotSection">
                    <div className="sectionTitle">
                      <span>15 fuertes de la semana ISO</span>
                      <small>{result.historicalYears.join("—")}</small>
                    </div>
                    <div className="ballCloud">
                      {lottery.weeklyHotNumbers.map((number) => <Ball key={number} value={number} size="small" />)}
                      {lottery.weeklyHotNumbers.length === 0 && (
                        <span className="noCardData">Sin datos suficientes para esta semana ISO.</span>
                      )}
                    </div>
                  </div>

                  <div className="pairRow">
                    <span>Parejas recurrentes en semanas equivalentes</span>
                    <small style={{ display: "block", margin: "6px 0 10px", lineHeight: 1.45 }}>
                      Soporte conjunto en al menos 2 de las 3 semanas históricas. No significa necesariamente que ambos números hayan salido juntos en un mismo sorteo.
                    </small>
                    <div style={{ display: "grid", gap: 7 }}>
                      {lottery.pairs.map((pair) => (
                        <div
                          key={pair.pair}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 10px",
                            border: "1px solid rgba(17,58,44,.1)",
                            borderRadius: 10,
                          }}
                        >
                          <b>{pair.pair}</b>
                          <small style={{ textAlign: "right" }}>
                            {pair.weekSupport}/3 semanas · {pair.sharedYears.join(" · ")}
                            {pair.exactDrawCount > 0
                              ? ` · juntos en ${pair.exactDrawCount} sorteo${pair.exactDrawCount === 1 ? "" : "s"}`
                              : " · sin coaparición exacta"}
                          </small>
                        </div>
                      ))}
                    </div>
                    {lottery.pairs.length === 0 && (
                      <small>No se detectaron pares con soporte conjunto en 2 o más semanas históricas.</small>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <section style={evaluationStyles.section} aria-labelledby="real-tracking-title">
              <div style={evaluationStyles.header}>
                <div>
                  <span className="sectionKicker">SEGUIMIENTO REAL</span>
                  <h3 id="real-tracking-title" style={evaluationStyles.title}>
                    Resultado observado vs. snapshot congelado
                  </h3>
                </div>
                <button
                  style={evaluationStyles.refreshButton}
                  onClick={() => void loadEvaluations(result.selectedDate)}
                  disabled={evaluationLoading || result.dataStatus !== "complete"}
                >
                  {evaluationLoading ? "Actualizando…" : "Actualizar resultados reales"}
                </button>
              </div>

              <div style={evaluationStyles.notice}>
                {evaluation?.evaluations.some((item) => item.projectionKind === "retrospective_demo")
                  ? "Demostración retrospectiva: esta semana fue congelada después de haber comenzado. Sirve para comprobar el proceso y la transparencia del sistema, no para afirmar rendimiento predictivo prospectivo."
                  : "La evaluación utiliza únicamente los candidatos del snapshot congelado. Los resultados posteriores nunca recalculan ni modifican la proyección original."}
              </div>

              {evaluationError && <div className="errorBox" style={{ marginTop: 14 }}>{evaluationError}</div>}

              {evaluationLoading && !evaluation && (
                <div style={evaluationStyles.pending}>Consultando resultados reales confirmados…</div>
              )}

              {evaluation && (
                <>
                  <div style={evaluationStyles.summaryGrid}>
                    <div style={evaluationStyles.summaryCard}>
                      <b style={evaluationStyles.summaryValue}>{evaluation.summary.confirmed}</b>
                      <span style={evaluationStyles.summaryLabel}>Evaluaciones confirmadas</span>
                    </div>
                    <div style={evaluationStyles.summaryCard}>
                      <b style={{ ...evaluationStyles.summaryValue, color: "#07563f" }}>{evaluation.summary.withCoincidences}</b>
                      <span style={evaluationStyles.summaryLabel}>Con 1 o más coincidencias diarias</span>
                    </div>
                    <div style={evaluationStyles.summaryCard}>
                      <b style={{ ...evaluationStyles.summaryValue, color: "#9f341e" }}>{evaluation.summary.zeroCoincidences}</b>
                      <span style={evaluationStyles.summaryLabel}>Con 0 coincidencias diarias</span>
                    </div>
                    <div style={evaluationStyles.summaryCard}>
                      <b style={evaluationStyles.summaryValue}>{evaluation.summary.pending}</b>
                      <span style={evaluationStyles.summaryLabel}>Resultados pendientes</span>
                    </div>
                    {evaluation.summary.reviewRequired > 0 && (
                      <div style={evaluationStyles.summaryCard}>
                        <b style={{ ...evaluationStyles.summaryValue, color: "#9f341e" }}>{evaluation.summary.reviewRequired}</b>
                        <span style={evaluationStyles.summaryLabel}>Requieren revisión</span>
                      </div>
                    )}
                  </div>

                  <div style={evaluationStyles.performancePanel}>
                    <h4 style={evaluationStyles.performanceTitle}>HIT semanal acumulado</h4>
                    <p style={evaluationStyles.performanceIntro}>
                      Cuenta en cuántos sorteos confirmados apareció al menos un número del ranking semanal congelado. El denominador es la cantidad de sorteos ya evaluados de cada lotería.
                    </p>
                    <div style={evaluationStyles.performanceTableWrap}>
                      <table style={evaluationStyles.performanceTable}>
                        <thead>
                          <tr>
                            <th style={evaluationStyles.performanceTh}>Lotería</th>
                            <th style={evaluationStyles.performanceTh}>Evaluados</th>
                            <th style={evaluationStyles.performanceTh}>HIT@5</th>
                            <th style={evaluationStyles.performanceTh}>HIT@10</th>
                            <th style={evaluationStyles.performanceTh}>HIT@15</th>
                          </tr>
                        </thead>
                        <tbody>
                          {weeklyPerformance.map((item) => (
                            <tr key={item.slug}>
                              <td style={evaluationStyles.performanceTd}><b>{item.name}</b></td>
                              <td style={evaluationStyles.performanceTd}>{item.confirmed}</td>
                              <td style={evaluationStyles.performanceTd}>{formatHitRate(item.hitTop5, item.confirmed)}</td>
                              <td style={evaluationStyles.performanceTd}>{formatHitRate(item.hitTop10, item.confirmed)}</td>
                              <td style={evaluationStyles.performanceTd}>{formatHitRate(item.hitTop15, item.confirmed)}</td>
                            </tr>
                          ))}
                          {activeTab === "all" && (
                            <tr>
                              <td style={{ ...evaluationStyles.performanceTd, fontWeight: 800 }}>TOTAL</td>
                              <td style={{ ...evaluationStyles.performanceTd, fontWeight: 800 }}>{weeklyPerformanceTotal.confirmed}</td>
                              <td style={{ ...evaluationStyles.performanceTd, fontWeight: 800 }}>{formatHitRate(weeklyPerformanceTotal.hitTop5, weeklyPerformanceTotal.confirmed)}</td>
                              <td style={{ ...evaluationStyles.performanceTd, fontWeight: 800 }}>{formatHitRate(weeklyPerformanceTotal.hitTop10, weeklyPerformanceTotal.confirmed)}</td>
                              <td style={{ ...evaluationStyles.performanceTd, fontWeight: 800 }}>{formatHitRate(weeklyPerformanceTotal.hitTop15, weeklyPerformanceTotal.confirmed)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p style={evaluationStyles.performanceIntro}>
                      HIT@5 está contenido dentro de HIT@10 y HIT@15. No son aciertos independientes y no deben sumarse entre sí.
                    </p>
                  </div>

                  {evaluationDates.map((date) => {
                    const rows = visibleEvaluations.filter((item) => item.date === date);
                    const dayName = rows[0]?.day ?? "";
                    return (
                      <div style={evaluationStyles.dayBlock} key={date}>
                        <div style={evaluationStyles.dayHeader}>
                          <h4 style={evaluationStyles.dayTitle}>{dayName}</h4>
                          <span style={evaluationStyles.dayDate}>{formatEvaluationDate(date)}</span>
                        </div>
                        <div style={evaluationStyles.cards}>
                          {rows.map((row) => {
                            const appearance = statusAppearance(row);
                            return (
                              <article style={evaluationStyles.card} key={`${row.predictionId}-${row.date}`}>
                                <div style={evaluationStyles.cardTop}>
                                  <span style={evaluationStyles.lottery}>{row.lotteryName}</span>
                                  <span
                                    style={{
                                      ...evaluationStyles.status,
                                      background: appearance.background,
                                      color: appearance.color,
                                    }}
                                  >
                                    {appearance.text}
                                  </span>
                                </div>

                                <div style={evaluationStyles.label}>Candidatos diarios publicados</div>
                                <div style={evaluationStyles.numberRow}>
                                  {row.dailyCandidates.map((number) => (
                                    <span style={evaluationStyles.number} key={`${row.date}-${row.lottery}-${number}`}>
                                      {number}
                                    </span>
                                  ))}
                                </div>

                                <div style={evaluationStyles.label}>Resultado real</div>
                                {row.result ? (
                                  <div style={evaluationStyles.numberRow}>
                                    {row.result.map((number, index) => (
                                      <span style={evaluationStyles.resultNumber} key={`${row.date}-${row.lottery}-r-${index}`}>
                                        {number}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={evaluationStyles.pending}>Resultado pendiente de confirmación</div>
                                )}

                                {row.status === "confirmed" && row.coincidenceCount === 0 && (
                                  <div style={evaluationStyles.zero}>NINGUNA · 0 coincidencias</div>
                                )}
                                {row.status === "confirmed" && row.coincidenceCount > 0 && (
                                  <div style={evaluationStyles.hit}>
                                    {row.coincidences.map((match) => `${match.number} (P${match.position})`).join(" · ")} · {row.coincidenceCount} coincidencia{row.coincidenceCount === 1 ? "" : "s"}
                                  </div>
                                )}
                                {row.status === "review_required" && (
                                  <div style={evaluationStyles.zero}>{row.reviewNote ?? "La fuente cambió un resultado previamente confirmado."}</div>
                                )}

                                {row.status === "confirmed" && (
                                  <div style={evaluationStyles.metrics}>
                                    <span style={evaluationStyles.metric}>Hit semanal @5: {row.hitTop5 ? "SÍ" : "NO"}</span>
                                    <span style={evaluationStyles.metric}>@10: {row.hitTop10 ? "SÍ" : "NO"}</span>
                                    <span style={evaluationStyles.metric}>@15: {row.hitTop15 ? "SÍ" : "NO"}</span>
                                  </div>
                                )}

                                <p style={evaluationStyles.footerNote}>{row.comparisonBasis}</p>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  <p style={evaluationStyles.footerNote}>
                    Regla de evaluación: {evaluation.evaluationRule} La comparación diaria principal usa los 5 candidatos diarios congelados; Hit@5/@10/@15 semanal se muestra por separado.
                  </p>
                </>
              )}
            </section>

            <p className="generatedAt">
              Análisis generado el {new Date(result.generatedAt).toLocaleString("es-DO", { dateStyle: "long", timeStyle: "short" })}
            </p>
          </>
        )}
      </section>
    </main>
  );
}