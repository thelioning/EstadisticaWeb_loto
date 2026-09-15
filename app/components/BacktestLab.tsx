"use client";

import { useMemo, useState } from "react";
import {
  runBacktest,
  type BacktestDraw,
  type BacktestMetric,
  type BacktestResult,
} from "../../lib/backtest";
import { parseBacktestCsv } from "../../lib/backtest-csv";

type DataSource = "project" | "csv";

function percent(value: number, digits = 1) {
  return new Intl.NumberFormat("es-DO", {
    style: "percent",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function signedPoints(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} pp`;
}

function pValue(value: number) {
  if (value < 0.001) return "< 0.001";
  return value.toFixed(3);
}

function evidenceLabel(metric: BacktestMetric) {
  if (metric.evidence === "small_sample") return "Muestra pequeña";
  if (metric.evidence === "advantage_in_backtest") return "Ventaja retrospectiva";
  return "No demostrada";
}

function downloadCsvTemplate() {
  const content = [
    "fecha,loteria,p1,p2,p3",
    "2022-01-03,nacional,01,24,78",
    "2022-01-03,leidsa,14,52,90",
    "2022-01-03,loteka,07,31,66",
  ].join("\n");
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "plantilla-backtest-nexo-loto.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function MetricCard({ metric }: { metric: BacktestMetric }) {
  const maximum = Math.max(
    metric.hitRate,
    metric.randomHitRate,
    metric.simpleFrequencyRate,
    0.01,
  );
  const width = (value: number) => `${Math.max(2, (value / maximum) * 100)}%`;

  return (
    <article className="metricCard">
      <div className="metricCardHeader">
        <div>
          <span>HIT@{metric.k}</span>
          <strong>{percent(metric.hitRate)}</strong>
        </div>
        <span className={`evidenceBadge evidence-${metric.evidence}`}>
          {evidenceLabel(metric)}
        </span>
      </div>

      <div className="comparisonBars" aria-label={`Comparación Hit a ${metric.k}`}>
        <div>
          <span>STAT-V1.0</span>
          <i><b style={{ width: width(metric.hitRate) }} /></i>
          <strong>{percent(metric.hitRate)}</strong>
        </div>
        <div>
          <span>Frecuencia simple</span>
          <i><b className="frequencyBar" style={{ width: width(metric.simpleFrequencyRate) }} /></i>
          <strong>{percent(metric.simpleFrequencyRate)}</strong>
        </div>
        <div>
          <span>Azar</span>
          <i><b className="randomBar" style={{ width: width(metric.randomHitRate) }} /></i>
          <strong>{percent(metric.randomHitRate)}</strong>
        </div>
      </div>

      <dl className="metricDetails">
        <div><dt>Aciertos</dt><dd>{metric.hits}/{metric.evaluatedDraws}</dd></div>
        <div><dt>Diferencia vs. azar</dt><dd>{signedPoints(metric.differenceFromRandomPoints)}</dd></div>
        <div><dt>IC 95 %</dt><dd>{percent(metric.confidenceLow)}–{percent(metric.confidenceHigh)}</dd></div>
        <div><dt>Valor p</dt><dd>{pValue(metric.pValueVsRandom)}</dd></div>
      </dl>
    </article>
  );
}

export default function BacktestLab() {
  const [source, setSource] = useState<DataSource>("project");
  const [targetYear, setTargetYear] = useState(2025);
  const [csvDraws, setCsvDraws] = useState<BacktestDraw[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvRejected, setCsvRejected] = useState(0);
  const [csvDuplicates, setCsvDuplicates] = useState(0);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const requiredYears = useMemo(
    () => [targetYear - 3, targetYear - 2, targetYear - 1, targetYear],
    [targetYear],
  );

  function changeSource(nextSource: DataSource) {
    setSource(nextSource);
    setResult(null);
    setError("");
  }

  async function loadCsv(file: File | undefined) {
    setResult(null);
    setError("");
    setCsvDraws([]);
    setCsvFileName("");
    setCsvRejected(0);
    setCsvDuplicates(0);
    if (!file) return;

    try {
      const parsed = parseBacktestCsv(await file.text());
      setCsvDraws(parsed.draws);
      setCsvFileName(file.name);
      setCsvRejected(parsed.rejectedRows);
      setCsvDuplicates(parsed.duplicateRows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible leer el CSV.");
    }
  }

  async function executeBacktest() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 0));

      if (source === "csv") {
        if (csvDraws.length === 0) {
          throw new Error("Selecciona primero un archivo CSV válido.");
        }
        setResult(runBacktest(csvDraws, targetYear));
        return;
      }

      const response = await fetch("/api/backtests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetYear }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (BacktestResult & { source?: string })
        | { error?: string }
        | null;

      if (!response.ok || !payload || "error" in payload) {
        throw new Error(
          payload && "error" in payload && payload.error
            ? payload.error
            : `No fue posible ejecutar el backtest (HTTP ${response.status}).`,
        );
      }
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible ejecutar el backtest.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="backtestLab" id="backtest" aria-labelledby="backtest-title">
      <div className="labHeader">
        <div>
          <span className="sectionKicker">LABORATORIO DE VALIDACIÓN</span>
          <h2 id="backtest-title">¿Las recurrencias superan al azar?</h2>
          <p>
            Reconstruye cada semana del año objetivo usando únicamente los tres años anteriores.
            El resultado se compara con selección aleatoria y frecuencia histórica simple.
          </p>
        </div>
        <span className={`runStatus ${result ? `run-${result.verdict}` : "run-idle"}`}>
          {result ? "Backtest ejecutado" : "Sin ejecutar"}
        </span>
      </div>

      <div className="labControls">
        <fieldset>
          <legend>Fuente de datos</legend>
          <div className="sourceChoice">
            <button
              type="button"
              className={source === "project" ? "selectedSource" : ""}
              aria-pressed={source === "project"}
              onClick={() => changeSource("project")}
            >
              Base del proyecto
              <small>Resultados ya conservados en Nexo Loto</small>
            </button>
            <button
              type="button"
              className={source === "csv" ? "selectedSource" : ""}
              aria-pressed={source === "csv"}
              onClick={() => changeSource("csv")}
            >
              Archivo CSV
              <small>Se analiza localmente en este navegador</small>
            </button>
          </div>
        </fieldset>

        <label className="yearControl">
          Año que se comprobará
          <input
            type="number"
            min="2000"
            max="2100"
            value={targetYear}
            onChange={(event) => {
              setTargetYear(Number(event.target.value));
              setResult(null);
            }}
          />
          <small>Entrena con {requiredYears.slice(0, 3).join(" + ")} y evalúa {targetYear}.</small>
        </label>

        {source === "csv" && (
          <div className="csvControl">
            <label htmlFor="backtest-csv">Datos históricos CSV</label>
            <input
              id="backtest-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void loadCsv(event.target.files?.[0])}
            />
            <div className="csvMeta">
              {csvFileName ? (
                <span>
                  <b>{csvFileName}</b> · {csvDraws.length} filas válidas
                  {csvRejected > 0 ? ` · ${csvRejected} rechazadas` : ""}
                  {csvDuplicates > 0 ? ` · ${csvDuplicates} duplicadas` : ""}
                </span>
              ) : (
                <span>Columnas requeridas: fecha, loteria, p1, p2, p3.</span>
              )}
              <button type="button" onClick={downloadCsvTemplate}>Descargar plantilla</button>
            </div>
          </div>
        )}

        <div className="runControls">
          <button
            className="runButton"
            type="button"
            onClick={() => void executeBacktest()}
            disabled={loading || (source === "csv" && csvDraws.length === 0)}
          >
            {loading ? "Calculando…" : "Ejecutar backtest"}
          </button>
          <button
            className="clearLabButton"
            type="button"
            disabled={!result && !error}
            onClick={() => {
              setResult(null);
              setError("");
            }}
          >
            Limpiar resultados
          </button>
        </div>
      </div>

      {error && <div className="errorBox labError" role="alert">{error}</div>}

      {!result && !loading && !error && (
        <div className="labEmpty">
          <span>0</span>
          <div>
            <strong>No hay resultados calculados</strong>
            <p>El laboratorio permanece vacío hasta que presiones “Ejecutar backtest”.</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="labLoading" role="status">
          <i /><span>Reconstruyendo semanas sin usar datos futuros…</span>
        </div>
      )}

      {result && (
        <div className="labResults" aria-live="polite">
          <div className={`verdict verdict-${result.verdict}`}>
            <div>
              <span>LECTURA DEL EXPERIMENTO</span>
              <strong>{result.verdictLabel}</strong>
            </div>
            <dl>
              <div><dt>Sorteos evaluados</dt><dd>{result.evaluatedDraws}</dd></div>
              <div><dt>Semanas·lotería válidas</dt><dd>{result.weeksEvaluated}</dd></div>
              <div><dt>Omitidas por faltantes</dt><dd>{result.weeksSkippedForHistory}</dd></div>
              <div><dt>Método</dt><dd>{result.methodVersion}</dd></div>
            </dl>
          </div>

          {result.evaluatedDraws > 0 ? (
            <>
              <div className="metricGrid">
                {result.metrics.map((metric) => (
                  <MetricCard key={metric.k} metric={metric} />
                ))}
              </div>

              <div className="breakdownPanel">
                <div>
                  <h3>Detalle por lotería</h3>
                  <p>HIT significa que al menos uno de los tres números reales apareció en el Top K semanal.</p>
                </div>
                <div className="breakdownTableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Lotería</th>
                        <th>Muestra</th>
                        <th>Corte</th>
                        <th>STAT-V1.0</th>
                        <th>Frecuencia</th>
                        <th>Azar esperado</th>
                        <th>Δ azar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.lotteries.flatMap((lottery) =>
                        lottery.metrics.map((metric) => (
                          <tr key={`${lottery.lottery}-${metric.k}`}>
                            <td><b>{lottery.lotteryName}</b></td>
                            <td>{lottery.evaluatedDraws}</td>
                            <td>HIT@{metric.k}</td>
                            <td>{percent(metric.hitRate)}</td>
                            <td>{percent(metric.simpleFrequencyRate)}</td>
                            <td>{percent(metric.randomHitRate)}</td>
                            <td className={metric.differenceFromRandomPoints > 0 ? "positiveDelta" : ""}>
                              {signedPoints(metric.differenceFromRandomPoints)}
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="insufficientPanel">
              <strong>No se fabricó un resultado con datos incompletos.</strong>
              <p>
                Para cada lotería y semana se requieren 21 sorteos históricos: siete días de cada uno de los tres años anteriores. Carga un CSV completo para {requiredYears.join(", ")} o conserva más resultados en la base del proyecto.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="methodSpec" id="metodo">
        <div className="methodSpecHeader">
          <div>
            <span className="sectionKicker">ESPECIFICACIÓN VERIFICABLE</span>
            <h3>STAT-V1.0, sin pesos ajustados</h3>
          </div>
          <code>Y−3, Y−2, Y−1 → Y</code>
        </div>
        <div className="formulaGrid">
          <article>
            <span>Frecuencia</span>
            <code>F(n) = Σ 1[x = n]</code>
            <p>Apariciones de n en P1, P2 o P3 dentro de las tres semanas ISO equivalentes.</p>
          </article>
          <article>
            <span>Orden</span>
            <code>↓F, ↓Y, ↓D, ↓P, ↑n</code>
            <p>Desempate lexicográfico: soporte anual, recurrencia diaria y recurrencia de posición.</p>
          </article>
          <article>
            <span>Baseline de azar</span>
            <code>1 − C(100−d,k) / C(100,k)</code>
            <p>d es la cantidad de números reales distintos y k la cantidad de candidatos publicados.</p>
          </article>
          <article>
            <span>Criterio exploratorio</span>
            <code>p &lt; 0.05/3 e IC₉₅ inferior &gt; azar</code>
            <p>Una señal retrospectiva no se presenta como poder predictivo prospectivo.</p>
          </article>
        </div>
        <p className="methodFootnote">
          El índice 0–100 de candidatos es frecuencia relativa, no probabilidad de premio. Las semanas incompletas se omiten y se contabilizan; nunca se sustituyen por fechas cercanas.
        </p>
      </div>

      <div className="responsibleNotice">
        Los resultados históricos pueden mostrar patrones por azar. Este laboratorio mide rendimiento observado; no garantiza premios ni permite conocer un sorteo futuro.
      </div>
    </section>
  );
}
