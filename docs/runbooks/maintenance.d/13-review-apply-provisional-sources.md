## 13. `review-apply-provisional-sources`

**Purpose**: apply an operator-ruled ratification digest for the provisional-sources queue (`sources`
WHERE `status='provisional'`, 911 rows [CONFIRMED, live SQL, 2026-09-04]). section 6's digest builder groups
these by officialness tier × reachability bucket and recommends `keep`/`suspend`/`skip`; this step turns
an operator's `decision` on every group into the matching `sources.status` write. Closes
`docs/audits/wiring-audit-2026-09-04/B1-modules.md`'s Gap #1: the apply script has existed, tested, since
Lane R1 (2026-09-02) with zero automated caller - this is the first one.

**Upstream**: `fsi-app/scripts/review/apply-provisional-sources.mjs`'s own `main({rulingPath, apply})`,
called unmodified by `fsi-app/scripts/maintenance/review-apply-provisional-sources.mjs`. The group
decision → patch mapping (`keep`→`status='active'`, `suspend`→`status='suspended'`, `skip`→no mutation)
lives in `scripts/review/lib/provisional-sources.mjs`, imported by the upstream script, never by this
wrapper.

**Ruling**: none by token - gated by the operator's own per-group `decision` field in the ruling JSON
file itself (an unruled group, `decision: null`, refuses the WHOLE file rather than partially applying -
`ruling.mjs`'s `validateRuling`).

**Dispatch**: `arg` **is** the ruling-file path, required in BOTH modes (this queue's dry plan is the
ruled decisions replayed against live rows, not a bare table read - there is no meaningful blank-arg dry
run either, same posture as `reopen-validation-holds`'s own `arg` gate). Resolved relative to the REPO
ROOT (the ratifications tree is one level above `fsi-app/`, where this step's own `working-directory` is
set) - e.g. `arg: docs/ratifications/2026-09/provisional-sources.ruling.json`. Build the ruling file
first via section 6 (`review-digests`, `mode=apply`), then have an operator set `decision` on every group before
dispatching this step. `mode=dry` parses the ruling and reports the upstream script's own per-group plan
(`would_apply` counts) with zero writes; refuses (throws, propagated as a failed run) if the ruling is
malformed or **STALE** (a live row newer than the ruling's own `generated_at` - rebuild the digest and
re-rule). `mode=apply` writes through `guardedUpdateByIds` per group (rule 015), re-applying
`status='provisional'` at write time so a row that already left the queue is silently skipped, never
double-dispositioned.

**Artifact / read back**: `summary.json`'s `plan` (dry) / `applied` (apply, summed across groups) plus
`read_back` - every row named in the ruling file (every group's `row_ids`, deduped), re-read for its
post-write `status`. Confirm against `SELECT id, status FROM sources WHERE id = ANY(<ruling row_ids>)`.

**Registration**: not added to `docs/inventories/shared-dataset-ownership.md`'s enforced JSON
allowlist - `sources` is not a harness/flywheel shared-8 table (the same basis that document's "Open
leaks summary" items 7/8 already state for `institution-canonicalize.mjs`/`provenance-heal.mjs`'s own
`sources` writes); see that doc's new item for this lane's writers.

---

