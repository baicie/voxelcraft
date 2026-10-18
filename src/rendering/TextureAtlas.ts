import * as THREE from 'three';
import { mulberry32 } from '../utils/math';

export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

interface TileEntry {
  readonly name: string;
  readonly canvas: HTMLCanvasElement;
  readonly uv: UvRect;
}

const TILE_SIZE = 16;
const ATLAS_COLUMNS = 8;
const ATLAS_SIZE = TILE_SIZE * ATLAS_COLUMNS;
const UV_INSET = 0.01 / ATLAS_SIZE;

export const TEXTURE_TILE_NAMES = [
  'grass_top',
  'grass_side',
  'dirt',
  'stone',
  'sand',
  'log_side',
  'log_top',
  'leaves',
  'water',
  'bedrock',
  'planks',
  'cobblestone',
  'glass',
  'coal_ore',
  'snow',
  'crafting_table_top',
  'crafting_table_side',
  'crafting_table_front',
  'furnace_front',
  'furnace_side',
  'furnace_top',
  'iron_ore',
  'torch',
] as const;

type PixelSetter = (x: number, y: number, r: number, g: number, b: number, a?: number) => void;

/** Original procedural pixel-art atlas. No external texture assets are used. */
export class TextureAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  readonly tileSize = TILE_SIZE;
  readonly atlasSize = ATLAS_SIZE;
  private readonly tiles = new Map<string, TileEntry>();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_SIZE;
    this.canvas.height = ATLAS_SIZE;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Unable to create texture atlas canvas');
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

    TEXTURE_TILE_NAMES.forEach((name, index) => {
      const tileCanvas = paintTile(name);
      const column = index % ATLAS_COLUMNS;
      const row = Math.floor(index / ATLAS_COLUMNS);
      context.drawImage(tileCanvas, column * TILE_SIZE, row * TILE_SIZE);
      const x0 = column * TILE_SIZE;
      const y0 = row * TILE_SIZE;
      this.tiles.set(name, {
        name,
        canvas: tileCanvas,
        uv: {
          u0: x0 / ATLAS_SIZE + UV_INSET,
          u1: (x0 + TILE_SIZE) / ATLAS_SIZE - UV_INSET,
          v0: 1 - (y0 + TILE_SIZE) / ATLAS_SIZE + UV_INSET,
          v1: 1 - y0 / ATLAS_SIZE - UV_INSET,
        },
      });
    });

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  getUvRect(name: string): UvRect {
    return this.tiles.get(name)?.uv ?? this.tiles.get('stone')!.uv;
  }

  getTileCanvas(name: string): HTMLCanvasElement {
    return this.tiles.get(name)?.canvas ?? this.tiles.get('stone')!.canvas;
  }

  hasTile(name: string): boolean {
    return this.tiles.has(name);
  }

  dispose(): void {
    this.texture.dispose();
    this.tiles.clear();
  }
}

function paintTile(name: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create tile canvas');
  const image = context.createImageData(TILE_SIZE, TILE_SIZE);
  const rng = mulberry32(0x7f4a7c15 ^ hashTileName(name));
  const setPixel: PixelSetter = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= TILE_SIZE || y >= TILE_SIZE) return;
    const index = (y * TILE_SIZE + x) * 4;
    image.data[index] = clampByte(r);
    image.data[index + 1] = clampByte(g);
    image.data[index + 2] = clampByte(b);
    image.data[index + 3] = clampByte(a);
  };

  switch (name) {
    case 'grass_top':
      paintGrassTop(setPixel, rng);
      break;
    case 'grass_side':
      paintGrassSide(setPixel, rng);
      break;
    case 'dirt':
      paintDirt(setPixel, rng);
      break;
    case 'stone':
      paintStone(setPixel, rng);
      break;
    case 'sand':
      paintSand(setPixel, rng);
      break;
    case 'log_side':
      paintLogSide(setPixel, rng);
      break;
    case 'log_top':
      paintLogTop(setPixel, rng);
      break;
    case 'leaves':
      paintLeaves(setPixel, rng);
      break;
    case 'water':
      paintWater(setPixel, rng);
      break;
    case 'bedrock':
      paintBedrock(setPixel, rng);
      break;
    case 'planks':
      paintPlanks(setPixel, rng);
      break;
    case 'cobblestone':
      paintCobblestone(setPixel, rng);
      break;
    case 'glass':
      paintGlass(setPixel, rng);
      break;
    case 'coal_ore':
      paintCoalOre(setPixel, rng);
      break;
    case 'snow':
      paintSnow(setPixel, rng);
      break;
    case 'crafting_table_top':
      paintCraftingTableTop(setPixel, rng);
      break;
    case 'crafting_table_side':
      paintCraftingTableSide(setPixel, rng);
      break;
    case 'crafting_table_front':
      paintCraftingTableFront(setPixel, rng);
      break;
    case 'furnace_front':
      paintFurnaceFront(setPixel, rng);
      break;
    case 'furnace_side':
      paintFurnaceSide(setPixel, rng);
      break;
    case 'furnace_top':
      paintFurnaceTop(setPixel, rng);
      break;
    case 'iron_ore':
      paintIronOre(setPixel, rng);
      break;
    case 'torch':
      paintTorch(setPixel, rng);
      break;
    default:
      paintStone(setPixel, rng);
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

function paintGrassTop(set: PixelSetter, rng: () => number): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const noise = rng();
      const blade = (x * 7 + y * 13) % 11 === 0;
      const r = blade ? 139 : 94 + noise * 30;
      const g = blade ? 188 : 146 + noise * 29;
      const b = blade ? 77 : 55 + noise * 20;
      set(x, y, r, g, b);
    }
  }
  for (let i = 0; i < 11; i++) {
    const x = Math.floor(rng() * 16);
    const y = Math.floor(rng() * 16);
    set(x, y, 74, 125, 44);
    set(x, y + 1, 112, 165, 60);
  }
}

function paintGrassSide(set: PixelSetter, rng: () => number): void {
  paintDirt(set, rng);
  for (let x = 0; x < TILE_SIZE; x++) {
    const depth = 3 + Math.floor(rng() * 3);
    for (let y = 0; y < depth; y++) {
      const t = rng();
      set(x, y, 88 + t * 30, 139 + t * 34, 51 + t * 20);
    }
    if (rng() > 0.45) set(x, depth, 73, 118, 43);
    if (rng() > 0.68) set(x, depth + 1, 92, 63, 38);
  }
}

function paintDirt(set: PixelSetter, rng: () => number): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const t = rng();
      set(x, y, 111 + t * 32, 73 + t * 23, 43 + t * 17);
    }
  }
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(rng() * 16);
    const y = Math.floor(rng() * 16);
    set(x, y, 88 + rng() * 12, 56 + rng() * 10, 34 + rng() * 8);
    if (rng() > 0.72) set(x + 1, y, 139, 94, 56);
  }
}

function paintStone(set: PixelSetter, rng: () => number): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const t = rng();
      set(x, y, 113 + t * 29, 115 + t * 28, 112 + t * 26);
    }
  }
  for (let crack = 0; crack < 3; crack++) {
    let x = 2 + Math.floor(rng() * 12);
    let y = 2 + Math.floor(rng() * 12);
    for (let step = 0; step < 5; step++) {
      set(x, y, 87, 89, 87);
      if (rng() > 0.5) set(x + 1, y, 139, 140, 137);
      x += rng() > 0.5 ? 1 : 0;
      y += 1;
    }
  }
  for (let i = 0; i < 9; i++) {
    set(Math.floor(rng() * 16), Math.floor(rng() * 16), 97, 99, 97);
  }
}

function paintSand(set: PixelSetter, rng: () => number): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const t = rng();
      set(x, y, 208 + t * 29, 187 + t * 27, 127 + t * 24);
    }
  }
  for (let i = 0; i < 20; i++) {
    const x = Math.floor(rng() * 16);
    const y = Math.floor(rng() * 16);
    set(x, y, 181 + rng() * 14, 158 + rng() * 12, 102 + rng() * 12);
  }
}

function paintLogSide(set: PixelSetter, rng: () => number): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const stripe = Math.sin(x * 1.7) * 7 + (x % 4 === 0 ? -8 : 0);
      const t = rng();
      set(x, y, 94 + stripe * 0.7 + t * 17, 65 + stripe * 0.45 + t * 12, 39 + t * 10);
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = 2 + Math.floor(rng() * 12);
    const y = 2 + Math.floor(rng() * 11);
    set(x, y, 70, 46, 29);
    set(x + 1, y, 80, 55, 34);
    set(x, y + 1, 59, 39, 25);
    set(x + 2, y + 1, 67, 45, 29);
  }
  for (let x = 0; x < TILE_SIZE; x += 5) {
    for (let y = 0; y < TILE_SIZE; y++) {
      if (rng() > 0.6) set(x, y, 76, 52, 32);
    }
  }
}

function paintLogTop(set: PixelSetter, rng: () => number): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const distance = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      let color = 174 + rng() * 18;
      if (Math.floor(distance) % 2 === 0) color -= 22;
      if (distance > 6.8) color = 89 + rng() * 20;
      set(x, y, color, color * 0.73, color * 0.45);
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = 3 + Math.floor(rng() * 10);
    const y = 3 + Math.floor(rng() * 10);
    set(x, y, 103, 70, 40);
  }
}

function paintLeaves(set: PixelSetter, rng: () => number): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      const gap = rng() < 0.16 || (edge && rng() < 0.36);
      if (gap) {
        set(x, y, 0, 0, 0, 0);
        continue;
      }
      const t = rng();
      const light = rng() > 0.78;
      set(x, y, light ? 116 : 61 + t * 27, light ? 171 : 116 + t * 35, light ? 69 : 43 + t * 22);
    }
  }
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(rng() * 16);
    const y = Math.floor(rng() * 16);
    set(x, y, 47 + rng() * 10, 96 + rng() * 12, 37 + rng() * 9);
  }
}

function paintWater(set: PixelSetter, rng: () => number): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const wave = Math.sin((x + y * 0.6) * 0.7) * 9 + Math.sin(y * 1.4) * 5;
      const t = rng() * 9;
      set(x, y, 45 + wave + t, 107 + wave + t, 153 + wave * 1.4 + t, 172);
    }
  }
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(rng() * 14);
    const y = Math.floor(rng() * 15);
    set(x, y, 117 + rng() * 28, 176 + rng() * 30, 197 + rng() * 22, 115);
    set(x + 1, y, 82, 150, 184, 90);
  }
}

function paintBedrock(set: PixelSetter, rng: () => number): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const t = rng();
      const blockY = Math.floor(y / 4);
      const blockX = Math.floor((x + (blockY % 2) * 2) / 5);
      const variation = ((blockX * 13 + blockY * 7) % 5) * 7;
      set(x, y, 51 + variation + t * 24, 52 + variation + t * 23, 55 + variation + t * 24);
    }
  }
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(rng() * 16);
    const y = Math.floor(rng() * 16);
    set(x, y, 30 + rng() * 14, 31 + rng() * 14, 35 + rng() * 14);
  }
}

function paintPlanks(set: PixelSetter, rng: () => number): void {
  const boards = [0, 4, 9, 13];
  for (let y = 0; y < TILE_SIZE; y++) {
    const board = boards.findIndex((start, index) => y >= start && (index === boards.length - 1 || y < boards[index + 1]!));
    for (let x = 0; x < TILE_SIZE; x++) {
      const t = rng();
      const grain = (x + y * 3 + board * 5) % 9 < 2 ? -11 : 0;
      set(x, y, 174 + grain + t * 22, 135 + grain + t * 18, 82 + grain + t * 14);
    }
  }
  for (const board of boards) {
    for (let x = 0; x < TILE_SIZE; x++) set(x, board, 111, 83, 52);
  }
  for (let y = 0; y < TILE_SIZE; y++) {
    if (y !== 4 && y !== 9 && y !== 13) set(7, y, 140, 106, 63);
  }
  set(3, 2, 105, 78, 48);
  set(12, 7, 105, 78, 48);
  set(5, 11, 105, 78, 48);
}

function paintCobblestone(set: PixelSetter, rng: () => number): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const cellX = Math.floor(x / 5);
      const cellY = Math.floor(y / 5);
      const mortar = x % 5 === 0 || y % 5 === 0 || (x + y + cellX * 3 + cellY) % 17 === 0;
      if (mortar) {
        set(x, y, 72 + rng() * 9, 73 + rng() * 9, 71 + rng() * 8);
      } else {
        const variation = ((cellX * 7 + cellY * 11) % 4) * 8;
        const t = rng() * 21;
        set(x, y, 118 + variation + t, 119 + variation + t, 116 + variation + t);
      }
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(rng() * 16);
    const y = Math.floor(rng() * 16);
    set(x, y, 145, 146, 142);
  }
}

function paintGlass(set: PixelSetter, rng: () => number): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      set(x, y, 183, 222, 228, 24 + rng() * 12);
    }
  }
  for (let i = 0; i < TILE_SIZE; i++) {
    set(i, 0, 208, 240, 243, 155);
    set(i, 15, 133, 180, 189, 135);
    set(0, i, 208, 240, 243, 155);
    set(15, i, 133, 180, 189, 135);
  }
  for (let i = 3; i < 8; i++) set(i, 12 - i, 247, 255, 255, 95);
  set(4, 12, 236, 250, 251, 115);
  set(5, 12, 236, 250, 251, 85);
  set(11, 4, 236, 250, 251, 65);
}

function paintCoalOre(set: PixelSetter, rng: () => number): void {
  paintStone(set, rng);
  const spots = [
    [3, 3],
    [9, 4],
    [5, 9],
    [11, 10],
    [2, 12],
    [13, 6],
  ];
  for (const [sx, sy] of spots) {
    const radius = 1 + Math.floor(rng() * 2);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius + 1) continue;
        if (rng() < 0.16) continue;
        set(sx! + dx, sy! + dy, 42 + rng() * 15, 44 + rng() * 14, 43 + rng() * 14);
      }
    }
    set(sx!, sy! - 1, 88, 92, 91);
  }
}

function paintSnow(set: PixelSetter, rng: () => number): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const t = rng();
      set(x, y, 226 + t * 22, 235 + t * 18, 236 + t * 16);
    }
  }
  for (let i = 0; i < 13; i++) {
    const x = Math.floor(rng() * 16);
    const y = Math.floor(rng() * 16);
    set(x, y, 205 + rng() * 15, 219 + rng() * 12, 224 + rng() * 10);
  }
  for (let i = 0; i < 4; i++) {
    set(Math.floor(rng() * 16), Math.floor(rng() * 16), 255, 255, 255);
  }
}

function paintCraftingTableTop(set: PixelSetter, rng: () => number): void {
  paintPlanks(set, rng);
  for (let i = 0; i < TILE_SIZE; i++) {
    set(i, 0, 111, 83, 52);
    set(i, 1, 145, 108, 63);
    set(i, 15, 92, 66, 40);
    set(0, i, 111, 83, 52);
    set(15, i, 92, 66, 40);
  }
  for (let i = 4; i < 12; i++) {
    set(i, 5, 107, 78, 48);
    set(i, 10, 107, 78, 48);
    set(5, i, 107, 78, 48);
    set(10, i, 107, 78, 48);
  }
  set(3, 3, 224, 190, 120);
  set(12, 12, 224, 190, 120);
}

function paintCraftingTableSide(set: PixelSetter, rng: () => number): void {
  paintPlanks(set, rng);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      set(x, y, 126 + rng() * 17, 91 + rng() * 12, 54 + rng() * 9);
    }
  }
  for (let x = 2; x < 14; x++) {
    set(x, 4, 92, 66, 40);
    set(x, 9, 92, 66, 40);
  }
  for (let y = 4; y < 16; y++) {
    set(3, y, 92, 66, 40);
    set(12, y, 92, 66, 40);
  }
  for (let i = 0; i < 5; i++) {
    set(5 + Math.floor(rng() * 6), 6 + Math.floor(rng() * 8), 105, 74, 44);
  }
}

function paintCraftingTableFront(set: PixelSetter, rng: () => number): void {
  paintPlanks(set, rng);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      set(x, y, 122 + rng() * 20, 88 + rng() * 14, 52 + rng() * 10);
    }
  }
  for (let x = 0; x < TILE_SIZE; x++) set(x, 5, 82, 58, 36);
  for (let y = 5; y < 16; y++) {
    set(5, y, 93, 67, 40);
    set(10, y, 93, 67, 40);
  }
  for (let x = 6; x < 10; x++) {
    set(x, 8, 55, 39, 25);
    set(x, 9, 72, 50, 30);
  }
  for (const [x, y] of [
    [2, 8],
    [13, 8],
    [2, 13],
    [13, 13],
  ] as const) {
    set(x, y, 74, 74, 72);
    set(x + 1, y + 1, 42, 43, 43);
  }
}

function paintFurnaceSide(set: PixelSetter, rng: () => number): void {
  paintCobblestone(set, rng);
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(rng() * 16);
    const y = Math.floor(rng() * 16);
    set(x, y, 83, 84, 81);
  }
}

function paintFurnaceTop(set: PixelSetter, rng: () => number): void {
  paintCobblestone(set, rng);
  for (let y = 4; y < 12; y++) {
    for (let x = 4; x < 12; x++) {
      const t = rng();
      set(x, y, 66 + t * 15, 67 + t * 15, 65 + t * 14);
    }
  }
  for (let i = 0; i < 3; i++) {
    set(6 + Math.floor(rng() * 4), 6 + Math.floor(rng() * 4), 35, 36, 35);
  }
}

function paintFurnaceFront(set: PixelSetter, rng: () => number): void {
  paintCobblestone(set, rng);
  for (let y = 5; y < 15; y++) {
    for (let x = 3; x < 13; x++) {
      const edge = x === 3 || x === 12 || y === 5 || y === 14;
      if (edge) {
        set(x, y, 57, 58, 56);
      } else {
        const t = rng();
        set(x, y, 28 + t * 12, 29 + t * 11, 27 + t * 10);
      }
    }
  }
  for (let x = 4; x < 12; x++) {
    set(x, 6, 85, 85, 82);
  }
  for (let y = 9; y < 13; y++) {
    for (let x = 5; x < 11; x++) {
      if (rng() > 0.25) set(x, y, 226 + rng() * 20, 123 + rng() * 40, 41 + rng() * 20);
    }
  }
  for (let y = 6; y < 15; y++) {
    set(7, y, 81, 82, 78);
  }
}

function paintIronOre(set: PixelSetter, rng: () => number): void {
  paintStone(set, rng);
  const spots = [
    [3, 3],
    [10, 4],
    [5, 8],
    [12, 10],
    [3, 12],
    [8, 13],
  ];
  for (const [sx, sy] of spots) {
    const radius = 1 + Math.floor(rng() * 2);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius + 1) continue;
        if (rng() < 0.18) continue;
        set(sx! + dx, sy! + dy, 178 + rng() * 31, 132 + rng() * 31, 104 + rng() * 26);
      }
    }
    set(sx!, sy! - 1, 228, 202, 164);
  }
}

function paintTorch(set: PixelSetter, rng: () => number): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) set(x, y, 0, 0, 0, 0);
  }
  for (let y = 8; y < 16; y++) {
    for (let x = 7; x <= 9; x++) {
      set(x, y, 126 + rng() * 24, 90 + rng() * 16, 51 + rng() * 10);
    }
  }
  set(7, 8, 102, 71, 41);
  set(9, 8, 86, 58, 33);
  set(7, 7, 255, 241, 151);
  set(8, 7, 255, 211, 92);
  set(8, 6, 255, 166, 47);
  set(7, 6, 237, 118, 28);
  set(9, 7, 236, 139, 43);
  set(6, 7, 227, 106, 26);
  set(8, 5, 255, 229, 132);
  set(9, 8, 207, 88, 24);
  set(8, 8, 190, 74, 21);
}


function hashTileName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}
