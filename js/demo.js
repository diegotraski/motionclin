/* MotionClin · datos de ejemplo. Movimiento sintético (js/synth.js) con valores conocidos,
 * procesado por el mismo motor que los vídeos reales: el panel, la estadística y los informes son coherentes. */
(function () {
  'use strict';
  const Y = new Date().getFullYear();

  function keyframe(sim, type) {
    const c = document.createElement('canvas'); c.width = 480; c.height = 270;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 270); g.addColorStop(0, '#16304f'); g.addColorStop(1, '#0a1626');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 480, 270);
    // encuadra a la persona: recorta alrededor de los puntos del fotograma elegido
    let best = sim.frames[Math.floor(sim.frames.length / 2)];
    if (type === 'gait' || type === 'squat') {
      let mx = -1; for (const f of sim.frames.slice(10, -10)) { const v = window.MCMetrics.kneeFlex(f, sim.meta, 'L') || 0; if (v > mx) { mx = v; best = f; } }
    } else if (type === 'sts') best = sim.frames[Math.round(sim.frames.length * 0.13)];
    const xs = best.lm.map((p) => p[0]), ys = best.lm.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const s = Math.min(380 / ((x1 - x0) * sim.meta.width || 1), 220 / ((y1 - y0) * sim.meta.height || 1));
    const lm = best.lm.map((p) => [((p[0] - (x0 + x1) / 2) * sim.meta.width * s + 240) / 480, ((p[1] - (y0 + y1) / 2) * sim.meta.height * s + 140) / 270, 0, p[3]]);
    ctx.strokeStyle = 'rgba(143,165,191,.35)'; ctx.setLineDash([6, 6]); const gy = Math.max(...lm.map((p) => p[1])) * 270 + 6; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(480, gy); ctx.stroke(); ctx.setLineDash([]);
    window.MCPose.drawFrame(ctx, null, lm);
    ctx.fillStyle = 'rgba(234,242,255,.65)'; ctx.font = '600 12px "IBM Plex Mono", monospace'; ctx.fillText('EJEMPLO · movimiento sintético', 12, 20);
    return c.toDataURL('image/jpeg', 0.85);
  }

  function build() {
    const day = 864e5, now = Date.now(), Sy = window.MCSynth;
    const patients = [
      { id: 'demo-p1', demo: true, name: 'Ana López', birthYear: Y - 31, heightCm: 166, sex: 'F', condition: 'Rehabilitación de LCA, rodilla izquierda', notes: 'Plastia hace 4 meses. Objetivo: marcha simétrica y retorno al running.', created: new Date(now - 60 * day).toISOString() },
      { id: 'demo-p2', demo: true, name: 'Carlos Ruiz', birthYear: Y - 38, heightCm: 181, sex: 'M', condition: 'Dolor patelofemoral en corredor', notes: 'Valgo dinámico en sentadilla; programa de fuerza de glúteo medio.', created: new Date(now - 35 * day).toISOString() },
      { id: 'demo-p3', demo: true, name: 'Marta Pérez', birthYear: Y - 76, heightCm: 158, sex: 'F', condition: 'Prevención de caídas', notes: 'Dos caídas en el último año. Programa de fuerza y equilibrio.', created: new Date(now - 50 * day).toISOString() },
    ];
    const P = Object.fromEntries(patients.map((p) => [p.id, p]));
    const plan = [];
    // Ana: déficit de flexión de la rodilla izquierda que se corrige; la velocidad mejora
    [[0.62, 0.92, 96], [0.72, 1.02, 100], [0.8, 1.1, 104], [0.88, 1.2, 108], [0.95, 1.28, 111]].forEach(([k, sp, cad], i) => plan.push({ p: 'demo-p1', type: 'gait', days: 44 - i * 10, sim: Sy.gait({ kneeScaleL: k, speed: sp, cadence: cad, heightCm: 166, age: 31, sex: 'F', dur: 10, seed: 100 + i, stepJitter: 0.02, cycleVar: 0.05, swapRate: 0.01 }) }));
    // Carlos: valgo dinámico que se reduce y profundidad que aumenta
    [[0.03, 82], [0.022, 90], [0.01, 98]].forEach(([kin, d], i) => plan.push({ p: 'demo-p2', type: 'squat', days: 28 - i * 11, sim: Sy.squat({ view: 'frontal', kneeIn: kin, depth: d, reps: 5, period: 2.6, seed: 200 + i, heightCm: 181, repVar: 0.05 }) }));
    // Marta: prueba de la silla cada vez más rápida y oscilación postural menor
    [3.7, 3.3, 2.95, 2.65].forEach((per, i) => plan.push({ p: 'demo-p3', type: 'sts', days: 40 - i * 11, sim: Sy.sts({ period: per, age: 76, heightCm: 158, seed: 300 + i, repVar: 0.07 }) }));
    [1.1, 0.85, 0.6].forEach((amp, i) => plan.push({ p: 'demo-p3', type: 'balance', days: 39 - i * 15, sim: Sy.balance({ ampDeg: amp, age: 76, heightCm: 158, dur: 25, seed: 400 + i }) }));
    const analyses = plan.map((x, i) => {
      const pat = P[x.p];
      const meta = Object.assign({}, x.sim.meta, { patient: { age: Y - pat.birthYear, sex: pat.sex, heightCm: pat.heightCm }, model: 'sintético' });
      const res = window.MCMetrics.analyze(x.type, x.sim.frames, meta);
      return Object.assign(res, { id: 'demo-a' + i, demo: true, patientId: x.p, date: new Date(now - x.days * day).toISOString(), source: 'Ejemplo sintético', keyframe: keyframe(x.sim, x.type), notes: '' });
    });
    return { patients, analyses };
  }

  window.MCDemo = { build };
})();
