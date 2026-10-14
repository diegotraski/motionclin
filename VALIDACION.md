# Verificación del motor de análisis

30 sujetos simulados por prueba, con parámetros aleatorios, ruido de posición de 1–3 px, intercambios izquierda/derecha del 0–3 % de los fotogramas en marcha y variabilidad entre ciclos. Error = estimado − verdadero.

| Variable | n | Sesgo (media del error) | Error absoluto medio | Error máx. | Fallos |
|---|---|---|---|---|---|
| Marcha · cadencia | 30 | 0,02 pasos/min | 0,24 pasos/min | 0,46 pasos/min | 0 |
| Marcha · duración de zancada | 30 | 0 s | 0,003 s | 0,005 s | 0 |
| Marcha · velocidad | 30 | 0,01 m/s | 0,012 m/s | 0,029 m/s | 0 |
| Marcha · flexión máx. rodilla izq. | 30 | -0,71 ° | 0,81 ° | 2,44 ° | 0 |
| Marcha · flexión máx. rodilla der. | 30 | -0,61 ° | 0,68 ° | 2,13 ° | 0 |
| Sentadilla lateral · repeticiones | 30 | 0  | 0  | 0  | 0 |
| Sentadilla lateral · profundidad | 30 | -0,11 ° | 0,23 ° | 0,51 ° | 0 |
| Sentadilla frontal · profundidad estimada | 30 | -0,06 ° | 0,27 ° | 0,58 ° | 0 |
| Silla ×5 · repeticiones | 30 | 0  | 0  | 0  | 0 |
| Silla ×5 · tiempo por repetición | 30 | 0 s | 0,004 s | 0,009 s | 0 |
| Equilibrio · oscilación RMS | 30 | 0 ° | 0,01 ° | 0,03 ° | 0 |

Esto verifica que el procesado (filtrado, eventos, ciclos, escala y estadística) recupera los valores cuando la pose de entrada es conocida. No sustituye a una validación clínica frente a un sistema de captura 3D, que mediría además el error del propio modelo de pose.

### Errores encontrados gracias a esta verificación

- **Referencia izquierda/derecha invertida.** Si el primer fotograma llegaba con las piernas intercambiadas, la corrección por continuidad arrastraba el error a toda la secuencia (caso 21: error de 7° en la rodilla). Ahora, si hay que corregir más de la mitad de los fotogramas, se respeta la etiqueta mayoritaria del modelo. Error máximo de rodilla: de 7,1° a 2,4°. Hay una prueba de regresión en `tests/metrics.test.js`.
- **Frecuencia de muestreo sesgada.** Con tiempos redondeados al milisegundo, la mediana de los intervalos daba 30,3 Hz en lugar de 30 Hz (error del 1 % en cadencia). Ahora se usa la frecuencia media exacta.

## Prueba con vídeo real

Clip de 4,6 s de una persona caminando en vista lateral (exterior, cámara de móvil, 30 Hz), recortado del vídeo de demostración del proyecto Sports2D. Sin valores de referencia de laboratorio, así que solo sirve para comprobar que la cadena funciona con datos reales:

- Persona detectada en el 84 % de los fotogramas; vista clasificada como lateral (índice 0,15).
- 3 zancadas completas detectadas (1 izquierda, 2 derechas) con el método de Zeni.
- Velocidad 1,26 ± 0,03 m/s (con una talla supuesta de 165 cm), cadencia 98 ± 1 pasos/min, duración de zancada 1,22 ± 0,01 s: valores dentro de lo esperable para marcha a ritmo cómodo.
- Curvas de rodilla por ciclo con la forma típica (pico de respuesta a la carga ≈ 20–25° y pico de oscilación ≈ 50–66°).
- Fase de apoyo y doble apoyo salen algo altos (65 % y 31 %): con pose 2D el despegue tiende a detectarse con algún fotograma de retraso, por eso esas variables tienen fiabilidad máxima «media».
