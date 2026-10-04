## 4b. `derive-obligations`

**Purpose**: populate `obligations` (migration 290, applied 2026-09-03) from `item_forward_events`: one
register row per dated forward event, carrying the parent item's jurisdiction, canonical modes and a
deterministically classified `binding_position` (NULL when the spec-01 section 1 table does not name the
instrument). Read by `/regulations` (ObligationRegister).

**Upstream**: `fsi-app/scripts/obligations/derive-obligations.mjs` (Lane OBLIG); classifier
`src/lib/obligations/classify-binding-position.mjs`. Idempotent on `forward_event_id`.

**Ruling**: none.

**Dispatch**: `mode=dry` prints forward events, derived, already registered, to insert, and the
binding-position breakdown. `mode=apply` inserts through `guardedInsertMany` and reads back the register.

**Artifact / read back**: `summary.json`'s `read_back.obligations_total` / `by_binding_position` against
`SELECT binding_position, count(*) FROM obligations GROUP BY 1`.

---

