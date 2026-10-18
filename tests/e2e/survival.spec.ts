import { expect, test } from '@playwright/test';
import { runFullSurvivalLoop } from './survivalFlow.js';

test.describe('VoxelCraft V0.2 survival loop', () => {
  test.setTimeout(300_000);

  test('full tree to iron pickaxe loop then persists', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await page.getByTestId('btn-create').click();
    await expect(page.getByTestId('create-world-dialog')).toBeVisible();
    await page.getByTestId('world-name').fill('E2E Full Loop');
    await page.getByTestId('world-seed').fill('v02-full-loop-seed');
    await expect(page.locator('.mode-option[data-mode="survival"]')).toHaveClass(/is-selected/);
    await page.getByTestId('world-difficulty').selectOption('normal');
    await page.getByTestId('btn-create-confirm').click();
    await expect(page.getByTestId('loading-screen')).toBeVisible();
    await expect(page.getByTestId('hud')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('.hotbar-slot')).toHaveCount(9);
    await page.getByTestId('btn-play').click();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement !== null)).toBe(true);

    const result = await runFullSurvivalLoop(page);

    expect(result.finalCounts['base:iron_pickaxe']).toBe(1);
    expect(result.finalCounts['base:stone_pickaxe']).toBe(1);
    expect(result.finalCounts['base:wooden_pickaxe']).toBe(1);
    expect(result.afterReload.mode).toBe('survival');
    expect(result.afterReload.generatorVersion).toBe(2);
    expect(result.afterReload.blocks.table).toBeGreaterThanOrEqual(1);
    expect(result.afterReload.blocks.furnace).toBeGreaterThanOrEqual(1);
    expect(result.afterReload.furnaces.some((furnace) => furnace.fuel?.itemId === 'base:coal')).toBe(true);
    expect(result.afterReload.itemEntities).toBe(0);
    expect(result.loadedCounts).toEqual(result.finalCounts);
    expect(pageErrors).toEqual([]);
  });
});
