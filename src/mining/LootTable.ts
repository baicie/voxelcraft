import { createItemStack, type ItemStack } from '../items/ItemStack';
import { hashInt3, hashToUnit } from '../utils/math';
import { BlockId, getBlockDefinition } from '../world/BlockRegistry';
import { canHarvestBlock } from './MiningRules';

export interface LootContext {
  x: number;
  y: number;
  z: number;
  sequence: number;
  seed: number;
}

function make(itemId: string, count: number): ItemStack | null {
  return createItemStack(itemId, count);
}

function deterministicUnit(context: LootContext): number {
  return hashToUnit(hashInt3(context.x, context.y, context.z, context.seed ^ (context.sequence * 2654435761)));
}

export function getBlockDrops(blockId: BlockId, tool: ItemStack | null, context: LootContext): ItemStack[] {
  const block = getBlockDefinition(blockId);
  if (!block.breakable || !canHarvestBlock(block, tool)) return [];

  switch (blockId) {
    case BlockId.Grass:
      return [make('base:dirt', 1)].filter((stack): stack is ItemStack => !!stack);
    case BlockId.Dirt:
      return [make('base:dirt', 1)].filter((stack): stack is ItemStack => !!stack);
    case BlockId.Stone:
      return [make('base:cobblestone', 1)].filter((stack): stack is ItemStack => !!stack);
    case BlockId.Cobblestone:
      return [make('base:cobblestone', 1)].filter((stack): stack is ItemStack => !!stack);
    case BlockId.Sand:
      return [make('base:sand', 1)].filter((stack): stack is ItemStack => !!stack);
    case BlockId.Log:
      return [make('base:oak_log', 1)].filter((stack): stack is ItemStack => !!stack);
    case BlockId.Planks:
      return [make('base:oak_planks', 1)].filter((stack): stack is ItemStack => !!stack);
    case BlockId.Glass:
      return [make('base:glass', 1)].filter((stack): stack is ItemStack => !!stack);
    case BlockId.Snow:
      return [make('base:snow', 1)].filter((stack): stack is ItemStack => !!stack);
    case BlockId.CraftingTable:
      return [make('base:crafting_table', 1)].filter((stack): stack is ItemStack => !!stack);
    case BlockId.Furnace:
      return [make('base:furnace', 1)].filter((stack): stack is ItemStack => !!stack);
    case BlockId.Torch:
      return [make('base:torch', 1)].filter((stack): stack is ItemStack => !!stack);
    case BlockId.CoalOre: {
      if (!canHarvestBlock(block, tool)) return [];
      const amount = deterministicUnit(context) < 0.35 ? 2 : 1;
      return [make('base:coal', amount)].filter((stack): stack is ItemStack => !!stack);
    }
    case BlockId.IronOre:
      return [make('base:raw_iron', 1)].filter((stack): stack is ItemStack => !!stack);
    case BlockId.Leaves: {
      if (deterministicUnit(context) < 0.08) {
        return [make('base:apple', 1)].filter((stack): stack is ItemStack => !!stack);
      }
      return [];
    }
    case BlockId.Water:
    case BlockId.Bedrock:
    case BlockId.Air:
    default:
      return [];
  }
}

export function canMineBlock(blockId: BlockId): boolean {
  return getBlockDefinition(blockId).breakable;
}
