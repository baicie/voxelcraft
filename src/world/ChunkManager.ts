import { BlockId } from './BlockRegistry';
import { Chunk } from './Chunk';
import { CHUNK_HEIGHT, CHUNK_SIZE, chunkKey, worldToChunk } from './constants';

export interface ChunkSource {
  generate(cx: number, cz: number): Promise<Uint8Array>;
  generateLocal(cx: number, cz: number): Uint8Array;
  dispose(): void;
}

export interface ChunkManagerOptions {
  worldId: string;
  seed: string;
  renderDistance: number;
  generation: ChunkSource;
  onChunkLoaded?: (chunk: Chunk) => void;
  onChunkUnloaded?: (chunk: Chunk) => void;
  onGenerationError?: (error: Error) => void;
}

interface PendingGeneration {
  sequence: number;
  epoch: number;
}

export interface ChunkStats {
  loaded: number;
  pending: number;
  dirtyMeshes: number;
  renderDistance: number;
}

const MAX_GENERATION_IN_FLIGHT = 4;
const UNLOAD_PADDING = 3;

export class ChunkManager {
  readonly worldId: string;
  private readonly generation: ChunkSource;
  private readonly chunks = new Map<string, Chunk>();
  private readonly pending = new Map<string, PendingGeneration>();
  private readonly dirtyMeshes = new Set<string>();
  private readonly retryAfter = new Map<string, number>();
  private readonly options: ChunkManagerOptions;
  private cachedChunk: Chunk | null = null;
  private renderDistanceValue: number;
  private disposed = false;
  private epoch = 0;
  private requestSequence = 0;

  constructor(options: ChunkManagerOptions) {
    this.options = options;
    this.worldId = options.worldId;
    this.generation = options.generation;
    this.renderDistanceValue = options.renderDistance;
  }

  get renderDistance(): number {
    return this.renderDistanceValue;
  }

  setRenderDistance(value: number): void {
    this.renderDistanceValue = Math.max(1, Math.floor(value));
  }

  update(playerX: number, playerZ: number): void {
    if (this.disposed) return;
    const playerCX = worldToChunk(playerX);
    const playerCZ = worldToChunk(playerZ);
    const dataRadius = this.renderDistanceValue + 1;
    const now = performance.now();
    const candidates: Array<{ cx: number; cz: number; distance: number }> = [];

    for (let dz = -dataRadius; dz <= dataRadius; dz++) {
      for (let dx = -dataRadius; dx <= dataRadius; dx++) {
        const cx = playerCX + dx;
        const cz = playerCZ + dz;
        const key = chunkKey(cx, cz);
        if (this.chunks.has(key) || this.pending.has(key)) continue;
        const retry = this.retryAfter.get(key);
        if (retry !== undefined && retry > now) continue;
        candidates.push({ cx, cz, distance: dx * dx + dz * dz });
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    for (const candidate of candidates) {
      if (this.pending.size >= MAX_GENERATION_IN_FLIGHT) break;
      this.requestChunk(candidate.cx, candidate.cz);
    }

    const unloadRadius = this.renderDistanceValue + UNLOAD_PADDING;
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - playerCX) > unloadRadius || Math.abs(chunk.cz - playerCZ) > unloadRadius) {
        this.chunks.delete(key);
        this.dirtyMeshes.delete(key);
        this.cachedChunk = null;
        this.options.onChunkUnloaded?.(chunk);
        this.markNeighborsDirty(chunk.cx, chunk.cz);
      }
    }
  }

  getBlock(x: number, y: number, z: number): BlockId {
    if (y < 0) return BlockId.Bedrock;
    if (y >= CHUNK_HEIGHT) return BlockId.Air;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    let chunk = this.cachedChunk;
    if (!chunk || chunk.cx !== cx || chunk.cz !== cz) {
      chunk = this.chunks.get(chunkKey(cx, cz)) ?? null;
      this.cachedChunk = chunk;
    }
    if (!chunk) return BlockId.Air;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    return chunk.getLocal(lx, y, lz);
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    const block = this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return block !== BlockId.Air && block !== BlockId.Water;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  getChunkAtWorld(x: number, z: number): Chunk | undefined {
    return this.getChunk(worldToChunk(x), worldToChunk(z));
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  setBlock(x: number, y: number, z: number, block: BlockId): boolean {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const cx = worldToChunk(x);
    const cz = worldToChunk(z);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return false;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    if (chunk.getLocal(lx, y, lz) === block) return false;
    chunk.setLocal(lx, y, lz, block);
    this.markChunkDirty(cx, cz);
    if (lx === 0) this.markChunkDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markChunkDirty(cx + 1, cz);
    if (lz === 0) this.markChunkDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markChunkDirty(cx, cz + 1);
    if (lx === 0 && lz === 0) this.markChunkDirty(cx - 1, cz - 1);
    if (lx === CHUNK_SIZE - 1 && lz === 0) this.markChunkDirty(cx + 1, cz - 1);
    if (lx === 0 && lz === CHUNK_SIZE - 1) this.markChunkDirty(cx - 1, cz + 1);
    if (lx === CHUNK_SIZE - 1 && lz === CHUNK_SIZE - 1) this.markChunkDirty(cx + 1, cz + 1);
    return true;
  }

  markChunkDirty(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (this.chunks.has(key)) this.dirtyMeshes.add(key);
  }

  markNeighborsDirty(cx: number, cz: number): void {
    this.markChunkDirty(cx - 1, cz);
    this.markChunkDirty(cx + 1, cz);
    this.markChunkDirty(cx, cz - 1);
    this.markChunkDirty(cx, cz + 1);
    this.markChunkDirty(cx - 1, cz - 1);
    this.markChunkDirty(cx + 1, cz - 1);
    this.markChunkDirty(cx - 1, cz + 1);
    this.markChunkDirty(cx + 1, cz + 1);
  }

  /**
   * Returns one ready chunk to re-mesh. A chunk is only eligible once all eight
   * neighboring chunk columns exist, which keeps face culling and AO seamless
   * across chunk borders.
   */
  takeMeshJob(playerX: number, playerZ: number): Chunk | null {
    const playerCX = worldToChunk(playerX);
    const playerCZ = worldToChunk(playerZ);
    let best: Chunk | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const key of this.dirtyMeshes) {
      const chunk = this.chunks.get(key);
      if (!chunk) {
        this.dirtyMeshes.delete(key);
        continue;
      }
      if (Math.abs(chunk.cx - playerCX) > this.renderDistanceValue || Math.abs(chunk.cz - playerCZ) > this.renderDistanceValue) {
        continue;
      }
      if (!this.hasAllNeighbors(chunk.cx, chunk.cz)) continue;
      const dx = chunk.cx - playerCX;
      const dz = chunk.cz - playerCZ;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = chunk;
      }
    }

    if (best) {
      this.dirtyMeshes.delete(chunkKey(best.cx, best.cz));
    }
    return best;
  }

  hasAllNeighbors(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.chunks.has(chunkKey(cx + dx, cz + dz))) return false;
      }
    }
    return true;
  }

  countLoadedWithin(centerX: number, centerZ: number, radius: number): number {
    const pcx = worldToChunk(centerX);
    const pcz = worldToChunk(centerZ);
    let count = 0;
    for (const chunk of this.chunks.values()) {
      if (Math.abs(chunk.cx - pcx) <= radius && Math.abs(chunk.cz - pcz) <= radius) count++;
    }
    return count;
  }

  getStats(): ChunkStats {
    return {
      loaded: this.chunks.size,
      pending: this.pending.size,
      dirtyMeshes: this.dirtyMeshes.size,
      renderDistance: this.renderDistanceValue,
    };
  }

  getAllChunks(): IterableIterator<Chunk> {
    return this.chunks.values();
  }

  dispose(): void {
    this.disposed = true;
    this.epoch++;
    this.chunks.clear();
    this.pending.clear();
    this.dirtyMeshes.clear();
    this.retryAfter.clear();
    this.cachedChunk = null;
  }

  private requestChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const sequence = ++this.requestSequence;
    const requestEpoch = this.epoch;
    this.pending.set(key, { sequence, epoch: requestEpoch });
    this.generation
      .generate(cx, cz)
      .then((blocks) => {
        this.finishGeneration(cx, cz, blocks, sequence, requestEpoch);
      })
      .catch((error: unknown) => {
        if (this.disposed || requestEpoch !== this.epoch || this.pending.get(key)?.sequence !== sequence) return;
        this.pending.delete(key);
        const err = error instanceof Error ? error : new Error(String(error));
        this.options.onGenerationError?.(err);
        this.retryAfter.set(key, performance.now() + 1500);
        // Guarantee world continuity even if the worker pool has failed.
        try {
          const blocks = this.generation.generateLocal(cx, cz);
          this.finishGeneration(cx, cz, blocks, sequence, requestEpoch);
          this.retryAfter.delete(key);
        } catch (fallbackError) {
          console.error('Chunk generation failed', fallbackError);
        }
      });
  }

  private finishGeneration(cx: number, cz: number, blocks: Uint8Array, sequence: number, epoch: number): void {
    if (this.disposed || epoch !== this.epoch) return;
    const key = chunkKey(cx, cz);
    const pending = this.pending.get(key);
    if (!pending || pending.sequence !== sequence || pending.epoch !== epoch) return;
    this.pending.delete(key);
    if (this.chunks.has(key)) return;
    const chunk = new Chunk(cx, cz, blocks);
    this.chunks.set(key, chunk);
    this.cachedChunk = null;
    this.options.onChunkLoaded?.(chunk);
    this.dirtyMeshes.add(key);
  }
}
