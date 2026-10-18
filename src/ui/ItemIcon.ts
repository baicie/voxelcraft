import type { TextureAtlas } from '../rendering/TextureAtlas';
import { getItemDefinition, type ItemId } from '../items/ItemRegistry';
import { createBlockIcon } from './BlockIcon';

export function createItemIcon(atlas: TextureAtlas, itemId: ItemId, size = 40): HTMLCanvasElement {
  const definition = getItemDefinition(itemId);
  if (!definition) {
    const fallback = document.createElement('canvas');
    fallback.width = size;
    fallback.height = size;
    fallback.className = 'item-icon';
    return fallback;
  }
  if (definition.placeBlockId !== undefined) {
    const canvas = createBlockIcon(atlas, definition.placeBlockId, size);
    canvas.classList.add('item-icon');
    return canvas;
  }

  const scale = Math.max(1, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size * scale);
  canvas.height = Math.round(size * scale);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.className = 'item-icon';
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.scale((size / 16) * scale, (size / 16) * scale);
  context.imageSmoothingEnabled = false;

  switch (definition.iconKey) {
    case 'item:stick':
      drawStick(context);
      break;
    case 'item:coal':
      drawCoal(context);
      break;
    case 'item:raw_iron':
      drawRawIron(context);
      break;
    case 'item:iron_ingot':
      drawIngot(context);
      break;
    case 'item:apple':
      drawApple(context);
      break;
    case 'tool:wooden_pickaxe':
      drawPickaxe(context, '#b08851', '#7b5a2f');
      break;
    case 'tool:stone_pickaxe':
      drawPickaxe(context, '#969894', '#5e615e');
      break;
    case 'tool:iron_pickaxe':
      drawPickaxe(context, '#e0e2e6', '#9399a3');
      break;
    default:
      drawStick(context);
  }
  return canvas;
}

function drawStick(context: CanvasRenderingContext2D): void {
  context.fillStyle = '#8a6337';
  for (let i = 0; i < 11; i++) context.fillRect(4 + i, 14 - i, 2, 2);
  context.fillStyle = '#b88b50';
  for (let i = 1; i < 11; i++) context.fillRect(4 + i, 13 - i, 1, 1);
}

function drawCoal(context: CanvasRenderingContext2D): void {
  context.fillStyle = '#2a2d2f';
  context.fillRect(4, 6, 8, 7);
  context.fillRect(5, 4, 5, 2);
  context.fillRect(3, 8, 2, 4);
  context.fillStyle = '#4b5053';
  context.fillRect(5, 5, 2, 1);
  context.fillRect(7, 8, 2, 2);
  context.fillStyle = '#1a1c1d';
  context.fillRect(4, 11, 7, 1);
}

function drawRawIron(context: CanvasRenderingContext2D): void {
  context.fillStyle = '#a9795a';
  context.fillRect(4, 8, 4, 5);
  context.fillRect(8, 6, 4, 4);
  context.fillRect(9, 10, 3, 3);
  context.fillStyle = '#d0a482';
  context.fillRect(5, 8, 2, 2);
  context.fillRect(9, 7, 2, 2);
  context.fillStyle = '#7f553e';
  context.fillRect(6, 12, 5, 1);
}

function drawIngot(context: CanvasRenderingContext2D): void {
  context.fillStyle = '#bfc4ca';
  context.fillRect(4, 7, 9, 5);
  context.fillRect(5, 5, 7, 2);
  context.fillStyle = '#eef0f2';
  context.fillRect(6, 6, 5, 1);
  context.fillRect(5, 8, 2, 1);
  context.fillStyle = '#8e949b';
  context.fillRect(4, 11, 9, 1);
}

function drawApple(context: CanvasRenderingContext2D): void {
  context.fillStyle = '#c94337';
  context.fillRect(5, 5, 7, 7);
  context.fillRect(4, 7, 9, 4);
  context.fillStyle = '#e2644f';
  context.fillRect(6, 6, 2, 2);
  context.fillStyle = '#4f8436';
  context.fillRect(8, 2, 4, 2);
  context.fillRect(7, 3, 2, 1);
  context.fillStyle = '#6e3c27';
  context.fillRect(8, 4, 1, 2);
}

function drawPickaxe(context: CanvasRenderingContext2D, head: string, shade: string): void {
  context.fillStyle = '#8b6538';
  for (let i = 0; i < 9; i++) context.fillRect(3 + i, 14 - i, 2, 2);
  context.fillStyle = shade;
  context.fillRect(8, 4, 7, 2);
  context.fillRect(6, 5, 3, 2);
  context.fillRect(13, 2, 2, 4);
  context.fillStyle = head;
  context.fillRect(8, 3, 6, 1);
  context.fillRect(6, 4, 3, 1);
  context.fillRect(12, 2, 2, 2);
  context.fillRect(4, 6, 3, 1);
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.fillRect(9, 3, 3, 1);
}
