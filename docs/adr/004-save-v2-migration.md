# ADR-004: Save Schema V2 and Migration

## Context

V0.1 IndexedDB v1 stores world metadata with an embedded player snapshot and
numeric chunk edits. V0.2 adds inventories, block entities, item entities and
stable block IDs.

## Decision

- Upgrade IndexedDB to schema V2 and add stores for players, block entities,
  entities, chunk deltas and save metadata.
- Preserve V1 stores and records. Migration is additive and does not delete old
  data until the new snapshot is written successfully.
- Existing worlds normalize to `mode='creative'`, `generatorVersion=1`,
  `difficulty='peaceful'`, `schemaVersion=2`.
- New worlds write V2 records with stable namespaced IDs.
- Every save writes player, dirty chunks/block entities/entities in one
  readwrite transaction and increments a save sequence.
- Unknown/corrupt data is validated and reported; it is not silently discarded.

## Consequences

- More migration code and tests.
- Old worlds remain playable.
- Rollback is possible because old data is left intact.

Status: accepted.
