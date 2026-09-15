import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("compiled client contains the laboratory controls and baselines", async () => {
  const assetsDirectory = new URL("../dist/client/assets/", import.meta.url);
  const files = await readdir(assetsDirectory);
  const pageBundle = files.find((file) => /^page-.*\.js$/.test(file));
  assert.ok(pageBundle, "The page client bundle was not generated.");

  const bundle = await readFile(new URL(pageBundle, assetsDirectory), "utf8");
  assert.match(bundle, /Generar predicciones/);
  assert.match(bundle, /Ejecutar backtest/);
  assert.match(bundle, /Base del proyecto/);
  assert.match(bundle, /Archivo CSV/);
  assert.match(bundle, /Frecuencia simple/);
  assert.match(bundle, /Baseline de azar/);
  assert.match(bundle, /STAT-V1\.0, sin pesos ajustados/);
  assert.match(bundle, /no garantiza premios/i);
});

test("initial state is empty and no effect runs an analysis on mount", async () => {
  const [page, laboratory] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/BacktestLab.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /useState<PredictionResponse \| null>\(null\)/);
  assert.match(laboratory, /useState<BacktestResult \| null>\(null\)/);
  assert.match(laboratory, /No hay resultados calculados/);
  assert.doesNotMatch(page, /useEffect/);
  assert.doesNotMatch(laboratory, /useEffect/);
});

test("production metadata identifies the statistical laboratory", async () => {
  const assetsDirectory = new URL("../dist/client/assets/", import.meta.url);
  const [layout, files] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readdir(assetsDirectory),
  ]);
  const cssBundle = files.find((file) => /^index-.*\.css$/.test(file));
  assert.match(layout, /Nexo Loto \| Laboratorio estadístico/);
  assert.match(layout, /baselines de azar/);
  assert.ok(cssBundle, "The production CSS bundle was not generated.");
  assert.match(
    await readFile(new URL(cssBundle, assetsDirectory), "utf8"),
    /\.backtestLab/,
  );
});
