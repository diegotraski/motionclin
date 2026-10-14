/* MotionClin · gráficas en canvas (se usan en pantalla y en el PDF). */
(function () {
  'use strict';

  function niceStep(range, target) {
    const raw = range / Math.max(1, target); const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / mag; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }

  /**
   * opts: { width, height, dpr, theme:{bg,fg,muted,grid}, series:[{name,color,data:[[x,y]],points?,dash?}],
   *         xFormat?(x), yUnit?, xLabel?, markers?:[x], yMin?, yMax?, legend? }
   */
  function lineChart(canvas, opts) {
    const dpr = opts.dpr || window.devicePixelRatio || 1;
    const W = opts.width, H = opts.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    if (!opts.noStyle) { canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const th = opts.theme;
    if (th.bg) { ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H); } else ctx.clearRect(0, 0, W, H);
    const font = opts.font || '"IBM Plex Mono", ui-monospace, monospace';
    const pad = { l: 42, r: 14, t: opts.legend === false ? 12 : 30, b: 28 };
    const pts = opts.series.flatMap((s) => [
      ...s.data.filter((d) => d[1] != null && isFinite(d[1])),
      ...(s.band || []).flatMap((d) => (d[1] != null ? [[d[0], d[1]], [d[0], d[2]]] : [])),
      ...(s.err ? s.data.flatMap((d, i) => (d[1] != null && s.err[i] != null ? [[d[0], d[1] - s.err[i]], [d[0], d[1] + s.err[i]]] : [])) : []),
    ]);
    if (!pts.length) {
      ctx.fillStyle = th.muted; ctx.font = `12px ${font}`; ctx.textAlign = 'center';
      ctx.fillText('Sin datos suficientes', W / 2, H / 2); return;
    }
    let x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
    let y0 = opts.yMin != null ? opts.yMin : Math.min(...pts.map((p) => p[1]));
    let y1 = opts.yMax != null ? opts.yMax : Math.max(...pts.map((p) => p[1]));
    if (x1 === x0) { x0 -= 1; x1 += 1; }
    if (y1 === y0) { y0 -= 5; y1 += 5; }
    const ys = niceStep(y1 - y0, 4); y0 = Math.floor(y0 / ys) * ys; y1 = Math.ceil(y1 / ys) * ys;
    const X = (x) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
    canvas.mcScale = { x0, x1, l: pad.l, r: pad.r, W, H, t: pad.t, h: H - pad.t - pad.b };
    const Y = (y) => H - pad.b - ((y - y0) / (y1 - y0)) * (H - pad.t - pad.b);

    ctx.font = `11px ${font}`; ctx.lineWidth = 1;
    // rejilla Y
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let y = y0; y <= y1 + 1e-9; y += ys) {
      ctx.strokeStyle = th.grid; ctx.beginPath(); ctx.moveTo(pad.l, Y(y)); ctx.lineTo(W - pad.r, Y(y)); ctx.stroke();
      ctx.fillStyle = th.muted; ctx.fillText(`${+y.toFixed(1)}${opts.yUnit || ''}`, pad.l - 6, Y(y));
    }
    // eje X
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const xt = opts.xTicks || (() => { const st = niceStep(x1 - x0, 6); const a = []; for (let x = Math.ceil(x0 / st) * st; x <= x1 + 1e-9; x += st) a.push(x); return a; })();
    for (const x of xt) { ctx.fillStyle = th.muted; ctx.fillText(opts.xFormat ? opts.xFormat(x) : `${+x.toFixed(1)}`, X(x), H - pad.b + 8); }
    // marcadores verticales (pasos, repeticiones)
    if (opts.markers) {
      ctx.strokeStyle = th.grid; ctx.setLineDash([3, 4]);
      for (const m of opts.markers) { ctx.beginPath(); ctx.moveTo(X(m), pad.t); ctx.lineTo(X(m), H - pad.b); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    // bandas (p. ej., rango normativo ± DE)
    for (const s of opts.series) {
      if (!s.band) continue;
      const pts2 = s.band.filter((d) => d[1] != null && d[2] != null);
      if (!pts2.length) continue;
      ctx.fillStyle = s.bandColor || 'rgba(143,165,191,.18)';
      ctx.beginPath(); pts2.forEach(([x, lo], i) => (i ? ctx.lineTo(X(x), Y(lo)) : ctx.moveTo(X(x), Y(lo))));
      for (let i = pts2.length - 1; i >= 0; i--) ctx.lineTo(X(pts2[i][0]), Y(pts2[i][2]));
      ctx.closePath(); ctx.fill();
    }
    // líneas verticales con etiqueta (p. ej., despegue)
    if (opts.vlines) {
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.font = `10px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      for (const v of opts.vlines) { if (v.x == null) continue; ctx.strokeStyle = v.color; ctx.beginPath(); ctx.moveTo(X(v.x), pad.t + 10); ctx.lineTo(X(v.x), H - pad.b); ctx.stroke(); if (v.label) { ctx.fillStyle = v.color; ctx.fillText(v.label, X(v.x), pad.t + 9); } }
      ctx.setLineDash([]);
    }
    // series
    for (const s of opts.series) {
      if (s.err) {
        ctx.strokeStyle = s.color; ctx.lineWidth = 1.2;
        s.data.forEach(([x, y], i) => { const e = s.err[i]; if (y == null || e == null) return; ctx.beginPath(); ctx.moveTo(X(x), Y(y - e)); ctx.lineTo(X(x), Y(y + e)); ctx.moveTo(X(x) - 4, Y(y - e)); ctx.lineTo(X(x) + 4, Y(y - e)); ctx.moveTo(X(x) - 4, Y(y + e)); ctx.lineTo(X(x) + 4, Y(y + e)); ctx.stroke(); });
      }
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.setLineDash(s.dash || []);
      ctx.beginPath(); let pen = false;
      for (const [x, y] of s.data) {
        if (y == null || !isFinite(y)) { pen = false; continue; }
        if (!pen) { ctx.moveTo(X(x), Y(y)); pen = true; } else ctx.lineTo(X(x), Y(y));
      }
      ctx.stroke(); ctx.setLineDash([]);
      if (s.points) {
        const valid = s.data.filter((d) => d[1] != null);
        valid.forEach(([x, y], i) => {
          const last = i === valid.length - 1;
          ctx.fillStyle = th.bg || '#000'; ctx.beginPath(); ctx.arc(X(x), Y(y), last ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.stroke();
          if (last) { ctx.fillStyle = th.fg; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.font = `600 12px ${font}`; const ly = Y(y) - 6 < pad.t + 14 ? Y(y) + 20 : Y(y) - 6; ctx.fillText(`${y}${opts.yUnit || ''}`, X(x) - 8, ly); ctx.font = `11px ${font}`; }
        });
      }
    }
    // leyenda
    if (opts.legend !== false) {
      let lx = pad.l; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const s of opts.series) {
        if (s.legend === false) continue;
        ctx.fillStyle = s.color; ctx.fillRect(lx, 11, 14, 3);
        ctx.fillStyle = th.fg; ctx.fillText(s.name, lx + 20, 13);
        lx += 32 + ctx.measureText(s.name).width;
      }
    }
  }

  window.MCCharts = { lineChart };
})();
