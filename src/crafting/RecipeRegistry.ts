import type { ItemId } from '../items/ItemRegistry';
import { requireItemStack, type ItemStack } from '../items/ItemStack';

export type CraftStation = 'inventory' | 'crafting_table';

export interface ShapedRecipe {
  id: string;
  kind: 'shaped';
  width: number;
  height: number;
  grid: ReadonlyArray<ItemId | null>;
  result: ItemStack;
  station: CraftStation;
}

export interface ShapelessRecipe {
  id: string;
  kind: 'shapeless';
  ingredients: ReadonlyArray<{ itemId: ItemId; count: number }>;
  result: ItemStack;
  station: CraftStation;
}

export type CraftRecipe = ShapedRecipe | ShapelessRecipe;

const P = 'base:oak_planks';
const C = 'base:cobblestone';
const S = 'base:stick';
const COAL = 'base:coal';
const IRON = 'base:iron_ingot';

export const RECIPES: readonly CraftRecipe[] = [
  {
    id: 'oak_planks',
    kind: 'shapeless',
    ingredients: [{ itemId: 'base:oak_log', count: 1 }],
    result: requireItemStack('base:oak_planks', 4),
    station: 'inventory',
  },
  {
    id: 'stick',
    kind: 'shaped',
    width: 1,
    height: 2,
    grid: [P, P],
    result: requireItemStack('base:stick', 4),
    station: 'inventory',
  },
  {
    id: 'crafting_table',
    kind: 'shaped',
    width: 2,
    height: 2,
    grid: [P, P, P, P],
    result: requireItemStack('base:crafting_table', 1),
    station: 'inventory',
  },
  {
    id: 'torch',
    kind: 'shaped',
    width: 1,
    height: 2,
    grid: [COAL, S],
    result: requireItemStack('base:torch', 4),
    station: 'inventory',
  },
  {
    id: 'wooden_pickaxe',
    kind: 'shaped',
    width: 3,
    height: 3,
    grid: [P, P, P, null, S, null, null, S, null],
    result: requireItemStack('base:wooden_pickaxe', 1),
    station: 'crafting_table',
  },
  {
    id: 'stone_pickaxe',
    kind: 'shaped',
    width: 3,
    height: 3,
    grid: [C, C, C, null, S, null, null, S, null],
    result: requireItemStack('base:stone_pickaxe', 1),
    station: 'crafting_table',
  },
  {
    id: 'iron_pickaxe',
    kind: 'shaped',
    width: 3,
    height: 3,
    grid: [IRON, IRON, IRON, null, S, null, null, S, null],
    result: requireItemStack('base:iron_pickaxe', 1),
    station: 'crafting_table',
  },
  {
    id: 'furnace',
    kind: 'shaped',
    width: 3,
    height: 3,
    grid: [C, C, C, C, null, C, C, C, C],
    result: requireItemStack('base:furnace', 1),
    station: 'crafting_table',
  },
];

export function getRecipe(id: string): CraftRecipe | undefined {
  return RECIPES.find((recipe) => recipe.id === id);
}
