import { BlockId } from './BlockRegistry';
import { CHUNK_HEIGHT, CHUNK_SIZE, CHUNK_VOLUME, SEA_LEVEL, voxelIndex } from './constants';
import { TerrainNoise } from './Noise';
import { clamp, hashInt3, hashString, hashToUnit, smoothstep } from '../utils/math';

const TREE_GRID = 6;
const TREE_MARGIN = 3;

/**
 * Pure, deterministic terrain generation. The same seed and chunk coordinates
 * always produce identical voxel data, including trees crossing chunk borders.
 */
export class WorldGenerator {
  readonly seedString: string;
  readonly seed: number;
  readonly generatorVersion: number;
  private readonly noise: TerrainNoise;
  private readonly spawnInspectionChunks = new Map<string, Uint8Array>();

  constructor(seedString: string, generatorVersion = 2) {
    this.seedString = seedString;
    this.seed = hashString(seedString || 'voxelcraft');
    this.generatorVersion = generatorVersion >= 2 ? 2 : 1;
    this.noise = new TerrainNoise(this.seed);
  }

  generateChunk(cx: number, cz: number): Uint8Array {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    const originX = cx * CHUNK_SIZE;
    const originZ = cz * CHUNK_SIZE;

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const worldX = originX + x;
        const worldZ = originZ + z;
        const height = this.getSurfaceHeight(worldX, worldZ);
        const beach = height <= SEA_LEVEL + 2;
        const top = this.getTopBlock(height);
        const subSurface = beach ? BlockId.Sand : BlockId.Dirt;

        for (let y = 0; y <= Math.max(height, SEA_LEVEL); y++) {
          let block: BlockId = BlockId.Air;

          if (y === 0 || (y === 1 && hashToUnit(hashInt3(worldX, y, worldZ, this.seed)) < 0.42)) {
            block = BlockId.Bedrock;
          } else if (y === height) {
            block = top;
          } else if (y < height && y >= height - 3) {
            block = subSurface;
          } else if (y < height) {
            block = BlockId.Stone;
            if (
              y > 2 &&
              y < height - 5 &&
              hashToUnit(hashInt3(worldX, y, worldZ, this.seed ^ 0x9e3779b9)) < 0.018
            ) {
              block = BlockId.CoalOre;
            } else if (
              this.generatorVersion >= 2 &&
              y > 4 &&
              y < Math.min(height - 4, 64) &&
              hashToUnit(hashInt3(worldX, y, worldZ, this.seed ^ 0x51ed270b)) < 0.009
            ) {
              block = BlockId.IronOre;
            }
          } else if (y <= SEA_LEVEL) {
            block = BlockId.Water;
          }

          if (y > 0 && y > 3 && y < height - 3 && block !== BlockId.Air && block !== BlockId.Water) {
            if (this.isCave(worldX, y, worldZ)) block = BlockId.Air;
          }

          if (block !== BlockId.Air) {
            blocks[voxelIndex(x, y, z)] = block;
          }
        }
      }
    }

    this.placeTrees(blocks, cx, cz);
    return blocks;
  }

  /** Height of the topmost generated solid block, ignoring trees and caves. */
  getSurfaceHeight(x: number, z: number): number {
    const continental = this.noise.fbm2(this.noise.continent, x * 0.0014, z * 0.0014, 4);
    const hills = this.noise.fbm2(this.noise.hills, x * 0.0085, z * 0.0085, 4);
    const ridge = 1 - Math.abs(this.noise.fbm2(this.noise.mountains, x * 0.0026, z * 0.0026, 4));
    const mountainMask = smoothstep(0.52, 0.9, ridge) * smoothstep(-0.22, 0.42, continental);
    const detail = this.noise.fbm2(this.noise.detail, x * 0.045, z * 0.045, 2);
    const riverValue = Math.abs(this.noise.fbm2(this.noise.rivers, x * 0.0021 + 101, z * 0.0021 - 73, 3));
    const river = 1 - smoothstep(0.006, 0.031, riverValue);

    const elevation =
      45.5 +
      continental * 9.5 +
      hills * (4.2 + mountainMask * 30) +
      detail * 1.35 +
      mountainMask * 13 -
      river * 9;

    return clamp(Math.floor(elevation), 5, CHUNK_HEIGHT - 18);
  }

  /**
   * Finds a reasonably flat, dry spawn point near the requested origin. Ocean
   * worlds are common, so starting the player in deep water is poor first-run UX.
   */
  findSpawnPoint(originX = CHUNK_SIZE / 2, originZ = CHUNK_SIZE / 2): { x: number; y: number; z: number } {
    let inspected = 0;
    for (let radius = 0; radius <= 224; radius += 8) {
      const ringSteps = radius === 0 ? 1 : Math.max(8, radius);
      for (let step = 0; step < ringSteps; step++) {
        const angle = (step / ringSteps) * Math.PI * 2;
        const x = Math.floor(originX + Math.cos(angle) * radius);
        const z = Math.floor(originZ + Math.sin(angle) * radius);
        const height = this.getSurfaceHeight(x, z);
        if (height <= SEA_LEVEL + 2 || height >= 92) continue;
        const top = this.getTopBlock(height);
        if (top !== BlockId.Grass && top !== BlockId.Sand) continue;
        const slope =
          Math.abs(this.getSurfaceHeight(x + 2, z) - height) +
          Math.abs(this.getSurfaceHeight(x - 2, z) - height) +
          Math.abs(this.getSurfaceHeight(x, z + 2) - height) +
          Math.abs(this.getSurfaceHeight(x, z - 2) - height);
        if (slope > 4) continue;
        inspected++;
        if (inspected <= 30 && this.hasTreeNearSpawn(x, height, z, 6)) continue;
        return { x: x + 0.5, y: height + 1.05, z: z + 0.5 };
      }
    }

    const fallbackHeight = Math.max(this.getSurfaceHeight(originX, originZ), SEA_LEVEL);
    return { x: originX + 0.5, y: fallbackHeight + 1.05, z: originZ + 0.5 };
  }

  private hasTreeNearSpawn(x: number, height: number, z: number, radius: number): boolean {
    const minCX = Math.floor((x - radius) / CHUNK_SIZE);
    const maxCX = Math.floor((x + radius) / CHUNK_SIZE);
    const minCZ = Math.floor((z - radius) / CHUNK_SIZE);
    const maxCZ = Math.floor((z + radius) / CHUNK_SIZE);
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const key = `${cx},${cz}`;
        let chunk = this.spawnInspectionChunks.get(key);
        if (!chunk) {
          chunk = this.generateChunk(cx, cz);
          this.spawnInspectionChunks.set(key, chunk);
        }
        const minWX = Math.max(x - radius, cx * CHUNK_SIZE);
        const maxWX = Math.min(x + radius, cx * CHUNK_SIZE + CHUNK_SIZE - 1);
        const minWZ = Math.max(z - radius, cz * CHUNK_SIZE);
        const maxWZ = Math.min(z + radius, cz * CHUNK_SIZE + CHUNK_SIZE - 1);
        for (let wz = minWZ; wz <= maxWZ; wz++) {
          for (let wx = minWX; wx <= maxWX; wx++) {
            for (let wy = height + 1; wy <= height + 5; wy++) {
              const block = chunk[voxelIndex(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE)];
              if (block === BlockId.Log || block === BlockId.Leaves) return true;
            }
          }
        }
      }
    }
    return false;
  }

  private getTopBlock(height: number): BlockId {
    if (height <= SEA_LEVEL + 2) return BlockId.Sand;
    if (height >= 94) return BlockId.Snow;
    return BlockId.Grass;
  }

  private isCave(x: number, y: number, z: number): boolean {
    const primary = this.noise.caves(x * 0.043, y * 0.072, z * 0.043);
    if (primary > 0.63) return true;
    if (y < 58) {
      const secondary = this.noise.cavesSecondary(x * 0.032 + 50, y * 0.052, z * 0.032 - 30);
      return secondary > 0.69;
    }
    return false;
  }

  private placeTrees(blocks: Uint8Array, cx: number, cz: number): void {
    const originX = cx * CHUNK_SIZE;
    const originZ = cz * CHUNK_SIZE;
    const minGX = Math.floor((originX - TREE_MARGIN) / TREE_GRID);
    const maxGX = Math.floor((originX + CHUNK_SIZE - 1 + TREE_MARGIN) / TREE_GRID);
    const minGZ = Math.floor((originZ - TREE_MARGIN) / TREE_GRID);
    const maxGZ = Math.floor((originZ + CHUNK_SIZE - 1 + TREE_MARGIN) / TREE_GRID);

    for (let gz = minGZ; gz <= maxGZ; gz++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        const hash = hashInt3(gx, gz, 0x7a11, this.seed);
        const roll = hashToUnit(hash);
        const treeX = gx * TREE_GRID + ((hash >>> 7) % TREE_GRID);
        const treeZ = gz * TREE_GRID + ((hash >>> 15) % TREE_GRID);
        const forest = (this.noise.fbm2(this.noise.forest, treeX * 0.006, treeZ * 0.006, 3) + 1) * 0.5;
        const probability = 0.055 + forest * 0.4;
        if (roll > probability) continue;

        const ground = this.getSurfaceHeight(treeX, treeZ);
        if (ground <= SEA_LEVEL + 1 || ground >= 94) continue;
        if (this.getTopBlock(ground) !== BlockId.Grass) continue;

        const slope =
          Math.abs(this.getSurfaceHeight(treeX + 1, treeZ) - ground) +
          Math.abs(this.getSurfaceHeight(treeX - 1, treeZ) - ground) +
          Math.abs(this.getSurfaceHeight(treeX, treeZ + 1) - ground) +
          Math.abs(this.getSurfaceHeight(treeX, treeZ - 1) - ground);
        if (slope > 5) continue;

        const trunkHeight = 4 + ((hash >>> 24) % 3);
        this.placeTree(blocks, originX, originZ, treeX, treeZ, ground, trunkHeight, hash);
      }
    }
  }

  private placeTree(
    blocks: Uint8Array,
    originX: number,
    originZ: number,
    treeX: number,
    treeZ: number,
    groundY: number,
    trunkHeight: number,
    hash: number,
  ): void {
    const trunkTop = groundY + trunkHeight;

    for (let y = groundY + 1; y <= trunkTop; y++) {
      this.writeIfInside(blocks, originX, originZ, treeX, y, treeZ, BlockId.Log, true);
    }

    for (let dy = -2; dy <= 1; dy++) {
      const radius = dy === 1 ? 1 : 2;
      const y = trunkTop + dy;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const isCorner = Math.abs(dx) === radius && Math.abs(dz) === radius;
          if (isCorner && (radius === 2 || dy === 1)) continue;
          const leafHash = hashInt3(treeX + dx, y, treeZ + dz, hash);
          if (isCorner && hashToUnit(leafHash) < 0.42) continue;
          this.writeIfInside(blocks, originX, originZ, treeX + dx, y, treeZ + dz, BlockId.Leaves, false);
        }
      }
    }
  }

  private writeIfInside(
    blocks: Uint8Array,
    originX: number,
    originZ: number,
    worldX: number,
    y: number,
    worldZ: number,
    block: BlockId,
    overwrite: boolean,
  ): void {
    const x = worldX - originX;
    const z = worldZ - originZ;
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) return;
    const index = voxelIndex(x, y, z);
    const existing = blocks[index] ?? BlockId.Air;
    if (!overwrite && existing !== BlockId.Air) return;
    if (overwrite && existing !== BlockId.Air && existing !== BlockId.Leaves) return;
    blocks[index] = block;
  }
}
