import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT, type BiomeId, type ChunkPayload } from '../core/types';
import { fbm, hash3, noise3 } from '../core/math';
import { B, blockKey } from './blocks';
import { voxelIndex } from './coordinates';

export const BIOMES: BiomeId[] = ['ocean', 'plains', 'forest', 'desert', 'mountains', 'snow', 'swamp', 'coast'];
export const GENERATOR_VERSION = 1;
export type Column = { height: number; biome: number; temperature: number; moisture: number };

export function columnAt(seed: number, x: number, z: number): Column {
  const continental = fbm(seed + 11, x / 460, z / 460, 3);
  const detail = fbm(seed + 29, x / 105, z / 105, 4);
  const ridgeNoise = fbm(seed + 51, x / 220, z / 220, 3);
  const mountain = Math.pow(Math.max(0, ridgeNoise + 0.13), 1.8);
  const river = Math.abs(fbm(seed + 811, x / 290, z / 290, 2));
  let height = 32 + continental * 18 + detail * 7 + mountain * 53;
  if (river < 0.065 && height < 57) height -= (1 - river / 0.065) * 13;
  const temperature = fbm(seed + 209, x / 530, z / 530, 2) - Math.max(0, height - 47) / 55;
  const moisture = fbm(seed + 317, x / 420, z / 420, 3);
  let biome = 1;
  if (height < SEA_LEVEL - 2) biome = 0;
  else if (height < SEA_LEVEL + 2) biome = 7;
  else if (mountain > 0.14 || height > 53) biome = temperature < -0.12 ? 5 : 4;
  else if (temperature < -0.25) biome = 5;
  else if (temperature > 0.18 && moisture < 0.02) biome = 3;
  else if (moisture < -0.24 && height < 36) biome = 6;
  else if (moisture > 0.06) biome = 2;
  return { height: Math.max(5, Math.min(WORLD_HEIGHT - 10, Math.floor(height))), biome, temperature, moisture };
}

function isSolid(id: number): boolean { return id !== B.air && id !== B.water; }
function put(payload: ChunkPayload, x: number, y: number, z: number, id: number, onlyAir = false): void {
  const lx = x - payload.cx * CHUNK_SIZE, lz = z - payload.cz * CHUNK_SIZE;
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 1 || y >= WORLD_HEIGHT) return;
  const index = voxelIndex(lx, y, lz);
  if (!onlyAir || !isSolid(payload.voxels[index])) payload.voxels[index] = id;
}

function vegetation(payload: ChunkPayload, seed: number): void {
  const originX = payload.cx * CHUNK_SIZE, originZ = payload.cz * CHUNK_SIZE;
  const minCellX = Math.floor((originX - 6) / 6), maxCellX = Math.floor((originX + CHUNK_SIZE + 6) / 6);
  const minCellZ = Math.floor((originZ - 6) / 6), maxCellZ = Math.floor((originZ + CHUNK_SIZE + 6) / 6);
  for (let cellX = minCellX; cellX <= maxCellX; cellX++) for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
    const x = cellX * 6 + Math.floor(hash3(seed + 71, cellX, cellZ) * 6);
    const z = cellZ * 6 + Math.floor(hash3(seed + 97, cellX, cellZ) * 6);
    const column = columnAt(seed, x, z);
    const forest = column.biome === 2;
    const treeChance = forest ? 0.55 : column.biome === 5 ? 0.25 : column.biome === 1 ? 0.065 : 0;
    if (column.height <= SEA_LEVEL || hash3(seed + 127, cellX, cellZ) >= treeChance) continue;
    const spruce = column.biome === 5;
    const birch = !spruce && hash3(seed + 171, x, z) > 0.75;
    const log = spruce ? B.spruceLog : birch ? B.birchLog : B.oakLog;
    const leaf = spruce ? B.spruceLeaves : birch ? B.birchLeaves : B.oakLeaves;
    const trunk = 4 + Math.floor(hash3(seed + 183, x, z) * 3);
    for (let y = 1; y <= trunk; y++) put(payload, x, column.height + y, z, log);
    const top = column.height + trunk;
    if (spruce) {
      for (let layer = -3; layer <= 1; layer++) {
        const radius = layer === 1 ? 0 : layer === 0 ? 1 : layer === -3 ? 1 : 2;
        for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) + Math.abs(dz) <= radius + 1) put(payload, x + dx, top + layer, z + dz, leaf, true);
        }
      }
    } else {
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 1; dy++) {
        if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) < 5 && hash3(seed + 197, x + dx * 13 + dy, z + dz) > 0.1) {
          put(payload, x + dx, top + dy, z + dz, leaf, true);
        }
      }
    }
  }
}

function ruins(payload: ChunkPayload, seed: number): void {
  const size = 47;
  const centerCellX = Math.floor(payload.cx * CHUNK_SIZE / size), centerCellZ = Math.floor(payload.cz * CHUNK_SIZE / size);
  for (let rx = centerCellX - 1; rx <= centerCellX + 1; rx++) for (let rz = centerCellZ - 1; rz <= centerCellZ + 1; rz++) {
    if (hash3(seed + 1409, rx, rz) > 0.34) continue;
    const x = rx * size + 9 + Math.floor(hash3(seed + 1423, rx, rz) * 28);
    const z = rz * size + 9 + Math.floor(hash3(seed + 1433, rx, rz) * 28);
    const column = columnAt(seed, x, z);
    if (column.height <= SEA_LEVEL) continue;
    const y = column.height + 1;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) put(payload, x + dx, y, z + dz, (dx + dz) % 3 === 0 ? B.moss : B.stoneBrick);
    for (const [dx, dz] of [[-3,-3],[3,-3],[-3,3],[3,3]]) {
      const height = 2 + Math.floor(hash3(seed + 1451, x + dx, z + dz) * 4);
      for (let dy = 1; dy <= height; dy++) put(payload, x + dx, y + dy, z + dz, B.stoneBrick);
    }
    put(payload, x, y + 1, z, B.glowstone);
    put(payload, x + 1, y + 1, z, B.goldOre);
  }
}

export function generateChunk(seed: number, cx: number, cz: number, edits: Record<string, number> = {}): ChunkPayload {
  const voxels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  const payload: ChunkPayload = { cx, cz, voxels, biomes, edits };
  for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    const x = cx * CHUNK_SIZE + lx, z = cz * CHUNK_SIZE + lz;
    const column = columnAt(seed, x, z);
    const h = column.height;
    biomes[lx + lz * CHUNK_SIZE] = column.biome;
    const sandy = column.biome === 0 || column.biome === 3 || column.biome === 7;
    for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
      let id: number = B.air;
      if (y === 0) id = B.bedrock;
      else if (y < h - 4) id = B.stone;
      else if (y < h) id = sandy ? B.sandstone : B.dirt;
      else if (y === h) id = column.biome === 5 ? B.snow : sandy ? B.sand : column.biome === 6 ? B.moss : B.grass;
      else if (y <= SEA_LEVEL) id = B.water;
      if (id === B.stone && y > 3) {
        const cave = noise3(seed + 601, x / 29, y / 20, z / 29);
        const tunnel = Math.abs(noise3(seed + 719, x / 43, y / 30, z / 43));
        if (cave > 0.48 || (tunnel < 0.045 && y < h - 8)) id = B.air;
        else {
          const ore = hash3(seed + 887, x, y * 31 + z);
          if (y < 16 && ore > 0.994) id = B.diamondOre;
          else if (y < 30 && ore > 0.988) id = B.goldOre;
          else if (y < 46 && ore > 0.974) id = B.ironOre;
          else if (y < 58 && ore > 0.962) id = B.coalOre;
          else if (ore < 0.025) id = B.gravel;
        }
      }
      voxels[voxelIndex(lx, y, lz)] = id;
    }
    if (h > SEA_LEVEL && h < 53 && column.biome !== 3) {
      const plant = hash3(seed + 1103, x, z);
      if (column.biome === 6 && plant > 0.94) voxels[voxelIndex(lx, h + 1, lz)] = B.reeds;
      else if (plant > 0.985) voxels[voxelIndex(lx, h + 1, lz)] = B.flowerRed;
      else if (plant > 0.975) voxels[voxelIndex(lx, h + 1, lz)] = B.flowerYellow;
      else if (plant > 0.82) voxels[voxelIndex(lx, h + 1, lz)] = B.tallGrass;
    } else if (column.biome === 3 && h > SEA_LEVEL && hash3(seed + 1201, x, z) > 0.992) {
      for (let dy = 1; dy < 4; dy++) voxels[voxelIndex(lx, h + dy, lz)] = B.cactus;
    }
  }
  vegetation(payload, seed);
  ruins(payload, seed);
  for (const [key, id] of Object.entries(edits)) {
    const [x, y, z] = key.split(',').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && y >= 0 && y < WORLD_HEIGHT && Math.floor(x / CHUNK_SIZE) === cx && Math.floor(z / CHUNK_SIZE) === cz) {
      voxels[voxelIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] = id;
    }
  }
  return payload;
}

export function findSpawn(seed: number): { x: number; y: number; z: number; yaw?: number } {
  let fallback: { x: number; y: number; z: number; yaw?: number } | null = null;
  for (let radius = 1; radius < 100; radius++) for (let i = 0; i < 20; i++) {
    const angle = i / 20 * Math.PI * 2;
    const x = Math.round(Math.cos(angle) * radius * 5), z = Math.round(Math.sin(angle) * radius * 5);
    const c = columnAt(seed, x, z);
    if (c.height > SEA_LEVEL + 1 && c.height < 49 && (c.biome === 1 || c.biome === 2)) {
      fallback ??= { x: x + .5, y: c.height + 2.01, z: z + .5, yaw: .7 };
      if (c.biome !== 2) continue;
      const cellX = Math.floor(x / 6), cellZ = Math.floor(z / 6);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const tx = (cellX + ox) * 6 + Math.floor(hash3(seed + 71, cellX + ox, cellZ + oz) * 6);
        const tz = (cellZ + oz) * 6 + Math.floor(hash3(seed + 97, cellX + ox, cellZ + oz) * 6);
        const treeColumn = columnAt(seed, tx, tz);
        if (treeColumn.biome !== 2 || treeColumn.height <= SEA_LEVEL) continue;
        if (hash3(seed + 127, cellX + ox, cellZ + oz) >= .55) continue;
        const sx = tx + 3, sz = tz + 1;
        const spawnColumn = columnAt(seed, sx, sz);
        if (spawnColumn.height <= SEA_LEVEL || spawnColumn.height > 50) continue;
        const yaw = Math.atan2(-(tx + .5 - (sx + .5)), -(tz + .5 - (sz + .5)));
        return { x: sx + .5, y: spawnColumn.height + 2.01, z: sz + .5, yaw };
      }
    }
  }
  return fallback ?? { x: 0.5, y: 60, z: 0.5, yaw: .7 };
}

export function editedKey(x: number, y: number, z: number): string { return blockKey(x, y, z); }
