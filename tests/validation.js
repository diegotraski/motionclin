// Verificación del software: error de cada variable frente al valor verdadero en sujetos simulados.
// Ejecutar: node tests/validation.js > VALIDACION_resultados.md
const M = require('../js/metrics.js');
const S = require('../js/synth.js');

function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const r = rng(12345), U = (a, b) => a + (b - a) * r();
const get = (res, k) => { const m = res.metrics.find((x) => x.key === k); return m ? m.value : null; };
const rows = {};
function add(name, unit, est, truth) {
  if (est == null || truth == null) { (rows[name] = rows[name] || { unit, e: [], miss: 0 }).miss++; return; }
  (rows[name] = rows[name] || { unit, e: [], miss: 0 }).e.push(est - truth);
}
const N = 30;
for (let i = 0; i < N; i++) {
  const g = S.gait({ cadence: U(90, 125), speed: U(0.7, 1.5), kneeScaleL: U(0.6, 1.1), kneeScaleR: U(0.6, 1.1), dir: r() < 0.5 ? 1 : -1, noise: U(1, 3), swapRate: U(0, 0.03), cycleVar: 0.03, dur: 9, seed: 1000 + i });
  const a = M.analyze('gait', g.frames, g.meta);
  add('Marcha · cadencia', 'pasos/min', get(a, 'cadence'), g.truth.cadence);
  add('Marcha · duración de zancada', 's', get(a, 'strideTime'), g.truth.strideTime);
  add('Marcha · velocidad', 'm/s', get(a, 'speed'), g.truth.speed);
  add('Marcha · flexión máx. rodilla izq.', '°', get(a, 'kneeSwingL'), g.truth.kneeSwingL);
  add('Marcha · flexión máx. rodilla der.', '°', get(a, 'kneeSwingR'), g.truth.kneeSwingR);
  const sl = S.squat({ view: 'lateral', depth: U(60, 120), reps: 4, noise: U(1, 3), seed: 2000 + i });
  const b = M.analyze('squat', sl.frames, sl.meta);
  add('Sentadilla lateral · repeticiones', '', get(b, 'reps'), sl.truth.reps);
  add('Sentadilla lateral · profundidad', '°', get(b, 'depth'), sl.truth.depth);
  const sf = S.squat({ view: 'frontal', depth: U(70, 110), kneeIn: U(0, 0.05), reps: 4, noise: U(1, 3), seed: 3000 + i });
  const c = M.analyze('squat', sf.frames, sf.meta);
  add('Sentadilla frontal · profundidad estimada', '°', get(c, 'depth'), sf.truth.depth);
  const per = U(1.8, 4);
  const st = S.sts({ period: per, noise: U(1, 3), seed: 4000 + i });
  const d = M.analyze('sts', st.frames, st.meta);
  add('Silla ×5 · repeticiones', '', get(d, 'reps'), 5);
  add('Silla ×5 · tiempo por repetición', 's', get(d, 'cycle'), per);
  const amp = U(0.2, 1.5);
  const bl = S.balance({ ampDeg: amp, noise: U(0.5, 2), dur: 25, seed: 5000 + i });
  const e = M.analyze('balance', bl.frames, bl.meta);
  // RMS verdadero de la oscilación sintética (senoide + deriva): se calcula sobre la señal generada sin ruido
  const clean = S.balance({ ampDeg: amp, noise: 0, dur: 25, seed: 5000 + i });
  const th = clean.frames.map((f) => { const sx = (f.lm[11][0] + f.lm[12][0]) / 2 * 1280, sy = (f.lm[11][1] + f.lm[12][1]) / 2 * 720, ax = (f.lm[27][0] + f.lm[28][0]) / 2 * 1280, ay = (f.lm[27][1] + f.lm[28][1]) / 2 * 720; return Math.atan2(sx - ax, ay - sy) * 180 / Math.PI; });
  const m0 = th.reduce((s, v) => s + v, 0) / th.length, rmsTrue = Math.sqrt(th.reduce((s, v) => s + (v - m0) ** 2, 0) / th.length);
  add('Equilibrio · oscilación RMS', '°', get(e, 'rms'), rmsTrue);
}

const f = (v, d = 2) => (v == null ? '–' : (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ','));
console.log(`# Verificación del motor de análisis\n\n${N} sujetos simulados por prueba, con parámetros aleatorios, ruido de posición de 1–3 px, intercambios izquierda/derecha del 0–3 % de los fotogramas en marcha y variabilidad entre ciclos. Error = estimado − verdadero.\n`);
console.log('| Variable | n | Sesgo (media del error) | Error absoluto medio | Error máx. | Fallos |');
console.log('|---|---|---|---|---|---|');
for (const [k, v] of Object.entries(rows)) {
  const e = v.e, n = e.length, bias = e.reduce((s, x) => s + x, 0) / n, mae = e.reduce((s, x) => s + Math.abs(x), 0) / n, mx = Math.max(...e.map(Math.abs));
  const d = v.unit === 's' || v.unit === 'm/s' ? 3 : 2; console.log(`| ${k} | ${n} | ${f(bias, d)} ${v.unit} | ${f(mae, d)} ${v.unit} | ${f(mx, d)} ${v.unit} | ${v.miss} |`);
}
console.log(`\nEsto verifica que el procesado (filtrado, eventos, ciclos, escala y estadística) recupera los valores cuando la pose de entrada es conocida. No sustituye a una validación clínica frente a un sistema de captura 3D, que mediría además el error del propio modelo de pose.`);
