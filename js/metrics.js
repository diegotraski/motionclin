/* MotionClin · motor de análisis biomecánico v2.
 *
 * Cadena de procesado (igual para todas las pruebas):
 *   1. Remuestreo a frecuencia uniforme (los vídeos y la cámara no siempre dan fotogramas equiespaciados).
 *   2. Corrección de intercambios izquierda/derecha por continuidad temporal (error típico de los modelos 2D).
 *   3. Descarte de puntos con visibilidad < 0,5 y, en marcha, de fotogramas que violan la longitud de los segmentos.
 *   4. Interpolación lineal de huecos ≤ 0,25 s.
 *   5. Filtro Butterworth paso bajo de 2º orden en doble pasada (fase cero), con la corrección de Winter.
 *   6. Ángulos articulares y señales derivadas sobre las trayectorias filtradas.
 *
 * Funciones puras: se usan en el navegador (window.MCMetrics) y se prueban en Node (module.exports).
 * Entrada: frames [{ t, lm: [[x,y,z,vis] ×33] | null }] (x,y normalizados) y meta { width, height, patient: {age, sex, heightCm} }.
 */
(function (root) {
  'use strict';

  const L = { NOSE: 0, LSH: 11, RSH: 12, LHIP: 23, RHIP: 24, LKNEE: 25, RKNEE: 26, LANK: 27, RANK: 28, LHEEL: 29, RHEEL: 30, LTOE: 31, RTOE: 32 };
  const USED = [0, 11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
  const SIDE = { L: { sh: 11, hip: 23, knee: 25, ank: 27, heel: 29, toe: 31 }, R: { sh: 12, hip: 24, knee: 26, ank: 28, heel: 30, toe: 32 } };
  const MIN_VIS = 0.5;
  const SHOULDER_TO_ANKLE = 0.779; // fracción de la talla (Drillis y Contini, 1966): hombro 0,818 − tobillo 0,039

  // ======================= utilidades numéricas =======================
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const nums = (a) => (a || []).filter(isNum);
  const mean = (a) => { const b = nums(a); return b.length ? b.reduce((s, v) => s + v, 0) / b.length : null; };
  const sd = (a) => { const b = nums(a); if (b.length < 2) return null; const m = mean(b); return Math.sqrt(b.reduce((s, v) => s + (v - m) ** 2, 0) / (b.length - 1)); };
  function percentile(a, p) { const b = nums(a).sort((x, y) => x - y); if (!b.length) return null; const i = (b.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return b[lo] + (b[hi] - b[lo]) * (i - lo); }
  const median = (a) => percentile(a, 0.5);
  const round = (v, d = 0) => (isNum(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cv = (a) => { const m = mean(a), s = sd(a); return isNum(m) && isNum(s) && m ? (100 * s) / Math.abs(m) : null; };
  // Índice de simetría de Robinson et al. (1987): 0 % = simetría perfecta
  const fx = (v, d) => v.toFixed(d).replace('.', ',');
  const robinsonSI = (l, r) => (isNum(l) && isNum(r) && l + r !== 0 ? (100 * Math.abs(r - l)) / (0.5 * Math.abs(r + l)) : null);

  // ======================= estadística =======================
  function lgamma(x) {
    const c = [76.1800917294715, -86.5053203294168, 24.0140982408309, -1.23173957245015, 0.00120865097386618, -0.00000539523938495]; // Lanczos (Numerical Recipes)
    let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp); let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log((2.5066282746310002 * ser) / x); // √(2π)
  }
  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300; const qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m; let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function ibeta(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
  // p bilateral de una t de Student con df grados de libertad
  const tTestP = (t, df) => (isNum(t) && df > 0 ? ibeta(df / (df + t * t), df / 2, 0.5) : null);
  // Prueba t de Welch (varianzas distintas) entre dos muestras + tamaño del efecto (d de Cohen)
  function welch(a, b) {
    a = nums(a); b = nums(b);
    if (a.length < 2 || b.length < 2) return null;
    const ma = mean(a), mb = mean(b), va = sd(a) ** 2, vb = sd(b) ** 2;
    const se2 = va / a.length + vb / b.length, diff = mb - ma;
    const pooled = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
    const d = pooled > 0 ? diff / pooled : null;
    if (se2 === 0) return { diff, t: null, df: null, p: diff === 0 ? 1 : 0, d, na: a.length, nb: b.length, ma, mb };
    const t = diff / Math.sqrt(se2);
    const df = se2 ** 2 / ((va / a.length) ** 2 / (a.length - 1) + (vb / b.length) ** 2 / (b.length - 1));
    return { diff, t, df, p: tTestP(t, df), d, na: a.length, nb: b.length, ma, mb };
  }
  // Regresión lineal simple con p de la pendiente
  function linreg(xs, ys) {
    const pts = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => isNum(x) && isNum(y));
    const n = pts.length; if (n < 3) return null;
    const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
    let sxx = 0, sxy = 0, syy = 0; for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
    if (!sxx) return null;
    const slope = sxy / sxx, intercept = my - slope * mx;
    const sse = pts.reduce((s, [x, y]) => s + (y - (intercept + slope * x)) ** 2, 0);
    const se = Math.sqrt(sse / (n - 2)) / Math.sqrt(sxx);
    const t = se > 0 ? slope / se : null;
    return { slope, intercept, r2: syy ? 1 - sse / syy : 1, p: se > 0 ? tTestP(t, n - 2) : 0, n };
  }

  // ======================= procesado de señal =======================
  // Butterworth paso bajo de 2º orden (transformación bilineal con prewarping)
  function butter2(fc, fs) {
    const wc = Math.tan((Math.PI * fc) / fs), k1 = Math.SQRT2 * wc, k2 = wc * wc, a0 = 1 + k1 + k2;
    const b0 = k2 / a0;
    return { b: [b0, 2 * b0, b0], a: [1, (2 * (k2 - 1)) / a0, (1 - k1 + k2) / a0] };
  }
  function lfilter(c, x) {
    const y = new Array(x.length); const { b, a } = c;
    let x1 = x[0], x2 = x[0], y1 = x[0], y2 = x[0]; // estado estacionario (ganancia DC = 1)
    for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
    return y;
  }
  // Filtrado de fase cero (adelante y atrás) con extensión por reflexión impar en los bordes
  function filtfilt(c, x, pad) {
    const n = x.length; if (n < 4) return x.slice();
    const p = Math.min(pad, n - 1);
    const ext = [];
    for (let i = p; i >= 1; i--) ext.push(2 * x[0] - x[i]);
    for (let i = 0; i < n; i++) ext.push(x[i]);
    for (let i = n - 2; i >= n - 1 - p; i--) ext.push(2 * x[n - 1] - x[i]);
    let y = lfilter(c, ext); y.reverse(); y = lfilter(c, y); y.reverse();
    return y.slice(p, p + n);
  }
  // Interpola huecos (null) de hasta maxGap muestras
  function fillGaps(a, maxGap) {
    const out = a.slice(); let i = 0;
    while (i < out.length) {
      if (isNum(out[i])) { i++; continue; }
      let j = i; while (j < out.length && !isNum(out[j])) j++;
      if (i > 0 && j < out.length && j - i <= maxGap) { const v0 = out[i - 1], v1 = out[j]; for (let k = i; k < j; k++) out[k] = v0 + ((v1 - v0) * (k - i + 1)) / (j - i + 1); }
      i = j;
    }
    return out;
  }
  // Filtra cada tramo continuo por separado. Doble pasada de 2º orden: fc de diseño = fc / 0,802 (Winter, 2009)
  function lowpass(a, fs, fc) {
    const fd = Math.min(fc / 0.802, 0.45 * fs); const c = butter2(fd, fs);
    const out = a.slice(); let i = 0;
    while (i < a.length) {
      if (!isNum(a[i])) { i++; continue; }
      let j = i; while (j < a.length && isNum(a[j])) j++;
      if (j - i >= 6) { const seg = filtfilt(c, a.slice(i, j), Math.round(fs)); for (let k = i; k < j; k++) out[k] = seg[k - i]; }
      i = j;
    }
    return out;
  }
  const deriv = (a, fs) => a.map((v, i) => (i > 0 && i < a.length - 1 && isNum(a[i - 1]) && isNum(a[i + 1]) ? ((a[i + 1] - a[i - 1]) * fs) / 2 : null));
  // Picos locales (sign=1 máximos, -1 mínimos) separados al menos w muestras
  function findPeaks(a, w, sign = 1) {
    const out = [];
    for (let i = 0; i < a.length; i++) {
      if (!isNum(a[i])) continue; let ok = true, strict = false;
      for (let k = Math.max(0, i - w); k <= Math.min(a.length - 1, i + w); k++) {
        if (k === i || !isNum(a[k])) continue;
        if (sign * a[k] > sign * a[i]) { ok = false; break; }
        if (sign * a[k] < sign * a[i]) strict = true;
      }
      if (ok && strict && (!out.length || i - out[out.length - 1] > w)) out.push(i);
    }
    return out;
  }
  // Interpolación parabólica del pico para precisión sub-fotograma
  function refinePeak(a, i) {
    if (i <= 0 || i >= a.length - 1 || !isNum(a[i - 1]) || !isNum(a[i + 1])) return i;
    const den = a[i - 1] - 2 * a[i] + a[i + 1];
    return den ? i + clamp((0.5 * (a[i - 1] - a[i + 1])) / den, -0.5, 0.5) : i;
  }
  const valAt = (a, x) => { const lo = Math.floor(x), hi = Math.min(a.length - 1, lo + 1); return isNum(a[lo]) && isNum(a[hi]) ? a[lo] + (a[hi] - a[lo]) * (x - lo) : isNum(a[Math.round(x)]) ? a[Math.round(x)] : null; };
  // Remuestrea una serie temporal en n puntos entre los índices i0 e i1
  function sampleBetween(a, i0, i1, n) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const x = i0 + ((i1 - i0) * k) / (n - 1), lo = Math.floor(x), hi = Math.min(a.length - 1, lo + 1);
      if (!isNum(a[lo]) || !isNum(a[hi])) { out.push(null); continue; }
      out.push(a[lo] + (a[hi] - a[lo]) * (x - lo));
    }
    return out;
  }

  // ======================= preparación de datos =======================
  function resample(frames) {
    const ts = frames.map((f) => f.t);
    const dts = ts.slice(1).map((t, i) => t - ts[i]).filter((d) => d > 0);
    const mdt = median(dts) || 1 / 15;
    const uniform = dts.every((d) => Math.abs(d - mdt) < 0.1 * mdt);
    // frecuencia media exacta (evita el sesgo de la mediana cuando los tiempos están redondeados)
    const fsRaw = frames.length > 1 && ts[ts.length - 1] > ts[0] ? (frames.length - 1) / (ts[ts.length - 1] - ts[0]) : 1 / mdt;
    if (uniform) return { frames, fs: fsRaw };
    const fs = clamp(Math.round(fsRaw), 10, 60), out = [];
    let j = 0;
    for (let t = ts[0]; t <= ts[ts.length - 1] + 1e-9; t += 1 / fs) {
      while (j < frames.length - 2 && frames[j + 1].t < t) j++;
      const a = frames[j], b = frames[Math.min(j + 1, frames.length - 1)];
      let lm = null;
      if (a.lm && b.lm && b.t - a.t <= 0.25 && b.t > a.t) { const r = clamp((t - a.t) / (b.t - a.t), 0, 1); lm = a.lm.map((p, k) => [p[0] + (b.lm[k][0] - p[0]) * r, p[1] + (b.lm[k][1] - p[1]) * r, p[2] + (b.lm[k][2] - p[2]) * r, Math.min(p[3], b.lm[k][3])]); }
      else { const nb = Math.abs(a.t - t) < Math.abs(b.t - t) ? a : b; if (Math.abs(nb.t - t) < 0.5 / fs) lm = nb.lm; }
      out.push({ t, lm });
    }
    return { frames: out, fs };
  }

  // Intercambio izquierda/derecha: si las piernas "saltan" de lado respecto a la predicción, se corrigen
  function fixSwaps(frames) {
    const pairs = [[25, 26], [27, 28], [29, 30], [31, 32]];
    let swaps = 0, p1 = null, p2 = null;
    const out = frames.map((f) => ({ t: f.t, lm: f.lm ? f.lm.map((p) => p.slice()) : null }));
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    for (const f of out) {
      if (!f.lm) { p1 = p2 = null; continue; }
      if (p1) {
        const pred = (k) => (p2 ? [2 * p1[k][0] - p2[k][0], 2 * p1[k][1] - p2[k][1]] : p1[k]);
        let same = 0, cross = 0;
        for (const [l, r] of pairs) { same += d(f.lm[l], pred(l)) + d(f.lm[r], pred(r)); cross += d(f.lm[l], pred(r)) + d(f.lm[r], pred(l)); }
        if (cross < 0.5 * same && same - cross > 0.04) { for (const [l, r] of pairs) { const tmp = f.lm[l]; f.lm[l] = f.lm[r]; f.lm[r] = tmp; } swaps++; }
      }
      p2 = p1; p1 = f.lm;
    }
    // Si se ha «corregido» más de la mitad de los fotogramas, la referencia inicial era la intercambiada:
    // se invierte todo para respetar la etiqueta que el modelo da en la mayoría de fotogramas.
    const valid = out.filter((f) => f.lm).length;
    if (swaps > valid / 2) {
      for (const f of out) if (f.lm) for (const [l, r] of pairs) { const tmp = f.lm[l]; f.lm[l] = f.lm[r]; f.lm[r] = tmp; }
      swaps = valid - swaps;
    }
    return { frames: out, swaps };
  }

  function detectView(frames, meta) {
    const r = frames.map((f) => {
      if (!f.lm) return null; const g = (i) => f.lm[i];
      if ([11, 12, 23, 24].some((i) => g(i)[3] < MIN_VIS)) return null;
      const sx = (g(11)[0] - g(12)[0]) * meta.width;
      const torso = Math.hypot(((g(11)[0] + g(12)[0]) / 2 - (g(23)[0] + g(24)[0]) / 2) * meta.width, ((g(11)[1] + g(12)[1]) / 2 - (g(23)[1] + g(24)[1]) / 2) * meta.height);
      return torso ? Math.abs(sx) / torso : null;
    });
    const ratio = median(r);
    const label = ratio == null ? 'desconocida' : ratio < 0.3 ? 'lateral' : ratio > 0.6 ? 'frontal' : 'oblicua';
    return { label, ratio: round(ratio, 2) };
  }

  /** Prepara trayectorias limpias en píxeles: D.X[idx][i], D.Y[idx][i] (null si no fiable). */
  function prepare(frames0, meta, { fc, boneCheck }) {
    const rs = resample(frames0);
    const sw = fixSwaps(rs.frames);
    const frames = sw.frames, fs = rs.fs, n = frames.length, W = meta.width, H = meta.height;
    const X = {}, Y = {}, vis = {};
    for (const idx of USED) {
      vis[idx] = frames.map((f) => (f.lm && f.lm[idx] ? f.lm[idx][3] : 0));
      X[idx] = frames.map((f) => (f.lm && f.lm[idx] && f.lm[idx][3] >= MIN_VIS ? f.lm[idx][0] * W : null));
      Y[idx] = frames.map((f) => (f.lm && f.lm[idx] && f.lm[idx][3] >= MIN_VIS ? f.lm[idx][1] * H : null));
    }
    let rejected = 0;
    if (boneCheck) {
      for (const s of ['L', 'R']) {
        const S = SIDE[s];
        const len = (a, b) => frames.map((_, i) => (isNum(X[a][i]) && isNum(X[b][i]) ? Math.hypot(X[a][i] - X[b][i], Y[a][i] - Y[b][i]) : null));
        const th = len(S.hip, S.knee), sh = len(S.knee, S.ank), mth = median(th), msh = median(sh);
        for (let i = 0; i < n; i++) {
          const bad = (isNum(th[i]) && Math.abs(th[i] / mth - 1) > 0.25) || (isNum(sh[i]) && Math.abs(sh[i] / msh - 1) > 0.25);
          if (bad) { rejected++; for (const k of [S.knee, S.ank, S.heel, S.toe]) { X[k][i] = null; Y[k][i] = null; } }
        }
      }
    }
    const maxGap = Math.round(0.25 * fs);
    for (const idx of USED) { X[idx] = lowpass(fillGaps(X[idx], maxGap), fs, fc); Y[idx] = lowpass(fillGaps(Y[idx], maxGap), fs, fc); }
    return { fs, n, t: frames.map((f) => f.t), X, Y, vis, swaps: sw.swaps, rejected, fc };
  }

  // ======================= geometría sobre datos limpios =======================
  const P = (D, idx, i) => (isNum(D.X[idx][i]) && isNum(D.Y[idx][i]) ? { x: D.X[idx][i], y: D.Y[idx][i] } : null);
  const midP = (a, b) => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null);
  function angle3(a, b, c) {
    if (!a || !b || !c) return null;
    const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y, d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
    return d ? (Math.acos(clamp((v1x * v2x + v1y * v2y) / d, -1, 1)) * 180) / Math.PI : null;
  }
  const deg = (r) => (r * 180) / Math.PI;
  const kneeFlexSeries = (D, s) => D.t.map((_, i) => { const S = SIDE[s], a = angle3(P(D, S.hip, i), P(D, S.knee, i), P(D, S.ank, i)); return a == null ? null : 180 - a; });
  const dirAt = (dirArr, i) => (typeof dirArr === 'number' ? dirArr : dirArr[i]);
  // Flexión de cadera = ángulo del muslo respecto a la prolongación del tronco; positivo con la rodilla por delante
  function hipFlexSeries(D, s, dirArr) {
    const S = SIDE[s];
    return D.t.map((_, i) => {
      const sh = midP(P(D, 11, i), P(D, 12, i)), h = P(D, S.hip, i), k = P(D, S.knee, i), dir = dirAt(dirArr, i);
      if (!sh || !h || !k || !dir) return null;
      let v = deg(Math.atan2((k.x - h.x) * dir, k.y - h.y) - Math.atan2((h.x - sh.x) * dir, h.y - sh.y));
      if (v > 180) v -= 360; if (v < -180) v += 360;
      return v;
    });
  }
  // Inclinación del tronco en el plano sagital, positiva hacia delante
  function trunkSeries(D, dirArr) {
    return D.t.map((_, i) => {
      const sh = midP(P(D, 11, i), P(D, 12, i)), hp = midP(P(D, 23, i), P(D, 24, i)), dir = dirAt(dirArr, i);
      if (!sh || !hp || !dir) return null;
      return deg(Math.atan2((sh.x - hp.x) * dir, hp.y - sh.y));
    });
  }
  // Longitud aparente hombro–tobillo (px), usando el tobillo más bajo (pie de apoyo)
  function bodyLength(D) {
    return median(D.t.map((_, i) => { const sh = midP(P(D, 11, i), P(D, 12, i)), a = P(D, 27, i), b = P(D, 28, i); if (!sh || (!a && !b)) return null; return Math.max(a ? a.y : -1e9, b ? b.y : -1e9) - sh.y; }));
  }
  // Orientación por los pies (antepié respecto al talón)
  function footDirection(D) {
    const d = median(D.t.map((_, i) => { const v = []; for (const s of ['L', 'R']) { const h = P(D, SIDE[s].heel, i), t = P(D, SIDE[s].toe, i); if (h && t) v.push(t.x - h.x); } return v.length ? mean(v) : null; }));
    return d == null ? 1 : d >= 0 ? 1 : -1;
  }

  // ======================= referencias normativas =======================
  // Curva aproximada de flexión de rodilla en marcha normal (adultos, velocidad libre), cada 5 % del ciclo.
  // Forma basada en Winter (2009) y Kadaba et al. (1990). DE típica ≈ 6°.
  const NORM_KNEE = [5, 12, 17, 19, 17, 13, 9, 6, 5, 7, 11, 21, 37, 52, 60, 62, 56, 42, 24, 9, 5];
  const NORM_SD = 6;
  const normKnee = (n = 51) => Array.from({ length: n }, (_, k) => { const x = (k / (n - 1)) * 20, lo = Math.floor(x), hi = Math.min(20, lo + 1); return NORM_KNEE[lo] + (NORM_KNEE[hi] - NORM_KNEE[lo]) * (x - lo); });
  // Velocidad de marcha confortable por edad y sexo (m/s), Bohannon y Williams Andrews (2011)
  const SPEED_NORM = { M: [[20, 1.36], [30, 1.43], [40, 1.43], [50, 1.43], [60, 1.34], [70, 1.26], [80, 0.97]], F: [[20, 1.34], [30, 1.34], [40, 1.39], [50, 1.31], [60, 1.24], [70, 1.13], [80, 0.94]] };
  function speedNorm(age, sex) {
    if (!isNum(age) || age < 20) return null;
    const pick = (tab) => { let v = tab[0][1]; for (const [a, s] of tab) if (age >= a) v = s; return v; };
    if (sex === 'M' || sex === 'F') return pick(SPEED_NORM[sex]);
    return round((pick(SPEED_NORM.M) + pick(SPEED_NORM.F)) / 2, 2);
  }
  // 5 repeticiones de levantarse de la silla (s), Bohannon (2006): media por edad
  const STS_NORM = [[60, 11.4], [70, 12.6], [80, 14.8]];
  const stsNorm = (age) => { if (!isNum(age) || age < 60) return null; let v = STS_NORM[0][1]; for (const [a, s] of STS_NORM) if (age >= a) v = s; return v; };
  // Apoyo monopodal con ojos abiertos (s), Springer et al. (2007): media por edad
  const UST_NORM = [[18, 43.5], [40, 40.4], [50, 36.0], [60, 26.9], [70, 15.0], [80, 6.2]];
  const ustNorm = (age) => { if (!isNum(age) || age < 18) return null; let v = UST_NORM[0][1]; for (const [a, s] of UST_NORM) if (age >= a) v = s; return v; };

  const REFS = {
    blazepose: 'Bazarevsky V, Grishchenko I, Raveendran K, et al. BlazePose: On-device real-time body pose tracking. arXiv:2006.10204; 2020.',
    winter: 'Winter DA. Biomechanics and Motor Control of Human Movement. 4ª ed. Hoboken: Wiley; 2009.',
    perry: 'Perry J, Burnfield JM. Gait Analysis: Normal and Pathological Function. 2ª ed. Thorofare: SLACK; 2010.',
    kadaba: 'Kadaba MP, Ramakrishnan HK, Wootten ME. Measurement of lower extremity kinematics during level walking. J Orthop Res. 1990;8(3):383-92.',
    zeni: 'Zeni JA, Richards JG, Higginson JS. Two simple methods for determining gait events during treadmill and overground walking using kinematic data. Gait Posture. 2008;27(4):710-4.',
    baker: 'Baker R, McGinley JL, Schwartz MH, et al. The Gait Profile Score and Movement Analysis Profile. Gait Posture. 2009;30(3):265-9.',
    robinson: 'Robinson RO, Herzog W, Nigg BM. Use of force platform variables to quantify the effects of chiropractic manipulation on gait symmetry. J Manipulative Physiol Ther. 1987;10(4):172-6.',
    hausdorff: 'Hausdorff JM. Gait variability: methods, modeling and meaning. J Neuroeng Rehabil. 2005;2:19.',
    bohannon11: 'Bohannon RW, Williams Andrews A. Normal walking speed: a descriptive meta-analysis. Physiotherapy. 2011;97(3):182-9.',
    fritz: 'Fritz S, Lusardi M. White paper: "Walking speed: the sixth vital sign". J Geriatr Phys Ther. 2009;32(2):46-9.',
    drillis: 'Drillis R, Contini R. Body segment parameters. Technical Report 1166-03. New York University; 1966.',
    munro: 'Munro A, Herrington L, Carolan M. Reliability of 2-dimensional video assessment of frontal-plane dynamic knee valgus during common athletic screening tasks. J Sport Rehabil. 2012;21(1):7-11.',
    bohannon06: 'Bohannon RW. Reference values for the five-repetition sit-to-stand test: a descriptive meta-analysis of data from elders. Percept Mot Skills. 2006;103(1):215-22.',
    buatois: 'Buatois S, Miljkovic D, Manckoundia P, et al. Five times sit to stand test is a predictor of recurrent falls in healthy community-living subjects aged 65 and older. J Am Geriatr Soc. 2008;56(8):1575-7.',
    springer: 'Springer BA, Marin R, Cyhan T, Roberts H, Gill NW. Normative values for the unipedal stance test with eyes open and closed. J Geriatr Phys Ther. 2007;30(1):8-15.',
    winter95: 'Winter DA. Human balance and posture control during standing and walking. Gait Posture. 1995;3(4):193-214.',
    perera: 'Perera S, Mody SH, Woodman RC, Studenski SA. Meaningful change and responsiveness in common physical performance measures in older adults. J Am Geriatr Soc. 2006;54(5):743-9.',
    welch: 'Welch BL. The generalization of "Student\'s" problem when several different population variances are involved. Biometrika. 1947;34(1-2):28-35.',
  };

  // ======================= construcción de métricas =======================
  // Métrica con media, DE, n, referencia y valoración
  function mk(key, label, values, unit, opts = {}) {
    const arr = nums(Array.isArray(values) ? values : []);
    const value = opts.value !== undefined ? opts.value : arr.length ? mean(arr) : null;
    const s = opts.sd !== undefined ? opts.sd : arr.length >= 2 ? sd(arr) : null;
    const dec = opts.dec != null ? opts.dec : unit === 'm/s' || unit === 'm' || unit === 's' ? 2 : unit === '%' ? 1 : 0;
    const rv = typeof value === 'string' ? value : round(value, dec);
    let ev = null;
    if (isNum(rv) && opts.ref) {
      const { lo, hi } = opts.ref;
      ev = isNum(lo) && rv < lo ? 'low' : isNum(hi) && rv > hi ? 'high' : 'normal';
    }
    return {
      key, label, unit, group: opts.group || null,
      value: rv, sd: round(s, dec), n: opts.n !== undefined ? opts.n : arr.length || null,
      ref: opts.ref ? { text: opts.ref.text, src: opts.ref.src || null } : null, eval: ev, rel: opts.rel || 'alta',
    };
  }
  const samplesOf = (a) => nums(a).map((v) => round(v, 3));
  const fmtFlag = (x) => `${x.label}: ${String(x.value).replace('.', ',')}${x.unit === '°' || x.unit === '%' || !x.unit ? x.unit : ' ' + x.unit}${x.sd != null ? ' ± ' + String(x.sd).replace('.', ',') : ''} (referencia ${x.ref.text}${x.rel === 'media' ? '; fiabilidad media' : ''}).`;
  const outOfRange = (metrics) => metrics.filter((x) => x.eval && x.eval !== 'normal' && x.rel !== 'baja' && isNum(x.value));

  // ======================= MARCHA =======================
  function analyzeGait(D, meta, view) {
    const fs = D.fs, bl = bodyLength(D) || meta.height * 0.6;
    const pelvX = D.t.map((_, i) => { const p = midP(P(D, 23, i), P(D, 24, i)); return p ? p.x : null; });
    const v = deriv(pelvX, fs);
    const vThr = 0.15 * bl;
    // Tramos de marcha en una dirección (se excluyen giros y paradas)
    const segs = []; let cur = null;
    for (let i = 0; i < D.n; i++) {
      const dir = isNum(v[i]) && Math.abs(v[i]) > vThr ? Math.sign(v[i]) : 0;
      if (dir && cur && cur.dir === dir) cur.end = i;
      else { if (cur && cur.end - cur.start >= fs) segs.push(cur); cur = dir ? { dir, start: i, end: i } : null; }
    }
    if (cur && cur.end - cur.start >= fs) segs.push(cur);
    // Marcha en cinta: la pelvis apenas se desplaza, pero los pies se alternan por delante y por detrás de ella
    let treadmill = false;
    const tSpeed = isNum(meta.treadmillSpeed) && meta.treadmillSpeed > 0 ? meta.treadmillSpeed : null; // m/s
    if (!segs.length || tSpeed) {
      const sep = D.t.map((_, i) => { const a = P(D, 27, i), b = P(D, 28, i); return a && b ? Math.abs(a.x - b.x) / bl : null; });
      const pelvRange = (percentile(pelvX, 0.95) - percentile(pelvX, 0.05)) / bl;
      if (tSpeed || ((percentile(sep, 0.9) || 0) > 0.12 && pelvRange < 0.6)) { treadmill = true; segs.length = 0; segs.push({ dir: footDirection(D), start: 0, end: D.n - 1 }); }
    }
    const dirArr = new Array(D.n).fill(0); for (const s of segs) for (let i = s.start; i <= s.end; i++) dirArr[i] = s.dir;
    const fallbackDir = Math.sign(median(v.filter((x) => isNum(x) && Math.abs(x) > vThr)) || footDirection(D)) || 1;
    const dirFill = dirArr.map((d) => d || fallbackDir);

    const knee = { L: kneeFlexSeries(D, 'L'), R: kneeFlexSeries(D, 'R') };
    const hip = { L: hipFlexSeries(D, 'L', dirFill), R: hipFlexSeries(D, 'R', dirFill) };
    const trunk = trunkSeries(D, dirFill);

    // Eventos (Zeni et al., 2008): contacto inicial = máx. del talón respecto a la pelvis; despegue = mín. del antepié
    const w = Math.max(2, Math.round(0.3 * fs));
    const margin = Math.round(0.1 * fs);
    const inSeg = (i) => segs.some((sg) => i >= sg.start + margin && i <= sg.end - margin);
    const ev = { L: { hs: [], to: [] }, R: { hs: [], to: [] } };
    for (const s of ['L', 'R']) {
      const S = SIDE[s];
      const rel = (idx) => D.t.map((_, i) => { const h = P(D, idx, i) || P(D, S.ank, i); return h && isNum(pelvX[i]) && dirArr[i] ? (h.x - pelvX[i]) * dirArr[i] : null; });
      const heel = rel(S.heel), toe = rel(S.toe);
      const hMed = percentile(heel, 0.6), tMed = percentile(toe, 0.4);
      ev[s].hs = findPeaks(heel, w, 1).filter((i) => inSeg(i) && heel[i] > hMed).map((i) => refinePeak(heel, i));
      ev[s].to = findPeaks(toe, w, -1).filter((i) => inSeg(i) && toe[i] < tMed).map((i) => refinePeak(toe, i));
    }
    const segOf = (i) => segs.findIndex((sg) => i >= sg.start - 0.5 && i <= sg.end + 0.5);
    const scale = meta.patient && meta.patient.heightCm ? ((meta.patient.heightCm / 100) * SHOULDER_TO_ANKLE) / bl : null; // m/px
    const strides = { L: [], R: [] };
    for (const s of ['L', 'R']) {
      const o = s === 'L' ? 'R' : 'L', hs = ev[s].hs;
      for (let k = 0; k < hs.length - 1; k++) {
        const a = hs[k], b = hs[k + 1], T = (b - a) / fs;
        if (T < 0.6 || T > 2.2 || segOf(a) !== segOf(b) || segOf(a) < 0) continue;
        const to = ev[s].to.find((i) => i > a && i < b);
        const hsO = ev[o].hs.filter((i) => i > a && i < b);
        const st = { s, a, b, T };
        if (to != null) st.stance = (100 * (to - a)) / (b - a);
        if (hsO.length === 1) {
          st.step = (b - hsO[0]) / fs;
          const toO = ev[o].to.find((i) => i > a && i < hsO[0]);
          if (to != null && toO != null && to > hsO[0]) st.ds = (100 * ((toO - a) + (to - hsO[0]))) / (b - a);
          if (scale && isNum(valAt(pelvX, b)) && isNum(valAt(pelvX, hsO[0]))) st.stepLen = Math.abs(valAt(pelvX, b) - valAt(pelvX, hsO[0])) * scale;
        }
        if (treadmill) {
          // En cinta la pelvis no avanza: longitudes a partir de la velocidad de la cinta introducida
          if (tSpeed) { st.speed = tSpeed; st.strideLen = tSpeed * T; delete st.stepLen; if (st.step != null) st.stepLen = tSpeed * st.step; }
        } else if (scale && isNum(valAt(pelvX, a)) && isNum(valAt(pelvX, b))) { st.strideLen = Math.abs(valAt(pelvX, b) - valAt(pelvX, a)) * scale; st.speed = st.strideLen / T; }
        const kn = sampleBetween(knee[s], a, b, 51), hp = sampleBetween(hip[s], a, b, 51);
        if (kn.filter(isNum).length >= 46) {
          const seg = (p0, p1) => kn.slice(Math.round(p0 / 2), Math.round(p1 / 2) + 1).filter(isNum);
          st.knee = kn; st.kneeSwing = Math.max(...seg(55, 100)); st.kneeIC = kn[0]; st.kneeLR = Math.max(...seg(0, 25));
          st.kneeROM = Math.max(...nums(kn)) - Math.min(...nums(kn));
        }
        if (hp.filter(isNum).length >= 46) { st.hip = hp; st.hipROM = Math.max(...nums(hp)) - Math.min(...nums(hp)); }
        strides[s].push(st);
      }
    }
    const all = [...strides.L, ...strides.R];
    const pick = (arr, k) => arr.map((x) => x[k]).filter(isNum);
    const cycles = {};
    const agg = (cs) => (cs.length ? { mean: cs[0].map((_, k) => round(mean(cs.map((c) => c[k])), 1)), sd: cs[0].map((_, k) => round(sd(cs.map((c) => c[k])) || 0, 1)), n: cs.length } : null);
    for (const s of ['L', 'R']) {
      cycles['knee' + s] = agg(strides[s].map((x) => x.knee).filter(Boolean));
      cycles['hip' + s] = agg(strides[s].map((x) => x.hip).filter(Boolean));
      const to = pick(strides[s], 'stance'); cycles['toe' + s] = to.length ? round(mean(to), 1) : null;
    }
    const norm = normKnee(51);
    const gvs = (s) => (cycles['knee' + s] ? Math.sqrt(mean(cycles['knee' + s].mean.map((v2, k) => (isNum(v2) ? (v2 - norm[k]) ** 2 : null)))) : null);

    const pt = meta.patient || {};
    const sNorm = speedNorm(pt.age, pt.sex);
    const relKin = view.label === 'lateral' ? 'alta' : view.label === 'oblicua' ? 'media' : 'baja';
    const relCount = (n) => (n >= 4 ? (relKin === 'baja' ? 'baja' : 'alta') : n >= 2 ? 'media' : 'baja');
    const lower = (a, b) => (['baja', 'media', 'alta'].indexOf(a) < ['baja', 'media', 'alta'].indexOf(b) ? a : b);
    // Visibilidad media de rodilla y tobillo de cada lado (la pierna alejada de la cámara suele estar ocluida)
    const sideVis = {};
    for (const s of ['L', 'R']) sideVis[s] = mean(D.vis[SIDE[s].knee].map((v, i) => mean([v, D.vis[SIDE[s].ank][i]])));
    const G1 = 'Espaciotemporales', G2 = 'Simetría y variabilidad', G3 = 'Cinemática sagital';
    const metrics = [];
    const speedArr = pick(all, 'speed');
    if (treadmill && tSpeed) metrics.push(mk('speed', 'Velocidad de la cinta (introducida)', null, 'm/s', { group: G1, value: tSpeed, n: null, rel: 'alta' }));
    else if (scale && !treadmill) metrics.push(mk('speed', 'Velocidad de marcha', speedArr, 'm/s', { group: G1, rel: relCount(speedArr.length), ref: sNorm ? { lo: round(sNorm * 0.85, 2), text: `≥ ${fx(sNorm * 0.85, 2)} m/s (media ${fx(sNorm, 2)} para edad${pt.sex ? ' y sexo' : ''} − 15 %)`, src: 'bohannon11' } : { lo: 1.0, text: '≥ 1,00 m/s', src: 'fritz' } }));
    const cadArr = all.map((x) => 120 / x.T);
    metrics.push(mk('cadence', 'Cadencia', cadArr, 'pasos/min', { group: G1, rel: relCount(all.length), ref: { lo: 95, hi: 125, text: '95–125', src: 'winter' } }));
    if ((scale && !treadmill) || (treadmill && tSpeed)) metrics.push(mk('strideLen', 'Longitud de zancada', pick(all, 'strideLen'), 'm', { group: G1, rel: relCount(all.length), ref: isNum(pt.heightCm) ? { lo: round((pt.heightCm / 100) * 0.72, 2), hi: round((pt.heightCm / 100) * 0.92, 2), text: '0,72–0,92 × talla', src: 'winter' } : null }));
    metrics.push(mk('strideTime', 'Duración de la zancada', pick(all, 'T'), 's', { group: G1, rel: relCount(all.length), ref: { lo: 0.95, hi: 1.25, text: '0,95–1,25 s', src: 'winter' } }));
    // El despegue estimado con pose 2D tiende a retrasarse algún fotograma: fiabilidad máxima «media»
    for (const s of ['L', 'R']) metrics.push(mk('stance' + s, `Fase de apoyo ${s === 'L' ? 'izq.' : 'der.'}`, pick(strides[s], 'stance'), '%', { group: G1, rel: lower(relCount(pick(strides[s], 'stance').length), 'media'), ref: { lo: 57, hi: 64, text: '57–64 %', src: 'perry' } }));
    metrics.push(mk('ds', 'Doble apoyo', pick(all, 'ds'), '%', { group: G1, rel: lower(relCount(pick(all, 'ds').length), 'media'), ref: { lo: 16, hi: 26, text: '16–26 %', src: 'perry' } }));
    const minSide = Math.min(strides.L.length, strides.R.length);
    metrics.push(mk('strideCV', 'Variabilidad de la zancada (CV)', null, '%', { group: G2, value: all.length >= 3 ? cv(pick(all, 'T')) : null, n: all.length, rel: all.length >= 10 ? 'alta' : all.length >= 6 ? 'media' : 'baja', ref: { hi: 3, text: '< 3 %', src: 'hausdorff' } }));
    metrics.push(mk('siStep', 'Asimetría del tiempo de paso (IS)', null, '%', { group: G2, value: robinsonSI(mean(pick(strides.L, 'step')), mean(pick(strides.R, 'step'))), n: minSide, rel: relCount(minSide), ref: { hi: 10, text: '< 10 %', src: 'robinson' } }));
    metrics.push(mk('siStance', 'Asimetría de la fase de apoyo (IS)', null, '%', { group: G2, value: robinsonSI(mean(pick(strides.L, 'stance')), mean(pick(strides.R, 'stance'))), n: minSide, rel: relCount(minSide), ref: { hi: 10, text: '< 10 %', src: 'robinson' } }));
    if ((scale && !treadmill) || (treadmill && tSpeed)) metrics.push(mk('siLen', 'Asimetría de la longitud de paso (IS)', null, '%', { group: G2, value: robinsonSI(mean(pick(strides.L, 'stepLen')), mean(pick(strides.R, 'stepLen'))), n: minSide, rel: relCount(minSide), ref: { hi: 10, text: '< 10 %', src: 'robinson' } }));
    metrics.push(mk('siKnee', 'Asimetría de la flexión de rodilla en oscilación (IS)', null, '%', { group: G2, value: robinsonSI(mean(pick(strides.L, 'kneeSwing')), mean(pick(strides.R, 'kneeSwing'))), n: minSide, rel: relKin === 'alta' ? relCount(minSide) : 'baja', ref: { hi: 10, text: '< 10 %', src: 'robinson' } }));
    for (const s of ['L', 'R']) {
      const sl = s === 'L' ? 'izq.' : 'der.', st = strides[s].filter((x) => x.knee);
      const rk = lower(st.length >= 4 ? relKin : st.length >= 2 ? lower(relKin, 'media') : 'baja', sideVis[s] >= 0.8 ? 'alta' : sideVis[s] >= 0.6 ? 'media' : 'baja');
      metrics.push(mk('kneeSwing' + s, `Rodilla ${sl}: flexión máx. en oscilación`, pick(st, 'kneeSwing'), '°', { group: G3, rel: rk, ref: { lo: 55, hi: 70, text: '55–70°', src: 'perry' } }));
      metrics.push(mk('kneeLR' + s, `Rodilla ${sl}: flexión en respuesta a la carga`, pick(st, 'kneeLR'), '°', { group: G3, rel: rk, ref: { lo: 10, hi: 25, text: '10–25°', src: 'perry' } }));
      metrics.push(mk('kneeIC' + s, `Rodilla ${sl}: flexión en el contacto inicial`, pick(st, 'kneeIC'), '°', { group: G3, rel: rk, ref: { lo: 0, hi: 10, text: '0–10°', src: 'perry' } }));
      metrics.push(mk('gvs' + s, `Rodilla ${sl}: desviación de la curva normal (GVS)`, null, '°', { group: G3, value: gvs(s), n: cycles['knee' + s] ? cycles['knee' + s].n : 0, rel: rk, ref: { hi: 8, text: '< 8° (orientativo)', src: 'baker' } }));
      const nh = strides[s].filter((x) => x.hip).length;
      const rh = lower(nh >= 4 ? relKin : nh >= 2 ? lower(relKin, 'media') : 'baja', sideVis[s] >= 0.8 ? 'alta' : sideVis[s] >= 0.6 ? 'media' : 'baja');
      metrics.push(mk('hipROM' + s, `Cadera ${sl}: rango sagital`, pick(strides[s].filter((x) => x.hip), 'hipROM'), '°', { group: G3, rel: rh, ref: { lo: 35, hi: 50, text: '35–50°', src: 'perry' } }));
    }
    const trunkWalk = trunk.filter((x, i) => dirArr[i]);
    metrics.push(mk('trunk', 'Inclinación del tronco (media)', null, '°', { group: G3, value: mean(trunkWalk.length ? trunkWalk : trunk), n: null, rel: relKin }));

    const flags = [];
    if (all.length < 2) flags.push(view.label === 'lateral' ? 'Se han detectado menos de 2 zancadas completas. Graba más pasos (8–15 s cruzando la imagen).' : 'No se han podido detectar zancadas: la marcha necesita vista lateral, caminando de lado a lado de la imagen.');
    for (const x of outOfRange(metrics)) flags.push(fmtFlag(x));
    if (treadmill) flags.unshift(tSpeed ? 'Marcha en cinta: la velocidad es la de la cinta (introducida); las longitudes se calculan a partir de ella.' : 'Marcha en cinta detectada: indica la velocidad de la cinta para obtener longitudes de paso y zancada.');
    if (!treadmill && isNum(mean(speedArr)) && mean(speedArr) < 1.0 && speedArr.length >= 2) flags.push('Velocidad < 1,0 m/s: asociada a mayor riesgo de caídas y peor pronóstico funcional (Fritz y Lusardi, 2009).');

    const kneeSwingBoth = [...pick(strides.L, 'kneeSwing'), ...pick(strides.R, 'kneeSwing')];
    const main = !treadmill && scale && speedArr.length
      ? { key: 'speed', label: 'Velocidad de marcha', value: round(mean(speedArr), 2), unit: 'm/s', higherIsBetter: true, sd: round(sd(speedArr), 2) }
      : { key: 'kneeSwing', label: 'Flexión máx. de rodilla en oscilación', value: round(mean(kneeSwingBoth), 0), unit: '°', higherIsBetter: true, sd: round(sd(kneeSwingBoth), 0) };
    const samples = {
      speed: samplesOf(speedArr), cadence: samplesOf(cadArr), strideTime: samplesOf(pick(all, 'T')), strideLen: samplesOf(pick(all, 'strideLen')),
      stanceL: samplesOf(pick(strides.L, 'stance')), stanceR: samplesOf(pick(strides.R, 'stance')), ds: samplesOf(pick(all, 'ds')),
      kneeSwingL: samplesOf(pick(strides.L, 'kneeSwing')), kneeSwingR: samplesOf(pick(strides.R, 'kneeSwing')),
      kneeLRL: samplesOf(pick(strides.L, 'kneeLR')), kneeLRR: samplesOf(pick(strides.R, 'kneeLR')),
      hipROML: samplesOf(pick(strides.L, 'hipROM')), hipROMR: samplesOf(pick(strides.R, 'hipROM')), kneeSwing: samplesOf(kneeSwingBoth),
    };
    const tt = (i) => round(i / fs, 3);
    return {
      metrics, main, flags, samples, cycles,
      events: { hsL: ev.L.hs.map(tt), hsR: ev.R.hs.map(tt), toL: ev.L.to.map(tt), toR: ev.R.to.map(tt) },
      counts: { strides: all.length, stridesL: strides.L.length, stridesR: strides.R.length, segments: segs.length, treadmill },
      series: { kneeL: knee.L, kneeR: knee.R, hipL: hip.L, hipR: hip.R, trunk },
      methods: [
        'Eventos de la marcha por el método de coordenadas de Zeni et al. (2008): contacto inicial = máxima posición anterior del talón respecto a la pelvis; despegue = mínima posición del antepié. Solo se usan tramos de marcha en una dirección (se excluyen giros y paradas).',
        'Ángulos normalizados al 0–100 % del ciclo (51 puntos) y promediados por lado. La desviación respecto a la curva de referencia se expresa como Gait Variable Score (raíz del error cuadrático medio; Baker et al., 2009).',
        'Simetría mediante el índice de Robinson et al. (1987): IS = |D − I| / (0,5·(D + I)) × 100. Variabilidad como coeficiente de variación de la duración de la zancada (Hausdorff, 2005).',
        treadmill ? `Marcha en cinta: la pelvis no avanza, así que se analiza todo el registro con la orientación de los pies${tSpeed ? ` y las longitudes se obtienen de la velocidad de la cinta (${String(tSpeed).replace('.', ',')} m/s)` : ''}.` : scale ? 'Escala espacial a partir de la talla: distancia hombro–tobillo ≈ 0,779 × talla (Drillis y Contini, 1966). Supone cámara fija y perpendicular a la dirección de la marcha.' : 'Sin talla del paciente: no se calculan velocidad ni longitudes.',
      ],
      refs: ['zeni', 'baker', 'robinson', 'hausdorff', 'perry', 'winter', 'kadaba', ...(scale ? ['bohannon11', 'fritz', 'drillis'] : [])],
    };
  }

  // ======================= SENTADILLA =======================
  // Vista frontal: la flexión se estima por el acortamiento aparente de muslo y pierna
  function frontalKneeFlex(D, s) {
    const S = SIDE[s];
    const th = D.t.map((_, i) => { const h = P(D, S.hip, i), k = P(D, S.knee, i); return h && k ? Math.abs(k.y - h.y) : null; });
    const sh = D.t.map((_, i) => { const k = P(D, S.knee, i), a = P(D, S.ank, i); return k && a ? Math.abs(a.y - k.y) : null; });
    const t0 = percentile(th, 0.95), s0 = percentile(sh, 0.95), ac = (r) => deg(Math.acos(clamp(r, -1, 1)));
    return th.map((v, i) => (isNum(v) && isNum(sh[i]) && t0 && s0 ? ac(v / t0) + ac(sh[i] / s0) : null));
  }
  // Ángulo de proyección en el plano frontal (FPPA; Munro et al., 2012). Positivo = valgo (rodilla hacia la línea media)
  function fppaAt(D, s, i) {
    const S = SIDE[s], h = P(D, S.hip, i), k = P(D, S.knee, i), a = P(D, S.ank, i), mh = midP(P(D, 23, i), P(D, 24, i));
    if (!h || !k || !a || !mh) return null;
    const ang = 180 - angle3(h, k, a);
    const tY = (k.y - h.y) / ((a.y - h.y) || 1), lineX = h.x + (a.x - h.x) * tY;
    const medial = Math.sign(mh.x - lineX) === Math.sign(k.x - lineX) ? 1 : -1;
    return ang * medial;
  }
  function analyzeSquat(D, meta, view) {
    const fs = D.fs, frontal = view.label === 'frontal', dir = footDirection(D);
    const knee = frontal ? { L: frontalKneeFlex(D, 'L'), R: frontalKneeFlex(D, 'R') } : { L: kneeFlexSeries(D, 'L'), R: kneeFlexSeries(D, 'R') };
    const hip = { L: hipFlexSeries(D, 'L', dir), R: hipFlexSeries(D, 'R', dir) };
    const trunk = trunkSeries(D, dir);
    const avg = knee.L.map((v, i) => mean([v, knee.R[i]]));
    const lo = percentile(avg, 0.05), hi = percentile(avg, 0.95), range = isNum(lo) && isNum(hi) ? hi - lo : 0;
    const reps = [];
    if (range > 25) {
      const up = lo + 0.6 * range, down = lo + 0.3 * range, base = lo + 0.1 * range;
      let inRep = false, peak = -1;
      for (let i = 0; i < D.n; i++) {
        const v = avg[i]; if (!isNum(v)) continue;
        if (!inRep && v > up) { inRep = true; peak = i; }
        if (inRep) {
          if (v > avg[peak]) peak = i;
          if (v < down) {
            let s0 = peak; while (s0 > 0 && isNum(avg[s0 - 1]) && avg[s0 - 1] > base) s0--;
            let e0 = peak; while (e0 < D.n - 1 && isNum(avg[e0 + 1]) && avg[e0 + 1] > base) e0++;
            reps.push({ start: s0, peak, end: e0 }); inRep = false;
          }
        }
      }
    }
    const R = reps.map((r) => ({
      depthL: knee.L[r.peak], depthR: knee.R[r.peak], depth: avg[r.peak],
      hip: frontal ? null : mean([hip.L[r.peak], hip.R[r.peak]]), trunk: frontal ? null : trunk[r.peak],
      fppaL: frontal ? fppaAt(D, 'L', r.peak) : null, fppaR: frontal ? fppaAt(D, 'R', r.peak) : null,
      dur: (r.end - r.start) / fs, desc: (r.peak - r.start) / fs, asc: (r.end - r.peak) / fs,
    }));
    const pick = (k) => R.map((x) => x[k]).filter(isNum);
    const relN = R.length >= 3 ? 'alta' : R.length >= 1 ? 'media' : 'baja';
    const G1 = 'Ejecución', G2 = frontal ? 'Plano frontal' : 'Cinemática sagital';
    const metrics = [
      mk('reps', 'Repeticiones válidas', null, '', { group: G1, value: R.length, n: null, dec: 0 }),
      mk('depth', frontal ? 'Profundidad (flexión de rodilla estimada)' : 'Profundidad (flexión máx. de rodilla)', pick('depth'), '°', { group: G1, rel: frontal && relN === 'alta' ? 'media' : relN, ref: { lo: 90, text: '≥ 90° (muslo paralelo)' } }),
      mk('depthCV', 'Consistencia de la profundidad (CV)', null, '%', { group: G1, value: R.length >= 3 ? cv(pick('depth')) : null, n: R.length, rel: relN, ref: { hi: 10, text: '< 10 % (orientativo)' } }),
      mk('dur', 'Duración por repetición', pick('dur'), 's', { group: G1, rel: relN }),
      mk('ratio', 'Relación bajada/subida', R.map((x) => (x.asc ? x.desc / x.asc : null)), '', { group: G1, dec: 2, rel: relN }),
      mk('siDepth', 'Asimetría de flexión izq./der. (IS)', null, '%', { group: G1, value: robinsonSI(mean(pick('depthL')), mean(pick('depthR'))), n: R.length, rel: frontal ? relN : 'baja', ref: { hi: 10, text: '< 10 %', src: 'robinson' } }),
    ];
    if (!frontal) {
      metrics.push(mk('hip', 'Flexión máx. de cadera', pick('hip'), '°', { group: G2, rel: relN }));
      metrics.push(mk('trunk', 'Inclinación del tronco en el punto bajo', pick('trunk'), '°', { group: G2, rel: relN, ref: { hi: 45, text: '< 45° (orientativo)' } }));
    } else {
      metrics.push(mk('fppaL', 'Valgo dinámico izq. (FPPA)', pick('fppaL'), '°', { group: G2, rel: relN, ref: { lo: -5, hi: 10, text: '−5 a 10° (orientativo)', src: 'munro' } }));
      metrics.push(mk('fppaR', 'Valgo dinámico der. (FPPA)', pick('fppaR'), '°', { group: G2, rel: relN, ref: { lo: -5, hi: 10, text: '−5 a 10° (orientativo)', src: 'munro' } }));
    }
    const flags = [];
    if (!R.length) flags.push('No se han detectado repeticiones completas (se necesita un rango de flexión > 25°).');
    for (const x of outOfRange(metrics)) flags.push(fmtFlag(x));
    const notes = frontal ? ['Vista frontal: la profundidad se estima por el acortamiento aparente del muslo y la pierna; para medirla con precisión graba también en vista lateral.'] : ['Vista lateral: el valgo de rodilla no es visible; para valorarlo graba también en vista frontal.'];
    return {
      metrics, flags, notes,
      main: { key: 'depth', label: 'Profundidad de la sentadilla', value: round(mean(pick('depth'))), unit: '°', higherIsBetter: true, sd: round(sd(pick('depth'))) },
      samples: { depth: samplesOf(pick('depth')), fppaL: samplesOf(pick('fppaL')), fppaR: samplesOf(pick('fppaR')), trunk: samplesOf(pick('trunk')), hip: samplesOf(pick('hip')), dur: samplesOf(pick('dur')) },
      events: { reps: reps.map((r) => round(D.t[r.peak] - D.t[0], 3)) },
      reps: R.map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round(v, 2)]))),
      counts: { reps: R.length },
      series: { kneeL: knee.L, kneeR: knee.R, hipL: hip.L, hipR: hip.R, trunk },
      methods: [
        'Repeticiones detectadas sobre la flexión media de ambas rodillas (umbrales al 60 % y al 30 % del rango); inicio y final al 10 % del rango. Las métricas se calculan en el punto más bajo de cada repetición.',
        frontal ? 'Vista frontal: flexión estimada como acos(muslo/muslo₀) + acos(pierna/pierna₀), siendo ₀ la longitud aparente de pie. Valgo dinámico como ángulo de proyección en el plano frontal (FPPA; Munro et al., 2012), positivo hacia la línea media.' : 'Vista lateral: flexión de rodilla y cadera e inclinación del tronco medidas en el plano sagital.',
      ],
      refs: ['robinson', ...(frontal ? ['munro'] : [])],
    };
  }

  // ======================= LEVANTARSE DE LA SILLA (5 repeticiones) =======================
  function analyzeSTS(D, meta, view) {
    const fs = D.fs, bl = bodyLength(D) || meta.height * 0.6, dir = footDirection(D);
    const py = D.t.map((_, i) => { const p = midP(P(D, 23, i), P(D, 24, i)); return p ? p.y : null; });
    const top = percentile(py, 0.03), bottom = percentile(py, 0.97);
    const trunk = trunkSeries(D, dir);
    const range = isNum(top) && isNum(bottom) ? bottom - top : 0;
    const h = py.map((y) => (isNum(y) && range > 0 ? (bottom - y) / range : null)); // 0 sentado, 1 de pie
    const stands = []; let seated = false, lastSeat = null;
    for (let i = 0; i < D.n; i++) {
      if (!isNum(h[i])) continue;
      if (h[i] < 0.15) { seated = true; lastSeat = i; }
      if (seated && h[i] > 0.85) { stands.push({ onset: lastSeat, top: i }); seated = false; }
    }
    const valid = range > 0.12 * bl ? stands : [];
    const R = valid.map((s, k) => {
      let pk = null; for (let i = s.onset; i <= s.top; i++) if (isNum(trunk[i]) && (pk == null || trunk[i] > trunk[pk])) pk = i;
      return { rise: (s.top - s.onset) / fs, cycle: valid[k + 1] ? (valid[k + 1].top - s.top) / fs : null, trunk: pk != null ? trunk[pk] : null };
    });
    const n5 = valid.length >= 5 ? (valid[4].top - valid[0].onset) / fs : null;
    const pt = meta.patient || {}, norm = stsNorm(pt.age);
    const pick = (k) => R.map((x) => x[k]).filter(isNum);
    const relN = valid.length >= 5 ? 'alta' : valid.length >= 3 ? 'media' : 'baja';
    const metrics = [
      mk('reps', 'Repeticiones completas', null, '', { group: 'Prueba', value: valid.length, n: null, dec: 0 }),
      mk('time5', 'Tiempo 5 repeticiones', null, 's', { group: 'Prueba', value: n5, n: null, dec: 1, rel: relN, ref: norm ? { hi: norm, text: `≤ ${String(norm).replace('.', ',')} s (media para la edad)`, src: 'bohannon06' } : { hi: 15, text: '≤ 15 s', src: 'buatois' } }),
      mk('cycle', 'Tiempo por repetición', pick('cycle'), 's', { group: 'Prueba', dec: 2, rel: relN }),
      mk('cycleCV', 'Regularidad (CV del tiempo por repetición)', null, '%', { group: 'Prueba', value: pick('cycle').length >= 3 ? cv(pick('cycle')) : null, n: pick('cycle').length, rel: relN, ref: { hi: 15, text: '< 15 % (orientativo)' } }),
      mk('rise', 'Duración de la fase de subida', pick('rise'), 's', { group: 'Prueba', dec: 2, rel: relN }),
    ];
    if (view.label !== 'frontal') metrics.push(mk('trunk', 'Flexión máx. del tronco al levantarse', pick('trunk'), '°', { group: 'Estrategia', rel: relN, ref: { lo: 20, hi: 55, text: '20–55° (orientativo)' } }));
    const flags = [];
    if (valid.length < 5) flags.push(`Se han detectado ${valid.length} de 5 repeticiones. El tiempo de la prueba solo se calcula con 5 repeticiones completas.`);
    if (isNum(n5) && n5 > 15 && (pt.age || 0) >= 65) flags.push('Tiempo > 15 s: asociado a caídas recurrentes en mayores de 65 años (Buatois et al., 2008).');
    else if (isNum(n5) && norm && n5 > norm) flags.push(`Tiempo por encima de la media publicada para su edad (${String(norm).replace('.', ',')} s; Bohannon, 2006).`);
    for (const x of outOfRange(metrics).filter((x) => x.key !== 'time5')) flags.push(fmtFlag(x));
    const notes = [];
    if (!norm && isNum(pt.age) && pt.age < 60) notes.push('Los valores de referencia publicados (Bohannon, 2006) corresponden a mayores de 60 años; en pacientes más jóvenes, usar la prueba para seguimiento.');
    return {
      metrics, flags, notes,
      main: { key: 'time5', label: 'Tiempo 5 repeticiones', value: round(n5, 1), unit: 's', higherIsBetter: false, samplesKey: 'cycle' },
      samples: { cycle: samplesOf(pick('cycle')), rise: samplesOf(pick('rise')), trunk: samplesOf(pick('trunk')) },
      events: { reps: valid.map((s) => round(D.t[s.top] - D.t[0], 3)) },
      counts: { reps: valid.length },
      series: { kneeL: kneeFlexSeries(D, 'L'), kneeR: kneeFlexSeries(D, 'R'), hipL: hipFlexSeries(D, 'L', dir), hipR: hipFlexSeries(D, 'R', dir), trunk, pelvis: h.map((v) => (isNum(v) ? 100 * v : null)) },
      methods: ['Altura de la pelvis normalizada entre la posición sentada (0 %) y de pie (100 %). Repetición = paso de < 15 % a > 85 %. Tiempo de la prueba desde el inicio de la primera subida hasta alcanzar la bipedestación en la quinta.'],
      refs: ['bohannon06', 'buatois'],
    };
  }

  // ======================= EQUILIBRIO =======================
  function analyzeBalance(D, meta, view) {
    const fs = D.fs, bl = bodyLength(D);
    // Ángulo de oscilación corporal (péndulo invertido; Winter, 1995): recta tobillos → hombros respecto a la vertical
    const sway = D.t.map((_, i) => { const s = midP(P(D, 11, i), P(D, 12, i)), a = midP(P(D, 27, i), P(D, 28, i)); return s && a ? deg(Math.atan2(s.x - a.x, a.y - s.y)) : null; });
    const ms = mean(sway); const th = sway.map((v) => (isNum(v) ? v - ms : null));
    const px = D.t.map((_, i) => { const p = midP(P(D, 23, i), P(D, 24, i)); return p ? p.x : null; });
    const cmPerPx = meta.patient && meta.patient.heightCm && bl ? (meta.patient.heightCm * SHOULDER_TO_ANKLE) / bl : null;
    const win = Math.round(5 * fs), windows = [];
    const rmsOf = (a) => { const m0 = mean(a); return Math.sqrt(mean(a.map((v) => (isNum(v) ? (v - m0) ** 2 : null)))); };
    const pathOf = (a) => { let p = 0, c = 0; for (let i = 1; i < a.length; i++) if (isNum(a[i]) && isNum(a[i - 1])) { p += Math.abs(a[i] - a[i - 1]); c++; } return c ? (p * fs) / c : null; };
    for (let s = 0; s + win <= D.n; s += win) {
      const seg = th.slice(s, s + win);
      if (nums(seg).length < 0.8 * win) continue;
      windows.push({ rms: rmsOf(seg), vel: pathOf(seg), pel: cmPerPx ? rmsOf(px.slice(s, s + win)) * cmPerPx : null });
    }
    const velAll = pathOf(th), rmsAll = Math.sqrt(mean(th.map((v) => (isNum(v) ? v * v : null))) || 0);
    const range95 = isNum(percentile(th, 0.975)) ? percentile(th, 0.975) - percentile(th, 0.025) : null;
    // Apoyo monopodal: un tobillo claramente más alto que el otro (> 4 % de la altura aparente)
    const lifted = D.t.map((_, i) => { const a = P(D, 27, i), b = P(D, 28, i); if (!a || !b || !bl) return null; const d = (a.y - b.y) / bl; return d < -0.04 ? 'L' : d > 0.04 ? 'R' : ''; });
    let best = 0, run = 0, gap = 0, side = '', bestSide = '', runEnd = -1;
    for (let i = 0; i < lifted.length; i++) {
      if (lifted[i]) { if (!run || lifted[i] === side) { run += 1 + gap; side = lifted[i]; gap = 0; } else { run = 1; side = lifted[i]; gap = 0; } if (run > best) { best = run; bestSide = side; runEnd = i; } }
      else if (run) { gap++; if (gap > 0.2 * fs) { run = 0; gap = 0; } }
    }
    const monoTime = best / fs, dur = D.t[D.n - 1] - D.t[0];
    const mono = monoTime > 0.5 * dur;
    const pt = meta.patient || {}, uNorm = ustNorm(pt.age);
    const touchedDown = mono && runEnd < D.n - Math.round(0.5 * fs);
    const plane = view.label === 'lateral' ? 'anteroposterior' : 'medio-lateral';
    const pick = (k) => windows.map((x) => x[k]).filter(isNum);
    const relW = windows.length >= 3 ? 'alta' : windows.length >= 2 ? 'media' : 'baja';
    const metrics = [
      mk('vel', `Velocidad de oscilación ${plane}`, pick('vel'), '°/s', { group: 'Oscilación', value: velAll, dec: 2, rel: relW }),
      mk('rms', `Oscilación ${plane} (RMS)`, pick('rms'), '°', { group: 'Oscilación', value: rmsAll, dec: 2, rel: relW }),
      mk('range', 'Rango de oscilación (95 %)', null, '°', { group: 'Oscilación', value: range95, n: null, dec: 2, rel: relW }),
    ];
    if (cmPerPx) metrics.push(mk('pelvis', 'Desplazamiento de la pelvis (RMS)', pick('pel'), 'cm', { group: 'Oscilación', dec: 1, rel: relW }));
    metrics.push(mk('stance', 'Tipo de apoyo', null, '', { group: 'Prueba', value: mono ? `Monopodal ${bestSide === 'L' ? 'derecho' : 'izquierdo'}` : 'Bipodal', n: null }));
    if (mono) metrics.push(mk('monoTime', touchedDown ? 'Apoyo monopodal hasta apoyar el pie' : 'Apoyo monopodal (sin apoyar el pie)', null, 's', { group: 'Prueba', value: monoTime, n: null, dec: 1, ref: uNorm ? { lo: round(uNorm * 0.75, 1), text: `≥ 75 % de la media para la edad (${String(uNorm).replace('.', ',')} s)`, src: 'springer' } : null }));
    metrics.push(mk('time', 'Tiempo analizado', null, 's', { group: 'Prueba', value: dur, n: null, dec: 1 }));
    const flags = [];
    if (dur < 10) flags.push('Registro corto: para estimar bien la oscilación se recomiendan 20–30 s.');
    const pelRange = isNum(percentile(px, 0.98)) && bl ? (percentile(px, 0.98) - percentile(px, 0.02)) / bl : 0;
    if (pelRange > 0.15) flags.push('El paciente se ha desplazado durante la prueba; la oscilación puede estar sobreestimada.');
    if (mono && touchedDown && uNorm && monoTime < uNorm * 0.75) flags.push(`Apoyo monopodal de ${round(monoTime, 1)} s, por debajo de la media para su edad (${uNorm} s; Springer et al., 2007).`);
    const notes = ['La oscilación angular no tiene valores normativos validados con este método: úsala para comparar sesiones del mismo paciente con la misma colocación de la cámara.'];
    return {
      metrics, flags, notes,
      main: { key: 'vel', label: 'Velocidad de oscilación', value: round(velAll, 2), unit: '°/s', higherIsBetter: false, sd: round(sd(pick('vel')), 2) },
      samples: { vel: samplesOf(pick('vel')), rms: samplesOf(pick('rms')), pelvis: samplesOf(pick('pel')) },
      events: {}, counts: { windows: windows.length },
      series: { sway: th, kneeL: kneeFlexSeries(D, 'L'), kneeR: kneeFlexSeries(D, 'R') },
      methods: [`Ángulo de oscilación corporal (modelo de péndulo invertido; Winter, 1995): inclinación de la recta tobillos–hombros respecto a la vertical, plano ${plane}. Velocidad = recorrido angular / tiempo. Incertidumbre estimada con ventanas de 5 s.`],
      refs: ['winter95', ...(mono ? ['springer'] : [])],
    };
  }

  // ======================= calidad =======================
  function quality(frames, D, view, type) {
    const n = frames.length, det = frames.filter((f) => f.lm);
    const detectedRatio = n ? det.length / n : 0;
    const KEY = [11, 12, 23, 24, 25, 26, 27, 28];
    const vis = mean(det.map((f) => mean(KEY.map((i) => f.lm[i][3]))));
    const ankles = det.length ? det.filter((f) => Math.max(f.lm[27][3], f.lm[28][3]) >= MIN_VIS).length / det.length : 0;
    const duration = n ? frames[n - 1].t - frames[0].t : 0;
    const needView = { gait: 'lateral', squat: null, sts: 'lateral', balance: 'frontal' }[type];
    const viewOk = !needView || view.label === needView;
    const fsOk = type !== 'gait' || D.fs >= 24;
    const score = Math.round(100 * (0.35 * detectedRatio + 0.35 * (vis || 0) + 0.15 * ankles + 0.1 * (viewOk ? 1 : view.label === 'oblicua' ? 0.5 : 0) + 0.05 * (fsOk ? 1 : 0)));
    const warnings = [];
    if (duration < 3) warnings.push('Vídeo muy corto (menos de 3 s).');
    if (detectedRatio < 0.7) warnings.push('No se detecta a la persona en parte del vídeo: revisa encuadre e iluminación.');
    if (ankles < 0.6) warnings.push('Los tobillos no se ven bien: encuadra el cuerpo completo, de cabeza a pies.');
    if ((vis || 0) < 0.6) warnings.push('Articulaciones poco visibles: usa ropa ajustada y buena luz.');
    if (!viewOk) warnings.push(`La vista detectada es ${view.label}; para esta prueba se recomienda vista ${needView}.`);
    if (!fsOk) warnings.push(`Frecuencia de muestreo de ${round(D.fs)} Hz: para detectar eventos de la marcha se recomiendan ≥ 25 Hz.`);
    if (D.swaps > 0.05 * n) warnings.push(`Se han corregido muchos intercambios izquierda/derecha (${D.swaps}); revisa los valores por lado.`);
    return { score, detectedRatio: round(detectedRatio, 2), visibility: round(vis, 2), anklesVisible: round(ankles, 2), duration: round(duration, 1), frames: n, fs: round(D.fs, 1), swaps: D.swaps, rejected: D.rejected, warnings };
  }

  function downsample(obj, n = 400) {
    const len = obj.t.length, out = {};
    const step = Math.max(1, len / n), m = Math.min(n, len);
    for (const k of Object.keys(obj)) { if (!obj[k]) continue; out[k] = []; for (let i = 0; i < m; i++) { const v = obj[k][Math.floor(i * step)]; out[k].push(isNum(v) ? round(v, 2) : null); } }
    return out;
  }

  function interpretation(type, res, q) {
    const parts = [];
    const v = (k) => { const x = res.metrics.find((y) => y.key === k); return x && x.value != null ? `${x.value}${x.unit === '°' || x.unit === '%' || !x.unit ? x.unit : ' ' + x.unit}${x.sd != null ? ' ± ' + x.sd : ''}` : null; };
    if (type === 'gait') {
      if (res.counts.strides) parts.push(`Se han analizado ${res.counts.strides} zancadas (${res.counts.stridesL} izq., ${res.counts.stridesR} der.).`);
      if (v('speed')) parts.push(`Velocidad de marcha ${v('speed')}, cadencia ${v('cadence')}.`); else if (v('cadence')) parts.push(`Cadencia ${v('cadence')}.`);
      if (v('kneeSwingL') || v('kneeSwingR')) parts.push(`Flexión máxima de rodilla en oscilación: ${v('kneeSwingL') || '–'} (izq.) y ${v('kneeSwingR') || '–'} (der.).`);
    } else if (type === 'squat') {
      parts.push(`${res.counts.reps} repeticiones válidas con una profundidad media de ${v('depth') || '–'}.`);
      if (v('fppaL')) parts.push(`Valgo dinámico (FPPA): ${v('fppaL')} izq., ${v('fppaR')} der.`);
    } else if (type === 'sts') {
      parts.push(v('time5') ? `Tiempo de la prueba de 5 repeticiones: ${v('time5')}.` : `Repeticiones completadas: ${res.counts.reps}.`);
    } else {
      parts.push(`Velocidad de oscilación ${v('vel') || '–'}; oscilación RMS ${v('rms') || '–'}.`);
      if (v('monoTime')) parts.push(`Apoyo monopodal mantenido ${v('monoTime')}.`);
    }
    const out = outOfRange(res.metrics);
    parts.push(out.length ? `Fuera del rango de referencia: ${out.map((x) => x.label.toLowerCase()).join('; ')}.` : 'Los parámetros con referencia disponible están dentro de rango.');
    if (q.score < 70) parts.push('La calidad de la captura es limitada; conviene repetir la grabación para confirmar los valores.');
    parts.push('Valores obtenidos por visión artificial 2D; deben interpretarse según el criterio del fisioterapeuta.');
    return parts.join(' ');
  }

  // ======================= API principal =======================
  const FC = { gait: 6, squat: 4, sts: 4, balance: 3 };
  const TYPE_NAME = { gait: 'Marcha', squat: 'Sentadilla', sts: 'Levantarse de la silla ×5', balance: 'Equilibrio' };
  function analyze(type, frames, meta) {
    if (!frames || !frames.length) throw new Error('No hay fotogramas que analizar.');
    const detected = frames.filter((f) => f.lm).length / frames.length;
    if (detected < 0.2) throw new Error('No se ha detectado a ninguna persona en el vídeo. Comprueba que el cuerpo completo aparece en la imagen.');
    const view = detectView(frames, meta);
    const D = prepare(frames, meta, { fc: FC[type], boneCheck: type === 'gait' && view.label !== 'frontal' });
    const fn = { gait: analyzeGait, squat: analyzeSquat, sts: analyzeSTS, balance: analyzeBalance }[type];
    const res = fn(D, meta, view);
    const q = quality(frames, D, view, type);
    const series = Object.assign({ t: D.t.map((x) => x - D.t[0]) }, res.series);
    const common = [
      `Estimación de pose 2D con MediaPipe BlazePose (33 puntos; Bazarevsky et al., 2020)${meta.model ? `, modelo ${meta.model}` : ''}.`,
      `Remuestreo uniforme a ${round(D.fs, 1)} Hz; puntos con visibilidad < 0,5 descartados y huecos ≤ 0,25 s interpolados linealmente.${D.rejected ? ` ${D.rejected} puntos descartados por violar la longitud de los segmentos (±25 %).` : ''}`,
      `Corrección de intercambios izquierda/derecha por continuidad temporal (${D.swaps} fotogramas corregidos).`,
      `Filtro Butterworth paso bajo de 2º orden en doble pasada (fase cero, 4º orden efectivo), frecuencia de corte ${FC[type]} Hz con la corrección de Winter (2009).`,
      'Cada métrica se expresa como media ± desviación estándar entre ciclos, repeticiones o ventanas (n). Un cambio entre sesiones se considera real cuando es estadísticamente significativo (t de Welch, p < 0,05; Welch, 1947) y además supera el cambio mínimo relevante de esa métrica (p. ej., 0,10 m/s en velocidad; Perera et al., 2006).',
    ];
    const out = outOfRange(res.metrics);
    return {
      version: 2, type, view: view.label, viewRatio: view.ratio, fs: round(D.fs, 1), fc: FC[type],
      quality: q, metrics: res.metrics, main: res.main, flags: res.flags, info: res.notes || [], samples: res.samples, cycles: res.cycles || null,
      events: res.events, counts: res.counts, reps: res.reps || null,
      status: out.length || res.flags.length ? 'review' : 'ok',
      interpretation: interpretation(type, res, q),
      methods: [...common, ...res.methods],
      refs: [...new Set(['blazepose', 'winter', ...res.refs, 'welch', 'perera'])],
      series: downsample(series, 400),
    };
  }

  // Cambio mínimo relevante por métrica. Velocidad: cambio sustancial de 0,10 m/s (Perera et al., 2006).
  // Ángulos: 5°, del orden del error de la medición 2D. El resto, orientativos. better: 1 = subir es mejor, -1 = bajar, 'abs' = acercarse a 0.
  const CHANGE = {
    speed: { thr: 0.1, better: 1, src: 'perera' }, cadence: { thr: 5 }, strideLen: { thr: 0.05, better: 1 }, strideTime: { thr: 0.05 },
    stanceL: { thr: 3 }, stanceR: { thr: 3 }, ds: { thr: 3, better: -1 },
    kneeSwingL: { thr: 5, better: 1 }, kneeSwingR: { thr: 5, better: 1 }, kneeSwing: { thr: 5, better: 1 }, kneeLRL: { thr: 5 }, kneeLRR: { thr: 5 },
    hipROML: { thr: 5, better: 1 }, hipROMR: { thr: 5, better: 1 },
    depth: { thr: 5, better: 1 }, fppaL: { thr: 3, better: 'abs' }, fppaR: { thr: 3, better: 'abs' }, trunk: { thr: 5 }, hip: { thr: 5 }, dur: { thr: 0.3 },
    cycle: { thr: 0.3, better: -1 }, rise: { thr: 0.2, better: -1 },
    vel: { rel: 0.2, better: -1 }, rms: { rel: 0.2, better: -1 }, pelvis: { rel: 0.2, better: -1 },
  };
  // Compara dos análisis del mismo tipo (anterior → actual): prueba t de Welch + cambio mínimo relevante
  function compare(prev, cur) {
    if (!prev || !cur || !prev.samples || !cur.samples) return [];
    const out = [];
    for (const k of Object.keys(cur.samples)) {
      const a = prev.samples[k], b = cur.samples[k];
      if (!a || !b || a.length < 2 || b.length < 2) continue;
      const w = welch(a, b); if (!w) continue;
      const met = cur.metrics.find((x) => x.key === k) || (cur.main.key === k ? cur.main : null);
      if (!met) continue;
      const c = CHANGE[k] || {};
      const thr = c.thr != null ? c.thr : c.rel != null ? c.rel * Math.abs(w.ma) : 0;
      const relevant = isNum(w.p) && w.p < 0.05 && Math.abs(w.diff) >= thr;
      let direction = null;
      if (relevant && c.better) direction = c.better === 'abs' ? (Math.abs(w.mb) < Math.abs(w.ma) ? 'mejora' : 'empeora') : Math.sign(w.diff) === c.better ? 'mejora' : 'empeora';
      out.push({ key: k, label: met.label, unit: met.unit, ...w, thr: round(thr, 3), relevant, direction, thrSrc: c.src || null });
    }
    return out;
  }

  // Cambio de la métrica principal entre dos sesiones (usa la variable por ciclo asociada si la principal es un total)
  function mainCompare(prev, cur) {
    if (!prev || !cur) return null;
    const key = cur.main.samplesKey || cur.main.key;
    const c = compare(prev, cur).find((x) => x.key === key);
    const diff = isNum(cur.main.value) && isNum(prev.main.value) ? cur.main.value - prev.main.value : c ? c.diff : null;
    if (!c) return diff == null ? null : { diff, p: null, relevant: false, direction: null, noStats: true };
    return Object.assign({}, c, { diff, viaKey: key !== cur.main.key ? key : null });
  }

  const api = {
    analyze, compare, mainCompare, welch, linreg, tTestP, ibeta, robinsonSI, butter2, filtfilt, lowpass, fillGaps, findPeaks, resample, fixSwaps, percentile,
    angle: (a, b, c) => angle3(a, b, c), CHANGE, normKnee, NORM_SD, speedNorm, stsNorm, ustNorm, REFS, TYPE_NAME, LANDMARKS: L,
    // ángulo de rodilla de un fotograma suelto (para dibujar el esqueleto en directo)
    kneeFlex(f, meta, side) {
      if (!f.lm) return null; const S = SIDE[side], g = (i) => (f.lm[i] && f.lm[i][3] >= MIN_VIS ? { x: f.lm[i][0] * meta.width, y: f.lm[i][1] * meta.height } : null);
      const a = angle3(g(S.hip), g(S.knee), g(S.ank)); return a == null ? null : 180 - a;
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MCMetrics = api;
})(typeof window !== 'undefined' ? window : globalThis);
