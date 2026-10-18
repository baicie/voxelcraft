import { describe, expect, it } from 'vitest';
import { ChunkManager, type ChunkSource } from '../../src/world/ChunkManager';
import type { Chunk } from '../../src/world/Chunk';
import type { ChunkGenerationService } from '../../src/workers/ChunkGenerationService';

class DeferredSource implements ChunkSource {
  readonly requests: Array<{
    cx: number;
    cz: number;
    resolve: (blocks: Uint8Array) => void;
    reject: (error: Error) => void;
  }> = [];

  generate(cx: number, cz: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      this.requests.push({ cx, cz, resolve, reject });
    });
  }

  generateLocal(): Uint8Array {
    return new Uint8Array(16 * 16 * 128);
  }

  dispose(): void {
    // no-op
  }
}

function createManager(source: DeferredSource, onLoaded: (chunk: Chunk) => void): ChunkManager {
  return new ChunkManager({
    worldId: 'test-world',
    seed: 'epoch-test',
    renderDistance: 1,
    generation: source,
    onChunkLoaded: onLoaded,
  });
}

describe('ChunkManager epoch guard', () => {
  it('discards a generation result that arrives after disposal', async () => {
    const source = new DeferredSource();
    const loaded: Chunk[] = [];
    const manager = createManager(source, (chunk) => loaded.push(chunk));

    manager.update(8, 8);
    expect(source.requests.length).toBeGreaterThan(0);

    manager.dispose();
    source.requests[0]!.resolve(new Uint8Array(16 * 16 * 128));
    await Promise.resolve();
    await Promise.resolve();

    expect(loaded).toHaveLength(0);
    expect(manager.getStats().loaded).toBe(0);
  });

  it('accepts a current result and deduplicates in-flight generation', async () => {
    const source = new DeferredSource();
    const loaded: Chunk[] = [];
    const manager = createManager(source, (chunk) => loaded.push(chunk));

    manager.update(8, 8);
    const requestCount = source.requests.length;
    manager.update(8, 8);
    expect(source.requests.length).toBe(requestCount);

    source.requests[0]!.resolve(new Uint8Array(16 * 16 * 128));
    await Promise.resolve();
    await Promise.resolve();

    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.cx).toBe(0);
    expect(loaded[0]!.cz).toBe(0);
    expect(manager.getStats().loaded).toBe(1);
    manager.dispose();
  });
});

// Compile-time guard: the concrete service still satisfies the injectable source.
const _typeCheck: ChunkSource = {} as ChunkGenerationService;
void _typeCheck;
