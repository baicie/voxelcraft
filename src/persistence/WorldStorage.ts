import type { FurnaceSave } from '../furnace/FurnaceStore';
import type { ItemEntitySave } from '../entities/ItemEntity';
import { isValidStack, type ItemStack } from '../items/ItemStack';
import {
  BlockId,
  V1_BLOCK_ID_TO_STABLE,
  blockIdFromStableId,
  getBlockStableId,
} from '../world/BlockRegistry';
import { chunkKey } from '../world/constants';

export type WorldMode = 'creative' | 'survival';
export type WorldDifficulty = 'peaceful' | 'normal';
export const SAVE_SCHEMA_VERSION = 2;

export interface PlayerSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface PlayerStatsSnapshot {
  health: number;
  maxHealth: number;
  hunger: number;
  saturation: number;
  exhaustion: number;
  invulnerableUntilTick: number;
}

export interface PlayerSaveV2 {
  schemaVersion: 2;
  worldId: string;
  position: [number, number, number];
  velocity: [number, number, number];
  yaw: number;
  pitch: number;
  inventory: Array<ItemStack | null>;
  selectedHotbarSlot: number;
  stats: PlayerStatsSnapshot;
  spawnPoint?: [number, number, number];
}

export interface SaveMeta {
  worldId: string;
  worldName: string;
  sequence: number;
  lastSavedAt: number;
  migrationStatus: 'complete' | 'legacy';
}

export interface WorldRecord {
  id: string;
  name: string;
  seed: string;
  schemaVersion: 2;
  generatorVersion: number;
  mode: WorldMode;
  difficulty: WorldDifficulty;
  cheatsEnabled: boolean;
  createdAt: number;
  lastPlayed: number;
  lastPlayedAt: number;
  player: PlayerSnapshot | null;
  hotbar: number[];
  selectedSlot: number;
  timeOfDay: number;
  renderDistance: number;
  version: 1 | 2;
}

/** V1 record shape kept for explicit migration. */
export interface V1WorldRecord {
  id: string;
  name: string;
  seed: string;
  createdAt: number;
  lastPlayed: number;
  player: PlayerSnapshot | null;
  hotbar: number[];
  selectedSlot: number;
  timeOfDay: number;
  renderDistance: number;
  gameMode?: WorldMode;
  version?: number;
}

interface ChunkEditRecordV1 {
  id: string;
  worldId: string;
  cx: number;
  cz: number;
  edits: Record<string, number>;
}

interface ChunkDeltaRecordV2 {
  key: string;
  worldId: string;
  cx: number;
  cz: number;
  revision: number;
  overrides: Array<[number, string]>;
}

interface BlockEntityRecord {
  key: string;
  worldId: string;
  type: 'furnace';
  state: FurnaceSave;
  revision: number;
}

interface EntityRecord {
  key: string;
  worldId: string;
  entity: ItemEntitySave;
}

export interface ChunkDeltaSnapshot {
  cx: number;
  cz: number;
  overrides: Map<number, BlockId>;
}

export interface LoadedWorldData {
  world: WorldRecord;
  player: PlayerSaveV2 | null;
  edits: Map<string, Map<number, BlockId>>;
  furnaces: FurnaceSave[];
  itemEntities: ItemEntitySave[];
  saveMeta: SaveMeta | null;
  legacySchema: boolean;
}

export interface SaveBundle {
  world: WorldRecord;
  player: PlayerSaveV2;
  chunkDeltas: ChunkDeltaSnapshot[];
  furnaces: FurnaceSave[];
  itemEntities: ItemEntitySave[];
  saveSequence: number;
}

const DB_NAME = 'voxelcraft-db';
const DB_VERSION = 2;
const WORLDS_STORE = 'worlds';
const PLAYERS_STORE = 'players';
const LEGACY_EDITS_STORE = 'chunkEdits';
const CHUNK_DELTAS_STORE = 'chunkDeltas';
const BLOCK_ENTITIES_STORE = 'blockEntities';
const ENTITIES_STORE = 'entities';
const SAVE_META_STORE = 'saveMeta';

export const DEFAULT_PLAYER_STATS: PlayerStatsSnapshot = {
  health: 20,
  maxHealth: 20,
  hunger: 20,
  saturation: 5,
  exhaustion: 0,
  invulnerableUntilTick: 0,
};

export class WorldStorage {
  private readonly dbName: string;
  private db: IDBDatabase | null = null;

  constructor(dbName = DB_NAME) {
    this.dbName = dbName;
  }

  async init(): Promise<void> {
    if (this.db) return;
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available in this browser');
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(WORLDS_STORE)) {
          const worlds = database.createObjectStore(WORLDS_STORE, { keyPath: 'id' });
          worlds.createIndex('lastPlayed', 'lastPlayed');
        }
        // Keep the V1 store for non-destructive migration.
        if (!database.objectStoreNames.contains(LEGACY_EDITS_STORE)) {
          const legacy = database.createObjectStore(LEGACY_EDITS_STORE, { keyPath: 'id' });
          legacy.createIndex('worldId', 'worldId');
        }
        if (!database.objectStoreNames.contains(PLAYERS_STORE)) {
          database.createObjectStore(PLAYERS_STORE, { keyPath: 'worldId' });
        }
        if (!database.objectStoreNames.contains(CHUNK_DELTAS_STORE)) {
          const deltas = database.createObjectStore(CHUNK_DELTAS_STORE, { keyPath: 'key' });
          deltas.createIndex('worldId', 'worldId');
        }
        if (!database.objectStoreNames.contains(BLOCK_ENTITIES_STORE)) {
          const blockEntities = database.createObjectStore(BLOCK_ENTITIES_STORE, { keyPath: 'key' });
          blockEntities.createIndex('worldId', 'worldId');
        }
        if (!database.objectStoreNames.contains(ENTITIES_STORE)) {
          const entities = database.createObjectStore(ENTITIES_STORE, { keyPath: 'key' });
          entities.createIndex('worldId', 'worldId');
        }
        if (!database.objectStoreNames.contains(SAVE_META_STORE)) {
          database.createObjectStore(SAVE_META_STORE, { keyPath: 'worldId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
      request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another tab'));
    });
  }

  async listWorlds(): Promise<WorldRecord[]> {
    const database = this.requireDb();
    const store = database.transaction(WORLDS_STORE, 'readonly').objectStore(WORLDS_STORE);
    const records = await requestToPromise<Array<WorldRecord | V1WorldRecord>>(store.getAll());
    return records
      .map((record) => normalizeWorldRecord(record))
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
  }

  async getWorld(id: string): Promise<WorldRecord | null> {
    const database = this.requireDb();
    const store = database.transaction(WORLDS_STORE, 'readonly').objectStore(WORLDS_STORE);
    const record = await requestToPromise<WorldRecord | V1WorldRecord | undefined>(store.get(id));
    return record ? normalizeWorldRecord(record) : null;
  }

  async putWorld(world: WorldRecord): Promise<void> {
    const database = this.requireDb();
    const transaction = database.transaction(WORLDS_STORE, 'readwrite');
    const done = transactionToPromise(transaction);
    transaction.objectStore(WORLDS_STORE).put(normalizeWorldRecord(world));
    await done;
  }

  async loadBundle(worldId: string): Promise<LoadedWorldData | null> {
    const raw = await this.readWorldRaw(worldId);
    if (!raw) return null;
    const legacySchema = !rawHasV2(raw);
    const worldRaw = normalizeWorldRecord(raw);
    const playerRaw = await this.readByKey<PlayerSaveV2>(PLAYERS_STORE, worldId);
    const saveMeta = await this.readByKey<SaveMeta>(SAVE_META_STORE, worldId);
    const player = sanitizePlayer(playerRaw, worldRaw);
    const edits = await this.loadEditMaps(worldId);
    const blockEntities = await this.readWorldRecords<BlockEntityRecord>(BLOCK_ENTITIES_STORE, worldId);
    const entityRecords = await this.readWorldRecords<EntityRecord>(ENTITIES_STORE, worldId);
    return {
      world: worldRaw,
      player,
      edits,
      furnaces: blockEntities
        .filter((record) => record.type === 'furnace' && record.state)
        .map((record) => record.state),
      itemEntities: entityRecords.map((record) => record.entity).filter(Boolean),
      saveMeta,
      legacySchema,
    };
  }

  async saveBundle(bundle: SaveBundle): Promise<void> {
    const database = this.requireDb();
    const storeNames = [
      WORLDS_STORE,
      PLAYERS_STORE,
      CHUNK_DELTAS_STORE,
      BLOCK_ENTITIES_STORE,
      ENTITIES_STORE,
      SAVE_META_STORE,
    ];
    const transaction = database.transaction(storeNames, 'readwrite');
    const done = transactionToPromise(transaction);
    const world = normalizeWorldRecord(bundle.world);
    transaction.objectStore(WORLDS_STORE).put(world);
    transaction.objectStore(PLAYERS_STORE).put(sanitizePlayerSave(bundle.player, world.id));

    const deltaStore = transaction.objectStore(CHUNK_DELTAS_STORE);
    for (const chunk of bundle.chunkDeltas) {
      const key = `${world.id}:${chunk.cx},${chunk.cz}`;
      const overrides: Array<[number, string]> = [];
      for (const [index, block] of chunk.overrides) {
        if (Number.isInteger(index) && index >= 0) overrides.push([index, getBlockStableId(block)]);
      }
      const record: ChunkDeltaRecordV2 = {
        key,
        worldId: world.id,
        cx: chunk.cx,
        cz: chunk.cz,
        revision: bundle.saveSequence,
        overrides,
      };
      deltaStore.put(record);
    }

    const furnaceKeys = new Set<string>();
    const blockStore = transaction.objectStore(BLOCK_ENTITIES_STORE);
    for (const furnace of bundle.furnaces) {
      const key = `${world.id}:${furnace.x},${furnace.y},${furnace.z}`;
      furnaceKeys.add(key);
      const record: BlockEntityRecord = {
        key,
        worldId: world.id,
        type: 'furnace',
        state: furnace,
        revision: bundle.saveSequence,
      };
      blockStore.put(record);
    }
    deleteMissingForWorld(blockStore, world.id, furnaceKeys);

    const entityKeys = new Set<string>();
    const entityStore = transaction.objectStore(ENTITIES_STORE);
    for (const entity of bundle.itemEntities) {
      const key = `${world.id}:${entity.id}`;
      entityKeys.add(key);
      const record: EntityRecord = { key, worldId: world.id, entity };
      entityStore.put(record);
    }
    deleteMissingForWorld(entityStore, world.id, entityKeys);

    const saveMeta: SaveMeta = {
      worldId: world.id,
      worldName: world.name,
      sequence: bundle.saveSequence,
      lastSavedAt: Date.now(),
      migrationStatus: 'complete',
    };
    transaction.objectStore(SAVE_META_STORE).put(saveMeta);
    await done;
  }

  async loadAllEdits(worldId: string): Promise<Map<string, Map<number, BlockId>>> {
    return this.loadEditMaps(worldId);
  }

  /** Legacy-compatible write path; new runtime uses saveBundle. */
  async saveChunkEdits(worldId: string, cx: number, cz: number, edits: Map<number, BlockId>): Promise<void> {
    const database = this.requireDb();
    const transaction = database.transaction(CHUNK_DELTAS_STORE, 'readwrite');
    const done = transactionToPromise(transaction);
    const key = `${worldId}:${cx},${cz}`;
    const overrides: Array<[number, string]> = [];
    for (const [index, block] of edits) overrides.push([index, getBlockStableId(block)]);
    transaction.objectStore(CHUNK_DELTAS_STORE).put({
      key,
      worldId,
      cx,
      cz,
      revision: 0,
      overrides,
    } satisfies ChunkDeltaRecordV2);
    await done;
  }

  async deleteWorld(id: string): Promise<void> {
    const database = this.requireDb();
    const storeNames = [
      WORLDS_STORE,
      PLAYERS_STORE,
      LEGACY_EDITS_STORE,
      CHUNK_DELTAS_STORE,
      BLOCK_ENTITIES_STORE,
      ENTITIES_STORE,
      SAVE_META_STORE,
    ];
    const transaction = database.transaction(storeNames, 'readwrite');
    const done = transactionToPromise(transaction);
    transaction.objectStore(WORLDS_STORE).delete(id);
    transaction.objectStore(PLAYERS_STORE).delete(id);
    transaction.objectStore(SAVE_META_STORE).delete(id);
    for (const storeName of [LEGACY_EDITS_STORE, CHUNK_DELTAS_STORE, BLOCK_ENTITIES_STORE, ENTITIES_STORE]) {
      deleteMissingForWorld(transaction.objectStore(storeName), id, new Set());
    }
    await done;
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  private async loadEditMaps(worldId: string): Promise<Map<string, Map<number, BlockId>>> {
    const result = new Map<string, Map<number, BlockId>>();
    const legacyRecords = await this.readWorldRecords<ChunkEditRecordV1>(LEGACY_EDITS_STORE, worldId);
    for (const record of legacyRecords) {
      const key = chunkKey(record.cx, record.cz);
      const edits = result.get(key) ?? new Map<number, BlockId>();
      for (const [indexText, numericText] of Object.entries(record.edits)) {
        const index = Number(indexText);
        const numeric = Number(numericText);
        if (!Number.isInteger(index) || index < 0) continue;
        const block = convertV1NumericBlock(numeric);
        if (block === null) {
          console.warn(`Unknown V1 block id ${numericText} in ${worldId}:${key}`);
          continue;
        }
        edits.set(index, block);
      }
      result.set(key, edits);
    }

    const deltaRecords = await this.readWorldRecords<ChunkDeltaRecordV2>(CHUNK_DELTAS_STORE, worldId);
    for (const record of deltaRecords) {
      const key = chunkKey(record.cx, record.cz);
      const edits = new Map<number, BlockId>();
      for (const [index, stableId] of record.overrides) {
        if (!Number.isInteger(index) || index < 0) continue;
        const block = blockIdFromStableId(stableId);
        if (block === null) {
          console.warn(`Unknown V2 block id ${stableId} in ${worldId}:${key}`);
          continue;
        }
        edits.set(index, block);
      }
      result.set(key, edits);
    }
    return result;
  }

  private async readByKey<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
    const database = this.requireDb();
    const store = database.transaction(storeName, 'readonly').objectStore(storeName);
    const record = await requestToPromise<T | undefined>(store.get(key));
    return record ?? null;
  }

  private async readWorldRaw(worldId: string): Promise<WorldRecord | V1WorldRecord | null> {
    return this.readByKey<WorldRecord | V1WorldRecord>(WORLDS_STORE, worldId);
  }

  private async readWorldRecords<T>(storeName: string, worldId: string): Promise<T[]> {
    const database = this.requireDb();
    const store = database.transaction(storeName, 'readonly').objectStore(storeName);
    const index = store.index('worldId');
    return requestToPromise<T[]>(index.getAll(IDBKeyRange.only(worldId)));
  }

  private requireDb(): IDBDatabase {
    if (!this.db) throw new Error('WorldStorage.init() must be called first');
    return this.db;
  }
}

export function normalizeWorldRecord(record: WorldRecord | V1WorldRecord): WorldRecord {
  const anyRecord = record as Partial<WorldRecord> & Partial<V1WorldRecord>;
  const lastPlayed = Number.isFinite(anyRecord.lastPlayed) ? Number(anyRecord.lastPlayed) : Date.now();
  const lastPlayedAt = Number.isFinite(anyRecord.lastPlayedAt) ? Number(anyRecord.lastPlayedAt) : lastPlayed;
  const mode = anyRecord.mode ?? anyRecord.gameMode ?? 'creative';
  return {
    id: String(anyRecord.id ?? ''),
    name: String(anyRecord.name ?? '未命名世界'),
    seed: String(anyRecord.seed ?? ''),
    schemaVersion: 2,
    generatorVersion: Number.isFinite(anyRecord.generatorVersion) ? Number(anyRecord.generatorVersion) : 1,
    mode: mode === 'survival' ? 'survival' : 'creative',
    difficulty: anyRecord.difficulty === 'normal' ? 'normal' : 'peaceful',
    cheatsEnabled: anyRecord.cheatsEnabled === true,
    createdAt: Number.isFinite(anyRecord.createdAt) ? Number(anyRecord.createdAt) : lastPlayed,
    lastPlayed,
    lastPlayedAt,
    player: anyRecord.player ?? null,
    hotbar: Array.isArray(anyRecord.hotbar) ? anyRecord.hotbar.slice(0, 9) : [1, 2, 3, 4, 5, 6, 9, 10, 11],
    selectedSlot: Math.max(0, Math.min(8, Math.floor(anyRecord.selectedSlot ?? 0))),
    timeOfDay: Number.isFinite(anyRecord.timeOfDay) ? Number(anyRecord.timeOfDay) : 0.31,
    renderDistance: Math.max(2, Math.min(8, Math.floor(anyRecord.renderDistance ?? 4))),
    version: 2,
  };
}

export function normalizePlayerSave(save: PlayerSaveV2, worldId: string): PlayerSaveV2 {
  const slots = sanitizeInventorySlots(save?.inventory);
  return {
    schemaVersion: 2,
    worldId,
    position: sanitizeTuple3(save?.position, [8.5, 80, 8.5]),
    velocity: sanitizeTuple3(save?.velocity, [0, 0, 0]),
    yaw: Number.isFinite(save?.yaw) ? Number(save.yaw) : 0,
    pitch: Number.isFinite(save?.pitch) ? Number(save.pitch) : 0,
    inventory: slots,
    selectedHotbarSlot: Math.max(0, Math.min(8, Math.floor(save?.selectedHotbarSlot ?? 0))),
    stats: {
      ...DEFAULT_PLAYER_STATS,
      ...(save?.stats ?? {}),
    },
    ...(save?.spawnPoint ? { spawnPoint: sanitizeTuple3(save.spawnPoint, [0, 0, 0]) } : {}),
  };
}

export function playerSaveFromV1(world: WorldRecord): PlayerSaveV2 | null {
  if (!world.player) return null;
  return normalizePlayerSave(
    {
      schemaVersion: 2,
      worldId: world.id,
      position: [world.player.x, world.player.y, world.player.z],
      velocity: [0, 0, 0],
      yaw: world.player.yaw,
      pitch: world.player.pitch,
      inventory: Array.from({ length: 36 }, () => null),
      selectedHotbarSlot: world.selectedSlot,
      stats: { ...DEFAULT_PLAYER_STATS },
    },
    world.id,
  );
}

export function convertV1NumericBlock(value: number): BlockId | null {
  if (!Number.isInteger(value)) return null;
  const stableId = V1_BLOCK_ID_TO_STABLE[value];
  if (!stableId) return null;
  return blockIdFromStableId(stableId);
}

function sanitizePlayer(raw: PlayerSaveV2 | null, world: WorldRecord): PlayerSaveV2 | null {
  if (raw) return normalizePlayerSave(raw, world.id);
  return playerSaveFromV1(world);
}

function sanitizePlayerSave(save: PlayerSaveV2, worldId: string): PlayerSaveV2 {
  return normalizePlayerSave(save, worldId);
}

function rawHasV2(record: WorldRecord | V1WorldRecord): boolean {
  return (record as Partial<WorldRecord>).schemaVersion === 2;
}

function sanitizeInventorySlots(input: Array<ItemStack | null> | undefined): Array<ItemStack | null> {
  const slots = Array.from({ length: 36 }, (_, index) => {
    const value = input?.[index] ?? null;
    return value && isValidStack(value) ? { ...value } : null;
  });
  return slots;
}

function sanitizeTuple3(input: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(input) || input.length < 3) return fallback;
  const result: [number, number, number] = [
    Number(input[0]),
    Number(input[1]),
    Number(input[2]),
  ];
  return result.every(Number.isFinite) ? result : fallback;
}

function deleteMissingForWorld(store: IDBObjectStore, worldId: string, keepKeys: Set<string>): void {
  const index = store.index('worldId');
  const request = index.openKeyCursor(IDBKeyRange.only(worldId));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    if (!keepKeys.has(String(cursor.primaryKey))) store.delete(cursor.primaryKey);
    cursor.continue();
  };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}
