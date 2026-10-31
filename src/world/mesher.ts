import { CHUNK_SIZE, WORLD_HEIGHT, type MeshArrays } from '../core/types';
import { B, blockAt } from './blocks';
import { voxelIndex } from './coordinates';

const FACES = [
  { dir: [1,0,0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], shade: 0.83, texture: 'side' },
  { dir: [-1,0,0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], shade: 0.76, texture: 'side' },
  { dir: [0,1,0], corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], shade: 1, texture: 'top' },
  { dir: [0,-1,0], corners: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]], shade: 0.56, texture: 'bottom' },
  { dir: [0,0,1], corners: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]], shade: 0.9, texture: 'side' },
  { dir: [0,0,-1], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], shade: 0.7, texture: 'side' },
] as const;
const UVS = [[0,0],[0,1],[1,1],[1,0]];
class Geometry {
  positions: number[] = []; normals: number[] = []; uvs: number[] = []; colors: number[] = []; indices: number[] = [];
  quad(points: number[][], normal: number[], tile: number, shade: number, ao: number[] = [1,1,1,1], scale = 1): void {
    const start = this.positions.length / 3;
    const col = tile % 8, row = Math.floor(tile / 8), pad = 0.001;
    for (let i = 0; i < 4; i++) {
      this.positions.push(...points[i]); this.normals.push(...normal);
      this.uvs.push((col + UVS[i][0]) / 8 + (UVS[i][0] ? -pad : pad), 1 - (row + 1 - UVS[i][1]) / 8 + (UVS[i][1] ? pad : -pad));
      const value = shade * ao[i] * scale; this.colors.push(value, value, value);
    }
    this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  finish(): MeshArrays {
    return { positions: new Float32Array(this.positions), normals: new Float32Array(this.normals), uvs: new Float32Array(this.uvs), colors: new Float32Array(this.colors), indices: new Uint32Array(this.indices) };
  }
}

export function tileFor(id: number, face: 'side' | 'top' | 'bottom'): number {
  const d = blockAt(id);
  const name = face === 'top' ? d.top ?? d.texture : face === 'bottom' ? d.bottom ?? d.texture : d.texture;
  return TILE_NAMES.indexOf(name);
}
export const TILE_NAMES = ['air','grass_side','grass_top','dirt','stone','sand','sandstone','snow_side','snow_top','log_side','log_top','leaves','planks','birch_side','birch_leaves','cactus','gravel','coal_ore','iron_ore','gold_ore','diamond_ore','cobble','bedrock','water','glass','brick','crafting_side','crafting_top','furnace','torch','tall_grass','flower_red','flower_yellow','farmland','wheat','clay','moss','stone_brick','spruce_side','spruce_leaves','ice','glowstone','obsidian','reeds'];

export function buildMesh(voxels: Uint8Array, neighbors: Record<string, Uint8Array>): { opaque: MeshArrays; water: MeshArrays } {
  const opaque = new Geometry(), water = new Geometry();
  const get = (x: number, y: number, z: number): number => {
    if (y < 0 || y >= WORLD_HEIGHT) return B.air;
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) return voxels[voxelIndex(x,y,z)];
    let key = '';
    if (x < 0) key = 'west'; else if (x >= CHUNK_SIZE) key = 'east'; else if (z < 0) key = 'north'; else if (z >= CHUNK_SIZE) key = 'south';
    const chunk = neighbors[key];
    if (!chunk) return B.air;
    return chunk[voxelIndex((x + CHUNK_SIZE) % CHUNK_SIZE,y,(z + CHUNK_SIZE) % CHUNK_SIZE)];
  };
  for (let y = 0; y < WORLD_HEIGHT; y++) for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
    const id = voxels[voxelIndex(x,y,z)];
    if (id === B.air) continue;
    const def = blockAt(id);
    if (def.cross) {
      const tile = tileFor(id, 'side');
      opaque.quad([[x+.08,y,z+.08],[x+.08,y+1,z+.08],[x+.92,y+1,z+.92],[x+.92,y,z+.92]],[0,0,1],tile,1);
      opaque.quad([[x+.92,y,z+.92],[x+.92,y+1,z+.92],[x+.08,y+1,z+.08],[x+.08,y,z+.08]],[0,0,-1],tile,1);
      opaque.quad([[x+.92,y,z+.08],[x+.92,y+1,z+.08],[x+.08,y+1,z+.92],[x+.08,y,z+.92]],[1,0,0],tile,1);
      opaque.quad([[x+.08,y,z+.92],[x+.08,y+1,z+.92],[x+.92,y+1,z+.08],[x+.92,y,z+.08]],[-1,0,0],tile,1);
      continue;
    }
    for (const face of FACES) {
      const [dx,dy,dz] = face.dir;
      const other = get(x+dx,y+dy,z+dz);
      const otherDef = blockAt(other);
      const visible = id === B.water ? other === B.air : !otherDef.opaque && other !== id;
      if (!visible) continue;
      const geometry = def.liquid || id === B.glass || id === B.ice ? water : opaque;
      const height = def.liquid && get(x,y+1,z) === B.air ? 0.86 : 1;
      const points = face.corners.map(([px,py,pz]) => [x+px,y+py*height,z+pz]);
      const ao = face.corners.map(([px,py,pz]) => {
        if (def.liquid) return 1;
        const sx = px === 0 ? -1 : 1, sy = py === 0 ? -1 : 1, sz = pz === 0 ? -1 : 1;
        let count = 0;
        if (dx !== 0) {
          if (blockAt(get(x+dx,y+sy,z)).opaque) count++;
          if (blockAt(get(x+dx,y,z+sz)).opaque) count++;
          if (blockAt(get(x+dx,y+sy,z+sz)).opaque) count++;
        } else if (dy !== 0) {
          if (blockAt(get(x+sx,y+dy,z)).opaque) count++;
          if (blockAt(get(x,y+dy,z+sz)).opaque) count++;
          if (blockAt(get(x+sx,y+dy,z+sz)).opaque) count++;
        } else {
          if (blockAt(get(x+sx,y,z+dz)).opaque) count++;
          if (blockAt(get(x,y+sy,z+dz)).opaque) count++;
          if (blockAt(get(x+sx,y+sy,z+dz)).opaque) count++;
        }
        return count === 3 ? 0.52 : 1 - count * 0.13;
      });
      geometry.quad(points, [...face.dir], tileFor(id,face.texture), face.shade, ao, def.liquid ? 0.95 : 1);
    }
  }
  return { opaque: opaque.finish(), water: water.finish() };
}
