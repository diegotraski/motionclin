# Ejemplos

Todo lo que hay aquí lo ha generado la propia app, sin editar a mano. Los informes, las capturas y los datos se regeneran con `npm run ejemplos`.

## Informes PDF

| Informe | Caso | Qué enseña |
|---|---|---|
| [`marcha-video-real.pdf`](informes/marcha-video-real.pdf) | Vídeo real de una persona caminando (clip público de Sports2D) | La cadena completa con datos reales: eventos de la marcha, curvas por ciclo frente a la referencia, fiabilidad de cada valor |
| [`marcha-seguimiento-LCA.pdf`](informes/marcha-seguimiento-LCA.pdf) | Ana, rehabilitación de ligamento cruzado, 5.ª sesión | Seguimiento: comparación estadística con la sesión anterior y tendencia semanal en 5 sesiones |
| [`sentadilla-valgo-dinamico.pdf`](informes/sentadilla-valgo-dinamico.pdf) | Carlos, dolor patelofemoral, vista frontal | Valgo dinámico (FPPA) repetición a repetición y su reducción entre sesiones |
| [`levantarse-silla-x5.pdf`](informes/levantarse-silla-x5.pdf) | Marta, 76 años, prevención de caídas | Prueba de 5 repeticiones con la referencia por edad y el umbral de riesgo de caídas |
| [`equilibrio-oscilacion.pdf`](informes/equilibrio-oscilacion.pdf) | Marta, bipedestación | Oscilación angular por ventanas de 5 s y mejora significativa entre sesiones |
| [`paciente-marcha-primera-sesion.pdf`](informes/paciente-marcha-primera-sesion.pdf) | Ana, 1.ª sesión · **informe para el paciente** | Una página en lenguaje sencillo: semáforo con puntos en ámbar y rojo, escala visual por variable y mensaje automático |
| [`paciente-marcha-quinta-sesion.pdf`](informes/paciente-marcha-quinta-sesion.pdf) | Ana, 5.ª sesión · **informe para el paciente** | La evolución desde la primera sesión explicada con palabras, todo en verde |
| [`en/gait-ACL-follow-up.pdf`](informes/en/gait-ACL-follow-up.pdf) | Ana, 5.ª sesión · **en inglés** | El informe clínico completo con la interfaz en inglés |
| [`en/patient-gait-fifth-session.pdf`](informes/en/patient-gait-fifth-session.pdf) | Ana, 5.ª sesión · **patient report, English** | El informe para el paciente en inglés |

Los casos de Ana, Carlos y Marta son **ficticios**: su movimiento lo genera el simulador (`js/synth.js`) con valores conocidos y lo procesa el mismo motor que un vídeo real.

## Datos

| Archivo | Contenido |
|---|---|
| [`marcha-lateral.landmarks.json`](datos/marcha-lateral.landmarks.json) | Los 33 puntos por fotograma que MediaPipe extrajo del vídeo real de ejemplo (138 fotogramas a 30 Hz). Es la entrada del motor. |
| [`marcha-lateral.analisis.json`](datos/marcha-lateral.analisis.json) | El resultado completo del análisis tal como se guarda en el navegador: métricas con media, DE, n, referencia y fiabilidad; eventos; ciclos promedio; método y referencias. La secuencia comprimida aparece recortada. |
| [`marcha-lateral.analisis.csv`](datos/marcha-lateral.analisis.csv) | La exportación «Descargar datos del análisis»: series filtradas, eventos, ciclos promedio y métricas. Se abre en Excel, R o Python. |

## Usar el motor desde Node

El motor de análisis (`js/metrics.js`) no depende del navegador. Este ejemplo lee los puntos reales del vídeo, calcula la marcha y compara dos sesiones:

```bash
node examples/analizar-desde-node.js
```

```
Marcha · vista lateral · 30 Hz · 3 zancadas · calidad 93 %

  ESPACIOTEMPORALES
  Velocidad de marcha        1.27 ± 0.03 m/s    ≥ 1,14 m/s (media 1,34 para edad y sexo − 15 %)   en rango   fiabilidad media
  Cadencia                   98 ± 1 pasos/min   96–123 (laboratorio)                               en rango   fiabilidad media
  ...
Comparación de dos sesiones simuladas (antes → después):
  Velocidad de marcha                          Δ +0.25 m/s     p = < 0,001  → MEJORA
  Fase de apoyo izq.                           Δ +1.82 %       p = < 0,001  → sin cambio relevante
```

La última línea muestra el criterio del motor: un cambio estadísticamente significativo no basta; también tiene que superar el cambio mínimo relevante de la variable.

```js
const M = require('./js/metrics.js');
const r = M.analyze('gait', frames, { width, height, patient: { age: 30, sex: 'F', heightCm: 165 } });
r.metrics;   // [{ key, label, value, sd, n, unit, ref, eval, rel }, ...]
r.cycles;    // curvas medias por ciclo (51 puntos) de rodilla y cadera
r.events;    // contactos iniciales y despegues (s)
M.compare(sesionAnterior, r);   // Welch + d de Cohen + cambio mínimo relevante por variable
```
