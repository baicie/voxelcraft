import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

async function cleanDatabase(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => new Promise<void>(resolve => {
    const request = indexedDB.deleteDatabase('voxelcraft-k3');
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  }));
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function createWorld(page: Page, name: string, seed: string, mode: 'survival' | 'creative' = 'survival') {
  await page.getByTestId('new-world').click();
  await page.getByTestId('world-name').fill(name);
  await page.getByTestId('world-seed').fill(seed);
  await page.getByTestId('world-mode').selectOption(mode);
  await page.getByTestId('create-world').click();
  await page.waitForSelector('#start-hint', { state: 'visible', timeout: 60_000 });
}

async function enterWorld(page: Page) {
  await page.locator('#game-world').click({ position: { x: 720, y: 450 } });
  await expect.poll(() => page.evaluate(() => !!document.pointerLockElement), { timeout: 8_000 }).toBe(true);
}

async function inventory(page: Page) {
  return page.evaluate(() => window.__VOXELCRAFT__?.inventory() ?? []);
}

test('menu, seeded world, real movement, mining, pickup, crafting, save and reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await cleanDatabase(page);
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('new-world')).toBeVisible();
  await createWorld(page, 'E2E Alder Hollow', '482193');
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('health')).toContainText('♥');
  const start = await page.evaluate(() => window.__VOXELCRAFT__?.position());
  expect(start).not.toBeNull();

  await enterWorld(page);
  await page.keyboard.down('w');
  await page.waitForTimeout(800);
  await page.keyboard.up('w');
  const moved = await page.evaluate(() => window.__VOXELCRAFT__?.position());
  expect(Math.hypot((moved?.x ?? 0) - (start?.x ?? 0), (moved?.z ?? 0) - (start?.z ?? 0))).toBeGreaterThan(.5);

  // The deterministic forest spawn faces an oak trunk 5 blocks away. Mine it with a real held click.
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(2_800);
  await page.mouse.up({ button: 'left' });
  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  await page.keyboard.up('w');
  await expect.poll(async () => (await inventory(page)).some(slot => slot?.id === 'block:oakLog'), { timeout: 5_000 }).toBe(true);

  await page.keyboard.press('e');
  await expect(page.getByTestId('inventory-screen')).toBeVisible();
  await page.screenshot({ path: 'docs/benchmarks/k3.1-pro/screenshots/e2e-inventory.png' });
  const log = page.locator('#inventory-hotbar .item-slot:has(img[alt*="Oak"])').first();
  await expect(log).toBeVisible();
  await log.click();
  await page.locator('#craft-grid .item-slot').first().click();
  await page.locator('#craft-result').click();
  await expect(page.locator('#held-item:not(.hidden) img')).toBeVisible();
  await page.locator('#inventory-main .item-slot[data-empty="true"]').first().click();
  await expect.poll(async () => (await inventory(page)).some(slot => slot?.id === 'block:planks' && slot.count === 4), { timeout: 4_000 }).toBe(true);
  await page.locator('#close-inventory').click();

  await page.evaluate(() => document.exitPointerLock());
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.getByTestId('save-exit').click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.locator('.world-card')).toHaveCount(1);
  await page.getByTestId('play-world').click();
  await page.waitForSelector('#start-hint', { state: 'visible', timeout: 60_000 });
  await expect.poll(async () => (await inventory(page)).some(slot => slot?.id === 'block:planks' && slot.count === 4), { timeout: 4_000 }).toBe(true);
  await page.screenshot({ path: 'docs/benchmarks/k3.1-pro/screenshots/e2e-reloaded.png' });
  expect(errors).toEqual([]);
});

test('two worlds stay isolated across menu switching', async ({ page }) => {
  await cleanDatabase(page);
  await createWorld(page, 'Isolation One', '1001', 'creative');
  await expect(page.getByTestId('hud')).toBeVisible();
  await enterWorld(page);
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.getByTestId('save-exit').click();
  await expect(page.locator('.world-card')).toHaveCount(1);
  await createWorld(page, 'Isolation Two', '2002', 'creative');
  await enterWorld(page);
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.getByTestId('save-exit').click();
  await expect(page.locator('.world-card')).toHaveCount(2);
  await expect(page.locator('.world-card').getByRole('heading', { name: 'Isolation One' })).toBeVisible();
  await expect(page.locator('.world-card').getByRole('heading', { name: 'Isolation Two' })).toBeVisible();
  const seeds = await page.locator('.world-card .world-info p').allTextContents();
  expect(seeds.join(' ')).toContain('1001');
  expect(seeds.join(' ')).toContain('2002');
});
