/* MotionClin · almacenamiento compacto de la secuencia de pose para reproducirla después.
 * 33 puntos × (x, y) cuantizados a 16 bits + visibilidad a 8 bits, en base64.
 * Un análisis de 30 s a 30 Hz ocupa ≈ 250 kB: cabe de sobra en IndexedDB y el vídeo nunca se guarda. */
(function (root) {
  'use strict';
  const NP = 33, NULLV = 65535;
  const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'); };
  const fromB64 = (b64) => { const s = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary'); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; };
  const q = (v) => Math.max(0, Math.min(65534, Math.round(((v + 2) / 5) * 65534)));
  const dq = (u) => (u / 65534) * 5 - 2;

  /** frames: [{t, lm}] → objeto serializable. maxFrames limita el tamaño (se submuestrea de forma uniforme). */
  function encode(frames, { width, height, maxFrames = 1200 } = {}) {
    if (!frames || !frames.length) return null;
    const step = Math.max(1, Math.ceil(frames.length / maxFrames));
    const sel = frames.filter((_, i) => i % step === 0);
    const t0 = sel[0].t;
    const xy = new Uint16Array(sel.length * NP * 2), vis = new Uint8Array(sel.length * NP);
    sel.forEach((f, i) => {
      for (let k = 0; k < NP; k++) {
        const o = (i * NP + k) * 2;
        if (f.lm && f.lm[k]) { xy[o] = q(f.lm[k][0]); xy[o + 1] = q(f.lm[k][1]); vis[i * NP + k] = Math.round(Math.max(0, Math.min(1, f.lm[k][3] == null ? 1 : f.lm[k][3])) * 255); }
        else { xy[o] = NULLV; xy[o + 1] = NULLV; vis[i * NP + k] = 0; }
      }
    });
    return { v: 1, n: sel.length, w: width || 1280, h: height || 720, t: sel.map((f) => Math.round((f.t - t0) * 1000) / 1000), xy: toB64(new Uint8Array(xy.buffer)), vis: toB64(vis) };
  }

  /** objeto serializado → [{t, lm}] */
  function decode(rep) {
    if (!rep || !rep.n) return [];
    const xb = fromB64(rep.xy), xy = new Uint16Array(xb.buffer, xb.byteOffset, xb.byteLength / 2), vis = fromB64(rep.vis);
    const out = [];
    for (let i = 0; i < rep.n; i++) {
      if (xy[i * NP * 2] === NULLV && xy[i * NP * 2 + 1] === NULLV && xy[(i * NP + 11) * 2] === NULLV) { out.push({ t: rep.t[i], lm: null }); continue; }
      const lm = [];
      for (let k = 0; k < NP; k++) { const o = (i * NP + k) * 2; lm.push(xy[o] === NULLV ? [0, 0, 0, 0] : [dq(xy[o]), dq(xy[o + 1]), 0, vis[i * NP + k] / 255]); }
      out.push({ t: rep.t[i], lm });
    }
    return out;
  }

  const api = { encode, decode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MCReplay = api;
})(typeof window !== 'undefined' ? window : globalThis);
