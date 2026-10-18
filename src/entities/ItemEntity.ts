import type { ItemStack } from '../items/ItemStack';

export interface ItemEntity {
  id: string;
  stack: ItemStack;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ageSeconds: number;
  pickupDelaySeconds: number;
}

export interface ItemEntitySave {
  id: string;
  itemId: string;
  count: number;
  durability?: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ageSeconds: number;
  pickupDelaySeconds: number;
}

export const ITEM_PICKUP_DELAY_SECONDS = 0.5;
export const ITEM_ATTRACT_RADIUS = 1.6;
export const ITEM_PICKUP_RADIUS = 0.65;
