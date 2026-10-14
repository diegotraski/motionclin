// Ejemplo: usar el motor de MotionClin sin navegador.
// Lee los 33 puntos por fotograma que MediaPipe extrajo de un vídeo real de marcha y calcula las métricas.
// Ejecutar: node examples/analizar-desde-node.js
const path = require('path');
const M = require('../js/metrics.js');
const S = require('../js/synth.js');

const datos = require(path.join(__dirname, 'datos', 'marcha-lateral.landmarks.json'));
const paciente = { age: 30, sex: 'F', heightCm: 165 }; // supuestos para el ejemplo

const r = M.analyze('gait', datos.frames, { ...datos.meta, patient: paciente });

const fmt = (m) => (m.value == null ? '–' : `${m.value}${m.sd != null ? ' ± ' + m.sd : ''} ${m.unit}`.trim());
console.log(`\nMarcha · vista ${r.view} · ${r.fs} Hz · ${r.counts.strides} zancadas · calidad ${r.quality.score} %\n`);
let grupo = null;
for (const m of r.metrics) {
  if (m.group !== grupo) { grupo = m.group; console.log(`\n  ${grupo.toUpperCase()}`); }
  const ev = m.eval ? { normal: 'en rango', low: 'BAJO', high: 'ALTO' }[m.eval] : '';
  console.log(`  ${m.label.padEnd(52)} ${fmt(m).padEnd(20)} ${(m.ref ? m.ref.text : '').padEnd(34)} ${ev.padEnd(9)} fiabilidad ${m.rel}`);
}
console.log('\n  Eventos (s): contacto inicial izq.', r.events.hsL.join(', '), '· der.', r.events.hsR.join(', '));

// Comparar dos sesiones: el motor decide si el cambio es real (Welch + cambio mínimo relevante)
const meta = S.gait({}).meta;
const antes = M.analyze('gait', S.gait({ speed: 0.95, cadence: 100, kneeScaleL: 0.7, cycleVar: 0.04, stepJitter: 0.03, dur: 10, seed: 1 }).frames, meta);
const despues = M.analyze('gait', S.gait({ speed: 1.2, cadence: 108, kneeScaleL: 0.95, cycleVar: 0.04, stepJitter: 0.03, dur: 10, seed: 2 }).frames, meta);
console.log('\nComparación de dos sesiones simuladas (antes → después):');
for (const c of M.compare(antes, despues).filter((x) => ['speed', 'cadence', 'kneeSwingL', 'stanceL'].includes(x.key))) {
  const veredicto = c.relevant ? (c.direction === 'mejora' ? 'MEJORA' : c.direction === 'empeora' ? 'EMPEORA' : 'CAMBIO') : 'sin cambio relevante';
  console.log(`  ${c.label.padEnd(44)} Δ ${(c.diff > 0 ? '+' : '') + c.diff.toFixed(2)} ${c.unit}`.padEnd(70) + `p = ${c.p < 0.001 ? '< 0,001' : c.p.toFixed(3)}  d = ${c.d.toFixed(1)}  → ${veredicto}`);
}
console.log('');
