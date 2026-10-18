import { describe, expect, it } from 'vitest';
import { Inventory } from '../../src/inventory/Inventory';
import { InventoryService } from '../../src/inventory/InventoryService';
import { createItemStack, type ItemStack } from '../../src/items/ItemStack';

const service = new InventoryService();

function stack(itemId: string, count: number, durability?: number): ItemStack {
  return createItemStack(itemId, count, durability)!;
}

describe('InventoryService', () => {
  it('merges stacks and reports remains (60 + 8 → 64 + 4)', () => {
    const inventory = Inventory.empty('test');
    service.insert(inventory, stack('base:oak_log', 60));
    const result = service.insert(inventory, stack('base:oak_log', 8));

    expect(result.accepted).toBe(8);
    expect(result.remainder).toBe(0);
    expect(service.countItem(inventory, 'base:oak_log')).toBe(68);
    expect(inventory.get(0)?.count).toBe(64);
    expect(inventory.get(1)?.count).toBe(4);
  });

  it('does not stack tools or different durability', () => {
    const inventory = Inventory.empty('test');
    service.insert(inventory, stack('base:stone_pickaxe', 1, 100));
    service.insert(inventory, stack('base:stone_pickaxe', 1, 99));
    expect(inventory.get(0)?.itemId).toBe('base:stone_pickaxe');
    expect(inventory.get(1)?.durability).toBe(99);
  });

  it('moves, swaps and quick-moves without duplication', () => {
    const inventory = Inventory.empty('test');
    inventory.replaceSlots([
      stack('base:oak_log', 10),
      stack('base:dirt', 3),
      ...Array.from({ length: 34 }, () => null),
    ]);
    const first = service.move(inventory, 0, inventory, 2);
    expect(first.ok).toBe(true);
    expect(inventory.get(0)).toBeNull();
    expect(inventory.get(2)?.count).toBe(10);

    const swap = service.swap(inventory, 1, inventory, 2);
    expect(swap.ok).toBe(true);
    expect(inventory.get(1)?.itemId).toBe('base:oak_log');
    expect(inventory.get(2)?.itemId).toBe('base:dirt');

    const quick = service.quickMove(inventory, 1, 9, 36);
    expect(quick.ok).toBe(true);
    expect(service.countItem(inventory, 'base:oak_log')).toBe(10);
  });

  it('rejects incompatible partial moves without changing state', () => {
    const inventory = Inventory.empty('test');
    inventory.replaceSlots([
      stack('base:oak_log', 5),
      stack('base:cobblestone', 3),
      ...Array.from({ length: 34 }, () => null),
    ]);
    const before = inventory.snapshot();
    const result = service.move(inventory, 0, inventory, 1, 2);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('incompatible');
    expect(inventory.snapshot()).toEqual(before);
  });

  it('handles full inventory and partial pickup capacity', () => {
    const inventory = Inventory.empty('test');
    inventory.replaceSlots(Array.from({ length: 36 }, () => stack('base:dirt', 64)));
    const result = service.insert(inventory, stack('base:oak_log', 5));
    expect(result.accepted).toBe(0);
    expect(result.remainder).toBe(5);
    expect(service.countItem(inventory, 'base:oak_log')).toBe(0);
    expect(service.countItem(inventory, 'base:dirt')).toBe(36 * 64);
  });

  it('extracts full/half and places one item at a time', () => {
    const inventory = Inventory.empty('test');
    inventory.replaceSlots([
      stack('base:oak_log', 7),
      ...Array.from({ length: 35 }, () => null),
    ]);
    const half = service.extractHalf(inventory, 0);
    expect(half?.count).toBe(4);
    expect(inventory.get(0)?.count).toBe(3);

    const leftover = service.placeIntoSlot(inventory, 1, stack('base:oak_log', 5), 1);
    expect(leftover?.count).toBe(4);
    expect(inventory.get(1)?.count).toBe(1);
    expect(service.countItem(inventory, 'base:oak_log')).toBe(4);
  });

  it('keeps total quantities conserved over a sequence of moves', () => {
    const inventory = Inventory.empty('test');
    inventory.replaceSlots([
      stack('base:oak_log', 20),
      stack('base:dirt', 11),
      ...Array.from({ length: 34 }, () => null),
    ]);
    const initial = service.totalItems(inventory);
    service.move(inventory, 0, inventory, 5, 7);
    service.move(inventory, 1, inventory, 5, 3);
    service.move(inventory, 0, inventory, 6, 2);
    expect(service.totalItems(inventory)).toBe(initial);
    expect(service.countItem(inventory, 'base:oak_log')).toBe(20);
    expect(service.countItem(inventory, 'base:dirt')).toBe(11);
  });

  it('round-trips snapshots and bumps revision only on commit', () => {
    const inventory = Inventory.empty('snapshot');
    const initialRevision = inventory.revision;
    service.insert(inventory, stack('base:oak_planks', 2));
    expect(inventory.revision).toBeGreaterThan(initialRevision);
    const snapshot = inventory.snapshot();
    const restored = Inventory.fromSnapshot(snapshot);
    expect(restored.snapshot()).toEqual(snapshot);
  });
});
