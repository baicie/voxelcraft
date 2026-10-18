import { describe, expect, it } from 'vitest';
import {
  BLOCK_DEFS,
  BlockFace,
  BlockId,
  HOTBAR_BLOCKS,
  getFaceTexture,
  isLiquidBlock,
  isOpaqueBlock,
  isSolidBlock,
} from '../../src/world/BlockRegistry';

describe('block registry', () => {
  it('defines all required blocks with six face textures', () => {
    for (const id of [
      BlockId.Grass,
      BlockId.Dirt,
      BlockId.Stone,
      BlockId.Sand,
      BlockId.Log,
      BlockId.Leaves,
      BlockId.Water,
      BlockId.Bedrock,
    ]) {
      const definition = BLOCK_DEFS[id];
      expect(definition.faces).toHaveLength(6);
      for (const texture of definition.faces) expect(texture.length).toBeGreaterThan(0);
    }
  });

  it('uses different top and side textures for grass and logs', () => {
    expect(getFaceTexture(BlockId.Grass, BlockFace.Top)).toBe('grass_top');
    expect(getFaceTexture(BlockId.Grass, BlockFace.East)).toBe('grass_side');
    expect(getFaceTexture(BlockId.Log, BlockFace.Top)).toBe('log_top');
    expect(getFaceTexture(BlockId.Log, BlockFace.North)).toBe('log_side');
  });

  it('encodes gameplay properties correctly', () => {
    expect(isLiquidBlock(BlockId.Water)).toBe(true);
    expect(isSolidBlock(BlockId.Water)).toBe(false);
    expect(isSolidBlock(BlockId.Leaves)).toBe(true);
    expect(isOpaqueBlock(BlockId.Leaves)).toBe(false);
    expect(isOpaqueBlock(BlockId.Glass)).toBe(false);
    expect(BLOCK_DEFS[BlockId.Bedrock].breakable).toBe(false);
  });

  it('exposes exactly nine hotbar blocks with no air or liquids', () => {
    expect(HOTBAR_BLOCKS).toHaveLength(9);
    expect(new Set(HOTBAR_BLOCKS).size).toBe(9);
    for (const block of HOTBAR_BLOCKS) {
      expect(block).not.toBe(BlockId.Air);
      expect(block).not.toBe(BlockId.Water);
      expect(BLOCK_DEFS[block].breakable).toBe(true);
    }
  });
});
