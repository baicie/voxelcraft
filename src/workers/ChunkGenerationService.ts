import { WorldGenerator } from '../world/WorldGenerator';
import type { GenerationRequest, GenerationResponse } from './protocol';

interface PendingRequest {
  resolve: (blocks: Uint8Array) => void;
  reject: (error: Error) => void;
  slot: WorkerSlot | null;
}

interface WorkerSlot {
  worker: Worker;
  active: number;
  dead: boolean;
}

/**
 * Small worker pool for terrain generation. Falls back to synchronous
 * generation when workers are unavailable or fail, so the world always loads.
 */
export class ChunkGenerationService {
  private readonly seed: string;
  private readonly generatorVersion: number;
  private readonly slots: WorkerSlot[] = [];
  private readonly pending = new Map<number, PendingRequest>();
  private readonly localGenerator: WorldGenerator;
  private nextRequestId = 1;
  private disposed = false;

  constructor(seed: string, generatorVersion = 2, workerCount?: number) {
    this.seed = seed;
    this.generatorVersion = generatorVersion;
    this.localGenerator = new WorldGenerator(seed, generatorVersion);

    if (typeof Worker === 'undefined') return;
    const hardware = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const count = workerCount ?? Math.max(1, Math.min(2, hardware - 1));
    for (let i = 0; i < count; i++) {
      try {
        const worker = new Worker(new URL('./generationWorker.ts', import.meta.url), {
          type: 'module',
          name: `voxel-gen-${i}`,
        });
        const slot: WorkerSlot = { worker, active: 0, dead: false };
        worker.onmessage = (event: MessageEvent<GenerationResponse>) => this.handleResponse(slot, event.data);
        worker.onerror = () => this.handleWorkerFailure(slot, new Error('Terrain worker crashed'));
        this.slots.push(slot);
      } catch (error) {
        console.warn('Terrain worker unavailable, using main-thread generation.', error);
      }
    }
  }

  generate(cx: number, cz: number): Promise<Uint8Array> {
    if (this.disposed) return Promise.reject(new Error('Generation service disposed'));
    if (this.slots.length === 0) {
      return Promise.resolve().then(() => this.localGenerator.generateChunk(cx, cz));
    }

    return new Promise<Uint8Array>((resolve, reject) => {
      const id = this.nextRequestId++;
      const slot = this.pickSlot();
      this.pending.set(id, { resolve, reject, slot });
      if (!slot) {
        // No live worker: complete immediately on the main thread.
        const pending = this.pending.get(id);
        this.pending.delete(id);
        try {
          pending?.resolve(this.localGenerator.generateChunk(cx, cz));
        } catch (error) {
          pending?.reject(error instanceof Error ? error : new Error(String(error)));
        }
        return;
      }

      slot.active++;
      const request: GenerationRequest = {
        type: 'generate',
        id,
        seed: this.seed,
        generatorVersion: this.generatorVersion,
        cx,
        cz,
      };
      slot.worker.postMessage(request);
    });
  }

  generateLocal(cx: number, cz: number): Uint8Array {
    return this.localGenerator.generateChunk(cx, cz);
  }

  dispose(): void {
    this.disposed = true;
    for (const slot of this.slots) {
      slot.dead = true;
      slot.worker.terminate();
    }
    this.slots.length = 0;
    for (const request of this.pending.values()) {
      request.reject(new Error('Generation service disposed'));
    }
    this.pending.clear();
  }

  private pickSlot(): WorkerSlot | null {
    let best: WorkerSlot | null = null;
    for (const slot of this.slots) {
      if (slot.dead) continue;
      if (!best || slot.active < best.active) best = slot;
    }
    return best;
  }

  private handleResponse(slot: WorkerSlot, response: GenerationResponse): void {
    slot.active = Math.max(0, slot.active - 1);
    const request = this.pending.get(response.id);
    if (!request) return;
    this.pending.delete(response.id);
    if (response.type === 'generated') {
      request.resolve(new Uint8Array(response.blocks));
    } else {
      request.reject(new Error(response.message));
    }
  }

  private handleWorkerFailure(slot: WorkerSlot, error: Error): void {
    if (slot.dead) return;
    slot.dead = true;
    slot.worker.terminate();
    console.warn('Terrain worker failed; remaining work will use the main thread.', error);
    for (const [id, request] of this.pending) {
      if (request.slot === slot) {
        this.pending.delete(id);
        request.reject(error);
      }
    }
  }
}
