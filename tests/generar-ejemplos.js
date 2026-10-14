// Regenera los ejemplos del repositorio con la propia app: los 5 informes PDF de examples/informes y las capturas de docs/img.
// Uso: npm run ejemplos   (en local puede usarse CHROME=/ruta/a/chromium con playwright-core)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
let pw; try { pw = require('playwright'); } catch { pw = require('playwright-core'); }

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm', '.webm': 'video/webm', '.mp4': 'video/mp4' };
const serve = () => new Promise((resolve) => {
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  });
  srv.listen(0, () => resolve(srv));
});

const INFORMES = [
  ['demo-a4', 'marcha-seguimiento-LCA.pdf'],
  ['demo-a7', 'sentadilla-valgo-dinamico.pdf'],
  ['demo-a11', 'levantarse-silla-x5.pdf'],
  ['demo-a14', 'equilibrio-oscilacion.pdf'],
];

(async () => {
  const srv = await serve(), base = `http://localhost:${srv.address().port}/index.html`;
  const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const outPdf = path.join(ROOT, 'examples/informes'), outImg = path.join(ROOT, 'docs/img');
  fs.mkdirSync(outPdf, { recursive: true }); fs.mkdirSync(outImg, { recursive: true });
  const pdf = async (id, name) => {
    await page.goto(base + '#informe-' + id); await page.waitForSelector('.paper');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#rep-download')]);
    await dl.saveAs(path.join(outPdf, name)); console.log('✓', name);
  };
  await page.goto(base + '#panel');
  await page.waitForFunction(() => window.MCApp && window.MCApp.state.analyses.length >= 15, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outImg, 'panel.png') }); console.log('✓ docs/img/panel.png');
  for (const [id, name] of INFORMES) await pdf(id, name);
  await page.goto(base + '#sesion-demo-a4'); await page.waitForTimeout(700);
  const ph = await page.$('.d-phases-card'); await ph.scrollIntoViewIfNeeded(); await ph.screenshot({ path: path.join(outImg, 'fases.png') }); console.log('✓ docs/img/fases.png');
  await page.goto(base + '#comparar-demo-a0~demo-a4'); await page.waitForTimeout(600);
  await page.evaluate(() => { const r = document.getElementById('cmp-scrub'); r.value = 520; r.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(outImg, 'comparar.png') }); console.log('✓ docs/img/comparar.png');
  // vídeo real
  await page.goto(base + '#analisis'); await page.click('#btn-sample');
  await page.waitForSelector('#an-result:not([hidden])', { timeout: 15 * 60000 });
  const id = await page.evaluate(() => window.MCApp.state.analyses.find((x) => x.patientId === 'sample-p').id);
  await pdf(id, 'marcha-video-real.pdf');
  await browser.close(); srv.close();
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
