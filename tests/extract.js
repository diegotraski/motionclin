// node tests/extract.js video.webm salida.json [fps]
const { chromium } = require('playwright-core'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME }); const p = await b.newPage();
  await p.goto('http://localhost:8765/tests/harness.html?fps=' + (process.argv[4] || 30));
  await p.setInputFiles('#f', process.argv[2]);
  await p.waitForFunction(() => window.RESULT, null, { timeout: 600000, polling: 1000 });
  fs.writeFileSync(process.argv[3], JSON.stringify(await p.evaluate(() => window.RESULT)));
  await b.close(); console.log('ok');
})();
