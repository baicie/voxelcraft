import * as THREE from 'three';
import type { MeshArrays } from '../core/types';
import { CHUNK_SIZE } from '../core/types';
import { blockAt } from '../world/blocks';
import { chunkKey } from '../world/coordinates';
import type { ChunkRecord, VoxelWorld } from '../world/world';
import { WorkerClient } from '../workers/workerClient';

type View = { opaque?: THREE.Mesh; water?: THREE.Mesh; revision: number; lights: { x: number; y: number; z: number }[] };
export type RenderStats = {
  loaded: number; visible: number; generating: number; meshing: number; queued: number;
  triangles: number; drawCalls: number; genMs: number; meshMs: number;
};

export class ChunkRenderer {
  readonly group = new THREE.Group();
  private views = new Map<string, View>();
  private worker = new WorkerClient();
  private opaqueMaterial: THREE.MeshLambertMaterial;
  private waterMaterial: THREE.MeshLambertMaterial;
  private generating = 0;
  private meshing = 0;
  private taskTimes: number[] = [];
  private meshTimes: number[] = [];
  private lastSchedule = 0;
  private lightRefresh = 0;
  private disposed = false;
  private lightPool: THREE.PointLight[] = [];
  readonly target = new Set<string>();
  onStats: (stats: ChunkRenderer['stats']) => void = () => {};
  onInitialReady: () => void = () => {};
  private initialNotified = false;
  private center = { cx: 0, cz: 0 };

  constructor(
    private scene: THREE.Scene,
    private world: VoxelWorld,
    atlas: THREE.Texture,
    private renderDistance = 4,
  ) {
    scene.add(this.group);
    this.group.name = 'terrain';
    this.opaqueMaterial = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.35 });
    this.waterMaterial = new THREE.MeshLambertMaterial({
      map: atlas, vertexColors: true, transparent: true, opacity: 0.72,
      depthWrite: false, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 6; i++) {
      const light = new THREE.PointLight(0xffbf72, 0, 10, 1.9);
      this.lightPool.push(light);
      scene.add(light);
    }
  }

  private key(cx: number, cz: number) { return chunkKey(cx, cz); }

  private geometry(data: MeshArrays): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    g.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    g.setIndex(new THREE.BufferAttribute(data.indices, 1));
    g.computeBoundingSphere();
    return g;
  }

  private disposeView(view: View) {
    for (const mesh of [view.opaque, view.water]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
  }

  update(px: number, pz: number, now: number): void {
    if (this.disposed) return;
    const pcx = Math.floor(px / CHUNK_SIZE), pcz = Math.floor(pz / CHUNK_SIZE);
    this.center = { cx: pcx, cz: pcz };
    const loadRadius = this.renderDistance + 1;
    if (now - this.lastSchedule > 180) {
      this.lastSchedule = now;
      this.schedule(pcx, pcz, loadRadius);
      this.unloadDistant(pcx, pcz, loadRadius + 1);
    }
    if (now - this.lightRefresh > 700) {
      this.lightRefresh = now;
      this.refreshLights(px, pz);
    }
    this.updateStats();
  }

  private schedule(pcx: number, pcz: number, radius: number) {
    this.target.clear();
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      this.target.add(this.key(pcx + dx, pcz + dz));
    }
    const candidates: { cx: number; cz: number; d: number; record?: ChunkRecord }[] = [];
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      const cx = pcx + dx, cz = pcz + dz;
      candidates.push({ cx, cz, d: dx * dx + dz * dz, record: this.world.chunks.get(this.key(cx, cz)) });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const candidate of candidates) {
      if (this.generating >= 3) break;
      if (candidate.record || candidate.d > radius * radius) continue;
      const { cx, cz } = candidate;
      if (this.world.chunks.has(this.key(cx, cz))) continue;
      this.generating++;
      const started = performance.now();
      this.worker.send({ type: 'generate', cx, cz, seed: this.world.seed, edits: this.world.editsFor(cx, cz) }, response => {
        this.generating--;
        if (this.disposed || !this.target.has(this.key(cx, cz)) || response.type !== 'generated') return;
        const payload = response.payload;
        const record = this.world.addChunk(payload);
        record.generationMs = performance.now() - started;
        this.taskTimes.push(record.generationMs);
        if (this.taskTimes.length > 30) this.taskTimes.shift();
        this.scheduleMesh(cx, cz);
      });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const candidate of candidates) {
      const record = candidate.record ?? this.world.chunks.get(this.key(candidate.cx, candidate.cz));
      if (!record || candidate.d > this.renderDistance * this.renderDistance) continue;
      const inFlight = this.views.get(this.key(candidate.cx, candidate.cz));
      if (inFlight && inFlight.revision === record.revision) continue;
      this.scheduleMesh(candidate.cx, candidate.cz);
      if (this.meshing >= 3) break;
    }
    if (!this.initialNotified) {
      let surroundings = true;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!this.views.has(this.key(this.center.cx + dx, this.center.cz + dz))) surroundings = false;
      }
      if (surroundings) {
        this.initialNotified = true;
        this.onInitialReady();
      }
    }
  }

  private scheduleMesh(cx: number, cz: number) {
    if (this.meshing >= 3 || this.disposed) return;
    const record = this.world.chunks.get(this.key(cx, cz));
    if (!record) return;
    const view = this.views.get(this.key(cx, cz));
    if (view && view.revision === record.revision) return;
    const neighbors: Record<string, Uint8Array> = {};
    for (const [name, ox, oz] of [['west', -1, 0], ['east', 1, 0], ['north', 0, -1], ['south', 0, 1]] as const) {
      const n = this.world.chunks.get(this.key(cx + ox, cz + oz));
      if (!n) return;
      neighbors[name] = n.voxels.slice();
    }
    this.meshing++;
    const revision = record.revision;
    const voxels = record.voxels.slice();
    this.worker.send({ type: 'mesh', cx, cz, voxels, neighbors }, response => {
      this.meshing--;
      if (this.disposed || response.type !== 'meshed') return;
      const current = this.world.chunks.get(this.key(cx, cz));
      if (!current || current.revision !== revision) return;
      this.meshTimes.push(response.buildMs);
      if (this.meshTimes.length > 30) this.meshTimes.shift();
      this.applyMesh(cx, cz, response.opaque, response.water, revision);
    });
  }

  private applyMesh(cx: number, cz: number, opaque: MeshArrays, water: MeshArrays, revision: number) {
    const key = this.key(cx, cz);
    const old = this.views.get(key);
    if (old) this.disposeView(old);
    const view: View = { revision, lights: [] };
    if (opaque.indices.length) {
      const mesh = new THREE.Mesh(this.geometry(opaque), this.opaqueMaterial);
      mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
      view.opaque = mesh;
    }
    if (water.indices.length) {
      const mesh = new THREE.Mesh(this.geometry(water), this.waterMaterial);
      mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
      view.water = mesh;
    }
    const record = this.world.chunks.get(key);
    if (record) {
      for (let i = 0; i < record.voxels.length; i++) if (blockAt(record.voxels[i]).light) {
        const y = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
        const rem = i % (CHUNK_SIZE * CHUNK_SIZE);
        view.lights.push({ x: cx * CHUNK_SIZE + rem % CHUNK_SIZE + 0.5, y: y + 0.5, z: cz * CHUNK_SIZE + Math.floor(rem / CHUNK_SIZE) + 0.5 });
      }
    }
    this.views.set(key, view);
  }

  markDirty(x: number, _y: number, z: number) {
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    if (x % CHUNK_SIZE === 0) this.invalidate(cx - 1, cz); if ((x + 1) % CHUNK_SIZE === 0) this.invalidate(cx + 1, cz);
    if (z % CHUNK_SIZE === 0) this.invalidate(cx, cz - 1); if ((z + 1) % CHUNK_SIZE === 0) this.invalidate(cx, cz + 1);
    this.invalidate(cx, cz);
  }

  private invalidate(cx: number, cz: number) {
    const view = this.views.get(this.key(cx, cz));
    if (view) { view.revision = -1; this.scheduleMesh(cx, cz); }
  }

  private unloadDistant(pcx: number, pcz: number, radius: number) {
    for (const [key, view] of this.views) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > radius || Math.abs(cz - pcz) > radius) {
        this.disposeView(view);
        this.views.delete(key);
        this.world.removeChunk(cx, cz);
      }
    }
    for (const key of this.world.chunks.keys()) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > radius || Math.abs(cz - pcz) > radius) this.world.removeChunk(cx, cz);
    }
  }

  private refreshLights(px: number, pz: number) {
    const lights: { x: number; y: number; z: number; d: number; level: number }[] = [];
    for (const view of this.views.values()) for (const light of view.lights) {
      lights.push({ ...light, d: (light.x - px) ** 2 + (light.z - pz) ** 2, level: 1 });
    }
    for (const [key, id] of this.world.edits) {
      const def = blockAt(id);
      if (!def.light) continue;
      const [x, y, z] = key.split(',').map(Number);
      lights.push({ x: x + 0.5, y: y + 0.5, z: z + 0.5, d: (x - px) ** 2 + (z - pz) ** 2, level: def.light });
    }
    lights.sort((a, b) => a.d - b.d);
    this.lightPool.forEach((light, index) => {
      const data = lights[index];
      if (!data) { light.intensity = 0; return; }
      light.position.set(data.x, data.y, data.z);
      light.intensity = Math.min(2.8, data.level * 0.18) * Math.max(0.25, 1 - Math.sqrt(data.d) / 20);
      light.distance = 12;
    });
  }

  private updateStats() { this.onStats(this.stats); }

  resetInitial() { this.initialNotified = false; }
  getVisibleCount() { return this.views.size; }

  get stats(): RenderStats {
    let triangles = 0;
    for (const view of this.views.values()) for (const mesh of [view.opaque, view.water]) {
      if (mesh?.geometry.index) triangles += mesh.geometry.index.count / 3;
    }
    return {
      loaded: this.world.chunks.size, visible: this.views.size, generating: this.generating,
      meshing: this.meshing, queued: this.target.size - this.views.size,
      triangles, drawCalls: this.group.children.length,
      genMs: this.taskTimes.length ? this.taskTimes.reduce((a, b) => a + b, 0) / this.taskTimes.length : 0,
      meshMs: this.meshTimes.length ? this.meshTimes.reduce((a, b) => a + b, 0) / this.meshTimes.length : 0,
    };
  }

  dispose() {
    this.disposed = true;
    this.worker.dispose();
    for (const view of this.views.values()) this.disposeView(view);
    this.views.clear();
    this.scene.remove(this.group);
    for (const light of this.lightPool) this.scene.remove(light);
    this.lightPool = [];
    this.opaqueMaterial.dispose();
    this.waterMaterial.dispose();
  }
}
