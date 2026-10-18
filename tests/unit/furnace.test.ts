import { describe, expect, it } from 'vitest';
import {
  FURNACE_COOK_TICKS,
  FurnaceStore,
  furnaceKey,
} from '../../src/furnace/FurnaceStore';
import { createItemStack } from '../../src/items/ItemStack';

function stack(itemId: string, count = 1) {
  return createItemStack(itemId, count)!;
}

describe('FurnaceStore', () => {
  it('smelts raw iron with coal and consumes fuel/progress correctly', () => {
    const store = new FurnaceStore();
    const state = store.getOrCreate(1, 2, 3);
    state.input = stack('base:raw_iron', 1);
    state.fuel = stack('base:coal', 1);

    store.tick(FURNACE_COOK_TICKS);

    expect(state.input).toBeNull();
    expect(state.output?.itemId).toBe('base:iron_ingot');
    expect(state.output?.count).toBe(1);
    expect(state.fuel).toBeNull();
    expect(state.remainingFuelTicks).toBeGreaterThan(0);
    expect(store.progress(1, 2, 3)).toBe(0);
  });

  it('does not consume input/fuel when output cannot accept the result', () => {
    const store = new FurnaceStore();
    const state = store.getOrCreate(0, 0, 0);
    state.input = stack('base:raw_iron', 1);
    state.fuel = stack('base:coal', 1);
    state.output = stack('base:iron_ingot', 64);
    store.tick(FURNACE_COOK_TICKS);
    expect(state.input?.count).toBe(1);
    expect(state.fuel?.count).toBe(1);
    expect(state.output?.count).toBe(64);
  });

  it('does not burn fuel without a valid smeltable input', () => {
    const store = new FurnaceStore();
    const state = store.getOrCreate(0, 0, 0);
    state.fuel = stack('base:coal', 1);
    state.input = stack('base:dirt', 1);
    store.tick(100);
    expect(state.remainingFuelTicks).toBe(0);
    expect(state.fuel?.count).toBe(1);
    expect(state.cookProgressTicks).toBe(0);
  });

  it('supports slot take/put without duplication and preserves output-only rules', () => {
    const store = new FurnaceStore();
    store.getOrCreate(0, 0, 0);
    const remaining = store.placeIntoSlot(0, 0, 0, 'input', stack('base:raw_iron', 3), 2);
    expect(remaining?.count).toBe(1);
    expect(store.get(0, 0, 0)?.input?.count).toBe(2);
    const taken = store.takeSlot(0, 0, 0, 'input', 1);
    expect(taken?.count).toBe(1);
    expect(store.get(0, 0, 0)?.input?.count).toBe(1);
  });

  it('round-trips furnace state through save/load', () => {
    const store = new FurnaceStore();
    const state = store.getOrCreate(4, 5, 6);
    state.input = stack('base:raw_iron', 2);
    state.fuel = stack('base:coal', 1);
    state.output = stack('base:iron_ingot', 1);
    state.cookProgressTicks = 123;
    state.remainingFuelTicks = 456;
    state.burnDurationTicks = 4800;

    const restored = FurnaceStore.fromSave(store.toSave());
    const restoredState = restored.get(4, 5, 6);
    expect(restoredState?.input?.count).toBe(2);
    expect(restoredState?.fuel?.itemId).toBe('base:coal');
    expect(restoredState?.output?.itemId).toBe('base:iron_ingot');
    expect(restoredState?.cookProgressTicks).toBe(123);
    expect(restoredState?.remainingFuelTicks).toBe(456);
    expect(furnaceKey(4, 5, 6)).toBe('4,5,6');
    expect(restored.contents(4, 5, 6)).toHaveLength(3);
  });

  it('removes the furnace and exposes all contents for drops', () => {
    const store = new FurnaceStore();
    const state = store.getOrCreate(-1, 10, 2);
    state.input = stack('base:raw_iron', 1);
    state.fuel = stack('base:coal', 2);
    state.output = stack('base:iron_ingot', 3);
    const removed = store.remove(-1, 10, 2);
    expect(removed?.input?.count).toBe(1);
    expect(store.get(-1, 10, 2)).toBeUndefined();
  });
});
