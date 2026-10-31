import * as THREE from 'three';

export class Particles {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private velocities: Float32Array;
  private life: Float32Array;
  private cursor = 0;
  private capacity = 240;
  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(this.capacity * 3);
    this.colors = new Float32Array(this.capacity * 3);
    this.velocities = new Float32Array(this.capacity * 3);
    this.life = new Float32Array(this.capacity);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.12, vertexColors: true, transparent: true, opacity: .9, depthWrite: false, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  burst(x: number, y: number, z: number, color: THREE.ColorRepresentation, count = 12) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor++ % this.capacity;
      this.positions[i * 3] = x + .5 + (Math.random() - .5) * .7;
      this.positions[i * 3 + 1] = y + .5 + (Math.random() - .5) * .7;
      this.positions[i * 3 + 2] = z + .5 + (Math.random() - .5) * .7;
      this.velocities[i * 3] = (Math.random() - .5) * 2.4;
      this.velocities[i * 3 + 1] = Math.random() * 2.2 + .6;
      this.velocities[i * 3 + 2] = (Math.random() - .5) * 2.4;
      this.colors[i * 3] = c.r; this.colors[i * 3 + 1] = c.g; this.colors[i * 3 + 2] = c.b;
      this.life[i] = .65 + Math.random() * .45;
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) { this.positions[i * 3 + 1] = -999; continue; }
      this.life[i] -= dt;
      this.velocities[i * 3 + 1] -= 9 * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
    }
    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
  dispose() { this.points.geometry.dispose(); (this.points.material as THREE.Material).dispose(); this.points.removeFromParent(); }
}
