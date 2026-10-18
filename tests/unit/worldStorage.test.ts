import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorldStorage, type WorldRecord } from '../../src/persistence/WorldStorage';
import { BlockId } from '../../src/world/BlockRegistry';

function makeWorld(id: string): WorldRecord {
  return {
    id,
    name: 'Storage Test',
    seed: 'storage-seed',
    schemaVersion: 2,
    generatorVersion: 2,
    mode: 'creative',
    difficulty: 'peaceful',
    cheatsEnabled: false,
    createdAt: 1_000,
    lastPlayed: 1_500,
    lastPlayedAt: 1_500,
    player: { x: 1.5, y: 45, z: -8.5, yaw: 0.4, pitch: 0.1 },
    hotbar: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    selectedSlot: 4,
    timeOfDay: 0.42,
    renderDistance: 4,
    version: 2,
  };
}

describe('WorldStorage', () => {
  let storage: WorldStorage;
  let dbName: string;

  beforeEach(async () => {
    dbName = `voxelcraft-test-${Math.random().toString(36).slice(2)}`;
    storage = new WorldStorage(dbName);
    await storage.init();
  });

  afterEach(async () => {
    storage.close();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });

  it('persists and lists world metadata by last played', async () => {
    const older = makeWorld('older');
    older.lastPlayed = 100;
    const newer = makeWorld('newer');
    newer.lastPlayed = 500;
    await storage.putWorld(older);
    await storage.putWorld(newer);

    const worlds = await storage.listWorlds();
    expect(worlds.map((world) => world.id)).toEqual(['newer', 'older']);
    expect((await storage.getWorld('older'))?.player?.x).toBe(1.5);
    expect(await storage.getWorld('missing')).toBeNull();
  });

  it('saves and restores chunk edit overlays', async () => {
    const world = makeWorld('edits');
    await storage.putWorld(world);

    await storage.saveChunkEdits(
      world.id,
      0,
      0,
      new Map<number, BlockId>([
        [1, BlockId.Air],
        [2, BlockId.Planks],
        [3, BlockId.Glass],
      ]),
    );
    await storage.saveChunkEdits(world.id, -1, 4, new Map<number, BlockId>([[7, BlockId.Stone]]));
    await storage.saveChunkEdits('other-world', 0, 0, new Map<number, BlockId>([[9, BlockId.Sand]]));

    const edits = await storage.loadAllEdits(world.id);
    expect(edits.size).toBe(2);
    expect(edits.get('0,0')?.get(2)).toBe(BlockId.Planks);
    expect(edits.get('-1,4')?.get(7)).toBe(BlockId.Stone);
    expect(edits.get('0,0')?.has(1)).toBe(true);
    expect(edits.get('0,0')?.get(1)).toBe(BlockId.Air);
  });

  it('deletes a world and all of its chunk edits', async () => {
    const world = makeWorld('delete-me');
    await storage.putWorld(world);
    await storage.saveChunkEdits(world.id, 2, 2, new Map<number, BlockId>([[10, BlockId.Air]]));

    await storage.deleteWorld(world.id);

    expect(await storage.getWorld(world.id)).toBeNull();
    expect((await storage.loadAllEdits(world.id)).size).toBe(0);
  });
});
