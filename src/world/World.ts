import { BlockId } from './BlockRegistry';
import { Chunk } from './Chunk';
import { ChunkManager, type ChunkStats } from './ChunkManager';
import { CHUNK_SIZE, chunkKey, parseChunkKey, voxelIndex, worldToChunk } from './constants';
import { WorldGenerator } from './WorldGenerator';
import { ChunkGenerationService } from '../workers/ChunkGenerationService';

export interface ChunkEditSnapshot {
  cx: number;
  cz: number;
  edits: Map<number, BlockId>;
}

export interface WorldOptions {
  id: string;
  seed: string;
  generatorVersion: number;
  renderDistance: number;
  edits?: Map<string, Map<number, BlockId>>;
  onGenerationError?: (error: Error) => void;
}

/**
 * World data facade. Rendering is intentionally kept out of this class: callers
 * request dirty chunks and turn them into geometry with ChunkMesher.
 */
export class World {
  readonly seed: string;
  readonly generator: WorldGenerator;
  readonly generation: ChunkGenerationService;
  readonly manager: ChunkManager;
  onChunkUnloaded: ((chunk: Chunk) => void) | null = null;

  private readonly edits: Map<string, Map<number, BlockId>>;
  private readonly dirtyEditChunks = new Set<string>();
  private disposed = false;

  constructor(options: WorldOptions) {
    this.seed = options.seed;
    this.generator = new WorldGenerator(options.seed, options.generatorVersion);
    this.generation = new ChunkGenerationService(options.seed, options.generatorVersion);
    this.edits = options.edits ?? new Map();
    this.manager = new ChunkManager({
      worldId: options.id,
      seed: options.seed,
      renderDistance: options.renderDistance,
      generation: this.generation,
      onChunkLoaded: (chunk) => this.applyEdits(chunk),
      onChunkUnloaded: (chunk) => this.onChunkUnloaded?.(chunk),
      onGenerationError: options.onGenerationError,
    });
  }

  update(playerX: number, playerZ: number): void {
    this.manager.update(playerX, playerZ);
  }

  getBlock(x: number, y: number, z: number): BlockId {
    return this.manager.getBlock(x, y, z);
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    return this.manager.isSolidAt(x, y, z);
  }

  setBlock(x: number, y: number, z: number, block: BlockId): boolean {
    const changed = this.manager.setBlock(x, y, z, block);
    if (!changed) return false;

    const key = chunkKey(worldToChunk(x), worldToChunk(z));
    let chunkEdits = this.edits.get(key);
    if (!chunkEdits) {
      chunkEdits = new Map();
      this.edits.set(key, chunkEdits);
    }
    chunkEdits.set(this.buildBlockEditIndex(x, y, z), block);
    this.dirtyEditChunks.add(key);
    return true;
  }

  buildBlockEditIndex(x: number, y: number, z: number): number {
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return voxelIndex(lx, y, lz);
  }

  getSurfaceHeight(x: number, z: number): number {
    return this.generator.getSurfaceHeight(Math.floor(x), Math.floor(z));
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.manager.getChunk(cx, cz);
  }

  hasAllNeighbors(cx: number, cz: number): boolean {
    return this.manager.hasAllNeighbors(cx, cz);
  }

  takeMeshJob(playerX: number, playerZ: number): Chunk | null {
    return this.manager.takeMeshJob(playerX, playerZ);
  }

  setRenderDistance(value: number): void {
    this.manager.setRenderDistance(value);
  }

  get renderDistance(): number {
    return this.manager.renderDistance;
  }

  getStats(): ChunkStats {
    return this.manager.getStats();
  }

  countLoadedWithin(x: number, z: number, radius: number): number {
    return this.manager.countLoadedWithin(x, z, radius);
  }

  getDirtyChunkEdits(): ChunkEditSnapshot[] {
    const snapshots: ChunkEditSnapshot[] = [];
    for (const key of this.dirtyEditChunks) {
      const edits = this.edits.get(key);
      if (!edits) continue;
      const { cx, cz } = parseChunkKey(key);
      snapshots.push({
        cx,
        cz,
        edits: new Map(edits),
      });
    }
    this.dirtyEditChunks.clear();
    return snapshots;
  }

  markChunkEditsDirty(keys: Array<{ cx: number; cz: number }>): void {
    for (const { cx, cz } of keys) this.dirtyEditChunks.add(chunkKey(cx, cz));
  }

  getEditedChunkCount(): number {
    return this.edits.size;
  }

  getDirtyEditChunkCount(): number {
    return this.dirtyEditChunks.size;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.manager.dispose();
    this.generation.dispose();
    this.edits.clear();
    this.dirtyEditChunks.clear();
    this.onChunkUnloaded = null;
  }

  private applyEdits(chunk: Chunk): void {
    const edits = this.edits.get(chunkKey(chunk.cx, chunk.cz));
    if (!edits) return;
    for (const [index, block] of edits) {
      if (index >= 0 && index < chunk.blocks.length) chunk.blocks[index] = block;
    }
  }
}
