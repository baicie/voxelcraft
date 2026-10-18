import * as THREE from 'three';
import { clamp } from '../utils/math';

const BASE_FOV = 75;

export class GameCamera {
  readonly camera: THREE.PerspectiveCamera;
  private fov = BASE_FOV;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.08, 600);
    this.camera.rotation.order = 'YXZ';
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setViewDistance(distanceChunks: number): void {
    this.camera.far = Math.max(520, distanceChunks * 16 + 120);
    this.camera.updateProjectionMatrix();
  }

  setFov(fov: number): void {
    this.fov = fov;
    this.applyFov(fov);
  }

  setSprintFov(sprinting: boolean, dt: number): void {
    const target = this.fov + (sprinting ? 5 : 0);
    this.camera.fov += (target - this.camera.fov) * Math.min(1, dt * 8);
    this.camera.updateProjectionMatrix();
  }

  applyView(
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    bob: number,
    roll = 0,
  ): void {
    this.camera.position.set(x, y + bob, z);
    this.camera.rotation.set(clamp(pitch, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001), yaw, roll);
  }

  private applyFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }
}
