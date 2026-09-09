"use client";

import { useMemo, useState } from "react";

type LotteryPrediction = {
  id: string;
  name: string;
  shortName: string;
  accent: string;
  candidates: Array<{ number: string; score: number; signal: string }>;
  dailyHotNumbers: string[];
  monthlyHotNumbers: string[];
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
  pairs: string[];
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

const LOTTERY_TABS = [
  { id: "all", label: "Todas" },
  { id: "nacional", label: "Nacional" },
  { id: "leidsa", label: "Leidsa" },
  { id: "loteka", label: "Loteka" },
];

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

export default function Home() {
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(currentDominicanDate);

  const visibleLotteries = useMemo(() => {
    if (!result) return [];
    return activeTab === "all"
      ? result.lotteries
      : result.lotteries.filter((lottery) => lottery.id === activeTab);
  }, [activeTab, result]);

  async function generatePredictions(date = selectedDate) {
    setLoading(true);
    setError("");
    try {
      // La sincronización actualiza la base disponible. El motor de análisis usa
      // exclusivamente las semanas históricas equivalentes, no resultados de la
      // propia semana objetivo.
      await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      }).catch(() => null);

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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  function clearScreen() {
    setResult(null);
    setError("");
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
              <b>{result.dataStatus === "complete" ? "DATOS REALES" : "SIN SIMULACIÓN"}</b>
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
                Cada columna compara el mismo día de la semana ISO en 2023, 2024 y 2025.
                La estrella señala un número reforzado por la frecuencia semanal o diaria.
              </p>

              {visibleLotteries.map((lottery) => (
                <div className="lotteryWeek" key={`${lottery.id}-week`}>
                  <div className="lotteryWeekTitle" style={{ "--accent": lottery.accent } as React.CSSProperties}>
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
                <article className="lotteryCard" key={lottery.id} style={{ "--accent": lottery.accent } as React.CSSProperties}>
                  <div className="cardTop">
                    <div>
                      <span className="lotteryCode">{lottery.shortName}</span>
                      <h3>{lottery.name}</h3>
                    </div>
                    <span className="signalBadge">Semana ISO {result.isoWeek}</span>
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
                      <span>15 fuertes del día equivalente</span>
                      <small>{result.dayLabel}</small>
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
                    <div>{lottery.pairs.map((pair) => <b key={pair}>{pair}</b>)}</div>
                    {lottery.pairs.length === 0 && <small>Sin parejas recurrentes verificadas.</small>}
                  </div>
                </article>
              ))}
            </div>

            <p className="generatedAt">
              Análisis generado el {new Date(result.generatedAt).toLocaleString("es-DO", { dateStyle: "long", timeStyle: "short" })}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
