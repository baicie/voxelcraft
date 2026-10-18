import { ItemEntityWorld } from '../entities/ItemEntityWorld';
import type { ItemEntitySave } from '../entities/ItemEntity';
import { FurnaceStore, type FurnaceSave } from '../furnace/FurnaceStore';
import { Inventory } from '../inventory/Inventory';
import { inventoryService } from '../inventory/InventoryService';
import type { ItemStack } from '../items/ItemStack';
import type { PlayerSaveV2 } from '../persistence/WorldStorage';
import type { PhysicsWorld } from '../player/PlayerPhysics';
import type { ItemEntity } from '../entities/ItemEntity';

export class SurvivalState {
  readonly inventory: Inventory;
  readonly items: ItemEntityWorld;
  readonly furnaces: FurnaceStore;
  selectedSlot: number;

  constructor(options: {
    inventory?: Inventory;
    items?: ItemEntityWorld;
    furnaces?: FurnaceStore;
    selectedSlot?: number;
  } = {}) {
    this.inventory = options.inventory ?? Inventory.empty('player');
    this.items = options.items ?? new ItemEntityWorld();
    this.furnaces = options.furnaces ?? new FurnaceStore();
    this.selectedSlot = Math.max(0, Math.min(8, options.selectedSlot ?? 0));
  }

  static fromSave(
    player: PlayerSaveV2 | null,
    itemSaves: readonly ItemEntitySave[],
    furnaceSaves: readonly FurnaceSave[],
  ): SurvivalState {
    const inventory = player
      ? new Inventory('player', player.inventory, 0, 36)
      : Inventory.empty('player');
    return new SurvivalState({
      inventory,
      items: ItemEntityWorld.fromSave(itemSaves),
      furnaces: FurnaceStore.fromSave(furnaceSaves),
      selectedSlot: player?.selectedHotbarSlot ?? 0,
    });
  }

  getHeldStack(): ItemStack | null {
    return this.inventory.get(this.selectedSlot);
  }

  selectSlot(slot: number): void {
    this.selectedSlot = Math.max(0, Math.min(8, Math.floor(slot)));
  }

  update(dt: number, world: PhysicsWorld, playerPosition: { x: number; y: number; z: number }): number {
    return this.items.update(dt, world, playerPosition, this.inventory);
  }

  spawnDrops(drops: readonly ItemStack[], x: number, y: number, z: number, seed: number): void {
    this.items.spawnDrops(drops, x, y, z, seed);
  }

  spawnSingleDrop(stack: ItemStack, x: number, y: number, z: number, seed: number): void {
    this.items.spawnDropsOne(stack, x, y, z, seed);
  }

  getNearbyItemEntities(radius = 12): ItemEntity[] {
    return this.items.getAll().filter((entity) => Math.hypot(entity.x, entity.y, entity.z) <= radius);
  }

  countItem(itemId: string): number {
    return inventoryService.countItem(this.inventory, itemId);
  }
}
