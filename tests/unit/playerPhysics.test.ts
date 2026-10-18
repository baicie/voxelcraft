import { describe, expect, it } from 'vitest';
import { Player } from '../../src/player/Player';
import { PlayerPhysics, type PhysicsWorld } from '../../src/player/PlayerPhysics';
import { BlockId } from '../../src/world/BlockRegistry';

class TestWorld implements PhysicsWorld {
  readonly solids = new Set<string>();

  setSolid(x: number, y: number, z: number): void {
    this.solids.add(`${x},${y},${z}`);
  }

  getBlock(x: number, y: number, z: number): BlockId {
    return this.solids.has(`${x},${y},${z}`) ? BlockId.Stone : BlockId.Air;
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    return this.solids.has(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`);
  }
}

function createFloor(world: TestWorld, radius = 6, y = 0): void {
  for (let x = -radius; x <= radius; x++) {
    for (let z = -radius; z <= radius; z++) world.setSolid(x, y, z);
  }
}

const physics = new PlayerPhysics();

function simulate(player: Player, world: TestWorld, frames: number, jumpHeld = false, dt = 1 / 60): void {
  for (let i = 0; i < frames; i++) {
    physics.step(player, world, dt, { jumpHeld, sneak: false, flying: false });
  }
}

describe('PlayerPhysics', () => {
  it('falls and lands exactly on a block surface', () => {
    const world = new TestWorld();
    createFloor(world);
    const player = new Player();
    player.teleport(0.5, 5, 0.5);

    simulate(player, world, 240);

    expect(player.position.y).toBeCloseTo(1.00001, 3);
    expect(player.onGround).toBe(true);
    expect(player.velocity.y).toBe(0);
  });

  it('cannot walk through a wall or tunnel at high speed', () => {
    const world = new TestWorld();
    createFloor(world);
    world.setSolid(2, 1, 0);
    world.setSolid(2, 2, 0);
    world.setSolid(2, 1, 1);
    world.setSolid(2, 2, 1);
    const player = new Player();
    player.teleport(0.5, 1.00002, 0.5);
    player.velocity.x = 60;

    for (let i = 0; i < 30; i++) {
      physics.step(player, world, 0.05, { jumpHeld: false, sneak: false, flying: false });
    }

    expect(player.position.x).toBeLessThanOrEqual(2 - 0.3 + 1e-4);
    expect(player.position.x).toBeGreaterThan(1.6);
  });

  it('stops upward motion when hitting a ceiling', () => {
    const world = new TestWorld();
    createFloor(world);
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) world.setSolid(x, 3, z);
    }
    const player = new Player();
    player.teleport(0.5, 1.00002, 0.5);
    player.onGround = true;

    simulate(player, world, 30, true);

    expect(player.position.y).toBeLessThanOrEqual(3 - 1.8 + 1e-4);
    expect(player.velocity.y).toBeLessThanOrEqual(0);
  });

  it('jumps and returns to the ground', () => {
    const world = new TestWorld();
    createFloor(world);
    const player = new Player();
    player.teleport(0.5, 1.00002, 0.5);
    player.onGround = true;

    physics.step(player, world, 1 / 60, { jumpHeld: true, sneak: false, flying: false });
    const afterJump = player.position.y;
    expect(afterJump).toBeGreaterThan(1.05);

    simulate(player, world, 180);
    expect(player.position.y).toBeCloseTo(1.00001, 3);
    expect(player.onGround).toBe(true);
  });

  it('keeps the player above the floor while moving on the surface', () => {
    const world = new TestWorld();
    createFloor(world, 10);
    const player = new Player();
    player.teleport(0.5, 1.00002, 0.5);
    player.velocity.x = 4;
    player.velocity.z = 2;

    simulate(player, world, 90);
    expect(player.position.y).toBeGreaterThanOrEqual(1 - 1e-3);
    expect(player.onGround).toBe(true);
  });
});
