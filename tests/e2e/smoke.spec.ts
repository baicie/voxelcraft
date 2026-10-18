import { expect, test } from '@playwright/test';

test.describe('VoxelCraft browser smoke test', () => {
  test.setTimeout(150_000);

  test('creates, explores, mines, saves and reloads a world', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByTestId('btn-create')).toBeVisible();
    await expect(page.getByTestId('hotbar')).toHaveCount(0);

    // Settings can be opened and closed before entering a world.
    await page.getByTestId('btn-settings').click();
    await expect(page.getByTestId('settings-panel')).toBeVisible();
    await page.getByTestId('btn-settings-close').click();
    await expect(page.getByTestId('settings-panel')).toHaveCount(0);

    await page.getByTestId('btn-create').click();
    await expect(page.getByTestId('create-world-dialog')).toBeVisible();
    await page.getByTestId('world-name').fill('E2E World');
    await page.getByTestId('world-seed').fill('playthrough-seed');
    await page.locator('.mode-option[data-mode="creative"]').click();
    await page.getByTestId('btn-create-confirm').click();

    await expect(page.getByTestId('loading-screen')).toBeVisible();
    await expect(page.getByTestId('hud')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('.hotbar-slot')).toHaveCount(9);
    await expect(page.getByTestId('start-prompt')).toBeVisible();

    await page.getByTestId('btn-play').click();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement !== null)).toBe(true);
    await expect(page.getByTestId('start-prompt')).toHaveCount(0);
    await expect(page.getByTestId('debug-panel')).toContainText('FPS');

    // Relative mouse movement while pointer-locked, as a real mouse would generate.
    // Aim well below the horizon so the test always has terrain inside the 6-block reach.
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: 8, movementY: 360, bubbles: true }));
    });
    await expect.poll(() => page.locator('[data-debug="target"]').innerText(), { timeout: 8_000 }).not.toBe('—');

    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(1_800);
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(350);

    // Unlock to open the pause menu, then force a save.
    await page.evaluate(() => document.exitPointerLock());
    await expect(page.getByTestId('pause-menu')).toBeVisible();
    await page.getByTestId('btn-save').click();
    await expect(page.locator('.hud-toast')).toContainText('进度已保存');

    const saved = await page.evaluate(async () => {
      const request = indexedDB.open('voxelcraft-db');
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const worlds = await new Promise<Array<{ name: string; player: unknown; mode?: string }>>((resolve, reject) => {
        const tx = database.transaction('worlds', 'readonly');
        const req = tx.objectStore('worlds').getAll();
        req.onsuccess = () => resolve(req.result as Array<{ name: string; player: unknown; mode?: string }>);
        req.onerror = () => reject(req.error);
      });
      const edits = await new Promise<Array<{ edits?: Record<string, number>; overrides?: Array<[number, string]> }>>(
        (resolve, reject) => {
          const tx = database.transaction('chunkDeltas', 'readonly');
          const req = tx.objectStore('chunkDeltas').getAll();
          req.onsuccess = () => resolve(req.result as Array<{ edits?: Record<string, number>; overrides?: Array<[number, string]> }>);
          req.onerror = () => reject(req.error);
        },
      );
      const legacy = await new Promise<Array<{ edits: Record<string, number> }>>((resolve, reject) => {
        const tx = database.transaction('chunkEdits', 'readonly');
        const req = tx.objectStore('chunkEdits').getAll();
        req.onsuccess = () => resolve(req.result as Array<{ edits: Record<string, number> }>);
        req.onerror = () => reject(req.error);
      });
      database.close();
      const editCount =
        edits.reduce((total, record) => total + (record.overrides?.length ?? Object.keys(record.edits ?? {}).length), 0) +
        legacy.reduce((total, record) => total + Object.keys(record.edits).length, 0);
      return {
        worlds,
        editCount,
      };
    });
    expect(saved.worlds[0]?.name).toBe('E2E World');
    expect(saved.worlds[0]?.mode).toBe('creative');
    expect(saved.worlds[0]?.player).not.toBeNull();
    expect(saved.editCount).toBeGreaterThan(0);

    await page.getByTestId('btn-quit').click();
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('btn-continue')).toBeEnabled();

    await page.getByTestId('btn-continue').click();
    await expect(page.getByTestId('hud')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('loading-screen')).toHaveCount(0);
    await expect(page.getByTestId('start-prompt')).toBeVisible();
    await expect(page.getByTestId('debug-panel')).toContainText('chunks');

    expect(pageErrors).toEqual([]);
  });
});
