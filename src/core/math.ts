export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const floorDiv = (value: number, divisor: number) => Math.floor(value / divisor);
export const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hash3(seed: number, x: number, y: number, z = 0): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise2(seed: number, x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const tx = smooth(x - ix), tz = smooth(z - iz);
  return lerp(
    lerp(hash3(seed, ix, iz) * 2 - 1, hash3(seed, ix + 1, iz) * 2 - 1, tx),
    lerp(hash3(seed, ix, iz + 1) * 2 - 1, hash3(seed, ix + 1, iz + 1) * 2 - 1, tx), tz,
  );
}

export function noise3(seed: number, x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const tx = smooth(x - ix), ty = smooth(y - iy), tz = smooth(z - iz);
  const sample = (dx: number, dy: number, dz: number) => hash3(seed, ix + dx, iy + dy, iz + dz) * 2 - 1;
  return lerp(
    lerp(lerp(sample(0,0,0), sample(1,0,0), tx), lerp(sample(0,1,0), sample(1,1,0), tx), ty),
    lerp(lerp(sample(0,0,1), sample(1,0,1), tx), lerp(sample(0,1,1), sample(1,1,1), tx), ty), tz,
  );
}

export function fbm(seed: number, x: number, z: number, octaves = 4): number {
  let result = 0, amplitude = 1, frequency = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    result += noise2(seed + i * 7919, x * frequency, z * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return result / total;
}
