import * as THREE from 'three';
import type { Chunk } from '../world/Chunk';
import { CHUNK_SIZE, chunkKey, worldToChunk } from '../world/constants';
import type { ChunkMeshData, MeshLayerData } from './ChunkMesher';
import type { ChunkMaterialSet } from './Materials';

interface ChunkVisual {
  meshes: THREE.Mesh[];
  faces: number;
}

export class ChunkRenderer {
  private readonly scene: THREE.Scene;
  private readonly materials: ChunkMaterialSet;
  private readonly visuals = new Map<string, ChunkVisual>();

  constructor(scene: THREE.Scene, materials: ChunkMaterialSet) {
    this.scene = scene;
    this.materials = materials;
  }

  setChunkMesh(chunk: Chunk, data: ChunkMeshData): void {
    this.removeChunk(chunk.cx, chunk.cz);
    const meshes: THREE.Mesh[] = [];
    const originX = chunk.cx * CHUNK_SIZE;
    const originZ = chunk.cz * CHUNK_SIZE;
    const layers: Array<[MeshLayerData, THREE.Material, string, number]> = [
      [data.opaque, this.materials.opaque, 'opaque', 0],
      [data.cutout, this.materials.cutout, 'cutout', 1],
      [data.transparent, this.materials.transparent, 'transparent', 3],
    ];

    for (const [layer, material, name, renderOrder] of layers) {
      if (layer.faceCount === 0) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(layer.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(layer.normals, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(layer.uvs, 2));
      geometry.setAttribute('color', new THREE.BufferAttribute(layer.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(layer.indices, 1));
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `chunk-${chunk.cx},${chunk.cz}-${name}`;
      mesh.position.set(originX, 0, originZ);
      mesh.renderOrder = renderOrder;
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      meshes.push(mesh);
    }

    this.visuals.set(chunkKey(chunk.cx, chunk.cz), {
      meshes,
      faces: data.totalFaces,
    });
  }

  removeChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const visual = this.visuals.get(key);
    if (!visual) return;
    for (const mesh of visual.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.visuals.delete(key);
  }

  countMeshedWithin(centerX: number, centerZ: number, radius: number): number {
    const pcx = worldToChunk(centerX);
    const pcz = worldToChunk(centerZ);
    let count = 0;
    for (const chunk of this.visuals.keys()) {
      const [cxText, czText] = chunk.split(',');
      const cx = Number(cxText);
      const cz = Number(czText);
      if (Math.abs(cx - pcx) <= radius && Math.abs(cz - pcz) <= radius) count++;
    }
    return count;
  }

  get meshCount(): number {
    return this.visuals.size;
  }

  get objectCount(): number {
    let count = 0;
    for (const visual of this.visuals.values()) count += visual.meshes.length;
    return count;
  }

  get totalFaces(): number {
    let count = 0;
    for (const visual of this.visuals.values()) count += visual.faces;
    return count;
  }

  dispose(): void {
    for (const visual of this.visuals.values()) {
      for (const mesh of visual.meshes) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    this.visuals.clear();
  }
}
