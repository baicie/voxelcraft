import { craftingService } from '../crafting/CraftingService';
import type { CraftStation } from '../crafting/RecipeRegistry';
import type { FurnaceSlot, FurnaceStore } from '../furnace/FurnaceStore';
import { cloneStack, maxStackSize, type ItemStack } from '../items/ItemStack';
import { Inventory } from './Inventory';
import { inventoryService } from './InventoryService';

export type ContainerKind = 'inventory' | 'crafting_table' | 'furnace';

export interface FurnaceView {
  x: number;
  y: number;
  z: number;
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  progress: number;
  lit: boolean;
}

export interface ContainerView {
  kind: ContainerKind;
  slots: Array<ItemStack | null>;
  grid: Array<ItemStack | null>;
  gridSize: 0 | 2 | 3;
  output: ItemStack | null;
  recipeId: string | null;
  cursor: ItemStack | null;
  furnace: FurnaceView | null;
  selectedSlot: number;
  revision: number;
}

export class ContainerSession {
  readonly kind: ContainerKind;
  private readonly inventory: Inventory;
  private readonly grid: Inventory;
  private readonly station: CraftStation;
  private readonly furnaces: FurnaceStore | null;
  private readonly furnacePos: { x: number; y: number; z: number } | null;
  private cursorStack: ItemStack | null = null;
  private revisionValue = 0;
  selectedSlot: number;

  constructor(options: {
    kind: ContainerKind;
    inventory: Inventory;
    furnaces?: FurnaceStore;
    furnacePos?: { x: number; y: number; z: number };
    selectedSlot: number;
  }) {
    this.kind = options.kind;
    this.inventory = options.inventory;
    this.station = options.kind === 'crafting_table' ? 'crafting_table' : 'inventory';
    this.grid = Inventory.empty(
      options.kind === 'crafting_table' ? 'crafting-table-grid' : 'inventory-grid',
      options.kind === 'crafting_table' ? 9 : options.kind === 'inventory' ? 4 : 1,
    );
    this.furnaces = options.furnaces ?? null;
    this.furnacePos = options.furnacePos ?? null;
    this.selectedSlot = options.selectedSlot;
    if (this.furnacePos && this.furnaces) this.furnaces.getOrCreate(this.furnacePos.x, this.furnacePos.y, this.furnacePos.z);
  }

  get cursor(): ItemStack | null {
    return this.cursorStack;
  }

  view(): ContainerView {
    const match = this.kind === 'furnace' ? null : craftingService.findRecipe(this.grid, this.station);
    const furnaceState =
      this.furnacePos && this.furnaces
        ? this.furnaces.get(this.furnacePos.x, this.furnacePos.y, this.furnacePos.z)
        : null;
    return {
      kind: this.kind,
      slots: this.inventory.slots.map((stack) => cloneStack(stack)),
      grid: this.grid.slots.map((stack) => cloneStack(stack)),
      gridSize: this.kind === 'crafting_table' ? 3 : this.kind === 'inventory' ? 2 : 0,
      output: match ? { ...match.output } : null,
      recipeId: match?.recipe.id ?? null,
      cursor: cloneStack(this.cursorStack),
      furnace:
        furnaceState && this.furnacePos
          ? {
              ...this.furnacePos,
              input: cloneStack(furnaceState.input),
              fuel: cloneStack(furnaceState.fuel),
              output: cloneStack(furnaceState.output),
              progress: this.furnaces?.progress(this.furnacePos.x, this.furnacePos.y, this.furnacePos.z) ?? 0,
              lit: this.furnaces?.isLit(this.furnacePos.x, this.furnacePos.y, this.furnacePos.z) ?? false,
            }
          : null,
      selectedSlot: this.selectedSlot,
      revision: this.revisionValue + this.inventory.revision + this.grid.revision,
    };
  }

  clickInventory(slot: number, button: 0 | 2, shift: boolean): void {
    if (slot < 0 || slot >= this.inventory.size) return;
    if (shift && !this.cursorStack) {
      if (this.kind === 'furnace') {
        this.shiftInventoryToFurnace(slot);
      } else {
        const source = this.inventory.get(slot);
        if (!source) return;
        const toHotbar = slot >= 9;
        inventoryService.quickMove(this.inventory, slot, toHotbar ? 0 : 9, toHotbar ? 9 : 36);
      }
      this.bump();
      return;
    }
    this.clickSlot(this.inventory, slot, button, false);
  }

  clickCraftGrid(slot: number, button: 0 | 2, shift: boolean): void {
    if (this.kind === 'furnace') return;
    if (slot < 0 || slot >= this.grid.size) return;
    if (shift && !this.cursorStack) {
      const stack = this.grid.get(slot);
      if (!stack) return;
      const result = inventoryService.insert(this.inventory, stack);
      if (result.accepted > 0) {
        inventoryService.extract(this.grid, slot, result.accepted);
        this.bump();
      }
      return;
    }
    this.clickSlot(this.grid, slot, button, false);
  }

  takeCraftOutput(shift: boolean): number {
    if (this.kind === 'furnace') return 0;
    const result = craftingService.craft(this.grid, this.inventory, this.station, shift ? 64 : 1);
    if (result.crafted > 0) this.bump();
    return result.crafted;
  }

  clickFurnaceSlot(slot: FurnaceSlot, button: 0 | 2, shift: boolean): void {
    if (!this.furnaces || !this.furnacePos) return;
    const { x, y, z } = this.furnacePos;
    const state = this.furnaces.get(x, y, z);
    if (!state) return;
    const current = state[slot];
    if (shift) {
      if (!current) return;
      if (slot === 'output') {
        const moved = inventoryService.insert(this.inventory, current);
        if (moved.accepted > 0) {
          this.furnaces.takeSlot(x, y, z, slot, moved.accepted);
          this.bump();
        }
      } else {
        const moved = inventoryService.insert(this.inventory, current);
        if (moved.accepted > 0) {
          this.furnaces.takeSlot(x, y, z, slot, moved.accepted);
          this.bump();
        }
      }
      return;
    }

    if (slot === 'output') {
      if (!current) return;
      if (!this.cursorStack) {
        const amount = button === 2 ? Math.max(1, Math.ceil(current.count / 2)) : current.count;
        this.cursorStack = this.furnaces.takeSlot(x, y, z, slot, amount);
      } else if (this.cursorStack.itemId === current.itemId) {
        const capacity = maxStackSize(this.cursorStack) - this.cursorStack.count;
        if (capacity > 0) {
          const taken = this.furnaces.takeSlot(x, y, z, slot, Math.min(capacity, current.count));
          if (taken) this.cursorStack = { ...this.cursorStack, count: this.cursorStack.count + taken.count };
        }
      }
      this.bump();
      return;
    }

    if (!this.cursorStack) {
      if (!current) return;
      const amount = button === 2 ? Math.max(1, Math.ceil(current.count / 2)) : current.count;
      this.cursorStack = this.furnaces.takeSlot(x, y, z, slot, amount);
      this.bump();
      return;
    }

    if (current && !(current.itemId === this.cursorStack.itemId && (current.durability ?? null) === (this.cursorStack.durability ?? null))) {
      return;
    }
    const amount = button === 2 ? 1 : this.cursorStack.count;
    const remaining = this.furnaces.placeIntoSlot(x, y, z, slot, this.cursorStack, amount);
    this.cursorStack = remaining;
    this.bump();
  }

  close(): ItemStack[] {
    const leftovers: ItemStack[] = [];
    if (this.kind !== 'furnace') {
      leftovers.push(...craftingService.returnGridToInventory(this.grid, this.inventory));
    }
    if (this.cursorStack) {
      const result = inventoryService.insert(this.inventory, this.cursorStack);
      if (result.remainder > 0) leftovers.push({ ...this.cursorStack, count: result.remainder });
      this.cursorStack = null;
    }
    this.bump();
    return leftovers;
  }

  private clickSlot(target: Inventory, slot: number, button: 0 | 2, _shift: boolean): void {
    const existing = target.get(slot);
    if (!this.cursorStack) {
      const amount = button === 2 && existing ? Math.max(1, Math.ceil(existing.count / 2)) : existing?.count ?? 0;
      if (amount > 0) this.cursorStack = inventoryService.extract(target, slot, amount);
      this.bump();
      return;
    }

    if (!existing) {
      const amount = button === 2 ? 1 : this.cursorStack.count;
      this.cursorStack = inventoryService.placeIntoSlot(target, slot, this.cursorStack, amount);
      this.bump();
      return;
    }

    const same =
      existing.itemId === this.cursorStack.itemId &&
      (existing.durability ?? null) === (this.cursorStack.durability ?? null);
    if (same) {
      const amount = button === 2 ? 1 : this.cursorStack.count;
      this.cursorStack = inventoryService.placeIntoSlot(target, slot, this.cursorStack, amount);
      this.bump();
      return;
    }

    if (button === 0) {
      // Cursor/slot swap: remove the target into the cursor, then place the old cursor.
      const held = this.cursorStack;
      const removed = inventoryService.extract(target, slot, existing.count);
      if (removed) {
        const remainder = inventoryService.placeIntoSlot(target, slot, held, held.count);
        this.cursorStack = remainder ?? removed;
      }
      this.bump();
    }
  }

  private shiftInventoryToFurnace(slot: number): void {
    if (!this.furnaces || !this.furnacePos) return;
    const stack = this.inventory.get(slot);
    if (!stack) return;
    const { x, y, z } = this.furnacePos;
    const preferred: FurnaceSlot = stack.itemId === 'base:raw_iron' ? 'input' : 'fuel';
    const other: FurnaceSlot = preferred === 'input' ? 'fuel' : 'input';
    let remaining = this.furnaces.placeIntoSlot(x, y, z, preferred, stack);
    if (remaining) remaining = this.furnaces.placeIntoSlot(x, y, z, other, remaining);
    const moved = stack.count - (remaining?.count ?? 0);
    if (moved > 0) inventoryService.extract(this.inventory, slot, moved);
  }

  private bump(): void {
    this.revisionValue++;
  }
}
