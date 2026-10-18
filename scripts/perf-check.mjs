import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') console.log(`[console.error] ${message.text()}`);
});

const gpu = await page.evaluate(() => 'pending').catch(() => 'pending');
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
const gpuInfo = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) return 'no webgl2';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'webgl2';
});
console.log('gpu:', gpuInfo);
console.log('unused:', gpu);

await page.getByTestId('btn-create').click();
await page.getByTestId('world-name').fill('Performance Check');
await page.getByTestId('world-seed').fill('perf-seed-2026');
const start = Date.now();
await page.getByTestId('btn-create-confirm').click();
await page.getByTestId('hud').waitFor({ state: 'visible', timeout: 60000 });
const hudReady = Date.now();
await page.getByTestId('btn-play').click();
await page.waitForTimeout(500);
await page.evaluate(() => {
  document.dispatchEvent(new MouseEvent('mousemove', { movementX: 8, movementY: 110, bubbles: true }));
});

// Wait for the initial 9x9 mesh ring around the player to finish streaming.
const streamingStart = Date.now();
let debugText = '';
for (let i = 0; i < 100; i++) {
  debugText = await page.getByTestId('debug-panel').innerText();
  const match = debugText.match(/CHUNKS\s+(\d+) loaded/);
  const meshMatch = debugText.match(/MESH\s+(\d+) chunks/);
  if (match && meshMatch && Number(match[1]) >= 121 && Number(meshMatch[1]) >= 81) break;
  await page.waitForTimeout(200);
}
const streamingDone = Date.now();
console.log('time to HUD (ms):', hudReady - start);
console.log('time to full ring (ms from HUD):', streamingDone - hudReady);
console.log('debug at steady state:\n' + debugText);

const frames = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let count = 0;
      const started = performance.now();
      const tick = (now) => {
        count++;
        if (now - started >= 6000) {
          resolve({ fps: (count / (now - started)) * 1000, elapsed: now - started });
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    }),
);
console.log('raf measurement:', JSON.stringify(frames));
console.log('debug after 6s:\n' + (await page.getByTestId('debug-panel').innerText()));

// Measure a block-edit remesh path.
await page.mouse.down({ button: 'left' });
await page.waitForTimeout(1200);
await page.mouse.up({ button: 'left' });
await page.waitForTimeout(500);
const editDebug = await page.getByTestId('debug-panel').innerText();
console.log('debug after edit:\n' + editDebug);

const memory = await page.evaluate(() => {
  const perf = performance;
  return {
    heapUsedMb: perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1048576) : null,
    heapTotalMb: perf.memory ? Math.round(perf.memory.totalJSHeapSize / 1048576) : null,
  };
});
console.log('memory:', JSON.stringify(memory));

await browser.close();
