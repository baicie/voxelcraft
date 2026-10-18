import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/persistence/SettingsStore';
import { MAX_RENDER_DISTANCE, MIN_RENDER_DISTANCE } from '../../src/world/constants';

describe('settings normalization', () => {
  it('returns defaults for empty input', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps numeric values into supported ranges', () => {
    const settings = normalizeSettings({
      renderDistance: 99,
      sensitivity: -1,
      fov: 200,
      volume: 2,
      showDebug: false,
    });
    expect(settings.renderDistance).toBe(MAX_RENDER_DISTANCE);
    expect(settings.sensitivity).toBe(0.3);
    expect(settings.fov).toBe(100);
    expect(settings.volume).toBe(1);
    expect(settings.showDebug).toBe(false);
  });

  it('rounds render distance to an integer floor', () => {
    expect(normalizeSettings({ renderDistance: 3.8 }).renderDistance).toBe(4);
    expect(normalizeSettings({ renderDistance: 1 }).renderDistance).toBe(MIN_RENDER_DISTANCE);
  });
});
