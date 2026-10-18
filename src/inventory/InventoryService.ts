import {
  canMergeStacks,
  cloneStack,
  maxStackSize,
  type ItemStack,
} from '../items/ItemStack';
import type { Inventory } from './Inventory';

export type InventoryFailure =
  | 'invalid_slot'
  | 'incompatible'
  | 'inventory_changed'
  | 'not_enough'
  | 'full'
  | 'invalid_stack';

export interface InventoryResult {
  ok: boolean;
  reason?: InventoryFailure;
}

export interface InsertResult extends InventoryResult {
  accepted: number;
  remainder: number;
}

export interface MoveResult extends InventoryResult {
  movedCount: number;
}

function copySlots(inventory: Inventory): Array<ItemStack | null> {
  return inventory.slots.map((stack) => cloneStack(stack));
}

function insertIntoSlots(
  slots: Array<ItemStack | null>,
  stack: ItemStack,
  start = 0,
  end = slots.length,
): number {
  let remaining = stack.count;
  const limit = Math.max(0, Math.min(slots.length, end));
  const min = Math.max(0, Math.min(slots.length, start));

  // Fill compatible existing stacks first.
  for (let index = min; index < limit && remaining > 0; index++) {
    const existing = slots[index];
    if (!existing || !canMergeStacks(existing, stack)) continue;
    const max = maxStackSize(existing);
    const capacity = max - existing.count;
    if (capacity <= 0) continue;
    const amount = Math.min(capacity, remaining);
    slots[index] = { ...existing, count: existing.count + amount };
    remaining -= amount;
  }

  // Then empty slots.
  for (let index = min; index < limit && remaining > 0; index++) {
    if (slots[index]) continue;
    const max = maxStackSize(stack);
    const amount = Math.min(max, remaining);
    slots[index] = {
      itemId: stack.itemId,
      count: amount,
      ...(stack.durability !== undefined ? { durability: stack.durability } : {}),
    };
    remaining -= amount;
  }

  return stack.count - remaining;
}

export class InventoryService {
  canInsert(inventory: Inventory, stack: ItemStack): number {
    const slots = copySlots(inventory);
    return insertIntoSlots(slots, stack);
  }

  insert(inventory: Inventory, stack: ItemStack): InsertResult {
    const slots = copySlots(inventory);
    const accepted = insertIntoSlots(slots, stack);
    if (accepted > 0) inventory.replaceSlots(slots);
    return {
      ok: accepted === stack.count,
      reason: accepted === stack.count ? undefined : accepted === 0 ? 'full' : undefined,
      accepted,
      remainder: stack.count - accepted,
    };
  }

  extract(inventory: Inventory, slot: number, quantity: number): ItemStack | null {
    const current = inventory.get(slot);
    if (!current || !Number.isFinite(quantity) || quantity <= 0) return null;
    const amount = Math.min(Math.floor(quantity), current.count);
    if (amount <= 0) return null;
    const slots = copySlots(inventory);
    const extracted: ItemStack = { ...current, count: amount };
    const remaining = current.count - amount;
    slots[slot] = remaining > 0 ? { ...current, count: remaining } : null;
    inventory.replaceSlots(slots);
    return extracted;
  }

  extractHalf(inventory: Inventory, slot: number): ItemStack | null {
    const current = inventory.get(slot);
    if (!current) return null;
    const amount = Math.max(1, Math.ceil(current.count / 2));
    return this.extract(inventory, slot, amount);
  }

  placeIntoSlot(inventory: Inventory, slot: number, stack: ItemStack, quantity = stack.count): ItemStack | null {
    if (slot < 0 || slot >= inventory.size) return cloneStack(stack);
    const current = inventory.get(slot);
    const targetAmount = Math.min(Math.max(1, Math.floor(quantity)), stack.count);
    if (current && !canMergeStacks(current, stack)) return cloneStack(stack);

    const max = maxStackSize(stack);
    const capacity = current ? Math.max(0, max - current.count) : max;
    const amount = Math.min(capacity, targetAmount);
    if (amount <= 0) return cloneStack(stack);

    const slots = copySlots(inventory);
    slots[slot] = current
      ? { ...current, count: current.count + amount }
      : {
          itemId: stack.itemId,
          count: amount,
          ...(stack.durability !== undefined ? { durability: stack.durability } : {}),
        };
    inventory.replaceSlots(slots);
    const remaining = stack.count - amount;
    return remaining > 0 ? { ...stack, count: remaining } : null;
  }

  move(
    fromInventory: Inventory,
    fromSlot: number,
    toInventory: Inventory,
    toSlot: number,
    quantity?: number,
  ): MoveResult {
    const source = fromInventory.get(fromSlot);
    if (!source) return { ok: false, reason: 'invalid_slot', movedCount: 0 };
    if (toSlot < 0 || toSlot >= toInventory.size) return { ok: false, reason: 'invalid_slot', movedCount: 0 };
    if (fromInventory === toInventory && fromSlot === toSlot) return { ok: true, movedCount: 0 };

    const amount = Math.min(source.count, Math.max(1, Math.floor(quantity ?? source.count)));
    const target = toInventory.get(toSlot);
    if (target && !canMergeStacks(target, source)) {
      if (amount !== source.count) return { ok: false, reason: 'incompatible', movedCount: 0 };
      // Full-stack swap.
      const fromSlots = copySlots(fromInventory);
      const toSlots = fromInventory === toInventory ? fromSlots : copySlots(toInventory);
      fromSlots[fromSlot] = cloneStack(target);
      toSlots[toSlot] = cloneStack(source);
      fromInventory.replaceSlots(fromSlots);
      if (toInventory !== fromInventory) toInventory.replaceSlots(toSlots);
      return { ok: true, movedCount: source.count };
    }

    const capacity = target ? maxStackSize(target) - target.count : maxStackSize(source);
    const moved = Math.min(amount, Math.max(0, capacity));
    if (moved <= 0) return { ok: false, reason: 'full', movedCount: 0 };

    const fromSlots = copySlots(fromInventory);
    const toSlots = fromInventory === toInventory ? fromSlots : copySlots(toInventory);
    if (source.count - moved > 0) fromSlots[fromSlot] = { ...source, count: source.count - moved };
    else fromSlots[fromSlot] = null;
    toSlots[toSlot] = target
      ? { ...target, count: target.count + moved }
      : {
          itemId: source.itemId,
          count: moved,
          ...(source.durability !== undefined ? { durability: source.durability } : {}),
        };
    fromInventory.replaceSlots(fromSlots);
    if (toInventory !== fromInventory) toInventory.replaceSlots(toSlots);
    return { ok: moved === amount, movedCount: moved, reason: moved === amount ? undefined : 'full' };
  }

  swap(a: Inventory, aSlot: number, b: Inventory, bSlot: number): InventoryResult {
    if (aSlot < 0 || aSlot >= a.size || bSlot < 0 || bSlot >= b.size) {
      return { ok: false, reason: 'invalid_slot' };
    }
    if (a === b && aSlot === bSlot) return { ok: true };
    const aSlots = copySlots(a);
    const bSlots = a === b ? aSlots : copySlots(b);
    const aStack = cloneStack(a.get(aSlot));
    const bStack = cloneStack(b.get(bSlot));
    aSlots[aSlot] = bStack;
    bSlots[bSlot] = aStack;
    a.replaceSlots(aSlots);
    if (a !== b) b.replaceSlots(bSlots);
    return { ok: true };
  }

  /** Shift-click helper: fill matching stacks first, then empty slots in a range. */
  quickMove(inventory: Inventory, slot: number, start: number, end: number): MoveResult {
    const source = inventory.get(slot);
    if (!source) return { ok: false, reason: 'invalid_slot', movedCount: 0 };
    const slots = copySlots(inventory);
    const moved = insertIntoSlots(slots, source, start, end);
    if (moved <= 0) return { ok: false, reason: 'full', movedCount: 0 };
    slots[slot] = source.count - moved > 0 ? { ...source, count: source.count - moved } : null;
    inventory.replaceSlots(slots);
    return { ok: true, movedCount: moved };
  }

  countItem(inventory: Inventory, itemId: string): number {
    return inventory.slots.reduce((total, stack) => (stack?.itemId === itemId ? total + stack.count : total), 0);
  }

  totalItems(inventory: Inventory): number {
    return inventory.slots.reduce((total, stack) => total + (stack?.count ?? 0), 0);
  }
}

export const inventoryService = new InventoryService();
