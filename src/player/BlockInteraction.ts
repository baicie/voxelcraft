import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { ItemStack } from '../items/ItemStack';
import { MiningSession, type MiningTarget } from '../mining/MiningRules';
import { getBlockDefinition, type BlockId } from '../world/BlockRegistry';
import { PLAYER_REACH } from '../world/constants';
import { raycastVoxels, type RaycastHit } from '../world/VoxelRaycast';
import type { World } from '../world/World';
import type { Player } from './Player';

export interface InteractionHost {
  readonly creative: boolean;
  getHeldStack(): ItemStack | null;
  /** Returns false when placement is invalid / inventory lacks the item. */
  placeBlock(x: number, y: number, z: number): boolean;
  breakBlock(x: number, y: number, z: number, block: BlockId): boolean;
  /** Returns true when the block interaction consumed the click (e.g. opened UI). */
  useBlock(x: number, y: number, z: number, block: BlockId): boolean;
  onMiningProgress(progress: number): void;
  onMessage(message: string): void;
}

export class BlockInteraction {
  readonly highlight: THREE.LineSegments;
  readonly input: Input;
  host: InteractionHost | null = null;

  private readonly scene: THREE.Scene;
  private readonly world: World;
  private readonly player: Player;
  private readonly camera: THREE.PerspectiveCamera;
  private target: RaycastHit | null = null;
  private readonly mining = new MiningSession();
  private placeCooldown = 0;
  private breakCooldown = 0;
  private lastReportedProgress = 0;
  private readonly lookDirection = new THREE.Vector3();

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, player: Player, world: World, input: Input) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.world = world;
    this.input = input;

    const box = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    const geometry = new THREE.EdgesGeometry(box);
    box.dispose();
    const material = new THREE.LineBasicMaterial({
      color: 0x101719,
      transparent: true,
      opacity: 0.9,
      depthTest: true,
    });
    this.highlight = new THREE.LineSegments(geometry, material);
    this.highlight.renderOrder = 10;
    this.highlight.visible = false;
    scene.add(this.highlight);
  }

  update(dt: number, active: boolean): void {
    if (!active || !this.host) {
      this.target = null;
      this.highlight.visible = false;
      this.resetMining();
      return;
    }

    this.updateTarget();
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    this.breakCooldown = Math.max(0, this.breakCooldown - dt);

    if (!this.target) {
      this.resetMining();
      return;
    }

    this.handleMining(dt);
    this.handleRightClick();
  }

  getTarget(): RaycastHit | null {
    return this.target;
  }

  dispose(): void {
    this.scene.remove(this.highlight);
    this.highlight.geometry.dispose();
    (this.highlight.material as THREE.Material).dispose();
  }

  private updateTarget(): void {
    this.camera.getWorldDirection(this.lookDirection);
    const hit = raycastVoxels(this.world, this.camera.position, this.lookDirection, PLAYER_REACH);
    this.target = hit;
    if (!hit) {
      this.highlight.visible = false;
      return;
    }
    this.highlight.visible = true;
    this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }

  private handleMining(dt: number): void {
    if (!this.target || !this.host) return;
    if (!this.input.isMouseDown(0) || !getBlockDefinition(this.target.block).breakable) {
      this.resetMining();
      return;
    }
    if (this.host.creative && this.breakCooldown > 0) return;

    const miningTarget: MiningTarget = {
      x: this.target.x,
      y: this.target.y,
      z: this.target.z,
      block: this.target.block,
    };
    const tick = this.mining.tick(dt, miningTarget, this.host.getHeldStack(), this.host.creative);
    if (Math.abs(tick.progress - this.lastReportedProgress) >= 0.01) {
      this.lastReportedProgress = tick.progress;
      this.host.onMiningProgress(tick.progress);
    }
    if (!tick.completed) return;

    const hit = this.target;
    this.resetMining();
    this.breakCooldown = this.host.creative ? 0.12 : 0;
    this.host.onMiningProgress(0);
    this.host.breakBlock(hit.x, hit.y, hit.z, hit.block);
    this.highlight.visible = false;
  }

  private handleRightClick(): void {
    if (!this.target || !this.host || this.placeCooldown > 0) return;
    const pressed = this.input.wasMousePressed(2) || this.input.isMouseDown(2);
    if (!pressed) return;

    const hit = this.target;
    const def = getBlockDefinition(hit.block);
    if (def.interaction && !this.player.sneaking) {
      if (this.host.useBlock(hit.x, hit.y, hit.z, hit.block)) {
        this.placeCooldown = 0.3;
        return;
      }
    }

    if (this.host.placeBlock(hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz)) {
      this.placeCooldown = 0.2;
    } else {
      this.placeCooldown = 0.18;
    }
  }

  private resetMining(): void {
    if (this.lastReportedProgress > 0) this.host?.onMiningProgress(0);
    this.mining.reset();
    this.lastReportedProgress = 0;
  }
}
