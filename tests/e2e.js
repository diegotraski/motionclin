// Prueba de extremo a extremo: abre la app en Chromium, analiza un vídeo real y descarga el PDF y el CSV.
// Uso: node tests/e2e.js <ruta-video> [carpeta-salida]   (requiere playwright-core y un servidor en :8765)
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');

(async () => {
  const video = process.argv[2], out = process.argv[3] || '.';
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-fake-ui-for-media-stream'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto((process.env.BASE || 'http://localhost:8765/') + (process.env.PAGE || 'index.html') + '');
  await page.waitForFunction(() => document.querySelectorAll('#kpis .kpi').length === 4);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, '1_panel.png'), fullPage: true });
  console.log('Panel OK · KPIs:', await page.$$eval('#kpis .value', (e) => e.map((x) => x.textContent)));

  // Crear paciente real
  await page.goto((process.env.BASE || 'http://localhost:8765/') + (process.env.PAGE || 'index.html') + '#pacientes');
  await page.click('#btn-add-patient');
  await page.fill('#pf-name', 'Paciente Prueba');
  await page.fill('#pf-height', '165');
  await page.fill('#pf-birth', '1995');
  await page.selectOption('#pf-sex', 'F');
  await page.fill('#pf-condition', 'Prueba con vídeo real');
  await page.click('#pf-save');
  await page.waitForSelector('#patient-detail:not([hidden])');

  // Analizar vídeo
  await page.goto((process.env.BASE || 'http://localhost:8765/') + (process.env.PAGE || 'index.html') + '#analisis');
  await page.waitForSelector('#an-patient option', { state: 'attached' });
  const pid = await page.evaluate(() => window.MCApp.state.patients.find((p) => p.name === 'Paciente Prueba').id);
  await page.selectOption('#an-patient', pid);
  await page.setInputFiles('#an-file', video);
  const t0 = Date.now();
  await page.click('#an-run');
  await page.waitForSelector('#an-result:not([hidden])', { timeout: 240000 });
  console.log(`Análisis completado en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log('Estado:', await page.textContent('#an-status'));
  console.log('Resumen:', (await page.textContent('#an-result .summary')).replace(/\s+/g, ' ').trim());
  const rows = await page.$$eval('#an-result .mtable tbody tr', (els) => els.map((e) => [...e.children].map((c) => c.textContent.trim()).filter(Boolean).join(' | ')));
  console.log('Tabla:\n  ' + rows.join('\n  '));
  console.log('Alertas:\n  ' + (await page.$$eval('#an-result .flags li', (e) => e.map((x) => x.textContent))).join('\n  '));
  await page.screenshot({ path: path.join(out, '2_analisis.png'), fullPage: true });

  // Segunda sesión con el mismo vídeo: la comparación no debe mostrar cambios relevantes
  if (process.env.SECOND) {
    await page.click('#an-result .d-new'); await page.click('#an-run');
    await page.waitForFunction(() => window.MCApp.state.analyses.filter((a) => !a.demo).length >= 2, null, { timeout: 400000 });
    await page.waitForSelector('#an-result:not([hidden])');
    console.log('Comparación:', (await page.textContent('#an-result .detail .card:nth-child(2), #an-result')).replace(/\s+/g, ' ').trim().slice(0, 400));
  }
  // Informe y PDF
  await page.click('#an-result a[href^="#informe-"]');
  await page.waitForSelector('.paper');
  await page.screenshot({ path: path.join(out, '3_informe.png'), fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#rep-download')]);
  const pdfPath = path.join(out, dl.suggestedFilename()); await dl.saveAs(pdfPath);
  console.log('PDF:', pdfPath, fs.statSync(pdfPath).size, 'bytes');

  // Reproductor de la sesión y comparador
  await page.goto((process.env.BASE || 'http://localhost:8765/') + (process.env.PAGE || 'index.html') + '#sesion-demo-a4'); await page.waitForTimeout(500);
  await page.click('.d-player .pl-play'); await page.waitForTimeout(800); await page.click('.d-player .pl-play');
  console.log('Reproductor:', await page.textContent('.d-player .pl-time'));
  await page.goto((process.env.BASE || 'http://localhost:8765/') + (process.env.PAGE || 'index.html') + '#comparar-demo-a0~demo-a4'); await page.waitForTimeout(500);
  console.log('Comparador:', (await page.textContent('#cmp-body .summary')).replace(/\s+/g, ' ').trim());
  // Método
  await page.click('.nav a[data-view=metodo]'); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '5_metodo.png'), fullPage: true });
  // Ficha del paciente de ejemplo con tendencia
  await page.goto((process.env.BASE || 'http://localhost:8765/') + (process.env.PAGE || 'index.html') + '#pacientes-demo-p1'); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, '6_paciente.png'), fullPage: true });
  // CSV
  await page.goto((process.env.BASE || 'http://localhost:8765/') + (process.env.PAGE || 'index.html') + '#panel');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#btn-csv')]);
  const csvPath = path.join(out, dl2.suggestedFilename()); await dl2.saveAs(csvPath);
  console.log('CSV:', csvPath, fs.readFileSync(csvPath, 'utf8').split('\n').length - 1, 'filas');

  // Persistencia: recargar y comprobar que el análisis sigue
  await page.reload();
  await page.waitForFunction(() => window.MCApp && window.MCApp.state.analyses.length > 0);
  const n = await page.evaluate(() => window.MCApp.state.analyses.filter((a) => !a.demo).length);
  console.log('Análisis reales tras recargar:', n);

  // Móvil
  await page.setViewportSize({ width: 400, height: 860 });
  await page.goto((process.env.BASE || 'http://localhost:8765/') + (process.env.PAGE || 'index.html') + '#panel'); await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.screenshot({ path: path.join(out, '4_movil.png'), fullPage: false });
  console.log('Desbordamiento horizontal en móvil:', overflow);

  console.log('Errores de consola:', errors.length ? errors : 'ninguno');
  await browser.close();
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
