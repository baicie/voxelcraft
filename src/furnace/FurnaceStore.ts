import { getFuelTicks, getItemDefinition } from '../items/ItemRegistry';
import { canMergeStacks, createItemStack, maxStackSize, type ItemStack } from '../items/ItemStack';

export const FURNACE_COOK_TICKS = 600;

export type FurnaceSlot = 'input' | 'fuel' | 'output';

export interface FurnaceState {
  id: string;
  x: number;
  y: number;
  z: number;
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  remainingFuelTicks: number;
  burnDurationTicks: number;
  cookProgressTicks: number;
  revision: number;
}

export interface FurnaceSave {
  id: string;
  x: number;
  y: number;
  z: number;
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  remainingFuelTicks: number;
  burnDurationTicks: number;
  cookProgressTicks: number;
  revision: number;
}

export interface SmeltRecipe {
  inputItemId: string;
  outputItemId: string;
  cookTicks: number;
}

export const SMELT_RECIPES: readonly SmeltRecipe[] = [
  { inputItemId: 'base:raw_iron', outputItemId: 'base:iron_ingot', cookTicks: FURNACE_COOK_TICKS },
];

export function furnaceKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export class FurnaceStore {
  private readonly furnaces = new Map<string, FurnaceState>();

  get size(): number {
    return this.furnaces.size;
  }

  values(): IterableIterator<FurnaceState> {
    return this.furnaces.values();
  }

  get(x: number, y: number, z: number): FurnaceState | undefined {
    return this.furnaces.get(furnaceKey(x, y, z));
  }

  getOrCreate(x: number, y: number, z: number): FurnaceState {
    const key = furnaceKey(x, y, z);
    let state = this.furnaces.get(key);
    if (!state) {
      state = {
        id: `furnace:${key}`,
        x,
        y,
        z,
        input: null,
        fuel: null,
        output: null,
        remainingFuelTicks: 0,
        burnDurationTicks: 0,
        cookProgressTicks: 0,
        revision: 0,
      };
      this.furnaces.set(key, state);
    }
    return state;
  }

  remove(x: number, y: number, z: number): FurnaceState | undefined {
    const key = furnaceKey(x, y, z);
    const state = this.furnaces.get(key);
    if (state) this.furnaces.delete(key);
    return state;
  }

  tick(ticks = 1): void {
    for (let i = 0; i < ticks; i++) {
      for (const state of this.furnaces.values()) this.tickOne(state);
    }
  }

  /** All stacks inside a furnace, used for drops when the block is broken. */
  contents(x: number, y: number, z: number): ItemStack[] {
    const state = this.get(x, y, z);
    if (!state) return [];
    return [state.input, state.fuel, state.output].filter((stack): stack is ItemStack => !!stack).map((stack) => ({ ...stack }));
  }

  takeSlot(x: number, y: number, z: number, slot: FurnaceSlot, quantity: number): ItemStack | null {
    const state = this.get(x, y, z);
    if (!state) return null;
    const current = state[slot];
    if (!current) return null;
    const amount = Math.min(current.count, Math.max(1, Math.floor(quantity)));
    const taken: ItemStack = { ...current, count: amount };
    state[slot] = current.count - amount > 0 ? { ...current, count: current.count - amount } : null;
    state.revision++;
    return taken;
  }

  placeIntoSlot(
    x: number,
    y: number,
    z: number,
    slot: Exclude<FurnaceSlot, 'output'>,
    stack: ItemStack,
    quantity = stack.count,
  ): ItemStack | null {
    const state = this.getOrCreate(x, y, z);
    const current = state[slot];
    if (current && !canMergeStacks(current, stack)) return { ...stack };
    const max = maxStackSize(stack);
    const capacity = current ? Math.max(0, max - current.count) : max;
    const amount = Math.min(capacity, Math.max(1, Math.floor(quantity)), stack.count);
    if (amount <= 0) return { ...stack };
    state[slot] = current
      ? { ...current, count: current.count + amount }
      : { ...stack, count: amount };
    state.revision++;
    const remaining = stack.count - amount;
    return remaining > 0 ? { ...stack, count: remaining } : null;
  }

  isLit(x: number, y: number, z: number): boolean {
    return (this.get(x, y, z)?.remainingFuelTicks ?? 0) > 0;
  }

  progress(x: number, y: number, z: number): number {
    return Math.min(1, (this.get(x, y, z)?.cookProgressTicks ?? 0) / FURNACE_COOK_TICKS);
  }

  toSave(): FurnaceSave[] {
    return [...this.furnaces.values()].map((state) => ({
      id: state.id,
      x: state.x,
      y: state.y,
      z: state.z,
      input: state.input ? { ...state.input } : null,
      fuel: state.fuel ? { ...state.fuel } : null,
      output: state.output ? { ...state.output } : null,
      remainingFuelTicks: state.remainingFuelTicks,
      burnDurationTicks: state.burnDurationTicks,
      cookProgressTicks: state.cookProgressTicks,
      revision: state.revision,
    }));
  }

  static fromSave(saves: readonly FurnaceSave[]): FurnaceStore {
    const store = new FurnaceStore();
    for (const save of saves) {
      const input = validStack(save.input);
      const fuel = validStack(save.fuel);
      const output = validStack(save.output);
      store.furnaces.set(furnaceKey(save.x, save.y, save.z), {
        id: save.id,
        x: save.x,
        y: save.y,
        z: save.z,
        input,
        fuel,
        output,
        remainingFuelTicks: Math.max(0, save.remainingFuelTicks),
        burnDurationTicks: Math.max(0, save.burnDurationTicks),
        cookProgressTicks: Math.max(0, Math.min(FURNACE_COOK_TICKS, save.cookProgressTicks)),
        revision: Math.max(0, save.revision),
      });
    }
    return store;
  }

  private tickOne(state: FurnaceState): void {
    const recipe = this.findRecipe(state.input);
    const canOutput = recipe !== null && this.canAcceptOutput(state, recipe.outputItemId);
    if (!canOutput) {
      state.cookProgressTicks = recipe ? state.cookProgressTicks : 0;
      state.revision++;
      return;
    }

    if (state.remainingFuelTicks <= 0) {
      if (!state.fuel) return;
      const fuelTicks = getFuelTicks(state.fuel.itemId);
      if (fuelTicks <= 0) return;
      state.fuel = consumeOne(state.fuel);
      state.remainingFuelTicks = fuelTicks;
      state.burnDurationTicks = fuelTicks;
      state.revision++;
    }

    state.remainingFuelTicks = Math.max(0, state.remainingFuelTicks - 1);
    state.cookProgressTicks++;
    if (state.cookProgressTicks >= recipe.cookTicks) {
      state.input = consumeOne(state.input);
      state.output = addToStack(state.output, recipe.outputItemId, 1);
      state.cookProgressTicks = 0;
      state.revision++;
    }
  }

  private findRecipe(input: ItemStack | null): SmeltRecipe | null {
    if (!input) return null;
    return SMELT_RECIPES.find((recipe) => recipe.inputItemId === input.itemId) ?? null;
  }

  private canAcceptOutput(state: FurnaceState, itemId: string): boolean {
    if (!state.output) return true;
    if (state.output.itemId !== itemId) return false;
    return state.output.count < maxStackSize(state.output);
  }
}

function consumeOne(stack: ItemStack | null): ItemStack | null {
  if (!stack) return null;
  return stack.count > 1 ? { ...stack, count: stack.count - 1 } : null;
}

function addToStack(existing: ItemStack | null, itemId: string, count: number): ItemStack {
  if (existing && existing.itemId === itemId) {
    return { ...existing, count: Math.min(maxStackSize(existing), existing.count + count) };
  }
  return createItemStack(itemId, count) ?? existing!;
}

function validStack(stack: ItemStack | null | undefined): ItemStack | null {
  if (!stack) return null;
  const definition = getItemDefinition(stack.itemId);
  if (!definition) return null;
  return createItemStack(stack.itemId, stack.count, stack.durability);
}
