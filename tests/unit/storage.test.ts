import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, WorldStorage } from '../../src/persistence/storage';
import type { WorldSave } from '../../src/core/types';

function save(id: string, name: string): WorldSave {
  return {
    schema: 2, generator: 1,
    metadata: { id, name, seed: `seed-${id}`, mode: 'survival', createdAt: 10, updatedAt: 10, version: 1 },
    player: { position: { x: 1, y: 30, z: 1 }, yaw: 0, pitch: 0, health: 20, hunger: 20, oxygen: 10, time: 12, inventory: [], selected: 0 },
    edits: { '1,2,3': 4 }, furnaces: {}, drops: [],
  };
}
async function resetDatabase() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('voxelcraft-k3');
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => resolve();
  });
}
beforeEach(resetDatabase);

describe('IndexedDB world storage', () => {
  it('isolates worlds and returns only their own edits', async () => {
    const storage = new WorldStorage();
    const a = save('a', 'Alpha'); const b = save('b', 'Beta');
    b.edits = { '9,9,9': 2 }; b.metadata.seed = 'other';
    await storage.save(a); await storage.save(b);
    const loadedA = await storage.load('a'), loadedB = await storage.load('b');
    expect(loadedA?.edits).toEqual(a.edits);
    expect(loadedB?.edits).toEqual(b.edits);
    expect((await storage.list()).map(w => w.name).sort()).toEqual(['Alpha', 'Beta']);
    storage.close();
  });

  it('serializes overlapping saves so the newest snapshot wins', async () => {
    const storage = new WorldStorage();
    const base = save('serial', 'Serial');
    await storage.save(base);
    const first = structuredClone(base); first.player.position.x = 2; first.edits['1,2,3'] = 5;
    const second = structuredClone(base); second.player.position.x = 3; second.edits['1,2,3'] = 6;
    await Promise.all([storage.save(first), storage.save(second)]);
    const loaded = await storage.load('serial');
    expect(loaded?.player.position.x).toBe(3);
    expect(loaded?.edits['1,2,3']).toBe(6);
    storage.close();
  });

  it('deletes one world without touching another', async () => {
    const storage = new WorldStorage();
    await storage.save(save('keep', 'Keep')); await storage.save(save('remove', 'Remove'));
    await storage.delete('remove');
    expect(await storage.load('remove')).toBeNull();
    expect((await storage.load('keep'))?.metadata.name).toBe('Keep');
    storage.close();
  });

  it('exports and imports a copy with a new id', async () => {
    const storage = new WorldStorage();
    await storage.save(save('original', 'Original'));
    const json = await storage.export('original');
    const imported = await storage.import(json);
    expect(imported.metadata.id).not.toBe('original');
    expect(imported.edits).toEqual({ '1,2,3': 4 });
    expect(await storage.list()).toHaveLength(2);
    storage.close();
  });

  it('rejects unsupported save versions and migrates schema 1', () => {
    expect(() => migrate({ schema: 99, player: {}, metadata: {} })).toThrow(/unsupported/i);
    const legacy = save('legacy', 'Legacy') as unknown as Record<string, unknown>;
    legacy.schema = 1; legacy.furnaces = undefined; legacy.drops = undefined;
    const migrated = migrate(legacy);
    expect(migrated.schema).toBe(2);
    expect(migrated.furnaces).toEqual({});
    expect(migrated.drops).toEqual([]);
  });
});
