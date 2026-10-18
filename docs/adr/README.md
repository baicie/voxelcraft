# Architecture Decision Records

| ADR | Decision | Status |
|---|---|---|
| [001](001-stable-ids.md) | Stable namespaced IDs at persistence boundaries; numeric IDs in hot loops | accepted |
| [002](002-fixed-timestep.md) | Fixed 1/60 s simulation tick | accepted |
| [003](003-atomic-commands.md) | Inventory/world mutations via validated commands and revisioned commits | accepted |
| [004](004-save-v2-migration.md) | IndexedDB Schema V2 with explicit V1 migration and batched saves | accepted |
| [005](005-worker-epoch-revision.md) | Worker results validated by worldId + epoch + revision | accepted |
| [006](006-small-domain-model.md) | No ECS/fluid/multiplayer in V0.2; small domain modules | accepted |
| [007](007-v02-survival-scope.md) | V0.2 gates on tree→iron-pickaxe loop and conservation | accepted |
