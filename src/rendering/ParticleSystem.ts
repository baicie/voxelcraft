import * as THREE from 'three';

const MAX_PARTICLES = 192;

interface Particle {
  active: boolean;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  rotation: number;
  spin: number;
}

export class ParticleSystem {
  private readonly mesh: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private nextIndex = 0;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        life: 0,
        maxLife: 0,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 0.1,
        rotation: 0,
        spin: 0,
      });
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.setHex(0xffffff));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  spawnBlockBurst(x: number, y: number, z: number, colorHex: number, count = 14, intensity = 1): void {
    for (let i = 0; i < count; i++) {
      const index = this.nextIndex++ % MAX_PARTICLES;
      const particle = this.particles[index]!;
      particle.active = true;
      particle.life = 0;
      particle.maxLife = 0.45 + Math.random() * 0.5;
      particle.x = x + 0.15 + Math.random() * 0.7;
      particle.y = y + 0.15 + Math.random() * 0.7;
      particle.z = z + 0.15 + Math.random() * 0.7;
      particle.vx = (Math.random() - 0.5) * 3.4 * intensity;
      particle.vy = 1.4 + Math.random() * 3.2 * intensity;
      particle.vz = (Math.random() - 0.5) * 3.4 * intensity;
      particle.size = 0.055 + Math.random() * 0.085;
      particle.rotation = Math.random() * Math.PI;
      particle.spin = (Math.random() - 0.5) * 12;
      const variation = 0.78 + Math.random() * 0.35;
      this.color.setHex(colorHex).multiplyScalar(variation);
      this.mesh.setColorAt(index, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    let changed = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const particle = this.particles[i]!;
      if (!particle.active) continue;
      particle.life += dt;
      if (particle.life >= particle.maxLife) {
        particle.active = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        changed = true;
        continue;
      }

      particle.vy -= 17 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      particle.rotation += particle.spin * dt;
      const remaining = 1 - particle.life / particle.maxLife;
      const scale = particle.size * (0.55 + remaining * 0.45);
      this.dummy.position.set(particle.x, particle.y, particle.z);
      this.dummy.rotation.set(particle.rotation, particle.rotation * 0.7, particle.rotation * 1.3);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      changed = true;
    }
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
