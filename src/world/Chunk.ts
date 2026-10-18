import { BlockId } from './BlockRegistry';
import { CHUNK_HEIGHT, CHUNK_SIZE, CHUNK_VOLUME, isInsideChunk, voxelIndex } from './constants';

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly blocks: Uint8Array;

  constructor(cx: number, cz: number, blocks?: Uint8Array) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = blocks ?? new Uint8Array(CHUNK_VOLUME);
  }

  getLocal(x: number, y: number, z: number): BlockId {
    if (!isInsideChunk(x, y, z)) return BlockId.Air;
    return (this.blocks[voxelIndex(x, y, z)] ?? BlockId.Air) as BlockId;
  }

  setLocal(x: number, y: number, z: number, block: BlockId): boolean {
    if (!isInsideChunk(x, y, z)) return false;
    this.blocks[voxelIndex(x, y, z)] = block;
    return true;
  }

  get worldMinX(): number {
    return this.cx * CHUNK_SIZE;
  }

  get worldMinZ(): number {
    return this.cz * CHUNK_SIZE;
  }

  get height(): number {
    return CHUNK_HEIGHT;
  }

  fill(block: BlockId): void {
    this.blocks.fill(block);
  }
}
