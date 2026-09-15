# STAT-V1.0 — especificación matemática

## Objetivo

STAT-V1.0 ordena números `00`–`99` por lotería usando exclusivamente resultados reales de la misma semana ISO de los tres años anteriores.

Para una semana objetivo `W` del año ISO `Y`:

```text
Histórico = W(Y-3) + W(Y-2) + W(Y-1)
```

Cada semana es lunes–domingo. Con tres loterías independientes, cada ranking se calcula por separado.

STAT-V1.0 no usa resultados de la propia semana objetivo, frecuencia mensual, recencia, otras semanas ni datos simulados.

## Datos mínimos

Por cada lotería se exigen las tres semanas históricas completas:

```text
3 años × 7 días = 21 sorteos
21 sorteos × 3 posiciones = 63 observaciones numéricas
```

Si falta un día de cualquiera de las tres semanas, la lotería se marca como datos insuficientes y no debe presentarse como una proyección completa.

## Variables por número

Para cada número `n` se calculan estas cantidades observadas.

### 1. Frecuencia total `F(n)`

Número de apariciones de `n` en P1, P2 o P3 dentro de los 21 sorteos equivalentes.

### 2. Soporte anual `Y(n)`

Cantidad de los tres años históricos en los que `n` aparece al menos una vez.

Rango:

```text
0 ≤ Y(n) ≤ 3
```

### 3. Recurrencia por día equivalente `D(n)`

Cantidad de días de la semana —lunes a domingo— en los que `n` aparece en al menos dos de los tres años históricos equivalentes.

Rango:

```text
0 ≤ D(n) ≤ 7
```

### 4. Recurrencia exacta de posición `P(n)`

Se consideran 21 celdas día-posicion:

```text
lunes/P1, lunes/P2, lunes/P3, ... domingo/P3
```

`P(n)` es la cantidad de esas celdas en las que `n` aparece en la misma posición en al menos dos de los tres años históricos.

Rango:

```text
0 ≤ P(n) ≤ 21
```

También se conservan los conteos brutos por posición `P1`, `P2` y `P3` para auditoría y explicación.

## Orden del ranking

STAT-V1.0 no mezcla señales mediante pesos escogidos manualmente. Usa un orden lexicográfico determinista.

Se ordena de mayor a menor por:

1. `F(n)` — frecuencia total;
2. `Y(n)` — soporte anual;
3. `D(n)` — recurrencia por día equivalente;
4. `P(n)` — recurrencia exacta de posición.

Si dos números siguen completamente empatados después de esas cuatro variables, se usa el número ascendente solamente como desempate técnico reproducible. Ese último desempate no representa evidencia estadística.

## Índice relativo mostrado

El valor `0–100` mostrado en pantalla es únicamente un índice de frecuencia relativa:

```text
score(n) = 100 × F(n) / max(F)
```

redondeado al entero más cercano.

Dos números con la misma frecuencia total pueden tener el mismo `score` aunque uno aparezca antes en el ranking por los criterios de desempate estadístico.

El `score` no es una probabilidad de premio ni una estimación de probabilidad futura.

## Ranking diario equivalente

Para el día seleccionado de la semana objetivo se usan únicamente los tres sorteos del mismo día equivalente de los años históricos.

Ejemplo para un lunes:

```text
lunes de W(Y-3)
lunes de W(Y-2)
lunes de W(Y-1)
```

Eso produce exactamente 9 observaciones numéricas como máximo y, por tanto, como máximo 9 números distintos. La interfaz no debe etiquetar esta lista como “15 fuertes”.

El orden diario aplica la misma lógica determinista sobre ese subconjunto.

## Top 5 y Top 15

- `Top 5`: candidatos principales publicados.
- `Top 15`: ranking semanal ampliado para evaluación Hit@15.

Ambos salen del mismo ranking STAT-V1.0. No son modelos diferentes.

## Protocolo de backtesting

Para evaluar un año ISO objetivo `Y`, cada semana `W` se reconstruye sin usar
resultados de `Y` en el ranking:

```text
entrenamiento(W,Y) = W(Y-3) ∪ W(Y-2) ∪ W(Y-1)
evaluación(W,Y)    = W(Y)
```

La unidad evaluada es un sorteo real de una lotería en una fecha. Una semana
solamente entra al backtest cuando cada año histórico contiene sus siete
sorteos esperados para esa lotería. Las semanas omitidas se cuentan y se
muestran; no se completan con fechas cercanas ni con valores simulados.

Para cada corte `k ∈ {5,10,15}` se calcula:

```text
Hit@k = sorteos con al menos un número real en el Top k / sorteos evaluados
```

Los tres cortes están anidados. No deben sumarse entre sí.

## Baselines

### Selección aleatoria

El baseline principal selecciona `k` números distintos uniformemente y sin
reemplazo del universo `00`–`99`. Si un sorteo contiene `d` números reales
distintos, la probabilidad exacta de al menos una coincidencia es:

```text
p_azar(k,d) = 1 - C(100-d,k) / C(100,k)
```

La expectativa acumulada es la suma de `p_azar` sobre todos los sorteos. No se
usa una simulación Monte Carlo, por lo que el resultado no depende de una
semilla aleatoria.

### Frecuencia histórica simple

Como segundo baseline, los números se ordenan solamente por `F(n)` descendente
y por número ascendente en caso de empate. Permite medir si los desempates de
STAT-V1.0 añaden rendimiento sobre el conteo bruto.

## Incertidumbre y criterio de lectura

El laboratorio informa el intervalo de Wilson al 95 % para `Hit@k` y un valor
`p` unilateral calculado con la distribución Poisson-binomial, porque la
probabilidad aleatoria puede variar si un sorteo repite números.

Una ventaja se etiqueta únicamente como retrospectiva cuando:

```text
n ≥ 30
p < 0.05 / 3
límite inferior del IC 95 % > baseline aleatorio
```

La división por tres corrige la comparación simultánea de Hit@5, Hit@10 y
Hit@15. Superar este criterio en el backtest no demuestra capacidad predictiva
prospectiva: el resultado debe confirmarse en datos posteriores no utilizados
para escoger ni modificar el método.

## Parejas recurrentes

Las parejas que aparecen juntas en un mismo sorteo se mantienen como información exploratoria. En STAT-V1.0 tienen peso cero y no modifican el ranking.

## Versionado

Cualquier cambio en:

- universo histórico;
- orden de desempate;
- definición de recurrencia;
- fórmula del índice;
- cantidad de años;
- incorporación de nuevas señales al ranking;

requiere una nueva versión del método. Una proyección congelada con STAT-V1.0 nunca debe recalcularse con una versión posterior.
