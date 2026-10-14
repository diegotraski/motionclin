/* MotionClin · concordancia entre dos métodos de medida (MotionClin frente a un laboratorio).
 * Bland y Altman (1986): sesgo y límites de acuerdo. Shrout y Fleiss (1979) / McGraw y Wong (1996): ICC(2,1)
 * de acuerdo absoluto e ICC(3,1) de consistencia, con IC del 95 % por bootstrap. Kadaba et al. (1989): coeficiente
 * de correlación múltiple (CMC) entre curvas. Error de eventos en ms y cambio mínimo detectable (MDC95).
 * Funciones puras: se usan desde Node (validacion/concordancia.js) y en las pruebas. */
(function (root) {
  'use strict';
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
  const pairs = (a, b) => a.map((x, i) => [x, b[i]]).filter(([x, y]) => isNum(x) && isNum(y));
  function rng(seed) { let s = seed % 2147483647 || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  const quantile = (a, p) => { const b = a.slice().sort((x, y) => x - y), i = (b.length - 1) * p, lo = Math.floor(i); return b[lo] + (b[Math.min(b.length - 1, lo + 1)] - b[lo]) * (i - lo); };

  /** Bland-Altman: diferencias (b − a). Sesgo, DE, límites de acuerdo al 95 % y sesgo proporcional (pendiente de la diferencia frente a la media). */
  function blandAltman(a, b) {
    const p = pairs(a, b); if (p.length < 3) return null;
    const d = p.map(([x, y]) => y - x), m = p.map(([x, y]) => (x + y) / 2);
    const bias = mean(d), s = sd(d), n = d.length, se = s / Math.sqrt(n);
    const mm = mean(m), sxx = m.reduce((acc, v) => acc + (v - mm) ** 2, 0);
    const slope = sxx ? m.reduce((acc, v, i) => acc + (v - mm) * (d[i] - bias), 0) / sxx : 0;
    return { n, bias, sd: s, loaLow: bias - 1.96 * s, loaHigh: bias + 1.96 * s, biasCI: [bias - 1.96 * se, bias + 1.96 * se], propSlope: slope };
  }

  // Cuadrados medios de un diseño sujetos × métodos (n × k) sin datos faltantes
  function anova2(Y) {
    const n = Y.length, k = Y[0].length, gm = mean(Y.flat());
    const rowM = Y.map((r) => mean(r)), colM = Array.from({ length: k }, (_, j) => mean(Y.map((r) => r[j])));
    let ssr = 0, ssc = 0, sse = 0;
    for (let i = 0; i < n; i++) ssr += k * (rowM[i] - gm) ** 2;
    for (let j = 0; j < k; j++) ssc += n * (colM[j] - gm) ** 2;
    for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) sse += (Y[i][j] - rowM[i] - colM[j] + gm) ** 2;
    return { n, k, msr: ssr / (n - 1), msc: ssc / (k - 1), mse: sse / ((n - 1) * (k - 1)) };
  }
  const icc21 = (Y) => { const { n, k, msr, msc, mse } = anova2(Y); return (msr - mse) / (msr + (k - 1) * mse + (k / n) * (msc - mse)); };
  const icc31 = (Y) => { const { k, msr, mse } = anova2(Y); return (msr - mse) / (msr + (k - 1) * mse); };

  /** ICC(2,1) (acuerdo absoluto) e ICC(3,1) (consistencia) con IC 95 % por bootstrap de sujetos. */
  function icc(a, b, { boot = 2000, seed = 7 } = {}) {
    const Y = pairs(a, b); if (Y.length < 5) return null;
    const r = rng(seed), b21 = [], b31 = [];
    for (let i = 0; i < boot; i++) {
      const s = Array.from({ length: Y.length }, () => Y[Math.floor(r() * Y.length)]);
      const v21 = icc21(s), v31 = icc31(s); if (isNum(v21)) b21.push(v21); if (isNum(v31)) b31.push(v31);
    }
    return { n: Y.length, icc21: icc21(Y), ci21: [quantile(b21, 0.025), quantile(b21, 0.975)], icc31: icc31(Y), ci31: [quantile(b31, 0.025), quantile(b31, 0.975)] };
  }

  /** Interpretación del ICC según Koo y Li (2016), aplicada al límite inferior del IC. */
  const iccLabel = (v) => (!isNum(v) ? '–' : v < 0.5 ? 'pobre' : v < 0.75 ? 'moderada' : v < 0.9 ? 'buena' : 'excelente');

  /** RMSE y error absoluto medio entre dos curvas del mismo ciclo. */
  function curveError(a, b) {
    const p = pairs(a, b); if (!p.length) return null;
    const e = p.map(([x, y]) => y - x);
    return { rmse: Math.sqrt(mean(e.map((v) => v * v))), mae: mean(e.map(Math.abs)), bias: mean(e), rmseCentered: Math.sqrt(mean(e.map((v) => (v - mean(e)) ** 2))) };
  }

  /** Coeficiente de correlación múltiple entre G curvas (Kadaba et al., 1989). 1 = curvas idénticas en forma y nivel. */
  function cmc(curves) {
    const G = curves.length, T = curves[0].length;
    const tMean = Array.from({ length: T }, (_, t) => mean(curves.map((c) => c[t]))), gm = mean(tMean);
    let num = 0, den = 0;
    for (const c of curves) for (let t = 0; t < T; t++) { num += (c[t] - tMean[t]) ** 2; den += (c[t] - gm) ** 2; }
    const r = 1 - (num / (T * (G - 1))) / (den / (G * T - 1));
    return r >= 0 ? Math.sqrt(r) : NaN; // NaN si las curvas difieren más de lo que varían (no comparable)
  }

  /** Empareja cada evento de referencia con el estimado más cercano dentro de una tolerancia (s); errores en ms. */
  function eventErrors(ref, est, tol = 0.15) {
    const errs = []; let missed = 0;
    for (const t of ref) {
      let best = null; for (const u of est) if (best == null || Math.abs(u - t) < Math.abs(best - t)) best = u;
      if (best != null && Math.abs(best - t) <= tol) errs.push((best - t) * 1000); else missed++;
    }
    return errs.length ? { n: errs.length, missed, bias: mean(errs), mae: mean(errs.map(Math.abs)), sd: errs.length > 1 ? sd(errs) : 0 } : { n: 0, missed };
  }

  /** Cambio mínimo detectable al 95 % a partir de dos medidas repetidas (test-retest): SEM = DE(dif.)/√2, MDC = 1,96·√2·SEM. */
  function mdc(test, retest) {
    const p = pairs(test, retest); if (p.length < 3) return null;
    const sem = sd(p.map(([x, y]) => y - x)) / Math.SQRT2;
    return { n: p.length, sem, mdc95: 1.96 * Math.SQRT2 * sem };
  }

  const api = { blandAltman, icc, icc21, icc31, iccLabel, curveError, cmc, eventErrors, mdc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MCAgreement = api;
})(typeof window !== 'undefined' ? window : globalThis);
