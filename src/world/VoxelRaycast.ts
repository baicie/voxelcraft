import { BlockId } from './BlockRegistry';

export interface RaycastWorld {
  getBlock(x: number, y: number, z: number): BlockId;
}

export interface RaycastHit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  block: BlockId;
  distance: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Amanatides & Woo voxel traversal. Returns the first targetable block. */
export function raycastVoxels(
  world: RaycastWorld,
  origin: Vec3Like,
  direction: Vec3Like,
  maxDistance: number,
  isTargetable: (block: BlockId) => boolean = (block) => block !== BlockId.Air && block !== BlockId.Water,
): RaycastHit | null {
  const dirLength = Math.hypot(direction.x, direction.y, direction.z);
  if (dirLength === 0 || maxDistance <= 0) return null;
  const dx = direction.x / dirLength;
  const dy = direction.y / dirLength;
  const dz = direction.z / dirLength;

  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const stepZ = Math.sign(dz);

  const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dx);
  const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dy);
  const tDeltaZ = stepZ === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dz);

  let tMaxX =
    stepX > 0
      ? (x + 1 - origin.x) / dx
      : stepX < 0
        ? (origin.x - x) / -dx
        : Number.POSITIVE_INFINITY;
  let tMaxY =
    stepY > 0
      ? (y + 1 - origin.y) / dy
      : stepY < 0
        ? (origin.y - y) / -dy
        : Number.POSITIVE_INFINITY;
  let tMaxZ =
    stepZ > 0
      ? (z + 1 - origin.z) / dz
      : stepZ < 0
        ? (origin.z - z) / -dz
        : Number.POSITIVE_INFINITY;

  let normalX = 0;
  let normalY = 0;
  let normalZ = 0;
  let traveled = 0;

  while (traveled <= maxDistance) {
    const block = world.getBlock(x, y, z);
    if (isTargetable(block)) {
      return {
        x,
        y,
        z,
        nx: normalX,
        ny: normalY,
        nz: normalZ,
        block,
        distance: traveled,
      };
    }

    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      traveled = tMaxX;
      if (traveled > maxDistance) break;
      x += stepX;
      tMaxX += tDeltaX;
      normalX = -stepX;
      normalY = 0;
      normalZ = 0;
    } else if (tMaxY <= tMaxZ) {
      traveled = tMaxY;
      if (traveled > maxDistance) break;
      y += stepY;
      tMaxY += tDeltaY;
      normalX = 0;
      normalY = -stepY;
      normalZ = 0;
    } else {
      traveled = tMaxZ;
      if (traveled > maxDistance) break;
      z += stepZ;
      tMaxZ += tDeltaZ;
      normalX = 0;
      normalY = 0;
      normalZ = -stepZ;
    }
  }

  return null;
}
