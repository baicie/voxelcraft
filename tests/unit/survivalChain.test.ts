import { describe, expect, it } from 'vitest';
import { craftingService } from '../../src/crafting/CraftingService';
import type { CraftStation } from '../../src/crafting/RecipeRegistry';
import { FurnaceStore } from '../../src/furnace/FurnaceStore';
import { Inventory } from '../../src/inventory/Inventory';
import { inventoryService } from '../../src/inventory/InventoryService';
import { createItemStack, type ItemStack } from '../../src/items/ItemStack';
import { getBlockDrops } from '../../src/mining/LootTable';
import { BlockId } from '../../src/world/BlockRegistry';

function stack(itemId: string, count = 1): ItemStack {
  return createItemStack(itemId, count)!;
}

function take(inventory: Inventory, itemId: string, count: number): ItemStack {
  const slot = inventory.slots.findIndex((entry) => entry?.itemId === itemId);
  expect(slot, `missing ${itemId}`).toBeGreaterThanOrEqual(0);
  const extracted = inventoryService.extract(inventory, slot, count);
  expect(extracted?.count, `could not extract ${count} ${itemId}`).toBe(count);
  return extracted!;
}

function craftAt(
  inventory: Inventory,
  station: CraftStation,
  size: 4 | 9,
  layout: Array<ItemStack | null>,
): ItemStack {
  const grid = Inventory.empty('test-grid', size);
  grid.replaceSlots(Array.from({ length: size }, (_, index) => layout[index] ?? null));
  const result = craftingService.craft(grid, inventory, station, 1);
  expect(result.crafted, `recipe failed on ${station} grid`).toBe(1);
  return result.output!;
}

describe('survival chain integration', () => {
  it('runs log → table → wooden pick → stone pick/furnace → iron ingot → iron pick', () => {
    const inventory = Inventory.empty('player');
    inventory.replaceSlots([stack('base:oak_log', 4), ...Array.from({ length: 35 }, () => null)]);

    // 4 logs → 16 planks.
    for (let index = 0; index < 4; index++) {
      const log = take(inventory, 'base:oak_log', 1);
      craftAt(inventory, 'inventory', 4, [log]);
    }
    expect(inventoryService.countItem(inventory, 'base:oak_planks')).toBe(16);

    // 2 planks → 4 sticks.
    const stickPlanks = [take(inventory, 'base:oak_planks', 1), take(inventory, 'base:oak_planks', 1)];
    craftAt(inventory, 'inventory', 4, [stickPlanks[0]!, null, stickPlanks[1]!, null]);
    expect(inventoryService.countItem(inventory, 'base:stick')).toBe(4);

    // 4 planks → crafting table.
    const tablePlanks = [0, 1, 2, 3].map(() => take(inventory, 'base:oak_planks', 1));
    craftAt(inventory, 'inventory', 4, tablePlanks);
    expect(inventoryService.countItem(inventory, 'base:crafting_table')).toBe(1);

    // 3 planks + 2 sticks → wooden pickaxe.
    const pickPlanks = [0, 1, 2].map(() => take(inventory, 'base:oak_planks', 1));
    const pickSticks = [0, 1].map(() => take(inventory, 'base:stick', 1));
    craftAt(inventory, 'crafting_table', 9, [
      pickPlanks[0]!,
      pickPlanks[1]!,
      pickPlanks[2]!,
      null,
      pickSticks[0]!,
      null,
      null,
      pickSticks[1]!,
      null,
    ]);
    expect(inventoryService.countItem(inventory, 'base:wooden_pickaxe')).toBe(1);
    const woodPick = inventory.slots.find((entry) => entry?.itemId === 'base:wooden_pickaxe')!;

    // Mine 11 stone with the wooden pickaxe through the real loot table.
    for (let index = 0; index < 11; index++) {
      const drops = getBlockDrops(BlockId.Stone, woodPick, { x: index, y: 20, z: 0, sequence: index, seed: 42 });
      for (const drop of drops) inventoryService.insert(inventory, drop);
    }
    expect(inventoryService.countItem(inventory, 'base:cobblestone')).toBe(11);

    // 3 cobblestone + 2 sticks → stone pickaxe.
    const stonePickCobble = [0, 1, 2].map(() => take(inventory, 'base:cobblestone', 1));
    const stonePickSticks = [0, 1].map(() => take(inventory, 'base:stick', 1));
    craftAt(inventory, 'crafting_table', 9, [
      stonePickCobble[0]!,
      stonePickCobble[1]!,
      stonePickCobble[2]!,
      null,
      stonePickSticks[0]!,
      null,
      null,
      stonePickSticks[1]!,
      null,
    ]);
    const stonePick = inventory.slots.find((entry) => entry?.itemId === 'base:stone_pickaxe')!;
    expect(stonePick).toBeTruthy();
    // 8 cobblestone ring → furnace.
    const furnaceCobble = Array.from({ length: 8 }, () => take(inventory, 'base:cobblestone', 1));
    craftAt(inventory, 'crafting_table', 9, [
      furnaceCobble[0]!,
      furnaceCobble[1]!,
      furnaceCobble[2]!,
      furnaceCobble[3]!,
      null,
      furnaceCobble[4]!,
      furnaceCobble[5]!,
      furnaceCobble[6]!,
      furnaceCobble[7]!,
    ]);
    expect(inventoryService.countItem(inventory, 'base:furnace')).toBe(1);

    // 3 iron ore + 2 coal using the stone pickaxe.
    for (let index = 0; index < 3; index++) {
      for (const drop of getBlockDrops(BlockId.IronOre, stonePick, { x: index, y: 20, z: 0, sequence: index, seed: 7 })) {
        inventoryService.insert(inventory, drop);
      }
    }
    for (let index = 0; index < 2; index++) {
      for (const drop of getBlockDrops(BlockId.CoalOre, stonePick, { x: index, y: 20, z: 0, sequence: index, seed: 9 })) {
        inventoryService.insert(inventory, drop);
      }
    }
    expect(inventoryService.countItem(inventory, 'base:raw_iron')).toBe(3);

    // Smelt 3 ingots with coal.
    const furnace = new FurnaceStore();
    const state = furnace.getOrCreate(0, 0, 0);
    state.input = take(inventory, 'base:raw_iron', 3);
    state.fuel = take(inventory, 'base:coal', 1);
    furnace.tick(1850);
    const ingots = furnace.takeSlot(0, 0, 0, 'output', 3)!;
    inventoryService.insert(inventory, ingots);
    expect(inventoryService.countItem(inventory, 'base:iron_ingot')).toBe(3);

    // Extra sticks for the iron pickaxe, then 3 ingots + 2 sticks.
    const stickPlanks2 = [take(inventory, 'base:oak_planks', 1), take(inventory, 'base:oak_planks', 1)];
    craftAt(inventory, 'inventory', 4, [stickPlanks2[0]!, null, stickPlanks2[1]!, null]);
    const ironSticks = [0, 1].map(() => take(inventory, 'base:stick', 1));
    const ingotStacks = [0, 1, 2].map(() => take(inventory, 'base:iron_ingot', 1));
    craftAt(inventory, 'crafting_table', 9, [
      ingotStacks[0]!,
      ingotStacks[1]!,
      ingotStacks[2]!,
      null,
      ironSticks[0]!,
      null,
      null,
      ironSticks[1]!,
      null,
    ]);

    expect(inventoryService.countItem(inventory, 'base:iron_pickaxe')).toBe(1);
    expect(inventoryService.countItem(inventory, 'base:raw_iron')).toBe(0);
  });
});
