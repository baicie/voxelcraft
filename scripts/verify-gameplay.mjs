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
page.on('console', (message) => {
  if (message.type() === 'error') console.log(`[console.error] ${message.text()}`);
});

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.getByTestId('btn-create').click();
await page.getByTestId('world-name').fill('Gameplay Verify');
await page.getByTestId('world-seed').fill('voxelcraft-demo');
await page.getByTestId('btn-create-confirm').click();
await page.getByTestId('hud').waitFor({ state: 'visible', timeout: 60000 });
await page.getByTestId('btn-play').click();
await page.waitForTimeout(1200);
console.log('locked:', await page.evaluate(() => document.pointerLockElement !== null));
console.log('target before aim:', await page.locator('[data-debug="target"]').innerText());
await page.screenshot({ path: 'artifacts/play-before-aim.png' });

// Synthetic relative mouse events are equivalent to locked mouse movement for this test.
await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 10, movementY: 150, bubbles: true })));
await page.waitForTimeout(500);
console.log('target after aim down:', await page.locator('[data-debug="target"]').innerText());
await page.screenshot({ path: 'artifacts/play-aim-down.png' });

await page.getByTestId('btn-save').count();
await page.mouse.down({ button: 'left' });
await page.waitForTimeout(1800);
await page.mouse.up({ button: 'left' });
await page.waitForTimeout(400);
console.log('target after mine:', await page.locator('[data-debug="target"]').innerText());
await page.screenshot({ path: 'artifacts/play-after-mine.png' });

// Place one block with right click.
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(150);
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(400);
await page.screenshot({ path: 'artifacts/play-after-place.png' });

// Force a sync save through the pause menu and read edited chunk records.
await page.evaluate(() => document.exitPointerLock());
await page.waitForTimeout(400);
await page.getByTestId('btn-save').click();
await page.waitForTimeout(1000);
const db = await page.evaluate(async () => {
  const request = indexedDB.open('voxelcraft-db');
  const database = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const edits = await new Promise((resolve, reject) => {
    const tx = database.transaction('chunkEdits', 'readonly');
    const req = tx.objectStore('chunkEdits').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const worlds = await new Promise((resolve, reject) => {
    const tx = database.transaction('worlds', 'readonly');
    const req = tx.objectStore('worlds').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return {
    chunks: edits.length,
    editCount: edits.reduce((total, record) => total + Object.keys(record.edits).length, 0),
    player: worlds[0]?.player,
  };
});
console.log('db after mining/placing:', JSON.stringify(db));

await page.getByTestId('btn-settings').count();
await page.getByTestId('btn-quit').click();
await page.getByTestId('main-menu').waitFor({ state: 'visible', timeout: 20000 });
await page.getByTestId('btn-continue').click();
await page.getByTestId('hud').waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(700);
console.log('reloaded target:', await page.locator('[data-debug="target"]').innerText());
const db2 = await page.evaluate(async () => {
  const request = indexedDB.open('voxelcraft-db');
  const database = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const edits = await new Promise((resolve, reject) => {
    const tx = database.transaction('chunkEdits', 'readonly');
    const req = tx.objectStore('chunkEdits').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return edits.reduce((total, record) => total + Object.keys(record.edits).length, 0);
});
console.log('edits after reload:', db2);
await page.screenshot({ path: 'artifacts/play-reloaded.png' });
await browser.close();
