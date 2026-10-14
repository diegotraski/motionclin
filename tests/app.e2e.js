// Prueba de extremo a extremo de la app en Chromium: analiza el vídeo real de ejemplo con MediaPipe,
// revisa resultados, reproductor, tira de fases, comparador y genera el informe PDF.
// Uso: node tests/app.e2e.js   (en local puede usarse CHROME=/ruta/a/chromium con playwright-core)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
let pw; try { pw = require('playwright'); } catch { pw = require('playwright-core'); }

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.gif': 'image/gif', '.wasm': 'application/wasm', '.webm': 'video/webm', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, () => resolve(srv));
  });
}

(async () => {
  const srv = await serve(), base = `http://localhost:${srv.address().port}/index.html`;
  const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true, locale: 'es-ES' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|ERR_NAME|favicon/.test(m.text())) errors.push(m.text()); });
  const step = (msg) => console.log(`✓ ${msg}`);

  await page.goto(base + '#panel');
  await page.waitForFunction(() => window.MCApp && window.MCApp.state.analyses.length >= 15, null, { timeout: 60000 });
  step('panel con 15 análisis de ejemplo generados por el motor');

  // Vídeo real de ejemplo → análisis completo con MediaPipe
  await page.goto(base + '#analisis');
  const t0 = Date.now();
  await page.click('#btn-sample');
  await page.waitForSelector('#an-result:not([hidden])', { timeout: 15 * 60000 });
  const a = await page.evaluate(() => window.MCApp.state.analyses.find((x) => x.patientId === 'sample-p'));
  const get = (k) => (a.metrics.find((m) => m.key === k) || {}).value;
  assert.strictEqual(a.view, 'lateral', 'vista lateral');
  assert.ok(a.counts.strides >= 2, `zancadas detectadas: ${a.counts.strides}`);
  assert.ok(get('speed') > 0.9 && get('speed') < 1.6, `velocidad plausible: ${get('speed')}`);
  assert.ok(get('cadence') > 85 && get('cadence') < 125, `cadencia plausible: ${get('cadence')}`);
  assert.ok(a.quality.detectedRatio > 0.7, 'persona detectada en la mayoría de fotogramas');
  step(`vídeo real analizado en ${((Date.now() - t0) / 1000).toFixed(0)} s: ${a.counts.strides} zancadas, ${get('speed')} m/s, ${get('cadence')} pasos/min`);

  // Reproductor y tira de fases
  await page.click('#an-result .pl-fwd');
  assert.match(await page.textContent('#an-result .pl-time'), /fotograma 2\//);
  assert.strictEqual(await page.locator('#an-result .phase').count(), 5, 'tira de 5 fases');
  step('reproductor y tira de fases');

  // Informe PDF
  await page.click('#an-result a[href^="#informe-"]');
  await page.waitForSelector('.paper');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#rep-download')]);
  const pdf = path.join(require('os').tmpdir(), 'motionclin-e2e.pdf'); await dl.saveAs(pdf);
  const size = fs.statSync(pdf).size; assert.ok(size > 50000, `PDF de ${size} bytes`);
  step(`informe PDF generado (${Math.round(size / 1024)} kB)`);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#rep-patient')]);
  const pdf2 = path.join(require('os').tmpdir(), 'motionclin-e2e-paciente.pdf'); await dl2.saveAs(pdf2);
  assert.ok(fs.statSync(pdf2).size > 20000); step('informe para el paciente generado');

  // Comparador antes/después
  await page.goto(base + '#comparar-demo-a0~demo-a4'); await page.waitForTimeout(500);
  assert.match(await page.textContent('#cmp-body .summary'), /Mejora demostrada/);
  assert.strictEqual(await page.locator('#cmp-body canvas.pl-canvas').count(), 2);
  step('comparador de sesiones');

  // Idioma: inglés y vuelta al español
  await page.click('[data-lang="en"]'); await page.waitForTimeout(400);
  assert.match(await page.textContent('#cmp-body .summary'), /Proven improvement/);
  assert.match(await page.textContent('nav'), /Dashboard/);
  await page.click('[data-lang="es"]'); await page.waitForTimeout(400);
  assert.match(await page.textContent('nav'), /Panel/);
  step('interfaz en inglés y vuelta al español');

  // Persistencia
  await page.reload(); await page.waitForFunction(() => window.MCApp && window.MCApp.state.analyses.some((x) => x.patientId === 'sample-p' && x.replay));
  step('análisis y secuencia guardados tras recargar');

  assert.deepStrictEqual(errors, [], 'sin errores en la consola');
  step('sin errores en la consola');
  await browser.close(); srv.close();
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
