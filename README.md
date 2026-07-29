# Predictor Estadístico de Quinielas Dominicanas

## 1. Descripción

Aplicación web para recopilar, almacenar y analizar resultados históricos de tres sorteos dominicanos:

- Quiniela de la Lotería Nacional.
- Quiniela Palé de Leidsa.
- Quiniela Palé de Loteka.

El sistema utilizará los resultados de los tres años anteriores al año activo para generar candidatos estadísticos correspondientes a la semana en curso.

Ejemplo:

```text
Datos históricos: 2023 + 2024 + 2025
Periodo objetivo: semana activa de 2026
```

La aplicación no afirmará que puede garantizar resultados. Presentará frecuencias, coincidencias, tendencias y candidatos basados únicamente en datos históricos.

## 2. Objetivo general

Construir una aplicación que permita al usuario presionar un botón y obtener un análisis estadístico de las tres loterías para la semana activa, utilizando:

- Los números más frecuentes del mes equivalente en los tres años anteriores.
- Las semanas equivalentes de esos años.
- El día de la semana.
- La posición del número en el sorteo.
- Las coincidencias entre las tres loterías.
- Los resultados recientes disponibles antes de generar la predicción.

## 3. Periodos históricos y semana objetivo

La semana activa se considera de lunes a sábado. El usuario generará normalmente sus candidatos temprano el lunes, antes de los sorteos de esa semana.

Ejemplo para la última semana de julio de 2026:

```text
Histórico 2023: lunes 31 de julio – sábado 5 de agosto
Histórico 2024: lunes 29 de julio – sábado 3 de agosto
Histórico 2025: lunes 28 de julio – sábado 2 de agosto

Semana objetivo 2026: lunes 27 de julio – sábado 1 de agosto
```

Las semanas históricas equivalentes alimentan el análisis. La semana de 2026 es el periodo que se intenta analizar o predecir.

## 4. Análisis mensual

Para el mes activo se analizarán todos los resultados del mismo mes durante los tres años históricos.

Ejemplo para julio:

```text
Julio 2023: 31 días × 3 posiciones = 93 números
Julio 2024: 31 días × 3 posiciones = 93 números
Julio 2025: 31 días × 3 posiciones = 93 números
Total: 279 observaciones por lotería
```

Con esos resultados se calcularán los 15 números más frecuentes del mes, denominados en la interfaz como **números calientes del mes**.

La frecuencia histórica no implica que un número tenga garantizada una mayor probabilidad matemática en un sorteo independiente. Representa únicamente fuerza o recurrencia dentro del modelo estadístico de la aplicación.

## 5. Flujo del usuario

1. El usuario abre la aplicación.
2. La pantalla aparece sin predicciones.
3. El usuario presiona **Generar predicciones**.
4. El frontend solicita el análisis al backend.
5. El backend identifica la fecha, el mes y la semana activa en la zona horaria de Santo Domingo.
6. El sistema consulta los datos almacenados, calcula o recupera las estadísticas y devuelve los candidatos.
7. El frontend presenta una tarjeta separada para cada lotería.
8. El usuario puede presionar **Limpiar pantalla** para ocultar los resultados.

El botón **Limpiar pantalla** no debe eliminar resultados históricos, estadísticas ni predicciones guardadas. Solamente restablece el estado visual del frontend.

## 6. Funcionalidades principales

### 6.1 Recopilación

- Importar resultados históricos desde el 1 de enero de 2023.
- Identificar cada lotería mediante un identificador externo estable.
- Evitar registros duplicados.
- Registrar la fuente y la fecha de recopilación.
- Reintentar consultas fallidas.
- Permitir corregir resultados modificados por la fuente.

### 6.2 Actualización diaria

- Consultar únicamente fechas recientes, normalmente ayer y hoy.
- Ejecutar varias comprobaciones según los horarios de los sorteos.
- Registrar el estado de cada sincronización.
- Mantener disponible la información local aunque la fuente externa falle temporalmente.

### 6.3 Estadísticas

- Frecuencia mensual de los números `00` a `99`.
- Quince números más frecuentes del mes.
- Frecuencia en semanas históricas equivalentes.
- Frecuencia por día de la semana.
- Frecuencia por primera, segunda y tercera posición.
- Coincidencias entre las tres loterías.
- Parejas o combinaciones recurrentes.
- Apariciones recientes.

### 6.4 Predicciones

- Generar candidatos separados por lotería.
- Asignar un puntaje explicable a cada candidato.
- Guardar la fecha y hora de generación.
- Guardar hasta qué fecha había datos disponibles.
- Guardar la versión del método y sus pesos.
- Impedir que resultados posteriores alteren retroactivamente una predicción ya generada.
- Comparar posteriormente los candidatos con los resultados reales.

## 7. Modelo inicial de puntuación

Cada número recibirá puntos según varias señales. Los pesos deben permanecer configurables.

Ejemplo conceptual:

```text
Puntaje =
    frecuencia_mensual          × peso_mensual
  + frecuencia_semana_equiv     × peso_semanal
  + frecuencia_dia_semana       × peso_dia
  + frecuencia_por_posicion     × peso_posicion
  + coincidencias_loterias      × peso_coincidencia
  + recurrencia_parejas         × peso_parejas
  + señal_reciente              × peso_recencia
```

La primera versión debe priorizar un modelo sencillo, reproducible y verificable. No se debe incorporar aprendizaje automático hasta disponer de pruebas retrospectivas suficientes.

## 8. Fuentes de datos

Fuente inicial para automatización:

- `https://loteriasdominicanas.com/`
- Endpoint observado: `https://api.loteriasdominicanas.com/dominicana/sessions`

Formato de consulta observado:

```text
GET /dominicana/sessions?date=2026-07-08T04%3A00%3A00.000Z&limit=3
```

Fuente oficial de verificación para Leidsa:

- `https://www.leidsa.com/results`

Los endpoints observados no deben tratarse como una API pública garantizada. Pueden cambiar sin aviso. El acceso debe estar encapsulado en un adaptador del backend para poder sustituir la fuente sin modificar el resto del sistema.

Antes de publicar una aplicación comercial, se deben revisar los términos de uso y permisos de reutilización de datos de cada fuente.

## 9. Arquitectura

```text
Fuente externa de resultados
             │
             ▼
Recolector y normalizador
             │
             ▼
Base de datos PostgreSQL
             │
             ├──────────────► Estadísticas precalculadas
             │
             ▼
Motor de puntuación y predicciones
             │
             ▼
API interna del proyecto
             │
             ▼
Frontend web
```

### Tecnologías recomendadas

- Frontend: Next.js con React y TypeScript.
- Backend: API de Next.js o servicio Node.js con TypeScript.
- Base de datos: PostgreSQL.
- ORM: Prisma.
- Validación: Zod.
- Tareas programadas: cron del proveedor o trabajador programado.
- Pruebas: Vitest.
- Zona horaria: `America/Santo_Domingo`.

Para una primera versión puede utilizarse un único proyecto Next.js con frontend, API y tareas de recopilación bien separadas por módulos. Si el sistema crece, el recolector puede extraerse a un servicio independiente.

## 10. Modelo de datos

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

Restricción recomendada:

```text
UNIQUE(lottery_id, external_result_id)
```

También debe existir una restricción o validación que evite dos resultados incompatibles para la misma lotería y fecha.

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

### `monthly_statistics`

```text
id
lottery_id
target_month
historical_years
number
frequency_total
frequency_first
frequency_second
frequency_third
ranking
calculated_at
```

### `weekly_statistics`

```text
id
lottery_id
target_week_start
target_week_end
historical_years
number
frequency
score
details
calculated_at
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

## 11. API interna prevista

```text
POST /api/predictions/generate
GET  /api/predictions/current
GET  /api/predictions/:id
GET  /api/statistics/monthly
GET  /api/statistics/weekly
GET  /api/results
POST /api/admin/sync
GET  /api/admin/sync/status
```

El frontend nunca debe depender directamente de la fuente externa. Debe consumir exclusivamente la API propia.

## 12. Interfaz principal

### Encabezado

- Nombre de la aplicación.
- Fecha actual.
- Semana activa.
- Años históricos utilizados.

### Acciones

- Botón **Generar predicciones**.
- Botón **Limpiar pantalla**.

### Estados

- Pantalla inicial vacía.
- Cargando datos.
- Predicción generada.
- Datos insuficientes.
- Fuente desactualizada.
- Error de comunicación.

### Tarjeta por lotería

- Nombre de la lotería.
- Quince números calientes del mes.
- Candidatos principales de la semana.
- Puntaje de cada número.
- Motivos principales de su clasificación.
- Parejas destacadas.
- Fecha y hora de generación.
- Datos disponibles hasta una fecha determinada.

### Aviso

La interfaz debe indicar que los resultados son análisis estadísticos y no representan una garantía de premio.

## 13. Ruta de desarrollo

### Fase 1 — Inicialización

- Crear el proyecto.
- Configurar TypeScript, formato y validación.
- Configurar PostgreSQL y Prisma.
- Definir variables de entorno.
- Crear estructura modular.

### Fase 2 — Adaptador de datos

- Confirmar los identificadores externos de las tres loterías.
- Implementar el cliente del endpoint.
- Normalizar respuestas.
- Manejar límites, errores y reintentos.
- Agregar pruebas con respuestas guardadas.

### Fase 3 — Importación histórica

- Importar desde el 1 de enero de 2023.
- Procesar fechas en lotes controlados.
- Guardar avance reanudable.
- Evitar duplicados.
- Generar un informe de integridad.

### Fase 4 — Actualización incremental

- Consultar ayer y hoy.
- Programar ejecuciones posteriores a los sorteos.
- Actualizar resultados corregidos.
- Registrar alertas y fallos.

### Fase 5 — Motor estadístico

- Calcular frecuencias mensuales.
- Obtener los 15 números calientes.
- Calcular semanas equivalentes.
- Analizar días y posiciones.
- Detectar coincidencias.
- Calcular puntajes explicables.

### Fase 6 — Predicciones

- Generar candidatos bajo demanda.
- Congelar cada ejecución.
- Guardar parámetros y versión.
- Evitar información futura en el cálculo.
- Medir aciertos posteriormente.

### Fase 7 — Frontend

- Implementar pantalla principal.
- Implementar ambos botones.
- Crear tarjetas por lotería.
- Mostrar estados de carga y error.
- Adaptar la interfaz a teléfonos.

### Fase 8 — Validación retrospectiva

Antes de evaluar el método con 2026, se debe realizar backtesting:

```text
Entrenamiento histórico: 2022 + 2023 + 2024
Periodo simulado: semanas de 2025
```

Para cada lunes simulado solo se podrán utilizar resultados disponibles hasta el domingo anterior. Esto evita fuga de información futura.

Métricas sugeridas:

- Cantidad de candidatos generados.
- Aciertos semanales.
- Aciertos por posición.
- Aciertos por lotería.
- Precisión de los primeros 5, 10 y 15 candidatos.
- Comparación contra una selección aleatoria.
- Rendimiento por versión del método.

### Fase 9 — Publicación

- Configurar alojamiento.
- Configurar base de datos administrada.
- Programar sincronizaciones.
- Crear copias de seguridad.
- Incorporar monitoreo.
- Revisar seguridad y términos de uso.

## 14. Reglas importantes

- Todos los números se guardarán como texto de dos dígitos: `00` a `99`.
- La semana de análisis será de lunes a sábado.
- La zona horaria oficial del sistema será `America/Santo_Domingo`.
- Una predicción guardará explícitamente la fecha máxima de datos utilizados.
- Resultados posteriores no modificarán una predicción anterior.
- Los pesos del algoritmo tendrán versiones.
- La limpieza del frontend nunca eliminará datos persistentes.
- Las estadísticas se mostrarán como tendencias, no como certezas.

## 15. Criterios de aceptación

La primera versión se considerará funcional cuando:

- Importe resultados desde 2023 sin duplicados.
- Identifique correctamente las tres loterías.
- Actualice resultados automáticamente.
- Calcule semanas equivalentes correctamente.
- Obtenga los 15 números calientes del mes.
- Genere candidatos separados por lotería.
- Explique el puntaje de cada candidato.
- Guarde predicciones con fecha, hora y versión.
- El botón de limpiar solo modifique la pantalla.
- Funcione en computadora y teléfono.
- Permita medir el rendimiento histórico del método.

## 16. Alcance inicial

Incluido:

- Una aplicación web.
- Tres loterías fijas.
- Importación histórica.
- Actualización incremental.
- Estadísticas mensuales y semanales.
- Generación manual mediante botón.
- Limpieza visual.
- Historial y medición de predicciones.

Fuera del alcance inicial:

- Apuestas o pagos.
- Automatización de jugadas.
- Garantías de resultados.
- Reconocimiento de voz.
- Aplicaciones móviles nativas.
- Inteligencia artificial o aprendizaje automático avanzado.
- Incorporación de loterías adicionales.

## 17. Próximas decisiones

Antes de comenzar la implementación se deben cerrar:

1. Identificadores externos definitivos de las tres loterías.
2. Cantidad exacta de candidatos principales que se mostrarán.
3. Pesos iniciales del modelo de puntuación.
4. Proveedor de PostgreSQL y alojamiento.
5. Horarios definitivos de sincronización.
6. Diseño visual inicial.

