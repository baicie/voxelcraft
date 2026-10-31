import * as THREE from 'three';
import type { Drop } from '../entities/drops';
import { itemIcon } from './atlas';

export class DropRenderer {
  private spriteMaterials = new Map<string, THREE.SpriteMaterial>();
  private groups = new Map<number, THREE.Sprite>();
  constructor(private scene: THREE.Scene) {}
  private material(id: string): THREE.SpriteMaterial {
    let material = this.spriteMaterials.get(id);
    if (!material) {
      const texture = new THREE.TextureLoader().load(itemIcon(id));
      texture.magFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      material = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: .1 });
      this.spriteMaterials.set(id, material);
    }
    return material;
  }
  sync(drops: Drop[], elapsed: number) {
    const alive = new Set<number>();
    for (const drop of drops) {
      alive.add(drop.key);
      let sprite = this.groups.get(drop.key);
      if (!sprite) {
        sprite = new THREE.Sprite(this.material(drop.id));
        sprite.scale.set(.46, .46, .46);
        this.scene.add(sprite);
        this.groups.set(drop.key, sprite);
      }
      sprite.position.set(drop.position.x, drop.position.y + .2 + Math.sin(elapsed * 3 + drop.key) * .07, drop.position.z);
    }
    for (const [key, sprite] of this.groups) {
      if (!alive.has(key)) { sprite.removeFromParent(); this.groups.delete(key); }
    }
  }
  dispose() {
    for (const sprite of this.groups.values()) sprite.removeFromParent();
    this.groups.clear();
    for (const mat of this.spriteMaterials.values()) { mat.map?.dispose(); mat.dispose(); }
    this.spriteMaterials.clear();
  }
}
