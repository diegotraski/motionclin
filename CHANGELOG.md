# Historial de cambios

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
