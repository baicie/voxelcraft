import { describe, expect, it } from 'vitest';
import { ContainerSession } from '../../src/inventory/ContainerSession';
import { Inventory } from '../../src/inventory/Inventory';
import { createItemStack, type ItemStack } from '../../src/items/ItemStack';
import { FurnaceStore } from '../../src/furnace/FurnaceStore';

function stack(itemId: string, count: number): ItemStack {
  return createItemStack(itemId, count)!;
}

function inventoryWith(slots: Array<ItemStack | null>): Inventory {
  const inventory = Inventory.empty('player');
  const full = Array.from({ length: 36 }, (_, index) => slots[index] ?? null);
  inventory.replaceSlots(full);
  return inventory;
}

describe('ContainerSession', () => {
  it('takes, splits, merges and swaps cursor stacks', () => {
    const inventory = inventoryWith([stack('base:oak_log', 8), stack('base:dirt', 4)]);
    const session = new ContainerSession({ kind: 'inventory', inventory, selectedSlot: 0 });

    session.clickInventory(0, 0, false);
    expect(session.view().cursor?.count).toBe(8);
    session.clickInventory(2, 0, false);
    expect(session.view().slots[2]?.count).toBe(8);
    expect(session.view().cursor).toBeNull();

    session.clickInventory(2, 2, false);
    expect(session.view().cursor?.count).toBe(4);
    expect(session.view().slots[2]?.count).toBe(4);

    session.clickInventory(1, 0, false);
    expect(session.view().cursor?.itemId).toBe('base:dirt');
    expect(session.view().slots[1]?.itemId).toBe('base:oak_log');
    expect(session.view().slots[1]?.count).toBe(4);
  });

  it('crafts planks through the 2×2 grid and returns the output', () => {
    const inventory = inventoryWith([stack('base:oak_log', 1)]);
    const session = new ContainerSession({ kind: 'inventory', inventory, selectedSlot: 0 });
    session.clickInventory(0, 0, false);
    session.clickCraftGrid(0, 0, false);
    expect(session.view().output?.itemId).toBe('base:oak_planks');
    session.takeCraftOutput(false);
    expect(session.view().slots[0]?.itemId).toBe('base:oak_planks');
    expect(session.view().slots[0]?.count).toBe(4);
    expect(session.view().grid[0]).toBeNull();
  });

  it('returns crafting grid and cursor contents on close', () => {
    const inventory = inventoryWith([stack('base:oak_planks', 4)]);
    const session = new ContainerSession({ kind: 'inventory', inventory, selectedSlot: 0 });
    session.clickInventory(0, 0, false);
    session.clickCraftGrid(0, 2, false);
    session.clickCraftGrid(1, 2, false);
    session.clickCraftGrid(2, 2, false);
    session.clickCraftGrid(3, 2, false);
    expect(session.view().cursor).toBeNull();
    expect(session.view().output?.itemId).toBe('base:crafting_table');
    session.takeCraftOutput(true);
    const leftovers = session.close();
    expect(leftovers).toEqual([]);
    let count = 0;
    for (const entry of inventory.slots) count += entry?.count ?? 0;
    expect(count).toBe(1);
  });

  it('supports furnace input/fuel/output interactions', () => {
    const inventory = inventoryWith([stack('base:raw_iron', 2), stack('base:coal', 1)]);
    const furnaces = new FurnaceStore();
    const session = new ContainerSession({
      kind: 'furnace',
      inventory,
      furnaces,
      furnacePos: { x: 0, y: 0, z: 0 },
      selectedSlot: 0,
    });
    session.clickInventory(0, 0, false);
    session.clickFurnaceSlot('input', 0, false);
    session.clickInventory(1, 0, false);
    session.clickFurnaceSlot('fuel', 0, false);
    const view = session.view();
    expect(view.furnace?.input?.count).toBe(2);
    expect(view.furnace?.fuel?.count).toBe(1);
    expect(view.cursor).toBeNull();

    const state = furnaces.get(0, 0, 0)!;
    state.output = stack('base:iron_ingot', 1);
    const outputView = session.view();
    expect(outputView.furnace?.output?.count).toBe(1);
    session.clickFurnaceSlot('output', 0, false);
    expect(session.view().cursor?.itemId).toBe('base:iron_ingot');
  });

  it('shift-moves inventory stacks between hotbar and main inventory', () => {
    const inventory = inventoryWith([stack('base:oak_log', 9)]);
    const session = new ContainerSession({ kind: 'inventory', inventory, selectedSlot: 0 });
    session.clickInventory(0, 0, true);
    expect(session.view().slots[0]).toBeNull();
    expect(session.view().slots[9]?.count).toBe(9);
    session.clickInventory(9, 0, true);
    expect(session.view().slots[9]).toBeNull();
    expect(session.view().slots[0]?.count).toBe(9);
  });

  it('does not delete furnace contents when shift-clicking into a full inventory', () => {
    const inventory = Inventory.empty('player');
    inventory.replaceSlots(Array.from({ length: 36 }, () => stack('base:dirt', 64)));
    const furnaces = new FurnaceStore();
    const session = new ContainerSession({
      kind: 'furnace',
      inventory,
      furnaces,
      furnacePos: { x: 0, y: 0, z: 0 },
      selectedSlot: 0,
    });
    const state = furnaces.get(0, 0, 0)!;
    state.input = stack('base:raw_iron', 3);
    session.clickFurnaceSlot('input', 0, true);
    expect(furnaces.get(0, 0, 0)?.input?.count).toBe(3);
  });
});
