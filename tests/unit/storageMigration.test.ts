import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  WorldStorage,
  normalizeWorldRecord,
  type PlayerSaveV2,
  type SaveBundle,
  type V1WorldRecord,
  type WorldRecord,
} from '../../src/persistence/WorldStorage';
import { BlockId } from '../../src/world/BlockRegistry';
import { createItemStack } from '../../src/items/ItemStack';

interface Fixture {
  label: string;
  world: V1WorldRecord;
  chunkEdits: Array<{
    id: string;
    worldId: string;
    cx: number;
    cz: number;
    edits: Record<string, number>;
  }>;
}

function fixture(name: string): Fixture {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/v1-worlds/${name}`, import.meta.url), 'utf8'),
  ) as Fixture;
}

const databases: string[] = [];

async function seedV1Database(dbName: string, fixtures: Fixture[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const worlds = db.createObjectStore('worlds', { keyPath: 'id' });
      worlds.createIndex('lastPlayed', 'lastPlayed');
      const edits = db.createObjectStore('chunkEdits', { keyPath: 'id' });
      edits.createIndex('worldId', 'worldId');
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['worlds', 'chunkEdits'], 'readwrite');
      const worlds = tx.objectStore('worlds');
      const edits = tx.objectStore('chunkEdits');
      for (const entry of fixtures) {
        worlds.put(entry.world);
        for (const record of entry.chunkEdits) edits.put(record);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteDatabase(dbName: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

afterEach(async () => {
  for (const name of databases.splice(0)) await deleteDatabase(name);
});

describe('V1 → V2 storage migration', () => {
  it('loads all three V1 fixtures without mutating their numeric data', async () => {
    const dbName = `voxelcraft-migration-${Math.random().toString(36).slice(2)}`;
    databases.push(dbName);
    const coastal = fixture('coastal-v1.json');
    const negative = fixture('negative-chunks-v1.json');
    const unvisited = fixture('unvisited-v1.json');
    await seedV1Database(dbName, [coastal, negative, unvisited]);

    const storage = new WorldStorage(dbName);
    await storage.init();
    const coastalLoaded = await storage.loadBundle(coastal.world.id);
    const negativeLoaded = await storage.loadBundle(negative.world.id);
    const unvisitedLoaded = await storage.loadBundle(unvisited.world.id);

    expect(coastalLoaded?.legacySchema).toBe(true);
    expect(coastalLoaded?.world.schemaVersion).toBe(2);
    expect(coastalLoaded?.world.mode).toBe('creative');
    expect(coastalLoaded?.world.generatorVersion).toBe(1);
    expect(coastalLoaded?.world.difficulty).toBe('peaceful');
    expect(coastalLoaded?.player?.inventory).toHaveLength(36);
    expect(coastalLoaded?.player?.position).toEqual([8.5, 54.00001, 16.5]);
    expect(coastalLoaded?.edits.get('0,1')?.get(1299)).toBe(BlockId.Planks);
    expect(coastalLoaded?.edits.get('0,1')?.get(1300)).toBe(BlockId.Glass);

    expect(negativeLoaded?.edits.get('-2,-3')?.get(0)).toBe(BlockId.Bedrock);
    expect(negativeLoaded?.edits.get('-2,-3')?.get(257)).toBe(BlockId.Cobblestone);
    expect(negativeLoaded?.edits.get('-1,2')?.get(1024)).toBe(BlockId.Planks);
    expect(negativeLoaded?.player?.position).toEqual([-20.5, 61.25, -35.5]);

    expect(unvisitedLoaded?.player).toBeNull();
    expect(unvisitedLoaded?.legacySchema).toBe(true);
    storage.close();
  });

  it('writes a single V2 snapshot and restores player, edits, furnace and entities', async () => {
    const dbName = `voxelcraft-v2-${Math.random().toString(36).slice(2)}`;
    databases.push(dbName);
    const coastal = fixture('coastal-v1.json');
    await seedV1Database(dbName, [coastal]);
    const storage = new WorldStorage(dbName);
    await storage.init();
    const loaded = await storage.loadBundle(coastal.world.id);
    expect(loaded).not.toBeNull();

    const world: WorldRecord = {
      ...loaded!.world,
      name: 'Migrated Survival',
      mode: 'survival',
      difficulty: 'normal',
      generatorVersion: 2,
      lastPlayed: 2_000,
      lastPlayedAt: 2_000,
    };
    const ironPickaxe = createItemStack('base:iron_pickaxe', 1, 250)!;
    const planks = createItemStack('base:oak_planks', 12)!;
    const player: PlayerSaveV2 = {
      schemaVersion: 2,
      worldId: world.id,
      position: [4, 50, -6],
      velocity: [0, 0, 0],
      yaw: 0.5,
      pitch: 0.1,
      inventory: [ironPickaxe, planks, ...Array.from({ length: 34 }, () => null)],
      selectedHotbarSlot: 0,
      stats: {
        health: 20,
        maxHealth: 20,
        hunger: 20,
        saturation: 5,
        exhaustion: 0,
        invulnerableUntilTick: 0,
      },
    };
    const bundle: SaveBundle = {
      world,
      player,
      chunkDeltas: [
        {
          cx: 0,
          cz: 1,
          overrides: new Map([
            [1299, BlockId.IronOre],
            [1300, BlockId.Furnace],
          ]),
        },
      ],
      furnaces: [
        {
          id: 'furnace:5,49,0',
          x: 5,
          y: 49,
          z: 0,
          input: createItemStack('base:raw_iron', 2),
          fuel: createItemStack('base:coal', 1),
          output: createItemStack('base:iron_ingot', 1),
          remainingFuelTicks: 400,
          burnDurationTicks: 4800,
          cookProgressTicks: 120,
          revision: 3,
        },
      ],
      itemEntities: [
        {
          id: 'item-test',
          itemId: 'base:oak_log',
          count: 2,
          x: 1,
          y: 52,
          z: 3,
          vx: 0,
          vy: 0,
          vz: 0,
          ageSeconds: 1,
          pickupDelaySeconds: 0,
        },
      ],
      saveSequence: 7,
    };
    await storage.saveBundle(bundle);
    storage.close();

    const reopened = new WorldStorage(dbName);
    await reopened.init();
    const restored = await reopened.loadBundle(world.id);
    expect(restored?.legacySchema).toBe(false);
    expect(restored?.world.mode).toBe('survival');
    expect(restored?.world.difficulty).toBe('normal');
    expect(restored?.player?.position).toEqual([4, 50, -6]);
    expect(restored?.player?.inventory[0]?.itemId).toBe('base:iron_pickaxe');
    expect(restored?.player?.inventory[0]?.durability).toBe(250);
    expect(restored?.player?.inventory[1]?.count).toBe(12);
    expect(restored?.edits.get('0,1')?.get(1299)).toBe(BlockId.IronOre);
    expect(restored?.edits.get('0,1')?.get(1300)).toBe(BlockId.Furnace);
    expect(restored?.furnaces[0]?.input?.count).toBe(2);
    expect(restored?.furnaces[0]?.cookProgressTicks).toBe(120);
    expect(restored?.itemEntities[0]?.itemId).toBe('base:oak_log');
    expect(restored?.saveMeta?.sequence).toBe(7);
    reopened.close();
  });

  it('normalizes legacy records for the world list', () => {
    const raw = fixture('coastal-v1.json').world;
    const normalized = normalizeWorldRecord(raw);
    expect(normalized.schemaVersion).toBe(2);
    expect(normalized.mode).toBe('creative');
    expect(normalized.generatorVersion).toBe(1);
    expect(normalized.lastPlayedAt).toBe(raw.lastPlayed);
    expect(normalized.version).toBe(2);
  });
});
