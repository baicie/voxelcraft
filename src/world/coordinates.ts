import { CHUNK_SIZE, WORLD_HEIGHT } from '../core/types';
import { floorDiv, mod } from '../core/math';

export const chunkOf = (x: number, z: number) => ({ cx: floorDiv(x, CHUNK_SIZE), cz: floorDiv(z, CHUNK_SIZE) });
export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;
export const voxelIndex = (x: number, y: number, z: number) => x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
export const localOf = (x: number, z: number) => ({ x: mod(x, CHUNK_SIZE), z: mod(z, CHUNK_SIZE) });
export const validY = (y: number) => y >= 0 && y < WORLD_HEIGHT;
