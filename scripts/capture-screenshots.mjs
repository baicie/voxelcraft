import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.screenshot({ path: 'docs/screenshots/menu.png' });

await page.getByTestId('btn-settings').click();
await page.waitForTimeout(350);
await page.screenshot({ path: 'docs/screenshots/settings.png' });
await page.getByTestId('btn-settings-close').click();

await page.getByTestId('btn-create').click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'docs/screenshots/create-world.png' });
await page.getByTestId('world-name').fill('晨雾河谷');
await page.getByTestId('world-seed').fill('voxelcraft-demo');
await page.getByTestId('btn-create-confirm').click();
await page.getByTestId('loading-screen').waitFor({ state: 'visible' });
await page.waitForTimeout(250);
await page.screenshot({ path: 'docs/screenshots/loading.png' });
await page.getByTestId('hud').waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(2200);
await page.screenshot({ path: 'docs/screenshots/ready.png' });
await page.getByTestId('btn-play').click();
await page.waitForTimeout(2200);
await page.screenshot({ path: 'docs/screenshots/gameplay.png' });

// Aim toward the ground for a clear HUD/target demonstration.
await page.evaluate(() => {
  document.dispatchEvent(new MouseEvent('mousemove', { movementX: -55, movementY: 90, bubbles: true }));
});
await page.waitForTimeout(800);
await page.screenshot({ path: 'docs/screenshots/gameplay-target.png' });

await page.evaluate(() => document.exitPointerLock());
await page.waitForTimeout(450);
await page.screenshot({ path: 'docs/screenshots/pause.png' });
await page.getByTestId('btn-pause-settings').click();
await page.waitForTimeout(350);
await page.screenshot({ path: 'docs/screenshots/settings-in-game.png' });
await page.getByTestId('btn-settings-close').click();
await page.waitForTimeout(200);
await page.getByTestId('btn-save').click();
await page.waitForTimeout(900);
await page.getByTestId('btn-quit').click();
await page.getByTestId('main-menu').waitFor({ state: 'visible', timeout: 30000 });

// Set the saved world to midnight, then reload and re-enter.
await page.evaluate(async () => {
  const openRequest = indexedDB.open('voxelcraft-db');
  const database = await new Promise((resolve, reject) => {
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
  });
  const tx = database.transaction('worlds', 'readwrite');
  const done = new Promise((resolve) => {
    tx.oncomplete = resolve;
  });
  const store = tx.objectStore('worlds');
  const getAll = store.getAll();
  getAll.onsuccess = () => {
    const world = getAll.result[0];
    world.timeOfDay = 0.01;
    store.put(world);
  };
  await done;
  database.close();
});

await page.reload({ waitUntil: 'networkidle' });
await page.getByTestId('btn-continue').click();
await page.getByTestId('hud').waitFor({ state: 'visible', timeout: 60000 });
await page.getByTestId('btn-play').click();
await page.waitForTimeout(2000);
await page.screenshot({ path: 'docs/screenshots/night.png' });
await page.evaluate(() => {
  document.dispatchEvent(new MouseEvent('mousemove', { movementX: 250, movementY: -100, bubbles: true }));
});
await page.waitForTimeout(700);
await page.screenshot({ path: 'docs/screenshots/night-sky.png' });

await browser.close();
console.log('screenshots written to docs/screenshots');
