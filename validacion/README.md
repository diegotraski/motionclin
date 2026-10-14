# Validación frente a laboratorio

Herramientas y protocolo para medir **cuánto se parece MotionClin a un sistema de referencia** (captura óptica con marcadores, pasarela instrumentada o plataformas de fuerza) en las mismas personas y los mismos pasos.

> MotionClin todavía **no tiene una validación clínica con personas**. Esta carpeta deja preparado todo lo necesario para hacerla: el formato de datos, el análisis estadístico y el protocolo. El informe de ejemplo usa sujetos simulados y solo enseña el formato.

```bash
npm run concordancia -- mis-datos.json informe.md   # datos reales
npm run concordancia:demo                           # regenera el ejemplo con 24 sujetos simulados
```

Resultado de ejemplo: [`demo-informe.md`](demo-informe.md).

## Qué calcula

| Pregunta | Método | Referencia |
|---|---|---|
| ¿Mide de más o de menos, y cuánto puede equivocarse en una persona? | Bland-Altman: sesgo con IC 95 %, límites de acuerdo y sesgo proporcional | Bland y Altman, 1986 |
| ¿Ordena igual a las personas que el laboratorio? | ICC(2,1) de acuerdo absoluto, con IC 95 % por *bootstrap* de sujetos | Shrout y Fleiss, 1979; McGraw y Wong, 1996 |
| ¿Cómo se lee el ICC? | Pobre < 0,5 · moderada < 0,75 · buena < 0,9 · excelente, sobre el **límite inferior** del IC | Koo y Li, 2016 |
| ¿Se parecen las curvas del ciclo? | RMSE, RMSE sin sesgo y coeficiente de correlación múltiple (CMC) | Kadaba et al., 1989 |
| ¿Detecta los eventos a tiempo? | Error de contacto inicial y despegue en ms (emparejamiento con tolerancia de 150 ms) | — |
| ¿Cuánto tiene que cambiar un paciente para que el cambio sea real? | Test-retest: ICC(3,1), SEM y MDC95 = 1,96 · √2 · SEM | Weir, 2005 |

### Cómo leer el ejemplo

El informe simulado enseña dos lecciones que también aparecen con datos reales:

- **Un sesgo constante no es lo mismo que un mal acuerdo.** La rodilla en oscilación sale unos 2,5° por encima del laboratorio (el simulador desplaza el punto de la rodilla como lo haría un modelo de pose), pero con ICC «bueno»: el sesgo se puede corregir, la dispersión no.
- **El ICC depende de cuánto varían las personas.** La fase de apoyo y el doble apoyo tienen límites de acuerdo de ±2 %, más estrechos que la diferencia clínica relevante, y aun así un ICC «pobre», porque entre sujetos sanos esas variables apenas cambian. Por eso el informe da siempre los dos análisis, y marca como «no interpretable» el ICC cuando la referencia no varía.

## Formato de entrada

Un JSON con un objeto por persona. `motionclin` es lo que exporta la app (botón JSON de cada sesión); `laboratorio` lo que dé el sistema de referencia con las mismas claves.

```json
{
  "estudio": "Validación concurrente, Hospital X, 2026",
  "referencia": "Vicon Nexus 2.15 + plataformas AMTI, modelo Plug-in Gait",
  "sujetos": [
    {
      "id": "S01",
      "laboratorio": {
        "metrics": { "speed": 1.21, "cadence": 108.4, "strideTime": 1.107, "strideLen": 1.34,
                     "stanceL": 61.2, "stanceR": 60.8, "ds": 22.1,
                     "kneeSwingL": 58.3, "kneeSwingR": 57.9, "kneeICL": 4.1, "kneeICR": 3.6 },
        "cycles": { "kneeL": [/* 51 valores, 0-100 % del ciclo */], "kneeR": [], "hipL": [], "hipR": [] },
        "events": { "hsL": [1.227, 2.484], "hsR": [0.598], "toL": [0.745], "toR": [1.371] }
      },
      "motionclin": { "metrics": [/* tal cual lo exporta la app */], "cycles": {}, "events": {} },
      "motionclinRetest": { "metrics": [] }
    }
  ]
}
```

- `metrics` admite el mapa `{ clave: valor }` o la lista `[{ key, value }]` de la exportación.
- `cycles` admite la lista de 51 valores o el objeto `{ mean: [...] }` de la exportación.
- Los eventos van en segundos desde el inicio del vídeo; el reloj de la cámara y el del laboratorio tienen que estar sincronizados (ver protocolo).
- `motionclinRetest` es opcional: una segunda grabación de la misma persona el mismo día, para la fiabilidad.
- Cualquier variable o sección que falte se omite del informe.

## Protocolo propuesto

Diseño pensado para un laboratorio de marcha universitario u hospitalario, con un coste de una mañana por cada 6–8 participantes.

### 1. Diseño

Estudio transversal de **validez concurrente** (MotionClin frente al sistema de referencia, registrados a la vez) y **fiabilidad test-retest intrasesión** (dos grabaciones con recolocación de la cámara). Seguir la guía GRRAS de estudios de fiabilidad y acuerdo (Kottner et al., 2011).

### 2. Participantes

- **n ≥ 30** para estimar el ICC con un IC 95 % de amplitud ≤ 0,2 cuando el ICC esperado es ≈ 0,85 (Bonett, 2002). Mejor 40 si se quieren subgrupos.
- Muestra heterogénea a propósito: el ICC sube con la variabilidad entre sujetos. Por ejemplo, 15 personas sanas de 20 a 70 años y 15 pacientes con alteración de la marcha (artroplastia de rodilla, LCA, ictus crónico con marcha independiente).
- Exclusión: necesitar ayuda técnica bilateral, o no poder caminar 10 m seis veces.

### 3. Montaje

- Teléfono en trípode a la altura de la cadera, **perpendicular** a la pasarela, a 3–4 m, con 4–5 m de recorrido visible. 1080p, **60 fps** si el teléfono lo permite, exposición fija.
- Ropa ajustada de color distinto al fondo. Los marcadores reflectantes pueden quedarse: no afectan a MotionClin.
- **Sincronización:** un evento visible en ambos sistemas al inicio de cada toma (un golpe de talón sobre una plataforma o un LED disparado por el sistema de captura). La diferencia de tiempo se resta antes de comparar eventos.

### 4. Procedimiento

1. Altura y edad en MotionClin; antropometría del modelo del laboratorio.
2. Seis pasadas a velocidad cómoda en la dirección filmada; las tres primeras forman la toma 1 y las tres últimas la toma 2 (retest). Recolocar el trípode entre ambas.
3. Opcional: tres pasadas a velocidad lenta y tres a rápida, para ver si el sesgo depende de la velocidad (pendiente de Bland-Altman).

### 5. Variables

Primarias: velocidad, cadencia, duración y longitud de zancada, fase de apoyo, pico de flexión de rodilla en oscilación. Secundarias: rodilla en contacto inicial, rango de cadera (ángulo de muslo frente a ángulo pélvico del laboratorio: no son lo mismo, ver [`docs/METODO.md`](../docs/METODO.md)), curvas completas y eventos.

Del laboratorio se usan las mismas zancadas que vea la cámara: se descartan las que queden fuera de cuadro.

### 6. Análisis y criterios de aceptación

Definidos **antes** de recoger datos:

| Variable | Aceptable si |
|---|---|
| Velocidad | Límites de acuerdo dentro de ±0,10 m/s (cambio relevante, Perera et al., 2006) e ICC(2,1) ≥ 0,90 |
| Cadencia, zancada | Límites de acuerdo dentro de ±5 % e ICC(2,1) ≥ 0,90 |
| Flexión de rodilla en oscilación | RMSE ≤ 5° y CMC ≥ 0,90 (orden de magnitud publicado para sistemas sin marcadores en vista lateral: Stenum et al., 2021; Washabaugh et al., 2022) |
| Fase de apoyo, doble apoyo | Límites de acuerdo dentro de ±3 % |
| Eventos | Error absoluto medio ≤ 1 fotograma (17 ms a 60 fps, 33 ms a 30 fps) |

Si el sesgo es constante y su IC no incluye el cero, se puede publicar una corrección y comprobarla en una segunda muestra.

### 7. Ética y datos

- Aprobación del comité de ética de la investigación y consentimiento informado por escrito, con autorización explícita para grabar vídeo.
- MotionClin procesa el vídeo en el navegador y no lo envía a ningún servidor. Para el estudio, guardar solo la exportación JSON (sin imagen) con un código de sujeto; los vídeos, si se conservan, cifrados y con acceso restringido según el RGPD.

## Referencias

- Bland JM, Altman DG. Statistical methods for assessing agreement between two methods of clinical measurement. *Lancet*. 1986;1(8476):307-10.
- Bonett DG. Sample size requirements for estimating intraclass correlations with desired precision. *Stat Med*. 2002;21(9):1331-5.
- Kadaba MP, Ramakrishnan HK, Wootten ME, et al. Repeatability of kinematic, kinetic, and electromyographic data in normal adult gait. *J Orthop Res*. 1989;7(6):849-60.
- Koo TK, Li MY. A guideline of selecting and reporting intraclass correlation coefficients for reliability research. *J Chiropr Med*. 2016;15(2):155-63.
- Kottner J, Audigé L, Brorson S, et al. Guidelines for Reporting Reliability and Agreement Studies (GRRAS) were proposed. *J Clin Epidemiol*. 2011;64(1):96-106.
- McGraw KO, Wong SP. Forming inferences about some intraclass correlation coefficients. *Psychol Methods*. 1996;1(1):30-46.
- Perera S, Mody SH, Woodman RC, Studenski SA. Meaningful change and responsiveness in common physical performance measures in older adults. *J Am Geriatr Soc*. 2006;54(5):743-9.
- Shrout PE, Fleiss JL. Intraclass correlations: uses in assessing rater reliability. *Psychol Bull*. 1979;86(2):420-8.
- Stenum J, Rossi C, Roemmich RT. Two-dimensional video-based analysis of human gait using pose estimation. *PLoS Comput Biol*. 2021;17(4):e1008935.
- Washabaugh EP, Shanmugam TA, Ranganathan R, Krishnan C. Comparing the accuracy of open-source pose estimation methods for measuring gait kinematics. *Gait Posture*. 2022;97:188-95.
- Weir JP. Quantifying test-retest reliability using the intraclass correlation coefficient and the SEM. *J Strength Cond Res*. 2005;19(1):231-40.
