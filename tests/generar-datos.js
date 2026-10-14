// Regenera examples/datos/marcha-lateral.analisis.{json,csv} con el motor actual a partir de los puntos reales del vídeo.
// Uso: node tests/generar-datos.js   (también lo ejecuta npm run ejemplos)
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('../js/metrics.js');

const DIR = path.join(__dirname, '../examples/datos');
const src = JSON.parse(fs.readFileSync(path.join(DIR, 'marcha-lateral.landmarks.json'), 'utf8'));
const prevPath = path.join(DIR, 'marcha-lateral.analisis.json');
const prev = fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath, 'utf8')) : {};

// Mismo paciente supuesto que el ejemplo de la app: 30 años, mujer, 165 cm
const meta = Object.assign({}, src.meta, { model: 'Full', patient: { heightCm: 165, age: 30, sex: 'F' } });
const res = M.analyze('gait', src.frames, meta);
const a = Object.assign(res, {
  id: prev.id || 'ejemplo-marcha', patientId: 'sample-p', date: prev.date || new Date().toISOString(),
  source: 'marcha-lateral.webm', notes: '', duration: res.quality.duration,
  replay: prev.replay || null, // la secuencia comprimida se conserva recortada (solo enseña el formato)
});
fs.writeFileSync(prevPath, JSON.stringify(a, null, 1) + '\n');

// Misma exportación que el botón «Descargar datos del análisis (CSV)» de la app
const num = (v) => (v == null ? '' : String(v).replace('.', ','));
const keys = Object.keys(a.series).filter((k) => k !== 't');
const lines = [`# MotionClin · Paciente del vídeo de ejemplo · Marcha · ${a.date.slice(0, 10)} · ${a.fs} Hz · filtro ${a.fc} Hz`, ['t (s)', ...keys].join(';')];
a.series.t.forEach((t, i) => lines.push([num(t), ...keys.map((k) => num(a.series[k][i]))].join(';')));
lines.push('', '# Eventos (s)');
for (const [k, v] of Object.entries(a.events || {})) lines.push([k, ...(v || []).map(num)].join(';'));
const ck = Object.keys(a.cycles || {}).filter((k) => a.cycles[k] && a.cycles[k].mean);
lines.push('', '# Ciclo promedio (0–100 %)', ['%', ...ck.flatMap((k) => [k + ' media', k + ' DE'])].join(';'));
for (let i = 0; i < 51; i++) lines.push([i * 2, ...ck.flatMap((k) => [num(a.cycles[k].mean[i]), num(a.cycles[k].sd[i])])].join(';'));
lines.push('', '# Métricas', 'Parámetro;Media;DE;n;Unidad;Referencia;Valoración;Fiabilidad');
for (const m of a.metrics) lines.push([m.label, num(m.value), num(m.sd), m.n == null ? '' : m.n, m.unit, m.ref ? m.ref.text : '', m.eval || '', m.rel || ''].join(';'));
fs.writeFileSync(path.join(DIR, 'marcha-lateral.analisis.csv'), '﻿' + lines.join('\n'));
console.log('✓ examples/datos/marcha-lateral.analisis.json y .csv', `(${a.counts.strides} zancadas, ${a.main.value} m/s)`);
