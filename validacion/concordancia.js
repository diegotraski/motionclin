// Informe de concordancia MotionClin frente a un laboratorio de análisis del movimiento.
// Uso: node validacion/concordancia.js datos.json [informe.md]
// Formato de datos.json: ver validacion/README.md (cada sujeto con «motionclin» y «laboratorio»; «motionclinRetest» opcional).
'use strict';
const fs = require('fs');
const A = require('../js/agreement.js');

const NAMES = {
  speed: ['Velocidad', 'm/s', 2], cadence: ['Cadencia', 'pasos/min', 1], strideTime: ['Duración de zancada', 's', 3], strideLen: ['Longitud de zancada', 'm', 2],
  stanceL: ['Fase de apoyo izq.', '%', 1], stanceR: ['Fase de apoyo der.', '%', 1], ds: ['Doble apoyo', '%', 1],
  kneeSwingL: ['Rodilla izq.: flexión máx. en oscilación', '°', 1], kneeSwingR: ['Rodilla der.: flexión máx. en oscilación', '°', 1],
  kneeICL: ['Rodilla izq.: contacto inicial', '°', 1], kneeICR: ['Rodilla der.: contacto inicial', '°', 1],
};
const f = (v, d = 2) => (v == null || !isFinite(v) ? '–' : (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ','));
const metricsOf = (x) => (Array.isArray(x.metrics) ? Object.fromEntries(x.metrics.map((m) => [m.key, m.value])) : x.metrics || {});
const curveOf = (x, k) => { const c = x.cycles && x.cycles[k]; return Array.isArray(c) ? c : c && c.mean ? c.mean : null; };
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length, sdv = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };

function report(data) {
  const S = data.sujetos, out = [];
  out.push(`# Concordancia MotionClin frente a laboratorio`, '', `**Estudio:** ${data.estudio || '—'}  `, `**Sujetos:** ${S.length}  `, `**Referencia:** ${data.referencia || 'sistema de laboratorio'}`, '');
  if (data.aviso) out.push(`> ${data.aviso}`, '');
  // 1. Parámetros
  out.push('## 1. Parámetros', '', 'Diferencia = MotionClin − laboratorio. ICC(2,1): acuerdo absoluto; IC 95 % por bootstrap. Interpretación de Koo y Li (2016) sobre el límite inferior del IC.', '');
  out.push('| Variable | n | Laboratorio | MotionClin | Sesgo [IC 95 %] | Límites de acuerdo | ICC(2,1) [IC 95 %] | Acuerdo |', '|---|---|---|---|---|---|---|---|');
  const flatVars = [];
  for (const [k, [name, unit, d]] of Object.entries(NAMES)) {
    const lab = S.map((s) => metricsOf(s.laboratorio)[k]), mc = S.map((s) => metricsOf(s.motionclin)[k]);
    const ba = A.blandAltman(lab, mc); if (!ba) continue;
    const pl = lab.filter((v, i) => isFinite(v) && isFinite(mc[i])), pm = mc.filter((v, i) => isFinite(v) && isFinite(lab[i]));
    // Sin variabilidad entre sujetos en la referencia el ICC no es interpretable (Koo y Li, 2016): se queda solo Bland-Altman
    const flat = sdv(pl) < 1e-6 * Math.max(1, Math.abs(mean(pl))) || sdv(pl) < Math.pow(10, -d);
    const ic = flat ? null : A.icc(lab, mc, { boot: 1000 });
    if (flat) flatVars.push(name);
    out.push(`| ${name} (${unit}) | ${ba.n} | ${f(mean(pl), d)} ± ${f(sdv(pl), d)} | ${f(mean(pm), d)} ± ${f(sdv(pm), d)} | ${f(ba.bias, d)} [${f(ba.biasCI[0], d)}; ${f(ba.biasCI[1], d)}] | ${f(ba.loaLow, d)} a ${f(ba.loaHigh, d)} | ${ic ? `${f(ic.icc21, 2)} [${f(ic.ci21[0], 2)}; ${f(ic.ci21[1], 2)}]` : flat ? 'n. i.*' : '–'} | ${ic ? A.iccLabel(ic.ci21[0]) : '–'} |`);
  }
  if (flatVars.length) out.push('', `\\* n. i.: no interpretable. La referencia apenas varía entre sujetos (${flatVars.join('; ')}), así que el ICC no informa del acuerdo; valen el sesgo y los límites de Bland-Altman.`);
  // 2. Curvas
  out.push('', '## 2. Curvas del ciclo', '', 'Por sujeto: RMSE y sesgo entre la curva media de MotionClin y la del laboratorio (51 puntos, 0–100 % del ciclo), y CMC (Kadaba et al., 1989). Se resume como media ± DE entre sujetos.', '');
  out.push('| Curva | n | RMSE (°) | RMSE sin sesgo (°) | Sesgo (°) | CMC |', '|---|---|---|---|---|---|');
  for (const [k, name] of [['kneeL', 'Rodilla izq.'], ['kneeR', 'Rodilla der.'], ['hipL', 'Cadera izq.'], ['hipR', 'Cadera der.']]) {
    const rows = S.map((s) => { const a = curveOf(s.laboratorio, k), b = curveOf(s.motionclin, k); if (!a || !b) return null; const e = A.curveError(a, b); return { ...e, cmc: A.cmc([a, b]) }; }).filter(Boolean);
    if (!rows.length) continue;
    const col = (x) => rows.map((r) => r[x]).filter((v) => isFinite(v));
    out.push(`| ${name} | ${rows.length} | ${f(mean(col('rmse')), 1)} ± ${f(sdv(col('rmse')), 1)} | ${f(mean(col('rmseCentered')), 1)} ± ${f(sdv(col('rmseCentered')), 1)} | ${f(mean(col('bias')), 1)} ± ${f(sdv(col('bias')), 1)} | ${f(mean(col('cmc')), 2)} |`);
  }
  // 3. Eventos
  out.push('', '## 3. Eventos de la marcha', '', 'Cada evento del laboratorio se empareja con el de MotionClin más cercano (tolerancia 150 ms).', '');
  out.push('| Evento | Emparejados | No detectados | Sesgo (ms) | Error absoluto medio (ms) |', '|---|---|---|---|---|');
  for (const [k, name] of [['hsL', 'Contacto inicial izq.'], ['hsR', 'Contacto inicial der.'], ['toL', 'Despegue izq.'], ['toR', 'Despegue der.']]) {
    let all = [], missed = 0;
    for (const s of S) { const r = s.laboratorio.events && s.laboratorio.events[k], e = s.motionclin.events && s.motionclin.events[k]; if (!r || !e) continue; const x = A.eventErrors(r, e); missed += x.missed; if (x.n) all.push(x); }
    if (!all.length) continue;
    const n = all.reduce((s2, x) => s2 + x.n, 0), bias = all.reduce((s2, x) => s2 + x.bias * x.n, 0) / n, mae = all.reduce((s2, x) => s2 + x.mae * x.n, 0) / n;
    out.push(`| ${name} | ${n} | ${missed} | ${f(bias, 0)} | ${f(mae, 0)} |`);
  }
  // 4. Fiabilidad test-retest
  const rt = S.filter((s) => s.motionclinRetest);
  if (rt.length >= 3) {
    out.push('', '## 4. Fiabilidad test-retest de MotionClin', '', 'SEM = DE de las diferencias / √2; MDC95 = 1,96 · √2 · SEM: cambio mínimo que supera el error de medida.', '', '| Variable | n | ICC(3,1) | SEM | MDC95 |', '|---|---|---|---|---|');
    for (const [k, [name, unit, d]] of Object.entries(NAMES)) {
      const a = rt.map((s) => metricsOf(s.motionclin)[k]), b = rt.map((s) => metricsOf(s.motionclinRetest)[k]);
      const m = A.mdc(a, b), ic = A.icc(a, b, { boot: 500 }); if (!m || !ic) continue;
      out.push(`| ${name} (${unit}) | ${m.n} | ${f(ic.icc31, 2)} | ${f(m.sem, d)} | ${f(m.mdc95, d)} |`);
    }
  }
  out.push('', '---', '', 'Referencias: Bland JM, Altman DG. Lancet. 1986;1(8476):307-10 · Shrout PE, Fleiss JL. Psychol Bull. 1979;86(2):420-8 · McGraw KO, Wong SP. Psychol Methods. 1996;1(1):30-46 · Koo TK, Li MY. J Chiropr Med. 2016;15(2):155-63 · Kadaba MP et al. J Orthop Res. 1989;7(6):849-60.');
  return out.join('\n');
}

if (require.main === module) {
  const [, , input, output] = process.argv;
  if (!input) { console.error('Uso: node validacion/concordancia.js datos.json [informe.md]'); process.exit(1); }
  const md = report(JSON.parse(fs.readFileSync(input, 'utf8')));
  if (output) { fs.writeFileSync(output, md + '\n'); console.log('Informe escrito en', output); } else console.log(md);
}
module.exports = { report };
