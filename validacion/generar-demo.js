// Genera un conjunto de datos emparejados de DEMOSTRACIÓN para probar validacion/concordancia.js.
// «Laboratorio» = valores verdaderos del simulador; «MotionClin» = el motor analizando el mismo movimiento con
// ruido de posición, intercambios izquierda/derecha y un error sistemático en la rodilla que imita al modelo de pose.
// No es una validación: sirve para enseñar el formato y el informe. Uso: node validacion/generar-demo.js
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('../js/metrics.js');
const S = require('../js/synth.js');

function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const r = rng(2024), U = (a, b) => a + (b - a) * r();
const pick = (a) => ({ metrics: Object.fromEntries(a.metrics.filter((m) => typeof m.value === 'number').map((m) => [m.key, m.value])), cycles: Object.fromEntries(Object.entries(a.cycles || {}).filter(([, v]) => v && v.mean).map(([k, v]) => [k, v.mean])), events: a.events });
// Imita un sesgo del modelo de pose: desplaza la rodilla hacia delante (sobrestima la flexión en apoyo)
const poseBias = (frames, px) => frames.map((f) => ({ t: f.t, lm: f.lm && f.lm.map((p, k) => (k === 25 || k === 26 ? [p[0] + px / 1280, p[1], p[2], p[3]] : p)) }));

const shiftIC = (x, d) => { for (const k of ['kneeICL', 'kneeICR']) if (typeof x.metrics[k] === 'number') x.metrics[k] += d; return x; };
const sujetos = [];
for (let i = 0; i < 24; i++) {
  const o = { cadence: U(95, 125), speed: U(0.8, 1.5), kneeScaleL: U(0.75, 1.05), kneeScaleR: U(0.75, 1.05), heightCm: Math.round(U(155, 190)), dur: 9, seed: 7000 + i, cycleVar: 0.03 };
  const meta = (g) => Object.assign({}, g.meta, { patient: { heightCm: o.heightCm, age: 40 } });
  const lab = S.gait(Object.assign({}, o, { noise: 0, swapRate: 0 }));
  const vid = S.gait(Object.assign({}, o, { noise: U(1.5, 3.5), swapRate: U(0, 0.02) }));
  const vid2 = S.gait(Object.assign({}, o, { noise: U(1.5, 3.5), swapRate: U(0, 0.02), seed: 9000 + i }));
  const refA = M.analyze('gait', lab.frames, meta(lab));
  const labRes = pick(refA);
  Object.assign(labRes.metrics, { cadence: o.cadence, speed: o.speed, strideTime: 120 / o.cadence, kneeSwingL: lab.truth.kneeSwingL, kneeSwingR: lab.truth.kneeSwingR });
  // El laboratorio también mide con error: resolución de pasarela instrumentada / plataforma (ruido gaussiano pequeño)
  const G = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
  const JIT = { speed: 0.015, cadence: 0.6, strideTime: 0.006, strideLen: 0.015, stanceL: 0.8, stanceR: 0.8, ds: 1.0, kneeICL: 1.5, kneeICR: 1.5, kneeSwingL: 0.8, kneeSwingR: 0.8 };
  for (const [k, s] of Object.entries(JIT)) if (typeof labRes.metrics[k] === 'number') labRes.metrics[k] += s * G();
  // Eventos de laboratorio (plataforma de fuerzas): instante real ± unos ms
  if (labRes.events) for (const k of Object.keys(labRes.events)) if (Array.isArray(labRes.events[k])) labRes.events[k] = labRes.events[k].map((t) => (typeof t === 'number' ? t + 0.012 * G() : t));
  // Variación individual del ángulo en contacto inicial (el simulador lo fija): se suma igual a laboratorio y vídeo
  const icShift = U(-4, 6);
  for (const k of ['kneeICL', 'kneeICR']) labRes.metrics[k] += icShift;
  sujetos.push({
    id: `S${String(i + 1).padStart(2, '0')}`,
    laboratorio: labRes,
    motionclin: shiftIC(pick(M.analyze('gait', poseBias(vid.frames, U(1, 4)), meta(vid))), icShift),
    motionclinRetest: shiftIC(pick(M.analyze('gait', poseBias(vid2.frames, U(1, 4)), meta(vid2))), icShift),
  });
}
const data = {
  estudio: 'Demostración con sujetos simulados (no es una validación)',
  referencia: 'valores verdaderos del simulador',
  aviso: 'DATOS SIMULADOS. Este informe enseña el formato y el análisis; sus números no describen la exactitud de MotionClin con personas reales.',
  sujetos,
};
const out = path.join(__dirname, 'demo-datos.json');
fs.writeFileSync(out, JSON.stringify(data));
console.log('Datos de demostración en', out, `(${sujetos.length} sujetos)`);
