import { describe, expect, it } from 'vitest';
import { buildChunkMesh, type BlockAccessor } from '../../src/rendering/ChunkMesher';
import type { UvRect } from '../../src/rendering/TextureAtlas';
import { BlockId } from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';

const uvSource = {
  getUvRect: (): UvRect => ({ u0: 0, v0: 0, u1: 0.25, v1: 0.25 }),
};

function airWorld(): BlockAccessor {
  return { getBlock: () => BlockId.Air };
}

describe('buildChunkMesh', () => {
  it('emits six quads for an isolated opaque block', () => {
    const chunk = new Chunk(0, 0);
    chunk.setLocal(1, 1, 1, BlockId.Stone);
    const mesh = buildChunkMesh(chunk, airWorld(), uvSource);

    expect(mesh.opaque.faceCount).toBe(6);
    expect(mesh.opaque.positions.length).toBe(24 * 3);
    expect(mesh.opaque.normals.length).toBe(24 * 3);
    expect(mesh.opaque.uvs.length).toBe(24 * 2);
    expect(mesh.opaque.colors.length).toBe(24 * 3);
    expect(mesh.opaque.indices.length).toBe(36);
    expect(mesh.cutout.faceCount).toBe(0);
    expect(mesh.transparent.faceCount).toBe(0);
  });

  it('culls the shared face between two adjacent blocks', () => {
    const chunk = new Chunk(0, 0);
    chunk.setLocal(1, 1, 1, BlockId.Stone);
    chunk.setLocal(2, 1, 1, BlockId.Stone);
    const mesh = buildChunkMesh(chunk, airWorld(), uvSource);

    expect(mesh.opaque.faceCount).toBe(10);
  });

  it('culls faces against a neighboring chunk', () => {
    const chunk = new Chunk(0, 0);
    chunk.setLocal(15, 1, 1, BlockId.Stone);
    const neighborWorld: BlockAccessor = {
      getBlock: (x, y, z) => (x === 16 && y === 1 && z === 1 ? BlockId.Stone : BlockId.Air),
    };
    const mesh = buildChunkMesh(chunk, neighborWorld, uvSource);

    expect(mesh.opaque.faceCount).toBe(5);
  });

  it('culls glass-to-glass faces but keeps distinct transparent faces', () => {
    const chunk = new Chunk(0, 0);
    chunk.setLocal(1, 1, 1, BlockId.Glass);
    chunk.setLocal(2, 1, 1, BlockId.Glass);
    chunk.setLocal(3, 1, 1, BlockId.Water);
    const mesh = buildChunkMesh(chunk, airWorld(), uvSource);

    expect(mesh.transparent.faceCount).toBe(16);
    expect(mesh.opaque.faceCount).toBe(0);
  });

  it('separates cutout leaves and transparent water into layers', () => {
    const chunk = new Chunk(0, 0);
    chunk.setLocal(1, 1, 1, BlockId.Leaves);
    chunk.setLocal(4, 1, 1, BlockId.Water);
    const mesh = buildChunkMesh(chunk, airWorld(), uvSource);

    expect(mesh.cutout.faceCount).toBe(6);
    expect(mesh.transparent.faceCount).toBe(6);
    expect(mesh.opaque.faceCount).toBe(0);
    expect(mesh.totalFaces).toBe(12);
  });

  it('emits cross geometry for torches instead of a cube', () => {
    const chunk = new Chunk(0, 0);
    chunk.setLocal(1, 5, 1, BlockId.Torch);
    const mesh = buildChunkMesh(chunk, airWorld(), uvSource);
    expect(mesh.cutout.faceCount).toBe(2);
    expect(mesh.cutout.positions.length).toBe(8 * 3);
    expect(mesh.opaque.faceCount).toBe(0);
  });

  it('returns empty geometry for an empty chunk', () => {
    const mesh = buildChunkMesh(new Chunk(0, 0), airWorld(), uvSource);
    expect(mesh.totalFaces).toBe(0);
    expect(mesh.opaque.indices.length).toBe(0);
    expect(mesh.opaque.positions.length).toBe(0);
  });

  it('emits local coordinates because ChunkRenderer applies the chunk origin', () => {
    const chunk = new Chunk(3, -2);
    chunk.setLocal(1, 10, 2, BlockId.Stone);
    const mesh = buildChunkMesh(chunk, airWorld(), uvSource);
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < mesh.opaque.positions.length; i += 3) {
      const x = mesh.opaque.positions[i]!;
      const z = mesh.opaque.positions[i + 2]!;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    expect(minX).toBeGreaterThanOrEqual(1);
    expect(maxX).toBeLessThanOrEqual(2);
    expect(minZ).toBeGreaterThanOrEqual(2);
    expect(maxZ).toBeLessThanOrEqual(3);
  });
});
