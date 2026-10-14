/* MotionClin · informe para el paciente: una página en lenguaje llano, con semáforo, escala visual y evolución.
 * Se genera a partir del mismo análisis que el informe clínico; no añade cálculos nuevos, solo los traduce. */
(function (root) {
  'use strict';
  const INK = [16, 35, 59], MUTED = [84, 103, 126], LINE = [221, 230, 241], ACCENT = [24, 120, 214], SOFT = [243, 247, 252];
  const LIGHT = { green: [30, 150, 90], amber: [222, 150, 20], red: [200, 60, 55], grey: [160, 172, 186] };

  // Textos en los dos idiomas. Las claves de métrica son las del motor (js/metrics.js).
  const TXT = {
    es: {
      docTitle: 'Informe para el paciente', hello: (n) => `Hola, ${n}`, session: (k, n) => `Sesión ${k} de ${n}`,
      intro: { gait: 'Hemos analizado tu forma de caminar con vídeo. Este resumen te cuenta lo más importante con palabras sencillas.', squat: 'Hemos analizado tu sentadilla con vídeo. Este resumen te cuenta lo más importante con palabras sencillas.', sts: 'Hemos medido cuánto tardas en levantarte de la silla cinco veces. Este resumen te cuenta lo más importante con palabras sencillas.', balance: 'Hemos medido tu equilibrio con vídeo. Este resumen te cuenta lo más importante con palabras sencillas.' },
      key: 'LO MÁS IMPORTANTE', results: 'Tus resultados, uno a uno', evolution: 'Cómo has evolucionado', message: 'Mensaje de tu fisioterapeuta',
      light: { green: 'Dentro de lo habitual', amber: 'A trabajar', red: 'Prioridad', grey: 'Sin valor de referencia' },
      legend: 'Verde: dentro de lo habitual para personas sanas de tu edad. Ámbar: algo fuera; es lo que vamos a trabajar. Rojo: bastante fuera; es la prioridad. La franja verde de cada escala es el rango habitual y el punto, tu resultado.',
      first: 'Es tu primera medición: servirá como punto de partida para ver tu progreso.',
      better: (d0, from, to) => `Desde tu primera sesión (${d0}) has pasado de ${from} a ${to}. Es una mejora real: mayor que el margen de error de la medida.`,
      worse: (d0, from, to) => `Desde tu primera sesión (${d0}) has pasado de ${from} a ${to}. Es un cambio a peor que comentaremos juntos.`,
      same: (d0, from, to) => `Desde tu primera sesión (${d0}) has pasado de ${from} a ${to}. De momento el cambio es pequeño, dentro del margen de error de la medida.`,
      sessions: 'Sesiones', autoMsg: { none: 'Todos tus resultados están dentro de lo habitual. ¡Buen trabajo! Seguiremos midiendo para mantenerlo.', some: 'Los puntos en ámbar o rojo son los que vamos a trabajar en las próximas sesiones. Volveremos a medir para ver cómo cambian.', noref: 'Esta prueba no tiene valores de referencia publicados para este método, así que la usamos para compararte contigo mismo de una sesión a otra.' },
      footer: 'Los colores comparan tu resultado con personas sanas; no son un diagnóstico. Medición con vídeo 2D: si tienes dudas, pregunta a tu fisioterapeuta.',
      diffPct: (v) => `${v} % de diferencia`, usual: 'Habitual', from: 'desde', upTo: 'hasta', locale: 'es-ES',
    },
    en: {
      docTitle: 'Patient report', hello: (n) => `Hello, ${n}`, session: (k, n) => `Session ${k} of ${n}`,
      intro: { gait: 'We analysed the way you walk on video. This summary explains the main points in plain words.', squat: 'We analysed your squat on video. This summary explains the main points in plain words.', sts: 'We timed how long it takes you to stand up from a chair five times. This summary explains the main points in plain words.', balance: 'We measured your balance on video. This summary explains the main points in plain words.' },
      key: 'THE MAIN RESULT', results: 'Your results, one by one', evolution: 'Your progress', message: 'A note from your physiotherapist',
      light: { green: 'Within the usual range', amber: 'To work on', red: 'Priority', grey: 'No reference value' },
      legend: 'Green: within the usual range for healthy people your age. Amber: somewhat outside; this is what we will work on. Red: well outside; this is the priority. The green band on each scale is the usual range and the dot is your result.',
      first: 'This is your first measurement: it will be the starting point to track your progress.',
      better: (d0, from, to) => `Since your first session (${d0}) you have gone from ${from} to ${to}. This is a real improvement: larger than the measurement error.`,
      worse: (d0, from, to) => `Since your first session (${d0}) you have gone from ${from} to ${to}. This is a change for the worse that we will discuss together.`,
      same: (d0, from, to) => `Since your first session (${d0}) you have gone from ${from} to ${to}. For now the change is small, within the measurement error.`,
      sessions: 'Sessions', autoMsg: { none: 'All your results are within the usual range. Well done! We will keep measuring to maintain it.', some: 'The amber or red points are what we will work on over the next sessions. We will measure again to see how they change.', noref: 'There are no published reference values for this test with this method, so we use it to compare you with yourself from one session to the next.' },
      footer: 'The colours compare your result with healthy people; they are not a diagnosis. 2D video measurement: if you have any questions, ask your physiotherapist.',
      diffPct: (v) => `${v} % difference`, usual: 'Usual', from: 'from', upTo: 'up to', locale: 'en-GB',
    },
  };

  // Nombre llano y qué significa cada variable
  const PLAIN = {
    es: {
      speed: ['Velocidad al caminar', 'Uno de los mejores indicadores de salud y autonomía: por eso se la llama el «sexto signo vital».'],
      cadence: ['Pasos por minuto', 'El ritmo de tus pasos.'],
      strideLen: ['Longitud de la zancada', 'Lo que avanzas cada dos pasos.'],
      kneeSwingL: ['Rodilla izquierda al dar el paso', 'Cuánto se dobla para que el pie pase sin rozar el suelo.'],
      kneeSwingR: ['Rodilla derecha al dar el paso', 'Cuánto se dobla para que el pie pase sin rozar el suelo.'],
      siLen: ['Igualdad entre los dos pasos', 'Cuanto más parecidos son los pasos de cada pierna, más eficiente es la marcha.'],
      siStep: ['Igualdad del ritmo entre piernas', 'Si una pierna tarda más que la otra, suele estar protegiéndose.'],
      strideCV: ['Regularidad de los pasos', 'Una marcha regular se asocia a menos riesgo de caídas.'],
      depth: ['Profundidad de la sentadilla', 'Cuánto bajas: refleja la movilidad y la fuerza de cadera y rodilla.'],
      fppaL: ['Alineación de la rodilla izquierda', 'Si la rodilla se va hacia dentro al bajar, aumenta la carga sobre ella.'],
      fppaR: ['Alineación de la rodilla derecha', 'Si la rodilla se va hacia dentro al bajar, aumenta la carga sobre ella.'],
      siDepth: ['Igualdad entre las dos piernas', 'Si una pierna trabaja menos, la otra se sobrecarga.'],
      time5: ['Tiempo en levantarte 5 veces', 'Mide la fuerza de las piernas; menos tiempo es mejor.'],
      cycleCV: ['Regularidad al levantarte', 'Repeticiones parecidas indican buen control.'],
      vel: ['Balanceo del cuerpo', 'Cuanto menos se balancea el cuerpo, mejor es el equilibrio.'],
      range: ['Amplitud del balanceo', 'Lo lejos que llega el cuerpo al balancearse.'],
      trunk: ['Inclinación del tronco', 'Inclinarse mucho hacia delante suele compensar falta de fuerza en las piernas.'],
      monoTime: ['Tiempo sobre una pierna', 'Cuánto aguantas sobre un pie: relacionado con el riesgo de caídas.'],
    },
    en: {
      speed: ['Walking speed', 'One of the best indicators of health and independence, which is why it is called the "sixth vital sign".'],
      cadence: ['Steps per minute', 'The rhythm of your steps.'],
      strideLen: ['Stride length', 'How far you move forward every two steps.'],
      kneeSwingL: ['Left knee when stepping', 'How much it bends so the foot clears the ground.'],
      kneeSwingR: ['Right knee when stepping', 'How much it bends so the foot clears the ground.'],
      siLen: ['Equal step length', 'The more alike the steps of each leg, the more efficient the walk.'],
      siStep: ['Equal timing between legs', 'If one leg takes longer than the other, it is often protecting itself.'],
      strideCV: ['Step regularity', 'A regular walk is linked to a lower risk of falls.'],
      depth: ['Squat depth', 'How low you go: reflects hip and knee mobility and strength.'],
      fppaL: ['Left knee alignment', 'If the knee caves inwards on the way down, it takes more load.'],
      fppaR: ['Right knee alignment', 'If the knee caves inwards on the way down, it takes more load.'],
      siDepth: ['Equal work between legs', 'If one leg does less, the other is overloaded.'],
      time5: ['Time to stand up 5 times', 'Measures leg strength; less time is better.'],
      cycleCV: ['Consistency when standing up', 'Similar repetitions show good control.'],
      vel: ['Body sway', 'The less your body sways, the better your balance.'],
      range: ['Sway range', 'How far your body travels when it sways.'],
      trunk: ['Trunk lean', 'Leaning far forward often makes up for a lack of leg strength.'],
      monoTime: ['Time on one leg', 'How long you can stand on one foot: linked to the risk of falls.'],
    },
  };
  const ORDER = {
    gait: ['speed', 'cadence', 'strideLen', 'kneeSwingL', 'kneeSwingR', 'siLen', 'siStep', 'strideCV'],
    squat: ['depth', 'fppaL', 'fppaR', 'siDepth'],
    sts: ['time5', 'cycleCV', 'trunk'],
    balance: ['vel', 'range', 'monoTime'],
  };

  /** Semáforo: verde dentro del rango; ámbar fuera hasta medio rango (o 15 % del límite si solo hay uno); rojo más allá. */
  function lightOf(m) {
    if (!m || typeof m.value !== 'number' || !m.eval) return 'grey';
    if (m.eval === 'normal') return 'green';
    const lo = m.ref && m.ref.lo, hi = m.ref && m.ref.hi, v = m.value;
    const both = typeof lo === 'number' && typeof hi === 'number';
    const margin = both ? (hi - lo) / 2 : 0.15 * Math.abs(m.eval === 'low' ? lo : hi);
    if (typeof margin !== 'number' || !isFinite(margin)) return 'amber';
    const out = m.eval === 'low' ? lo - v : v - hi;
    return out > margin ? 'red' : 'amber';
  }

  /** Variables que se enseñan al paciente: las que tienen nombre llano, valor numérico y fiabilidad suficiente. */
  function selectMetrics(a, max = 6) {
    const keys = ORDER[a.type] || [];
    const byKey = Object.fromEntries((a.metrics || []).map((m) => [m.key, m]));
    return keys.map((k) => byKey[k]).filter((m) => m && typeof m.value === 'number' && m.rel !== 'baja' && m.key !== a.main.key).slice(0, max);
  }

  async function build({ analysis: a, patient: p, clinic, history, progressSpec, lang }) {
    lang = lang === 'en' ? 'en' : 'es';
    const t = TXT[lang], PL = PLAIN[lang];
    const { jsPDF } = root.jspdf;
    const MM = root.MCMetrics;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const PW = 210, M = 16, CW = PW - 2 * M; let y = M;
    const W = (s) => String(s == null ? '' : s).replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/−/g, '-').replace(/[«»]/g, '"');
    const font = (style, size, color) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...(color || INK)); };
    const num = (v, d) => { if (typeof v !== 'number') return '–'; const s = v.toFixed(d); return lang === 'es' ? s.replace('.', ',') : s; };
    const decOf = (u) => (u === 'm/s' || u === 'm' ? 2 : u === 's' || u === '°/s' ? 1 : 0);
    const fmt = (v, u) => `${num(v, decOf(u))}${!u || u === '°' || u === '%' ? '' : ' '}${u || ''}`;
    const fmtVal = (m) => (/^si/.test(m.key) ? t.diffPct(num(m.value, 0)) : m.key === 'strideCV' || m.key === 'cycleCV' ? `${num(m.value, 1)} %` : fmt(m.value, m.unit));
    const fmtDate = (iso) => new Date(iso).toLocaleDateString(t.locale, { day: 'numeric', month: 'long', year: 'numeric' });
    const lines = (txt, w) => doc.splitTextToSize(W(txt), w);
    const plain = (m) => PL[m.key] || [m.label, ''];

    // Escala horizontal con la franja habitual en verde y el resultado como punto
    function scale(m, x, yy, w) {
      const lo = m.ref && m.ref.lo, hi = m.ref && m.ref.hi, v = m.value;
      if (typeof lo !== 'number' && typeof hi !== 'number') return false;
      let a0, a1;
      if (typeof lo === 'number' && typeof hi === 'number') { const r = hi - lo; a0 = lo - r * 0.6; a1 = hi + r * 0.6; }
      else if (typeof hi === 'number') { a0 = 0; a1 = hi * 2.2; } else { a0 = lo * 0.4; a1 = lo * 1.8; }
      a0 = Math.min(a0, v - Math.abs(v) * 0.05); a1 = Math.max(a1, v + Math.abs(v) * 0.05);
      const X = (q) => x + ((q - a0) / (a1 - a0)) * w;
      doc.setFillColor(232, 237, 244); doc.roundedRect(x, yy - 1.2, w, 2.4, 1.2, 1.2, 'F');
      const g0 = typeof lo === 'number' ? X(lo) : x, g1 = typeof hi === 'number' ? X(hi) : x + w;
      doc.setFillColor(196, 232, 210); doc.rect(g0, yy - 1.2, Math.max(0.5, g1 - g0), 2.4, 'F');
      const c = LIGHT[lightOf(m)];
      doc.setFillColor(255, 255, 255); doc.circle(X(v), yy, 2.1, 'F');
      doc.setFillColor(...c); doc.circle(X(v), yy, 1.6, 'F');
      return true;
    }
    const dot = (x, yy, light, r = 2.2) => { doc.setFillColor(...LIGHT[light]); doc.circle(x, yy, r, 'F'); };

    // ---- cabecera ----
    font('bold', 12.5, INK); doc.text(W(clinic.name || 'MotionClin'), M, y + 3);
    font('normal', 8.5, MUTED); if (clinic.physio) doc.text(W(clinic.physio), M, y + 8);
    doc.text(W(t.docTitle), PW - M, y + 3, { align: 'right' }); doc.text(W(fmtDate(a.date)), PW - M, y + 8, { align: 'right' });
    y += 12; doc.setDrawColor(...ACCENT); doc.setLineWidth(0.8); doc.line(M, y, PW - M, y); y += 10;

    const first = p && p.name ? p.name.split(' ')[0] : '';
    font('bold', 18, INK); doc.text(W(first ? t.hello(first) : t.docTitle), M, y);
    const k = history.findIndex((h) => h.id === a.id) + 1;
    font('normal', 9, MUTED); if (k) doc.text(W(t.session(k, history.length)), PW - M, y, { align: 'right' });
    y += 6; font('normal', 10, INK); const intro = lines(t.intro[a.type] || '', CW); doc.text(intro, M, y); y += intro.length * 4.6 + 4;

    // ---- lo más importante ----
    const mainM = (a.metrics || []).find((m) => m.key === a.main.key) || Object.assign({ eval: null }, a.main);
    const L0 = lightOf(mainM), [mName, mWhat] = PL[a.main.key] || [a.main.label, ''];
    const boxH = 38;
    doc.setFillColor(...SOFT); doc.roundedRect(M, y, CW, boxH, 3, 3, 'F');
    doc.setFillColor(...LIGHT[L0]); doc.roundedRect(M, y, 2.2, boxH, 1, 1, 'F');
    font('bold', 7.5, MUTED); doc.text(W(t.key), M + 7, y + 7);
    font('bold', 12, INK); doc.text(W(mName), M + 7, y + 13.5);
    font('bold', 24, INK); doc.text(W(fmt(a.main.value, a.main.unit)), M + 7, y + 25);
    dot(M + 9, y + 31.5, L0, 1.8); font('bold', 9, LIGHT[L0]); doc.text(W(t.light[L0]), M + 13, y + 32.6);
    const rx = M + 86, rw = CW - 92;
    font('normal', 9, INK); const what = lines(mWhat, rw); doc.text(what, rx, y + 9);
    if (mainM.ref && scale(mainM, rx, y + 27, rw)) {
      const lo = mainM.ref.lo, hi = mainM.ref.hi, u = a.main.unit, has = (q) => typeof q === 'number';
      const r = has(lo) && has(hi) ? `${num(lo, decOf(u))}–${fmt(hi, u)}` : has(lo) ? `${t.from} ${fmt(lo, u)}` : `${t.upTo} ${fmt(hi, u)}`;
      font('normal', 8, MUTED); doc.text(W(`${t.usual}: ${r}`), rx, y + 33.5);
    }
    y += boxH + 9;

    // ---- evolución ----
    font('bold', 11.5, INK); doc.text(W(t.evolution), M, y); y += 6;
    if (history.length >= 2 && history[0].id !== a.id) {
      const f0 = history[0], c = MM.mainCompare(f0, a), from = fmt(f0.main.value, a.main.unit), to = fmt(a.main.value, a.main.unit);
      const msg = c && c.relevant && c.direction === 'mejora' ? t.better(fmtDate(f0.date), from, to) : c && c.relevant && c.direction ? t.worse(fmtDate(f0.date), from, to) : t.same(fmtDate(f0.date), from, to);
      const hist = history.slice(0, k || history.length);
      const chartW = 92, chartH = 34;
      if (progressSpec && root.MCCharts) {
        const ps = progressSpec(hist), cv = document.createElement('canvas');
        root.MCCharts.lineChart(cv, Object.assign({ width: 520, height: 190, dpr: 2, noStyle: true, theme: { bg: '#ffffff', fg: '#10233b', muted: '#5b6e85', grid: '#e3eaf3' }, font: 'Helvetica, Arial, sans-serif' }, ps, { series: ps.series.map((s) => Object.assign({}, s, { color: '#1878d6' })) }));
        doc.addImage(cv.toDataURL('image/png'), 'PNG', M, y - 2, chartW, chartH, undefined, 'FAST');
      }
      font('normal', 9.5, INK); const ml = lines(msg, CW - chartW - 6); doc.text(ml, M + chartW + 6, y + 6);
      y += chartH + 5;
    } else { font('normal', 9.5, INK); const ml = lines(t.first, CW); doc.text(ml, M, y); y += ml.length * 4.4 + 5; }

    // ---- resultados ----
    const sel = selectMetrics(a);
    if (sel.length) {
      font('bold', 11.5, INK); doc.text(W(t.results), M, y); y += 3;
      for (const m of sel) {
        const [nm, wt] = plain(m), lt = lightOf(m);
        doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, y, PW - M, y); y += 5.5;
        dot(M + 2.4, y - 1.2, lt);
        font('bold', 9.8, INK); doc.text(W(nm), M + 7, y);
        font('bold', 10, INK); doc.text(W(fmtVal(m)), M + 104, y, { align: 'right' });
        const hasScale = scale(m, M + 112, y - 1.2, CW - 112 - 2);
        if (!hasScale) { font('normal', 8, MUTED); doc.text(W(t.light[lt]), M + 112, y); }
        font('normal', 8.2, MUTED); const wl = lines(wt, 100); doc.text(wl, M + 7, y + 4.3);
        y += 4.3 + wl.length * 3.6 + 1.5;
      }
      doc.setDrawColor(...LINE); doc.line(M, y, PW - M, y); y += 4;
      font('normal', 7.4, MUTED); const lg = lines(t.legend, CW); doc.text(lg, M, y); y += lg.length * 3.2 + 6;
    }

    // ---- mensaje ----
    const anyOff = [mainM, ...sel].some((m) => ['amber', 'red'].includes(lightOf(m)));
    const allGrey = [mainM, ...sel].every((m) => lightOf(m) === 'grey');
    const msg = (typeof a.patientNote === 'string' && a.patientNote.trim()) || t.autoMsg[anyOff ? 'some' : allGrey ? 'noref' : 'none'];
    font('normal', 10, INK); const ml = lines(msg, CW - 12), mh = Math.max(18, ml.length * 4.6 + 13);
    if (y + mh > 278) y = 278 - mh;
    doc.setDrawColor(...ACCENT); doc.setLineWidth(0.4); doc.roundedRect(M, y, CW, mh, 3, 3, 'S');
    font('bold', 9.5, ACCENT); doc.text(W(t.message), M + 6, y + 7);
    font('normal', 10, INK); doc.text(ml, M + 6, y + 13);

    font('normal', 7.2, MUTED); doc.text(lines(t.footer, CW), M, 287);
    return doc;
  }

  const api = { build, lightOf, selectMetrics, PLAIN, ORDER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MCPatientReport = api;
})(typeof window !== 'undefined' ? window : globalThis);
