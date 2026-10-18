# ADR-002: Fixed Simulation Timestep

## Context

V0.1 uses a variable render delta for physics and mining. This makes jump,
collision and mining timing device-dependent and complicates deterministic
tests.

## Decision

- Simulation runs at a fixed 1/60 s step with an accumulator.
- One render frame may run at most five fixed steps; excess time is dropped and
  recorded (`simulationDroppedMs`).
- Rendering continues via requestAnimationFrame.
- Pausing and container UI freeze player physics/mining. Furnace logic may run
  on the fixed simulation tick when the world is active.

## Consequences

- Tests can call fixed steps directly without real time.
- Player motion and mining remain stable across frame rates.
- UI input deltas are consumed by the first fixed step in a frame.

Status: accepted.
