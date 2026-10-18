import * as THREE from 'three';
import { getItemDefinition } from '../items/ItemRegistry';
import type { ItemEntityWorld } from './ItemEntityWorld';

const MAX_INSTANCES = 512;

export class ItemEntityRenderer {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'item-entities';
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  update(world: ItemEntityWorld): void {
    let index = 0;
    for (const entity of world.values()) {
      if (index >= MAX_INSTANCES) break;
      const bob = Math.sin((entity.ageSeconds + entity.id.length) * 3.2) * 0.04;
      this.dummy.position.set(entity.x, entity.y + 0.12 + bob, entity.z);
      this.dummy.rotation.set(0.35, entity.ageSeconds * 1.4, 0.25);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
      const definition = getItemDefinition(entity.stack.itemId);
      this.color.setHex(definition?.color ?? 0xffffff);
      this.mesh.setColorAt(index, this.color);
      index++;
    }
    this.mesh.count = index;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
