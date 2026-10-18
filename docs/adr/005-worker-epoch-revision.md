# ADR-005: Worker Result Epoch and Revision

## Context

Chunk generation is asynchronous. Switching worlds or invalidating a chunk
while a worker request is in flight can apply stale data.

## Decision

- Each World/ChunkManager has a stable `worldId`, an incrementing `epoch`, and
  a per-chunk request `sequence` (the generation revision).
- Generation requests carry `{seed, generatorVersion, cx, cz}` to the worker;
  the owning manager records `{worldId, epoch, sequence}` with each request.
- Responses are applied only if the manager is alive, the worldId/epoch match,
  and the sequence is still the latest request/not superseded.
- On dispose or world switch the epoch is invalidated and pending results are
  ignored.
- Future mesh/async jobs use the same convention.

## Consequences

- Slightly more bookkeeping.
- Prevents cross-world/old-result contamination and makes race tests possible.

Status: accepted; implemented in V0.2.0.
