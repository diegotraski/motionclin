/* MotionClin · reproductor de revisión sincronizado.
 * Muestra el vídeo (si está disponible en esta sesión) o solo el esqueleto reconstruido, con cámara lenta,
 * avance fotograma a fotograma, ángulos en directo, rastro de los tobillos y una línea de tiempo con
 * las fases de apoyo/oscilación (marcha) o las repeticiones. */
(function () {
  'use strict';
  const SPEEDS = [0.25, 0.5, 1];
  const C = { L: '#31d6c4', R: '#ffb84d', grid: 'rgba(143,165,191,.25)', text: '#8fa5bf', cursor: '#eaf2ff' };
  const deg = (r) => (r * 180) / Math.PI;
  function ang(a, b, c) { const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y, d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y); return d ? deg(Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / d)))) : null; }
  const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

  class Player {
    /**
     * opts: { frames:[{t,lm}], w, h, videoURL?, events?, title?, compact?, onTime?(t), external? (sin bucle propio) }
     */
    constructor(root, opts) {
      this.o = opts; this.root = root; this.frames = opts.frames || []; this.t = 0; this.speed = opts.compact ? 0.5 : 0.5; this.playing = false;
      this.duration = this.frames.length ? this.frames[this.frames.length - 1].t : 0;
      const dts = this.frames.slice(1).map((f, i) => f.t - this.frames[i].t).filter((d) => d > 0).sort((a, b) => a - b);
      this.dt = dts.length ? dts[Math.floor(dts.length / 2)] : 1 / 30;
      this.useVideo = !!opts.videoURL;
      this.build(); this.computeCrop();
      if (this.useVideo) this.setupVideo(); else this.draw();
    }

    build() {
      const id = Math.random().toString(36).slice(2, 7);
      this.root.innerHTML = `
        <div class="player${this.o.compact ? ' compact' : ''}" tabindex="0" aria-label="Reproductor de revisión">
          ${this.o.title ? `<div class="pl-title">${this.o.title}</div>` : ''}
          <div class="pl-stage"><canvas class="pl-canvas"></canvas><div class="pl-readout"></div><div class="pl-mode"></div></div>
          <canvas class="pl-tl" aria-label="Línea de tiempo: pulsa para saltar"></canvas>
          ${this.o.external ? '' : `<div class="pl-controls">
            <button class="btn sm pl-back" title="Fotograma anterior (←)" aria-label="Fotograma anterior">◀︎▮</button>
            <button class="btn sm primary pl-play" aria-label="Reproducir">▶︎ Reproducir</button>
            <button class="btn sm pl-fwd" title="Fotograma siguiente (→)" aria-label="Fotograma siguiente">▮▶︎</button>
            <div class="chips pl-speeds" role="group" aria-label="Velocidad">${SPEEDS.map((s) => `<button class="chip" data-s="${s}" aria-pressed="${s === this.speed}">${s === 1 ? '1×' : s.toString().replace('.', ',') + '×'}</button>`).join('')}</div>
            <span class="pl-time num small"></span>
            ${this.useVideo ? `<label class="small pl-toggle"><input type="checkbox" id="pl-vid-${id}" checked> Vídeo</label>` : ''}
            <label class="small pl-toggle"><input type="checkbox" class="pl-trail" checked> Rastro</label>
          </div>`}
        </div>`;
      const $ = (s) => this.root.querySelector(s);
      this.cv = $('.pl-canvas'); this.ctx = this.cv.getContext('2d'); this.tl = $('.pl-tl'); this.readout = $('.pl-readout'); this.modeEl = $('.pl-mode');
      this.cv.width = 960; this.cv.height = 540;
      if (!this.o.external) {
        $('.pl-play').onclick = () => (this.playing ? this.pause() : this.play());
        $('.pl-back').onclick = () => { this.pause(); this.seek(this.t - this.dt); };
        $('.pl-fwd').onclick = () => { this.pause(); this.seek(this.t + this.dt); };
        this.root.querySelectorAll('.pl-speeds .chip').forEach((b) => (b.onclick = () => { this.speed = +b.dataset.s; this.root.querySelectorAll('.pl-speeds .chip').forEach((x) => x.setAttribute('aria-pressed', x === b)); if (this.video) this.video.playbackRate = this.speed; }));
        this.trail = $('.pl-trail'); this.trail.onchange = () => this.draw();
        const vt = this.useVideo ? this.root.querySelector(`#pl-vid-${id}`) : null;
        if (vt) vt.onchange = () => { this.showVideo = vt.checked; this.draw(); };
        this.root.querySelector('.player').addEventListener('keydown', (e) => {
          if (e.key === ' ') { e.preventDefault(); this.playing ? this.pause() : this.play(); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); this.pause(); this.seek(this.t - this.dt); }
          if (e.key === 'ArrowRight') { e.preventDefault(); this.pause(); this.seek(this.t + this.dt); }
        });
      }
      const seekFromEvent = (e) => { const r = this.tl.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width; this.pause(); this.seek(x * this.duration); if (this.o.onSeek) this.o.onSeek(this.t); };
      let drag = false;
      this.tl.addEventListener('pointerdown', (e) => { drag = true; this.tl.setPointerCapture(e.pointerId); seekFromEvent(e); });
      this.tl.addEventListener('pointermove', (e) => drag && seekFromEvent(e));
      this.tl.addEventListener('pointerup', () => (drag = false));
      this.showVideo = this.useVideo;
      this.ro = new ResizeObserver(() => this.drawTimeline()); this.ro.observe(this.tl);
    }

    // Modo esqueleto: cámara virtual que sigue a la persona (centrada en la pelvis, suelo fijo, escala por su altura)
    computeCrop() {
      const W = this.o.w || 1280, H = this.o.h || 720, med = (a) => { const b = a.filter((v) => v != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
      const vis = (f, k) => f.lm && f.lm[k][3] >= 0.4;
      const tall = med(this.frames.map((f) => { if (!f.lm) return null; const ys = [0, 11, 12].filter((k) => vis(f, k)).map((k) => f.lm[k][1] * H), fs = [27, 28, 29, 30, 31, 32].filter((k) => vis(f, k)).map((k) => f.lm[k][1] * H); return ys.length && fs.length ? Math.max(...fs) - Math.min(...ys) : null; })) || H * 0.6;
      const floor = med(this.frames.map((f) => { if (!f.lm) return null; const fs = [27, 28, 29, 30, 31, 32].filter((k) => vis(f, k)).map((k) => f.lm[k][1] * H); return fs.length ? Math.max(...fs) : null; })) || H * 0.9;
      const raw = this.frames.map((f) => (f.lm && vis(f, 23) && vis(f, 24) ? ((f.lm[23][0] + f.lm[24][0]) / 2) * W : null));
      let last = raw.find((v) => v != null); if (last == null) last = W / 2;
      const filled = raw.map((v) => (v == null ? last : (last = v)));
      const win = Math.max(1, Math.round(0.5 / this.dt));
      const cx = filled.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - win); j <= Math.min(filled.length - 1, i + win); j++) { s += filled[j]; n++; } return s / n; });
      this.crop = { W, H, s: (0.72 * this.cv.height) / tall, floor, cx, fy: 0.9 * this.cv.height };
    }

    setupVideo() {
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = this.o.videoURL;
      this.video = v;
      v.addEventListener('loadeddata', () => { const sc = Math.min(1, 960 / Math.max(v.videoWidth, v.videoHeight)); this.cv.width = Math.round(v.videoWidth * sc); this.cv.height = Math.round(v.videoHeight * sc); this.computeCrop(); this.seek(0); });
      v.addEventListener('seeked', () => this.draw());
      v.addEventListener('ended', () => this.pause());
      v.addEventListener('error', () => { this.useVideo = false; this.showVideo = false; this.video = null; this.cv.width = 960; this.cv.height = 540; this.computeCrop(); this.draw(); });
    }

    indexAt(t) { const f = this.frames; let lo = 0, hi = f.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (f[m].t < t) lo = m + 1; else hi = m; } if (lo > 0 && Math.abs(f[lo - 1].t - t) < Math.abs(f[lo].t - t)) lo--; return lo; }

    seek(t) {
      this.t = Math.max(0, Math.min(this.duration, t));
      if (this.video && this.showVideo && !this.playing) { try { this.video.currentTime = this.t; } catch (e) { /* aún cargando */ } }
      this.draw();
      if (this.o.onTime) this.o.onTime(this.t);
    }
    setTime(t) { this.t = Math.max(0, Math.min(this.duration, t)); this.draw(); }

    play() {
      if (this.t >= this.duration - this.dt) this.t = 0;
      this.playing = true; this.updateBtn();
      if (this.video && this.showVideo) { this.video.currentTime = this.t; this.video.playbackRate = this.speed; this.video.play().catch(() => {}); }
      let last = performance.now();
      const step = (now) => {
        if (!this.playing) return;
        if (this.video && this.showVideo) this.t = this.video.currentTime;
        else { this.t += ((now - last) / 1000) * this.speed; if (this.t >= this.duration) { this.t = this.duration; this.pause(); } }
        last = now; this.draw(); if (this.o.onTime) this.o.onTime(this.t);
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    }
    pause() { this.playing = false; cancelAnimationFrame(this.raf); if (this.video) this.video.pause(); this.updateBtn(); }
    updateBtn() { const b = this.root.querySelector('.pl-play'); if (b) b.innerHTML = this.playing ? '❚❚ Pausa' : '▶︎ Reproducir'; }

    // Transforma un fotograma al encuadre del modo esqueleto (coordenadas normalizadas del lienzo)
    toCanvas(lm, i) {
      if (this.showVideo && this.video) return lm;
      const c = this.crop, W = this.cv.width, H = this.cv.height, cx = c.cx[i == null ? this.indexAt(this.t) : i] || 0;
      return lm.map((p) => [((p[0] * c.W - cx) * c.s + W / 2) / W, ((p[1] * c.H - c.floor) * c.s + c.fy) / H, 0, p[3]]);
    }

    draw() {
      const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
      if (!this.frames.length) return;
      const i = this.indexAt(this.t), f = this.frames[i];
      const vid = this.video && this.showVideo && this.video.readyState >= 2;
      if (vid) ctx.drawImage(this.video, 0, 0, W, H);
      else {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#132a45'); g.addColorStop(1, '#07111f'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // suelo con marcas que se desplazan con la cámara virtual (sensación de avance)
        const fy = this.crop.fy + 6, cx = this.crop.cx[i] || 0, step = 40, off = ((-cx * this.crop.s) % step + step) % step;
        ctx.strokeStyle = 'rgba(143,165,191,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke();
        ctx.strokeStyle = 'rgba(143,165,191,.18)'; for (let x = off; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x - 14, fy + 14); ctx.stroke(); }
      }
      // rastro de los tobillos (último segundo)
      if (!this.trail || this.trail.checked) {
        const n = Math.round(1 / this.dt);
        for (const [k, col] of [[27, C.L], [28, C.R]]) {
          ctx.beginPath(); let pen = false;
          for (let j = Math.max(0, i - n); j <= i; j++) { const fr = this.frames[j]; if (!fr.lm || fr.lm[k][3] < 0.4) { pen = false; continue; } const p = this.toCanvas([fr.lm[k]], i)[0]; if (!pen) { ctx.moveTo(p[0] * W, p[1] * H); pen = true; } else ctx.lineTo(p[0] * W, p[1] * H); }
          ctx.strokeStyle = col + '99'; ctx.lineWidth = Math.max(2, W / 320); ctx.stroke();
        }
      }
      if (f.lm) window.MCPose.drawFrame(ctx, null, this.toCanvas(f.lm, i), { showAngles: true });
      if (!vid) { ctx.fillStyle = 'rgba(234,242,255,.5)'; ctx.font = '600 13px "IBM Plex Mono", monospace'; ctx.fillText(this.useVideo ? 'Esqueleto' : 'Esqueleto reconstruido · el vídeo no se guarda', 14, 22); }
      this.renderReadout(f);
      const tEl = this.root.querySelector('.pl-time'); if (tEl) tEl.textContent = `${fmtT(this.t)} / ${fmtT(this.duration)} · fotograma ${i + 1}/${this.frames.length}`;
      this.drawTimeline();
    }

    renderReadout(f) {
      if (!f || !f.lm) { this.readout.innerHTML = '<span>sin persona</span>'; return; }
      const W = this.o.w || 1280, H = this.o.h || 720, P = (k) => (f.lm[k][3] >= 0.4 ? { x: f.lm[k][0] * W, y: f.lm[k][1] * H } : null);
      const knee = (h, k, a) => { const A = P(h), B = P(k), Cc = P(a); return A && B && Cc ? 180 - ang(A, B, Cc) : null; };
      const sh = P(11) && P(12) ? { x: (P(11).x + P(12).x) / 2, y: (P(11).y + P(12).y) / 2 } : null, hp = P(23) && P(24) ? { x: (P(23).x + P(24).x) / 2, y: (P(23).y + P(24).y) / 2 } : null;
      const trunk = sh && hp ? Math.abs(deg(Math.atan2(sh.x - hp.x, hp.y - sh.y))) : null;
      const item = (lab, v, col) => `<span><i style="background:${col}"></i>${lab} <b>${v == null ? '–' : Math.round(v) + '°'}</b></span>`;
      this.readout.innerHTML = item('Rodilla izq.', knee(23, 25, 27), C.L) + item('Rodilla der.', knee(24, 26, 28), C.R) + item('Tronco', trunk, '#8fa5bf');
    }

    drawTimeline() {
      const cv = this.tl, dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 600, ev = this.o.events || {};
      const gait = ev.hsL && (ev.hsL.length || ev.hsR.length);
      const h = gait ? 46 : 26;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px';
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const X = (t) => (this.duration ? (t / this.duration) * w : 0);
      ctx.fillStyle = 'rgba(143,165,191,.08)'; ctx.fillRect(0, 0, w, h);
      ctx.font = '10px "IBM Plex Mono", monospace'; ctx.fillStyle = C.text; ctx.textBaseline = 'bottom';
      for (let s = 0; s <= this.duration; s += this.duration > 20 ? 5 : 1) { ctx.fillStyle = C.grid; ctx.fillRect(X(s), 0, 1, h); ctx.fillStyle = C.text; if (s) ctx.fillText(s + 's', X(s) + 3, h - 2); }
      if (gait) {
        [['L', 4, C.L], ['R', 22, C.R]].forEach(([s, y, col]) => {
          const hs = ev['hs' + s] || [], to = ev['to' + s] || [];
          hs.forEach((t0, k) => {
            const end = to.find((x) => x > t0 && (k + 1 >= hs.length || x < hs[k + 1]));
            if (end != null) { ctx.fillStyle = col + 'cc'; ctx.fillRect(X(t0), y, Math.max(2, X(end) - X(t0)), 14); }
            ctx.fillStyle = col; ctx.fillRect(X(t0) - 1, y - 2, 2, 18);
          });
          ctx.fillStyle = '#eaf2ff'; ctx.textBaseline = 'middle'; ctx.fillText(s === 'L' ? 'I' : 'D', 4, y + 7); ctx.textBaseline = 'bottom';
        });
      }
      (ev.reps || []).forEach((t0) => { ctx.fillStyle = '#39a2ff'; ctx.beginPath(); ctx.arc(X(t0), h / 2, 4, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = C.cursor; ctx.fillRect(X(this.t) - 1, 0, 2, h);
    }

    destroy() { this.pause(); if (this.ro) this.ro.disconnect(); if (this.video) { this.video.removeAttribute('src'); this.video.load(); } this.root.innerHTML = ''; }
  }

  window.MCPlayer = Player;
})();
