/* MotionClin · idioma de la interfaz (español / inglés).
 * La app y el motor escriben en español; esta capa traduce lo que se muestra: el DOM (también lo que se pinta después,
 * con un MutationObserver), el texto de los canvas (gráficas, reproductor, fases) y los PDF. Así los análisis ya
 * guardados se ven en el idioma elegido sin recalcularse.
 * Búsqueda: frase exacta → plantilla con los números como «#» → reglas para textos compuestos → frases sueltas. */
(function (root) {
  'use strict';
  const NUM = /[-−+]?\d+(?:[.,]\d+)?/g;
  const STORE = 'mc-lang';
  const pickLang = () => {
    try { const q = new URLSearchParams(root.location.search).get('lang'); if (q === 'en' || q === 'es') return q; } catch { /* sin URL */ }
    try { const s = root.localStorage.getItem(STORE); if (s === 'en' || s === 'es') return s; } catch { /* sin almacenamiento */ }
    const n = (root.navigator && (root.navigator.language || '')) || 'es';
    return /^es\b/i.test(n) || !n ? 'es' : 'en';
  };

  let lang = 'es';
  let EN = {}, ENL = {};
  const cache = new Map();
  const miss = new Set();
  const setDict = (d) => { EN = d || {}; ENL = {}; for (const k of Object.keys(EN)) ENL[k.toLowerCase()] = EN[k]; cache.clear(); };

  const decEN = (s) => s.replace(/(\d),(\d)/g, '$1.$2');
  const fill = (tpl, nums) => { let i = 0; return tpl.replace(/#(\d)?/g, (m, k) => { const v = k != null ? nums[+k - 1] : nums[i++]; return v == null ? m : decEN(v); }); };
  const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MON_ABBR = { ene: 'Jan', feb: 'Feb', mar: 'Mar', abr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', ago: 'Aug', sept: 'Sep', sep: 'Sep', oct: 'Oct', nov: 'Nov', dic: 'Dec' };

  function lookup(s) {
    if (Object.prototype.hasOwnProperty.call(EN, s)) return EN[s];
    const nums = s.match(NUM) || [], key = s.replace(NUM, '#');
    if (nums.length && Object.prototype.hasOwnProperty.call(EN, key)) return fill(EN[key], nums);
    const lk = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ENL, lk) && s[0] === s[0].toLowerCase()) return lowerFirst(fill(ENL[lk], nums));
    return null;
  }

  // Textos compuestos: [expresión, función que devuelve la traducción (o null)]
  const RULES = [
    [/^• (.+)$/s, (m) => '• ' + tr(m[1])],
    [/^(.+?) ·$/s, (m) => tr(m[1]) + ' ·'],
    [/^Comparación con la sesión anterior \((.+)\)$/, (m) => `Comparison with the previous session (${tr(m[1])})`],
    [/^Evolución: (.+) por sesión \(media ± DE\)$/, (m) => `Progress: ${lowerFirst(tr(m[1].charAt(0).toUpperCase() + m[1].slice(1)))} by session (mean ± SD)`],
    [/^Tendencia lineal: (.+) por semana \(p (.+?); R² (.+?); (\d+) sesiones\)\.$/, (m) => `Linear trend: ${decEN(m[1])} per week (p ${decEN(m[2])}; R² ${decEN(m[3])}; ${m[4]} sessions).`],
    [/^Vista (\w+)( \(índice ([\d,.]+)\))?$/, (m) => `${{ lateral: 'Side', frontal: 'Front', oblicua: 'Oblique' }[m[1]] || m[1]} view${m[2] ? ` (index ${decEN(m[3])})` : ''}`],
    [/^persona detectada en el (\d+) % de (\d+) fotogramas$/, (m) => `person detected in ${m[1]} % of ${m[2]} frames`],
    [/^visibilidad media (.+)$/, (m) => `mean visibility ${decEN(m[1])}`],
    [/^duración (.+)$/, (m) => `duration ${decEN(m[1])}`],
    [/^(\d+) correcciones izq\.\/der\.\.?$/, (m) => `${m[1]} left/right corrections${m[0].endsWith('..') ? '.' : ''}`],
    [/^[^a-záéíóúñ]*[A-ZÁÉÍÓÚÑ]{3}[^a-záéíóúñ]*$/, (m) => { const lo = m[0].toLowerCase(), cap = lo.charAt(0).toUpperCase() + lo.slice(1); const x = lookup(cap) || lookup(lo); return x ? x.toUpperCase() : null; }],
    [/^(.+?):$/s, (m) => { const x = lookup(m[1]); return x != null ? x + ':' : null; }],
    [/^(\d{1,2}) de ([a-z]+) de (\d{4})$/, (m) => (MONTHS.includes(m[2]) ? `${m[1]} ${MONTHS_EN[MONTHS.indexOf(m[2])]} ${m[3]}` : null)],
    [/^(\d{1,2}) ([a-z]{3,4})\.? (\d{4})$/, (m) => (MON_ABBR[m[2]] ? `${m[1]} ${MON_ABBR[m[2]]} ${m[3]}` : null)],
    [/^(.+?): ([^:]+?) \(referencia (.+?)(; fiabilidad media)?\)\.$/s, (m) => `${tr(m[1])}: ${decEN(m[2])} (reference ${tr(m[3])}${m[4] ? '; medium reliability' : ''}).`],
    [/^Fuera del rango de referencia: (.+)\.$/s, (m) => `Outside the reference range: ${m[1].split('; ').map((x) => tr(x)).join('; ')}.`],
    [/^(.+) \(ejemplo\)$/, (m) => `${m[1]} (example)`],
    [/^← Ficha de (.+)$/, (m) => `← ${m[1]}'s record`],
    [/^¿Eliminar a (.+) y sus (\d+) análisis\?$/, (m) => `Delete ${m[1]} and their ${m[2]} analyses?`],
    [/^Análisis guardado en la ficha de (.+): (\d+) fotogramas, vista (\w+)\.$/, (m) => `Analysis saved to ${m[1]}'s record: ${m[2]} frames, ${tr(m[3])} view.`],
    [/^(Archivo listo|Descargado|No se ha podido guardar el archivo|No se ha podido generar el PDF|No se ha podido cargar el vídeo de ejemplo|No se han podido cargar los datos guardados|El modelo no ha cargado): ?(.*)$/s, (m) => `${tr(m[1])}: ${m[2]}`],
    [/^(Rodilla|Cadera) (izq\.|der\.) \(n=(\d+)\)$/, (m) => `${tr(m[1] + ' ' + m[2])} (n=${m[3]})`],
    [/^(.+) · (.+) \(media ± DE\) · (\d+) sesiones\. (.*)$/s, (m) => `${tr(m[1])} · ${tr(m[2])} (mean ± SD) · ${m[3]} sessions. ${tr(m[4])}`],
    [/^Media de todos los ciclos por lado frente a la referencia de laboratorio de Bovi et al\. \((\d+)\): (.+?)\. (.+)$/s, (m) => `Mean of all cycles per side against the laboratory reference of Bovi et al. (${m[1]}): ${tr(m[2])}. ${tr(m[3])}`],
    [/^Referencias de laboratorio de Bovi et al\. \((\d+)\), (.+?), elegidas por la velocidad del paciente normalizada por su talla \(([\d,.]+) % de la talla por segundo\): (.+)$/s, (m) => `Laboratory references from Bovi et al. (${m[1]}), ${tr(m[2])}, chosen from the patient's speed normalised by body height (${decEN(m[3])} % of height per second): ${tr(m[4])}`],
  ];

  /** Traduce un texto al idioma actual (en español lo devuelve igual). */
  function tr(s) {
    if (lang === 'es' || s == null) return s;
    s = String(s);
    if (!/[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(s)) return decEN(s);
    if (cache.has(s)) return cache.get(s);
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], core = s.trim();
    let out = lookup(core);
    if (out == null) for (const [re, fn] of RULES) { const m = core.match(re); if (m) { out = fn(m); if (out != null) break; } }
    if (out == null && / → /.test(core)) { const parts = core.split(' → '); if (parts.length === 2) out = parts.map((p) => tr(p)).join(' → '); }
    if (out == null && core.includes(' · ')) { const parts = core.split(' · '), tp = parts.map((p) => tr(p)); if (tp.some((x, i) => x !== parts[i])) out = tp.join(' · '); }
    if (out == null) {
      // varias frases: se traducen una a una
      const sents = core.split(/(?<=[.)!?])\s+(?=[A-ZÁÉÍÓÚ¿¡«])/);
      if (sents.length > 1) { const ts = sents.map((x) => tr(x)); if (ts.some((x, i) => x !== sents[i])) out = ts.join(' '); }
    }
    if (out == null && /pasos\/min/.test(core)) out = decEN(core.replace(/pasos\/min/g, 'steps/min'));
    if (out == null) { if (/[áéíóúñ¿¡]|\b(de|la|el|los|las|con|para|sin|por|del|se|y)\b/i.test(core)) miss.add(core); out = decEN(core); }
    out = lead + out + trail;
    if (cache.size > 5000) cache.clear();
    cache.set(s, out);
    return out;
  }

  // ---------- DOM ----------
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE']);
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const textMem = new WeakMap(), attrMem = new WeakMap();
  const skipEl = (el) => !el || SKIP.has(el.tagName) || el.closest('[data-noi18n],[contenteditable="true"]');
  function doText(n) {
    if (skipEl(n.parentElement)) return;
    let mem = textMem.get(n);
    if (!mem || n.nodeValue !== mem.shown) { mem = { orig: n.nodeValue, shown: n.nodeValue }; textMem.set(n, mem); }
    const want = lang === 'es' ? mem.orig : tr(mem.orig);
    if (n.nodeValue !== want) n.nodeValue = want;
    mem.shown = want;
  }
  function doAttrs(el) {
    if (skipEl(el) && el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') return;
    let mem = attrMem.get(el); if (!mem) { mem = {}; attrMem.set(el, mem); }
    for (const a of ATTRS) {
      const v = el.getAttribute(a); if (v == null) continue;
      if (!mem[a] || v !== mem[a].shown) mem[a] = { orig: v, shown: v };
      const want = lang === 'es' ? mem[a].orig : tr(mem[a].orig);
      if (v !== want) el.setAttribute(a, want);
      mem[a].shown = want;
    }
  }
  function walk(rootNode) {
    if (!rootNode) return;
    if (rootNode.nodeType === 3) { doText(rootNode); return; }
    if (rootNode.nodeType !== 1) return;
    doAttrs(rootNode);
    const w = root.document.createTreeWalker(rootNode, 5 /* elementos y texto */);
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  let observer = null, titleOrig = null;
  function applyDOM() {
    const d = root.document; if (!d || !d.body) return;
    d.documentElement.lang = lang;
    if (titleOrig == null) titleOrig = d.title;
    d.title = lang === 'es' ? titleOrig : tr(titleOrig);
    observer && observer.disconnect();
    walk(d.body);
    observer = new MutationObserver((list) => {
      observer.disconnect();
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
      }
      observer.observe(d.body, OBS);
    });
    observer.observe(d.body, OBS);
    d.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }
  const OBS = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };

  // ---------- canvas: gráficas, reproductor y tira de fases ----------
  function patchCanvas() {
    const P = root.CanvasRenderingContext2D && root.CanvasRenderingContext2D.prototype;
    if (!P || P.__mcI18n) return;
    const fill = P.fillText, stroke = P.strokeText, measure = P.measureText;
    P.fillText = function (t, ...a) { return fill.call(this, tr(t), ...a); };
    P.strokeText = function (t, ...a) { return stroke.call(this, tr(t), ...a); };
    P.measureText = function (t) { return measure.call(this, tr(t)); };
    P.__mcI18n = true;
  }

  function setLang(l, { rerender = true } = {}) {
    lang = l === 'en' ? 'en' : 'es';
    try { root.localStorage.setItem(STORE, lang); } catch { /* sin almacenamiento */ }
    cache.clear();
    applyDOM();
    if (rerender && root.dispatchEvent) root.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  const api = {
    get lang() { return lang; },
    t: tr, setLang, setDict, missing: () => [...miss].sort(),
    init() {
      setDict(root.MCI18nEN || {});
      lang = pickLang();
      patchCanvas();
      applyDOM();
      root.document.addEventListener('click', (e) => { const b = e.target.closest('[data-lang]'); if (b) setLang(b.dataset.lang); });
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.MCI18n = api;
    if (root.document) { if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => api.init()); else api.init(); }
  }
})(typeof window !== 'undefined' ? window : globalThis);
