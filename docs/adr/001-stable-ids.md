# ADR-001: Stable Namespaced IDs

## Context

V0.1 stores block IDs as runtime enum numbers. V0.2 adds items and entities.
Using array indices or enum numbers in saves makes reordering and migration
unsafe.

## Decision

- Persist blocks, items and entity types with namespaced strings such as
  `base:oak_log`.
- Keep compact numeric `BlockId` values internally for chunk arrays and hot
  loops.
- Maintain an explicit, tested bidirectional block mapping.
- Items and entity types use string IDs directly; they are never aliases of
  numeric runtime values.
- Unknown IDs on load are surfaced as diagnostics/placeholder state, never
  silently converted to air and written back.

## Consequences

- Saves are readable and migratable.
- All boundary conversions need validation.
- V1 numeric chunk edits require an explicit migration map.

## Alternatives considered

- Use enum numbers in V2 saves: rejected, unsafe under registry changes.
- Use strings in chunk arrays: rejected, allocation/lookup cost in meshing and
  collision hot paths.

Status: accepted.
