import { createItemStack, isValidStack, maxStackSize, type ItemStack } from '../items/ItemStack';
import { inventoryService } from '../inventory/InventoryService';
import type { Inventory } from '../inventory/Inventory';
import { hashInt3, hashToUnit } from '../utils/math';
import type { PhysicsWorld } from '../player/PlayerPhysics';
import {
  ITEM_ATTRACT_RADIUS,
  ITEM_PICKUP_DELAY_SECONDS,
  ITEM_PICKUP_RADIUS,
  type ItemEntity,
  type ItemEntitySave,
} from './ItemEntity';

const ITEM_GRAVITY = 18;
const ITEM_DRAG = 2.8;
const MAX_ITEM_ENTITIES = 512;

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `item-${crypto.randomUUID()}`;
  return `item-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export class ItemEntityWorld {
  private readonly entities = new Map<string, ItemEntity>();
  private spawnSequence = 0;

  get size(): number {
    return this.entities.size;
  }

  values(): IterableIterator<ItemEntity> {
    return this.entities.values();
  }

  getAll(): ItemEntity[] {
    return [...this.entities.values()];
  }

  spawn(stack: ItemStack, x: number, y: number, z: number, seed = 1, vx = 0, vy = 0, vz = 0): ItemEntity | null {
    if (!isValidStack(stack) || !stack) return null;
    let remaining = { ...stack };
    while (remaining.count > 0) {
      const max = maxStackSize(remaining);
      const count = Math.min(max, remaining.count);
      const partial: ItemStack = { ...remaining, count };
      const merged = this.tryMerge(partial);
      if (!merged) {
        if (this.entities.size >= MAX_ITEM_ENTITIES) return null;
        const entity: ItemEntity = {
          id: randomId(),
          stack: partial,
          x,
          y,
          z,
          vx,
          vy,
          vz,
          ageSeconds: 0,
          pickupDelaySeconds: ITEM_PICKUP_DELAY_SECONDS,
        };
        this.entities.set(entity.id, entity);
      }
      remaining = { ...remaining, count: remaining.count - count };
    }
    this.spawnSequence++;
    void seed;
    return this.getAll().at(-1) ?? null;
  }

  spawnDrops(drops: readonly ItemStack[], x: number, y: number, z: number, seed: number): void {
    for (const drop of drops) {
      this.spawnDropsOne(drop, x, y, z, seed);
    }
  }

  spawnDropsOne(stack: ItemStack, x: number, y: number, z: number, seed: number): void {
    const sequence = this.spawnSequence++;
    const rx = hashToUnit(hashInt3(Math.floor(x), Math.floor(y), Math.floor(z), seed ^ sequence)) - 0.5;
    const rz = hashToUnit(hashInt3(Math.floor(z), Math.floor(x), Math.floor(y), seed ^ (sequence + 77))) - 0.5;
    this.spawn(stack, x + rx * 0.25, y + 0.25, z + rz * 0.25, seed, rx * 1.2, 2.2, rz * 1.2);
  }

  remove(id: string): void {
    this.entities.delete(id);
  }

  clear(): void {
    this.entities.clear();
  }

  /**
   * Applies gravity, attraction and pickup. Returns the number of items picked up.
   * A full inventory never destroys ground items; the remainder stays in world.
   */
  update(
    dt: number,
    world: PhysicsWorld,
    playerPosition: { x: number; y: number; z: number },
    inventory: Inventory | null,
  ): number {
    let pickedUp = 0;
    const mergeCandidates = [...this.entities.values()];
    for (const entity of mergeCandidates) {
      entity.ageSeconds += dt;
      entity.pickupDelaySeconds = Math.max(0, entity.pickupDelaySeconds - dt);

      const dx = playerPosition.x - entity.x;
      const dy = playerPosition.y + 0.8 - entity.y;
      const dz = playerPosition.z - entity.z;
      const distance = Math.hypot(dx, dy, dz);

      if (inventory && entity.pickupDelaySeconds <= 0 && distance <= ITEM_ATTRACT_RADIUS && distance > 0.05) {
        const pull = Math.min(9, 2.5 + (ITEM_ATTRACT_RADIUS - distance) * 5) / Math.max(0.2, distance);
        entity.vx += dx * pull * dt;
        entity.vy += dy * pull * dt;
        entity.vz += dz * pull * dt;
      }

      entity.vx *= Math.max(0, 1 - ITEM_DRAG * dt);
      entity.vz *= Math.max(0, 1 - ITEM_DRAG * dt);
      entity.vy -= ITEM_GRAVITY * dt;

      const nextX = entity.x + entity.vx * dt;
      const nextZ = entity.z + entity.vz * dt;
      if (!this.isBlocked(world, nextX, entity.y, entity.z)) entity.x = nextX;
      else entity.vx *= -0.25;
      if (!this.isBlocked(world, entity.x, entity.y, nextZ)) entity.z = nextZ;
      else entity.vz *= -0.25;

      const nextY = entity.y + entity.vy * dt;
      if (this.isBlocked(world, entity.x, nextY, entity.z)) {
        if (entity.vy < 0) {
          entity.y = Math.floor(nextY) + 1.02;
          entity.vy = 0;
        } else {
          entity.vy = 0;
        }
      } else {
        entity.y = nextY;
      }

      if (inventory && entity.pickupDelaySeconds <= 0 && distance <= ITEM_PICKUP_RADIUS) {
        const result = inventoryService.insert(inventory, entity.stack);
        if (result.accepted > 0) {
          pickedUp += result.accepted;
          if (result.remainder > 0) entity.stack = { ...entity.stack, count: result.remainder };
          else this.entities.delete(entity.id);
        }
      }
    }

    this.mergeNearby();
    return pickedUp;
  }

  toSave(): ItemEntitySave[] {
    return [...this.entities.values()].map((entity) => ({
      id: entity.id,
      itemId: entity.stack.itemId,
      count: entity.stack.count,
      ...(entity.stack.durability !== undefined ? { durability: entity.stack.durability } : {}),
      x: entity.x,
      y: entity.y,
      z: entity.z,
      vx: entity.vx,
      vy: entity.vy,
      vz: entity.vz,
      ageSeconds: entity.ageSeconds,
      pickupDelaySeconds: entity.pickupDelaySeconds,
    }));
  }

  static fromSave(saves: readonly ItemEntitySave[]): ItemEntityWorld {
    const result = new ItemEntityWorld();
    for (const save of saves) {
      const stack = createItemStack(save.itemId, save.count, save.durability);
      if (!stack) continue;
      if (!Number.isFinite(save.x + save.y + save.z + save.vx + save.vy + save.vz)) continue;
      result.entities.set(save.id, {
        id: save.id,
        stack,
        x: save.x,
        y: save.y,
        z: save.z,
        vx: save.vx,
        vy: save.vy,
        vz: save.vz,
        ageSeconds: Math.max(0, save.ageSeconds),
        pickupDelaySeconds: Math.max(0, save.pickupDelaySeconds),
      });
    }
    return result;
  }

  private tryMerge(stack: ItemStack): boolean {
    for (const entity of this.entities.values()) {
      if (entity.stack.itemId !== stack.itemId) continue;
      if ((entity.stack.durability ?? null) !== (stack.durability ?? null)) continue;
      const max = maxStackSize(entity.stack);
      if (entity.stack.count + stack.count > max) continue;
      entity.stack = { ...entity.stack, count: entity.stack.count + stack.count };
      return true;
    }
    return false;
  }

  private mergeNearby(): void {
    const entities = [...this.entities.values()];
    for (let i = 0; i < entities.length; i++) {
      const a = entities[i]!;
      if (!this.entities.has(a.id)) continue;
      for (let j = i + 1; j < entities.length; j++) {
        const b = entities[j]!;
        if (!this.entities.has(b.id)) continue;
        if (a.stack.itemId !== b.stack.itemId) continue;
        if ((a.stack.durability ?? null) !== (b.stack.durability ?? null)) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 0.8) continue;
        const max = maxStackSize(a.stack);
        if (a.stack.count + b.stack.count > max) continue;
        a.stack = { ...a.stack, count: a.stack.count + b.stack.count };
        this.entities.delete(b.id);
      }
    }
  }

  private isBlocked(world: PhysicsWorld, x: number, y: number, z: number): boolean {
    return world.isSolidAt(Math.floor(x), Math.floor(y), Math.floor(z));
  }
}
