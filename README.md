# Nexo Loto — laboratorio estadístico de quinielas dominicanas

## 1. Propósito

Nexo Loto es una aplicación web para recopilar, almacenar y analizar resultados históricos de tres sorteos dominicanos:

- Quiniela de la Lotería Nacional.
- Quiniela Palé de Leidsa.
- Quiniela Palé de Loteka.

El proyecto no afirma que un sorteo pueda conocerse con certeza. Su propósito es producir estadísticas históricas reproducibles, generar candidatos a partir de esas estadísticas y después comprobar de forma transparente qué ocurrió realmente.

El usuario decide libremente si usa o no esa información para jugar. La aplicación no garantiza premios y ningún puntaje debe interpretarse como probabilidad de ganar.

## 2. Regla oficial de la semana objetivo

La semana de trabajo es siempre:

```text
lunes → domingo
```

Dada una fecha de referencia, el sistema identifica la semana ISO a la que pertenece esa fecha. Esa semana ISO será la unidad principal de comparación histórica.

Ejemplo:

```text
Semana objetivo 2026: 7 al 13 de septiembre de 2026
Semana ISO: 37
```

La comparación histórica correcta es buscar la **misma semana ISO** en cada uno de los tres años anteriores:

```text
2023 — semana ISO 37: 11 al 17 de septiembre
2024 — semana ISO 37:  9 al 15 de septiembre
2025 — semana ISO 37:  8 al 14 de septiembre
2026 — semana ISO 37:  7 al 13 de septiembre ← objetivo
```

Por tanto:

```text
W = número de semana ISO de la semana objetivo

Histórico =
    semana W del año Y-3
  + semana W del año Y-2
  + semana W del año Y-1

Objetivo = semana W del año Y
```

No se utilizará como regla principal:

- el mismo día del mes;
- la posición del lunes dentro del mes;
- la última semana del mes por aproximación.

Si una semana ISO determinada no existe en alguno de los años históricos, por ejemplo una semana 53 en un año que solamente tenga 52 semanas ISO, el sistema debe marcar ese caso como **datos históricos insuficientes**. No debe sustituir silenciosamente otra semana.

## 3. Años históricos

Para una semana objetivo del año ISO `Y` se utilizan:

```text
H = {Y-3, Y-2, Y-1}
```

Ejemplo para 2026:

```text
2023 + 2024 + 2025 → analizar 2026
```

Para un backtest de 2025:

```text
2022 + 2023 + 2024 → simular 2025
```

Por esta razón, para realizar correctamente el primer backtest formal de 2025 la base histórica debe contener datos desde 2022.

## 4. Unidad estadística

El universo de números es:

```text
U = {00, 01, 02, ..., 99}
```

Cada sorteo contiene tres posiciones:

```text
P1 = primer número
P2 = segundo número
P3 = tercer número
```

Para cada lotería se analizan los resultados de las tres semanas históricas equivalentes. El sistema debe conservar el conteo y la procedencia de cada observación para poder explicar por qué un número fue clasificado por encima de otro.

## 5. Comparación semanal principal

Sea `W_h` la semana ISO equivalente del año histórico `h`.

Para cada lotería `l` y número `n`:

```text
F_semana(l,n) = número total de apariciones de n
                en P1, P2 o P3
                dentro de W_(Y-3), W_(Y-2), W_(Y-1)
```

Además del total semanal se conservará la frecuencia por día equivalente:

```text
F_dia(l,n,lunes)
F_dia(l,n,martes)
F_dia(l,n,miércoles)
F_dia(l,n,jueves)
F_dia(l,n,viernes)
F_dia(l,n,sábado)
F_dia(l,n,domingo)
```

Ejemplo: para proyectar el lunes de la semana ISO 37 de 2026 se comparan los lunes de la semana ISO 37 de 2023, 2024 y 2025. Para el martes se comparan los martes equivalentes, y así sucesivamente.

## 6. Ranking y candidatos

El motor debe producir un ranking explicable por lotería.

La primera implementación debe priorizar la comparación semanal definida arriba y evitar puntajes arbitrarios. Un puntaje mostrado en escala `0–100` representa solamente un **índice relativo dentro del modelo**, nunca un porcentaje de probabilidad de premio.

La interfaz inicial mostrará los candidatos principales y conservará internamente suficiente información para evaluar después Top 5, Top 10 y Top 15.

Cada candidato debe poder explicar como mínimo:

```text
number
ranking
score
frecuencia_semana_equivalente
frecuencia_por_dia
frecuencia_por_posicion
historical_years
iso_week
method_version
data_available_through
```

Las estadísticas mensuales, posiciones, coincidencias entre loterías, recencia y parejas recurrentes pueden mantenerse como señales complementarias o exploratorias, pero la referencia semanal oficial es siempre la misma semana ISO de los tres años anteriores.

## 7. Predicción congelada

Cuando el usuario genera las estadísticas de una semana objetivo, el resultado utilizado como proyección debe quedar congelado.

Debe almacenarse como mínimo:

```text
lottery_id
iso_year
iso_week
week_start
week_end
generated_at
data_available_through
historical_years
method_version
method_parameters
ranking/candidatos publicados
```

Una vez congelada:

- resultados posteriores no pueden cambiar retrospectivamente los candidatos publicados;
- una actualización de la fuente puede añadir resultados reales, pero no reescribir la proyección original;
- si cambia el método estadístico se crea una nueva versión;
- para auditoría debe ser posible reconstruir qué información existía cuando se generó la proyección.

La página abre sin generar nuevas predicciones automáticamente. El usuario debe presionar **Generar predicciones** para crear una nueva proyección.

## 8. Seguimiento diario transparente

La comprobación diaria es un proceso distinto de la generación de predicciones.

Una vez que existe una proyección congelada para la semana objetivo, el sistema consulta los resultados reales de cada día y los compara contra lo que había sido publicado antes del sorteo.

Ejemplo:

```text
Semana objetivo: 7–13 septiembre 2026

Lunes 7:
  se ejecutan los sorteos reales

Martes 8:
  la página muestra la comparación del lunes 7
```

Y así sucesivamente durante toda la semana.

La evaluación de cada día debe contener:

```text
día y fecha
lotería
candidatos publicados antes del sorteo
resultado real P1, P2 y P3
números coincidentes
cantidad de coincidencias
coincidencias de posición, si las hay
estado de verificación
fecha/hora de evaluación
```

### Estados obligatorios

**Resultado pendiente**

Se usa cuando todavía no existe un resultado real confirmado. No se considera un fallo ni un acierto.

**0 coincidencias**

Se usa únicamente cuando el resultado real ya está confirmado y ninguno de los candidatos publicados apareció.

**1 o más coincidencias**

Se muestran todos los números coincidentes de forma explícita.

Nunca se ocultarán los días con cero coincidencias.

## 9. Ejemplo de observación diaria

Con coincidencia:

```text
LEIDSA — lunes 7 septiembre 2026

Candidatos publicados:
07 · 18 · 34 · 61 · 82

Resultado real:
18 · 44 · 73

Coincidencias:
18

Observación:
1 coincidencia
```

Sin coincidencia:

```text
LEIDSA — martes 8 septiembre 2026

Candidatos publicados:
04 · 21 · 37 · 66 · 91

Resultado real:
12 · 45 · 78

Coincidencias:
NINGUNA

Observación:
0 coincidencias
```

Si el resultado todavía no está disponible:

```text
Resultado pendiente de confirmación
```

## 10. Resumen acumulado de la semana

Cada nueva evaluación diaria se añade al historial sin borrar las anteriores.

Al terminar la semana, la aplicación debe mostrar un resumen acumulado por lotería y global:

```text
días evaluados
sorteos evaluados
días con al menos una coincidencia
días sin coincidencias
total de coincidencias
coincidencias por posición
Hit@5
Hit@10
Hit@15
```

La finalidad es poder decir con transparencia:

```text
Esto fue lo que el modelo publicó antes del sorteo.
Esto fue lo que ocurrió realmente.
Este fue el rendimiento observado.
```

## 11. Separación de procesos

El sistema debe separar estrictamente:

```text
ANTES DE LA SEMANA
2023 + 2024 + 2025
        ↓
misma semana ISO
        ↓
análisis estadístico
        ↓
proyección congelada 2026

DURANTE LA SEMANA
resultado real diario
        ↓
comparación contra la proyección congelada
        ↓
coincidió / no coincidió / pendiente

AL FINALIZAR LA SEMANA
resumen acumulado
        ↓
medición del rendimiento observado
```

La actualización diaria nunca debe recalcular la predicción original usando resultados que ya ocurrieron.

## 12. Backtesting

El primer experimento retrospectivo formal será:

```text
Datos del modelo: 2022 + 2023 + 2024
Semanas objetivo: 2025
```

Para cada semana ISO de 2025 se reconstruirá lo que el sistema habría publicado antes de esa semana y se comparará con los resultados reales posteriores.

El método se comparará como mínimo contra:

- selección aleatoria con igual cantidad de candidatos;
- un método simple de frecuencia histórica.

Las métricas deben distinguir:

- coincidencia en cualquier posición;
- coincidencia de posición exacta;
- desempeño por lotería;
- desempeño por día;
- desempeño por semana;
- desempeño acumulado.

Si después de ver el backtest se modifican reglas o pesos, el método cambia de versión y no puede presentarse como validado con los mismos datos utilizados para ajustarlo.

## 13. Flujo del usuario

1. El usuario abre la aplicación.
2. La pantalla no genera una nueva proyección automáticamente.
3. El usuario selecciona una fecha de referencia.
4. El sistema determina la semana ISO objetivo.
5. El usuario presiona **Generar predicciones**.
6. El sistema busca la misma semana ISO en los tres años anteriores.
7. Calcula y presenta las estadísticas.
8. La proyección queda congelada.
9. En días posteriores, la web puede cargar automáticamente las evaluaciones ya disponibles de días anteriores, sin generar una nueva predicción.
10. **Limpiar pantalla** solamente modifica la vista; no elimina datos históricos, proyecciones ni evaluaciones.

## 14. Datos y fuente

Fuente automatizada actualmente observada:

```text
https://api.loteriasdominicanas.com/dominicana/sessions
```

Loterías configuradas actualmente:

```text
Nacional: 6966a6d1ea7015c3b8a3d482
Leidsa:   6966a6d1ea7015c3b8a3d453
Loteka:   6966a6d2ea7015c3b8a3d4d7
```

Los resultados deben conservarse localmente para que una caída temporal de la fuente no borre el historial ya verificado.

El endpoint externo no debe considerarse una API pública garantizada. El acceso debe permanecer encapsulado para poder cambiar de proveedor sin reescribir el motor estadístico.

## 15. Arquitectura actual

El repositorio utiliza actualmente:

- Next.js 16;
- React 19;
- TypeScript;
- Vinext/Vite;
- Cloudflare Workers;
- Cloudflare D1 / SQLite;
- Drizzle ORM;
- Wrangler;
- zona horaria `America/Santo_Domingo`.

Arquitectura objetivo:

```text
Fuente externa
      ↓
Recolector / normalizador
      ↓
Cloudflare D1
      ↓
Motor estadístico por semana ISO
      ↓
Proyección congelada
      ↓
API interna
      ↓
Frontend
      ↓
Evaluación diaria contra resultados reales
```

## 16. Prioridad de implementación

### Bloque 1 — comparación semanal correcta

- calcular semana ISO de la fecha seleccionada;
- obtener lunes y domingo de esa semana;
- obtener exactamente la misma semana ISO de Y-3, Y-2 y Y-1;
- detectar correctamente semanas ISO inexistentes;
- sustituir la comparación por mismo día del mes actualmente presente en el prototipo;
- producir estadísticas explicables usando esas semanas.

### Bloque 2 — congelamiento

- guardar la proyección semanal;
- guardar versión y datos utilizados;
- impedir modificación retroactiva;
- conservar candidatos por día y por lotería.

### Bloque 3 — evaluación diaria

- sincronizar resultados reales;
- comparar contra la proyección congelada;
- mostrar coincidencias y cero coincidencias;
- distinguir pendiente de confirmado;
- acumular resultados de lunes a domingo.

### Bloque 4 — panel de rendimiento

- resumen de la semana;
- historial de semanas;
- métricas Top 5/10/15;
- métricas por día, lotería y posición.

### Bloque 5 — backtesting

- importar 2022;
- simular 2025 semana por semana;
- comparar contra baselines;
- registrar versión del método y resultados reproducibles.

## 17. Estado actual

Ya existe:

- interfaz principal;
- recopilación y normalización inicial de resultados;
- base D1 mediante Drizzle;
- sincronización por fecha;
- generador estadístico prototipo;
- pantalla inicial sin generación automática.

El generador actual debe considerarse prototipo hasta completar el Bloque 1, porque todavía contiene lógica basada en coincidencias por fecha de calendario que no corresponde a la regla oficial de misma semana ISO.

## 18. Aviso al usuario

La interfaz debe mostrar de forma visible un aviso equivalente a:

> Los números mostrados se obtienen mediante análisis estadístico de resultados históricos. No garantizan premios ni permiten conocer el resultado futuro de un sorteo. Su uso para realizar apuestas es una decisión exclusiva del usuario.

Nexo Loto debe ser transparente tanto cuando haya coincidencias como cuando no las haya.