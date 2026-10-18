import type { ItemStack } from '../items/ItemStack';
import type { ContainerKind, ContainerView } from '../inventory/ContainerSession';

export type GameMode = 'creative' | 'survival';

export interface GameStats {
  fps: number;
  frameMs: number;
  x: number;
  y: number;
  z: number;
  chunkX: number;
  chunkZ: number;
  loadedChunks: number;
  pendingChunks: number;
  dirtyMeshes: number;
  meshedChunks: number;
  drawCalls: number;
  triangles: number;
  faces: number;
  meshBuildMs: number;
  timeOfDay: number;
  flying: boolean;
  inWater: boolean;
  selectedSlot: number;
  renderDistance: number;
  target: string;
  mode: GameMode;
  selectedItem: string;
  selectedCount: number;
  itemEntities: number;
  simulationDroppedMs: number;
}

export interface HotbarState {
  mode: GameMode;
  slots: Array<ItemStack | null>;
  selectedIndex: number;
}

export interface GameCallbacks {
  onStats: (stats: GameStats) => void;
  onHotbar: (state: HotbarState) => void;
  onPointerLockChanged: (locked: boolean) => void;
  onMiningProgress: (progress: number) => void;
  onMessage: (message: string) => void;
  onSaved: () => void;
  onContainerRequested: (kind: ContainerKind, furnacePos?: { x: number; y: number; z: number }) => void;
  onContainerChanged: (view: ContainerView) => void;
  onContainerClosed: () => void;
}
