import { expect, test } from '@playwright/test';

test.describe('VoxelCraft survival mining', () => {
  test.setTimeout(150_000);

  test('chops a tree with the held mouse button, drops an item and picks it up', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');
    await page.getByTestId('btn-create').click();
    await page.getByTestId('world-name').fill('E2E Mining');
    await page.getByTestId('world-seed').fill('v02-survival-seed');
    await page.getByTestId('btn-create-confirm').click();
    await expect(page.getByTestId('hud')).toBeVisible({ timeout: 90_000 });
    await page.getByTestId('btn-play').click();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement !== null)).toBe(true);

    const target = await page.evaluate(() => {
      const game = (window as any).__VOXELCRAFT_DEV__.game;
      const player = game.player.position;
      let best: { x: number; y: number; z: number } | null = null;
      let bestDistance = Infinity;
      for (const chunk of game.world.manager.getAllChunks()) {
        for (let y = 45; y < 90; y++) {
          for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
              if (chunk.blocks[y * 256 + z * 16 + x] !== 5) continue;
              if (y > 46 && chunk.blocks[(y - 1) * 256 + z * 16 + x] === 5) continue;
              const wx = chunk.cx * 16 + x;
              const wz = chunk.cz * 16 + z;
              const distance = Math.hypot(wx + 0.5 - player.x, wz + 0.5 - player.z);
              if (distance < bestDistance) {
                bestDistance = distance;
                best = { x: wx, y, z: wz };
              }
            }
          }
        }
      }
      return best;
    });
    expect(target).not.toBeNull();
    const logPos = target!;
    await page.evaluate((pos) => {
      const game = (window as any).__VOXELCRAFT_DEV__.game;
      game.player.teleport(pos.x + 2.2, pos.y, pos.z + 0.5);
      game.player.yaw = Math.atan2(-(pos.x + 0.5 - game.player.position.x), -(pos.z + 0.5 - game.player.position.z));
      game.player.pitch = 0;
    }, logPos);
    await page.waitForTimeout(500);
    await expect(page.locator('[data-debug="target"]')).toContainText('橡木原木');

    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(1_900);
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(400);
    const dropped = await page.evaluate(() => {
      const game = (window as any).__VOXELCRAFT_DEV__.game;
      return game.survival.items.getAll().map((entity: any) => ({ x: entity.x, y: entity.y, z: entity.z, itemId: entity.stack.itemId }));
    });
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped[0]?.itemId).toBe('base:oak_log');

    // Move the dropped stack to the player's feet (test aid) and let the normal
    // fixed-step item simulation perform attraction and pickup.
    await page.evaluate(() => {
      const game = (window as any).__VOXELCRAFT_DEV__.game;
      const entity = game.survival.items.getAll()[0];
      if (!entity) return;
      const player = game.player.position;
      entity.x = player.x;
      entity.y = player.y + 0.4;
      entity.z = player.z;
      entity.vx = 0;
      entity.vy = 0;
      entity.vz = 0;
      entity.pickupDelaySeconds = 0;
    });
    await page.waitForTimeout(1_200);
    const inventory = await page.evaluate(() => {
      const game = (window as any).__VOXELCRAFT_DEV__.game;
      return game.survival.inventory.slots.filter(Boolean).map((stack: any) => ({ itemId: stack.itemId, count: stack.count }));
    });
    expect(inventory.some((stack: { itemId: string }) => stack.itemId === 'base:oak_log')).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});
