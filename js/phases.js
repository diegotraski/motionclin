/* MotionClin · tira de fases: el esqueleto en los instantes clave de un ciclo.
 * Marcha: contacto inicial, respuesta a la carga, apoyo medio, despegue y oscilación media (Perry y Burnfield, 2010).
 * Sentadilla: inicio, bajada, punto más bajo, subida y final. Silla: sentado, despegue del asiento y de pie. */
(function () {
  'use strict';

  /** Instantes (s) de las fases del primer ciclo completo de un análisis. */
  function select(a) {
    const ev = a.events || {};
    if (a.type === 'gait') {
      for (const s of ['L', 'R']) {
        const hs = ev['hs' + s] || [], to = ev['to' + s] || [];
        for (let k = 0; k < hs.length - 1; k++) {
          const t0 = hs[k], t1 = hs[k + 1], toe = to.find((x) => x > t0 && x < t1);
          if (toe == null) continue;
          const at = (p) => t0 + p * (t1 - t0);
          const side = s === 'L' ? 'izq.' : 'der.';
          return { side, items: [
            { label: 'Contacto inicial', pct: 0, t: t0 },
            { label: 'Respuesta a la carga', pct: 12, t: at(0.12) },
            { label: 'Apoyo medio', pct: 30, t: at(0.3) },
            { label: 'Despegue', pct: Math.round((100 * (toe - t0)) / (t1 - t0)), t: toe },
            { label: 'Oscilación media', pct: 85, t: at(0.85) },
          ] };
        }
      }
      return null;
    }
    if (a.type === 'squat' && a.reps && a.reps.length && ev.reps && ev.reps.length) {
      const pk = ev.reps[0], r = a.reps[0], s0 = pk - (r.desc || 1), s1 = pk + (r.asc || 1);
      return { items: [
        { label: 'Inicio', t: s0 }, { label: 'Bajada', t: (s0 + pk) / 2 }, { label: 'Punto más bajo', t: pk }, { label: 'Subida', t: (pk + s1) / 2 }, { label: 'Final', t: s1 },
      ] };
    }
    if (a.type === 'sts' && ev.reps && ev.reps.length >= 2) {
      const top = ev.reps[1], prev = ev.reps[0], seat = (prev + top) / 2;
      return { items: [
        { label: 'De pie', t: prev }, { label: 'Sentándose', t: (prev + seat) / 2 }, { label: 'Sentado', t: seat }, { label: 'Levantándose', t: (seat + top) / 2 }, { label: 'De pie', t: top },
      ] };
    }
    return null;
  }

  const indexAt = (frames, t) => { let best = 0, d = Infinity; frames.forEach((f, i) => { const e = Math.abs(f.t - t); if (e < d && f.lm) { d = e; best = i; } }); return best; };

  /** Dibuja el esqueleto del fotograma más cercano a t en un lienzo nuevo (encuadre centrado en la persona). */
  function render(frames, w, h, t, { width = 200, height = 250, theme = 'dark' } = {}) {
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    const ctx = c.getContext('2d');
    if (theme === 'dark') { const g = ctx.createLinearGradient(0, 0, 0, height); g.addColorStop(0, '#132a45'); g.addColorStop(1, '#07111f'); ctx.fillStyle = g; }
    else ctx.fillStyle = '#f3f7fc';
    ctx.fillRect(0, 0, width, height);
    const f = frames[indexAt(frames, t)];
    if (!f || !f.lm) return c;
    // escala común: altura aparente mediana de la persona en todo el registro
    const tall = (fr) => { const ys = [0, 11, 12, 27, 28, 29, 30, 31, 32].filter((k) => fr.lm[k][3] >= 0.3).map((k) => fr.lm[k][1] * h); return ys.length > 3 ? Math.max(...ys) - Math.min(...ys) : null; };
    const ts = frames.filter((fr) => fr.lm).map(tall).filter(Boolean).sort((x, y) => x - y);
    const s = (0.8 * height) / (ts[Math.floor(ts.length / 2)] || h * 0.6);
    const vis = f.lm.filter((p) => p[3] >= 0.3);
    const cx = (Math.min(...vis.map((p) => p[0])) + Math.max(...vis.map((p) => p[0]))) / 2 * w;
    const floor = Math.max(...[27, 28, 29, 30, 31, 32].filter((k) => f.lm[k][3] >= 0.3).map((k) => f.lm[k][1] * h));
    const lm = f.lm.map((p) => [((p[0] * w - cx) * s + width / 2) / width, ((p[1] * h - floor) * s + 0.92 * height) / height, 0, p[3]]);
    ctx.strokeStyle = theme === 'dark' ? 'rgba(143,165,191,.35)' : 'rgba(84,103,126,.35)'; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(8, 0.92 * height + 4); ctx.lineTo(width - 8, 0.92 * height + 4); ctx.stroke(); ctx.setLineDash([]);
    window.MCPose.drawFrame(ctx, null, lm, { showAngles: true });
    return c;
  }

  window.MCPhases = { select, render };
})();
