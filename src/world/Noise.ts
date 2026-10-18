import { createNoise2D, createNoise3D } from 'simplex-noise';
import { mulberry32 } from '../utils/math';

export type Noise2D = (x: number, y: number) => number;
export type Noise3D = (x: number, y: number, z: number) => number;

export class TerrainNoise {
  readonly continent: Noise2D;
  readonly hills: Noise2D;
  readonly mountains: Noise2D;
  readonly rivers: Noise2D;
  readonly forest: Noise2D;
  readonly detail: Noise2D;
  readonly caves: Noise3D;
  readonly cavesSecondary: Noise3D;

  constructor(seed: number) {
    this.continent = createNoise2D(mulberry32(seed ^ 0x1a2b3c4d));
    this.hills = createNoise2D(mulberry32(seed ^ 0x7f4a7c15));
    this.mountains = createNoise2D(mulberry32(seed ^ 0x3c6ef372));
    this.rivers = createNoise2D(mulberry32(seed ^ 0x94d049bb));
    this.forest = createNoise2D(mulberry32(seed ^ 0x13371337));
    this.detail = createNoise2D(mulberry32(seed ^ 0xdeadbeef));
    this.caves = createNoise3D(mulberry32(seed ^ 0x51ed270b));
    this.cavesSecondary = createNoise3D(mulberry32(seed ^ 0xa3f1c0de));
  }

  fbm2(noise: Noise2D, x: number, z: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amplitude = 1;
    let frequency = 1;
    let sum = 0;
    let normalization = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise(x * frequency, z * frequency) * amplitude;
      normalization += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return normalization > 0 ? sum / normalization : 0;
  }
}
