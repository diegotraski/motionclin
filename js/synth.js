/* MotionClin · generador de movimiento sintético con valores conocidos.
 * Sirve para validar el motor (tests) y para los datos de ejemplo. Produce landmarks en el mismo
 * formato que MediaPipe, con ruido, oclusiones e intercambios izquierda/derecha opcionales. */
(function (root) {
  'use strict';
  const rad = (d) => (d * Math.PI) / 180;
  function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const interp = (arr, phase) => { const x = (((phase % 1) + 1) % 1) * (arr.length - 1), lo = Math.floor(x), hi = Math.min(arr.length - 1, lo + 1); return arr[lo] + (arr[hi] - arr[lo]) * (x - lo); };
  // Curvas de síntesis (ángulo del muslo respecto a la vertical y flexión de rodilla), cada 5 % del ciclo
  const THIGH = [25, 24, 22, 19, 15, 11, 7, 3, -1, -5, -8, -10, -5, 3, 12, 19, 24, 27, 28, 27, 25];
  const KNEE = [5, 12, 17, 19, 17, 13, 9, 6, 5, 7, 11, 21, 37, 52, 60, 62, 56, 42, 24, 9, 5];
  // Proporciones corporales (fracción de la talla; Drillis y Contini, 1966)
  const PR = { shoulder: 0.818, hip: 0.53, thigh: 0.245, shank: 0.246, foot: 0.152, heelBack: 0.035, ankleH: 0.039, shoulderW: 0.23, hipW: 0.17, head: 0.936 };

  function blank() { return Array.from({ length: 33 }, () => [0, 0, 0, 0.99]); }
  function finish(lm, W, H, r, o) {
    for (const p of lm) {
      if (o.noise) { p[0] += (gauss(r) * o.noise) / W; p[1] += (gauss(r) * o.noise) / H; }
      p[0] /= W; p[1] /= H;
    }
    if (o.swapRate && r() < o.swapRate) for (const [a, b] of [[25, 26], [27, 28], [29, 30], [31, 32]]) { const t = lm[a]; lm[a] = lm[b]; lm[b] = t; }
    return lm;
  }
  // Coloca hombros, cadera y cabeza
  function upper(lm, hipC, dir, hp, trunkDeg, view, sgnSide) {
    const tr = rad(trunkDeg), sx = hipC[0] + Math.sin(tr) * dir * (PR.shoulder - PR.hip) * hp, sy = hipC[1] - Math.cos(tr) * (PR.shoulder - PR.hip) * hp;
    const half = view === 'frontal' ? (PR.shoulderW / 2) * hp : 0.01 * hp;
    lm[11] = [sx + half * sgnSide, sy, 0, 0.99]; lm[12] = [sx - half * sgnSide, sy, 0, 0.99];
    lm[0] = [sx + Math.sin(tr) * dir * 0.1 * hp + (view === 'frontal' ? 0 : 0.03 * hp * dir), sy - 0.12 * hp, 0, 0.99];
    for (let i = 1; i <= 10; i++) lm[i] = [lm[0][0], lm[0][1] - 0.01 * hp, 0, 0.9];
    lm[13] = [lm[11][0], sy + 0.17 * hp, 0, 0.9]; lm[14] = [lm[12][0], sy + 0.17 * hp, 0, 0.9];
    lm[15] = [lm[11][0], sy + 0.33 * hp, 0, 0.85]; lm[16] = [lm[12][0], sy + 0.33 * hp, 0, 0.85];
    for (let i = 17; i <= 22; i++) lm[i] = lm[i % 2 ? 15 : 16].slice();
  }
  // Pierna en el plano sagital a partir del ángulo del muslo (desde la vertical) y la flexión de rodilla
  function sagLeg(lm, idx, hip, dir, hp, thighDeg, kneeDeg, vis) {
    const [ih, ik, ia, ihe, it] = idx;
    const kx = hip[0] + Math.sin(rad(thighDeg)) * dir * PR.thigh * hp, ky = hip[1] + Math.cos(rad(thighDeg)) * PR.thigh * hp;
    const sh = thighDeg - kneeDeg;
    const ax = kx + Math.sin(rad(sh)) * dir * PR.shank * hp, ay = ky + Math.cos(rad(sh)) * PR.shank * hp;
    lm[ih] = [hip[0], hip[1], 0, vis]; lm[ik] = [kx, ky, 0, vis]; lm[ia] = [ax, ay, 0, vis];
    lm[ihe] = [ax - PR.heelBack * dir * hp, ay + PR.ankleH * hp, 0, vis * 0.95];
    lm[it] = [ax + (PR.foot - PR.heelBack) * dir * hp, ay + PR.ankleH * hp, 0, vis * 0.95];
  }

  /** Marcha en vista lateral. Devuelve { frames, meta, truth }. */
  function gait(o = {}) {
    o = Object.assign({ fps: 30, dur: 6, cadence: 110, speed: 1.3, heightCm: 170, kneeScaleL: 1, kneeScaleR: 1, noise: 1.5, swapRate: 0, seed: 1, W: 1280, H: 720, dir: 1, sizeFrac: 0.42, stepJitter: 0, cycleVar: 0, treadmill: false }, o);
    const r = rng(o.seed), hp = o.sizeFrac * o.H, pxPerM = hp / (o.heightCm / 100), f = o.cadence / 120;
    const vx = o.speed * pxPerM * o.dir, frames = [];
    const x0 = o.treadmill ? 0.5 * o.W : o.dir > 0 ? 0.08 * o.W : 0.92 * o.W, groundY = 0.9 * o.H;
    // variabilidad entre ciclos: amplitud de rodilla y velocidad cambian de una zancada a otra
    const cyc = Array.from({ length: 64 }, () => ({ kL: 1 + o.cycleVar * gauss(r), kR: 1 + o.cycleVar * gauss(r), v: 1 + o.cycleVar * 0.8 * gauss(r), f: 1 + o.stepJitter * gauss(r) }));
    let phase = 0, x = x0;
    for (let i = 0; i < Math.round(o.fps * o.dur); i++) {
      const t = i / o.fps;
      if (i) { const c = cyc[Math.floor(phase) % 64]; phase += (f * c.f) / o.fps; if (!o.treadmill) x += (vx * c.v * c.f) / o.fps; } // variabilidad zancada a zancada
      const lm = blank();
      const hipC = [x, groundY - PR.hip * hp + 0.01 * hp * Math.cos(4 * Math.PI * phase)];
      upper(lm, hipC, o.dir, hp, 4, 'lateral', 1);
      for (const [s, off, sc, vis] of [['L', 0, o.kneeScaleL, 0.95], ['R', 0.5, o.kneeScaleR, 0.8]]) {
        const ph = phase + off, frac = ((ph % 1) + 1) % 1;
        const w = frac >= 0.45 ? 0.5 - 0.5 * Math.cos((2 * Math.PI * (frac - 0.45)) / 0.55) : 0;
        const cv = cyc[Math.floor(ph + 0.55) % 64][s === 'L' ? 'kL' : 'kR'];
        const knee = interp(KNEE, ph) * (1 + (sc * cv - 1) * w);
        sagLeg(lm, s === 'L' ? [23, 25, 27, 29, 31] : [24, 26, 28, 30, 32], hipC, o.dir, hp, interp(THIGH, ph), knee, vis);
      }
      frames.push({ t, lm: finish(lm, o.W, o.H, r, o) });
    }
    const nk = (sc) => { let mx = 0; for (let p = 0.55; p <= 1; p += 0.005) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (p - 0.45)) / 0.55); mx = Math.max(mx, interp(KNEE, p) * (1 + (sc - 1) * w)); } return mx; };
    return { frames, meta: { width: o.W, height: o.H, patient: { heightCm: o.heightCm, age: o.age, sex: o.sex } }, truth: { cadence: o.cadence, speed: o.speed, strideTime: 1 / f, kneeSwingL: nk(o.kneeScaleL), kneeSwingR: nk(o.kneeScaleR) } };
  }

  /** Sentadilla. view: 'lateral' | 'frontal'. kneeIn: desplazamiento medial de la rodilla en el punto bajo (fracción de la talla). */
  function squat(o = {}) {
    o = Object.assign({ fps: 25, reps: 4, period: 3, depth: 100, view: 'lateral', kneeIn: 0, noise: 1.5, seed: 2, W: 1280, H: 720, heightCm: 175, sizeFrac: 0.6, pause: 1, repVar: 0 }, o);
    const r = rng(o.seed), hp = o.sizeFrac * o.H, frames = [];
    const rv = Array.from({ length: o.reps + 1 }, () => ({ d: 1 + o.repVar * gauss(r), k: 1 + 2 * o.repVar * gauss(r) }));
    const dur = o.pause + o.reps * o.period + o.pause, groundY = 0.95 * o.H, cx = 0.5 * o.W;
    for (let i = 0; i < Math.round(o.fps * dur); i++) {
      const t = i / o.fps, tt = t - o.pause;
      const d = tt > 0 && tt < o.reps * o.period ? 0.5 - 0.5 * Math.cos((2 * Math.PI * tt) / o.period) : 0;
      const rep = rv[Math.max(0, Math.min(o.reps, Math.floor(tt / o.period)))];
      const flex = 3 + o.depth * rep.d * d;
      const kIn = o.kneeIn * rep.k;
      const lm = blank();
      // Pie fijo; espinilla inclinada hacia delante y muslo hacia atrás (flexión repartida)
      const shankDeg = flex * 0.45, thighDeg = -(flex - shankDeg);
      if (o.view === 'lateral') {
        const ax = cx, ay = groundY - PR.ankleH * hp;
        const kx = ax + Math.sin(rad(shankDeg)) * PR.shank * hp, ky = ay - Math.cos(rad(shankDeg)) * PR.shank * hp;
        const hx = kx - Math.sin(rad(-thighDeg)) * PR.thigh * hp, hy = ky - Math.cos(rad(thighDeg)) * PR.thigh * hp;
        const hip = [hx, hy];
        upper(lm, hip, 1, hp, 5 + 0.45 * flex, 'lateral', 1);
        for (const [idx, vis] of [[[23, 25, 27, 29, 31], 0.95], [[24, 26, 28, 30, 32], 0.8]]) {
          lm[idx[0]] = [hx, hy, 0, vis]; lm[idx[1]] = [kx, ky, 0, vis]; lm[idx[2]] = [ax, ay, 0, vis];
          lm[idx[3]] = [ax - PR.heelBack * hp, ay + PR.ankleH * hp, 0, vis]; lm[idx[4]] = [ax + (PR.foot - PR.heelBack) * hp, ay + PR.ankleH * hp, 0, vis];
        }
      } else {
        // Vista frontal: el persona mira a la cámara; su izquierda aparece a la derecha de la imagen
        const hipY = groundY - PR.ankleH * hp - (Math.cos(rad(shankDeg)) * PR.shank + Math.cos(rad(thighDeg)) * PR.thigh) * hp;
        upper(lm, [cx, hipY], 1, hp, 0, 'frontal', 1);
        for (const [s, sg] of [['L', 1], ['R', -1]]) {
          const hx = cx + sg * (PR.hipW / 2) * hp, ax = cx + sg * (PR.hipW / 2) * hp;
          const ay = groundY - PR.ankleH * hp, ky = ay - Math.cos(rad(shankDeg)) * PR.shank * hp;
          const kx = hx - sg * kIn * hp * d;
          const idx = s === 'L' ? [23, 25, 27, 29, 31] : [24, 26, 28, 30, 32];
          lm[idx[0]] = [hx, hipY, 0, 0.97]; lm[idx[1]] = [kx, ky, 0, 0.97]; lm[idx[2]] = [ax, ay, 0, 0.97];
          lm[idx[3]] = [ax, ay + PR.ankleH * hp, 0, 0.9]; lm[idx[4]] = [ax + sg * 0.01 * hp, ay + PR.ankleH * hp * 1.3, 0, 0.9];
        }
      }
      frames.push({ t, lm: finish(lm, o.W, o.H, r, o) });
    }
    return { frames, meta: { width: o.W, height: o.H, patient: { heightCm: o.heightCm } }, truth: { reps: o.reps, depth: o.depth + 3 } };
  }

  /** Levantarse de la silla, vista lateral. period: segundos por repetición completa. */
  function sts(o = {}) {
    o = Object.assign({ fps: 25, reps: 5, period: 2.4, noise: 1.5, seed: 3, W: 1280, H: 720, heightCm: 165, sizeFrac: 0.6, pause: 1, age: 72, repVar: 0 }, o);
    const r = rng(o.seed), hp = o.sizeFrac * o.H, frames = [];
    // duración de cada repetición con variabilidad; la fase se obtiene integrando
    const pers = Array.from({ length: o.reps }, () => o.period * (1 + o.repVar * gauss(r)));
    const total = pers.reduce((s, v) => s + v, 0);
    const phaseAt = (tt) => { let acc = 0; for (let k = 0; k < pers.length; k++) { if (tt < acc + pers[k]) return k + (tt - acc) / pers[k]; acc += pers[k]; } return o.reps; };
    const dur = o.pause + total + o.pause, groundY = 0.95 * o.H, ax = 0.5 * o.W;
    for (let i = 0; i < Math.round(o.fps * dur); i++) {
      const t = i / o.fps, tt = t - o.pause;
      // u: 0 sentado, 1 de pie. Empieza y termina sentado
      let u = 0;
      const ph = phaseAt(tt);
      if (tt > 0 && tt < total) u = 0.5 - 0.5 * Math.cos(2 * Math.PI * ph);
      const knee = 90 * (1 - u) + 3 * u, shankDeg = 8 * (1 - u), thighDeg = -(knee - shankDeg);
      const ay = groundY - PR.ankleH * hp;
      const kx = ax + Math.sin(rad(shankDeg)) * PR.shank * hp, ky = ay - Math.cos(rad(shankDeg)) * PR.shank * hp;
      const hx = kx - Math.sin(rad(-thighDeg)) * PR.thigh * hp, hy = ky - Math.cos(rad(thighDeg)) * PR.thigh * hp;
      const rising = Math.sin(2 * Math.PI * ph) > 0 && tt > 0 && tt < total;
      const trunk = 10 + (rising ? 30 * Math.sin(Math.PI * u) : 8 * Math.sin(Math.PI * u));
      const lm = blank();
      upper(lm, [hx, hy], 1, hp, trunk, 'lateral', 1);
      for (const [idx, vis] of [[[23, 25, 27, 29, 31], 0.95], [[24, 26, 28, 30, 32], 0.8]]) {
        lm[idx[0]] = [hx, hy, 0, vis]; lm[idx[1]] = [kx, ky, 0, vis]; lm[idx[2]] = [ax, ay, 0, vis];
        lm[idx[3]] = [ax - PR.heelBack * hp, ay + PR.ankleH * hp, 0, vis]; lm[idx[4]] = [ax + (PR.foot - PR.heelBack) * hp, ay + PR.ankleH * hp, 0, vis];
      }
      frames.push({ t, lm: finish(lm, o.W, o.H, r, o) });
    }
    // de pie en t = pause + (k + 0.5)·period → 5 repeticiones desde el inicio de la 1ª subida (≈ pause) hasta la 5ª bipedestación
    return { frames, meta: { width: o.W, height: o.H, patient: { heightCm: o.heightCm, age: o.age } }, truth: { reps: o.reps, time5: 4.25 * o.period, cycle: o.period } };
  }

  /** Equilibrio, vista frontal. ampDeg: amplitud de la oscilación angular; mono: 'L' | 'R' | null (pie levantado). */
  function balance(o = {}) {
    o = Object.assign({ fps: 20, dur: 20, ampDeg: 0.6, freq: 0.4, mono: null, monoUntil: null, noise: 1.2, seed: 4, W: 1280, H: 720, heightCm: 160, sizeFrac: 0.7, age: 70 }, o);
    const r = rng(o.seed), hp = o.sizeFrac * o.H, frames = [];
    const groundY = 0.95 * o.H, cx = 0.5 * o.W; let drift = 0;
    for (let i = 0; i < Math.round(o.fps * o.dur); i++) {
      const t = i / o.fps; drift = 0.97 * drift + 0.03 * gauss(r) * o.ampDeg;
      const th = o.ampDeg * Math.sin(2 * Math.PI * o.freq * t) + drift;
      const lift = o.mono && (o.monoUntil == null || t < o.monoUntil);
      const lm = blank();
      const ay = groundY - PR.ankleH * hp;
      const legLen = (PR.shank + PR.thigh) * hp;
      const hipC = [cx + Math.sin(rad(th)) * legLen, ay - Math.cos(rad(th)) * legLen];
      const sx = cx + Math.sin(rad(th)) * (legLen + (PR.shoulder - PR.hip) * hp);
      upper(lm, hipC, 1, hp, 0, 'frontal', 1);
      const sy = ay - Math.cos(rad(th)) * (legLen + (PR.shoulder - PR.hip) * hp);
      lm[11] = [sx + (PR.shoulderW / 2) * hp, sy, 0, 0.99]; lm[12] = [sx - (PR.shoulderW / 2) * hp, sy, 0, 0.99];
      for (const [s, sg] of [['L', 1], ['R', -1]]) {
        const up = lift && o.mono === s ? 0.09 * hp : 0;
        const ax = cx + sg * (PR.hipW / 2) * hp;
        const idx = s === 'L' ? [23, 25, 27, 29, 31] : [24, 26, 28, 30, 32];
        const hjx = hipC[0] + sg * (PR.hipW / 2) * hp;
        lm[idx[0]] = [hjx, hipC[1], 0, 0.97];
        lm[idx[1]] = [(hjx + ax) / 2, (hipC[1] + ay - up) / 2, 0, 0.97];
        lm[idx[2]] = [ax, ay - up, 0, 0.97];
        lm[idx[3]] = [ax, ay - up + PR.ankleH * hp, 0, 0.9]; lm[idx[4]] = [ax + sg * 0.01 * hp, ay - up + PR.ankleH * hp * 1.3, 0, 0.9];
      }
      frames.push({ t, lm: finish(lm, o.W, o.H, r, o) });
    }
    return { frames, meta: { width: o.W, height: o.H, patient: { heightCm: o.heightCm, age: o.age } }, truth: { ampDeg: o.ampDeg } };
  }

  const api = { gait, squat, sts, balance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MCSynth = api;
})(typeof window !== 'undefined' ? window : globalThis);
