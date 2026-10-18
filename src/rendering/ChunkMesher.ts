import { BlockFace, BlockId, getBlockDefinition, getFaceTexture, isOpaqueBlock } from '../world/BlockRegistry';
import type { Chunk } from '../world/Chunk';
import { CHUNK_HEIGHT, CHUNK_SIZE } from '../world/constants';
import type { UvRect } from './TextureAtlas';

export interface BlockAccessor {
  getBlock(x: number, y: number, z: number): BlockId;
}

export interface MeshLayerData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  faceCount: number;
}

export interface ChunkMeshData {
  opaque: MeshLayerData;
  cutout: MeshLayerData;
  transparent: MeshLayerData;
  totalFaces: number;
}

interface MeshAccumulator {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
  faceCount: number;
}

type Vec3 = readonly [number, number, number];
type Axis = 0 | 1 | 2;

interface FaceDefinition {
  readonly face: BlockFace;
  readonly normal: Vec3;
  readonly corners: readonly [Vec3, Vec3, Vec3, Vec3];
  readonly pAxis: Axis;
  readonly qAxis: Axis;
  readonly shade: number;
}

const FACES: readonly FaceDefinition[] = [
  {
    face: BlockFace.East,
    normal: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    pAxis: 2,
    qAxis: 1,
    shade: 0.9,
  },
  {
    face: BlockFace.West,
    normal: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    pAxis: 2,
    qAxis: 1,
    shade: 0.84,
  },
  {
    face: BlockFace.Top,
    normal: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    pAxis: 0,
    qAxis: 2,
    shade: 1,
  },
  {
    face: BlockFace.Bottom,
    normal: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    pAxis: 0,
    qAxis: 2,
    shade: 0.68,
  },
  {
    face: BlockFace.South,
    normal: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    pAxis: 0,
    qAxis: 1,
    shade: 0.96,
  },
  {
    face: BlockFace.North,
    normal: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    pAxis: 0,
    qAxis: 1,
    shade: 0.86,
  },
];

const AO_LIGHT = [0.74, 0.84, 0.93, 1] as const;

/**
 * Builds separate opaque, cutout and transparent geometry for one chunk.
 * Hidden faces are culled using neighboring voxels; vertex AO is sampled from
 * the eight surrounding chunk columns, so borders are seamless.
 */
export function buildChunkMesh(chunk: Chunk, world: BlockAccessor, uvSource: { getUvRect(name: string): UvRect }): ChunkMeshData {
  const opaque = createAccumulator();
  const cutout = createAccumulator();
  const transparent = createAccumulator();
  const originX = chunk.cx * CHUNK_SIZE;
  const originZ = chunk.cz * CHUNK_SIZE;
  const uvCache = new Map<string, UvRect>();

  const readBlock = (x: number, y: number, z: number): BlockId => {
    if (y < 0) return BlockId.Bedrock;
    if (y >= CHUNK_HEIGHT) return BlockId.Air;
    const lx = x - originX;
    const lz = z - originZ;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      return chunk.getLocal(lx, y, lz);
    }
    return world.getBlock(x, y, z);
  };

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = chunk.getLocal(x, y, z);
        if (block === BlockId.Air) continue;
        const definition = getBlockDefinition(block);
        const target = definition.renderLayer === 'opaque' ? opaque : definition.renderLayer === 'cutout' ? cutout : transparent;
        const worldX = originX + x;
        const worldZ = originZ + z;
        const useAo = definition.renderLayer !== 'transparent';

        if (definition.renderType === 'cross') {
          const texture = getFaceTexture(block, BlockFace.East);
          let uv = uvCache.get(texture);
          if (!uv) {
            uv = uvSource.getUvRect(texture);
            uvCache.set(texture, uv);
          }
          const light = 0.95;
          const baseVertex = target.positions.length / 3;
          const planes: Array<readonly [number, number, number, number]> = [
            [0.18, 0.5, 0.82, 0.5],
            [0.5, 0.18, 0.5, 0.82],
          ];
          for (const plane of planes) {
            const [x1, z1, x2, z2] = plane;
            const start = target.positions.length / 3;
            target.positions.push(
              x + x1, 0.03, z + z1,
              x + x2, 0.03, z + z2,
              x + x2, 0.97, z + z2,
              x + x1, 0.97, z + z1,
            );
            target.normals.push(
              0, 0, 1,
              0, 0, 1,
              0, 0, 1,
              0, 0, 1,
            );
            target.uvs.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
            target.colors.push(light, light, light, light, light, light, light, light, light, light, light, light);
            target.indices.push(
              start, start + 1, start + 2,
              start, start + 2, start + 3,
            );
            target.faceCount++;
          }
          void baseVertex;
          continue;
        }

        for (const face of FACES) {
          const nx = worldX + face.normal[0];
          const ny = y + face.normal[1];
          const nz = worldZ + face.normal[2];
          const neighbor = readBlock(nx, ny, nz);
          if (!isFaceVisible(block, neighbor)) continue;

          const texture = getFaceTexture(block, face.face);
          let uv = uvCache.get(texture);
          if (!uv) {
            uv = uvSource.getUvRect(texture);
            uvCache.set(texture, uv);
          }

          const baseVertex = target.positions.length / 3;
          const ao: number[] = [];
          for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
            const corner = face.corners[cornerIndex]!;
            let aoValue = 3;
            if (useAo) {
              const pSign = corner[face.pAxis] === 1 ? 1 : -1;
              const qSign = corner[face.qAxis] === 1 ? 1 : -1;
              const p = axisOffset(face.pAxis, pSign);
              const q = axisOffset(face.qAxis, qSign);
              const side1 = isOccluding(readBlock(nx + p[0], ny + p[1], nz + p[2]));
              const side2 = isOccluding(readBlock(nx + q[0], ny + q[1], nz + q[2]));
              const cornerBlock = isOccluding(readBlock(nx + p[0] + q[0], ny + p[1] + q[1], nz + p[2] + q[2]));
              aoValue = side1 && side2 ? 0 : 3 - (Number(side1) + Number(side2) + Number(cornerBlock));
            }
            ao.push(aoValue);
            let light = face.shade * (useAo ? AO_LIGHT[aoValue]! : 1);
            if (definition.renderLayer === 'cutout') light = Math.max(light, 0.56);
            target.positions.push(x + corner[0], y + corner[1], z + corner[2]);
            target.normals.push(face.normal[0], face.normal[1], face.normal[2]);
            target.uvs.push(cornerIndex === 0 || cornerIndex === 3 ? uv.u0 : uv.u1, cornerIndex < 2 ? uv.v0 : uv.v1);
            target.colors.push(light, light, light);
          }

          if ((ao[0] ?? 3) + (ao[2] ?? 3) > (ao[1] ?? 3) + (ao[3] ?? 3)) {
            target.indices.push(
              baseVertex,
              baseVertex + 1,
              baseVertex + 2,
              baseVertex,
              baseVertex + 2,
              baseVertex + 3,
            );
          } else {
            target.indices.push(
              baseVertex + 1,
              baseVertex + 2,
              baseVertex + 3,
              baseVertex + 1,
              baseVertex + 3,
              baseVertex,
            );
          }
          target.faceCount++;
        }
      }
    }
  }

  const opaqueData = finalizeAccumulator(opaque);
  const cutoutData = finalizeAccumulator(cutout);
  const transparentData = finalizeAccumulator(transparent);
  return {
    opaque: opaqueData,
    cutout: cutoutData,
    transparent: transparentData,
    totalFaces: opaqueData.faceCount + cutoutData.faceCount + transparentData.faceCount,
  };
}

function createAccumulator(): MeshAccumulator {
  return {
    positions: [],
    normals: [],
    uvs: [],
    colors: [],
    indices: [],
    faceCount: 0,
  };
}

function finalizeAccumulator(accumulator: MeshAccumulator): MeshLayerData {
  return {
    positions: new Float32Array(accumulator.positions),
    normals: new Float32Array(accumulator.normals),
    uvs: new Float32Array(accumulator.uvs),
    colors: new Float32Array(accumulator.colors),
    indices: new Uint32Array(accumulator.indices),
    faceCount: accumulator.faceCount,
  };
}

function isFaceVisible(current: BlockId, neighbor: BlockId): boolean {
  if (neighbor === BlockId.Air) return true;
  const neighborDefinition = getBlockDefinition(neighbor);
  if (neighborDefinition.opaque) return false;
  if (neighbor === current) return false;
  return true;
}

function isOccluding(block: BlockId): boolean {
  return isOpaqueBlock(block);
}

function axisOffset(axis: Axis, sign: number): Vec3 {
  if (axis === 0) return [sign, 0, 0];
  if (axis === 1) return [0, sign, 0];
  return [0, 0, sign];
}
