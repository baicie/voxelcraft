import { clamp } from '../utils/math';
import { DEFAULT_RENDER_DISTANCE, MAX_RENDER_DISTANCE, MIN_RENDER_DISTANCE } from '../world/constants';

export interface GameSettings {
  renderDistance: number;
  sensitivity: number;
  fov: number;
  volume: number;
  showDebug: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  renderDistance: DEFAULT_RENDER_DISTANCE,
  sensitivity: 1,
  fov: 75,
  volume: 0.65,
  showDebug: true,
};

const STORAGE_KEY = 'voxelcraft.settings.v1';

export class SettingsStore {
  load(): GameSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return normalizeSettings(parsed);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  save(settings: GameSettings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn('Unable to persist settings', error);
    }
  }
}

export function normalizeSettings(input: Partial<GameSettings>): GameSettings {
  return {
    renderDistance: clamp(
      Math.round(typeof input.renderDistance === 'number' ? input.renderDistance : DEFAULT_SETTINGS.renderDistance),
      MIN_RENDER_DISTANCE,
      MAX_RENDER_DISTANCE,
    ),
    sensitivity: clamp(
      typeof input.sensitivity === 'number' ? input.sensitivity : DEFAULT_SETTINGS.sensitivity,
      0.3,
      2.5,
    ),
    fov: clamp(typeof input.fov === 'number' ? input.fov : DEFAULT_SETTINGS.fov, 60, 100),
    volume: clamp(typeof input.volume === 'number' ? input.volume : DEFAULT_SETTINGS.volume, 0, 1),
    showDebug: typeof input.showDebug === 'boolean' ? input.showDebug : DEFAULT_SETTINGS.showDebug,
  };
}
