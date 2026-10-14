/* MotionClin · informe PDF (jsPDF). */
(function () {
  'use strict';
  const INK = [16, 35, 59], MUTED = [84, 103, 126], LINE = [221, 230, 241], ACCENT = [24, 120, 214], WARN = [168, 104, 0], OK = [30, 140, 80], BAD = [190, 50, 50], SOFT = [243, 247, 252];
  const EV = { normal: ['En rango', OK], low: ['Bajo', WARN], high: ['Alto', WARN] };
  const REL = { alta: ['Alta', OK], media: ['Media', WARN], baja: ['Baja', BAD] };
  // Helvetica de jsPDF solo cubre WinAnsi: sustituye los símbolos que no existen en esa codificación
  const T = (s) => String(s == null ? '' : s).replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/−/g, '-').replace(/Δ/g, 'Dif.').replace(/₀/g, '0').replace(/≈/g, '~').replace(/→/g, '->').replace(/⚠/g, '!').replace(/²/g, '2');
  const dec = (v) => (typeof v === 'number' || typeof v === 'string' ? String(v).replace('.', ',') : v);
  const sep = (u) => (!u || u === '°' || u === '%' ? '' : ' ');
  const valSd = (m) => (m.value == null ? '–' : `${dec(m.value)}${m.sd != null ? ' ± ' + dec(m.sd) : ''}${sep(m.unit)}${m.unit || ''}`);
  const fmtP = (p) => (p == null ? '–' : p < 0.001 ? '< 0,001' : dec(p.toFixed(3)));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  const age = (p) => (p && p.birthYear ? new Date().getFullYear() - p.birthYear : null);
  const LIGHT = { bg: '#ffffff', fg: '#10233b', muted: '#5b6e85', grid: '#e3eaf3' };
  const COLORS = { L: '#0f9e8f', R: '#d98a00', band: 'rgba(24,120,214,.12)', blue: '#1878d6' };

  function chartImg(opts, w = 760, h = 260) {
    const c = document.createElement('canvas');
    window.MCCharts.lineChart(c, Object.assign({ width: w, height: h, dpr: 2, noStyle: true, theme: LIGHT, font: 'Helvetica, Arial, sans-serif' }, opts));
    return c.toDataURL('image/png');
  }
  const imgSize = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = src; });

  async function build({ analysis: a, patient: p, clinic, history, prev, chartSpec, chartSpec2, progressSpec }) {
    const { jsPDF } = window.jspdf;
    const MM = window.MCMetrics, TYPE = MM.TYPE_NAME;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const PW = 210, M = 15, CW = PW - 2 * M; let y = M;
    const font = (style, size, color) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...(color || INK)); };
    const ensure = (h) => { if (y + h > 280) { doc.addPage(); y = M; } };
    const heading = (txt) => { ensure(12); font('bold', 11, INK); doc.text(T(txt), M, y); y += 2; doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, y, PW - M, y); y += 5; };
    const para = (txt, size = 9, color = INK, indent = 0) => { font('normal', size, color); const lines = doc.splitTextToSize(T(txt), CW - indent); for (const ln of lines) { ensure(5); doc.text(ln, M + indent, y); y += size * 0.43; } };

    // ---- cabecera ----
    let tx = M;
    if (clinic.logo) { const s = await imgSize(clinic.logo); if (s) { const h = 13, w = Math.min(38, (s.w / s.h) * h); doc.addImage(clinic.logo, 'PNG', M, y - 2, w, h); tx = M + w + 4; } }
    font('bold', 14, INK); doc.text(T(clinic.name || 'Clínica'), tx, y + 3.5);
    font('normal', 8.5, MUTED); doc.text([clinic.physio ? T('Fisioterapeuta: ' + clinic.physio) : '', T(clinic.contact || '')].filter(Boolean), tx, y + 8.5);
    doc.text(T('Informe de análisis biomecánico por vídeo'), PW - M, y + 3.5, { align: 'right' });
    doc.text(T(fmtDate(a.date)), PW - M, y + 8.5, { align: 'right' });
    y += 15; doc.setDrawColor(...ACCENT); doc.setLineWidth(0.8); doc.line(M, y, PW - M, y); y += 8;

    // ---- paciente ----
    font('bold', 16, INK); doc.text(T(p ? p.name : 'Paciente'), M, y);
    font('normal', 9.5, MUTED);
    const info = [age(p) ? age(p) + ' años' : null, p && p.sex === 'F' ? 'mujer' : p && p.sex === 'M' ? 'hombre' : null, p && p.heightCm ? p.heightCm + ' cm' : null, p && p.condition].filter(Boolean).join(' · ');
    if (info) doc.text(T(info), M, y + 5.5);
    const n = history.findIndex((h) => h.id === a.id) + 1;
    doc.text(T(`${TYPE[a.type]} · Sesión ${n} de ${history.length} · Vista ${a.view}`), PW - M, y, { align: 'right' });
    doc.text(T(`Calidad de captura ${a.quality.score} % · ${a.counts && a.counts.strides != null ? a.counts.strides + ' zancadas' : a.counts && a.counts.reps != null ? a.counts.reps + ' repeticiones' : a.counts && a.counts.windows != null ? a.counts.windows + ' ventanas' : ''}`), PW - M, y + 5.5, { align: 'right' });
    y += 12;

    // ---- resumen ----
    const cmpPrev = prev && prev.version === 2 && a.version === 2 ? MM.compare(prev, a) : [];
    const first = history[0] && history[0].id !== a.id ? history[0] : null;
    const mainPrev = prev && prev.version === 2 ? MM.mainCompare(prev, a) : null, mainFirst = first && first.version === 2 ? MM.mainCompare(first, a) : null;
    doc.setFillColor(...SOFT); doc.roundedRect(M, y, CW, 20, 2, 2, 'F');
    font('normal', 8, MUTED); doc.text(T(a.main.label.toUpperCase()), M + 4, y + 6);
    font('bold', 17, INK); doc.text(T(`${a.main.value == null ? '–' : dec(a.main.value)}${a.main.sd != null ? ' ± ' + dec(a.main.sd) : ''} ${a.main.unit}`), M + 4, y + 14.5);
    const col = (x, label, txt, color) => { font('normal', 8, MUTED); doc.text(T(label), x, y + 6); font('bold', 10, color || INK); doc.text(T(txt), x, y + 13); };
    const chg = (c) => (c ? `${c.diff > 0 ? '+' : ''}${dec(Math.round(c.diff * 100) / 100)}${sep(a.main.unit)}${a.main.unit}  (p ${fmtP(c.p)})` : '–');
    const verdict = (c) => (!c ? null : c.relevant && c.direction ? (c.direction === 'mejora' ? ['Mejora demostrada', OK] : ['Empeoramiento', BAD]) : ['Sin cambio relevante', MUTED]);
    col(M + 72, 'ESTADO', a.status === 'review' ? 'Revisar' : 'Sin alertas', a.status === 'review' ? WARN : OK);
    col(M + 102, 'VS. SESIÓN ANTERIOR', chg(mainPrev), mainPrev && verdict(mainPrev)[1]);
    col(M + 143, 'VS. PRIMERA SESIÓN', chg(mainFirst), mainFirst && verdict(mainFirst)[1]);
    y += 26;

    // ---- fotograma + gráfica principal ----
    const spec = chartSpec(a, COLORS);
    let rowH = 0;
    if (a.keyframe) {
      const s = await imgSize(a.keyframe);
      if (s) { let w = 70, h = (s.h / s.w) * w; if (h > 52) { h = 52; w = (s.w / s.h) * h; } doc.addImage(a.keyframe, 'JPEG', M, y, w, h); rowH = h; font('normal', 7.5, MUTED); doc.text(T(a.type === 'balance' ? 'Fotograma representativo' : 'Fotograma de máxima flexión de rodilla'), M, y + h + 3.5); }
    }
    const gx = a.keyframe ? M + 74 : M, gw = PW - M - gx;
    font('bold', 9, INK); doc.text(T(spec.title), gx, y + 2);
    const gh = gw * 250 / 640;
    doc.addImage(chartImg(spec.opts, 640, 250), 'PNG', gx, y + 3.5, gw, gh, undefined, 'FAST');
    y += Math.max(rowH + 6, gh + 6);
    if (spec.note) { para(spec.note, 7.5, MUTED); y += 4; }

    // ---- tabla de resultados ----
    heading('Resultados');
    const cols = [{ t: 'Parámetro', w: 70 }, { t: 'Media ± DE', w: 32, al: 'right' }, { t: 'n', w: 9, al: 'right' }, { t: 'Referencia', w: 36 }, { t: 'Valoración', w: 18 }, { t: 'Fiab.', w: 15 }];
    const drawHead = () => { font('bold', 7.5, MUTED); let x = M; for (const c of cols) { doc.text(T(c.t), c.al === 'right' ? x + c.w - 2 : x, y, c.al === 'right' ? { align: 'right' } : undefined); x += c.w; } y += 1.8; doc.setDrawColor(...LINE); doc.line(M, y, PW - M, y); y += 4; };
    drawHead();
    let g = null;
    for (const m of a.metrics) {
      if (y > 275) { doc.addPage(); y = M; drawHead(); }
      if (m.group && m.group !== g) { g = m.group; font('bold', 7.5, ACCENT); doc.text(T(g.toUpperCase()), M, y + 0.5); y += 4.6; }
      const dim = m.rel === 'baja';
      font('normal', 8.3, dim ? MUTED : INK);
      const label = doc.splitTextToSize(T(m.label), cols[0].w - 2);
      let x = M;
      doc.text(label, x, y); x += cols[0].w;
      font('bold', 8.3, dim ? MUTED : INK); doc.text(T(valSd(m)), x + cols[1].w - 2, y, { align: 'right' }); x += cols[1].w;
      font('normal', 8, MUTED); doc.text(m.n != null ? String(m.n) : '', x + cols[2].w - 2, y, { align: 'right' }); x += cols[2].w;
      doc.text(doc.splitTextToSize(T(m.ref ? m.ref.text : ''), cols[3].w - 2), x, y); x += cols[3].w;
      if (m.eval) { font('bold', 8, EV[m.eval][1]); doc.text(T(EV[m.eval][0]), x, y); } x += cols[4].w;
      if (m.rel) { font('normal', 8, REL[m.rel][1]); doc.text(T(REL[m.rel][0]), x, y); }
      const lines = Math.max(label.length, m.ref ? doc.splitTextToSize(T(m.ref.text), cols[3].w - 2).length : 1);
      y += 1.6 + 3.6 * lines; doc.setDrawColor(...LINE); doc.setLineWidth(0.15); doc.line(M, y - 3.2, PW - M, y - 3.2);
    }
    para('Fiabilidad: alta = vista adecuada, buena visibilidad y suficientes ciclos o repeticiones; media = pocos ciclos, vista oblicua o variable sensible al error 2D; baja = orientativo, no genera alertas.', 7.2, MUTED);
    y += 2;

    // ---- repeticiones (sentadilla) ----
    if (a.reps && a.reps.length) {
      heading('Repetición a repetición');
      const rc = a.reps[0].fppaL != null ? [['depth', 'Profundidad (°)'], ['fppaL', 'FPPA izq. (°)'], ['fppaR', 'FPPA der. (°)'], ['desc', 'Bajada (s)'], ['asc', 'Subida (s)']] : [['depth', 'Profundidad (°)'], ['hip', 'Cadera (°)'], ['trunk', 'Tronco (°)'], ['desc', 'Bajada (s)'], ['asc', 'Subida (s)']];
      font('bold', 7.5, MUTED); doc.text('#', M, y); rc.forEach((c, i) => doc.text(T(c[1]), M + 12 + i * 34, y)); y += 4.5;
      a.reps.forEach((r, k) => { ensure(5); font('normal', 8.3, INK); doc.text(String(k + 1), M, y); rc.forEach((c, i) => doc.text(r[c[0]] != null ? dec(Math.round(r[c[0]] * 10) / 10) : '–', M + 12 + i * 34, y)); y += 4.4; });
      y += 2;
    }

    // ---- segunda gráfica ----
    const s2 = chartSpec2 && chartSpec2(a, COLORS);
    if (s2) { ensure(68); font('bold', 9, INK); doc.text(T(s2.title), M, y); const h = CW * 200 / 760; doc.addImage(chartImg(s2.opts, 760, 200), 'PNG', M, y + 2, CW, h, undefined, 'FAST'); y += h + 6; }

    // ---- comparación estadística ----
    if (cmpPrev.length) {
      heading(`Comparación con la sesión anterior (${fmtDate(prev.date)})`);
      const cc = [{ t: 'Parámetro', w: 62 }, { t: 'Anterior', w: 24, al: 'right' }, { t: 'Actual', w: 24, al: 'right' }, { t: 'Dif.', w: 20, al: 'right' }, { t: 'p', w: 16, al: 'right' }, { t: 'd', w: 10, al: 'right' }, { t: '', w: 24 }];
      font('bold', 7.5, MUTED); let x = M; for (const c of cc) { doc.text(c.t, c.al ? x + c.w - 2 : x, y, c.al ? { align: 'right' } : undefined); x += c.w; } y += 4.5;
      for (const c of cmpPrev) {
        ensure(5); x = M; const r = (v) => dec(Math.round(v * 100) / 100);
        font('normal', 8.2, INK); doc.text(doc.splitTextToSize(T(c.label), cc[0].w - 2)[0], x, y); x += cc[0].w;
        doc.text(T(`${r(c.ma)}${sep(c.unit)}${c.unit}`), x + cc[1].w - 2, y, { align: 'right' }); x += cc[1].w;
        doc.text(T(`${r(c.mb)}${sep(c.unit)}${c.unit}`), x + cc[2].w - 2, y, { align: 'right' }); x += cc[2].w;
        doc.text(T(`${c.diff > 0 ? '+' : ''}${r(c.diff)}`), x + cc[3].w - 2, y, { align: 'right' }); x += cc[3].w;
        doc.text(T(fmtP(c.p)), x + cc[4].w - 2, y, { align: 'right' }); x += cc[4].w;
        doc.text(c.d != null ? dec(c.d.toFixed(1)) : '–', x + cc[5].w - 2, y, { align: 'right' }); x += cc[5].w;
        const v = verdict(c); font('bold', 7.8, v[1]); doc.text(T(c.relevant && !c.direction ? 'Cambio' : v[0]), x + 1, y);
        y += 4.4;
      }
      para('p: prueba t de Welch entre los ciclos o repeticiones de ambas sesiones. d: tamaño del efecto de Cohen. Se habla de mejora o empeoramiento solo si p < 0,05 y la diferencia supera el cambio mínimo relevante de la variable.', 7.2, MUTED);
      y += 2;
    }

    // ---- evolución ----
    if (history.length >= 2 && progressSpec) {
      const ps = progressSpec(history);
      ensure(62); heading(`Evolución: ${a.main.label.toLowerCase()} por sesión (media ± DE)`);
      const h = CW * 190 / 760; doc.addImage(chartImg(Object.assign({}, ps, { series: ps.series.map((s) => Object.assign({}, s, { color: COLORS.blue })) }), 760, 190), 'PNG', M, y, CW, h, undefined, 'FAST'); y += h + 3;
      if (ps._trend) { const u = a.main.unit, sl = Math.round(ps._trend.slope * 100) / 100; para(`Tendencia lineal: ${sl > 0 ? '+' : ''}${dec(sl)}${sep(u)}${u} por semana (p ${fmtP(ps._trend.p)}; R² ${dec(ps._trend.r2.toFixed(2))}; ${ps._trend.n} sesiones).`, 8.5, INK); }
      y += 2;
    }

    // ---- alertas y valoración ----
    if (a.flags.length) { heading('Puntos a revisar'); for (const f of a.flags) para('• ' + f, 8.8, INK); y += 2; }
    heading('Valoración profesional');
    para(typeof a.notes === 'string' && a.notes ? a.notes : a.interpretation, 9.3, INK);
    for (const nt of a.info || []) para(nt, 8, MUTED);
    y += 3;

    // ---- método ----
    heading('Método y calidad de la medición');
    const q = a.quality;
    para(`Vista ${a.view}${a.viewRatio != null ? ` (índice ${dec(a.viewRatio)})` : ''} · persona detectada en el ${Math.round(q.detectedRatio * 100)} % de ${q.frames} fotogramas · visibilidad media ${q.visibility != null ? Math.round(q.visibility * 100) + ' %' : '–'} · ${a.fs ? dec(a.fs) + ' Hz' : ''} · duración ${dec(q.duration)} s${q.swaps != null ? ` · ${q.swaps} correcciones izq./der.` : ''}.`, 8, INK);
    for (const w of q.warnings || []) para('• ' + w, 8, WARN);
    y += 1;
    for (const m of a.methods || []) para('• ' + m, 7.8, INK);
    y += 2;
    heading('Referencias');
    (a.refs || []).forEach((r, i) => para(`${i + 1}. ${MM.REFS[r] || r}`, 7.2, MUTED));

    // ---- pie ----
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); font('normal', 7, MUTED);
      doc.text(T('MotionClin · Estimación por visión artificial 2D. Herramienta de apoyo; no sustituye la valoración clínica ni es un dispositivo médico certificado.'), M, 291);
      doc.text(`${i}/${pages}`, PW - M, 291, { align: 'right' });
    }
    return doc;
  }

  window.MCReport = { build };
})();
