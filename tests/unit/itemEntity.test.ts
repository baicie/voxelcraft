import { describe, expect, it } from 'vitest';
import { ItemEntityWorld } from '../../src/entities/ItemEntityWorld';
import { Inventory } from '../../src/inventory/Inventory';
import { createItemStack, type ItemStack } from '../../src/items/ItemStack';

import { BlockId } from '../../src/world/BlockRegistry';

const airWorld = {
  isSolidAt: () => false,
  getBlock: () => BlockId.Air,
};

function stack(itemId: string, count: number): ItemStack {
  return createItemStack(itemId, count)!;
}

function emptyInventory(): Inventory {
  return Inventory.empty('player');
}

describe('ItemEntityWorld', () => {
  it('merges identical drops and splits oversized stacks', () => {
    const items = new ItemEntityWorld();
    items.spawn(stack('base:oak_log', 2), 0.5, 10, 0.5, 1);
    items.spawn(stack('base:oak_log', 2), 0.5, 10, 0.5, 1);
    const merged = items.getAll();
    expect(merged).toHaveLength(1);
    expect(merged[0]?.stack.count).toBe(4);

    items.spawn(stack('base:cobblestone', 70), 2, 10, 2, 1);
    // createItemStack clamps a stack to its 64-item maximum.
    expect(items.size).toBe(2);
    expect(items.getAll().map((entity) => entity.stack.count).sort((a, b) => b - a)).toEqual([64, 4]);
  });

  it('picks up after the delay and respects the attraction radius', () => {
    const items = new ItemEntityWorld();
    const inventory = emptyInventory();
    const entity = items.spawn(stack('base:oak_log', 3), 0.5, 10, 0.5, 1)!;
    entity.pickupDelaySeconds = 0.5;

    expect(items.update(0.2, airWorld, { x: 0.5, y: 9.2, z: 0.5 }, inventory)).toBe(0);
    for (let i = 0; i < 20; i++) {
      items.update(0.1, airWorld, { x: entity.x, y: entity.y - 0.8, z: entity.z }, inventory);
    }
    expect(inventory.get(0)?.itemId).toBe('base:oak_log');
    expect(inventory.get(0)?.count).toBe(3);
    expect(items.size).toBe(0);
  });

  it('leaves the remainder on the ground when the inventory is full', () => {
    const items = new ItemEntityWorld();
    const inventory = emptyInventory();
    const full = Array.from({ length: 36 }, () => stack('base:dirt', 64));
    full[0] = stack('base:oak_log', 63);
    inventory.replaceSlots(full);
    const entity = items.spawn(stack('base:oak_log', 5), 0.5, 10, 0.5, 1)!;
    entity.pickupDelaySeconds = 0;
    for (let i = 0; i < 10; i++) {
      items.update(0.1, airWorld, { x: 0.5, y: 9.2, z: 0.5 }, inventory);
    }
    expect(inventory.get(0)?.count).toBe(64);
    const remaining = items.getAll()[0];
    expect(remaining?.stack.count).toBe(4);
    expect(items.size).toBe(1);
  });

  it('does not pick up without an inventory', () => {
    const items = new ItemEntityWorld();
    const entity = items.spawn(stack('base:oak_log', 1), 0.5, 10, 0.5, 1)!;
    entity.pickupDelaySeconds = 0;
    items.update(0.2, airWorld, { x: 0.5, y: 9.2, z: 0.5 }, null);
    expect(items.size).toBe(1);
  });

  it('round-trips through the entity save format', () => {
    const items = new ItemEntityWorld();
    items.spawn(stack('base:raw_iron', 2), 1.5, 12, -3, 7);
    const saves = items.toSave();
    const restored = ItemEntityWorld.fromSave(saves);
    expect(restored.size).toBe(1);
    expect(restored.getAll()[0]?.stack.itemId).toBe('base:raw_iron');
    expect(restored.getAll()[0]?.stack.count).toBe(2);
    expect(restored.toSave()[0]?.x).toBeCloseTo(saves[0]!.x);
  });
});
