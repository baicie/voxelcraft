import type { ItemStack } from '../items/ItemStack';
import type { CraftRecipe, CraftStation } from './RecipeRegistry';

export interface RecipeMatch {
  recipe: CraftRecipe;
  output: ItemStack;
}

interface OccupiedBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function occupiedBounds(slots: readonly (ItemStack | null)[], size: number): OccupiedBounds | null {
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < slots.length; index++) {
    if (!slots[index]) continue;
    const x = index % size;
    const y = Math.floor(index / size);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

function matchShaped(
  recipe: Extract<CraftRecipe, { kind: 'shaped' }>,
  slots: readonly (ItemStack | null)[],
  size: number,
): boolean {
  const bounds = occupiedBounds(slots, size);
  if (!bounds) return false;
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  if (width !== recipe.width || height !== recipe.height) return false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const actual = slots[(bounds.minY + y) * size + bounds.minX + x]?.itemId ?? null;
      const expected = recipe.grid[y * recipe.width + x] ?? null;
      if (actual !== expected) return false;
    }
  }
  return true;
}

function matchShapeless(
  recipe: Extract<CraftRecipe, { kind: 'shapeless' }>,
  slots: readonly (ItemStack | null)[],
): boolean {
  const counts = new Map<string, number>();
  const types = new Set<string>();
  for (const stack of slots) {
    if (!stack) continue;
    types.add(stack.itemId);
    counts.set(stack.itemId, (counts.get(stack.itemId) ?? 0) + stack.count);
  }
  const requiredTypes = new Set(recipe.ingredients.map((ingredient) => ingredient.itemId));
  if (types.size !== requiredTypes.size) return false;
  for (const type of types) if (!requiredTypes.has(type)) return false;
  for (const ingredient of recipe.ingredients) {
    if ((counts.get(ingredient.itemId) ?? 0) < ingredient.count) return false;
  }
  return true;
}

export function matchRecipe(
  recipes: readonly CraftRecipe[],
  slots: readonly (ItemStack | null)[],
  size: number,
  station: CraftStation,
): RecipeMatch | null {
  // Personal 2×2 is not allowed to execute table recipes.
  for (const recipe of recipes) {
    if (recipe.station === 'crafting_table' && station === 'inventory') continue;
    const matched =
      recipe.kind === 'shaped' ? matchShaped(recipe, slots, size) : matchShapeless(recipe, slots);
    if (matched) return { recipe, output: { ...recipe.result } };
  }
  return null;
}
