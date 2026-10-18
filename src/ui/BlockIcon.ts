import type { TextureAtlas } from '../rendering/TextureAtlas';
import { getBlockDefinition, type BlockId } from '../world/BlockRegistry';

/** Draws a crisp isometric cube icon from the generated texture atlas. */
export function createBlockIcon(atlas: TextureAtlas, block: BlockId, size = 44): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const scale = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * scale);
  canvas.height = Math.round(size * scale);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.className = 'block-icon';
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.scale((size / 40) * scale, (size / 40) * scale);
  context.imageSmoothingEnabled = false;

  const definition = getBlockDefinition(block);
  const topTile = atlas.getTileCanvas(definition.faces[2]);
  const leftTile = atlas.getTileCanvas(definition.faces[1]);
  const rightTile = atlas.getTileCanvas(definition.faces[0]);

  context.save();
  context.transform(1, 0.5, 1, -0.5, 4, 12);
  context.drawImage(topTile, 0, 0, 16, 16, 0, 0, 16, 16);
  context.restore();

  context.save();
  context.transform(1, 0.5, 0, 1, 4, 12);
  context.drawImage(leftTile, 0, 0, 16, 16, 0, 0, 16, 16);
  context.restore();
  context.fillStyle = 'rgba(10, 17, 19, 0.24)';
  context.beginPath();
  context.moveTo(4, 12);
  context.lineTo(20, 20);
  context.lineTo(20, 36);
  context.lineTo(4, 28);
  context.closePath();
  context.fill();

  context.save();
  context.transform(1, -0.5, 0, 1, 20, 20);
  context.drawImage(rightTile, 0, 0, 16, 16, 0, 0, 16, 16);
  context.restore();
  context.fillStyle = 'rgba(255, 255, 255, 0.08)';
  context.beginPath();
  context.moveTo(20, 20);
  context.lineTo(36, 12);
  context.lineTo(36, 28);
  context.lineTo(20, 36);
  context.closePath();
  context.fill();

  context.strokeStyle = 'rgba(8, 14, 16, 0.55)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(20, 4);
  context.lineTo(36, 12);
  context.lineTo(36, 28);
  context.lineTo(20, 36);
  context.lineTo(4, 28);
  context.lineTo(4, 12);
  context.closePath();
  context.moveTo(20, 4);
  context.lineTo(20, 20);
  context.lineTo(4, 12);
  context.moveTo(20, 20);
  context.lineTo(36, 12);
  context.moveTo(20, 20);
  context.lineTo(20, 36);
  context.stroke();

  return canvas;
}
