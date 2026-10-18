export enum BlockId {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  Log = 5,
  Leaves = 6,
  Water = 7,
  Bedrock = 8,
  Planks = 9,
  Cobblestone = 10,
  Glass = 11,
  CoalOre = 12,
  Snow = 13,
  CraftingTable = 14,
  Furnace = 15,
  IronOre = 16,
  Torch = 17,
}

export enum BlockFace {
  East = 0,
  West = 1,
  Top = 2,
  Bottom = 3,
  South = 4,
  North = 5,
}

export type RenderLayer = 'opaque' | 'cutout' | 'transparent';
export type RenderType = 'cube' | 'cross';
export type ToolKind = 'pickaxe' | 'axe' | 'shovel';
export type BlockTag = 'wood' | 'stone' | 'soil' | 'ore' | 'plant' | 'liquid' | 'metal' | 'building';

export interface BlockDefinition {
  readonly id: BlockId;
  /** Stable namespaced ID used by persistence and registries. */
  readonly stableId: string;
  readonly key: string;
  readonly name: string;
  readonly solid: boolean;
  readonly opaque: boolean;
  readonly liquid: boolean;
  readonly breakable: boolean;
  readonly replaceable: boolean;
  /** Effective seconds value used by the mining formula. */
  readonly hardness: number;
  readonly requiredTool?: ToolKind;
  readonly minimumToolTier: number;
  readonly harvestableByHand: boolean;
  readonly renderLayer: RenderLayer;
  readonly renderType: RenderType;
  /** East, West, Top, Bottom, South, North. */
  readonly faces: readonly [string, string, string, string, string, string];
  readonly particleColor: number;
  readonly interaction?: 'crafting_table' | 'furnace';
  readonly blockEntityType?: 'furnace';
  readonly tags: readonly BlockTag[];
}

const AIR: BlockDefinition = {
  id: BlockId.Air,
  stableId: 'base:air',
  key: 'air',
  name: '空气',
  solid: false,
  opaque: false,
  liquid: false,
  breakable: false,
  replaceable: true,
  hardness: 0,
  minimumToolTier: 0,
  harvestableByHand: false,
  renderLayer: 'opaque',
  renderType: 'cube',
  faces: ['air', 'air', 'air', 'air', 'air', 'air'],
  particleColor: 0xffffff,
  tags: [],
};

function cubeFaces(texture: string): readonly [string, string, string, string, string, string] {
  return [texture, texture, texture, texture, texture, texture];
}

export const BLOCK_DEFS: Readonly<Record<BlockId, BlockDefinition>> = {
  [BlockId.Air]: AIR,
  [BlockId.Grass]: {
    id: BlockId.Grass,
    stableId: 'base:grass_block',
    key: 'grass',
    name: '草方块',
    solid: true,
    opaque: true,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 0.4,
    minimumToolTier: 0,
    harvestableByHand: true,
    renderLayer: 'opaque',
    renderType: 'cube',
    faces: ['grass_side', 'grass_side', 'grass_top', 'dirt', 'grass_side', 'grass_side'],
    particleColor: 0x7ea53d,
    tags: ['soil'],
  },
  [BlockId.Dirt]: {
    id: BlockId.Dirt,
    stableId: 'base:dirt',
    key: 'dirt',
    name: '泥土',
    solid: true,
    opaque: true,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 0.32,
    minimumToolTier: 0,
    harvestableByHand: true,
    renderLayer: 'opaque',
    renderType: 'cube',
    faces: cubeFaces('dirt'),
    particleColor: 0x875a35,
    tags: ['soil'],
  },
  [BlockId.Stone]: {
    id: BlockId.Stone,
    stableId: 'base:stone',
    key: 'stone',
    name: '石头',
    solid: true,
    opaque: true,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 1.15,
    requiredTool: 'pickaxe',
    minimumToolTier: 1,
    harvestableByHand: false,
    renderLayer: 'opaque',
    renderType: 'cube',
    faces: cubeFaces('stone'),
    particleColor: 0x7c7f7c,
    tags: ['stone'],
  },
  [BlockId.Sand]: {
    id: BlockId.Sand,
    stableId: 'base:sand',
    key: 'sand',
    name: '沙子',
    solid: true,
    opaque: true,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 0.3,
    minimumToolTier: 0,
    harvestableByHand: true,
    renderLayer: 'opaque',
    renderType: 'cube',
    faces: cubeFaces('sand'),
    particleColor: 0xd9c17d,
    tags: ['soil'],
  },
  [BlockId.Log]: {
    id: BlockId.Log,
    stableId: 'base:oak_log',
    key: 'oak_log',
    name: '橡木原木',
    solid: true,
    opaque: true,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 0.85,
    requiredTool: 'axe',
    minimumToolTier: 0,
    harvestableByHand: true,
    renderLayer: 'opaque',
    renderType: 'cube',
    faces: ['log_side', 'log_side', 'log_top', 'log_top', 'log_side', 'log_side'],
    particleColor: 0x6e4d2f,
    tags: ['wood'],
  },
  [BlockId.Leaves]: {
    id: BlockId.Leaves,
    stableId: 'base:oak_leaves',
    key: 'oak_leaves',
    name: '橡树叶',
    solid: true,
    opaque: false,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 0.18,
    minimumToolTier: 0,
    harvestableByHand: true,
    renderLayer: 'cutout',
    renderType: 'cube',
    faces: cubeFaces('leaves'),
    particleColor: 0x568632,
    tags: ['plant'],
  },
  [BlockId.Water]: {
    id: BlockId.Water,
    stableId: 'base:water',
    key: 'water',
    name: '水',
    solid: false,
    opaque: false,
    liquid: true,
    breakable: false,
    replaceable: true,
    hardness: 0,
    minimumToolTier: 0,
    harvestableByHand: false,
    renderLayer: 'transparent',
    renderType: 'cube',
    faces: cubeFaces('water'),
    particleColor: 0x3f83b5,
    tags: ['liquid'],
  },
  [BlockId.Bedrock]: {
    id: BlockId.Bedrock,
    stableId: 'base:bedrock',
    key: 'bedrock',
    name: '基岩',
    solid: true,
    opaque: true,
    liquid: false,
    breakable: false,
    replaceable: false,
    hardness: Number.POSITIVE_INFINITY,
    minimumToolTier: 0,
    harvestableByHand: false,
    renderLayer: 'opaque',
    renderType: 'cube',
    faces: cubeFaces('bedrock'),
    particleColor: 0x3a3d42,
    tags: ['stone'],
  },
  [BlockId.Planks]: {
    id: BlockId.Planks,
    stableId: 'base:oak_planks',
    key: 'oak_planks',
    name: '橡木木板',
    solid: true,
    opaque: true,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 0.75,
    requiredTool: 'axe',
    minimumToolTier: 0,
    harvestableByHand: true,
    renderLayer: 'opaque',
    renderType: 'cube',
    faces: cubeFaces('planks'),
    particleColor: 0xb08851,
    tags: ['wood', 'building'],
  },
  [BlockId.Cobblestone]: {
    id: BlockId.Cobblestone,
    stableId: 'base:cobblestone',
    key: 'cobblestone',
    name: '圆石',
    solid: true,
    opaque: true,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 1.3,
    requiredTool: 'pickaxe',
    minimumToolTier: 1,
    harvestableByHand: false,
    renderLayer: 'opaque',
    renderType: 'cube',
    faces: cubeFaces('cobblestone'),
    particleColor: 0x6f716f,
    tags: ['stone', 'building'],
  },
  [BlockId.Glass]: {
    id: BlockId.Glass,
    stableId: 'base:glass',
    key: 'glass',
    name: '玻璃',
    solid: true,
    opaque: false,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 0.28,
    minimumToolTier: 0,
    harvestableByHand: true,
    renderLayer: 'transparent',
    renderType: 'cube',
    faces: cubeFaces('glass'),
    particleColor: 0xafe0e8,
    tags: ['building'],
  },
  [BlockId.CoalOre]: {
    id: BlockId.CoalOre,
    stableId: 'base:coal_ore',
    key: 'coal_ore',
    name: '煤矿石',
    solid: true,
    opaque: true,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 1.4,
    requiredTool: 'pickaxe',
    minimumToolTier: 1,
    harvestableByHand: false,
    renderLayer: 'opaque',
    renderType: 'cube',
    faces: cubeFaces('coal_ore'),
    particleColor: 0x5b5c59,
    tags: ['stone', 'ore'],
  },
  [BlockId.Snow]: {
    id: BlockId.Snow,
    stableId: 'base:snow',
    key: 'snow',
    name: '雪',
    solid: true,
    opaque: true,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 0.22,
    minimumToolTier: 0,
    harvestableByHand: true,
    renderLayer: 'opaque',
    renderType: 'cube',
    faces: cubeFaces('snow'),
    particleColor: 0xe9eff2,
    tags: ['soil'],
  },
  [BlockId.CraftingTable]: {
    id: BlockId.CraftingTable,
    stableId: 'base:crafting_table',
    key: 'crafting_table',
    name: '工作台',
    solid: true,
    opaque: true,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 0.8,
    requiredTool: 'axe',
    minimumToolTier: 0,
    harvestableByHand: true,
    renderLayer: 'opaque',
    renderType: 'cube',
    faces: [
      'crafting_table_side',
      'crafting_table_side',
      'crafting_table_top',
      'planks',
      'crafting_table_front',
      'crafting_table_front',
    ],
    particleColor: 0x9f7a49,
    interaction: 'crafting_table',
    tags: ['wood', 'building'],
  },
  [BlockId.Furnace]: {
    id: BlockId.Furnace,
    stableId: 'base:furnace',
    key: 'furnace',
    name: '熔炉',
    solid: true,
    opaque: true,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 1.6,
    requiredTool: 'pickaxe',
    minimumToolTier: 1,
    harvestableByHand: false,
    renderLayer: 'opaque',
    renderType: 'cube',
    faces: ['furnace_side', 'furnace_side', 'furnace_top', 'furnace_top', 'furnace_front', 'furnace_side'],
    particleColor: 0x6f716f,
    interaction: 'furnace',
    blockEntityType: 'furnace',
    tags: ['stone', 'building'],
  },
  [BlockId.IronOre]: {
    id: BlockId.IronOre,
    stableId: 'base:iron_ore',
    key: 'iron_ore',
    name: '铁矿石',
    solid: true,
    opaque: true,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 1.8,
    requiredTool: 'pickaxe',
    minimumToolTier: 2,
    harvestableByHand: false,
    renderLayer: 'opaque',
    renderType: 'cube',
    faces: cubeFaces('iron_ore'),
    particleColor: 0x9a8574,
    tags: ['stone', 'ore'],
  },
  [BlockId.Torch]: {
    id: BlockId.Torch,
    stableId: 'base:torch',
    key: 'torch',
    name: '火把',
    solid: false,
    opaque: false,
    liquid: false,
    breakable: true,
    replaceable: false,
    hardness: 0.05,
    minimumToolTier: 0,
    harvestableByHand: true,
    renderLayer: 'cutout',
    renderType: 'cross',
    faces: cubeFaces('torch'),
    particleColor: 0xffc45e,
    tags: ['plant', 'building'],
  },
};

export function getBlockDefinition(id: BlockId): BlockDefinition {
  return BLOCK_DEFS[id] ?? AIR;
}

export function getBlockStableId(id: BlockId): string {
  return getBlockDefinition(id).stableId;
}

const BLOCK_BY_STABLE_ID = new Map<string, BlockId>(
  Object.values(BLOCK_DEFS).map((definition) => [definition.stableId, definition.id]),
);

export function blockIdFromStableId(stableId: string): BlockId | null {
  return BLOCK_BY_STABLE_ID.get(stableId) ?? null;
}

export function isKnownBlockStableId(stableId: string): boolean {
  return BLOCK_BY_STABLE_ID.has(stableId);
}

export function isOpaqueBlock(id: BlockId): boolean {
  return getBlockDefinition(id).opaque;
}

export function isSolidBlock(id: BlockId): boolean {
  return getBlockDefinition(id).solid;
}

export function isLiquidBlock(id: BlockId): boolean {
  return getBlockDefinition(id).liquid;
}

export function isReplaceableBlock(id: BlockId): boolean {
  return getBlockDefinition(id).replaceable;
}

export function getFaceTexture(id: BlockId, face: BlockFace): string {
  return getBlockDefinition(id).faces[face];
}

/** Legacy numeric V1 save mapping. Kept explicit for migration tests. */
export const V1_BLOCK_ID_TO_STABLE: Readonly<Record<number, string>> = {
  0: 'base:air',
  1: 'base:grass_block',
  2: 'base:dirt',
  3: 'base:stone',
  4: 'base:sand',
  5: 'base:oak_log',
  6: 'base:oak_leaves',
  7: 'base:water',
  8: 'base:bedrock',
  9: 'base:oak_planks',
  10: 'base:cobblestone',
  11: 'base:glass',
  12: 'base:coal_ore',
  13: 'base:snow',
};

export const HOTBAR_BLOCKS: readonly BlockId[] = [
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Stone,
  BlockId.Sand,
  BlockId.Log,
  BlockId.Leaves,
  BlockId.Planks,
  BlockId.Cobblestone,
  BlockId.Glass,
];
