"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type LotteryPrediction = {
  id: string;
  name: string;
  shortName: string;
  accent: string;
  candidates: Array<{ number: string; score: number; signal: string }>;
  dailyHotNumbers: string[];
  monthlyHotNumbers: string[];
  pairs: string[];
};

type PredictionResponse = {
  generatedAt: string;
  dataThrough: string;
  weekLabel: string;
  weekRange: string;
  targetYear: number;
  monthLabel: string;
  dayLabel: string;
  historicalYears: number[];
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

export default function Home() {
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const initialRefreshStarted = useRef(false);

  const visibleLotteries = useMemo(() => {
    if (!result) return [];
    return activeTab === "all"
      ? result.lotteries
      : result.lotteries.filter((lottery) => lottery.id === activeTab);
  }, [activeTab, result]);

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

  async function generatePredictions() {
    setLoading(true);
    setError("");
    try {
      // La sincronización actualiza la base disponible. Si la fuente todavía no
      // publicó el sorteo, el análisis puede continuar con el último dato válido.
      await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: currentDominicanDate() }),
      }).catch(() => null);

      const response = await fetch("/api/predictions/generate", { method: "POST" });
      if (!response.ok) throw new Error("No fue posible generar el análisis.");
      setResult((await response.json()) as PredictionResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialRefreshStarted.current) return;
    initialRefreshStarted.current = true;
    void generatePredictions();
  }, []);

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
            Compara los tres años anteriores por día, por mes y por semanas de
            lunes a domingo para descubrir las señales estadísticas vigentes.
          </p>
          <div className="heroActions">
            <button className="primaryButton" onClick={generatePredictions} disabled={loading}>
              <span className="spark">✦</span>
              {loading ? "Actualizando…" : "Actualizar análisis"}
            </button>
            <button className="secondaryButton" onClick={clearScreen} disabled={!result && !error}>
              Limpiar pantalla
            </button>
          </div>
          <p className="finePrint">Análisis orientativo. Los sorteos son eventos aleatorios.</p>
        </div>

        <aside className="weekCard">
          <span className="weekLabel">SEMANA OBJETIVO</span>
          <strong>{result?.weekRange ?? "LUNES — DOMINGO"}</strong>
          <span className="weekYear">{result?.targetYear ?? new Date().getFullYear()}</span>
          <div className="weekDivider" />
          <div className="yearsRow">
            <span>BASE HISTÓRICA</span>
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

        {!result && !loading && !error && (
          <div className="emptyState">
            <div className="orbit">
              <span>03</span><span>51</span><span>87</span>
              <div className="orbitCenter">✦</div>
            </div>
            <h3>Tu lectura semanal comienza aquí</h3>
            <p>Genera el análisis para ver números calientes, candidatos principales y parejas recurrentes.</p>
          </div>
        )}

        {loading && (
          <div className="loadingState">
            <div className="loadingBars"><i /><i /><i /><i /></div>
            <h3>Procesando señales históricas</h3>
            <p>Combinando mes, semana equivalente, día y posición…</p>
          </div>
        )}

        {error && <div className="errorBox">{error}</div>}

        {result && (
          <>
            <div className="summaryStrip">
              <span><b>{result.weekLabel}</b> Semana de lunes a domingo</span>
              <span><b>{result.dataThrough}</b> Actualizado el</span>
              <span><b>{result.historicalYears.join(" · ")}</b> Base histórica móvil</span>
              <span><b>{result.dayLabel}</b> Análisis del día</span>
              <span><b>{result.monthLabel}</b> Análisis del mes</span>
            </div>

            <div className="lotteryGrid">
              {visibleLotteries.map((lottery) => (
                <article className="lotteryCard" key={lottery.id} style={{ "--accent": lottery.accent } as React.CSSProperties}>
                  <div className="cardTop">
                    <div>
                      <span className="lotteryCode">{lottery.shortName}</span>
                      <h3>{lottery.name}</h3>
                    </div>
                    <span className="signalBadge">Señal activa</span>
                  </div>

                  <div className="cardSection">
                    <div className="sectionTitle">
                      <span>Candidatos principales</span>
                      <small>Puntaje / 100</small>
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
                    </div>
                  </div>

                  <div className="cardSection hotSection">
                    <div className="sectionTitle">
                      <span>15 calientes del día</span>
                      <small>{result.dayLabel}</small>
                    </div>
                    <div className="ballCloud">
                      {lottery.dailyHotNumbers.map((number) => <Ball key={number} value={number} size="small" />)}
                    </div>
                  </div>

                  <div className="cardSection monthHotSection">
                    <div className="sectionTitle">
                      <span>15 calientes del mes</span>
                      <small>{result.historicalYears.join("—")}</small>
                    </div>
                    <div className="ballCloud">
                      {lottery.monthlyHotNumbers.map((number) => <Ball key={number} value={number} size="small" />)}
                    </div>
                  </div>

                  <div className="pairRow">
                    <span>Parejas recurrentes</span>
                    <div>{lottery.pairs.map((pair) => <b key={pair}>{pair}</b>)}</div>
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
