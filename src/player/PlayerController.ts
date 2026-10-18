import { clamp, damp } from '../utils/math';
import type { GameCamera } from '../engine/GameCamera';
import type { Input } from '../engine/Input';
import type { Player } from './Player';
import { PLAYER_EYE_HEIGHT } from './Player';
import { PlayerPhysics, type PhysicsWorld } from './PlayerPhysics';

const BASE_SENSITIVITY = 0.0022;
const WALK_SPEED = 4.7;
const SPRINT_SPEED = 7.3;
const SNEAK_SPEED = 1.9;
const WATER_SPEED = 3.1;
const FLY_SPEED = 10.5;
const FLY_SPRINT_SPEED = 19;

export class PlayerController {
  readonly player: Player;
  readonly camera: GameCamera;
  readonly input: Input;
  readonly physics = new PlayerPhysics();
  onFootstep: (() => void) | null = null;
  onFlyToggle: ((flying: boolean) => void) | null = null;

  private sensitivity = 1;
  private baseFov = 75;
  private eyeHeight = PLAYER_EYE_HEIGHT;
  private bobPhase = 0;
  private bobStrength = 0;
  private stepDistance = 0;
  private flightAllowed = false;

  constructor(player: Player, camera: GameCamera, input: Input) {
    this.player = player;
    this.camera = camera;
    this.input = input;
    this.camera.setFov(this.baseFov);
  }

  setSensitivity(multiplier: number): void {
    this.sensitivity = clamp(multiplier, 0.2, 3);
  }

  setFlightAllowed(allowed: boolean): void {
    this.flightAllowed = allowed;
    if (!allowed) {
      this.player.flying = false;
    }
  }

  setFov(fov: number): void {
    this.baseFov = fov;
    this.camera.setFov(fov);
  }

  update(dt: number, world: PhysicsWorld, active = true): void {
    if (active) {
      this.updateLook();
      this.updateMovement(dt);
      if (this.input.wasPressed('KeyF') && this.flightAllowed) {
        this.player.flying = !this.player.flying;
        this.player.velocity.y = 0;
        this.player.onGround = false;
        this.onFlyToggle?.(this.player.flying);
      }
      this.physics.step(this.player, world, dt, {
        jumpHeld: this.input.isActionDown('jump'),
        sneak: this.input.isActionDown('sneak') && !this.player.flying,
        flying: this.player.flying,
      });
      this.player.sprinting = !this.player.flying && this.input.isActionDown('sprint') && this.input.isActionDown('forward') && !this.input.isActionDown('sneak');
      this.updateFootsteps(dt);
    }
    this.updateCamera(dt);
  }

  private updateLook(): void {
    const delta = this.input.consumeMouseDelta();
    const sensitivity = BASE_SENSITIVITY * this.sensitivity;
    this.player.yaw -= delta.x * sensitivity;
    this.player.pitch = clamp(this.player.pitch - delta.y * sensitivity, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
  }

  private updateMovement(dt: number): void {
    const player = this.player;
    const forwardInput = Number(this.input.isActionDown('forward')) - Number(this.input.isActionDown('back'));
    const strafeInput = Number(this.input.isActionDown('right')) - Number(this.input.isActionDown('left'));
    const hasInput = forwardInput !== 0 || strafeInput !== 0;
    const length = Math.hypot(forwardInput, strafeInput) || 1;
    const forward = forwardInput / length;
    const strafe = strafeInput / length;

    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    let speed = WALK_SPEED;
    if (player.flying) {
      speed = this.input.isActionDown('sprint') ? FLY_SPRINT_SPEED : FLY_SPEED;
    } else if (player.inWater) {
      speed = WATER_SPEED;
    } else if (this.input.isActionDown('sneak')) {
      speed = SNEAK_SPEED;
    } else if (this.input.isActionDown('sprint')) {
      speed = SPRINT_SPEED;
    }
    if (player.sneaking && !player.flying) speed = Math.min(speed, SNEAK_SPEED);

    const targetX = (-sin * forward + cos * strafe) * speed;
    const targetZ = (-cos * forward - sin * strafe) * speed;
    const lambda = player.flying ? 7 : player.onGround ? (hasInput ? 18 : 14) : 2.5;
    player.velocity.x = damp(player.velocity.x, hasInput ? targetX : 0, lambda, dt);
    player.velocity.z = damp(player.velocity.z, hasInput ? targetZ : 0, lambda, dt);

    if (player.flying) {
      const vertical = Number(this.input.isActionDown('jump')) - Number(this.input.isActionDown('sneak'));
      const verticalSpeed = this.input.isActionDown('sprint') ? FLY_SPRINT_SPEED * 0.8 : FLY_SPEED * 0.8;
      player.velocity.y = damp(player.velocity.y, vertical * verticalSpeed, 12, dt);
    }
  }

  private updateFootsteps(dt: number): void {
    const player = this.player;
    const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    if (player.onGround && horizontalSpeed > 0.6 && !player.flying) {
      this.stepDistance += horizontalSpeed * dt;
      if (this.stepDistance > 2.15) {
        this.stepDistance = 0;
        this.onFootstep?.();
      }
    } else {
      this.stepDistance = Math.min(this.stepDistance, 2.15);
    }
  }

  private updateCamera(dt: number): void {
    const player = this.player;
    const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    const moving = player.onGround && horizontalSpeed > 0.4 && !player.flying;
    this.bobStrength = damp(this.bobStrength, moving ? Math.min(1, horizontalSpeed / WALK_SPEED) : 0, 10, dt);
    this.bobPhase += dt * (6.5 + horizontalSpeed * 0.9);

    const sneaking = player.sneaking && !player.flying;
    this.eyeHeight = damp(this.eyeHeight, sneaking ? 1.38 : PLAYER_EYE_HEIGHT, 12, dt);
    const bobY = Math.sin(this.bobPhase * 2) * 0.035 * this.bobStrength;
    const bobRoll = Math.sin(this.bobPhase) * 0.002 * this.bobStrength;

    this.camera.setSprintFov(player.sprinting && !player.flying, dt);
    this.camera.applyView(
      player.position.x,
      player.position.y + this.eyeHeight,
      player.position.z,
      player.yaw,
      player.pitch,
      bobY,
      bobRoll,
    );
  }
}
