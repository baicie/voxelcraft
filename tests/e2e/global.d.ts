export {};
type TestStack = { id: string; count: number; durability?: number } | null;
type TestSession = {
  stats: () => { fps: number; loaded: number; visible: number; triangles: number; drawCalls: number; generationMs?: number; meshMs?: number; mobs: number; drops: number } | undefined;
  inventory: () => TestStack[] | undefined;
  position: () => { x: number; y: number; z: number } | null;
  blockAt: (x: number, y: number, z: number) => number | null;
  seed: () => string | undefined;
  [key: string]: unknown;
};
declare global {
  interface Window {
    __VOXELCRAFT__?: TestSession;
  }
}
