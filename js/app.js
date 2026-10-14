/* MotionClin · lógica de la interfaz (v2). */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const S = window.MCStore, MM = window.MCMetrics, TYPE = MM.TYPE_NAME;
  const POSE_BASE = window.MC_POSE_BASE || 'vendor/mediapipe-pose/';
  const engine = new window.MCPose.PoseEngine(POSE_BASE);
  const FPS = { gait: 30, squat: 20, sts: 20, balance: 20 };

  const state = { patients: [], analyses: [], clinic: {}, type: 'gait', src: 'file', file: null, current: null, abort: null, live: null, videos: {}, players: [] };

  // ---------- utilidades ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const dec = (v) => (typeof v === 'number' || typeof v === 'string' ? String(v).replace('.', ',') : v);
  const unitSep = (u) => (!u || u === '°' || u === '%' ? '' : ' ');
  const fmtVal = (m) => (m.value == null ? '–' : `${dec(m.value)}${unitSep(m.unit)}${m.unit || ''}`);
  const fmtValSd = (m) => (m.value == null ? '–' : `${dec(m.value)}${m.sd != null ? ' ± ' + dec(m.sd) : ''}${unitSep(m.unit)}${m.unit || ''}`);
  const fmtP = (p) => (p == null ? '–' : p < 0.001 ? '< 0,001' : dec(p.toFixed(3)));
  const patientById = (id) => state.patients.find((p) => p.id === id);
  const sessionsOf = (pid, type) => state.analyses.filter((a) => a.patientId === pid && (!type || a.type === type)).sort((a, b) => a.date.localeCompare(b.date));
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const theme = () => ({ fg: css('--text'), muted: css('--muted'), grid: 'rgba(143,165,191,.16)', bg: css('--panel') });
  const ageOf = (p) => (p && p.birthYear ? new Date().getFullYear() - p.birthYear : null);
  const prevOf = (a) => { const s = sessionsOf(a.patientId, a.type); const i = s.findIndex((x) => x.id === a.id); return i > 0 ? s[i - 1] : null; };
  const firstOf = (a) => { const s = sessionsOf(a.patientId, a.type); return s[0] && s[0].id !== a.id ? s[0] : null; };
  const REL_TXT = { alta: 'Fiabilidad alta', media: 'Fiabilidad media', baja: 'Fiabilidad baja: no genera alertas' };
  const EV_TXT = { normal: 'En rango', low: 'Bajo', high: 'Alto' };

  let toastT;
  function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), err ? 6000 : 3200); }

  // Estado respecto a la sesión anterior: solo «mejora/empeora» si el cambio es significativo y relevante
  function mainChange(a) { return MM.mainCompare(prevOf(a), a); }
  function statusPill(a) {
    if (a.status === 'review') return '<span class="pill review">Revisar</span>';
    const c = mainChange(a);
    if (c && c.relevant && c.direction) return c.direction === 'mejora' ? '<span class="pill ok">Mejora</span>' : '<span class="pill bad">Empeora</span>';
    if (c) return '<span class="pill ok">Estable</span>';
    return '<span class="pill ok">Correcto</span>';
  }

  // Guardar archivo: en claude.ai usa la capacidad de descargas; fuera, un enlace de descarga normal
  async function saveFile(blob, filename) {
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        const dl = await window.claude.use('downloads');
        if (dl) {
          try { await dl.save({ filename, data: blob }); toast('Archivo listo: ' + filename); } catch (e) { if (e && e.code !== 'declined') toast('No se ha podido guardar el archivo (' + (e.message || e.code) + ').', true); }
          return;
        }
      }
    } catch (e) { /* sin capacidad: descarga normal */ }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast('Descargado: ' + filename);
  }

  // ---------- carga de datos ----------
  async function load() {
    [state.patients, state.analyses] = await Promise.all([S.all('patients'), S.all('analyses')]);
    state.clinic = await S.setting('clinic', { name: 'Clínica Motion Fisio', physio: '', contact: '', logo: null });
    const seeded = await S.setting('seeded', false);
    const DEMO_VERSION = 3, dv = await S.setting('demoVersion', 0);
    const oldDemo = state.analyses.some((a) => a.demo && a.patientId !== 'sample-p') && dv !== DEMO_VERSION;
    if (oldDemo) await clearDemo(true);
    if ((!seeded && !state.patients.length) || oldDemo) { await loadDemo(); await S.setSetting('seeded', true); await S.setSetting('demoVersion', DEMO_VERSION); }
  }
  async function loadDemo() {
    const { patients, analyses } = window.MCDemo.build();
    for (const p of patients) await S.put('patients', p);
    for (const a of analyses) await S.put('analyses', a);
    state.patients = await S.all('patients'); state.analyses = await S.all('analyses');
  }

  // ---------- navegación ----------
  const VIEWS = ['panel', 'analisis', 'pacientes', 'sesion', 'comparar', 'informe', 'metodo', 'ajustes'];
  function route() {
    const h = (location.hash || '#panel').slice(1), cut = h.indexOf('-');
    const view = cut < 0 ? h : h.slice(0, cut), arg = cut < 0 ? null : h.slice(cut + 1);
    const v = VIEWS.includes(view) ? view : 'panel';
    $$('[data-section]').forEach((s) => (s.hidden = s.dataset.section !== v));
    $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === v));
    if (v !== 'analisis' && state.live) stopCamera();
    destroyPlayers(); if (v !== 'analisis') $('#an-result').hidden = true;
    if (v === 'pacientes' || v === 'comparar') $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === v));
    if (v === 'sesion') $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === 'pacientes'));
    render[v](arg);
    window.scrollTo(0, 0);
  }

  // ======================= piezas compartidas (resultados e informe) =======================
  function metricTableHTML(a) {
    let html = '<table class="mtable"><thead><tr><th>Parámetro</th><th>Valor</th><th>n</th><th>Referencia</th><th>Valoración</th><th>Fiabilidad</th></tr></thead><tbody>';
    let g = null;
    for (const m of a.metrics) {
      if (m.group && m.group !== g) { g = m.group; html += `<tr class="grp"><td colspan="6">${esc(g)}</td></tr>`; }
      const ev = m.eval ? `<span class="ev ${m.eval}">${EV_TXT[m.eval]}</span>` : '<span class="ev none">—</span>';
      const rel = m.rel ? `<span class="rel ${m.rel}" title="${REL_TXT[m.rel]}" aria-label="${REL_TXT[m.rel]}"></span>` : '';
      html += `<tr class="${m.rel === 'baja' ? 'dim' : ''}"><td>${esc(m.label)}</td><td class="v">${esc(fmtValSd(m))}</td><td class="num small">${m.n != null ? m.n : ''}</td><td class="ref">${m.ref ? esc(m.ref.text) : ''}</td><td>${ev}</td><td>${rel}</td></tr>`;
    }
    return html + '</tbody></table>';
  }

  function compareHTML(a) { return comparePairHTML(prevOf(a), a); }
  function comparePairHTML(prev, a, title) {
    if (!prev) return '<h3>Comparación con la sesión anterior</h3><p class="small">Es la primera sesión de esta prueba. Cuando haya una segunda, aquí verás si los cambios son estadísticamente significativos y clínicamente relevantes.</p>';
    if (prev.version !== 2 || a.version !== 2) return '<h3>Comparación con la sesión anterior</h3><p class="small">La sesión anterior se analizó con una versión antigua sin datos por ciclo; no se puede comparar estadísticamente.</p>';
    const cmp = MM.compare(prev, a);
    const rows = cmp.map((c) => {
      const v = c.relevant ? (c.direction ? `<span class="verdict ${c.direction}">${c.direction === 'mejora' ? 'Mejora' : 'Empeora'}</span>` : '<span class="verdict cambio">Cambio</span>') : '<span class="verdict igual">Sin cambio relevante</span>';
      const d = Math.round(c.diff * 100) / 100;
      return `<tr><td>${esc(c.label)}</td><td class="num">${d > 0 ? '+' : ''}${dec(d)}${unitSep(c.unit)}${esc(c.unit)}</td><td class="num">${fmtP(c.p)}</td><td class="num">${c.d != null ? dec(c.d.toFixed(1)) : '–'}</td><td>${v}</td></tr>`;
    }).join('');
    return `<h3><span>${title || 'Comparación con la sesión anterior'}</span><span class="small">${fmtDate(prev.date)} → ${fmtDate(a.date)}</span></h3>
      ${cmp.length ? `<div class="table-wrap"><table class="cmp"><thead><tr><th>Parámetro</th><th>Δ</th><th>p</th><th>d</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small" style="margin-top:8px">p: prueba t de Welch entre ciclos de ambas sesiones. d: tamaño del efecto (Cohen). «Mejora» o «Empeora» exige p &lt; 0,05 y superar el cambio mínimo relevante de la variable.</p>` : '<p class="small">No hay suficientes ciclos o repeticiones en ambas sesiones para comparar.</p>'}`;
  }

  function qualityHTML(a) {
    const q = a.quality;
    return `<h3><span>Calidad y fiabilidad de la medición</span><span class="pill ${q.score >= 80 ? 'ok' : q.score >= 60 ? 'review' : 'bad'}">${q.score}%</span></h3>
      <dl class="kv">
        <dt>Vista detectada</dt><dd>${esc(a.view)}${a.viewRatio != null ? ` (índice ${dec(a.viewRatio)})` : ''}</dd>
        <dt>Persona detectada</dt><dd>${Math.round(q.detectedRatio * 100)} % de los fotogramas</dd>
        <dt>Visibilidad media</dt><dd>${q.visibility != null ? Math.round(q.visibility * 100) + ' %' : '–'}</dd>
        <dt>Muestreo / filtro</dt><dd>${a.fs ? dec(a.fs) + ' Hz' : '–'} · ${a.fc ? 'Butterworth ' + a.fc + ' Hz' : '–'}</dd>
        <dt>Duración</dt><dd>${dec(q.duration)} s · ${q.frames} fotogramas</dd>
        ${q.swaps != null ? `<dt>Correcciones izq./der.</dt><dd>${q.swaps}</dd>` : ''}
        ${q.rejected ? `<dt>Puntos descartados</dt><dd>${q.rejected} (longitud de segmento)</dd>` : ''}
        ${a.counts ? `<dt>Unidades de análisis</dt><dd>${a.counts.strides != null ? `${a.counts.strides} zancadas (${a.counts.stridesL} izq. / ${a.counts.stridesR} der.)` : a.counts.reps != null ? `${a.counts.reps} repeticiones` : a.counts.windows != null ? `${a.counts.windows} ventanas de 5 s` : ''}</dd>` : ''}
      </dl>
      ${q.warnings && q.warnings.length ? `<ul class="flags" style="margin-top:10px">${q.warnings.map((w) => `<li class="q">${esc(w)}</li>`).join('')}</ul>` : ''}`;
  }

  function methodsHTML(a) {
    if (!a.methods) return '<p class="small">Análisis realizado con la versión anterior del motor.</p>';
    return `<ol class="prose" style="padding-left:18px">${a.methods.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>
      <h4 style="margin:12px 0 6px">Referencias</h4><ol class="refs">${(a.refs || []).map((r) => `<li>${esc(MM.REFS[r] || r)}</li>`).join('')}</ol>`;
  }

  function flagsHTML(a) {
    const items = (a.flags || []).map((f) => `<li>${esc(f)}</li>`);
    if (!items.length) items.push('<li class="okmsg">Sin alertas en los parámetros con fiabilidad suficiente.</li>');
    for (const n of a.info || []) items.push(`<li class="q">${esc(n)}</li>`);
    return items.join('');
  }

  // Gráfica principal: ciclo de marcha normalizado con banda normativa, o serie temporal
  function mainChartSpec(a, th, colors) {
    const C = colors || { L: css('--cyan'), R: css('--amber'), band: 'rgba(143,165,191,.18)', blue: css('--blue') };
    if (a.type === 'gait' && a.cycles && (a.cycles.kneeL || a.cycles.kneeR)) {
      const norm = MM.normKnee(51), xs = norm.map((_, k) => k * 2);
      const series = [{ name: 'Referencia ± 1 DE', color: C.band.replace(/[\d.]+\)$/, '0.9)'), width: 1, dash: [4, 4], data: xs.map((x, k) => [x, norm[k]]), band: xs.map((x, k) => [x, norm[k] - MM.NORM_SD, norm[k] + MM.NORM_SD]), bandColor: C.band }];
      for (const s of ['L', 'R']) { const c = a.cycles['knee' + s]; if (c) series.push({ name: `Rodilla ${s === 'L' ? 'izq.' : 'der.'} (n=${c.n})`, color: C[s], width: 2.2, data: xs.map((x, k) => [x, c.mean[k]]) }); }
      const vlines = ['L', 'R'].filter((s) => a.cycles['toe' + s] != null).map((s) => ({ x: a.cycles['toe' + s], color: C[s], label: 'despegue' }));
      return { title: 'Flexión de rodilla en el ciclo de marcha (grados)', note: 'Media de todos los ciclos por lado frente a la curva de referencia (Winter, 2009; Kadaba et al., 1990). Líneas verticales: despegue medio.', opts: { series, vlines, yUnit: '°', xFormat: (x) => x + '%', xTicks: [0, 20, 40, 60, 80, 100], yMin: -5 } };
    }
    const t = a.series.t;
    if (a.type === 'balance' && a.series.sway) return { title: 'Oscilación angular del cuerpo (grados)', note: 'Ángulo de la recta tobillos–hombros respecto a su media.', opts: { series: [{ name: 'Oscilación', color: C.blue, data: t.map((x, i) => [x, a.series.sway[i]]) }], yUnit: '°', xFormat: (x) => x + 's' } };
    if (a.type === 'sts' && a.series.pelvis) return { title: 'Altura de la pelvis (0 % sentado, 100 % de pie)', note: 'Líneas discontinuas: bipedestación alcanzada en cada repetición.', opts: { series: [{ name: 'Pelvis', color: C.blue, data: t.map((x, i) => [x, a.series.pelvis[i]]) }], yUnit: '%', xFormat: (x) => x + 's', markers: (a.events && a.events.reps) || [] } };
    return { title: 'Flexión de rodilla en el tiempo (grados)', note: 'Líneas discontinuas: punto más bajo de cada repetición.', opts: { series: [{ name: 'Rodilla izq.', color: C.L, data: t.map((x, i) => [x, a.series.kneeL[i]]) }, { name: 'Rodilla der.', color: C.R, data: t.map((x, i) => [x, a.series.kneeR[i]]) }], yUnit: '°', xFormat: (x) => x + 's', markers: (a.events && (a.events.reps || [])) || [] } };
  }
  function secondChartSpec(a, colors) {
    const C = colors || { L: css('--cyan'), R: css('--amber') };
    if (a.type === 'gait' && a.cycles && (a.cycles.hipL || a.cycles.hipR)) {
      const xs = Array.from({ length: 51 }, (_, k) => k * 2), series = [];
      for (const s of ['L', 'R']) { const c = a.cycles['hip' + s]; if (c) series.push({ name: `Cadera ${s === 'L' ? 'izq.' : 'der.'}`, color: C[s], width: 2, data: xs.map((x, k) => [x, c.mean[k]]), band: xs.map((x, k) => [x, c.mean[k] - c.sd[k], c.mean[k] + c.sd[k]]), bandColor: C[s].startsWith('#') ? C[s] + '22' : 'rgba(143,165,191,.12)' }); }
      return { title: 'Flexión de cadera en el ciclo (± 1 DE entre ciclos)', opts: { series, yUnit: '°', xFormat: (x) => x + '%', xTicks: [0, 20, 40, 60, 80, 100] } };
    }
    return null;
  }
  function drawChart(box, spec, height) {
    box.innerHTML = ''; if (!spec) return;
    const c = document.createElement('canvas'); box.appendChild(c);
    window.MCCharts.lineChart(c, Object.assign({ width: Math.max(280, box.clientWidth), height: height || 240, theme: theme() }, spec.opts));
  }

  function summaryHTML(a) {
    const p = patientById(a.patientId) || {};
    const c = mainChange(a), f = firstOf(a);
    const fc = f && f.version === 2 && a.version === 2 ? MM.mainCompare(f, a) : null;
    const chg = (x) => (x ? `${x.diff > 0 ? '+' : ''}${dec(Math.round(x.diff * 100) / 100)}${unitSep(a.main.unit)}${a.main.unit}${x.p != null ? ` <span class="small">(p ${fmtP(x.p)})</span>` : ''}` : '–');
    return `<div><div class="lab">${esc(a.main.label)}</div><div class="big">${a.main.value == null ? '–' : dec(a.main.value)}<small>${a.main.sd != null ? '± ' + dec(a.main.sd) + ' ' : ''}${esc(a.main.unit)}</small></div><div class="small" style="margin-top:4px">${esc(p.name || '')} · ${TYPE[a.type]} · ${fmtDate(a.date)}</div></div>
      <div><div class="lab">Estado</div>${statusPill(a)}</div>
      <div><div class="lab">vs. sesión anterior</div><div class="val">${chg(c)}</div></div>
      <div><div class="lab">vs. primera sesión</div><div class="val">${chg(fc)}</div></div>`;
  }

  function repsHTML(a) {
    if (!a.reps || !a.reps.length) return '';
    const cols = a.reps[0].fppaL != null ? [['depth', 'Profundidad', '°'], ['fppaL', 'FPPA izq.', '°'], ['fppaR', 'FPPA der.', '°'], ['desc', 'Bajada', 's'], ['asc', 'Subida', 's']] : [['depth', 'Profundidad', '°'], ['hip', 'Cadera', '°'], ['trunk', 'Tronco', '°'], ['desc', 'Bajada', 's'], ['asc', 'Subida', 's']];
    return `<h3>Repetición a repetición</h3><div class="table-wrap"><table class="cmp"><thead><tr><th>#</th>${cols.map((c) => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${a.reps.map((r, i) => `<tr><td>${i + 1}</td>${cols.map((c) => `<td class="num">${r[c[0]] != null ? dec(Math.round(r[c[0]] * (c[2] === 's' ? 100 : 1)) / (c[2] === 's' ? 100 : 1)) + (c[2] === '°' ? '°' : ' s') : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  // ======================= vistas =======================
  const render = {
    panel() {
      const demo = state.patients.some((p) => p.demo);
      $('#demo-banner').hidden = !demo;
      const now = new Date(), month = state.analyses.filter((a) => { const d = new Date(a.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
      const active = new Set(state.analyses.filter((a) => Date.now() - new Date(a.date) < 60 * 864e5).map((a) => a.patientId));
      const latest = state.patients.map((p) => sessionsOf(p.id).pop()).filter(Boolean);
      const alerts = latest.filter((a) => a.status === 'review').length;
      // Cambios relevantes: últimas sesiones con mejora significativa y relevante en su métrica principal
      const changes = state.patients.flatMap((p) => ['gait', 'squat', 'sts', 'balance'].map((t) => sessionsOf(p.id, t).pop()).filter(Boolean)).map(mainChange).filter(Boolean);
      const improved = changes.filter((c) => c.relevant && c.direction === 'mejora').length;
      const avgQ = state.analyses.length ? Math.round(state.analyses.reduce((s, a) => s + a.quality.score, 0) / state.analyses.length) : null;
      $('#kpis').innerHTML = [
        ['Análisis este mes', month.length, `${state.analyses.length} en total`, ''],
        ['Pacientes activos', active.size, `${state.patients.length} registrados`, ''],
        ['Mejoras demostradas', `${improved}/${changes.length}`, 'última sesión vs. anterior (p < 0,05 y cambio relevante)', improved ? 'up' : ''],
        ['Alertas por revisar', alerts, avgQ != null ? `calidad media de captura ${avgQ} %` : 'sin análisis', alerts ? 'warn' : ''],
      ].map(([l, v, s, c]) => `<div class="card kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub ${c}">${esc(s)}</div></div>`).join('');

      const sel = $('#prog-patient');
      const withData = state.patients.filter((p) => sessionsOf(p.id).length);
      const keep = sel.value;
      sel.innerHTML = withData.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('') || '<option value="">Sin pacientes</option>';
      if (keep && withData.some((p) => p.id === keep)) sel.value = keep;
      drawProgress();

      const all = [...state.analyses].sort((a, b) => b.date.localeCompare(a.date));
      const last = all[0];
      $('#last-card').innerHTML = last ? (() => {
        const p = patientById(last.patientId) || { name: 'Paciente eliminado' };
        return `<h3><span>Último análisis</span>${statusPill(last)}</h3>
          <div class="person"><div class="avatar">${initials(p.name)}</div><div><b>${esc(p.name)}</b>${p.demo ? '<span class="tag">Ejemplo</span>' : ''}<div class="small">${TYPE[last.type]} · ${fmtDate(last.date)} · calidad ${last.quality.score} %</div></div></div>
          ${last.keyframe ? `<img src="${last.keyframe}" alt="Fotograma con esqueleto" style="border-radius:10px;margin:12px 0 8px;aspect-ratio:16/9;object-fit:cover;width:100%">` : ''}
          <p style="margin:6px 0 2px"><span class="small">${esc(last.main.label)}:</span> <b class="num">${esc(fmtValSd(last.main))}</b></p>
          <p class="small" style="margin:2px 0 12px">${esc(last.flags[0] || 'Sin alertas.')}</p>
          <a class="btn primary" href="#sesion-${last.id}">Ver análisis</a>`;
      })() : `<div class="empty-state"><h3>Aún no hay análisis</h3><p>Sube el primer vídeo para ver aquí el resultado.</p><a class="btn primary" href="#analisis">Nuevo análisis</a></div>`;

      $('#recent-table').innerHTML = all.length ? `<thead><tr><th>Paciente</th><th>Prueba</th><th>Fecha</th><th>Métrica principal</th><th>Calidad</th><th>Estado</th></tr></thead><tbody>` +
        all.slice(0, 10).map((a) => { const p = patientById(a.patientId) || { name: '—' };
          return `<tr class="click" data-href="#sesion-${a.id}"><td>${esc(p.name)}${p.demo ? '<span class="tag">Ejemplo</span>' : ''}</td><td>${TYPE[a.type]}</td><td class="num">${fmtDate(a.date)}</td><td>${esc(a.main.label)}: <b class="num">${esc(fmtValSd(a.main))}</b></td><td class="num">${a.quality.score} %</td><td>${statusPill(a)}</td></tr>`; }).join('') + '</tbody>'
        : '<tbody><tr><td class="small">Sin análisis todavía.</td></tr></tbody>';
    },

    analisis() { fillPatientSelect($('#an-patient')); renderGuide(); updateRunButton(); },

    pacientes(id) {
      $('#patient-form').hidden = true;
      if (id && patientById(id)) { $('#patient-list-card').hidden = true; renderPatientDetail(patientById(id)); return; }
      $('#patient-detail').hidden = true; $('#patient-list-card').hidden = false;
      renderPatientTable();
    },

    informe(id) {
      const sel = $('#rep-select');
      const all = [...state.analyses].sort((a, b) => b.date.localeCompare(a.date));
      sel.innerHTML = all.map((a) => { const p = patientById(a.patientId); return `<option value="${a.id}">${esc(p ? p.name : '—')} · ${TYPE[a.type]} · ${fmtDate(a.date)}</option>`; }).join('');
      if (id && all.some((a) => a.id === id)) sel.value = id;
      $('#rep-download').disabled = !all.length;
      renderReportPreview();
    },

    sesion(id) {
      const a = state.analyses.find((x) => x.id === id);
      if (!a) { $('#ses-title').textContent = 'Análisis no encontrado'; $('#ses-sub').textContent = ''; $('#ses-detail').innerHTML = '<div class="card empty-state"><h3>No existe este análisis</h3><p>Puede que se haya borrado.</p></div>'; return; }
      const p = patientById(a.patientId) || { name: '—' };
      $('#ses-title').textContent = `${TYPE[a.type]} · ${p.name}`;
      $('#ses-sub').textContent = `${fmtDate(a.date)} · vista ${a.view} · ${a.source || ''}`;
      $('#ses-back').href = '#pacientes-' + a.patientId; $('#ses-back').textContent = '← Ficha de ' + p.name.split(' ')[0];
      mountDetail($('#ses-detail'), a, { videoURL: state.videos[a.id] });
    },

    comparar(arg) { renderCompare(arg); },

    metodo() {
      $('#method-refs').innerHTML = Object.values(MM.REFS).sort().map((r) => `<li>${esc(r)}</li>`).join('');
    },

    ajustes() {
      const c = state.clinic;
      $('#st-name').value = c.name || ''; $('#st-physio').value = c.physio || ''; $('#st-contact').value = c.contact || '';
      $('#st-logo-prev').innerHTML = c.logo ? `<img src="${c.logo}" alt="Logotipo" style="max-height:48px;margin-top:6px;border-radius:6px"> <button class="btn sm ghost" id="st-logo-del">Quitar</button>` : '';
      S.isPersistent().then((ok) => { $('#st-storage').textContent = `${state.patients.length} pacientes y ${state.analyses.length} análisis guardados ${ok ? 'en este navegador (IndexedDB)' : 'solo en memoria: este navegador no permite guardar datos, se perderán al cerrar'}. Exporta una copia para pasarlos a otro equipo.`; });
    },
  };

  // ---------- panel: evolución ----------
  function progressSpec(ss) {
    const t0 = new Date(ss[0].date).getTime();
    return {
      legend: false, yUnit: ss[0].main.unit === '°' ? '°' : '', xTicks: ss.map((_, i) => i + 1), xFormat: (x) => 'S' + x,
      series: [{ name: ss[0].main.label, color: css('--cyan'), points: true, width: 2.5, data: ss.map((a, i) => [i + 1, a.main.value]), err: ss.map((a) => a.main.sd) }],
      _trend: MM.linreg(ss.map((a) => (new Date(a.date).getTime() - t0) / (7 * 864e5)), ss.map((a) => a.main.value)),
    };
  }
  function trendText(ss, tr) {
    if (!tr) return ss.length >= 2 ? 'Con 3 o más sesiones se calcula la tendencia.' : '';
    const u = ss[0].main.unit, sl = Math.round(tr.slope * 100) / 100;
    return `Tendencia: ${sl > 0 ? '+' : ''}${dec(sl)}${unitSep(u)}${u} por semana (p ${fmtP(tr.p)}, R² ${dec(tr.r2.toFixed(2))}${tr.p < 0.05 ? '' : '; no significativa'}).`;
  }
  function drawProgress() {
    const pid = $('#prog-patient').value, box = $('#prog-chart');
    const s = pid ? sessionsOf(pid) : [];
    if (!s.length) { box.innerHTML = '<div class="empty-state small">Sin sesiones.</div>'; $('#prog-caption').textContent = ''; return; }
    const type = s[s.length - 1].type, ss = sessionsOf(pid, type);
    const spec = progressSpec(ss);
    const c = document.createElement('canvas'); box.innerHTML = ''; box.appendChild(c);
    window.MCCharts.lineChart(c, Object.assign({ width: Math.max(260, box.clientWidth), height: 220, theme: theme() }, spec));
    $('#prog-caption').textContent = `${TYPE[type]} · ${ss[0].main.label} (media ± DE) · ${ss.length} sesiones. ${trendText(ss, spec._trend)}`;
  }

  // ---------- pacientes ----------
  function fillPatientSelect(sel) {
    const keep = sel.value;
    sel.innerHTML = state.patients.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => `<option value="${p.id}">${esc(p.name)}${p.demo ? ' (ejemplo)' : ''}</option>`).join('') + '<option value="__new">+ Nuevo paciente…</option>';
    if (keep && state.patients.some((p) => p.id === keep)) sel.value = keep;
    else { const real = state.patients.find((p) => !p.demo); if (real) sel.value = real.id; }
  }
  function renderPatientTable() {
    const q = $('#p-search').value.trim().toLowerCase();
    const list = state.patients.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.condition || '').toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    $('#patient-table').innerHTML = list.length ? '<thead><tr><th>Nombre</th><th>Motivo</th><th>Sesiones</th><th>Último resultado</th><th>Estado</th></tr></thead><tbody>' + list.map((p) => {
      const s = sessionsOf(p.id), last = s[s.length - 1];
      return `<tr class="click" data-href="#pacientes-${p.id}"><td><div class="person"><div class="avatar" style="width:32px;height:32px;font-size:12px">${initials(p.name)}</div><span>${esc(p.name)}${p.demo ? '<span class="tag">Ejemplo</span>' : ''}</span></div></td><td>${esc(p.condition || '—')}</td><td class="num">${s.length}</td><td>${last ? `${TYPE[last.type]} · <span class="num">${esc(fmtValSd(last.main))}</span>` : '<span class="small">Sin análisis</span>'}</td><td>${last ? statusPill(last) : '<span class="pill neutral">Pendiente</span>'}</td></tr>`;
    }).join('') + '</tbody>' : `<tbody><tr><td><div class="empty-state"><h3>${q ? 'Sin resultados' : 'Aún no hay pacientes'}</h3><p>${q ? 'Prueba con otro nombre.' : 'Añade el primero con el botón de arriba.'}</p></div></td></tr></tbody>`;
  }
  function renderPatientDetail(p) {
    const box = $('#patient-detail'); box.hidden = false;
    const all = sessionsOf(p.id);
    const types = [...new Set(all.map((a) => a.type))];
    const age = ageOf(p);
    box.innerHTML = `
      <div class="card"><div class="top" style="margin:0">
        <div class="person"><div class="avatar">${initials(p.name)}</div><div><h3 style="font-size:20px">${esc(p.name)}${p.demo ? '<span class="tag">Ejemplo</span>' : ''}</h3><div class="small">${[age ? age + ' años' : null, p.sex === 'F' ? 'mujer' : p.sex === 'M' ? 'hombre' : null, p.heightCm ? p.heightCm + ' cm' : null, p.condition].filter(Boolean).map(esc).join(' · ') || 'Sin datos clínicos'}</div></div></div>
        <div class="actions"><a class="btn" href="#pacientes">← Volver</a>${(() => { const t = ['gait', 'squat', 'sts', 'balance'].find((t2) => sessionsOf(p.id, t2).length >= 2); if (!t) return ''; const ss = sessionsOf(p.id, t); return `<a class="btn" href="#comparar-${ss[0].id}~${ss[ss.length - 1].id}">Comparar primera y última</a>`; })()}<button class="btn" id="pd-edit">Editar</button><button class="btn primary" id="pd-new">+ Nuevo análisis</button><button class="btn danger" id="pd-del">Eliminar</button></div>
      </div>
      <div class="confirm" id="pd-del-confirm" hidden style="margin-top:10px">¿Eliminar a ${esc(p.name)} y sus ${all.length} análisis? <button class="btn sm danger" id="pd-del-yes">Sí, eliminar</button><button class="btn sm" id="pd-del-no">Cancelar</button></div>
      ${!p.heightCm || !p.birthYear ? '<p class="small" style="margin:10px 0 0;color:var(--warn)">Indica la talla y el año de nacimiento para obtener velocidades en m/s y valores de referencia por edad.</p>' : ''}
      ${p.notes ? `<p class="small" style="margin:10px 0 0">${esc(p.notes)}</p>` : ''}</div>
      ${types.length ? `<div class="grid ${types.length > 1 ? 'g2e' : ''} mt">${types.map((t) => `<div class="card"><h3>${TYPE[t]} · ${esc(sessionsOf(p.id, t)[0].main.label)}</h3><div class="chart-box" data-prog="${t}"></div><p class="small" data-trend="${t}"></p></div>`).join('')}</div>` : ''}
      <div class="card mt"><h3>Sesiones</h3><div class="table-wrap"><table>${all.length ? '<thead><tr><th>Fecha</th><th>Prueba</th><th>Métrica principal</th><th>Calidad</th><th>Estado</th><th></th></tr></thead><tbody>' + all.slice().reverse().map((a) => `<tr><td class="num">${fmtDate(a.date)}</td><td>${TYPE[a.type]}</td><td class="num">${esc(fmtValSd(a.main))}</td><td class="num">${a.quality.score} %</td><td>${statusPill(a)}</td><td style="text-align:right;white-space:nowrap"><a class="btn sm primary" href="#sesion-${a.id}">Ver</a> <a class="btn sm" href="#informe-${a.id}">Informe</a> <button class="btn sm ghost danger" data-del-an="${a.id}">Borrar</button></td></tr>`).join('') + '</tbody>' : '<tbody><tr><td class="small">Sin análisis. Pulsa «Nuevo análisis» para grabar o subir un vídeo.</td></tr></tbody>'}</table></div></div>`;
    $$('[data-prog]', box).forEach((el) => {
      const ss = sessionsOf(p.id, el.dataset.prog), spec = progressSpec(ss), c = document.createElement('canvas'); el.appendChild(c);
      window.MCCharts.lineChart(c, Object.assign({ width: Math.max(260, el.clientWidth), height: 200, theme: theme() }, spec));
      $(`[data-trend="${el.dataset.prog}"]`, box).textContent = trendText(ss, spec._trend);
    });
    $('#pd-new').onclick = () => { location.hash = '#analisis'; setTimeout(() => { $('#an-patient').value = p.id; }, 0); };
    $('#pd-edit').onclick = () => openPatientForm(p);
    $('#pd-del').onclick = () => ($('#pd-del-confirm').hidden = false);
    $('#pd-del-no').onclick = () => ($('#pd-del-confirm').hidden = true);
    $('#pd-del-yes').onclick = async () => {
      for (const a of all) await S.del('analyses', a.id);
      await S.del('patients', p.id);
      state.analyses = state.analyses.filter((a) => a.patientId !== p.id); state.patients = state.patients.filter((x) => x.id !== p.id);
      toast('Paciente eliminado'); location.hash = '#pacientes';
    };
    $$('[data-del-an]', box).forEach((b) => b.onclick = async () => {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '¿Confirmar?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Borrar'; }, 3000); return; }
      await S.del('analyses', b.dataset.delAn); state.analyses = state.analyses.filter((a) => a.id !== b.dataset.delAn);
      toast('Análisis borrado'); renderPatientDetail(p);
    });
  }
  let editingPatient = null, returnToAnalysis = false;
  function openPatientForm(p) {
    editingPatient = p || null;
    $('#pf-title').textContent = p ? 'Editar paciente' : 'Nuevo paciente';
    $('#pf-name').value = p ? p.name : ''; $('#pf-birth').value = (p && p.birthYear) || ''; $('#pf-height').value = (p && p.heightCm) || '';
    $('#pf-sex').value = (p && p.sex) || ''; $('#pf-condition').value = p ? p.condition || '' : ''; $('#pf-notes').value = p ? p.notes || '' : '';
    $('#patient-form').hidden = false; $('#pf-name').focus();
  }
  async function savePatient() {
    const name = $('#pf-name').value.trim();
    if (!name) { toast('Escribe el nombre del paciente.', true); $('#pf-name').focus(); return; }
    const p = Object.assign(editingPatient || { id: uid(), created: new Date().toISOString() }, {
      name, birthYear: +$('#pf-birth').value || null, heightCm: +$('#pf-height').value || null, sex: $('#pf-sex').value || null,
      condition: $('#pf-condition').value.trim(), notes: $('#pf-notes').value.trim(),
    });
    await S.put('patients', p);
    if (!editingPatient) state.patients.push(p);
    $('#patient-form').hidden = true;
    toast(editingPatient ? 'Paciente actualizado' : 'Paciente guardado');
    if (returnToAnalysis) { returnToAnalysis = false; location.hash = '#analisis'; setTimeout(() => { fillPatientSelect($('#an-patient')); $('#an-patient').value = p.id; }, 0); return; }
    if (editingPatient) renderPatientDetail(p); else location.hash = '#pacientes-' + p.id;
  }

  // ---------- nuevo análisis ----------
  const GUIDES = {
    gait: { t: 'marcha', rows: [['Cámara', 'Lateral, fija, perpendicular al recorrido, a la altura de la cadera'], ['Distancia', '3–5 m; el paciente entero y al menos 3–4 m de recorrido en imagen'], ['Recorrido', 'Caminar a ritmo cómodo de lado a lado; ida y vuelta suma más ciclos'], ['Duración', '10–20 s (cuantos más ciclos, menor incertidumbre)'], ['Ficha', 'Talla, año de nacimiento y sexo para velocidad y referencias'], ['Resultados', 'Espaciotemporales, ciclo de rodilla y cadera, simetría, variabilidad']] },
    squat: { t: 'sentadilla', rows: [['Vista lateral', 'Profundidad, cadera e inclinación del tronco'], ['Vista frontal', 'Valgo dinámico (FPPA) y simetría'], ['Distancia', '2–4 m, cuerpo entero visible'], ['Repeticiones', '3–5, ritmo controlado'], ['Duración', '10–25 s'], ['Resultados', 'Por repetición y media ± DE']] },
    sts: { t: 'levantarse de la silla ×5', rows: [['Silla', 'Sin reposabrazos, ~43–46 cm de altura, apoyada en la pared'], ['Cámara', 'Lateral, fija, a 2–3 m; silla y paciente enteros'], ['Consigna', '«Levántese y siéntese 5 veces lo más rápido que pueda, brazos cruzados»'], ['Inicio', 'Empezar a grabar con el paciente sentado'], ['Referencia', 'Media por edad (≥ 60 años) y umbral de 15 s'], ['Resultados', 'Tiempo total, tiempo por repetición, regularidad, estrategia del tronco']] },
    balance: { t: 'equilibrio', rows: [['Cámara', 'Frontal, fija, a la altura de la cadera'], ['Distancia', '2–3 m, cuerpo entero visible'], ['Prueba', 'Bipedestación o apoyo monopodal sin moverse del sitio'], ['Duración', '20–30 s (o hasta que apoye el pie)'], ['Seguimiento', 'Repite siempre la misma colocación de cámara'], ['Resultados', 'Velocidad, RMS y rango de oscilación; tiempo monopodal']] },
  };
  function renderGuide() {
    const g = GUIDES[state.type];
    $('#guide-title').textContent = 'Cómo grabar: ' + g.t;
    $('#guide').innerHTML = g.rows.map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('');
  }
  function updateRunButton() { $('#an-run').hidden = state.src !== 'file'; $('#an-run').disabled = !state.file || !!state.abort; }
  function setFile(f) {
    if (!f) return;
    if (!/^video\//.test(f.type) && !/\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(f.name)) { toast('El archivo no parece un vídeo.', true); return; }
    state.file = f;
    $('#drop-text').innerHTML = `<div class="file">${esc(f.name)}</div><p>${(f.size / 1048576).toFixed(1)} MB · pulsa para cambiarlo</p>`;
    updateRunButton();
  }
  function selectedPatient() { const v = $('#an-patient').value; return v && v !== '__new' ? patientById(v) : null; }
  async function ensureEngine() {
    const cx = +$('#an-precision').value;
    $('#an-status').textContent = 'Cargando el modelo de visión (la primera vez tarda unos segundos)…';
    await engine.init(cx);
  }

  async function runFile() {
    const patient = selectedPatient();
    if (!patient) { toast('Elige un paciente o crea uno nuevo.', true); return; }
    if (!state.file) return;
    $('#an-result').hidden = true;
    const ctrl = new AbortController(); state.abort = ctrl;
    $('#an-cancel').hidden = false; updateRunButton();
    const prog = $('#an-progress'); prog.hidden = false; prog.firstElementChild.style.width = '0%';
    $('#stage-empty').hidden = true;
    const badge = $('#stage-badge'); badge.hidden = false; badge.className = 'badge'; badge.textContent = 'Preparando…';
    try {
      await ensureEngine();
      const kf = keyframeTracker(state.type);
      const t0 = performance.now(); let n = 0;
      const out = await window.MCPose.processVideo(engine, state.file, {
        fps: FPS[state.type], canvas: $('#an-canvas'), signal: ctrl.signal,
        onFrame: ({ t, lm, canvas }) => { n++; kf.push(t, lm, canvas); badge.textContent = `${lm ? '33 puntos' : 'sin persona'} · ${t.toFixed(1)} s`; $('#an-fps').textContent = `${(n / ((performance.now() - t0) / 1000)).toFixed(1)} fotogramas/s`; },
        onProgress: (p) => { prog.firstElementChild.style.width = (p * 100).toFixed(1) + '%'; $('#an-status').textContent = `Analizando fotogramas… ${Math.round(p * 100)} %`; },
      });
      await finishAnalysis(patient, out, kf.result(), state.file.name);
    } catch (e) {
      if (e.name === 'AbortError') $('#an-status').textContent = 'Análisis cancelado.';
      else { console.error(e); $('#an-status').textContent = e.message; toast(e.message, true); }
    } finally { state.abort = null; $('#an-cancel').hidden = true; prog.hidden = true; updateRunButton(); }
  }

  // Fotograma clave: máxima flexión de rodilla (marcha y sentadilla), máxima subida (silla) o centro (equilibrio)
  function keyframeTracker(type) {
    let best = -1, img = null, mid = null, count = 0;
    const snap = (canvas) => { const c = document.createElement('canvas'); const sc = Math.min(1, 640 / canvas.width); c.width = canvas.width * sc; c.height = canvas.height * sc; c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.82); };
    return {
      push(t, lm, canvas) {
        if (!lm) return; count++;
        if (type === 'balance') { if (count === 40 || !mid) mid = snap(canvas); return; }
        const f = { lm }, m = { width: canvas.width, height: canvas.height };
        const v = Math.max(MM.kneeFlex(f, m, 'L') || 0, MM.kneeFlex(f, m, 'R') || 0);
        if (v > best + 2) { best = v; img = snap(canvas); }
      },
      result() { return type === 'balance' ? mid : img; },
    };
  }

  async function finishAnalysis(patient, out, keyframe, source) {
    $('#an-status').textContent = 'Calculando métricas…';
    const meta = Object.assign({}, out.meta, { patient: { age: ageOf(patient), sex: patient.sex, heightCm: patient.heightCm }, model: +$('#an-precision').value === 1 ? 'Full' : 'Lite' });
    const res = MM.analyze(state.type, out.frames, meta);
    const a = Object.assign(res, { id: uid(), patientId: patient.id, date: new Date().toISOString(), source, keyframe, notes: '', duration: out.meta.duration });
    try { a.replay = window.MCReplay.encode(out.frames, { width: out.meta.width, height: out.meta.height }); } catch (e) { console.warn('No se pudo guardar la secuencia', e); }
    if (source !== 'Cámara en directo' && state.file) state.videos[a.id] = URL.createObjectURL(state.file);
    await S.put('analyses', a); state.analyses.push(a); state.current = a;
    $('#an-status').textContent = `Análisis guardado en la ficha de ${patient.name}: ${out.frames.length} fotogramas, vista ${a.view}.`;
    showResult(a);
    toast('Análisis completado y guardado');
  }

  // ======================= detalle de un análisis (resultado nuevo o sesión guardada) =======================
  function destroyPlayers() { state.players.forEach((pl) => pl.destroy()); state.players = []; }

  function detailHTML(a, opts) {
    const first = firstOf(a);
    const reps = repsHTML(a);
    return `
      <div class="card summary">${summaryHTML(a)}</div>
      <div class="card mt"><h3><span>Revisión del movimiento</span><span class="small">${opts.videoURL ? 'Vídeo de esta sesión con el esqueleto detectado' : 'Esqueleto reconstruido con los puntos guardados (el vídeo no se guarda)'}</span></h3>
        <div class="d-player"></div>
        <p class="small" style="margin:8px 0 0">Espacio: reproducir o pausar · ← →: fotograma a fotograma · pulsa en la línea de tiempo o en la gráfica para saltar a ese instante.${a.type === 'gait' ? ' Barras de la línea de tiempo: fase de apoyo de cada pierna; huecos: oscilación.' : ''}</p></div>
      <div class="grid g2 mt">
        <div class="card"><h3 class="d-chart-title"></h3><div class="chart-box d-chart"></div><div class="chart-box d-chart2"></div><p class="small d-chart-note"></p></div>
        <div class="card">${compareHTML(a)}${first ? `<div class="actions" style="margin-top:12px"><a class="btn sm" href="#comparar-${first.id}~${a.id}">Comparar con la primera sesión, lado a lado →</a></div>` : ''}</div>
      </div>
      <div class="card mt"><h3><span>Resultados</span><span class="small">media ± DE · n = ciclos, repeticiones o ventanas</span></h3><div class="table-wrap">${metricTableHTML(a)}</div></div>
      <div class="grid g2e mt">
        <div class="card"><h3>Alertas</h3><ul class="flags">${flagsHTML(a)}</ul></div>
        <div class="card">${qualityHTML(a)}</div>
      </div>
      ${reps ? `<div class="card mt">${reps}</div>` : ''}
      <details class="card mt method-box"><summary>Método y referencias de este análisis</summary>${methodsHTML(a)}</details>
      <div class="card mt form">
        <div class="field"><label for="notes-${a.id}">Valoración profesional (se incluye en el informe; puedes editarla)</label><textarea id="notes-${a.id}" class="d-notes"></textarea></div>
        <div class="actions"><a class="btn primary" href="#informe-${a.id}">Ver informe PDF</a><button class="btn d-csv">Descargar datos del análisis (CSV)</button>${opts.fresh ? '<button class="btn d-new">Analizar otro vídeo</button>' : ''}</div>
      </div>`;
  }

  // Cursor sincronizado sobre una gráfica (línea vertical que sigue al reproductor)
  function addCursor(box) {
    let el = box.querySelector('.chart-cursor');
    if (!el) { el = document.createElement('div'); el.className = 'chart-cursor'; box.style.position = 'relative'; box.appendChild(el); }
    return (x) => { const cv = box.querySelector('canvas'); if (!cv || !cv.mcScale || x == null) { el.hidden = true; return; } const sc = cv.mcScale; const px = sc.l + ((x - sc.x0) / (sc.x1 - sc.x0)) * (sc.W - sc.l - sc.r), kx = cv.clientWidth / sc.W, ky = cv.clientHeight / sc.H; el.hidden = px < sc.l - 1 || px > sc.W - sc.r + 1; el.style.left = cv.offsetLeft + px * kx + 'px'; el.style.top = cv.offsetTop + sc.t * ky + 'px'; el.style.height = sc.h * ky + 'px'; };
  }
  const chartXAt = (cv, clientX) => { const sc = cv.mcScale; if (!sc) return null; const r = cv.getBoundingClientRect(); const px = ((clientX - r.left) / r.width) * sc.W; return sc.x0 + ((px - sc.l) / (sc.W - sc.l - sc.r)) * (sc.x1 - sc.x0); };
  // zancada (lado izquierdo, o derecho si no hay) que contiene el instante t
  function strideAt(a, t) {
    const ev = a.events || {}; const hs = (ev.hsL && ev.hsL.length > 1 ? ev.hsL : ev.hsR) || [];
    for (let k = 0; k < hs.length - 1; k++) if (t >= hs[k] && t < hs[k + 1]) return [hs[k], hs[k + 1]];
    return hs.length > 1 ? (t < hs[0] ? [hs[0], hs[1]] : [hs[hs.length - 2], hs[hs.length - 1]]) : null;
  }

  function mountDetail(container, a, opts = {}) {
    destroyPlayers();
    container.hidden = false;
    container.innerHTML = detailHTML(a, opts);
    const q = (sel) => container.querySelector(sel);
    const spec = mainChartSpec(a, theme());
    q('.d-chart-title').textContent = spec.title; q('.d-chart-note').textContent = (spec.note || '') + ' Pulsa en la gráfica para ver ese instante en el vídeo.';
    drawChart(q('.d-chart'), spec, 250);
    drawChart(q('.d-chart2'), secondChartSpec(a), 200);
    const isCycle = a.type === 'gait' && a.cycles && (a.cycles.kneeL || a.cycles.kneeR);
    const cur1 = addCursor(q('.d-chart')), cur2 = isCycle && q('.d-chart2').querySelector('canvas') ? addCursor(q('.d-chart2')) : () => {};
    const frames = a.replay && window.MCReplay ? window.MCReplay.decode(a.replay) : [];
    let player = null;
    if (frames.length) {
      player = new window.MCPlayer(q('.d-player'), {
        frames, w: a.replay.w, h: a.replay.h, videoURL: opts.videoURL, events: a.events,
        onTime: (t) => {
          if (isCycle) { const st = strideAt(a, t); const pct = st ? Math.max(0, Math.min(100, (100 * (t - st[0])) / (st[1] - st[0]))) : null; cur1(pct); cur2(pct); }
          else cur1(t);
        },
      });
      state.players.push(player);
      [q('.d-chart'), q('.d-chart2')].forEach((box) => box.addEventListener('click', (e) => {
        const cv = box.querySelector('canvas'); if (!cv) return; const x = chartXAt(cv, e.clientX); if (x == null) return;
        if (isCycle) { const st = strideAt(a, player.t); if (st) player.seek(st[0] + (Math.max(0, Math.min(100, x)) / 100) * (st[1] - st[0])); }
        else player.seek(x);
      }));
    } else q('.d-player').innerHTML = '<p class="small">Este análisis se hizo con una versión anterior y no guarda la secuencia del movimiento.</p>';
    const ta = q('.d-notes'); ta.value = a.notes || a.interpretation;
    ta.addEventListener('change', async () => { a.notes = ta.value; await S.put('analyses', a); toast('Valoración guardada'); });
    q('.d-csv').onclick = () => exportAnalysisCSV(a);
    const nb = q('.d-new'); if (nb) nb.onclick = () => { destroyPlayers(); container.hidden = true; window.scrollTo({ top: 0, behavior: 'smooth' }); };
  }

  function showResult(a) {
    mountDetail($('#an-result'), a, { videoURL: state.videos[a.id], fresh: true });
    $('#an-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Datos del análisis para investigación: series filtradas, eventos y ciclos promedio
  function exportAnalysisCSV(a) {
    const p = patientById(a.patientId) || {}, num = (v) => (v == null ? '' : String(v).replace('.', ','));
    const keys = Object.keys(a.series).filter((k) => k !== 't');
    const lines = [`# MotionClin · ${p.name || ''} · ${TYPE[a.type]} · ${a.date.slice(0, 10)} · ${a.fs} Hz · filtro ${a.fc} Hz`, ['t (s)', ...keys].join(';')];
    a.series.t.forEach((t, i) => lines.push([num(t), ...keys.map((k) => num(a.series[k][i]))].join(';')));
    lines.push('', '# Eventos (s)');
    for (const [k, v] of Object.entries(a.events || {})) lines.push([k, ...(v || []).map(num)].join(';'));
    if (a.cycles) {
      lines.push('', '# Ciclo promedio (0–100 %)', ['%', ...Object.keys(a.cycles).filter((k) => a.cycles[k] && a.cycles[k].mean).flatMap((k) => [k + ' media', k + ' DE'])].join(';'));
      for (let i = 0; i < 51; i++) lines.push([i * 2, ...Object.keys(a.cycles).filter((k) => a.cycles[k] && a.cycles[k].mean).flatMap((k) => [num(a.cycles[k].mean[i]), num(a.cycles[k].sd[i])])].join(';'));
    }
    lines.push('', '# Métricas', 'Parámetro;Media;DE;n;Unidad;Referencia;Valoración;Fiabilidad');
    for (const m of a.metrics) lines.push([m.label, num(m.value), num(m.sd), m.n == null ? '' : m.n, m.unit, m.ref ? m.ref.text : '', m.eval || '', m.rel || ''].join(';'));
    saveFile(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `MotionClin_datos_${(p.name || 'paciente').replace(/[^\wáéíóúñü]+/gi, '_')}_${a.type}_${a.date.slice(0, 10)}.csv`);
  }

  // ---------- cámara ----------
  async function startCamera() {
    const patient = selectedPatient();
    if (!patient) { toast('Elige un paciente o crea uno nuevo.', true); return; }
    try {
      await ensureEngine();
      const live = new window.MCPose.LiveSession(engine, $('#cam-video'), $('#an-canvas'));
      $('#stage-empty').hidden = true;
      const badge = $('#stage-badge'); badge.hidden = false; badge.className = 'badge';
      live.onTick = (sec, lm) => { badge.textContent = live.recording ? `● GRABANDO ${sec.toFixed(1)} s` : lm ? 'Cámara · persona detectada' : 'Cámara · colócate en el encuadre'; badge.classList.toggle('rec', live.recording); if (live.recording && sec >= 40) stopRecording(); };
      await live.start();
      state.live = live;
      $('#an-status').textContent = 'Cámara activa. Cuando el paciente esté listo, pulsa «Grabar y analizar».';
      $('#cam-start').disabled = true; $('#cam-rec').disabled = false; $('#cam-stop').disabled = false;
    } catch (e) {
      const msg = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'No hay permiso para usar la cámara aquí. Abre MotionClin desde su web o graba con el móvil y sube el vídeo.' : (e.message || 'No se ha podido abrir la cámara.');
      $('#an-status').textContent = msg; toast(msg, true);
    }
  }
  function toggleRecording() {
    const live = state.live; if (!live) return;
    if (!live.recording) { live.record(); $('#cam-rec').textContent = 'Terminar y analizar'; } else stopRecording();
  }
  async function stopRecording() {
    const live = state.live; if (!live || !live.recording) return;
    const out = live.stopRecording();
    $('#cam-rec').textContent = 'Grabar y analizar';
    const kf = keyframeTracker(state.type), lastWith = [...out.frames].reverse().find((f) => f.lm);
    if (lastWith) kf.push(lastWith.t, lastWith.lm, $('#an-canvas'));
    try { await finishAnalysis(selectedPatient(), out, kf.result(), 'Cámara en directo'); } catch (e) { $('#an-status').textContent = e.message; toast(e.message, true); }
  }
  function stopCamera() {
    if (state.live) { state.live.stop(); state.live = null; }
    $('#cam-start').disabled = false; $('#cam-rec').disabled = true; $('#cam-stop').disabled = true; $('#cam-rec').textContent = 'Grabar y analizar';
    $('#stage-badge').hidden = true;
  }

  // ---------- informe ----------
  function currentReportAnalysis() { return state.analyses.find((a) => a.id === $('#rep-select').value); }
  function renderReportPreview() {
    const a = currentReportAnalysis(), box = $('#rep-preview');
    if (!a) { box.innerHTML = '<div class="card empty-state"><h3>No hay análisis</h3><p>Haz un análisis para generar su informe.</p><a class="btn primary" href="#analisis">Nuevo análisis</a></div>'; return; }
    const p = patientById(a.patientId) || { name: 'Paciente eliminado' };
    const hist = sessionsOf(a.patientId, a.type), n = hist.findIndex((h) => h.id === a.id) + 1, c = state.clinic, age = ageOf(p);
    box.innerHTML = `<div class="paper">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:2px solid #1878d6;padding-bottom:10px;margin-bottom:14px">
        <div style="display:flex;gap:10px;align-items:center">${c.logo ? `<img src="${c.logo}" alt="" style="height:36px;width:auto">` : ''}<div><b style="font-family:var(--f-display);font-size:16px">${esc(c.name || 'Clínica')}</b><div class="meta" style="margin:0">${esc(c.physio ? 'Fisioterapeuta: ' + c.physio : '')}</div></div></div>
        <div class="meta" style="text-align:right;margin:0">Informe de análisis de movimiento<br>${fmtDate(a.date)}</div></div>
      <h3>${esc(p.name)}</h3>
      <div class="meta">${[age ? age + ' años' : null, p.heightCm ? p.heightCm + ' cm' : null, p.condition].filter(Boolean).map(esc).join(' · ')}<br>${TYPE[a.type]} · Sesión ${n} de ${hist.length} · Vista ${esc(a.view)} · Calidad de captura ${a.quality.score} %</div>
      <div class="cols">
        <div>${a.keyframe ? `<img src="${a.keyframe}" alt="Fotograma con esqueleto">` : ''}
          <div class="row" style="margin-top:10px"><span>${esc(a.main.label)}</span><b>${esc(fmtValSd(a.main))}</b></div>
          <div id="rep-chart" class="chart-box" style="margin-top:10px"></div></div>
        <div style="min-width:0">${a.metrics.filter((m) => m.rel !== 'baja' || m.eval == null).slice(0, 14).map((m) => `<div class="row"><span>${esc(m.label)}</span><b>${esc(fmtValSd(m))}${m.eval && m.eval !== 'normal' ? ' ⚠' : ''}</b></div>`).join('')}</div>
      </div>
      ${a.flags.length ? `<h4>Puntos a revisar</h4>${a.flags.map((f) => `<div class="warnline">• ${esc(f)}</div>`).join('')}` : ''}
      <h4>Valoración profesional</h4>
      <textarea id="rep-notes" aria-label="Valoración profesional">${esc(a.notes || a.interpretation)}</textarea>
      <p class="meta" style="font-size:11px;margin-top:10px">El PDF incluye la tabla completa con referencias y fiabilidad, las gráficas, la comparación estadística con la sesión anterior${hist.length > 2 ? ', la tendencia entre sesiones' : ''}, el método y la bibliografía.</p>
    </div>`;
    const spec = mainChartSpec(a, null, { L: '#0f9e8f', R: '#d98a00', band: 'rgba(24,120,214,.12)', blue: '#1878d6' });
    const cbox = $('#rep-chart'), cv = document.createElement('canvas'); cbox.appendChild(cv);
    window.MCCharts.lineChart(cv, Object.assign({ width: Math.max(260, cbox.clientWidth), height: 200, theme: { bg: '#f8fbff', fg: '#10233b', muted: '#5b6e85', grid: '#e3eaf3' } }, spec.opts));
    $('#rep-notes').addEventListener('change', async (e) => { a.notes = e.target.value; await S.put('analyses', a); toast('Valoración guardada'); });
  }
  async function downloadReport() {
    const a = currentReportAnalysis(); if (!a) return;
    const ta = $('#rep-notes'); if (ta && ta.value !== (a.notes || a.interpretation)) { a.notes = ta.value; await S.put('analyses', a); }
    const btn = $('#rep-download'); btn.disabled = true; btn.textContent = 'Generando…';
    try {
      const p = patientById(a.patientId), hist = sessionsOf(a.patientId, a.type);
      const doc = await window.MCReport.build({ analysis: a, patient: p, clinic: state.clinic, history: hist, prev: prevOf(a), chartSpec: (x, colors) => mainChartSpec(x, null, colors), chartSpec2: (x, colors) => secondChartSpec(x, colors), progressSpec });
      const name = `MotionClin_${(p ? p.name : 'paciente').replace(/[^\wáéíóúñü]+/gi, '_')}_${TYPE[a.type].replace(/[^\wáéíóúñü]+/gi, '_')}_${a.date.slice(0, 10)}.pdf`;
      await saveFile(doc.output('blob'), name);
    } catch (e) { console.error(e); toast('No se ha podido generar el PDF: ' + e.message, true); }
    finally { btn.disabled = false; btn.textContent = 'Descargar PDF'; }
  }

  // ======================= comparador antes / después =======================
  let cmpState = { pid: null, type: null, a: null, b: null };
  function renderCompare(arg) {
    const eligible = state.patients.filter((p) => ['gait', 'squat', 'sts', 'balance'].some((t) => sessionsOf(p.id, t).length >= 2));
    if (arg && arg.includes('~')) { const [ia, ib] = arg.split('~'); const A = state.analyses.find((x) => x.id === ia), B = state.analyses.find((x) => x.id === ib); if (A && B) cmpState = { pid: A.patientId, type: A.type, a: ia, b: ib }; }
    if (!eligible.length) { $('#cmp-body').innerHTML = '<div class="card empty-state mt"><h3>Hace falta un paciente con al menos dos sesiones de la misma prueba</h3><p>Analiza otra sesión o carga los datos de ejemplo desde Ajustes.</p></div>'; ['#cmp-patient', '#cmp-type', '#cmp-a', '#cmp-b'].forEach((s) => ($(s).innerHTML = '')); return; }
    if (!eligible.some((p) => p.id === cmpState.pid)) cmpState = { pid: eligible[0].id, type: null, a: null, b: null };
    $('#cmp-patient').innerHTML = eligible.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join(''); $('#cmp-patient').value = cmpState.pid;
    const types = ['gait', 'squat', 'sts', 'balance'].filter((t) => sessionsOf(cmpState.pid, t).length >= 2);
    if (!types.includes(cmpState.type)) cmpState.type = types[0];
    $('#cmp-type').innerHTML = types.map((t) => `<option value="${t}">${TYPE[t]}</option>`).join(''); $('#cmp-type').value = cmpState.type;
    const ss = sessionsOf(cmpState.pid, cmpState.type);
    if (!ss.some((x) => x.id === cmpState.a)) cmpState.a = ss[0].id;
    if (!ss.some((x) => x.id === cmpState.b) || cmpState.b === cmpState.a) cmpState.b = ss[ss.length - 1].id;
    const opt = ss.map((x, i) => `<option value="${x.id}">S${i + 1} · ${fmtDate(x.date)} · ${esc(fmtValSd(x.main))}</option>`).join('');
    $('#cmp-a').innerHTML = opt; $('#cmp-b').innerHTML = opt; $('#cmp-a').value = cmpState.a; $('#cmp-b').value = cmpState.b;
    drawCompare();
  }
  function compareChanged(sel) {
    if (sel === '#cmp-patient') cmpState = { pid: $('#cmp-patient').value, type: null, a: null, b: null };
    else if (sel === '#cmp-type') Object.assign(cmpState, { type: $('#cmp-type').value, a: null, b: null });
    else Object.assign(cmpState, { a: $('#cmp-a').value, b: $('#cmp-b').value });
    renderCompare();
  }
  function drawCompare() {
    destroyPlayers();
    const A = state.analyses.find((x) => x.id === cmpState.a), B = state.analyses.find((x) => x.id === cmpState.b);
    if (!A || !B) return;
    const ia = sessionsOf(A.patientId, A.type).findIndex((x) => x.id === A.id) + 1, ib = sessionsOf(B.patientId, B.type).findIndex((x) => x.id === B.id) + 1;
    const mc = MM.mainCompare(A, B);
    const days = Math.round((new Date(B.date) - new Date(A.date)) / 864e5);
    const head = (x, n, cls) => `<div class="cmp-head ${cls}"><span class="cmp-tag">${cls === 'a' ? 'A' : 'B'} · S${n}</span><span>${fmtDate(x.date)}</span><b class="num">${esc(fmtValSd(x.main))}</b></div>`;
    const rows = B.metrics.filter((m) => typeof m.value === 'number').map((m) => {
      const ma = A.metrics.find((x) => x.key === m.key); if (!ma || typeof ma.value !== 'number') return '';
      const c = MM.compare(A, B).find((x) => x.key === m.key);
      const d = Math.round((m.value - ma.value) * 100) / 100;
      const v = c ? (c.relevant ? (c.direction ? `<span class="verdict ${c.direction}">${c.direction === 'mejora' ? 'Mejora' : 'Empeora'}</span>` : '<span class="verdict cambio">Cambio</span>') : '<span class="verdict igual">Sin cambio relevante</span>') : '<span class="small">—</span>';
      return `<tr><td>${esc(m.label)}</td><td class="num">${esc(fmtValSd(ma))}</td><td class="num">${esc(fmtValSd(m))}</td><td class="num">${d > 0 ? '+' : ''}${dec(d)}</td><td class="num">${c ? fmtP(c.p) : '–'}</td><td>${v}</td></tr>`;
    }).join('');
    $('#cmp-body').innerHTML = `
      <div class="card summary mt"><div><div class="lab">${esc(B.main.label)}</div><div class="big">${mc ? (mc.diff > 0 ? '+' : '') + dec(Math.round(mc.diff * 100) / 100) : '–'}<small>${esc(B.main.unit)}</small></div><div class="small">de S${ia} a S${ib} · ${days} días</div></div>
        <div><div class="lab">Significación</div><div class="val">${mc && mc.p != null ? 'p ' + fmtP(mc.p) : '–'}</div></div>
        <div><div class="lab">Tamaño del efecto</div><div class="val">${mc && mc.d != null ? 'd = ' + dec(mc.d.toFixed(2)) : '–'}</div></div>
        <div><div class="lab">Veredicto</div>${mc && mc.relevant && mc.direction ? `<span class="verdict ${mc.direction}">${mc.direction === 'mejora' ? 'Mejora demostrada' : 'Empeoramiento'}</span>` : '<span class="verdict igual">Sin cambio relevante</span>'}</div></div>
      <div class="card mt">
        <h3><span>Movimiento sincronizado</span><span class="small">${A.type === 'gait' ? 'alineado en el primer contacto del talón izquierdo' : 'alineado al inicio del registro'}</span></h3>
        <div class="grid g2e cmp-players"><div>${head(A, ia, 'a')}<div class="cmp-pl-a"></div></div><div>${head(B, ib, 'b')}<div class="cmp-pl-b"></div></div></div>
        <div class="pl-controls cmp-ctl">
          <button class="btn sm primary" id="cmp-play">▶︎ Reproducir</button>
          <div class="chips" role="group" aria-label="Velocidad">${[0.25, 0.5, 1].map((s2) => `<button class="chip" data-s="${s2}" aria-pressed="${s2 === 0.5}">${s2 === 1 ? '1×' : String(s2).replace('.', ',') + '×'}</button>`).join('')}</div>
          <input type="range" id="cmp-scrub" min="0" max="1000" value="0" aria-label="Posición" style="flex:1;min-width:120px">
        </div>
      </div>
      <div class="card mt"><h3 id="cmp-chart-title"></h3><div class="chart-box" id="cmp-chart"></div><p class="small">Discontinua: sesión A · continua: sesión B.</p></div>
      <div class="card mt">${comparePairHTML(A, B, 'Estadística del cambio (A → B)')}</div>
      <div class="card mt"><h3>Todas las variables</h3><div class="table-wrap"><table class="cmp"><thead><tr><th>Parámetro</th><th>A</th><th>B</th><th>Δ</th><th>p</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    // reproductores sincronizados
    const off = (x) => (x.type === 'gait' && x.events && x.events.hsL && x.events.hsL.length ? x.events.hsL[0] : 0);
    const fa = A.replay ? window.MCReplay.decode(A.replay) : [], fb = B.replay ? window.MCReplay.decode(B.replay) : [];
    const oa = off(A), ob = off(B);
    const pa = fa.length ? new window.MCPlayer($('.cmp-pl-a'), { frames: fa, w: A.replay.w, h: A.replay.h, events: A.events, external: true, compact: true }) : null;
    const pb = fb.length ? new window.MCPlayer($('.cmp-pl-b'), { frames: fb, w: B.replay.w, h: B.replay.h, events: B.events, external: true, compact: true }) : null;
    [pa, pb].forEach((x) => x && state.players.push(x));
    if (!pa) $('.cmp-pl-a').innerHTML = '<p class="small">Sin secuencia guardada.</p>'; if (!pb) $('.cmp-pl-b').innerHTML = '<p class="small">Sin secuencia guardada.</p>';
    const span = Math.max(0.1, Math.min(pa ? pa.duration - oa : 1e9, pb ? pb.duration - ob : 1e9));
    let t = 0, speed = 0.5, playing = false, raf = null;
    const set = (tt) => { t = Math.max(0, Math.min(span, tt)); if (pa) pa.setTime(oa + t); if (pb) pb.setTime(ob + t); $('#cmp-scrub').value = Math.round((t / span) * 1000); };
    const stop = () => { playing = false; cancelAnimationFrame(raf); $('#cmp-play').innerHTML = '▶︎ Reproducir'; };
    $('#cmp-play').onclick = () => {
      if (playing) return stop();
      playing = true; $('#cmp-play').innerHTML = '❚❚ Pausa'; if (t >= span) t = 0; let last = performance.now();
      const step = (now) => { if (!playing) return; set(t + ((now - last) / 1000) * speed); last = now; if (t >= span) { stop(); return; } raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    };
    $$('.cmp-ctl .chip').forEach((b) => (b.onclick = () => { speed = +b.dataset.s; $$('.cmp-ctl .chip').forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
    $('#cmp-scrub').oninput = (e) => { stop(); set((+e.target.value / 1000) * span); };
    [pa, pb].forEach((x, k) => x && (x.o.onSeek = (tt) => { stop(); set(tt - (k ? ob : oa)); }));
    state.players.push({ destroy: stop });
    set(0);
    // curvas superpuestas
    const colors = { L: css('--cyan'), R: css('--amber') };
    let specC;
    if (A.type === 'gait' && A.cycles && B.cycles) {
      const norm = MM.normKnee(51), xs = norm.map((_, k) => k * 2), series = [{ name: 'Referencia ± 1 DE', color: 'rgba(143,165,191,.9)', width: 1, dash: [2, 3], legend: false, data: xs.map((x, k) => [x, norm[k]]), band: xs.map((x, k) => [x, norm[k] - MM.NORM_SD, norm[k] + MM.NORM_SD]), bandColor: 'rgba(143,165,191,.15)' }];
      for (const s2 of ['L', 'R']) {
        if (A.cycles['knee' + s2]) series.push({ name: `A ${s2 === 'L' ? 'izq.' : 'der.'}`, color: colors[s2], width: 1.6, dash: [6, 4], data: xs.map((x, k) => [x, A.cycles['knee' + s2].mean[k]]) });
        if (B.cycles['knee' + s2]) series.push({ name: `B ${s2 === 'L' ? 'izq.' : 'der.'}`, color: colors[s2], width: 2.6, data: xs.map((x, k) => [x, B.cycles['knee' + s2].mean[k]]) });
      }
      specC = { title: 'Flexión de rodilla en el ciclo de marcha: A frente a B', opts: { series, yUnit: '°', xFormat: (x) => x + '%', xTicks: [0, 20, 40, 60, 80, 100], yMin: -5 } };
    } else {
      const sig = (x) => (x.type === 'sts' ? x.series.pelvis : x.type === 'balance' ? x.series.sway : x.series.kneeL.map((v, i) => (v != null && x.series.kneeR[i] != null ? (v + x.series.kneeR[i]) / 2 : v)));
      const lab = A.type === 'sts' ? 'Altura de la pelvis (%)' : A.type === 'balance' ? 'Oscilación angular (°)' : 'Flexión media de rodilla (°)';
      specC = { title: lab + ': A frente a B', opts: { series: [{ name: 'A', color: css('--muted'), width: 1.6, dash: [6, 4], data: A.series.t.map((x, i) => [x, sig(A)[i]]) }, { name: 'B', color: css('--cyan'), width: 2.4, data: B.series.t.map((x, i) => [x, sig(B)[i]]) }], xFormat: (x) => x + 's' } };
    }
    $('#cmp-chart-title').textContent = specC.title;
    drawChart($('#cmp-chart'), specC, 260);
  }

  // ======================= vídeo de ejemplo =======================
  async function runSample() {
    const Y = new Date().getFullYear();
    let p = patientById('sample-p');
    if (!p) {
      p = { id: 'sample-p', demo: true, name: 'Paciente del vídeo de ejemplo', birthYear: Y - 30, heightCm: 165, sex: 'F', condition: 'Clip público de marcha lateral (proyecto Sports2D, licencia BSD-3)', notes: 'Talla, edad y sexo supuestos para el ejemplo: la velocidad y las referencias dependen de ellos.', created: new Date().toISOString() };
      await S.put('patients', p); state.patients.push(p);
    }
    if ((location.hash || '').slice(1) !== 'analisis') location.hash = '#analisis';
    await new Promise((r) => setTimeout(r, 60));
    fillPatientSelect($('#an-patient')); $('#an-patient').value = p.id;
    state.type = 'gait'; $$('#an-type .chip').forEach((x) => x.setAttribute('aria-pressed', x.dataset.type === 'gait')); renderGuide();
    if (state.src !== 'file') $('#an-source .chip[data-src=file]').click();
    $('#an-status').textContent = 'Descargando el vídeo de ejemplo…';
    try {
      const v = document.createElement('video');
      const useMp4 = !v.canPlayType('video/webm; codecs="vp9"') && v.canPlayType('video/mp4');
      const url = useMp4 ? 'samples/marcha-lateral.mp4' : 'samples/marcha-lateral.webm';
      const blob = await (await fetch(url)).blob();
      setFile(new File([blob], useMp4 ? 'marcha-lateral.mp4' : 'marcha-lateral.webm', { type: useMp4 ? 'video/mp4' : 'video/webm' }));
      $('.stage').scrollIntoView({ behavior: 'smooth', block: 'center' });
      runFile();
    } catch (e) { toast('No se ha podido cargar el vídeo de ejemplo: ' + e.message, true); }
  }

  // ======================= bienvenida =======================
  let wlRaf = null;
  function openWelcome() {
    $('#welcome').hidden = false; $('#wl-sample').focus();
    const cv = $('#wl-canvas'), ctx = cv.getContext('2d');
    const sim = window.MCSynth.gait({ dur: 6, fps: 30, speed: 1.2, cadence: 108, sizeFrac: 0.42, noise: 0, seed: 7 });
    const start = performance.now();
    const loop = (now) => {
      const i = Math.max(0, Math.floor(((now - start) / 1000) * 30)) % sim.frames.length;
      const ph = sim.frames[i].lm, cx = (ph[23][0] + ph[24][0]) / 2, cy = (ph[23][1] + ph[24][1]) / 2;
      const lm = ph.map((p2) => [((p2[0] - cx) * 1280 * 0.82 + 180) / 360, ((p2[1] - cy) * 720 * 0.82 + 135) / 300, 0, p2[3]]);
      ctx.clearRect(0, 0, 360, 300);
      ctx.strokeStyle = 'rgba(143,165,191,.35)'; ctx.setLineDash([6, 6]); ctx.beginPath(); const fy = Math.max(...lm.slice(27, 33).map((p2) => p2[1])) * 300 + 4; ctx.moveTo(10, fy); ctx.lineTo(350, fy); ctx.stroke(); ctx.setLineDash([]);
      window.MCPose.drawFrame(ctx, null, lm, { showAngles: true });
      if (!$('#welcome').hidden) wlRaf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(wlRaf); wlRaf = requestAnimationFrame(loop);
  }
  function closeWelcome() { $('#welcome').hidden = true; cancelAnimationFrame(wlRaf); S.setSetting('welcomed', true); }

  // ---------- CSV / copia ----------
  function exportCSV() {
    const q = (v) => { const s = v == null ? '' : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const num = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : v);
    const head = ['Fecha', 'Paciente', 'Edad', 'Sexo', 'Talla (cm)', 'Prueba', 'Vista', 'Calidad (%)', 'Parámetro', 'Media', 'DE', 'n', 'Unidad', 'Referencia', 'Valoración', 'Fiabilidad'];
    const rows = [];
    for (const a of [...state.analyses].sort((x, y) => x.date.localeCompare(y.date))) {
      const p = patientById(a.patientId) || {};
      for (const m of a.metrics) rows.push([a.date.slice(0, 10), p.name || '', ageOf(p) || '', p.sex || '', p.heightCm || '', TYPE[a.type], a.view, a.quality.score, m.label, num(m.value), num(m.sd), m.n, m.unit, m.ref ? m.ref.text : '', m.eval ? EV_TXT[m.eval] : '', m.rel || '']);
    }
    const csv = '﻿' + [head, ...rows].map((r) => r.map(q).join(';')).join('\n');
    saveFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `MotionClin_resultados_${new Date().toISOString().slice(0, 10)}.csv`);
  }
  async function exportBackup() {
    const data = { app: 'MotionClin', version: 2, exported: new Date().toISOString(), clinic: state.clinic, patients: state.patients, analyses: state.analyses };
    saveFile(new Blob([JSON.stringify(data)], { type: 'application/json' }), `MotionClin_copia_${new Date().toISOString().slice(0, 10)}.json`);
  }
  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'MotionClin' || !Array.isArray(data.patients)) throw new Error('El archivo no es una copia de MotionClin.');
      for (const p of data.patients) await S.put('patients', p);
      for (const a of data.analyses || []) await S.put('analyses', a);
      if (data.clinic) { await S.setSetting('clinic', data.clinic); state.clinic = data.clinic; }
      state.patients = await S.all('patients'); state.analyses = await S.all('analyses');
      toast(`Importados ${data.patients.length} pacientes y ${(data.analyses || []).length} análisis`); render.ajustes();
    } catch (e) { toast(e.message || 'No se ha podido leer el archivo.', true); }
  }
  async function clearDemo(silent) {
    const keepSample = !!silent;
    const isDemoA = (x) => x.demo && !(keepSample && x.patientId === 'sample-p'), isDemoP = (x) => x.demo && !(keepSample && x.id === 'sample-p');
    for (const a of state.analyses.filter(isDemoA)) await S.del('analyses', a.id);
    for (const p of state.patients.filter(isDemoP)) await S.del('patients', p.id);
    state.analyses = state.analyses.filter((x) => !isDemoA(x)); state.patients = state.patients.filter((x) => !isDemoP(x));
    if (!silent) { toast('Datos de ejemplo borrados'); route(); }
  }

  // ---------- eventos ----------
  function bind() {
    window.addEventListener('hashchange', route);
    document.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a,button')) location.hash = tr.dataset.href; });
    $('#prog-patient').addEventListener('change', drawProgress);
    $('#btn-csv').onclick = exportCSV;
    $('#btn-clear-demo').onclick = () => clearDemo();

    $$('#an-type .chip').forEach((b) => b.onclick = () => { state.type = b.dataset.type; $$('#an-type .chip').forEach((x) => x.setAttribute('aria-pressed', x === b)); renderGuide(); });
    $$('#an-source .chip').forEach((b) => b.onclick = () => {
      state.src = b.dataset.src; $$('#an-source .chip').forEach((x) => x.setAttribute('aria-pressed', x === b));
      $('#src-file').hidden = state.src !== 'file'; $('#src-camera').hidden = state.src !== 'camera';
      if (state.src !== 'camera') stopCamera();
      updateRunButton();
    });
    $('#an-patient').addEventListener('change', (e) => { if (e.target.value === '__new') { returnToAnalysis = true; location.hash = '#pacientes'; setTimeout(() => openPatientForm(null), 0); } });
    $('#an-file').addEventListener('change', (e) => setFile(e.target.files[0]));
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => setFile(e.dataTransfer.files[0]));
    $('#an-run').onclick = runFile;
    $('#an-cancel').onclick = () => state.abort && state.abort.abort();
    $('#cam-start').onclick = startCamera; $('#cam-rec').onclick = toggleRecording; $('#cam-stop').onclick = () => { stopCamera(); $('#an-status').textContent = 'Cámara detenida.'; };
    $('#btn-sample').onclick = runSample;
    $('#wl-sample').onclick = () => { closeWelcome(); runSample(); };
    $('#wl-explore').onclick = () => { closeWelcome(); location.hash = '#pacientes'; };
    $('#wl-method').onclick = () => closeWelcome();
    $('#st-intro').onclick = () => openWelcome();
    $('#welcome').addEventListener('click', (e) => { if (e.target.id === 'welcome') closeWelcome(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#welcome').hidden) closeWelcome(); });
    ['#cmp-patient', '#cmp-type', '#cmp-a', '#cmp-b'].forEach((sel) => $(sel).addEventListener('change', (e) => compareChanged(sel)));

    $('#btn-add-patient').onclick = () => openPatientForm(null);
    $('#pf-save').onclick = savePatient;
    $('#pf-cancel').onclick = () => { $('#patient-form').hidden = true; if (returnToAnalysis) { returnToAnalysis = false; location.hash = '#analisis'; } };
    $('#p-search').addEventListener('input', renderPatientTable);

    $('#rep-select').addEventListener('change', renderReportPreview);
    $('#rep-download').onclick = downloadReport;

    $('#st-save').onclick = async () => {
      Object.assign(state.clinic, { name: $('#st-name').value.trim(), physio: $('#st-physio').value.trim(), contact: $('#st-contact').value.trim() });
      await S.setSetting('clinic', state.clinic); toast('Ajustes guardados');
    };
    $('#st-logo').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const img = new Image(); img.onload = async () => {
        const c = document.createElement('canvas'); const sc = Math.min(1, 300 / img.width); c.width = img.width * sc; c.height = img.height * sc;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); state.clinic.logo = c.toDataURL('image/png');
        await S.setSetting('clinic', state.clinic); render.ajustes(); toast('Logotipo guardado'); URL.revokeObjectURL(img.src);
      }; img.src = URL.createObjectURL(f);
    });
    $('#st-logo-prev').addEventListener('click', async (e) => { if (e.target.id === 'st-logo-del') { state.clinic.logo = null; await S.setSetting('clinic', state.clinic); render.ajustes(); } });
    $('#st-export').onclick = exportBackup;
    $('#st-import').addEventListener('change', (e) => e.target.files[0] && importBackup(e.target.files[0]));
    $('#st-demo').onclick = async () => { await clearDemo(true); await loadDemo(); await S.setSetting('demoVersion', 3); toast('Datos de ejemplo cargados'); render.ajustes(); };
    $('#st-wipe').onclick = () => ($('#st-wipe-confirm').hidden = false);
    $('#st-wipe-no').onclick = () => ($('#st-wipe-confirm').hidden = true);
    $('#st-wipe-yes').onclick = async () => {
      await S.clear('patients'); await S.clear('analyses'); await S.clear('settings'); await S.setSetting('seeded', true);
      state.patients = []; state.analyses = []; state.clinic = { name: 'Clínica Motion Fisio', physio: '', contact: '', logo: null };
      $('#st-wipe-confirm').hidden = true; toast('Datos borrados'); render.ajustes();
    };
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const h = (location.hash || '#panel').slice(1); if (h === 'panel' || h === '') drawProgress(); }, 200); });
  }

  // El navegador congela las pestañas ocultas: avisar si se cambia de pestaña durante un análisis
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.abort) $('#an-status').textContent = 'Análisis en pausa: el navegador detiene el vídeo en pestañas ocultas. Vuelve a esta pestaña para continuar.';
  });

  window.MCApp = { state, route };

  (async function init() {
    bind();
    $('#kpis').innerHTML = '<div class="card kpi" style="grid-column:1/-1"><div class="label">Preparando</div><div class="sub">Generando los pacientes de ejemplo y sus análisis con el motor (solo la primera vez)…</div></div>';
    try { await load(); } catch (e) { console.error(e); toast('No se han podido cargar los datos guardados: ' + e.message, true); }
    route();
    if (!(await S.setting('welcomed', false)) && !navigator.webdriver) openWelcome();
    if ('serviceWorker' in navigator && !window.claude && /^(https:|http:\/\/localhost)/.test(location.href)) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Sin modo sin conexión:', e));
    const ms = $('#model-status');
    setTimeout(() => {
      const t0 = performance.now();
      engine.init(1).then(() => { ms.className = 'pill ok'; ms.textContent = `Modelo de visión listo (${((performance.now() - t0) / 1000).toFixed(1)} s)`; })
        .catch((e) => { console.warn('Precarga del modelo:', e); ms.className = 'pill bad'; ms.textContent = 'El modelo no ha cargado: ' + (e.message || e); });
    }, 800);
  })();
})();
