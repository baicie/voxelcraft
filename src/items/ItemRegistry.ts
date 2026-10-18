import { BlockId } from '../world/BlockRegistry';

export type ItemId = string;
export type ToolKind = 'pickaxe' | 'axe' | 'shovel';

export interface ToolProperties {
  kind: ToolKind;
  tier: 1 | 2 | 3;
  speed: number;
}

export interface ItemDefinition {
  readonly id: ItemId;
  readonly key: string;
  readonly name: string;
  readonly maxStack: number;
  readonly iconKey: string;
  readonly color: number;
  readonly placeBlockId?: BlockId;
  readonly tool?: ToolProperties;
  readonly maxDurability?: number;
  readonly fuelTicks?: number;
  readonly smeltResult?: ItemId;
  readonly tags: readonly string[];
}

const BLOCK_ITEM_COLOR: Partial<Record<BlockId, number>> = {
  [BlockId.Grass]: 0x7ea53d,
  [BlockId.Dirt]: 0x875a35,
  [BlockId.Stone]: 0x7c7f7c,
  [BlockId.Sand]: 0xd9c17d,
  [BlockId.Log]: 0x6e4d2f,
  [BlockId.Leaves]: 0x568632,
  [BlockId.Planks]: 0xb08851,
  [BlockId.Cobblestone]: 0x6f716f,
  [BlockId.Glass]: 0xafe0e8,
  [BlockId.Snow]: 0xe9eff2,
  [BlockId.CraftingTable]: 0x9f7a49,
  [BlockId.Furnace]: 0x6f716f,
  [BlockId.Torch]: 0xffc45e,
};

function blockItem(
  id: ItemId,
  name: string,
  placeBlockId: BlockId,
  extra: Partial<ItemDefinition> = {},
): ItemDefinition {
  return {
    id,
    key: id.split(':')[1] ?? id,
    name,
    maxStack: 64,
    iconKey: `block:${placeBlockId}`,
    color: BLOCK_ITEM_COLOR[placeBlockId] ?? 0xaaaaaa,
    placeBlockId,
    tags: ['block'],
    ...extra,
  };
}

export const ITEM_DEFS: Readonly<Record<ItemId, ItemDefinition>> = {
  'base:grass_block': blockItem('base:grass_block', '草方块', BlockId.Grass),
  'base:dirt': blockItem('base:dirt', '泥土', BlockId.Dirt),
  'base:stone': blockItem('base:stone', '石头', BlockId.Stone),
  'base:sand': blockItem('base:sand', '沙子', BlockId.Sand),
  'base:oak_log': blockItem('base:oak_log', '橡木原木', BlockId.Log, { fuelTicks: 300 }),
  'base:oak_leaves': blockItem('base:oak_leaves', '橡树叶', BlockId.Leaves),
  'base:oak_planks': blockItem('base:oak_planks', '橡木木板', BlockId.Planks, { fuelTicks: 300 }),
  'base:cobblestone': blockItem('base:cobblestone', '圆石', BlockId.Cobblestone),
  'base:glass': blockItem('base:glass', '玻璃', BlockId.Glass),
  'base:snow': blockItem('base:snow', '雪', BlockId.Snow),
  'base:crafting_table': blockItem('base:crafting_table', '工作台', BlockId.CraftingTable),
  'base:furnace': blockItem('base:furnace', '熔炉', BlockId.Furnace, { maxStack: 64 }),
  'base:torch': blockItem('base:torch', '火把', BlockId.Torch),
  'base:stick': {
    id: 'base:stick',
    key: 'stick',
    name: '木棍',
    maxStack: 64,
    iconKey: 'item:stick',
    color: 0xa47a45,
    fuelTicks: 100,
    tags: ['material'],
  },
  'base:coal': {
    id: 'base:coal',
    key: 'coal',
    name: '煤炭',
    maxStack: 64,
    iconKey: 'item:coal',
    color: 0x2f3234,
    fuelTicks: 4800,
    tags: ['material', 'fuel'],
  },
  'base:raw_iron': {
    id: 'base:raw_iron',
    key: 'raw_iron',
    name: '粗铁',
    maxStack: 64,
    iconKey: 'item:raw_iron',
    color: 0xb58a6e,
    smeltResult: 'base:iron_ingot',
    tags: ['material', 'ore'],
  },
  'base:iron_ingot': {
    id: 'base:iron_ingot',
    key: 'iron_ingot',
    name: '铁锭',
    maxStack: 64,
    iconKey: 'item:iron_ingot',
    color: 0xe0e0e5,
    tags: ['material', 'metal'],
  },
  'base:apple': {
    id: 'base:apple',
    key: 'apple',
    name: '苹果',
    maxStack: 64,
    iconKey: 'item:apple',
    color: 0xc44b3e,
    tags: ['food'],
  },
  'base:wooden_pickaxe': {
    id: 'base:wooden_pickaxe',
    key: 'wooden_pickaxe',
    name: '木镐',
    maxStack: 1,
    iconKey: 'tool:wooden_pickaxe',
    color: 0xb08851,
    tool: { kind: 'pickaxe', tier: 1, speed: 2 },
    maxDurability: 60,
    tags: ['tool', 'pickaxe'],
  },
  'base:stone_pickaxe': {
    id: 'base:stone_pickaxe',
    key: 'stone_pickaxe',
    name: '石镐',
    maxStack: 1,
    iconKey: 'tool:stone_pickaxe',
    color: 0x90918d,
    tool: { kind: 'pickaxe', tier: 2, speed: 4 },
    maxDurability: 132,
    tags: ['tool', 'pickaxe'],
  },
  'base:iron_pickaxe': {
    id: 'base:iron_pickaxe',
    key: 'iron_pickaxe',
    name: '铁镐',
    maxStack: 1,
    iconKey: 'tool:iron_pickaxe',
    color: 0xd8dadd,
    tool: { kind: 'pickaxe', tier: 3, speed: 6 },
    maxDurability: 251,
    tags: ['tool', 'pickaxe'],
  },
};

export const ALL_ITEMS: readonly ItemDefinition[] = Object.values(ITEM_DEFS);

export function getItemDefinition(itemId: ItemId): ItemDefinition | undefined {
  return ITEM_DEFS[itemId];
}

export function requireItemDefinition(itemId: ItemId): ItemDefinition {
  const definition = ITEM_DEFS[itemId];
  if (!definition) throw new Error(`Unknown item definition: ${itemId}`);
  return definition;
}

export function isKnownItemId(itemId: string): boolean {
  return Object.prototype.hasOwnProperty.call(ITEM_DEFS, itemId);
}

const ITEM_BY_BLOCK = new Map<BlockId, ItemId>();
for (const definition of ALL_ITEMS) {
  if (definition.placeBlockId !== undefined) ITEM_BY_BLOCK.set(definition.placeBlockId, definition.id);
}

export function getBlockItemId(blockId: BlockId): ItemId | undefined {
  return ITEM_BY_BLOCK.get(blockId);
}

export function getPlaceBlockId(itemId: ItemId): BlockId | undefined {
  return ITEM_DEFS[itemId]?.placeBlockId;
}

export function getFuelTicks(itemId: ItemId): number {
  return ITEM_DEFS[itemId]?.fuelTicks ?? 0;
}
