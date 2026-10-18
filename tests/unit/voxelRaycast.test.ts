import { describe, expect, it } from 'vitest';
import { BlockId } from '../../src/world/BlockRegistry';
import { raycastVoxels, type RaycastWorld } from '../../src/world/VoxelRaycast';

class MapWorld implements RaycastWorld {
  private readonly blocks = new Map<string, BlockId>();

  set(x: number, y: number, z: number, block: BlockId): void {
    this.blocks.set(`${x},${y},${z}`, block);
  }

  getBlock(x: number, y: number, z: number): BlockId {
    return this.blocks.get(`${x},${y},${z}`) ?? BlockId.Air;
  }
}

describe('raycastVoxels', () => {
  it('finds a block and reports the entry face normal', () => {
    const world = new MapWorld();
    world.set(0, 0, -3, BlockId.Stone);
    const hit = raycastVoxels(world, { x: 0.5, y: 0.5, z: 0.5 }, { x: 0, y: 0, z: -1 }, 6);

    expect(hit).not.toBeNull();
    expect(hit).toMatchObject({ x: 0, y: 0, z: -3, nx: 0, ny: 0, nz: 1, block: BlockId.Stone });
    expect(hit!.distance).toBeCloseTo(2.5, 5);
  });

  it('respects the maximum interaction distance', () => {
    const world = new MapWorld();
    world.set(0, 0, -3, BlockId.Stone);
    expect(raycastVoxels(world, { x: 0.5, y: 0.5, z: 0.5 }, { x: 0, y: 0, z: -1 }, 2)).toBeNull();
  });

  it('ignores water and hits a solid block behind it', () => {
    const world = new MapWorld();
    world.set(2, 0, 0, BlockId.Water);
    world.set(4, 0, 0, BlockId.Log);
    const hit = raycastVoxels(world, { x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 6);

    expect(hit?.block).toBe(BlockId.Log);
    expect(hit?.x).toBe(4);
    expect(hit?.nx).toBe(-1);
  });

  it('supports custom target predicates', () => {
    const world = new MapWorld();
    world.set(1, 0, 0, BlockId.Leaves);
    world.set(2, 0, 0, BlockId.Stone);
    const hit = raycastVoxels(
      world,
      { x: 0.5, y: 0.5, z: 0.5 },
      { x: 1, y: 0, z: 0 },
      6,
      (block) => block === BlockId.Stone,
    );
    expect(hit?.block).toBe(BlockId.Stone);
  });
});
