import { describe, expect, it } from 'vitest';
import { BlockId } from '../../src/world/BlockRegistry';
import { CHUNK_SIZE, SEA_LEVEL, voxelIndex } from '../../src/world/constants';
import { WorldGenerator } from '../../src/world/WorldGenerator';

function sampleBytes(data: Uint8Array, stride: number): number[] {
  const samples: number[] = [];
  for (let i = 0; i < data.length; i += stride) samples.push(data[i]!);
  return samples;
}

describe('WorldGenerator', () => {
  it('is deterministic for the same seed and coordinates', () => {
    const first = new WorldGenerator('deterministic-test');
    const second = new WorldGenerator('deterministic-test');
    const a = first.generateChunk(2, -3);
    const b = second.generateChunk(2, -3);

    expect(a.length).toBe(CHUNK_SIZE * CHUNK_SIZE * 128);
    expect(a).toEqual(b);
  });

  it('changes terrain when the seed changes', () => {
    const a = new WorldGenerator('seed-a').generateChunk(0, 0);
    const b = new WorldGenerator('seed-b').generateChunk(0, 0);
    expect(sampleBytes(a, 31)).not.toEqual(sampleBytes(b, 31));
  });

  it('always places an unbreakable floor at y=0', () => {
    const generator = new WorldGenerator('bedrock-test');
    const chunk = generator.generateChunk(0, 0);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        expect(chunk[voxelIndex(x, 0, z)]).toBe(BlockId.Bedrock);
      }
    }
  });

  it('fills the surface with a non-air top block', () => {
    const generator = new WorldGenerator('surface-test');
    const chunk = generator.generateChunk(0, 0);
    for (const [x, z] of [
      [0, 0],
      [4, 9],
      [12, 2],
      [15, 15],
    ] as const) {
      const height = generator.getSurfaceHeight(x, z);
      expect(height).toBeGreaterThanOrEqual(5);
      expect(height).toBeLessThan(128);
      expect(chunk[voxelIndex(x, height, z)]).not.toBe(BlockId.Air);
    }
  });

  it('finds a dry, flat spawn point above sea level', () => {
    const generator = new WorldGenerator('voxelcraft-demo');
    const spawn = generator.findSpawnPoint();
    const surface = generator.getSurfaceHeight(Math.floor(spawn.x), Math.floor(spawn.z));

    expect(surface).toBeGreaterThan(SEA_LEVEL + 1);
    expect(spawn.y).toBeGreaterThan(surface);
  });

  it('generates trees that can cross chunk boundaries without seams', () => {
    const generator = new WorldGenerator('tree-seed');
    let logs = 0;
    let leaves = 0;
    const generated = new Map<string, Uint8Array>();

    for (let cx = -2; cx <= 2; cx++) {
      for (let cz = -2; cz <= 2; cz++) {
        const chunk = generator.generateChunk(cx, cz);
        generated.set(`${cx},${cz}`, chunk);
        for (const block of chunk) {
          if (block === BlockId.Log) logs++;
          if (block === BlockId.Leaves) leaves++;
        }
      }
    }

    expect(logs).toBeGreaterThan(0);
    expect(leaves).toBeGreaterThan(logs);
    expect(generator.generateChunk(2, 2)).toEqual(generated.get('2,2'));
  });

  it('fills ocean columns with water up to sea level', () => {
    const generator = new WorldGenerator('ocean-seed');
    let foundOcean = false;
    for (let x = 0; x < 512 && !foundOcean; x += 4) {
      for (let z = 0; z < 512; z += 4) {
        if (generator.getSurfaceHeight(x, z) > SEA_LEVEL - 3) continue;
        foundOcean = true;
        const cx = Math.floor(x / 16);
        const cz = Math.floor(z / 16);
        const chunk = generator.generateChunk(cx, cz);
        const lx = ((x % 16) + 16) % 16;
        const lz = ((z % 16) + 16) % 16;
        expect(chunk[voxelIndex(lx, SEA_LEVEL, lz)]).toBe(BlockId.Water);
        break;
      }
    }
    expect(foundOcean).toBe(true);
  });

  it('keeps generator V1 free of iron ore and enables it in V2', () => {
    const v1 = new WorldGenerator('ore-version-seed', 1);
    const v2 = new WorldGenerator('ore-version-seed', 2);
    let v1Iron = 0;
    let v2Iron = 0;
    for (let cx = -2; cx <= 2; cx++) {
      for (let cz = -2; cz <= 2; cz++) {
        const chunkV1 = v1.generateChunk(cx, cz);
        const chunkV2 = v2.generateChunk(cx, cz);
        for (const block of chunkV1) if (block === BlockId.IronOre) v1Iron++;
        for (const block of chunkV2) if (block === BlockId.IronOre) v2Iron++;
      }
    }
    expect(v1Iron).toBe(0);
    expect(v2Iron).toBeGreaterThan(0);
    expect(v1.generateChunk(0, 0)).toEqual(new WorldGenerator('ore-version-seed', 1).generateChunk(0, 0));
  });
});
