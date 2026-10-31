import * as THREE from 'three';
import type { Mob } from '../entities/mobs';
import { blockAt } from '../world/blocks';

const mat = (color: number) => new THREE.MeshLambertMaterial({ color });
const materials = {
  pig: mat(0xd98b91), pigSnout: mat(0xefadb0), sheep: mat(0xe4e2d5), sheepFace: mat(0x8b8177),
  wolf: mat(0x818387), zombie: mat(0x5b8562), zombieShirt: mat(0x395778), dark: mat(0x242322),
  eye: new THREE.MeshBasicMaterial({ color: 0xd8ffdb }), shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .18, depthWrite: false }),
};
function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; return mesh;
}
function createMobMesh(kind: Mob['kind']): THREE.Group {
  const root = new THREE.Group();
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(kind === 'zombie' ? .46 : .5, 16), materials.shadow);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .015; root.add(shadow);
  if (kind === 'pig') {
    const body = box(.9, .62, 1.25, materials.pig, 0, .74, 0); root.add(body);
    root.add(box(.68, .62, .62, materials.pig, 0, .76, .84));
    root.add(box(.46, .32, .22, materials.pigSnout, 0, .67, 1.15));
    for (const sx of [-.28, .28]) root.add(box(.16, .2, .12, materials.eye, sx, .88, 1.12));
    for (const x of [-.3, .3]) for (const z of [-.4, .4]) root.add(box(.2, .5, .2, materials.pig, x, .3, z));
  } else if (kind === 'sheep') {
    root.add(box(1.05, .85, 1.3, materials.sheep, 0, .92, 0));
    root.add(box(.68, .65, .62, materials.sheepFace, 0, 1.05, .9));
    for (const sx of [-.23, .23]) root.add(box(.1, .13, .08, materials.dark, sx, 1.12, 1.22));
    for (const x of [-.33, .33]) for (const z of [-.42, .42]) root.add(box(.22, .65, .22, materials.sheepFace, x, .32, z));
  } else if (kind === 'wolf') {
    root.add(box(.65, .55, 1.3, materials.wolf, 0, .65, 0));
    root.add(box(.58, .56, .6, materials.wolf, 0, .85, .85));
    root.add(box(.2, .3, .28, materials.dark, 0, .72, 1.18));
    for (const sx of [-.2, .2]) {
      root.add(box(.1, .08, .08, materials.eye, sx, .97, 1.13));
      const ear = box(.18, .3, .12, materials.wolf, sx, 1.22, .72); ear.rotation.z = sx > 0 ? -.2 : .2; root.add(ear);
    }
    for (const x of [-.23, .23]) for (const z of [-.4, .4]) root.add(box(.18, .6, .18, materials.wolf, x, .3, z));
    const tail = box(.15, .15, .75, materials.wolf, 0, .78, -.93); tail.rotation.x = -.35; root.add(tail);
  } else {
    root.add(box(.68, .92, .38, materials.zombieShirt, 0, 1.02, 0));
    root.add(box(.58, .58, .55, materials.zombie, 0, 1.65, 0));
    for (const sx of [-.15, .15]) root.add(box(.12, .1, .08, materials.eye, sx, 1.68, .29));
    for (const sx of [-.47, .47]) {
      const arm = box(.27, .8, .27, materials.zombieShirt, sx, 1.05, .28); arm.rotation.x = -.9; root.add(arm);
    }
    for (const sx of [-.22, .22]) root.add(box(.29, .7, .29, materials.zombieShirt, sx, .36, 0));
  }
  root.scale.setScalar(kind === 'zombie' ? .95 : 1);
  return root;
}

export class MobRenderer {
  private groups = new Map<number, { group: THREE.Group; hurt: number }>();
  constructor(private scene: THREE.Scene) {}
  sync(mobs: Mob[], _dt: number) {
    const alive = new Set<number>();
    for (const mob of mobs) {
      if (!mob.alive) continue;
      alive.add(mob.id);
      let entry = this.groups.get(mob.id);
      if (!entry) {
        entry = { group: createMobMesh(mob.kind), hurt: 0 };
        this.scene.add(entry.group);
        this.groups.set(mob.id, entry);
      }
      entry.group.position.set(mob.position.x, mob.position.y, mob.position.z);
      entry.group.rotation.y = Math.atan2(mob.velocity.x, mob.velocity.z);
      const walk = Math.hypot(mob.velocity.x, mob.velocity.z) > .05 ? Math.sin(performance.now() / 120 + mob.id) * .08 : 0;
      entry.group.position.y += Math.abs(walk) * .5;
      for (const child of entry.group.children) {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
          if (mob.hurt > 0) child.material.emissive.setRGB(.25, 0, 0); else child.material.emissive.setRGB(0, 0, 0);
        }
      }
    }
    for (const [id, entry] of this.groups) {
      if (!alive.has(id)) { this.scene.remove(entry.group); this.groupDispose(entry.group); this.groups.delete(id); }
    }
  }
  private groupDispose(group: THREE.Group) {
    group.traverse(obj => { if (obj instanceof THREE.Mesh) obj.geometry.dispose(); });
  }
  dispose() {
    for (const entry of this.groups.values()) { this.scene.remove(entry.group); this.groupDispose(entry.group); }
    this.groups.clear();
  }
}

export function blockParticleColor(id: number): THREE.Color {
  const map: Record<number, number> = { 1: 0x77a34a, 2: 0x79583a, 3: 0x888e8e, 4: 0xd8c48b, 7: 0x80603f, 8: 0x477c43, 9: 0xb98e58, 18: 0x78817e, 24: 0x727b78 };
  return new THREE.Color(map[id] ?? 0x8d8d8d);
}

export function itemBlockColor(id: string): THREE.Color {
  if (id.startsWith('block:')) {
    const entry = Object.entries({ grass: 1, dirt: 2, stone: 3, sand: 4 }).find(([name]) => id === `block:${name}`);
    return new THREE.Color(entry ? blockParticleColor(entry[1]) : 0x8d8d8d);
  }
  return new THREE.Color(0xe8d59b);
}

export function isBlockIdSolid(id: number) { return blockAt(id).solid; }
