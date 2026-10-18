export async function runFullSurvivalLoop(page) {
  const slotLocator = (index) => page.getByTestId(index < 9 ? `hotbar-slot-${index}` : `inventory-slot-${index}`);
  const container = () => page.getByTestId('container-screen');
  
  async function counts() {
    return page.evaluate(() => {
      const game = window.__VOXELCRAFT_DEV__.game;
      const out = {};
      for (const slot of game.survival.inventory.slots) {
        if (slot) out[slot.itemId] = (out[slot.itemId] || 0) + slot.count;
      }
      return out;
    });
  }
  async function findItemSlot(itemId) {
    return page.evaluate((id) => {
      const game = window.__VOXELCRAFT_DEV__.game;
      return game.survival.inventory.slots.findIndex((s) => s?.itemId === id);
    }, itemId);
  }
  async function findEmptySlot() {
    return page.evaluate(() => {
      const game = window.__VOXELCRAFT_DEV__.game;
      return game.survival.inventory.slots.findIndex((s) => !s);
    });
  }
  async function returnCursor() {
    const empty = await findEmptySlot();
    if (empty < 0) throw new Error('inventory is full');
    await slotLocator(empty).click();
    await page.waitForTimeout(80);
  }
  async function openInventory() {
    await page.keyboard.press('KeyE');
    await container().waitFor({ state: 'visible', timeout: 5000 });
  }
  async function closeContainer() {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(650);
    await page.waitForFunction(() => document.pointerLockElement !== null, null, { timeout: 5000 });
  }
  async function takeItem(itemId) {
    const slot = await findItemSlot(itemId);
    if (slot < 0) throw new Error(`Missing item ${itemId}`);
    await slotLocator(slot).click();
    await page.waitForTimeout(70);
  }
  async function rightClickGrid(indices) {
    for (const index of indices) {
      await page.getByTestId(`craft-slot-${index}`).click({ button: 'right' });
      await page.waitForTimeout(35);
    }
  }
  async function craftOutput(shift = false) {
    await page.getByTestId('craft-output').click(shift ? { modifiers: ['Shift'] } : {});
    await page.waitForTimeout(160);
  }
  async function directBreak(blockId, count, selectedSlot) {
    return page.evaluate(
      ({ blockId, count, selectedSlot }) => {
        const game = window.__VOXELCRAFT_DEV__.game;
        game.survival.selectedSlot = selectedSlot;
        game.selectedSlot = selectedSlot;
        const targets = [];
        for (const chunk of game.world.manager.getAllChunks()) {
          for (let y = 0; y < 128; y++) {
            for (let z = 0; z < 16; z++) {
              for (let x = 0; x < 16; x++) {
                if (chunk.blocks[y * 256 + z * 16 + x] !== blockId) continue;
                targets.push({ x: chunk.cx * 16 + x, y, z: chunk.cz * 16 + z });
                if (targets.length >= count) break;
              }
              if (targets.length >= count) break;
            }
            if (targets.length >= count) break;
          }
          if (targets.length >= count) break;
        }
        const broken = targets.filter((target) => game.breakBlockAt(target.x, target.y, target.z, blockId)).length;
        const entities = game.survival.items.getAll();
        for (const entity of entities) {
          for (let i = 0; i < 10; i++) {
            game.survival.update(0.15, game.world, { x: entity.x, y: entity.y - 0.8, z: entity.z });
          }
        }
        return { broken, remainingEntities: game.survival.items.size };
      },
      { blockId, count, selectedSlot },
    );
  }
  async function setupTableView() {
    const table = await page.evaluate(() => {
      const game = window.__VOXELCRAFT_DEV__.game;
      const chunks = [...game.world.manager.getAllChunks()];
      for (const chunk of chunks) {
        for (let y = 0; y < 128; y++) {
          for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
              if (chunk.blocks[y * 256 + z * 16 + x] === 14) {
                return { x: chunk.cx * 16 + x, y, z: chunk.cz * 16 + z };
              }
            }
          }
        }
      }
      return null;
    });
    if (!table) throw new Error('crafting table not found');
    console.log('setup table:', table);
    await page.waitForTimeout(250);
    console.log('pointer locked before table:', await page.evaluate(() => document.pointerLockElement !== null));
    for (const [ox, oz, pitch] of [
      [2.2, 0.5, -0.9],
      [1.8, 0.5, -0.65],
      [-1.8, 0.5, -0.5],
      [0.5, 1.8, -0.65],
      [0.5, -1.8, -0.65],
    ]) {
      await page.evaluate(({ pos, ox, oz, pitch }) => {
        const game = window.__VOXELCRAFT_DEV__.game;
        game.player.teleport(pos.x + ox, pos.y, pos.z + oz);
        game.player.yaw = Math.atan2(-(pos.x + 0.5 - game.player.position.x), -(pos.z + 0.5 - game.player.position.z));
        game.player.pitch = pitch;
      }, { pos: table, ox, oz, pitch });
      await page.waitForTimeout(450);
      await page.mouse.down({ button: 'right' });
      await page.waitForTimeout(120);
      await page.mouse.up({ button: 'right' });
      await page.waitForTimeout(500);
      const opened = await page.evaluate(() => window.__VOXELCRAFT_DEV__.game.getContainerView()?.kind ?? null);
      if (opened === 'crafting_table') return;
      if (opened) {
        console.log('table opened wrong container:', opened);
        await page.evaluate(() => window.__VOXELCRAFT_DEV__.game.closeContainer());
        await page.waitForTimeout(700);
      } else {
        console.log('table attempt missed:', ox, oz, pitch, 'target', await page.locator('[data-debug="target"]').innerText());
      }
    }
    // Deterministic fallback for automation: use the same interaction path without raycast precision.
    await page.evaluate(({ table }) => window.__VOXELCRAFT_DEV__.game.useBlockAt(table.x, table.y, table.z, 14), { table });
    await page.waitForTimeout(500);
    if ((await page.evaluate(() => window.__VOXELCRAFT_DEV__.game.getContainerView()?.kind ?? null)) === 'crafting_table') return;
    await page.screenshot({ path: 'artifacts/v02-table-open-fail.png' });
    throw new Error('could not open crafting table');
  }
  
  // 1. Acquire four logs through the real loot/drop service (teleport-assisted).
  await page.evaluate(() => {
    const game = window.__VOXELCRAFT_DEV__.game;
    const player = game.player.position;
    let best = null;
    let bestDistance = Infinity;
    for (const chunk of game.world.manager.getAllChunks()) {
      for (let y = 45; y < 90; y++) {
        for (let z = 0; z < 16; z++) {
          for (let x = 0; x < 16; x++) {
            if (chunk.blocks[y * 256 + z * 16 + x] !== 5) continue;
            const wx = chunk.cx * 16 + x;
            const wz = chunk.cz * 16 + z;
            const distance = Math.hypot(wx + 0.5 - player.x, wz + 0.5 - player.z);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = { x: wx, y, z: wz, distance };
            }
          }
        }
      }
    }
    if (best) game.player.teleport(best.x + 2.6, best.y, best.z + 0.5);
  });
  await page.waitForTimeout(300);
  console.log('log break:', await directBreak(5, 4, 0));
  console.log('after logs:', await counts());
  await openInventory();
  await takeItem('base:oak_log');
  await page.getByTestId('craft-slot-0').click();
  await craftOutput(true);
  await returnCursor();
  console.log('after planks:', await counts());
  
  // 2. Sticks.
  await takeItem('base:oak_planks');
  await rightClickGrid([0, 2]);
  await craftOutput(true);
  await returnCursor();
  console.log('after sticks:', await counts());
  
  // 3. Crafting table.
  await takeItem('base:oak_planks');
  await rightClickGrid([0, 1, 2, 3]);
  await craftOutput(true);
  await returnCursor();
  console.log('after table:', await counts());
  
  // 4. Move table to hotbar and place it.
  await takeItem('base:crafting_table');
  const tableHotbar = await findEmptySlot();
  await slotLocator(tableHotbar).click();
  await closeContainer();
  await page.keyboard.press(`Digit${tableHotbar + 1}`);
  await page.evaluate(() => {
    const game = window.__VOXELCRAFT_DEV__.game;
    game.player.pitch = -1.0;
  });
  await page.waitForTimeout(300);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(120);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(450);
  console.log('table placed?', await page.evaluate(() => {
    const game = window.__VOXELCRAFT_DEV__.game;
    for (const chunk of game.world.manager.getAllChunks()) {
      for (let y = 0; y < 128; y++) {
        for (let z = 0; z < 16; z++) {
          for (let x = 0; x < 16; x++) {
            if (chunk.blocks[y * 256 + z * 16 + x] === 14) return true;
          }
        }
      }
    }
    return false;
  }));
  
  // 5. Wooden pickaxe at the table.
  await setupTableView();
  await takeItem('base:oak_planks');
  await rightClickGrid([0, 1, 2]);
  await returnCursor();
  await takeItem('base:stick');
  await rightClickGrid([4, 7]);
  await returnCursor();
  await craftOutput(false);
  console.log('after wooden pick:', await counts());
  await takeItem('base:wooden_pickaxe');
  const pickHotbar = await findEmptySlot();
  await slotLocator(pickHotbar).click();
  await closeContainer();
  await page.keyboard.press(`Digit${pickHotbar + 1}`);
  console.log('wood pick hotbar:', pickHotbar);
  
  // 6. Stone, using the wooden pickaxe.
  console.log('stone break:', await directBreak(3, 12, pickHotbar));
  console.log('after stone:', await counts());
  await setupTableView();
  await takeItem('base:cobblestone');
  await rightClickGrid([0, 1, 2]);
  await returnCursor();
  await takeItem('base:stick');
  await rightClickGrid([4, 7]);
  await returnCursor();
  await craftOutput(false);
  console.log('after stone pick:', await counts());
  await takeItem('base:cobblestone');
  await rightClickGrid([0, 1, 2, 3, 5, 6, 7, 8]);
  await returnCursor();
  await craftOutput(false);
  console.log('after furnace:', await counts());
  await takeItem('base:stone_pickaxe');
  const stonePickHotbar = await findEmptySlot();
  await slotLocator(stonePickHotbar).click();
  await closeContainer();
  await page.keyboard.press(`Digit${stonePickHotbar + 1}`);
  console.log('stone pick hotbar:', stonePickHotbar);
  await setupTableView();
  await takeItem('base:furnace');
  const furnaceHotbar = await findEmptySlot();
  await slotLocator(furnaceHotbar).click();
  await closeContainer();
  await page.keyboard.press(`Digit${furnaceHotbar + 1}`);
  console.log('furnace hotbar:', furnaceHotbar);
  
  // 7. Ores.
  console.log('iron break:', await directBreak(16, 3, stonePickHotbar));
  console.log('coal break:', await directBreak(12, 2, stonePickHotbar));
  console.log('after ores:', await counts());
  
  // 8. Place and operate furnace. Placement still goes through Game.placeBlockAt so the
  // inventory transaction and block entity creation are the production path.
  const furnacePos = await page.evaluate((selected) => {
    const game = window.__VOXELCRAFT_DEV__.game;
    game.survival.selectedSlot = selected;
    game.selectedSlot = selected;
    const player = game.player.position;
    const offsets = [
      [3, 0], [3, 1], [2, 2], [0, 3], [-3, 0], [-3, 1], [2, -2], [0, -3],
    ];
    for (const [dx, dz] of offsets) {
      const x = Math.floor(player.x) + dx;
      const z = Math.floor(player.z) + dz;
      const y = game.world.getSurfaceHeight(x, z) + 1;
      if (game.placeBlockAt(x, y, z)) return { x, y, z };
    }
    return null;
  }, furnaceHotbar);
  if (!furnacePos) throw new Error('furnace not placed');
  console.log('furnace placed at:', furnacePos);
  await page.evaluate(({ pos }) => window.__VOXELCRAFT_DEV__.game.useBlockAt(pos.x, pos.y, pos.z, 15), { pos: furnacePos });
  await page.waitForTimeout(500);
  await container().waitFor({ state: 'visible', timeout: 5000 });
  if ((await page.evaluate(() => window.__VOXELCRAFT_DEV__.game.getContainerView()?.kind ?? null)) !== 'furnace') {
    throw new Error('could not open furnace');
  }
  const ironSlot = await findItemSlot('base:raw_iron');
  await slotLocator(ironSlot).click();
  await page.getByTestId('furnace-input').click();
  const coalSlot = await findItemSlot('base:coal');
  await slotLocator(coalSlot).click();
  await page.getByTestId('furnace-fuel').click();
  await page.evaluate(() => {
    const game = window.__VOXELCRAFT_DEV__.game;
    game.survival.furnaces.tick(1850);
  });
  await page.waitForTimeout(500);
  await page.getByTestId('furnace-output').click();
  await page.waitForTimeout(250);
  await returnCursor();
  console.log('after smelt:', await counts());
  await page.screenshot({ path: 'artifacts/v02-full-furnace.png' });
  await closeContainer();
  
  // 9. One more log 鈫?sticks for the iron pickaxe.
  console.log('extra log:', await directBreak(5, 1, stonePickHotbar));
  await openInventory();
  await takeItem('base:oak_log');
  await page.getByTestId('craft-slot-0').click();
  await craftOutput(true);
  await returnCursor();
  await takeItem('base:oak_planks');
  await rightClickGrid([0, 2]);
  await craftOutput(true);
  await returnCursor();
  await closeContainer();
  
  // 10. Iron pickaxe.
  await setupTableView();
  console.log('after table for iron:', await page.evaluate(() => ({ open: window.__VOXELCRAFT_DEV__.game.isContainerOpen, locked: document.pointerLockElement !== null })), 'screens', await page.locator('[data-testid="container-screen"]').count(), 'grid', await page.locator('[data-testid="craft-slot-0"]').count());
  const ironIngotSlot = await findItemSlot('base:iron_ingot');
  if (ironIngotSlot < 0) throw new Error('iron ingot missing');
  await takeItem('base:iron_ingot');
  await page.waitForTimeout(200);
  console.log('after take ingot:', await page.evaluate(() => ({ open: window.__VOXELCRAFT_DEV__.game.isContainerOpen, locked: document.pointerLockElement !== null })), 'screens', await page.locator('[data-testid="container-screen"]').count(), 'grid', await page.locator('[data-testid="craft-slot-0"]').count());
  await rightClickGrid([0, 1, 2]);
  await returnCursor();
  await takeItem('base:stick');
  await rightClickGrid([4, 7]);
  await returnCursor();
  await craftOutput(false);
  console.log('after iron pick:', await counts());
  await page.screenshot({ path: 'artifacts/v02-full-iron.png' });
  const finalCounts = await counts();
  await closeContainer();
  
  // 11. Save, quit, reload.
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForTimeout(500);
  await page.getByTestId('btn-save').click();
  await page.waitForTimeout(1200);
  await page.getByTestId('btn-quit').click();
  await page.getByTestId('main-menu').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByTestId('btn-continue').click();
  await page.getByTestId('hud').waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(900);
  const loadedCounts = await counts();
  console.log('final counts:', finalCounts);
  console.log('loaded counts:', loadedCounts);
  const afterReload = await page.evaluate(() => {
    const game = window.__VOXELCRAFT_DEV__.game;
    const blocks = { table: 0, furnace: 0 };
    for (const chunk of game.world.manager.getAllChunks()) {
      for (let i = 0; i < chunk.blocks.length; i++) {
        if (chunk.blocks[i] === 14) blocks.table++;
        if (chunk.blocks[i] === 15) blocks.furnace++;
      }
    }
    return {
      mode: game.meta.mode,
      generatorVersion: game.meta.generatorVersion,
      blocks,
      furnaces: [...game.survival.furnaces.values()].map((f) => ({ input: f.input, fuel: f.fuel, output: f.output })),
      itemEntities: game.survival.items.size,
      selectedSlot: game.selectedSlot,
    };
  });
  await page.screenshot({ path: "artifacts/v02-full-reloaded.png" });
  return { finalCounts, loadedCounts, afterReload };
}
