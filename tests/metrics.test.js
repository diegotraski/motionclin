// Validación del motor con movimiento sintético de valores conocidos.
// Ejecutar: node --test tests/   (cobertura: node --test --experimental-test-coverage tests/)
const assert = require('assert');
const M = require('../js/metrics.js');
const S = require('../js/synth.js');

const { test } = require('node:test');
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
const get = (r, k) => { const m = r.metrics.find((x) => x.key === k); return m ? m.value : undefined; };

// ---------- estadística y señal ----------
test('t de Student: p conocidos', () => {
  near(M.tTestP(2.228, 10), 0.05, 0.001, 'p(t=2,228; gl=10)');
  near(M.tTestP(1.96, 1e6), 0.05, 0.001, 'p(t=1,96; gl→∞)');
  near(M.tTestP(0, 5), 1, 1e-9, 'p(t=0)');
});
test('Welch: diferencia clara y ausencia de diferencia', () => {
  const w = M.welch([10, 11, 12, 11, 10, 12], [14, 15, 13, 15, 14, 16]);
  assert.ok(w.p < 0.001 && w.diff > 3, `p=${w.p}`);
  const w2 = M.welch([10, 11, 12, 11], [11, 10, 12, 11]);
  assert.ok(w2.p > 0.5, `p=${w2.p}`);
});
test('Regresión lineal: pendiente y p', () => {
  const r = M.linreg([0, 1, 2, 3, 4, 5], [1, 3.1, 4.9, 7.2, 8.9, 11.1]);
  near(r.slope, 2, 0.1, 'pendiente'); assert.ok(r.p < 0.001 && r.r2 > 0.99);
});
test('Butterworth fase cero: atenúa ruido sin desfasar', () => {
  const fs = 30, x = [], clean = [];
  for (let i = 0; i < 300; i++) { const t = i / fs, c = Math.sin(2 * Math.PI * 1 * t); clean.push(c); x.push(c + 0.3 * Math.sin(2 * Math.PI * 12 * t)); }
  const y = M.lowpass(x, fs, 6);
  const err = Math.sqrt(y.slice(30, 270).reduce((s, v, i) => s + (v - clean[i + 30]) ** 2, 0) / 240);
  assert.ok(err < 0.03, `error RMS ${err.toFixed(3)}`);
  const pk = (a) => a.slice(30, 60).indexOf(Math.max(...a.slice(30, 60)));
  assert.strictEqual(pk(y), pk(clean));
});
test('Relleno de huecos cortos', () => {
  assert.deepStrictEqual(M.fillGaps([1, null, 3, null, null, null, 7], 2), [1, 2, 3, null, null, null, 7]);
});

// ---------- marcha ----------
test('Marcha sana: cadencia, velocidad, duración de zancada y rodilla', () => {
  const g = S.gait({ cadence: 110, speed: 1.3, dur: 7, seed: 11 });
  const r = M.analyze('gait', g.frames, g.meta);
  console.log('    ', JSON.stringify(r.counts), '· vista', r.view, '· fs', r.fs, '· apoyo', get(r, 'stanceL'), '· DS', get(r, 'ds'));
  near(get(r, 'cadence'), 110, 3, 'cadencia');
  near(get(r, 'strideTime'), g.truth.strideTime, 0.04, 'duración zancada');
  near(get(r, 'speed'), 1.3, 0.13, 'velocidad (±10 %)');
  near(get(r, 'kneeSwingL'), g.truth.kneeSwingL, 6, 'rodilla izq. oscilación');
  assert.ok(get(r, 'gvsL') < 7, `GVS ${get(r, 'gvsL')}`);
  assert.ok(get(r, 'siStep') < 5, `IS paso ${get(r, 'siStep')}`);
  assert.ok(r.counts.strides >= 8);
});
test('Marcha con déficit de flexión derecha: detecta asimetría y GVS alto', () => {
  const g = S.gait({ cadence: 100, speed: 0.9, kneeScaleR: 0.65, dur: 8, seed: 12, age: 70, sex: 'F' });
  const r = M.analyze('gait', g.frames, g.meta);
  const kL = get(r, 'kneeSwingL'), kR = get(r, 'kneeSwingR');
  near(kR, g.truth.kneeSwingR, 6, 'rodilla der.');
  assert.ok(kL - kR > 15, `diferencia ${kL} − ${kR}`);
  assert.ok(get(r, 'siKnee') > 20, `IS rodilla ${get(r, 'siKnee')}`);
  assert.ok(get(r, 'gvsR') > 8 && get(r, 'gvsR') > get(r, 'gvsL') + 3, `GVS der. ${get(r, 'gvsR')} vs izq. ${get(r, 'gvsL')}`);
  assert.ok(r.flags.some((f) => /Velocidad < 1,0/.test(f)), 'alerta de velocidad');
  assert.strictEqual(r.status, 'review');
});
test('Marcha hacia la izquierda y con intercambios L/R del modelo', () => {
  const g = S.gait({ dir: -1, swapRate: 0.04, dur: 7, seed: 13 });
  const r = M.analyze('gait', g.frames, g.meta);
  console.log('     intercambios corregidos:', r.quality.swaps);
  near(get(r, 'cadence'), 110, 4, 'cadencia');
  assert.ok(r.quality.swaps > 0);
  near(get(r, 'kneeSwingL'), g.truth.kneeSwingL, 8, 'rodilla izq.');
});
test('Primer fotograma con piernas intercambiadas: no arrastra el error', () => {
  const g = S.gait({ dur: 8, seed: 41 });
  const f0 = g.frames[0].lm; for (const [l, r] of [[25, 26], [27, 28], [29, 30], [31, 32]]) { const t = f0[l]; f0[l] = f0[r]; f0[r] = t; }
  const r = M.analyze('gait', g.frames, g.meta);
  assert.ok(r.quality.swaps <= 2, `correcciones ${r.quality.swaps}`);
  near(get(r, 'kneeSwingL'), g.truth.kneeSwingL, 4, 'rodilla izq.');
});

test('Marcha en cinta: detecta ciclos sin desplazamiento y usa la velocidad introducida', () => {
  const g = S.gait({ treadmill: true, cadence: 104, dur: 9, seed: 51 });
  const r0 = M.analyze('gait', g.frames, g.meta);
  assert.ok(r0.counts.treadmill, 'cinta detectada');
  near(get(r0, 'cadence'), 104, 3, 'cadencia');
  assert.strictEqual(get(r0, 'speed'), undefined, 'sin velocidad de cinta no se inventa la velocidad');
  const r1 = M.analyze('gait', g.frames, Object.assign({}, g.meta, { treadmillSpeed: 1.1 }));
  near(get(r1, 'strideLen'), 1.1 * (120 / 104), 0.05, 'longitud de zancada = velocidad × duración');
  near(get(r1, 'kneeSwingL'), g.truth.kneeSwingL, 5, 'rodilla');
});

test('Cámara con fotogramas irregulares (remuestreo)', () => {
  const g = S.gait({ fps: 60, dur: 7, seed: 14 });
  const jitter = g.frames.filter((_, i) => i % 2 === 0 || i % 7 === 3).map((f, i) => ({ t: f.t + (i % 3) * 0.004, lm: f.lm }));
  const r = M.analyze('gait', jitter, g.meta);
  near(get(r, 'cadence'), 110, 4, 'cadencia');
});
test('Comparación entre sesiones: mejora significativa vs. misma condición', () => {
  const meta = S.gait({}).meta;
  const a = M.analyze('gait', S.gait({ speed: 0.9, cadence: 100, seed: 21, dur: 8, stepJitter: 0.02 }).frames, meta);
  const b = M.analyze('gait', S.gait({ speed: 1.25, cadence: 112, seed: 22, dur: 8, stepJitter: 0.02 }).frames, meta);
  const sp = M.compare(a, b).find((x) => x.key === 'speed');
  assert.ok(sp && sp.diff > 0.25 && sp.p < 0.001, `p=${sp && sp.p}`);
  const b2 = M.analyze('gait', S.gait({ speed: 0.9, cadence: 100, seed: 23, dur: 8, stepJitter: 0.02 }).frames, meta);
  const sp2 = M.compare(a, b2).find((x) => x.key === 'speed');
  assert.ok(!sp2.relevant, `misma condición: Δ=${sp2.diff.toFixed(3)} p=${sp2.p} → no debe ser un cambio relevante`);
  assert.ok(sp.relevant, 'la mejora sí es relevante');
});

// ---------- sentadilla ----------
test('Sentadilla lateral: repeticiones y profundidad', () => {
  const s = S.squat({ reps: 4, depth: 100 });
  const r = M.analyze('squat', s.frames, s.meta);
  assert.strictEqual(r.view, 'lateral');
  assert.strictEqual(get(r, 'reps'), 4);
  near(get(r, 'depth'), s.truth.depth, 5, 'profundidad');
});
test('Sentadilla frontal con valgo: FPPA positivo; sin valgo ≈ 0', () => {
  const s = S.squat({ view: 'frontal', reps: 3, depth: 95, kneeIn: 0.04 });
  const r = M.analyze('squat', s.frames, s.meta);
  assert.strictEqual(r.view, 'frontal');
  assert.strictEqual(get(r, 'reps'), 3);
  assert.ok(get(r, 'fppaL') > 10 && get(r, 'fppaR') > 10, `FPPA ${get(r, 'fppaL')} / ${get(r, 'fppaR')}`);
  near(get(r, 'depth'), s.truth.depth, 12, 'profundidad estimada');
  const r2 = M.analyze('squat', S.squat({ view: 'frontal', reps: 3, depth: 95, kneeIn: 0 }).frames, s.meta);
  assert.ok(Math.abs(get(r2, 'fppaL')) < 5, `sin valgo: ${get(r2, 'fppaL')}`);
});

// ---------- levantarse de la silla ----------
test('5 repeticiones sentarse-levantarse: tiempo y normativa por edad', () => {
  const s = S.sts({ period: 2.8, age: 75 });
  const r = M.analyze('sts', s.frames, s.meta);
  console.log('     tiempo 5 rep.:', get(r, 'time5'), 's · esperado ≈', (4.25 * 2.8).toFixed(1));
  assert.strictEqual(get(r, 'reps'), 5);
  near(get(r, 'time5'), 4.25 * 2.8, 0.6, 'tiempo');
  near(get(r, 'cycle'), 2.8, 0.1, 'tiempo por repetición');
  const slow = M.analyze('sts', S.sts({ period: 3.8, age: 75 }).frames, s.meta);
  assert.ok(slow.flags.some((f) => /15 s/.test(f)), 'alerta > 15 s');
});

// ---------- equilibrio ----------
test('Equilibrio: más oscilación → mayor velocidad y RMS', () => {
  const meta = S.balance({}).meta;
  const a = M.analyze('balance', S.balance({ ampDeg: 0.3 }).frames, meta);
  const b = M.analyze('balance', S.balance({ ampDeg: 1.2, seed: 5 }).frames, meta);
  console.log('     vel', get(a, 'vel'), '→', get(b, 'vel'), '°/s · RMS', get(a, 'rms'), '→', get(b, 'rms'));
  assert.ok(get(b, 'vel') > 2.5 * get(a, 'vel'));
  near(get(a, 'rms'), 0.3 / Math.SQRT2, 0.15, 'RMS de una senoide');
  const c = M.compare(a, b).find((x) => x.key === 'vel');
  assert.ok(c && c.p < 0.01);
});
test('Apoyo monopodal: tiempo hasta apoyar el pie', () => {
  const s = S.balance({ mono: 'L', monoUntil: 12, dur: 16, age: 72 });
  const r = M.analyze('balance', s.frames, s.meta);
  near(get(r, 'monoTime'), 12, 0.6, 'tiempo monopodal');
  assert.ok(/Monopodal/.test(get(r, 'stance')));
});

test('Secuencia guardada: compacta y fiel (< 0,1 px de error)', () => {
  const R = require('../js/replay.js');
  const g = S.gait({ dur: 10, fps: 30, seed: 31 });
  const enc = R.encode(g.frames, { width: 1280, height: 720 }), dec = R.decode(enc);
  let mx = 0; dec.forEach((f, i) => f.lm.forEach((p, k) => { mx = Math.max(mx, Math.abs(p[0] - g.frames[i].lm[k][0]) * 1280, Math.abs(p[1] - g.frames[i].lm[k][1]) * 720); }));
  const kb = JSON.stringify(enc).length / 1024;
  console.log(`     ${enc.n} fotogramas · ${kb.toFixed(0)} kB · error máx. ${mx.toFixed(3)} px`);
  assert.ok(mx < 0.1 && kb < 120);
  const r2 = M.analyze('gait', dec, g.meta), r1 = M.analyze('gait', g.frames, g.meta);
  near(get(r2, 'cadence'), get(r1, 'cadence'), 0.5, 'mismo resultado tras guardar y recuperar');
});

test('Sin persona → error claro', () => {
  assert.throws(() => M.analyze('gait', Array.from({ length: 50 }, (_, i) => ({ t: i / 10, lm: null })), { width: 1, height: 1 }), /No se ha detectado/);
});


// ---------- referencias de laboratorio (Bovi et al., 2011) ----------
test('Referencias de laboratorio: grupo por edad y clase por velocidad normalizada por la talla', () => {
  const N = require('../js/norms.js');
  assert.strictEqual(N.select(12).group, 'Young');
  assert.strictEqual(N.select(40).cls, 'Natural', 'sin velocidad → velocidad libre');
  assert.strictEqual(N.select(40, 0.75, 170).cls, 'XS');
  assert.strictEqual(N.select(40, 1.5, 170).cls, 'M');
  assert.strictEqual(N.select(40, 2.0, 170).cls, 'L');
  const k = N.select(40).data.knee;
  assert.strictEqual(k.mean.length, 51); assert.ok(Math.max(...k.mean) > 55 && Math.max(...k.mean) < 70, 'pico de oscilación plausible');
});
test('Vídeo real: con la referencia ajustada a la velocidad, apoyo y doble apoyo quedan en rango', () => {
  const R = require('../examples/datos/marcha-lateral.landmarks.json');
  const r = M.analyze('gait', R.frames, Object.assign({}, R.meta, { patient: { heightCm: 165, age: 30, sex: 'F' } }));
  assert.ok(r.reference && r.reference.source === 'bovi', 'referencia de laboratorio');
  for (const k of ['stanceR', 'ds']) assert.strictEqual(r.metrics.find((m) => m.key === k).eval, 'normal', k);
});

// ---------- concordancia con un laboratorio (js/agreement.js) ----------
test('ICC: reproduce el ejemplo clásico de Shrout y Fleiss (1979)', () => {
  const A = require('../js/agreement.js');
  const Y = [[9, 2, 5, 8], [6, 1, 3, 2], [8, 4, 6, 8], [7, 1, 2, 6], [10, 5, 6, 9], [6, 2, 4, 7]];
  near(A.icc21(Y), 0.29, 0.01, 'ICC(2,1)');
  near(A.icc31(Y), 0.71, 0.01, 'ICC(3,1)');
});
test('Bland-Altman, ICC con bootstrap, CMC, eventos y MDC', () => {
  const A = require('../js/agreement.js');
  const truth = Array.from({ length: 30 }, (_, i) => 50 + (i % 10) * 2 + Math.floor(i / 10));
  const est = truth.map((v, i) => v + 2 + ((i * 7) % 5 - 2) * 0.5); // sesgo de +2 con error pequeño
  const ba = A.blandAltman(truth, est);
  near(ba.bias, 2, 0.2, 'sesgo'); assert.ok(ba.loaHigh - ba.loaLow < 5);
  const ic = A.icc(truth, est, { boot: 300 });
  assert.ok(ic.icc31 > 0.9 && ic.icc21 < ic.icc31, 'el sesgo sistemático baja el acuerdo absoluto, no la consistencia');
  assert.ok(ic.ci21[0] < ic.icc21 && ic.ci21[1] > ic.icc21);
  const c = Array.from({ length: 51 }, (_, k) => 30 * Math.sin((k / 50) * Math.PI * 2) + 30);
  near(A.cmc([c, c]), 1, 1e-9, 'CMC curvas idénticas');
  assert.ok(A.cmc([c, c.map((v) => v + 5)]) < A.cmc([c, c.map((v) => v + 1)]), 'más desplazamiento → menor CMC');
  const ev = A.eventErrors([1, 2, 3], [1.02, 2.01, 3.5]);
  assert.strictEqual(ev.n, 2); assert.strictEqual(ev.missed, 1); near(ev.mae, 15, 0.01, 'ms');
  const m = A.mdc([10, 12, 11, 13, 12], [11, 12, 10, 14, 12]); assert.ok(m.mdc95 > m.sem);
});
