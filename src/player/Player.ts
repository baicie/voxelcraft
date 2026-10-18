import * as THREE from 'three';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.62;

export class Player {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly width = PLAYER_WIDTH;
  readonly height = PLAYER_HEIGHT;
  yaw = 0;
  pitch = 0;
  onGround = false;
  inWater = false;
  flying = false;
  sneaking = false;
  sprinting = false;

  constructor(position = new THREE.Vector3(0.5, 80, 0.5)) {
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
  }

  get eyeY(): number {
    return this.position.y + PLAYER_EYE_HEIGHT;
  }

  getEyePosition(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(this.position.x, this.position.y + (this.sneaking ? 1.38 : PLAYER_EYE_HEIGHT), this.position.z);
  }

  getLookDirection(target = new THREE.Vector3()): THREE.Vector3 {
    const cosPitch = Math.cos(this.pitch);
    target.set(-Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), -Math.cos(this.yaw) * cosPitch);
    return target.normalize();
  }

  get minX(): number {
    return this.position.x - this.width * 0.5;
  }

  get maxX(): number {
    return this.position.x + this.width * 0.5;
  }

  get minY(): number {
    return this.position.y;
  }

  get maxY(): number {
    return this.position.y + this.height;
  }

  get minZ(): number {
    return this.position.z - this.width * 0.5;
  }

  get maxZ(): number {
    return this.position.z + this.width * 0.5;
  }

  intersectsBlock(x: number, y: number, z: number, padding = 0.001): boolean {
    return (
      this.maxX - padding > x &&
      this.minX + padding < x + 1 &&
      this.maxY - padding > y &&
      this.minY + padding < y + 1 &&
      this.maxZ - padding > z &&
      this.minZ + padding < z + 1
    );
  }

  intersectsAabb(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    return (
      this.maxX > minX &&
      this.minX < maxX &&
      this.maxY > minY &&
      this.minY < maxY &&
      this.maxZ > minZ &&
      this.minZ < maxZ
    );
  }

  teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.onGround = false;
  }
}
