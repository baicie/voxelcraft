export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 128;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * CHUNK_HEIGHT;
export const SEA_LEVEL = 48;

export const DEFAULT_RENDER_DISTANCE = 4;
export const MIN_RENDER_DISTANCE = 2;
export const MAX_RENDER_DISTANCE = 8;
export const PLAYER_REACH = 6;
export const DAY_LENGTH_SECONDS = 600;

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function parseChunkKey(key: string): { cx: number; cz: number } {
  const comma = key.indexOf(',');
  return {
    cx: Number(key.slice(0, comma)),
    cz: Number(key.slice(comma + 1)),
  };
}

export function worldToChunk(value: number): number {
  return Math.floor(value / CHUNK_SIZE);
}

/** Local index layout: x + z * 16 + y * 256. */
export function voxelIndex(x: number, y: number, z: number): number {
  return y * CHUNK_AREA + z * CHUNK_SIZE + x;
}

export function isInsideChunk(x: number, y: number, z: number): boolean {
  return x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_HEIGHT && z >= 0 && z < CHUNK_SIZE;
}
