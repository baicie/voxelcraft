import type { ToolType } from '../core/types';

export const B = {
  air: 0, grass: 1, dirt: 2, stone: 3, sand: 4, sandstone: 5, snow: 6,
  oakLog: 7, oakLeaves: 8, planks: 9, birchLog: 10, birchLeaves: 11,
  cactus: 12, gravel: 13, coalOre: 14, ironOre: 15, goldOre: 16, diamondOre: 17,
  cobble: 18, bedrock: 19, water: 20, glass: 21, brick: 22, craftingTable: 23,
  furnace: 24, torch: 25, tallGrass: 26, flowerRed: 27, flowerYellow: 28,
  farmland: 29, wheat: 30, clay: 31, moss: 32, stoneBrick: 33, spruceLog: 34,
  spruceLeaves: 35, ice: 36, glowstone: 37, obsidian: 38, reeds: 39,
} as const;
export type BlockId = (typeof B)[keyof typeof B];
export type BlockDefinition = {
  name: string; label: string; solid: boolean; opaque: boolean; hardness: number;
  tool: ToolType; level: number; drop: string | null; texture: string; top?: string; bottom?: string;
  cross?: boolean; liquid?: boolean; light?: number; replaceable?: boolean;
};
const block = (name: string, label: string, texture: string, options: Partial<BlockDefinition> = {}): BlockDefinition => ({
  name, label, texture, solid: true, opaque: true, hardness: 1, tool: 'none', level: 0,
  drop: `block:${name}`, ...options,
});
const defs: BlockDefinition[] = [
  block('air', 'Air', 'air', { solid: false, opaque: false, hardness: 0, drop: null, replaceable: true }),
  block('grass', 'Grass block', 'grass_side', { top: 'grass_top', bottom: 'dirt', tool: 'shovel', hardness: 0.7 }),
  block('dirt', 'Dirt', 'dirt', { tool: 'shovel', hardness: 0.6 }),
  block('stone', 'Stone', 'stone', { tool: 'pickaxe', level: 1, hardness: 1.8, drop: 'block:cobble' }),
  block('sand', 'Sand', 'sand', { tool: 'shovel', hardness: 0.5 }),
  block('sandstone', 'Sandstone', 'sandstone', { tool: 'pickaxe', level: 1, hardness: 1.2 }),
  block('snow', 'Snowy grass', 'snow_side', { top: 'snow_top', bottom: 'dirt', tool: 'shovel', hardness: 0.7 }),
  block('oakLog', 'Oak log', 'log_side', { top: 'log_top', bottom: 'log_top', tool: 'axe', hardness: 1.5 }),
  block('oakLeaves', 'Oak leaves', 'leaves', { opaque: false, tool: 'axe', hardness: 0.25, drop: 'block:oakLeaves' }),
  block('planks', 'Oak planks', 'planks', { tool: 'axe', hardness: 1.2 }),
  block('birchLog', 'Birch log', 'birch_side', { top: 'log_top', bottom: 'log_top', tool: 'axe', hardness: 1.5 }),
  block('birchLeaves', 'Birch leaves', 'birch_leaves', { opaque: false, tool: 'axe', hardness: 0.25 }),
  block('cactus', 'Cactus', 'cactus', { hardness: 0.5 }),
  block('gravel', 'Gravel', 'gravel', { tool: 'shovel', hardness: 0.65 }),
  block('coalOre', 'Coal ore', 'coal_ore', { tool: 'pickaxe', level: 1, hardness: 2.2, drop: 'item:coal' }),
  block('ironOre', 'Iron ore', 'iron_ore', { tool: 'pickaxe', level: 2, hardness: 2.8, drop: 'block:ironOre' }),
  block('goldOre', 'Gold ore', 'gold_ore', { tool: 'pickaxe', level: 3, hardness: 3, drop: 'item:goldNugget' }),
  block('diamondOre', 'Diamond ore', 'diamond_ore', { tool: 'pickaxe', level: 3, hardness: 3.2, drop: 'item:diamond' }),
  block('cobble', 'Cobblestone', 'cobble', { tool: 'pickaxe', level: 1, hardness: 1.7 }),
  block('bedrock', 'Bedrock', 'bedrock', { hardness: -1, drop: null }),
  block('water', 'Water', 'water', { solid: false, opaque: false, liquid: true, hardness: -1, drop: null, replaceable: true }),
  block('glass', 'Glass', 'glass', { opaque: false, hardness: 0.4, drop: 'block:glass' }),
  block('brick', 'Clay bricks', 'brick', { tool: 'pickaxe', level: 1, hardness: 2 }),
  block('craftingTable', 'Crafting table', 'crafting_side', { top: 'crafting_top', tool: 'axe', hardness: 1.2 }),
  block('furnace', 'Furnace', 'furnace', { tool: 'pickaxe', level: 1, hardness: 2 }),
  block('torch', 'Torch', 'torch', { solid: false, opaque: false, cross: true, hardness: 0.05, light: 14 }),
  block('tallGrass', 'Wild grass', 'tall_grass', { solid: false, opaque: false, cross: true, hardness: 0.05, drop: 'item:seeds', replaceable: true }),
  block('flowerRed', 'Poppy', 'flower_red', { solid: false, opaque: false, cross: true, hardness: 0.05, replaceable: true }),
  block('flowerYellow', 'Dandelion', 'flower_yellow', { solid: false, opaque: false, cross: true, hardness: 0.05, replaceable: true }),
  block('farmland', 'Farmland', 'farmland', { bottom: 'dirt', tool: 'shovel', hardness: 0.6 }),
  block('wheat', 'Wheat', 'wheat', { solid: false, opaque: false, cross: true, hardness: 0.05, drop: 'item:wheat', replaceable: true }),
  block('clay', 'Clay', 'clay', { tool: 'shovel', hardness: 0.6 }),
  block('moss', 'Mossy cobblestone', 'moss', { tool: 'pickaxe', level: 1, hardness: 1.7 }),
  block('stoneBrick', 'Stone bricks', 'stone_brick', { tool: 'pickaxe', level: 1, hardness: 1.8 }),
  block('spruceLog', 'Spruce log', 'spruce_side', { top: 'log_top', bottom: 'log_top', tool: 'axe', hardness: 1.6 }),
  block('spruceLeaves', 'Spruce needles', 'spruce_leaves', { opaque: false, tool: 'axe', hardness: 0.25 }),
  block('ice', 'Ice', 'ice', { opaque: false, hardness: 0.6, drop: null }),
  block('glowstone', 'Glowstone', 'glowstone', { hardness: 0.5, light: 15 }),
  block('obsidian', 'Obsidian', 'obsidian', { tool: 'pickaxe', level: 3, hardness: 8 }),
  block('reeds', 'Sugar cane', 'reeds', { solid: false, opaque: false, cross: true, hardness: 0.1, drop: 'item:reeds', replaceable: true }),
];
export const BLOCKS = defs;
export const blockAt = (id: number): BlockDefinition => defs[id] ?? defs[0];
export function blockByName(name: string): number {
  const entry = Object.entries(B).find(([, id]) => id !== 0 && blockAt(id).name === name);
  return entry?.[1] ?? 0;
}
export const blockKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
