# Historial de cambios

## 3.4.1 · Documentación para revisores

- README en español e inglés con una ruta de 5 minutos por el proyecto y una tabla de lo que demuestra, con enlaces al código.
- Imagen de los informes actualizada (clínico, paciente e inglés) y datos de ejemplo regenerados con el motor actual (`npm run ejemplos` los rehace).

## 3.4.0 · Informe para el paciente e inglés

- **Informe para el paciente:** una página en lenguaje sencillo con la métrica principal, un semáforo frente a personas sanas de su edad y velocidad, una escala visual por variable, la evolución desde la primera sesión explicada con palabras (mejora real solo si supera el error de medida) y un mensaje editable del fisioterapeuta.
- **Interfaz en español e inglés:** selector en la barra lateral, `?lang=en` en la URL y detección del idioma del navegador. Se traducen la app, los análisis ya guardados, las gráficas, el reproductor, la exportación CSV y los dos informes PDF.
- Los límites de referencia se guardan con cada métrica (para las escalas visuales).
- Ejemplos nuevos: informes del paciente (primera y quinta sesión) e informes en inglés. 25 pruebas; la prueba extremo a extremo comprueba el informe del paciente y el cambio de idioma.

## 3.3.0 · Datos de laboratorio y validación

- **Referencias de laboratorio emparejadas por velocidad:** la curva de rodilla, la banda del muslo, la cadencia, la fase de apoyo y el doble apoyo se comparan con los datos de captura 3D de Bovi et al. (2011), 235 personas sanas, eligiendo el grupo de edad (jóvenes o adultos) y la clase de velocidad del paciente. Rango normal = media ± 2 DE. Con el vídeo real de ejemplo, el apoyo y el doble apoyo dejan de salir fuera de rango por comparar con una velocidad distinta.
- **Análisis de concordancia con un laboratorio** (`validacion/`, `npm run concordancia`): Bland-Altman con sesgo proporcional, ICC(2,1) e ICC(3,1) con IC 95 % por *bootstrap*, RMSE y CMC de curvas, error de eventos en ms, SEM y MDC95. El ICC reproduce el ejemplo clásico de Shrout y Fleiss (1979).
- **Protocolo de validación clínica** listo para un laboratorio de marcha: diseño, tamaño muestral, montaje y sincronización, variables, criterios de aceptación definidos de antemano, ética y RGPD.
- **Informe de concordancia de ejemplo** con 24 sujetos simulados (sesgo de pose en la rodilla y error de medida del laboratorio), para enseñar el formato y cómo leer el sesgo frente al ICC.
- 23 pruebas.

## 3.2.0 · Marcha en cinta y fases del ciclo

- **Marcha en cinta:** se detecta automáticamente cuando la pelvis no avanza pero los pies se alternan; con la velocidad de la cinta (km/h) se calculan las longitudes de paso y zancada. Nueva prueba con el simulador.
- **Tira de fases:** el esqueleto en el contacto inicial, la respuesta a la carga, el apoyo medio, el despegue y la oscilación media (o las fases de una repetición de sentadilla o de silla). En la app, cada fase lleva el reproductor a ese instante; también aparece en el informe PDF.
- **Prueba de la app completa en CI:** GitHub Actions abre la web en Chromium, analiza el vídeo real de ejemplo con MediaPipe, comprueba zancadas, velocidad y cadencia, revisa el reproductor, la tira de fases y el comparador, y genera el PDF.

## 3.1.0 · Calidad verificable y documentación

- **Calidad del código:** ESLint, pruebas con el ejecutor estándar de Node (`node --test`) y una cobertura del 98,6 % de las líneas del motor. GitHub Actions ejecuta en cada cambio el estilo, las pruebas, la cobertura, la verificación y el ejemplo de Node.
- **Ejemplos** (`examples/`): un informe PDF por prueba, los puntos reales extraídos del vídeo de ejemplo, el resultado completo de un análisis en JSON y CSV, y un script que usa el motor desde Node.
- **Documentación:** [`docs/METODO.md`](docs/METODO.md) con las fórmulas, [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) con las decisiones técnicas, README en inglés y casos clínicos en el README.
- **Simulador:** variabilidad zancada a zancada realista (CV de la duración de la zancada), para que la estadística entre sesiones de los ejemplos se parezca a la de pacientes reales.
- **Corrección:** la fiabilidad del rango de cadera tenía en cuenta solo el número de zancadas; ahora también la visibilidad de la pierna, como en la rodilla.

## 3.0.0 · Ver el movimiento, no solo los números

- **Reproductor de revisión** sincronizado: vídeo o esqueleto reconstruido, cámara lenta, avance fotograma a fotograma, ángulos en directo, rastro de los tobillos y línea de tiempo con las fases de apoyo. Al pulsar en la gráfica, el vídeo salta a ese instante.
- **Secuencia de pose comprimida** (16 bits) guardada con cada análisis: las sesiones antiguas se pueden reproducir y comparar sin guardar el vídeo.
- **Comparador antes/después:** dos sesiones lado a lado, alineadas en el contacto del talón, con curvas superpuestas y estadística del cambio.
- **Vídeo real de ejemplo** y pantalla de bienvenida: el análisis completo en un clic.
- **App instalable** (PWA) que funciona sin conexión.
- Vista de detalle para cualquier sesión guardada y exportación CSV de series, eventos y ciclos.
- **Correcciones del motor encontradas con la verificación:**
  - si el primer fotograma llegaba con las piernas intercambiadas, el error se arrastraba a toda la secuencia; el error máximo de rodilla baja de 7,1° a menos de 3°;
  - la frecuencia de muestreo se sesgaba con tiempos redondeados (1 % de error en cadencia).

## 2.0.0 · Motor científico

- Cadena de procesado estándar: remuestreo, corrección izquierda/derecha, descarte por visibilidad y longitud de segmento, filtro Butterworth de fase cero con la corrección de Winter.
- Marcha con eventos de Zeni, curvas por ciclo, Gait Variable Score, simetría de Robinson y variabilidad.
- Sentadilla con valgo dinámico (FPPA), nueva prueba de levantarse de la silla ×5 y equilibrio con péndulo invertido.
- Media ± DE, n y fiabilidad en cada variable; referencias normativas por edad y sexo.
- Comparación entre sesiones con la prueba t de Welch y el cambio mínimo relevante; tendencia semanal.
- Informe PDF con método y bibliografía; página «Método».
- Verificación con 30 sujetos simulados por prueba.

## 1.0.0 · Primera versión funcional

- Estimación de pose con MediaPipe en el navegador, sobre vídeo subido o cámara.
- Pacientes, análisis e informes guardados en IndexedDB; exportación CSV y copia de seguridad.
