# Pruebas

| Archivo | Qué hace | Cómo se ejecuta |
|---|---|---|
| `metrics.test.js` | 18 pruebas del motor con valores conocidos: estadística, filtrado, cada prueba clínica, intercambios izquierda/derecha, remuestreo, comparación entre sesiones y compresión de la secuencia | `npm test` · con cobertura: `npm run coverage` |
| `validation.js` | Verificación con 30 sujetos simulados por prueba; imprime la tabla de [`VALIDACION.md`](../VALIDACION.md) | `npm run validate` |
| `e2e.js` | Prueba extremo a extremo en Chromium: crea un paciente, analiza un vídeo real, revisa, compara, descarga PDF y CSV y comprueba la vista móvil | servidor en `:8765` y `node tests/e2e.js <vídeo>` (necesita `playwright-core`) |
| `extract.js` + `harness.html` | Extrae con MediaPipe los puntos de un vídeo a JSON, para analizarlos en Node (así se generó `examples/datos/marcha-lateral.landmarks.json`) | servidor en `:8765` y `node tests/extract.js <vídeo> <salida.json>` |

El simulador de movimiento (`js/synth.js`) genera landmarks en el mismo formato que MediaPipe a partir de parámetros conocidos, con ruido, oclusiones e intercambios de etiquetas. Es lo que permite comparar cada número del motor con su valor verdadero.
