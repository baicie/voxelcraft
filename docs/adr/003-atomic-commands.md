# ADR-003: Atomic Inventory and World Commands

## Context

Inventory, placement, crafting and furnace transfers can create or duplicate
items if validation and mutation are spread across UI code and World APIs.

## Decision

- UI never mutates inventory arrays or chunks directly.
- Every transfer validates source, destination, stack compatibility, capacity
  and revision before committing.
- Placement checks target replacement/collision and inventory availability,
  then commits block and item consumption as one operation. Failure leaves both
  unchanged.
- Crafting results consume the exact matched ingredients and insert the result
  atomically; output capacity is checked first.
- Furnace take/put validates the target slot and capacity before mutating.
- Inventory state carries a monotonically increasing revision. Stale prepared
  operations are rejected.

## Consequences

- Slight additional copying/validation cost.
- Quantity-conservation tests can exercise all failure paths.
- UI can remain a thin renderer over state snapshots.

Status: accepted.
