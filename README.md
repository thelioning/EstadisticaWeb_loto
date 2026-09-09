# Nexo Loto — laboratorio estadístico de quinielas dominicanas

## 1. Propósito

Nexo Loto es una aplicación web para recopilar, almacenar y analizar resultados históricos de tres sorteos dominicanos:

- Quiniela de la Lotería Nacional.
- Quiniela Palé de Leidsa.
- Quiniela Palé de Loteka.

El objetivo del proyecto no es afirmar que los sorteos pueden predecirse. El objetivo es construir un laboratorio reproducible que permita comprobar si determinadas recurrencias históricas producen una ventaja medible fuera de muestra frente a una selección aleatoria y frente a métodos estadísticos más simples.

La hipótesis nula del proyecto es:

```text
H0: el ranking estadístico no tiene una ventaja predictiva fuera de muestra
    frente a una selección aleatoria comparable.
```

La hipótesis alternativa es:

```text
H1: el ranking estadístico mejora una o más métricas previamente definidas
    sobre datos que no fueron usados para diseñar ni ajustar el método.
```

Ningún puntaje mostrado por la aplicación debe interpretarse como probabilidad de premio.

## 2. Unidad de análisis

El universo de números es:

```text
U = {00, 01, 02, ..., 99}
```

Cada sorteo almacena tres posiciones:

```text
P1 = primer número
P2 = segundo número
P3 = tercer número
```

Para cada lotería `l`, cada número `n ∈ U` recibe señales estadísticas calculadas exclusivamente con información permitida por la fecha de corte.

La aplicación producirá:

- un ranking completo de los 100 números por lotería;
- cinco candidatos principales de la semana en la interfaz inicial;
- los 15 números más frecuentes del mes;
- los 15 números más fuertes para el día de la semana seleccionado;
- información sobre posición, coincidencias y parejas recurrentes;
- datos suficientes para medir posteriormente el rendimiento real del método.

El ranking completo debe conservarse aunque la interfaz muestre solamente una parte.

## 3. Periodo objetivo y fecha de corte

La semana de análisis es de **lunes a domingo**.

Dada una fecha seleccionada `d`, se obtiene la semana que la contiene:

```text
W(d) = lunes de esa semana ... domingo de esa semana
```

Se define:

```text
Y = año del lunes de W(d)
M = mes del lunes de W(d)
H = {Y-3, Y-2, Y-1}
```

Ejemplo:

```text
Semana objetivo: 27 julio 2026 — 2 agosto 2026
Y = 2026
M = julio
H = {2023, 2024, 2025}
```

### 3.1 Corte temporal

La fecha de corte del modelo semanal es:

```text
C = lunes de la semana objetivo a las 00:00:00
    en America/Santo_Domingo
```

Ningún dato con fecha/hora `>= C` puede utilizarse para producir esa predicción semanal.

Esto se aplica también cuando el usuario consulta una semana histórica después de que sus resultados ya se conocen. El sistema debe reconstruir lo que habría sabido antes de comenzar esa semana.

Los resultados de la propia semana objetivo solo se utilizarán posteriormente para evaluar la predicción.

## 4. Años históricos

El modelo utiliza los tres años calendario inmediatamente anteriores al año objetivo:

```text
H(Y) = {Y-3, Y-2, Y-1}
```

Para una predicción de 2026:

```text
2023 + 2024 + 2025 → 2026
```

Para un backtest de 2025:

```text
2022 + 2023 + 2024 → 2025
```

Por esta razón, la base histórica necesaria para validar 2025 debe comenzar **como mínimo el 1 de enero de 2022**. Importar solamente desde 2023 permite trabajar con 2026, pero no permite realizar correctamente el backtest de 2025 planteado en este proyecto.

## 5. Definición exacta de semana histórica equivalente

No se utilizará el número de semana ISO como definición principal. Tampoco se comparará simplemente el mismo día y mes de años anteriores.

La semana equivalente se define por la **posición relativa del lunes dentro del mismo mes**.

Para el mes objetivo `M` del año `Y`, sea:

```text
L_Y(M) = lista ordenada de todos los lunes del mes M
K_Y    = cantidad de lunes del mes M
k_Y    = posición del lunes objetivo dentro de L_Y(M)
```

Se calcula su posición relativa:

```text
q = (k_Y - 1) / (K_Y - 1)
```

Si por alguna razón `K_Y = 1`, se define `q = 0`.

Para cada año histórico `h`, sea `K_h` la cantidad de lunes del mismo mes. La posición equivalente es:

```text
k_h = 1 + round(q × (K_h - 1))
```

La semana histórica equivalente de ese año comienza en el lunes `k_h` y termina el domingo siguiente. Si el domingo cae en el mes siguiente, no se recorta la semana.

### Ejemplo: última semana de julio de 2026

El 27 de julio de 2026 es el último lunes de julio. Su posición relativa es el final del mes (`q = 1`). Por tanto se selecciona el último lunes de julio de cada año histórico:

```text
2023: lunes 31 julio — domingo 6 agosto
2024: lunes 29 julio — domingo 4 agosto
2025: lunes 28 julio — domingo 3 agosto
2026: lunes 27 julio — domingo 2 agosto  ← objetivo
```

Esta regla queda fijada para `STAT-V1.0`; cualquier cambio posterior requiere una nueva versión del método.

## 6. Normalización de las señales

Las señales tienen escalas diferentes. Antes de combinarlas se transformarán a un índice relativo de `0` a `100`.

Para una señal cruda `F_j(n)` se ordenan los 100 números de mayor a menor. Los empates reciben el rango promedio.

Sea `r_j(n)` el rango del número `n`, donde el mejor rango es `1` y el peor `100`:

```text
S_j(n) = 100 × (100 - r_j(n)) / 99
```

Interpretación:

```text
100 = mejor posición relativa para esa señal
 50 = posición aproximadamente central
  0 = peor posición relativa
```

Si los 100 números empatan exactamente, todos reciben `50`.

Estos valores son índices de ranking. **No son probabilidades.**

## 7. Señales estadísticas de STAT-V1.0

### 7.1 Frecuencia mensual

Para cada lotería `l` y número `n`:

```text
F_mes(l,n) = cantidad total de apariciones de n
             en P1, P2 o P3
             durante el mes M
             de los tres años H
```

Ejemplo para julio:

```text
julio 2023 + julio 2024 + julio 2025
```

La normalización definida en la sección 6 produce:

```text
S_mes(l,n)
```

Los **15 calientes del mes** son los 15 mayores valores de `F_mes`, no los 15 mayores puntajes finales del modelo.

### 7.2 Frecuencia en semanas equivalentes

Sea `W_h` la semana equivalente del año histórico `h` calculada mediante la sección 5:

```text
F_semana(l,n) = número de apariciones de n
                en P1, P2 o P3
                dentro de W_(Y-3), W_(Y-2), W_(Y-1)
```

Su índice normalizado es:

```text
S_semana(l,n)
```

Esta señal tiene una muestra pequeña. Debe conservarse porque forma parte de la hipótesis que se quiere probar, pero su utilidad se decidirá mediante backtesting, no por intuición.

### 7.3 Frecuencia por día de la semana

Para cada día `d ∈ {lunes, martes, miércoles, jueves, viernes, sábado, domingo}`:

```text
F_dia(l,n,d) = cantidad de apariciones de n
               en P1, P2 o P3
               en todos los sorteos del día d
               durante los tres años H
```

Cada día se normaliza por separado:

```text
S_dia(l,n,d)
```

Los **15 calientes del día** se obtienen a partir de `F_dia` para el día seleccionado.

El domingo forma parte del modelo semanal `STAT-V1.0` en las mismas condiciones que los demás días.

### 7.4 Frecuencia por posición

Para cada posición `p ∈ {P1,P2,P3}`:

```text
F_pos(l,n,p) = cantidad de veces que n apareció exactamente
               en la posición p durante los tres años H
```

Se calcula un índice independiente para cada posición:

```text
S_pos(l,n,P1)
S_pos(l,n,P2)
S_pos(l,n,P3)
```

El componente de posición utilizado por el ranking semanal será:

```text
S_posicion(l,n) = max(
  S_pos(l,n,P1),
  S_pos(l,n,P2),
  S_pos(l,n,P3)
)
```

La posición que produce ese máximo se registra como **posición históricamente más fuerte**. Si existe empate, se informan las posiciones empatadas y no se inventa una preferencia.

### 7.5 Soporte entre loterías

La coincidencia entre loterías utilizada en el puntaje no será una simple coincidencia visual del mismo día, porque esa señal es demasiado escasa para funcionar de forma estable.

Primero se define para cada lotería `g`:

```text
B_g(n) = (S_mes(g,n) + S_semana(g,n)) / 2
```

Para una lotería objetivo `l`, el soporte de las otras dos loterías es:

```text
S_coincidencia(l,n) = promedio de B_g(n)
                      para todas las loterías g != l
```

Por ejemplo, el soporte externo de un número de Leidsa procede de Nacional y Loteka.

Las coincidencias literales del mismo número entre dos o tres loterías en una fecha histórica se conservarán como estadística descriptiva independiente, pero tendrán peso `0` en `STAT-V1.0` hasta demostrar utilidad fuera de muestra.

### 7.6 Recencia

Para cada lotería se toman los últimos `R = 30` sorteos completos disponibles estrictamente antes de la fecha de corte `C`:

```text
F_reciente(l,n) = cantidad de apariciones de n
                  en P1, P2 o P3
                  dentro de los últimos 30 sorteos
                  anteriores a C
```

Su índice normalizado es:

```text
S_reciente(l,n)
```

El valor `R = 30` queda fijado en `STAT-V1.0`. No puede cambiarse después de observar el resultado del backtest sin crear una nueva versión del método.

### 7.7 Parejas recurrentes

Para cada sorteo se forman las parejas no ordenadas de los tres números:

```text
{P1,P2}, {P1,P3}, {P2,P3}
```

Las parejas repetidas pueden mostrarse como información exploratoria, principalmente para el mes objetivo y las semanas equivalentes.

En `STAT-V1.0` las parejas **no modifican el puntaje de candidatos**. Su peso es `0`. Solo se incorporarán a una versión posterior si demuestran utilidad fuera de muestra.

## 8. Puntaje diario y semanal

### 8.1 Puntaje diario

Para cada día `d` de lunes a domingo:

```text
S_diario(l,n,d) =
    [ S_mes(l,n)
    + S_semana(l,n)
    + S_dia(l,n,d)
    + S_posicion(l,n)
    + S_coincidencia(l,n)
    + S_reciente(l,n) ] / 6
```

Los seis componentes tienen inicialmente el mismo peso:

```text
peso = 1/6 ≈ 0.1666667
```

No se elegirán pesos distintos antes del primer backtest. El uso de pesos iguales evita introducir preferencias subjetivas sin evidencia.

### 8.2 Puntaje semanal

El puntaje principal mostrado en la tarjeta de cada lotería será el promedio de los siete puntajes diarios:

```text
S_semanal(l,n) = promedio(
  S_diario(l,n,lunes),
  S_diario(l,n,martes),
  S_diario(l,n,miércoles),
  S_diario(l,n,jueves),
  S_diario(l,n,viernes),
  S_diario(l,n,sábado),
  S_diario(l,n,domingo)
)
```

La aplicación conserva el ranking completo de `00` a `99` según `S_semanal`.

### 8.3 Candidatos principales

La interfaz inicial mostrará los primeros **5 candidatos** de cada lotería.

Para investigación también se medirán los cortes:

```text
Top 5
Top 10
Top 15
```

El desempate del ranking semanal será determinista:

1. mayor `S_semanal`;
2. mayor `S_semana`;
3. mayor `S_mes`;
4. mayor `S_reciente`;
5. menor valor numérico (`00` antes que `01`, etc.).

No se utilizarán desempates aleatorios en el modelo.

## 9. Explicación de cada candidato

Cada candidato guardado debe poder explicar su resultado. Como mínimo se conservarán:

```text
number
ranking
score_semanal
score_mensual
score_semana_equivalente
score_dia
score_posicion
score_coincidencia
score_recencia
posicion_historicamente_mas_fuerte
dia_historicamente_mas_fuerte
method_version
data_available_through
```

La interfaz puede resumir estos datos, pero la base debe conservarlos para auditoría y backtesting.

## 10. Congelamiento de predicciones y prevención de fuga de información

Una predicción generada debe ser inmutable respecto a resultados posteriores.

Debe guardar:

```text
week_start
week_end
generated_at
data_available_through
historical_years
method_version
method_parameters
ranking completo
```

Reglas:

- ningún resultado de la semana objetivo puede participar en su propia predicción;
- una consulta histórica debe reconstruir la información disponible antes de esa semana;
- una sincronización posterior no puede recalcular silenciosamente una predicción ya guardada;
- cambiar pesos, ventanas, reglas de semana equivalente o desempates obliga a crear una nueva versión del método;
- el frontend no debe sincronizar resultados de la semana objetivo antes de generar un backtest de esa semana.

## 11. Calidad mínima de datos

No se generarán candidatos simulados para rellenar huecos.

Cada lotería debe tener configurado su calendario esperado de sorteos. La aplicación debe calcular una razón de completitud:

```text
completitud = sorteos disponibles / sorteos esperados
```

Antes de declarar un análisis como completo se requiere:

- presencia de los tres años históricos;
- semanas equivalentes completas de lunes a domingo según el calendario de la lotería;
- al menos 95 % de completitud en las ventanas históricas amplias usadas por mes, día y posición;
- 30 sorteos válidos para la señal de recencia.

Si no se cumple, la interfaz debe mostrar **datos insuficientes** y especificar qué ventana está incompleta.

## 12. Backtesting

### 12.1 Primera prueba fuera de muestra

El primer experimento formal será:

```text
Datos usados por el modelo: 2022 + 2023 + 2024
Periodo objetivo:          semanas de 2025
Método:                    STAT-V1.0
```

Para cada semana de 2025 se reconstruirá la predicción utilizando únicamente información disponible antes de las `00:00` del lunes correspondiente. La evaluación de esa semana abarcará desde el lunes hasta el domingo.

### 12.2 Baselines

El método se comparará como mínimo con:

**Baseline A — selección aleatoria**

- selección uniforme sin repetición dentro de `00` a `99`;
- mismo número de candidatos que el método;
- simulación reproducible con semilla registrada;
- 10 000 repeticiones del backtest para estimar su distribución.

**Baseline B — frecuencia mensual solamente**

- ranking formado exclusivamente por `F_mes`;
- mismos cortes Top 5, Top 10 y Top 15.

Comparar con la frecuencia mensual permite saber si el modelo compuesto añade valor o simplemente reproduce el comportamiento de los números calientes del mes.

### 12.3 Métrica primaria

Para cada sorteo real `t` y un conjunto Top 5 `K_t`:

```text
Hit@5(t) = 1 si al menos uno de P1, P2 o P3 pertenece a K_t
           0 en caso contrario
```

La métrica primaria será la media de `Hit@5` sobre todos los sorteos evaluables de las tres loterías durante el periodo de prueba.

### 12.4 Métricas secundarias

También se registrarán:

```text
Hit@10
Hit@15
cantidad de posiciones acertadas por sorteo
rango medio de los números realmente sorteados
resultados por lotería
resultados por día de la semana
resultados por posición
resultados por mes
rendimiento de cada señal por separado
```

El proyecto debe distinguir una coincidencia en cualquier posición de un acierto de posición exacta.

### 12.5 Intervalos de incertidumbre

Para comparar `STAT-V1.0` con los baselines se utilizará bootstrap pareado por semana:

```text
10 000 remuestreos
unidad de remuestreo: semana completa de lunes a domingo
intervalo: 95 %
```

Remuestrear por semana evita tratar como totalmente independientes observaciones que pertenecen al mismo bloque temporal.

La afirmación de ventaja predictiva se reservará para la métrica primaria y solo si la diferencia fuera de muestra es consistente con el criterio estadístico predefinido. Las métricas secundarias se considerarán exploratorias salvo que se preregistre otra prueba.

## 13. Política contra sobreajuste

`STAT-V1.0` queda definido antes de observar su resultado formal de 2025.

Después de ejecutar el backtest:

- si se cambian pesos, ventanas o señales usando los resultados de 2025, ese año pasa a ser conjunto de desarrollo;
- la versión modificada no puede presentarse como validada con los mismos datos que se usaron para ajustarla;
- una versión ajustada con 2025 deberá evaluarse con datos posteriores no utilizados en el ajuste, por ejemplo datos de 2026 obtenidos de forma prospectiva.

No se incorporará aprendizaje automático hasta disponer de suficiente historial y un protocolo separado de entrenamiento, validación y prueba.

## 14. Flujo del usuario

1. El usuario abre la aplicación.
2. La pantalla aparece **sin predicciones ni análisis generado**.
3. El usuario selecciona la fecha de referencia si desea cambiarla.
4. El usuario presiona **Generar predicciones**.
5. El backend determina semana objetivo, corte temporal y años históricos.
6. El motor valida la completitud de datos.
7. Se calculan las señales y el ranking.
8. La predicción se guarda con versión y fecha de corte.
9. El frontend presenta una tarjeta separada para cada lotería.
10. **Limpiar pantalla** oculta el resultado sin eliminar datos persistentes.

La aplicación no debe ejecutar `generatePredictions()` automáticamente al montar la página.

## 15. Información mostrada por lotería

La tarjeta debe poder mostrar:

- cinco candidatos principales de la semana;
- puntaje relativo de cada candidato;
- desglose de señales;
- 15 calientes del mes;
- 15 calientes del día seleccionado;
- posición históricamente más fuerte;
- coincidencias históricas entre loterías;
- parejas recurrentes como información exploratoria;
- periodo histórico utilizado;
- fecha de corte de datos;
- versión del método;
- estado de completitud.

Debe existir un aviso visible indicando que el análisis no garantiza resultados y que los sorteos deben tratarse como eventos aleatorios salvo evidencia empírica reproducible en contrario.

## 16. Fuente de resultados

Fuente automatizada observada actualmente:

```text
https://api.loteriasdominicanas.com/dominicana/sessions
```

Formato observado:

```text
GET /dominicana/sessions?date=YYYY-MM-DDT04:00:00.000Z&limit=3
```

Los identificadores externos actualmente configurados son:

```text
Nacional: 6966a6d1ea7015c3b8a3d482
Leidsa:   6966a6d1ea7015c3b8a3d453
Loteka:   6966a6d2ea7015c3b8a3d4d7
```

El endpoint observado no se considera una API pública garantizada. El acceso debe permanecer encapsulado en un adaptador sustituible.

Antes de una publicación comercial se deben revisar los términos de uso y los permisos de reutilización de los datos.

## 17. Arquitectura real del repositorio

El proyecto actual utiliza:

- Next.js 16.
- React 19.
- TypeScript.
- Vinext/Vite.
- Cloudflare Workers.
- Cloudflare D1 / SQLite.
- Drizzle ORM.
- Wrangler.
- zona horaria `America/Santo_Domingo`.

Arquitectura:

```text
Fuente externa
      │
      ▼
Adaptador y normalizador
      │
      ▼
Cloudflare D1
      │
      ├── resultados históricos
      ├── ejecuciones de sincronización
      └── predicciones congeladas
      │
      ▼
Motor estadístico versionado
      │
      ▼
API interna Next.js
      │
      ▼
Frontend React
```

El frontend nunca debe consumir directamente la fuente externa.

## 18. Modelo de datos base

### `lotteries`

```text
id
external_game_id
name
slug
source
active
created_at
updated_at
```

### `draw_results`

```text
id
lottery_id
external_result_id
draw_date
draw_datetime
weekday
calendar_week
month
year
first_number
second_number
third_number
source
source_payload
collected_at
updated_at
```

Restricción mínima:

```text
UNIQUE(lottery_id, external_result_id)
```

También debe impedirse almacenar dos resultados incompatibles para la misma lotería y fecha.

### `sync_runs`

```text
id
source
date_from
date_to
status
records_created
records_updated
error_message
started_at
finished_at
```

### `predictions`

```text
id
lottery_id
week_start
week_end
generated_at
data_available_through
method_version
method_parameters
status
```

### `prediction_candidates`

```text
id
prediction_id
number
ranking
score
monthly_score
weekly_score
weekday_score
position_score
coincidence_score
recency_score
explanation
```

El modelo puede ampliarse posteriormente con tablas específicas de backtesting, pero el resultado de una predicción debe permanecer auditable e inmutable.

## 19. API objetivo

```text
POST /api/predictions/generate
GET  /api/predictions/current
GET  /api/predictions/:id
GET  /api/results
POST /api/admin/sync
GET  /api/admin/sync/status
POST /api/backtests/run
GET  /api/backtests/:id
```

Las rutas de backtesting deben ejecutar exactamente el mismo motor que las predicciones reales; no debe existir una segunda implementación con reglas diferentes.

## 20. Estado actual y diferencias pendientes

El repositorio ya contiene:

- interfaz principal;
- adaptador para las tres loterías;
- normalización de resultados;
- persistencia en D1 mediante Drizzle;
- sincronización por fecha;
- un generador inicial de estadísticas.

El generador actual todavía **no implementa `STAT-V1.0`**. Actualmente combina frecuencias del mismo día del mes y del mes completo y asigna puntajes principalmente por posición del ranking. Ese código debe considerarse prototipo y sustituirse por el motor especificado en este documento.

También están pendientes:

- implementar la regla formal de semanas equivalentes de lunes a domingo;
- guardar realmente las predicciones y el ranking completo;
- evitar sincronizaciones de la semana objetivo durante backtesting;
- importar 2022 para permitir la prueba formal de 2025;
- implementar el backtesting y los baselines;
- actualizar las pruebas automatizadas del repositorio para que validen el producto actual y no el starter inicial.

## 21. Criterios de aceptación de STAT-V1.0

La versión se considerará implementada cuando:

- la pantalla abra vacía;
- la generación ocurra solamente por acción del usuario;
- existan datos históricos desde 2022 para el primer backtest;
- se calcule correctamente la semana objetivo lunes-domingo;
- la regla de semana equivalente reproduzca los casos documentados;
- se calculen las seis señales definidas;
- cada señal use ranking normalizado de 0 a 100;
- los pesos de `STAT-V1.0` sean exactamente `1/6`;
- se conserve el ranking completo de 100 números;
- se muestren cinco candidatos principales;
- cada candidato tenga desglose explicable;
- las predicciones se congelen con fecha de corte y versión;
- no exista fuga de información futura;
- pueda ejecutarse el backtest 2025 usando 2022-2024;
- se compare contra selección aleatoria y frecuencia mensual;
- los resultados del laboratorio puedan reproducirse con la misma versión y los mismos datos.

## 22. Alcance excluido

Quedan fuera de `STAT-V1.0`:

- apuestas o pagos;
- automatización de jugadas;
- garantías de resultados;
- modificación de pesos después de observar el holdout sin cambiar de versión;
- aprendizaje automático;
- aplicaciones móviles nativas;
- incorporación de loterías adicionales;
- uso de parejas recurrentes como señal ponderada;
- uso de coincidencias literales del mismo día como señal ponderada.

El objetivo de esta versión es establecer primero un experimento estadístico reproducible. Si el método no supera sus baselines fuera de muestra, el resultado correcto del proyecto será reconocer que las recurrencias estudiadas no mostraron poder predictivo suficiente bajo este protocolo.
