/* MotionClin · motor de estimación de pose (MediaPipe Pose, ejecutado 100% en el navegador). */
(function () {
  'use strict';

  const CONNECTIONS = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
  ];
  const LEFT = new Set([11, 13, 15, 23, 25, 27, 29, 31]);

  class PoseEngine {
    constructor(basePath) {
      this.basePath = basePath;
      this.pose = null;
      this.complexity = null;
      this.last = null;
    }

    init(complexity = 1) {
      // Serializa las inicializaciones (precarga en segundo plano + análisis del usuario)
      this._q = (this._q || Promise.resolve()).catch(() => {}).then(() => this._init(complexity));
      return this._q;
    }

    async _init(complexity) {
      if (this.pose && this.complexity === complexity) return;
      if (typeof window.Pose !== 'function') throw new Error('No se ha podido cargar el modelo de pose (pose.js).');
      if (!this.pose) {
        this.pose = new window.Pose({ locateFile: (f) => this.basePath + f });
        this.pose.onResults((r) => { this.last = r; });
      }
      this.pose.setOptions({
        modelComplexity: complexity, smoothLandmarks: true, enableSegmentation: false,
        minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      this.complexity = complexity;
      await this.pose.initialize();
    }

    reset() { if (this.pose) this.pose.reset(); }

    async detect(image) {
      this.last = null;
      await this.pose.send({ image });
      const lms = this.last && this.last.poseLandmarks;
      return lms ? lms.map((p) => [p.x, p.y, p.z, p.visibility == null ? 1 : p.visibility]) : null;
    }
  }

  // Dibuja el fotograma con el esqueleto y los ángulos de rodilla
  function drawFrame(ctx, source, lm, opts = {}) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.save();
    if (opts.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    if (source) ctx.drawImage(source, 0, 0, W, H);
    ctx.restore();
    if (!lm) return;
    const X = (p) => (opts.mirror ? 1 - p[0] : p[0]) * W, Y = (p) => p[1] * H;
    const s = Math.max(2, W / 320);
    ctx.lineCap = 'round';
    for (const [a, b] of CONNECTIONS) {
      const pa = lm[a], pb = lm[b];
      if (!pa || !pb || pa[3] < 0.4 || pb[3] < 0.4) continue;
      ctx.strokeStyle = LEFT.has(a) && LEFT.has(b) ? 'rgba(49,214,196,.95)' : !LEFT.has(a) && !LEFT.has(b) ? 'rgba(255,184,77,.95)' : 'rgba(234,242,255,.85)';
      ctx.lineWidth = s * 1.6;
      ctx.beginPath(); ctx.moveTo(X(pa), Y(pa)); ctx.lineTo(X(pb), Y(pb)); ctx.stroke();
    }
    for (let i = 11; i < 33; i++) {
      const p = lm[i]; if (!p || p[3] < 0.4) continue;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(X(p), Y(p), s * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    if (opts.showAngles !== false && window.MCMetrics) {
      const meta = { width: W, height: H };
      const f = { lm: opts.mirror ? lm.map((p) => [1 - p[0], p[1], p[2], p[3]]) : lm };
      ctx.font = `600 ${Math.round(s * 6)}px "IBM Plex Mono", ui-monospace, monospace`;
      for (const [side, idx] of [['L', 25], ['R', 26]]) {
        const v = window.MCMetrics.kneeFlex(f, meta, side);
        if (v == null) continue;
        const p = f.lm[idx];
        const txt = `${side === 'L' ? 'I' : 'D'} ${Math.round(v)}°`;
        const w = ctx.measureText(txt).width;
        const x = side === 'L' ? p[0] * W + s * 6 : p[0] * W - w - s * 6, y = p[1] * H + (side === 'L' ? 0 : s * 9);
        ctx.fillStyle = 'rgba(5,12,22,.75)';
        ctx.fillRect(x - s * 2, y - s * 6, w + s * 4, s * 8);
        ctx.fillStyle = side === 'L' ? '#31d6c4' : '#ffb84d';
        ctx.fillText(txt, x, y);
      }
    }
  }

  // Procesa un archivo de vídeo fotograma a fotograma (búsqueda determinista por tiempo)
  async function processVideo(engine, file, { fps = 15, canvas, onProgress, onFrame, signal } = {}) {
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    const url = URL.createObjectURL(file);
    video.src = url;
    try {
      await new Promise((res, rej) => {
        video.onloadeddata = res;
        video.onerror = () => rej(new Error('El navegador no puede leer este vídeo. Prueba con MP4 (H.264) o WebM.'));
      });
      let duration = video.duration;
      if (!isFinite(duration) || duration <= 0) throw new Error('No se ha podido leer la duración del vídeo.');
      duration = Math.min(duration, 60); // límite de seguridad: 60 s
      const W = video.videoWidth, H = video.videoHeight;
      const scale = Math.min(1, 800 / Math.max(W, H));
      canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
      const ctx = canvas.getContext('2d');
      engine.reset();
      const frames = [];
      const total = Math.max(1, Math.floor(duration * fps));
      for (let i = 0; i < total; i++) {
        if (signal && signal.aborted) throw new DOMException('Cancelado', 'AbortError');
        const t = i / fps;
        await seek(video, t);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const lm = await engine.detect(canvas);
        frames.push({ t, lm });
        drawFrame(ctx, video, lm);
        if (onFrame) onFrame({ t, lm, canvas, index: i });
        if (onProgress) onProgress((i + 1) / total);
      }
      return { frames, meta: { width: canvas.width, height: canvas.height, duration, fps, source: file.name } };
    } finally {
      URL.revokeObjectURL(url);
      video.removeAttribute('src'); video.load();
    }
  }

  function seek(video, t) {
    return new Promise((res, rej) => {
      const done = () => { video.removeEventListener('seeked', done); clearTimeout(to); res(); };
      const to = setTimeout(() => { video.removeEventListener('seeked', done); res(); }, 3000);
      video.addEventListener('seeked', done);
      try { video.currentTime = t; } catch (e) { clearTimeout(to); rej(e); }
    });
  }

  // Captura en directo desde la cámara: detecta y acumula fotogramas hasta stop()
  class LiveSession {
    constructor(engine, video, canvas) { this.engine = engine; this.video = video; this.canvas = canvas; this.frames = []; this.running = false; this.recording = false; }
    async start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Este navegador no permite usar la cámara aquí. Graba el vídeo con el móvil y súbelo.');
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' }, audio: false });
      this.video.srcObject = this.stream; this.video.muted = true; this.video.playsInline = true;
      await this.video.play();
      const W = this.video.videoWidth, H = this.video.videoHeight; const sc = Math.min(1, 960 / Math.max(W, H));
      this.canvas.width = Math.round(W * sc); this.canvas.height = Math.round(H * sc);
      this.engine.reset();
      this.running = true;
      this.loop();
    }
    async loop() {
      const ctx = this.canvas.getContext('2d');
      while (this.running) {
        const lm = await this.engine.detect(this.video).catch(() => null);
        drawFrame(ctx, this.video, lm, { mirror: false });
        if (this.recording) this.frames.push({ t: (performance.now() - this.t0) / 1000, lm });
        if (this.onTick) this.onTick(this.recording ? (performance.now() - this.t0) / 1000 : 0, lm);
        await new Promise((r) => requestAnimationFrame(r));
      }
    }
    record() { this.frames = []; this.t0 = performance.now(); this.recording = true; }
    stopRecording() {
      this.recording = false;
      const f = this.frames;
      return { frames: f, meta: { width: this.canvas.width, height: this.canvas.height, duration: f.length ? f[f.length - 1].t : 0, fps: f.length / Math.max(0.1, f.length ? f[f.length - 1].t : 1), source: 'Cámara en directo' } };
    }
    stop() { this.running = false; this.recording = false; if (this.stream) this.stream.getTracks().forEach((t) => t.stop()); this.video.srcObject = null; }
  }

  window.MCPose = { PoseEngine, processVideo, LiveSession, drawFrame, CONNECTIONS };
})();
