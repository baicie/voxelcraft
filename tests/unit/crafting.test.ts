import { describe, expect, it } from 'vitest';
import { CraftingService } from '../../src/crafting/CraftingService';
import { matchRecipe } from '../../src/crafting/RecipeMatcher';
import { RECIPES } from '../../src/crafting/RecipeRegistry';
import { Inventory } from '../../src/inventory/Inventory';
import { inventoryService } from '../../src/inventory/InventoryService';
import { createItemStack, type ItemStack } from '../../src/items/ItemStack';

const service = new CraftingService();

function stack(itemId: string, count = 1): ItemStack {
  return createItemStack(itemId, count)!;
}

function grid(size: 2 | 3, items: Array<string | null>): Inventory {
  const slots = items.map((item) => (item ? stack(item) : null));
  return new Inventory(`grid-${size}`, slots, 0, size * size);
}

function inventoryWith(items: Array<[string, number]>): Inventory {
  const inventory = Inventory.empty('player');
  const slots: Array<ItemStack | null> = Array.from({ length: 36 }, () => null);
  items.forEach(([itemId, count], index) => {
    slots[index] = stack(itemId, count);
  });
  inventory.replaceSlots(slots);
  return inventory;
}

describe('RecipeMatcher', () => {
  const planks = stack('base:oak_planks');

  it('matches shapeless planks with a partial log stack', () => {
    const result = matchRecipe(RECIPES, [stack('base:oak_log', 5), null, null, null], 2, 'inventory');
    expect(result?.recipe.id).toBe('oak_planks');
  });

  it('matches shaped recipes after trimming blank margins', () => {
    const result = matchRecipe(
      RECIPES,
      [null, null, null, null, planks, null, null, planks, null],
      3,
      'crafting_table',
    );
    expect(result?.recipe.id).toBe('stick');
  });

  it('does not match an incorrect pattern or wrong station', () => {
    const wrong = matchRecipe(
      RECIPES,
      [planks, planks, null, planks, null, null, null, null, null],
      3,
      'crafting_table',
    );
    expect(wrong).toBeNull();
    const tableOnly = matchRecipe(
      RECIPES,
      [planks, planks, planks, null, stack('base:stick'), null, null, stack('base:stick'), null],
      3,
      'inventory',
    );
    expect(tableOnly).toBeNull();
  });
});

describe('CraftingService', () => {
  it('crafts planks and consumes exactly one log', () => {
    const gridInv = grid(2, ['base:oak_log', null, null, null]);
    gridInv.replaceSlots([stack('base:oak_log', 3), null, null, null]);
    const inventory = inventoryWith([]);
    const result = service.craft(gridInv, inventory, 'inventory', 1);

    expect(result.crafted).toBe(1);
    expect(gridInv.get(0)?.count).toBe(2);
    expect(service.findRecipe(gridInv, 'inventory')?.recipe.id).toBe('oak_planks');
    expect(inventoryService.countItem(inventory, 'base:oak_planks')).toBe(4);
  });

  it('crafts sticks from a 2×2 vertical planks pattern', () => {
    const gridInv = grid(2, ['base:oak_planks', null, 'base:oak_planks', null]);
    const inventory = inventoryWith([]);
    const result = service.craft(gridInv, inventory, 'inventory', 1);
    expect(result.crafted).toBe(1);
    expect(result.output?.itemId).toBe('base:stick');
    expect(gridInv.get(0)).toBeNull();
    expect(gridInv.get(2)).toBeNull();
    expect(inventoryService.countItem(inventory, 'base:stick')).toBe(4);
  });

  it('crafts a crafting table, wooden and stone pickaxes, and a furnace', () => {
    const tableGrid = grid(2, ['base:oak_planks', 'base:oak_planks', 'base:oak_planks', 'base:oak_planks']);
    const tableInv = inventoryWith([]);
    expect(service.craft(tableGrid, tableInv, 'inventory', 1).crafted).toBe(1);
    expect(tableInv.get(0)?.itemId).toBe('base:crafting_table');

    const woodenGrid = grid(3, [
      'base:oak_planks',
      'base:oak_planks',
      'base:oak_planks',
      null,
      'base:stick',
      null,
      null,
      'base:stick',
      null,
    ]);
    const woodenInv = inventoryWith([]);
    expect(service.craft(woodenGrid, woodenInv, 'crafting_table', 1).crafted).toBe(1);
    expect(service.findRecipe(woodenGrid, 'crafting_table')).toBeNull();
    expect(woodenInv.get(0)?.itemId).toBe('base:wooden_pickaxe');

    const stoneGrid = grid(3, [
      'base:cobblestone',
      'base:cobblestone',
      'base:cobblestone',
      null,
      'base:stick',
      null,
      null,
      'base:stick',
      null,
    ]);
    const stoneInv = inventoryWith([]);
    expect(service.craft(stoneGrid, stoneInv, 'crafting_table', 1).crafted).toBe(1);

    const furnaceGrid = grid(3, [
      'base:cobblestone',
      'base:cobblestone',
      'base:cobblestone',
      'base:cobblestone',
      null,
      'base:cobblestone',
      'base:cobblestone',
      'base:cobblestone',
      'base:cobblestone',
    ]);
    const furnaceInv = inventoryWith([]);
    expect(service.craft(furnaceGrid, furnaceInv, 'crafting_table', 1).crafted).toBe(1);
    expect(furnaceInv.get(0)?.itemId).toBe('base:furnace');
  });

  it('batch crafts up to available output capacity without duplication', () => {
    const gridInv = grid(2, ['base:oak_log', 'base:oak_log', null, null]);
    const inventory = inventoryWith([]);
    const result = service.craft(gridInv, inventory, 'inventory', 10);
    expect(result.crafted).toBe(2);
    expect(inventory.get(0)?.itemId).toBe('base:oak_planks');
    expect(inventory.get(0)?.count).toBe(8);
    expect(inventoryService.countItem(inventory, 'base:oak_log')).toBe(0);
    expect(gridInv.get(0)).toBeNull();
    expect(gridInv.get(1)).toBeNull();
  });

  it('returns crafting grid contents on close', () => {
    const gridInv = grid(2, ['base:oak_log', null, null, 'base:stick']);
    const inventory = inventoryWith([]);
    const leftovers = service.returnGridToInventory(gridInv, inventory);
    expect(leftovers).toEqual([]);
    expect(service.findRecipe(gridInv, 'inventory')).toBeNull();
    expect(inventory.slots.filter(Boolean)).toHaveLength(2);
  });
});
