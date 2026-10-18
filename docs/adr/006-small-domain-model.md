# ADR-006: Small Domain Model for V0.2

## Context

V0.2 needs inventory, drops, mining, crafting and furnace logic. A large ECS,
fluid engine or multiplayer runtime would overwhelm the release scope.

## Decision

- Add focused modules: `items`, `inventory`, `crafting`, `mining`, `entities`,
  `furnace`, with pure functions/classes and explicit dependencies.
- Use a small `EntityWorld` for item drops, not an ECS framework.
- Keep `World` limited to voxel access, chunk streaming and chunk deltas.
- Defer fluid simulation, AI, combat, biomes, mesh worker and multiplayer.

## Consequences

- Easier testing and incremental integration.
- Some future entity types will require a more general entity layer; interfaces
  should allow later extraction.

Status: accepted.
