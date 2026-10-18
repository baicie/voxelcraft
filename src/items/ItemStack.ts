import { getItemDefinition, requireItemDefinition, type ItemId } from './ItemRegistry';

export interface ItemStack {
  itemId: ItemId;
  count: number;
  /** Present only for durability items. 0 means broken and is rejected. */
  durability?: number;
}

export function createItemStack(itemId: ItemId, count = 1, durability?: number): ItemStack | null {
  const definition = getItemDefinition(itemId);
  if (!definition || !Number.isInteger(count) || count <= 0) return null;
  const normalizedCount = Math.min(count, definition.maxStack);
  const stack: ItemStack = { itemId, count: normalizedCount };
  if (definition.maxDurability !== undefined) {
    const value = durability ?? definition.maxDurability;
    if (!Number.isFinite(value) || value <= 0) return null;
    stack.durability = Math.min(Math.floor(value), definition.maxDurability);
  } else if (durability !== undefined) {
    return null;
  }
  return stack;
}

export function requireItemStack(itemId: ItemId, count = 1, durability?: number): ItemStack {
  const stack = createItemStack(itemId, count, durability);
  if (!stack) throw new Error(`Invalid item stack: ${itemId} x${count}`);
  return stack;
}

export function cloneStack(stack: ItemStack | null): ItemStack | null {
  if (!stack) return null;
  return { ...stack };
}

export function maxStackSize(stack: ItemStack): number {
  return getItemDefinition(stack.itemId)?.maxStack ?? 1;
}

export function stacksEqual(a: ItemStack | null, b: ItemStack | null): boolean {
  if (!a || !b) return a === b;
  return a.itemId === b.itemId && a.count === b.count && (a.durability ?? null) === (b.durability ?? null);
}

export function canMergeStacks(a: ItemStack | null, b: ItemStack | null): boolean {
  if (!a || !b) return true;
  if (a.itemId !== b.itemId) return false;
  return (a.durability ?? null) === (b.durability ?? null);
}

export function isValidStack(stack: ItemStack | null): boolean {
  if (!stack) return true;
  const definition = getItemDefinition(stack.itemId);
  if (!definition) return false;
  if (!Number.isInteger(stack.count) || stack.count <= 0 || stack.count > definition.maxStack) return false;
  if (definition.maxDurability !== undefined) {
    if (stack.durability === undefined) return false;
    if (stack.durability <= 0 || stack.durability > definition.maxDurability) return false;
  } else if (stack.durability !== undefined) {
    return false;
  }
  return true;
}

export function isTool(stack: ItemStack | null): boolean {
  return !!stack && !!getItemDefinition(stack.itemId)?.tool;
}

export function decrementDurability(stack: ItemStack, amount = 1): { stack: ItemStack | null; broke: boolean } {
  const definition = requireItemDefinition(stack.itemId);
  if (definition.maxDurability === undefined) return { stack, broke: false };
  const current = stack.durability ?? definition.maxDurability;
  const next = current - amount;
  if (next <= 0) return { stack: null, broke: true };
  return { stack: { ...stack, durability: next }, broke: false };
}

export function stackFingerprint(stack: ItemStack | null): string {
  if (!stack) return 'empty';
  return `${stack.itemId}:${stack.count}:${stack.durability ?? ''}`;
}
