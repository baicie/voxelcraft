# VoxelCraft V0.2 — Phase 0 Architecture Audit

Date: 2026-10-18  
Auditor: DS4.1 / DSH coding agent  
Scope: current repository at `D:\workspace\wodeshijie` (V0.1 delivery) against
`docs/design/VoxelCraft_完整技术设计_V0.2-V1.0.md` and
`docs/design/DS4.1_执行提示词.md`.

## 1. Method and evidence

- Read the actual source tree (45 source files), `package.json`, `README.md`,
  `TODO.md`, unit/E2E tests and the persistence layer.
- Ran the baseline commands listed in `docs/verification/v0.1-baseline.md`.
- Did not silently trust the earlier delivery report. The baseline numbers were
  re-used only where this session's command output was available.
- No user world data was exported or deleted. V1 fixtures under
  `tests/fixtures/v1-worlds/` are synthetic, schema-accurate fixtures created
  for migration tests.
- Browser verification was previously run with a real Chromium/Chrome instance
  using GPU ANGLE/D3D11. It was not a visual-only claim.

## 2. Actual V0.1 architecture

| Area | Actual implementation | Design expectation | Gap / risk |
|---|---|---|---|
| Block identity | Numeric `BlockId` enum, static `BLOCK_DEFS`, short string keys | Stable namespaced Block/Item/Entity IDs | P0: storage uses numeric block IDs; must add stable mapping and migration |
| Item identity | No item domain; fixed creative hotbar of `BlockId` | Independent ItemId registry, stacks, durability | P0: entire item/inventory layer absent |
| Entity identity | None | EntityTypeId + ItemEntity and persistence | P0: absent |
| Inventory | None; creative placement is infinite | 36 slots, atomic revisioned transactions | P0: absent |
| Crafting | None | 2×2 / 3×3 recipes, atomic result take | P0: absent |
| Furnace | None | BlockEntity state, fuel/time, persistence | P0: absent |
| Block behaviors | `solid/opaque/hardness/breakable` | Required tool, tier, loot, replaceability, block entity | Partial: hardness exists, tool/loot metadata absent |
| World gen | Seed+chunk deterministic, coal ore, caves; no generator version | GeneratorVersion with V1 stability | P0: adding iron ore can alter old worlds unless versioned |
| Worker timing | One worker pool; pending map; disposed check | worldId+epoch+revision cancellation | P0: no epoch/revision token; stale result guard incomplete |
| Chunk coordinates | Mesh local vertices + one mesh origin now; regression test exists | local coords, negative floor division | Fixed earlier in V0.1; keep regression. Negative chunk bounds need more tests |
| Storage | DB v1: `worlds` and `chunkEdits` stores; player inside world record | V2 stores + migration + save transaction | P0: no players/blockEntities/entities/saveMeta, no migration chain, non-batched save |
| Timing | Variable-delta GameLoop capped at 50 ms | fixed 1/60 simulation tick + render interpolation | P0: not fixed-step yet |
| Input contexts | Single global Input; pointer lock; ESC pause | world/inventory/crafting/furnace/menu contexts | P0: inventory/container contexts absent |
| UI | Menu/loading/HUD/hotbar/pause/settings | + Inventory 2×2, table 3×3, furnace UI | P0: absent |
| Tests | 33 Vitest tests, 1 Playwright E2E | Existing baseline remains green; new tests per phase | Good baseline; no inventory/migration/tool tests yet |

Relevant source files inspected: `src/world/*`, `src/player/*`, `src/app/Game.ts`,
`src/app/GameApp.ts`, `src/persistence/WorldStorage.ts`, `src/ui/*`,
`src/rendering/*`, `src/workers/*`, `tests/*`.

## 3. Confirmed positive properties

- No per-block `THREE.Mesh`; chunks are batched BufferGeometry with three render
  layers and frustum culling.
- Chunk mesh vertices are local and the chunk origin is applied exactly once.
  `ChunkMesher` regression test exists.
- World edits are applied after generation and survive unload/reload.
- Resource ownership for geometry/material/atlas/worker/renderer is explicit.
- Pointer Lock pause and save/reload work in Chromium E2E.
- `npm run verify` currently passes.

## 4. Blocking issues to address in V0.2

1. **Stable IDs and migration**: numeric block IDs cannot be the V2 save
   protocol. Add namespaced IDs, runtime mapping, and explicit V1 numeric→string
   conversion.
2. **Domain separation**: Block/Item/Entity must not be aliases. Add ItemRegistry
   and ItemStack, then make inventory, crafting, loot and furnace use ItemIds.
3. **Atomic operations**: placement, inventory moves, crafting and furnace
   take/put must validate then commit with revision checks. No UI direct array
   mutation.
4. **Worker result staleness**: add worldId + epoch + revision checks before
   applying generated chunks.
5. **Fixed timestep**: drive player physics, mining, item entities and furnace
   ticks from fixed 1/60 steps in the V0.2 runtime.
6. **V1 compatibility**: old worlds default to creative and generatorVersion 1;
   never rewrite/delete V1 data in place without recoverable migration status.
7. **Input context arbitration**: inventory/table/furnace need pointer-lock
   release and must not trigger gameplay mouse buttons/keys.
8. **Item entity lifecycle**: partial pickup must leave the remainder in world;
   furnace contents and inventory must be conserved on close/break/save.

## 5. Implementation decisions for V0.2

- Keep the runtime numeric `BlockId` for hot loops; add stable string IDs for
  persistence and registry boundaries. The mapping is explicit and tested.
- Add `survival` to `WorldRecord`; V1 records are normalized to
  `mode='creative'`, `generatorVersion=1`.
- New worlds use `schemaVersion=2`, `mode` chosen by the player, and
  `generatorVersion=2` (iron ore enabled). Old worlds use version 1 generation.
- Use one InventoryService with pure-ish snapshots and a revision; UI dispatches
  commands through Game/App, not direct mutation.
- Use a small `EntityWorld` for item drops (not ECS).
- Store furnace states in a block-entity map owned by the session/world. Tick
  while the game is running; preserve progress on save. V0.2 does not simulate
  offline furnace time beyond saved progress.
- V2 saves use a single IndexedDB `readwrite` transaction for world, player,
  chunk deltas, block entities and entities.

## 6. Out of scope for this iteration

Health/hunger/combat/AI/biomes/fluid simulation/multiplayer/LOD/ECS/mesh worker.
These remain follow-up tasks in `TODO.md`.

## 7. Known limitations to disclose at release

- V1 user worlds could not be exported from the user's browser in this session;
  compatibility is validated against three synthetic V1 fixtures and unit tests.
  A real V1 world should be opened manually before release.
- E2E automation can simulate Pointer Lock relative movement but cannot
  reproduce physical mouse feel/audio. Manual checks remain required.
- No 60-minute soak test in this iteration; only short performance baseline.
