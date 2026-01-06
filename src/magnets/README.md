# Magnets

Pure routing primitives. Responsibilities:
- classify incoming signals into lanes
- no mutation, no aggregation, no persistence
- deterministic, side-effect free

Implementors should export pure functions like `routeSignal(signal)` returning `{ lane, payload }`.
