import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../src/core/types';
import { chunkOf, localOf, voxelIndex } from '../../src/world/coordinates';
import { generateChunk, columnAt, findSpawn, BIOMES } from '../../src/world/generator';
import { VoxelWorld } from '../../src/world/world';
import { buildMesh } from '../../src/world/mesher';
import { B } from '../../src/world/blocks';
import { raycast } from '../../src/world/raycast';
import { PlayerBody, emptyInput } from '../../src/player/physics';
import { Inventory, itemDef } from '../../src/inventory/inventory';
import { craft, findRecipe, matches, RECIPES } from '../../src/crafting/recipes';
import { emptyFurnace, furnaceTick } from '../../src/crafting/furnace';
import { Survival } from '../../src/survival/survival';
import { MobSystem } from '../../src/entities/mobs';
import { acceptEpoch } from '../../src/workers/workerClient';

class TestWorld {
  blocks = new Map<string, number>();
  getBlock(x: number, y: number, z: number) { return this.blocks.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`) ?? 0; }
  set(x: number, y: number, z: number, id: number) { this.blocks.set(`${x},${y},${z}`, id); }
  isSolid(x: number, y: number, z: number) { return this.getBlock(x, y, z) !== 0; }
  getLoadedBlock(x: number, y: number, z: number) { return this.getBlock(x, y, z); }
}

describe('world coordinates and generation', () => {
  it('maps negative coordinates without off-by-one errors', () => {
    expect(chunkOf(-1, -16)).toEqual({ cx: -1, cz: -1 });
    expect(chunkOf(-17, 15)).toEqual({ cx: -2, cz: 0 });
    expect(localOf(-1, -16)).toEqual({ x: 15, z: 0 });
    expect(voxelIndex(0, 0, 0)).toBe(0);
    expect(voxelIndex(1, 2, 3)).toBe(1 + CHUNK_SIZE * (3 + CHUNK_SIZE * 2));
  });

  it('produces deterministic, seed-specific terrain', () => {
    const a = generateChunk(12345, -2, 3);
    const b = generateChunk(12345, -2, 3);
    const c = generateChunk(54321, -2, 3);
    expect(a.voxels).toEqual(b.voxels);
    expect(a.biomes).toEqual(b.biomes);
    expect(a.voxels).not.toEqual(c.voxels);
    expect(a.voxels.length).toBe(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  });

  it('has at least five distinct biomes across a sampled region', () => {
    const biomes = new Set<number>();
    for (let x = -2500; x <= 2500; x += 83) for (let z = -2500; z <= 2500; z += 89) biomes.add(columnAt(9876, x, z).biome);
    expect(biomes.size).toBeGreaterThanOrEqual(5);
    expect(BIOMES.length).toBeGreaterThanOrEqual(5);
  });

  it('generates solid ground and a safe spawn above terrain', () => {
    const spawn = findSpawn(755);
    const column = columnAt(755, Math.floor(spawn.x), Math.floor(spawn.z));
    expect(spawn.y).toBeGreaterThan(column.height);
    const chunk = generateChunk(755, Math.floor(spawn.x / CHUNK_SIZE), Math.floor(spawn.z / CHUNK_SIZE));
    expect(chunk.voxels.some(v => v !== 0)).toBe(true);
    expect(chunk.voxels[0]).toBe(B.bedrock);
  });

  it('applies edits across positive and negative chunk boundaries', () => {
    for (const [x, z, cx, cz] of [[15, 15, 0, 0], [-1, -1, -1, -1], [16, -17, 1, -2]] as const) {
      const payload = generateChunk(8, cx, cz, { [`${x},40,${z}`]: B.glowstone });
      const world = new VoxelWorld(8, 'survival');
      world.addChunk(payload);
      expect(world.getBlock(x, 40, z)).toBe(B.glowstone);
      world.setBlock(x, 40, z, B.air);
      expect(world.getBlock(x, 40, z)).toBe(B.air);
      expect(world.edits.get(`${x},40,${z}`)).toBe(B.air);
    }
  });
});

describe('mesh and raycast', () => {
  it('culls shared faces between adjacent blocks and emits six for an isolated block', () => {
    const air = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    const single = air.slice(); single[voxelIndex(5, 20, 5)] = B.stone;
    const exposed = buildMesh(single, {});
    expect(exposed.opaque.indices.length).toBe(6 * 6);
    single[voxelIndex(6, 20, 5)] = B.stone;
    const pair = buildMesh(single, {});
    expect(pair.opaque.indices.length).toBe(10 * 6);
    expect(pair.water.indices.length).toBe(0);
  });

  it('separates transparent water geometry', () => {
    const air = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    air[voxelIndex(2, 20, 2)] = B.water;
    const mesh = buildMesh(air, {});
    expect(mesh.water.indices.length).toBeGreaterThan(0);
    expect(mesh.opaque.indices.length).toBe(0);
  });

  it('raycasts into negative coordinates and reports the entering face', () => {
    const world = new TestWorld();
    world.set(-3, 10, -2, B.stone);
    const hit = raycast(world.getBlock.bind(world), { x: -1.6, y: 10.5, z: -1.7 }, { x: -1, y: 0, z: 0 }, 4);
    expect(hit).toMatchObject({ x: -3, y: 10, z: -2, nx: 1, ny: 0, nz: 0 });
    expect(raycast(world.getBlock.bind(world), { x: 0, y: 20, z: 0 }, { x: 1, y: 0, z: 0 }, 3)).toBeNull();
  });
});

describe('player physics', () => {
  it('collides with walls and floors and lands on terrain', () => {
    const world = new TestWorld();
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) world.set(x, 0, z, B.stone);
    for (let y = 1; y < 5; y++) world.set(2, y, 0, B.stone);
    const body = new PlayerBody({ x: .5, y: 1.01, z: .5 });
    for (let i = 0; i < 120; i++) body.step(world, { ...emptyInput(), strafe: 1 }, 1 / 60);
    expect(body.position.y).toBeGreaterThan(.99);
    expect(body.position.x).toBeLessThan(1.75);
    expect(body.onGround).toBe(true);
  });

  it('normalizes diagonal movement to avoid faster diagonal travel', () => {
    const world = new TestWorld();
    for (let x = -15; x <= 15; x++) for (let z = -15; z <= 15; z++) world.set(x, 0, z, B.stone);
    const straight = new PlayerBody({ x: 0, y: 1.01, z: 0 });
    const diagonal = new PlayerBody({ x: 0, y: 1.01, z: 0 });
    for (let i = 0; i < 60; i++) { straight.step(world, { ...emptyInput(), forward: 1 }, 1 / 60); diagonal.step(world, { ...emptyInput(), forward: 1, strafe: 1 }, 1 / 60); }
    expect(Math.abs(diagonal.position.z)).toBeLessThanOrEqual(Math.abs(straight.position.z) + .1);
  });
});

describe('inventory, crafting and smelting', () => {
  it('stacks, splits, swaps and preserves item quantities', () => {
    const inv = new Inventory(9);
    expect(inv.add('block:oakLog', 70)).toBe(0);
    expect(inv.slots[0]?.count).toBe(64);
    expect(inv.slots[1]?.count).toBe(6);
    expect(inv.move(0, 5, 10)).toBe(true);
    expect(inv.slots[5]?.count).toBe(10);
    expect(inv.split(0, 6)).toBe(true);
    expect(inv.count('block:oakLog')).toBe(70);
    expect(inv.remove('block:oakLog', 65)).toBe(true);
    expect(inv.count('block:oakLog')).toBe(5);
    expect(inv.remove('block:oakLog', 6)).toBe(false);
  });

  it('crafts planks, sticks and a table while consuming exact materials', () => {
    const inv = new Inventory(9);
    inv.add('block:oakLog', 3); inv.add('stick', 4);
    const planks = RECIPES.find(r => r.id === 'planks')!;
    expect(findRecipe([{ id: 'block:oakLog', count: 1 }, null, null, null], 2)?.id).toBe(planks.id);
    const grid = [{ id: 'block:oakLog', count: 1 }, null, null, null];
    expect(craft(grid, 2)).toEqual({ id: 'block:planks', count: 4 });
    expect(grid[0]).toBeNull();
    const table: ({ id: string; count: number } | null)[] = [
      { id: 'block:planks', count: 1 }, { id: 'block:planks', count: 1 }, null,
      { id: 'block:planks', count: 1 }, { id: 'block:planks', count: 1 }, null, null, null, null,
    ];
    expect(matches(table, 3, RECIPES.find(r => r.id === 'table')!)).toBe(true);
    expect(craft(table, 3)?.id).toBe('block:craftingTable');
    expect(table.filter(Boolean)).toHaveLength(0);
  });

  it('rejects invalid patterns and table recipes in a 2x2 grid', () => {
    expect(findRecipe([{ id: 'block:dirt', count: 1 }, null, null, null], 2)).toBeUndefined();
    const pick = RECIPES.find(r => r.id === 'wood-pickaxe')!;
    const grid = Array(4).fill({ id: 'block:planks', count: 1 });
    expect(matches(grid, 2, pick)).toBe(false);
  });

  it('damages and eventually destroys a tool without duplication', () => {
    const inv = new Inventory(4, [{ id: 'woodenPickaxe', count: 1 }, null, null, null]);
    inv.damage(0, 59); expect(inv.slots[0]?.durability).toBe(1);
    inv.damage(0, 1); expect(inv.slots[0]).toBeNull();
    expect(itemDef('woodenPickaxe').durability).toBe(60);
  });

  it('smelts iron ore with coal and cannot overfill output', () => {
    const f = emptyFurnace();
    f.input = { id: 'block:ironOre', count: 2 }; f.fuel = { id: 'coal', count: 2 };
    for (let t = 0; t < 100; t += .25) furnaceTick(f, .25);
    expect(f.output).toEqual({ id: 'ironIngot', count: 2 });
    expect(f.input).toBeNull();
  });
});

describe('survival, mobs and epochs', () => {
  it('applies fall and drowning damage without mutating through death', () => {
    const survival = new Survival({ health: 4, hunger: 20, oxygen: 0 });
    expect(survival.applyDamage(2, 'fall')).toEqual({ damage: 2, cause: 'fall' });
    expect(survival.health).toBe(2);
    const drown = survival.tick(1, true, false);
    expect(drown?.cause).toBe('drowning');
    expect(survival.health).toBe(0);
    expect(survival.dead).toBe(true);
    expect(survival.applyDamage(10, 'mob')).toBeNull();
    expect(survival.health).toBe(0);
    survival.respawn();
    expect(survival.health).toBe(20);
    expect(survival.dead).toBe(false);
  });

  it('eats only when hungry and restores hunger', () => {
    const survival = new Survival({ health: 15, hunger: 8 });
    expect(survival.eat(4)).toBe(true);
    expect(survival.hunger).toBe(12);
    survival.hunger = 20;
    expect(survival.eat(5)).toBe(false);
  });

  it('spawns mobs on solid ground, moves them, and resolves attack damage', () => {
    const world = new TestWorld();
    for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) world.set(x, 20, z, B.grass);
    const mobs = new MobSystem(4);
    const zombie = mobs.spawn('zombie', { x: 1, y: 21.01, z: 1 });
    let damage = 0;
    for (let i = 0; i < 60; i++) mobs.update(world, 1 / 60, { x: 0, y: 21.01, z: 0 }, true, d => damage += d, () => {});
    expect(zombie.position.y).toBeGreaterThan(20);
    expect(damage).toBeGreaterThan(0);
    expect(mobs.hit(zombie, 25, { x: 1, y: 0, z: 0 })).toBe(true);
    expect(zombie.health).toBeLessThanOrEqual(0);
  });

  it('rejects stale worker epochs', () => {
    expect(acceptEpoch(3, 3)).toBe(true);
    expect(acceptEpoch(2, 3)).toBe(false);
    expect(acceptEpoch(4, 3)).toBe(false);
  });
});
