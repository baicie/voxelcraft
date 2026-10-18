import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.getByTestId('btn-create').click();
await page.getByTestId('world-name').fill('Night Check');
await page.getByTestId('world-seed').fill('night-walk');
await page.getByTestId('btn-create-confirm').click();
await page.getByTestId('hud').waitFor({ state: 'visible', timeout: 60000 });
await page.getByTestId('btn-play').click();
await page.waitForTimeout(500);
await page.evaluate(() => document.exitPointerLock());
await page.waitForTimeout(400);
await page.getByTestId('btn-quit').click();
await page.getByTestId('main-menu').waitFor({ state: 'visible', timeout: 30000 });

await page.evaluate(async () => {
  const request = indexedDB.open('voxelcraft-db');
  const database = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const tx = database.transaction('worlds', 'readwrite');
  const store = tx.objectStore('worlds');
  const worlds = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const world = worlds[0];
  world.timeOfDay = 0.02;
  store.put(world);
  await new Promise((resolve) => {
    tx.oncomplete = resolve;
  });
  database.close();
});

await page.reload({ waitUntil: 'networkidle' });
await page.getByTestId('btn-continue').click();
await page.getByTestId('hud').waitFor({ state: 'visible', timeout: 60000 });
await page.getByTestId('btn-play').click();
await page.waitForTimeout(1400);
console.log('night debug:\n' + (await page.getByTestId('debug-panel').innerText()));
await page.screenshot({ path: 'artifacts/night.png' });

await page.evaluate(() => {
  document.dispatchEvent(new MouseEvent('mousemove', { movementX: -1300, movementY: -210, bubbles: true }));
});
await page.waitForTimeout(600);
await page.screenshot({ path: 'artifacts/night-sky.png' });
await browser.close();
