import { describe, expect, it } from 'vitest';
import {
  BlockId,
  V1_BLOCK_ID_TO_STABLE,
  blockIdFromStableId,
  getBlockStableId,
} from '../../src/world/BlockRegistry';
import {
  ITEM_DEFS,
  getBlockItemId,
  getItemDefinition,
  getPlaceBlockId,
  isKnownItemId,
} from '../../src/items/ItemRegistry';
import { createItemStack, decrementDurability, stacksEqual } from '../../src/items/ItemStack';

describe('stable block IDs', () => {
  it('round-trips V0.1 numeric IDs through explicit stable IDs', () => {
    for (const [numericText, stableId] of Object.entries(V1_BLOCK_ID_TO_STABLE)) {
      const numeric = Number(numericText) as BlockId;
      expect(getBlockStableId(numeric)).toBe(stableId);
      expect(blockIdFromStableId(stableId)).toBe(numeric);
    }
    expect(blockIdFromStableId('base:not_a_block')).toBeNull();
  });

  it('uses namespaced stable IDs and keeps item/block spaces distinct', () => {
    expect(getBlockStableId(BlockId.Log)).toBe('base:oak_log');
    expect(getBlockStableId(BlockId.IronOre)).toBe('base:iron_ore');
    expect(getBlockItemId(BlockId.Log)).toBe('base:oak_log');
    expect(getPlaceBlockId('base:oak_log')).toBe(BlockId.Log);
    expect(getPlaceBlockId('base:stick')).toBeUndefined();
    expect(isKnownItemId('base:iron_pickaxe')).toBe(true);
  });
});

describe('item definitions', () => {
  it('defines all closure items with expected stacking', () => {
    const required = [
      'base:oak_log',
      'base:oak_planks',
      'base:stick',
      'base:crafting_table',
      'base:wooden_pickaxe',
      'base:stone_pickaxe',
      'base:furnace',
      'base:coal',
      'base:raw_iron',
      'base:iron_ingot',
      'base:iron_pickaxe',
    ];
    for (const id of required) expect(getItemDefinition(id)).toBeDefined();
    expect(getItemDefinition('base:wooden_pickaxe')?.maxStack).toBe(1);
    expect(getItemDefinition('base:oak_log')?.maxStack).toBe(64);
    expect(ITEM_DEFS['base:iron_pickaxe']?.tool).toMatchObject({ kind: 'pickaxe', tier: 3 });
    expect(ITEM_DEFS['base:coal']?.fuelTicks).toBeGreaterThan(0);
  });

  it('does not allow invalid stacks or invalid durability metadata', () => {
    expect(createItemStack('base:oak_log', 65)?.count).toBe(64);
    expect(createItemStack('base:oak_log', 0)).toBeNull();
    expect(createItemStack('missing:item', 1)).toBeNull();
    expect(createItemStack('base:iron_pickaxe', 1, 0)).toBeNull();
    expect(createItemStack('base:oak_log', 1, 5)).toBeNull();
  });

  it('decrements tool durability and breaks at zero', () => {
    const pick = createItemStack('base:wooden_pickaxe', 1, 2)!;
    const once = decrementDurability(pick);
    expect(once.broke).toBe(false);
    expect(once.stack?.durability).toBe(1);
    const twice = decrementDurability(once.stack!);
    expect(twice.broke).toBe(true);
    expect(twice.stack).toBeNull();
  });

  it('compares metadata for merge compatibility', () => {
    const a = createItemStack('base:iron_pickaxe', 1, 10)!;
    const b = createItemStack('base:iron_pickaxe', 1, 10)!;
    const c = createItemStack('base:iron_pickaxe', 1, 11)!;
    expect(stacksEqual(a, b)).toBe(true);
    expect(stacksEqual(a, c)).toBe(false);
  });
});
