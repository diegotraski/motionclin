<div align="center">

# MotionClin

**Análisis biomecánico por vídeo para fisioterapia, en el navegador**

Del vídeo del móvil a un informe clínico: 33 puntos del cuerpo detectados con IA, métricas con su incertidumbre, valores de referencia publicados y estadística entre sesiones. El vídeo no sale del dispositivo.

[![Probar la demo](https://img.shields.io/badge/▶_Probar_la_demo-diegotraski.github.io/motionclin-0F6FDE?style=for-the-badge)](https://diegotraski.github.io/motionclin/)

[![Pruebas](https://github.com/diegotraski/motionclin/actions/workflows/tests.yml/badge.svg)](https://github.com/diegotraski/motionclin/actions/workflows/tests.yml)
![Cobertura del motor](https://img.shields.io/badge/cobertura_del_motor-98,6_%25-2EA44F)
![Sin servidor](https://img.shields.io/badge/sin_servidor-100_%25_en_el_navegador-555)
![PWA](https://img.shields.io/badge/PWA-sin_conexión-5A0FC8)
![Licencia MIT](https://img.shields.io/badge/licencia-MIT-green)

<img src="docs/img/revision.gif" alt="Reproductor de revisión: vídeo real con el esqueleto detectado, ángulos de rodilla en directo y línea de tiempo con las fases de apoyo de cada pierna" width="88%">

<sub>Vídeo real procesado en el navegador: esqueleto, ángulos en directo, rastro de los tobillos y fases de apoyo de cada pierna (barras), detectadas con el método de Zeni.</sub>

[English version](README.en.md) · [Método](docs/METODO.md) · [Verificación](VALIDACION.md) · [Arquitectura](docs/ARQUITECTURA.md) · [Ejemplos](examples/)

</div>

---

## En 30 segundos

Un fisioterapeuta graba al paciente caminando, haciendo sentadillas, levantándose de una silla o en equilibrio. MotionClin localiza el cuerpo en cada fotograma, calcula las variables clínicas de esa prueba y las compara con la literatura y con las sesiones anteriores del paciente.

Lo que lo diferencia de una demo de detección de pose:

- **Métodos publicados**, no ángulos sueltos: eventos de la marcha de Zeni, Gait Variable Score, índice de simetría de Robinson, valgo dinámico FPPA, péndulo invertido.
- **Cada número con su incertidumbre**: media ± DE entre ciclos, n y un nivel de fiabilidad que depende de la vista y la visibilidad. Los valores poco fiables no generan alertas.
- **«Mejora» solo cuando lo es**: prueba t de Welch más el cambio mínimo clínicamente relevante de cada variable.
- **Verificado**: 30 sujetos simulados por prueba con valores conocidos. Esa verificación encontró dos errores del motor, que están documentados y corregidos.

**Pruébalo:** abre la [demo](https://diegotraski.github.io/motionclin/) y pulsa *Analizar un vídeo real de ejemplo*.

## Casos clínicos de ejemplo

Los tres pacientes de la demo son ficticios. Su movimiento lo genera un simulador con valores conocidos y lo analiza el mismo motor que un vídeo real.

| Caso | Qué muestra | Ver |
|---|---|---|
| **Ana, 31 años · rehabilitación de ligamento cruzado.** Déficit de flexión de la rodilla izquierda al caminar. | En 5 sesiones, la flexión en oscilación pasa de 38° a 59°, la velocidad de 0,91 a 1,28 m/s (p < 0,001, mejora demostrada) y la asimetría de la rodilla del 46 % al 4 %. | [Comparador](https://diegotraski.github.io/motionclin/#comparar-demo-a0~demo-a4) · [Informe](examples/informes/marcha-seguimiento-LCA.pdf) |
| **Carlos, 38 años · dolor patelofemoral.** Las rodillas se van hacia dentro en la sentadilla. | El valgo dinámico (FPPA) baja de 19° a 7° y la profundidad sube de 84° a 98°; la tabla por repetición muestra la consistencia. | [Sesión](https://diegotraski.github.io/motionclin/#sesion-demo-a7) · [Informe](examples/informes/sentadilla-valgo-dinamico.pdf) |
| **Marta, 76 años · prevención de caídas.** Dos caídas en el último año. | La prueba de la silla baja de 14,2 s (por encima de la media para su edad, 12,6 s) a 11,4 s, y la oscilación postural se reduce de forma significativa. | [Comparador](https://diegotraski.github.io/motionclin/#comparar-demo-a12~demo-a14) · [Informe](examples/informes/levantarse-silla-x5.pdf) |

<div align="center">
<img src="docs/img/comparar.png" alt="Comparador de sesiones: esqueletos sincronizados de la primera y la quinta sesión de Ana, con el veredicto estadístico" width="88%">
</div>

## Qué puede hacer

| | |
|---|---|
| **Analizar** | Vídeo del móvil o cámara en directo. El esqueleto y los ángulos se ven mientras se procesa. |
| **Marcha en cinta** | Detecta automáticamente la marcha en tapiz rodante; con la velocidad de la cinta calcula longitudes de paso y zancada. |
| **Revisar** | Reproductor sincronizado con cámara lenta, avance fotograma a fotograma, ángulos en vivo y línea de tiempo de las fases de la marcha. Al pulsar en la gráfica, el vídeo salta a ese instante. Tira de fases del ciclo (contacto inicial, respuesta a la carga, apoyo medio, despegue, oscilación) en la app y en el PDF. |
| **Comparar** | Dos sesiones lado a lado con el movimiento sincronizado, las curvas superpuestas sobre la banda normal y la estadística del cambio. |
| **Seguir** | Evolución con barras de error y tendencia semanal con su p. |
| **Informar** | PDF con tabla de referencias, fiabilidad, gráficas, comparación, método y bibliografía. |
| **Explicar al paciente** | Una página en lenguaje sencillo: semáforo verde/ámbar/rojo frente a personas sanas de su edad, escala visual, evolución y un mensaje del fisioterapeuta ([ejemplo](examples/informes/paciente-marcha-quinta-sesion.pdf)). |
| **Español e inglés** | Interfaz, análisis guardados, gráficas e informes PDF en los dos idiomas, con un clic ([*English*](https://diegotraski.github.io/motionclin/?lang=en)). |
| **Exportar** | CSV con series filtradas, eventos y ciclos para análisis propios; copia de seguridad en JSON. |
| **Trabajar sin conexión** | Se instala como app; el modelo de visión queda guardado en el dispositivo. |

<div align="center">
<img src="docs/img/fases.png" alt="Tira de fases de la marcha: contacto inicial, respuesta a la carga, apoyo medio, despegue y oscilación media, con el ángulo de cada rodilla" width="88%">
</div>

### Pruebas clínicas

| Prueba | Vista | Variables principales |
|---|---|---|
| Marcha | lateral | Velocidad, cadencia, zancada, fases de apoyo, simetría, variabilidad, curvas de rodilla y cadera por ciclo, GVS |
| Sentadilla | lateral o frontal | Repeticiones, profundidad, cadera y tronco, valgo dinámico (FPPA), tiempos de bajada y subida |
| Levantarse de la silla ×5 | lateral | Tiempo con referencia por edad, regularidad, estrategia del tronco |
| Equilibrio | frontal | Velocidad y amplitud de la oscilación, apoyo monopodal con referencia por edad |

<div align="center">
<img src="docs/img/informes.png" alt="Primera página de tres informes PDF: marcha con vídeo real, seguimiento de ligamento cruzado y sentadilla con valgo" width="88%">
<br><sub>Informes generados por la app. <a href="examples/informes/">Ver los cinco PDF</a>.</sub>
</div>

## Rigor científico

La cadena completa (remuestreo, corrección de intercambios izquierda/derecha, limpieza, filtro Butterworth de fase cero, eventos, ciclos, escala y estadística) está descrita con sus fórmulas en **[docs/METODO.md](docs/METODO.md)**, con 25 referencias.

**Verificación** con 30 sujetos simulados por prueba ([tabla completa](VALIDACION.md)):

| Variable | Error absoluto medio | Error máximo |
|---|---|---|
| Marcha · cadencia | 0,24 pasos/min | 0,46 pasos/min |
| Marcha · velocidad | 0,013 m/s | 0,049 m/s |
| Marcha · flexión máx. de rodilla | 0,8–1,0° | 2,8° |
| Sentadilla · profundidad | 0,23° | 0,51° |
| Silla ×5 · tiempo por repetición | 0,004 s | 0,009 s |

La verificación demuestra que el procesado recupera los valores verdaderos cuando la pose es conocida. El error propio del modelo de pose frente a un laboratorio 3D es de varios grados.

**Referencias de laboratorio emparejadas por velocidad.** La curva de rodilla, la banda del muslo, la cadencia y las fases de apoyo se comparan con los datos normativos de captura 3D de [Bovi et al. (2011)](docs/METODO.md#7-valores-de-referencia): 235 personas sanas, separadas en jóvenes y adultos y en cinco velocidades. MotionClin elige automáticamente el grupo de edad y la velocidad del paciente, porque una rodilla de 50° es normal caminando despacio y no lo es a velocidad rápida.

**Preparado para validarse frente a un laboratorio.** [`validacion/`](validacion/README.md) incluye el análisis de concordancia (Bland-Altman, ICC con IC por *bootstrap*, RMSE y CMC de curvas, error de eventos en ms, SEM y MDC95), el formato de datos y un protocolo de estudio con tamaño muestral, montaje, sincronización y criterios de aceptación fijados de antemano. Con un laboratorio basta un comando: `npm run concordancia -- datos.json`. [Informe de ejemplo con sujetos simulados](validacion/demo-informe.md).

## Calidad del software

| | |
|---|---|
| Pruebas | 25 pruebas con valores conocidos (`npm test`), verificación con simulador (`npm run validate`) y prueba extremo a extremo en Chromium con un vídeo real |
| Cobertura | 98,6 % de las líneas del motor (`npm run coverage`) |
| Estilo | ESLint (`npm run lint`) |
| Integración continua | GitHub Actions en cada cambio: estilo, pruebas, cobertura, verificación, ejemplo de Node y **la app completa en Chromium** (analiza el vídeo real con MediaPipe, genera el PDF y abre el comparador; `npm run e2e`) |
| Diseño | Motor de análisis puro, sin DOM: se usa igual en el navegador, en las pruebas y [desde scripts](examples/analizar-desde-node.js) |

```mermaid
flowchart LR
  V[Vídeo o cámara] --> P[MediaPipe BlazePose<br/>33 puntos · WebAssembly]
  P --> L[Limpieza y filtrado<br/>izq./der. · Butterworth]
  L --> E{Prueba}
  E --> G[Marcha · Zeni, ciclos, GVS]
  E --> Q[Sentadilla · FPPA]
  E --> T[Silla ×5]
  E --> B[Equilibrio]
  G & Q & T & B --> M[Media ± DE · fiabilidad<br/>referencias por edad]
  M --> DB[(IndexedDB<br/>métricas + pose comprimida)]
  DB --> UI[Reproductor · comparador<br/>Welch + cambio mínimo]
  UI --> PDF[PDF · CSV]
```

Decisiones técnicas y alternativas descartadas en **[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)**.

## Ejecutarlo en local

Es una web estática, sin compilación:

```bash
git clone https://github.com/diegotraski/motionclin.git && cd motionclin
python3 -m http.server 8080        # o: npx serve .
```

Abre http://localhost:8080. Para las herramientas de desarrollo (Node 22 o superior):

```bash
npm install
npm test            # pruebas
npm run coverage    # cobertura del motor
npm run validate    # verificación con 30 sujetos simulados por prueba
npm run lint        # estilo
npm run example     # usar el motor desde Node con un vídeo real
npm run e2e         # la app completa en Chromium con el vídeo real
npm run ejemplos    # regenera los informes PDF y las capturas de examples/ y docs/img
npm run concordancia -- datos.json informe.md   # concordancia con un laboratorio (validacion/)
```

La app abre en el idioma del navegador; `?lang=en` o `?lang=es` en la dirección lo fija.

## Cómo grabar

- **Marcha:** cámara lateral, fija y perpendicular al recorrido, a 3–5 m; caminar de lado a lado 10–20 s.
- **Sentadilla:** lateral para profundidad y tronco, frontal para valgo; 3–5 repeticiones.
- **Silla ×5:** silla sin reposabrazos contra la pared, cámara lateral; empezar a grabar con el paciente sentado.
- **Equilibrio:** frontal, fija, 20–30 s; la misma colocación de cámara en todas las sesiones.
- Cuerpo completo en el encuadre, buena luz y ropa ajustada. Rellena talla, año de nacimiento y sexo en la ficha.

## Estructura

```
index.html  ·  css/app.css  ·  sw.js  ·  manifest.webmanifest
js/
  metrics.js    motor: señal, eventos, métricas, referencias, estadística   (sin DOM)
  norms.js      datos normativos de laboratorio (Bovi et al., 2011)          (sin DOM)
  agreement.js  concordancia: Bland-Altman, ICC, CMC, MDC                    (sin DOM)
  i18n.js       idioma de la interfaz (español / inglés) · i18n-en.js: textos
  patient-report.js  informe de una página para el paciente
  synth.js      simulador de movimiento con valores conocidos                (sin DOM)
  replay.js     secuencia de pose comprimida a 16 bits                       (sin DOM)
  pose.js       MediaPipe: vídeo fotograma a fotograma y cámara
  player.js     reproductor de revisión sincronizado
  charts.js     gráficas para pantalla y PDF
  report.js     informe PDF
  storage.js    IndexedDB
  demo.js       pacientes de ejemplo
  app.js        vistas y navegación
tests/          pruebas, verificación y prueba extremo a extremo
validacion/     análisis de concordancia con un laboratorio y protocolo del estudio
examples/       informes PDF, datos de un análisis real y uso del motor desde Node
docs/           método, arquitectura e imágenes
samples/        vídeo real de ejemplo (Sports2D, BSD-3)
vendor/         MediaPipe Pose 0.5 (Apache 2.0) y jsPDF 2.5 (MIT)
```

## Límites

Es una medida en 2D: los ángulos fuera del plano de la cámara se deforman, por eso cada prueba pide una vista concreta. Los puntos de BlazePose no son marcadores anatómicos. Las referencias proceden de estudios de laboratorio y sirven para contextualizar. **No es un dispositivo médico certificado:** apoya la valoración del fisioterapeuta, no la sustituye.

## Siguientes pasos

- Ejecutar el [protocolo de validación](validacion/README.md) con un laboratorio de marcha (captura 3D o pasarela instrumentada) para cuantificar el error del modelo de pose con personas.
- Calibración con un objeto de tamaño conocido como alternativa a la talla.
- Sincronización opcional y cifrada entre dispositivos de la misma clínica.

Historial de versiones en [CHANGELOG.md](CHANGELOG.md).

---

<div align="center">
Hecho por <a href="https://github.com/diegotraski">Diego Trascasa García</a> · Licencia MIT<br>
<sub>MediaPipe Pose (Apache 2.0) · jsPDF (MIT) · Vídeo de ejemplo: <a href="https://github.com/davidpagnon/Sports2D">Sports2D</a> (BSD-3)</sub>
</div>
