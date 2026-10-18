import { cloneStack, isValidStack, type ItemStack } from '../items/ItemStack';

export const INVENTORY_SIZE = 36;
export const HOTBAR_SIZE = 9;

export interface InventorySnapshot {
  id: string;
  revision: number;
  slots: Array<ItemStack | null>;
}

export class Inventory {
  readonly id: string;
  private slotData: Array<ItemStack | null>;
  private revisionValue: number;

  constructor(id: string, slots?: Array<ItemStack | null>, revision = 0, expectedSize = INVENTORY_SIZE) {
    this.id = id;
    this.slotData = Array.from({ length: expectedSize }, (_, index) => cloneStack(slots?.[index] ?? null));
    this.revisionValue = Math.max(0, Math.floor(revision));
    for (const stack of this.slotData) {
      if (!isValidStack(stack)) throw new Error(`Invalid item stack in inventory ${id}`);
    }
  }

  static empty(id: string, size = INVENTORY_SIZE): Inventory {
    return new Inventory(id, Array.from({ length: size }, () => null), 0, size);
  }

  static fromSnapshot(snapshot: InventorySnapshot, expectedSize = INVENTORY_SIZE): Inventory {
    if (!snapshot || typeof snapshot.id !== 'string' || !Array.isArray(snapshot.slots)) {
      throw new Error('Invalid inventory snapshot');
    }
    if (snapshot.slots.length !== expectedSize) throw new Error(`Invalid inventory size for ${snapshot.id}`);
    return new Inventory(snapshot.id, snapshot.slots, snapshot.revision, expectedSize);
  }

  get slots(): readonly (ItemStack | null)[] {
    return this.slotData;
  }

  get revision(): number {
    return this.revisionValue;
  }

  get size(): number {
    return this.slotData.length;
  }

  get(slot: number): ItemStack | null {
    return this.slotData[slot] ?? null;
  }

  /** Only InventoryService should call this after validating an operation plan. */
  replaceSlots(next: Array<ItemStack | null>): void {
    if (next.length !== this.slotData.length) throw new Error('Inventory size mismatch');
    this.slotData = next.map((stack) => cloneStack(stack));
    this.revisionValue++;
  }

  snapshot(): InventorySnapshot {
    return {
      id: this.id,
      revision: this.revisionValue,
      slots: this.slotData.map((stack) => cloneStack(stack)),
    };
  }
}
