import { cloneStack, type ItemStack } from '../items/ItemStack';
import { Inventory } from '../inventory/Inventory';
import { inventoryService } from '../inventory/InventoryService';
import { matchRecipe, type RecipeMatch } from './RecipeMatcher';
import { RECIPES, type CraftStation } from './RecipeRegistry';

export interface CraftResult {
  crafted: number;
  output: ItemStack | null;
  recipeId?: string;
}

export class CraftingService {
  readonly recipes = RECIPES;

  findRecipe(grid: Inventory, station: CraftStation): RecipeMatch | null {
    return matchRecipe(this.recipes, grid.slots, this.gridSize(grid), station);
  }

  craft(grid: Inventory, inventory: Inventory, station: CraftStation, maxCrafts = 1): CraftResult {
    const gridCopy = this.copy(grid);
    const inventoryCopy = this.copy(inventory);
    let crafted = 0;
    let output: ItemStack | null = null;
    let recipeId: string | undefined;

    for (let iteration = 0; iteration < Math.max(0, Math.floor(maxCrafts)); iteration++) {
      const match = this.findRecipe(gridCopy, station);
      if (!match) break;
      recipeId = match.recipe.id;
      output = match.output;
      if (inventoryService.canInsert(inventoryCopy, match.output) < match.output.count) break;
      if (!this.consumeGridIngredients(gridCopy, match)) break;
      const insert = inventoryService.insert(inventoryCopy, match.output);
      if (insert.accepted !== match.output.count) {
        // Can only happen if capacity changed unexpectedly; abort without committing.
        break;
      }
      crafted++;
    }

    if (crafted > 0) {
      grid.replaceSlots(gridCopy.slots.map((stack) => cloneStack(stack)));
      inventory.replaceSlots(inventoryCopy.slots.map((stack) => cloneStack(stack)));
    }
    return { crafted, output: crafted > 0 ? output : null, recipeId };
  }

  /** Returns leftovers that could not fit in the inventory. */
  returnGridToInventory(grid: Inventory, inventory: Inventory): ItemStack[] {
    const inventoryCopy = this.copy(inventory);
    const leftovers: ItemStack[] = [];
    for (const stack of grid.slots) {
      if (!stack) continue;
      const result = inventoryService.insert(inventoryCopy, stack);
      if (result.remainder > 0) leftovers.push({ ...stack, count: result.remainder });
    }
    inventory.replaceSlots(inventoryCopy.slots.map((entry) => cloneStack(entry)));
    grid.replaceSlots(grid.slots.map(() => null));
    return leftovers;
  }

  private consumeGridIngredients(grid: Inventory, match: RecipeMatch): boolean {
    const nonEmpty = grid.slots.filter((stack): stack is ItemStack => !!stack);
    if (nonEmpty.length === 0) return false;
    // A shaped recipe consumes one item per occupied cell. A shapeless recipe
    // consumes the exact ingredients from the matching cells.
    if (match.recipe.kind === 'shapeless') {
      const required = new Map(match.recipe.ingredients.map((ingredient) => [ingredient.itemId, ingredient.count]));
      for (let index = 0; index < grid.size; index++) {
        const stack = grid.get(index);
        if (!stack || !required.has(stack.itemId)) continue;
        const needed = required.get(stack.itemId) ?? 0;
        if (needed <= 0) continue;
        const amount = Math.min(needed, stack.count);
        inventoryService.extract(grid, index, amount);
        required.set(stack.itemId, needed - amount);
      }
      for (const amount of required.values()) if (amount > 0) return false;
      return true;
    }

    for (let index = 0; index < grid.size; index++) {
      if (grid.get(index)) inventoryService.extract(grid, index, 1);
    }
    return true;
  }

  private gridSize(grid: Inventory): number {
    return grid.size === 4 ? 2 : 3;
  }

  private copy(inventory: Inventory): Inventory {
    return new Inventory(inventory.id, inventory.slots.map((stack) => cloneStack(stack)), inventory.revision, inventory.size);
  }
}

export const craftingService = new CraftingService();
