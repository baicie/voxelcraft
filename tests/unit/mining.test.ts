import { describe, expect, it } from 'vitest';
import { getBlockDrops } from '../../src/mining/LootTable';
import {
  MiningSession,
  canHarvestBlock,
  effectiveMiningSpeed,
  miningProgressPerSecond,
} from '../../src/mining/MiningRules';
import { BlockId, getBlockDefinition } from '../../src/world/BlockRegistry';
import { createItemStack } from '../../src/items/ItemStack';

function tool(itemId: string) {
  return createItemStack(itemId, 1)!;
}

const context = { x: 1, y: 2, z: 3, sequence: 1, seed: 42 };

describe('mining and loot rules', () => {
  it('requires a pickaxe for stone/coal and a stone pickaxe for iron', () => {
    expect(canHarvestBlock(getBlockDefinition(BlockId.Stone), null)).toBe(false);
    expect(canHarvestBlock(getBlockDefinition(BlockId.Stone), tool('base:wooden_pickaxe'))).toBe(true);
    expect(canHarvestBlock(getBlockDefinition(BlockId.CoalOre), tool('base:wooden_pickaxe'))).toBe(true);
    expect(canHarvestBlock(getBlockDefinition(BlockId.IronOre), tool('base:wooden_pickaxe'))).toBe(false);
    expect(canHarvestBlock(getBlockDefinition(BlockId.IronOre), tool('base:stone_pickaxe'))).toBe(true);
    expect(canHarvestBlock(getBlockDefinition(BlockId.Bedrock), tool('base:iron_pickaxe'))).toBe(false);
  });

  it('produces the expected progression drops', () => {
    expect(getBlockDrops(BlockId.Stone, null, context)).toEqual([]);
    expect(getBlockDrops(BlockId.Stone, tool('base:wooden_pickaxe'), context)[0]?.itemId).toBe('base:cobblestone');
    expect(getBlockDrops(BlockId.Log, null, context)[0]?.itemId).toBe('base:oak_log');
    expect(getBlockDrops(BlockId.IronOre, tool('base:stone_pickaxe'), context)[0]?.itemId).toBe('base:raw_iron');
    expect(getBlockDrops(BlockId.CoalOre, tool('base:wooden_pickaxe'), context)[0]?.itemId).toBe('base:coal');
    expect(getBlockDrops(BlockId.Bedrock, tool('base:iron_pickaxe'), context)).toEqual([]);
  });

  it('uses tool speed tiers and falls back to hand speed', () => {
    const stone = getBlockDefinition(BlockId.Stone);
    expect(effectiveMiningSpeed(stone, null)).toBe(1);
    expect(effectiveMiningSpeed(stone, tool('base:wooden_pickaxe'))).toBe(2);
    expect(effectiveMiningSpeed(stone, tool('base:stone_pickaxe'))).toBe(4);
    expect(effectiveMiningSpeed(stone, tool('base:iron_pickaxe'))).toBe(6);
    expect(miningProgressPerSecond(BlockId.Stone, tool('base:iron_pickaxe'), false)).toBeGreaterThan(
      miningProgressPerSecond(BlockId.Stone, null, false),
    );
  });

  it('completes instant mining in creative and resets when the target changes', () => {
    const session = new MiningSession();
    const first = session.tick(0.1, { x: 0, y: 0, z: 0, block: BlockId.Stone }, null, true);
    expect(first.completed).toBe(true);
    expect(first.progress).toBe(1);

    const a = session.tick(0.1, { x: 0, y: 0, z: 0, block: BlockId.Stone }, tool('base:stone_pickaxe'), false);
    expect(a.completed).toBe(false);
    expect(a.progress).toBeGreaterThan(0);
    const b = session.tick(0.1, { x: 1, y: 0, z: 0, block: BlockId.Stone }, tool('base:stone_pickaxe'), false);
    expect(b.progress).toBeCloseTo(a.progress, 5);
  });

  it('resets progress when the held tool changes', () => {
    const session = new MiningSession();
    const target = { x: 0, y: 0, z: 0, block: BlockId.Stone };
    const a = session.tick(0.4, target, tool('base:stone_pickaxe'), false);
    expect(a.progress).toBeGreaterThan(0.5);
    const b = session.tick(0.01, target, tool('base:iron_pickaxe'), false);
    expect(b.progress).toBeLessThan(0.2);
  });
});
