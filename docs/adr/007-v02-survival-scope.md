# ADR-007: V0.2 Survival Scope

## Context

V0.2 must deliver a vertical slice, not a partial catalog of features.

## Decision

The release gate is one repeatable loop:

`oak log → planks/sticks → crafting table → wooden pickaxe → cobblestone →
stone pickaxe + furnace → coal + iron ore → raw iron → iron ingot → iron
pickaxe`, followed by save/exit/reload with conserved quantities.

Creative mode and V0.1 worlds must keep working. The following are explicitly
out of scope: health/hunger/combat/AI, biomes, structures, fluids, multiplayer,
LOD, mesh Worker, Greedy Meshing.

## Consequences

- Work is prioritized by the vertical slice.
- Design features outside the slice are documented in TODO but not faked.

Status: accepted; implemented in V0.2.0.
