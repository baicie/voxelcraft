import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:4180').replace(/\/+$/, '');
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
const consoleErrors = [];
const workerResponses = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('response', (response) => {
  if (response.url().includes('generationWorker')) {
    workerResponses.push({ url: response.url(), status: response.status() });
  }
});

await mkdir('artifacts', { recursive: true });
try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('main-menu').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByTestId('btn-create').click();
  await page.getByTestId('world-name').fill('Deploy Smoke');
  await page.getByTestId('world-seed').fill('deploy-smoke-seed');
  await page.locator('.mode-option[data-mode="creative"]').click();
  await page.getByTestId('btn-create-confirm').click();
  await page.getByTestId('hud').waitFor({ state: 'visible', timeout: 90_000 });
  await page.getByTestId('btn-play').click();
  await page.waitForFunction(() => document.pointerLockElement !== null, null, { timeout: 10_000 });
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mousemove', { movementX: 8, movementY: 360, bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelector('[data-debug="target"]')?.textContent !== '—',
    null,
    { timeout: 8_000 },
  );
  const targetBefore = await page.locator('[data-debug="target"]').innerText();
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(1_200);
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(500);

  await page.evaluate(() => document.exitPointerLock());
  await page.getByTestId('pause-menu').waitFor({ state: 'visible', timeout: 5_000 });
  await page.getByTestId('btn-save').click();
  await page.waitForFunction(() => document.querySelector('.hud-toast')?.textContent?.includes('进度已保存'), null, {
    timeout: 8_000,
  });

  const saved = await page.evaluate(async () => {
    const request = indexedDB.open('voxelcraft-db');
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = (storeName) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const result = {
      worlds: await count('worlds'),
      players: await count('players'),
      chunkDeltas: await count('chunkDeltas'),
    };
    database.close();
    return result;
  });

  await page.getByTestId('btn-quit').click();
  await page.getByTestId('main-menu').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByTestId('btn-continue').click();
  await page.getByTestId('hud').waitFor({ state: 'visible', timeout: 90_000 });
  await page.waitForTimeout(900);
  const debugText = await page.getByTestId('debug-panel').innerText();
  const loaded = {
    brand: await page.locator('.hud-brand-meta').innerText(),
    chunks: Number(/CHUNKS\s+(\d+) loaded/.exec(debugText)?.[1] ?? 0),
  };
  await page.screenshot({ path: 'artifacts/deploy-smoke.png' });

  console.log(
    JSON.stringify(
      {
        baseUrl,
        targetBefore,
        workerResponses,
        saved,
        loaded,
        pageErrors,
        consoleErrors,
      },
      null,
      2,
    ),
  );

  if (!workerResponses.some((response) => response.status === 200)) {
    throw new Error('Chunk generation Worker asset did not return HTTP 200');
  }
  if (saved.worlds < 1 || saved.players < 1 || saved.chunkDeltas < 1) {
    throw new Error('Expected world/player/chunk delta records in IndexedDB');
  }
  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    throw new Error('Browser reported errors');
  }
  if (!loaded.brand.includes('CREATIVE') || loaded.chunks < 9) {
    throw new Error('Reloaded world did not restore creative mode/chunks');
  }
  console.log('deploy smoke passed');
} finally {
  await browser.close();
}
