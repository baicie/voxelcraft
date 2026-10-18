import { BlockId } from '../world/BlockRegistry';
import type { Player } from './Player';

export interface PhysicsWorld {
  isSolidAt(x: number, y: number, z: number): boolean;
  getBlock(x: number, y: number, z: number): BlockId;
}

export interface PhysicsInput {
  jumpHeld: boolean;
  sneak: boolean;
  flying: boolean;
}

export interface PhysicsResult {
  collidedX: boolean;
  collidedY: boolean;
  collidedZ: boolean;
  landed: boolean;
  steppedUp: boolean;
}

const GRAVITY = 28;
const WATER_GRAVITY = 7;
const JUMP_SPEED = 8.4;
const MAX_FALL_SPEED = 42;
const STEP_HEIGHT = 0.55;
const EPSILON = 1e-5;
const MAX_SUBSTEP = 0.22;

export class PlayerPhysics {
  step(player: Player, world: PhysicsWorld, dt: number, input: PhysicsInput): PhysicsResult {
    const result: PhysicsResult = {
      collidedX: false,
      collidedY: false,
      collidedZ: false,
      landed: false,
      steppedUp: false,
    };
    if (dt <= 0) return result;

    this.updateEnvironment(player, world, input, dt);

    const deltaX = player.velocity.x * dt;
    const deltaZ = player.velocity.z * dt;
    const deltaY = player.velocity.y * dt;
    const substeps = Math.max(1, Math.ceil(Math.max(Math.abs(deltaX), Math.abs(deltaZ), Math.abs(deltaY)) / MAX_SUBSTEP));
    const stepX = deltaX / substeps;
    const stepY = deltaY / substeps;
    const stepZ = deltaZ / substeps;

    for (let i = 0; i < substeps; i++) {
      if (stepX !== 0) {
        const collided = this.moveAxis(player, world, 0, stepX);
        if (collided) {
          result.collidedX = true;
          if (!input.flying && player.onGround && !input.sneak && !result.steppedUp) {
            result.steppedUp = this.tryStepUp(player, world, stepX, 0);
          }
        }
      }
      if (stepZ !== 0) {
        const collided = this.moveAxis(player, world, 2, stepZ);
        if (collided) {
          result.collidedZ = true;
          if (!input.flying && player.onGround && !input.sneak && !result.steppedUp) {
            result.steppedUp = this.tryStepUp(player, world, 0, stepZ);
          }
        }
      }
      if (stepY !== 0) {
        const collided = this.moveAxis(player, world, 1, stepY);
        if (collided) {
          result.collidedY = true;
          if (stepY < 0) result.landed = true;
        }
      }
    }

    if (result.steppedUp) {
      // Snap the camera/player down onto the step if the lift left a gap.
      const drop = this.moveAxis(player, world, 1, -STEP_HEIGHT);
      if (!drop) {
        player.onGround = false;
      }
    }

    if (!input.flying) {
      player.onGround = result.landed || this.hasGroundSupport(player, world);
    } else {
      player.onGround = false;
    }

    if (player.position.y < -20) {
      player.velocity.set(0, 0, 0);
    }

    return result;
  }

  private updateEnvironment(player: Player, world: PhysicsWorld, input: PhysicsInput, dt: number): void {
    const feetBlock = world.getBlock(Math.floor(player.position.x), Math.floor(player.position.y + 0.1), Math.floor(player.position.z));
    const chestBlock = world.getBlock(Math.floor(player.position.x), Math.floor(player.position.y + 0.9), Math.floor(player.position.z));
    player.inWater = feetBlock === BlockId.Water || chestBlock === BlockId.Water;
    player.sneaking = input.sneak;

    if (input.flying) {
      return;
    }

    if (player.inWater) {
      player.velocity.y -= WATER_GRAVITY * dt;
      player.velocity.y *= Math.max(0, 1 - 2.2 * dt);
      if (input.jumpHeld) {
        player.velocity.y = Math.min(player.velocity.y + 24 * dt, 3.8);
      }
      player.velocity.y = Math.max(player.velocity.y, -3.8);
      return;
    }

    if (input.jumpHeld && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    player.velocity.y -= GRAVITY * dt;
    player.velocity.y = Math.max(player.velocity.y, -MAX_FALL_SPEED);
  }

  private moveAxis(player: Player, world: PhysicsWorld, axis: 0 | 1 | 2, amount: number): boolean {
    if (amount === 0) return false;
    const position = player.position;
    if (axis === 0) position.x += amount;
    else if (axis === 2) position.z += amount;
    else position.y += amount;

    return this.resolveAxisCollision(player, world, axis, amount);
  }

  private resolveAxisCollision(player: Player, world: PhysicsWorld, axis: 0 | 1 | 2, amount: number): boolean {
    let collided = false;
    for (let pass = 0; pass < 4; pass++) {
      const minX = Math.floor(player.minX + EPSILON);
      const maxX = Math.floor(player.maxX - EPSILON);
      const minY = Math.floor(player.minY + EPSILON);
      const maxY = Math.floor(player.maxY - EPSILON);
      const minZ = Math.floor(player.minZ + EPSILON);
      const maxZ = Math.floor(player.maxZ - EPSILON);
      let adjusted = false;

      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          for (let x = minX; x <= maxX; x++) {
            if (!world.isSolidAt(x, y, z)) continue;
            collided = true;
            if (axis === 0) {
              if (amount > 0) player.position.x = Math.min(player.position.x, x - player.width * 0.5 - EPSILON);
              else player.position.x = Math.max(player.position.x, x + 1 + player.width * 0.5 + EPSILON);
              if (!adjusted) player.velocity.x = 0;
            } else if (axis === 2) {
              if (amount > 0) player.position.z = Math.min(player.position.z, z - player.width * 0.5 - EPSILON);
              else player.position.z = Math.max(player.position.z, z + 1 + player.width * 0.5 + EPSILON);
              if (!adjusted) player.velocity.z = 0;
            } else {
              if (amount > 0) {
                player.position.y = Math.min(player.position.y, y - player.height - EPSILON);
                if (!adjusted) player.velocity.y = 0;
              } else {
                player.position.y = Math.max(player.position.y, y + 1 + EPSILON);
                if (!adjusted) {
                  player.velocity.y = 0;
                  player.onGround = true;
                }
              }
            }
            adjusted = true;
          }
        }
      }
      if (!adjusted) break;
    }
    return collided;
  }

  private tryStepUp(player: Player, world: PhysicsWorld, stepX: number, stepZ: number): boolean {
    const startX = player.position.x;
    const startY = player.position.y;
    const startZ = player.position.z;
    const velocityX = player.velocity.x;
    const velocityZ = player.velocity.z;

    if (this.collides(player, world)) return false;
    player.position.y += STEP_HEIGHT;
    if (this.collides(player, world)) {
      player.position.set(startX, startY, startZ);
      return false;
    }

    if (stepX !== 0) {
      player.position.x += stepX;
      if (this.collides(player, world)) {
        player.position.set(startX, startY, startZ);
        return false;
      }
    }
    if (stepZ !== 0) {
      player.position.z += stepZ;
      if (this.collides(player, world)) {
        player.position.set(startX, startY, startZ);
        return false;
      }
    }

    player.position.y = startY;
    const dropCollision = this.moveAxis(player, world, 1, -STEP_HEIGHT);
    if (dropCollision) {
      player.velocity.x = velocityX;
      player.velocity.z = velocityZ;
      player.onGround = true;
      return true;
    }

    player.position.set(startX, startY, startZ);
    return false;
  }

  private hasGroundSupport(player: Player, world: PhysicsWorld): boolean {
    const minX = Math.floor(player.minX + EPSILON);
    const maxX = Math.floor(player.maxX - EPSILON);
    const minZ = Math.floor(player.minZ + EPSILON);
    const maxZ = Math.floor(player.maxZ - EPSILON);
    const y = Math.floor(player.minY - 0.04);
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (world.isSolidAt(x, y, z)) return true;
      }
    }
    return false;
  }

  private collides(player: Player, world: PhysicsWorld): boolean {
    const minX = Math.floor(player.minX + EPSILON);
    const maxX = Math.floor(player.maxX - EPSILON);
    const minY = Math.floor(player.minY + EPSILON);
    const maxY = Math.floor(player.maxY - EPSILON);
    const minZ = Math.floor(player.minZ + EPSILON);
    const maxZ = Math.floor(player.maxZ - EPSILON);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (world.isSolidAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }
}
