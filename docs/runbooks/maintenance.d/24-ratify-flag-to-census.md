## 24. `ratify-flag-to-census`

**Documentation gap closed, Lane W71-WIRE, 2026-09-05** (plan section W7.1; F25 allowlist entry removed).
Written from `scripts/connections/ratify-flag-to-census.mjs`'s own header. **CORRECTS a stale claim in
`docs/inventories/shared-dataset-ownership.md`**: that document previously flagged this script
"pre-registered (parallel lane) - not yet present" against `census_worklist`/`integrity_flags` with two
open TO-VERIFYs (which `created_by` namespace it consumes; whether it satisfies `census_worklist`'s
`(lane, created_by)` identity-preservation rule). Both resolved by reading the script end to end (see the
doc's corrected entries): it consumes ANY namespace (gated on a `ratify:census` marker an operator adds
by hand, not a fixed `created_by`), and it does not touch the identity-preservation path at all - a
ratified flag mints a brand-new `census_worklist` identity (`created_by: "flywheel-ratified:<flagId>"`),
never claiming to be a continuation of an existing discoverer's row.

**Purpose**: the flywheel-to-harness feed. Given `--flag <id>`, requires the `integrity_flags` row to be
operator-resolved (`status='resolved'`, `resolved_by` set) with `resolution_note` carrying the
`ratify:census` marker plus `source_id=<uuid> url=<document-url>` (format in the script's own header),
and idempotently creates a `census_worklist` row (skip-if-exists on `(source_id, document_url)`) so the
operator's own mid-investigation document discovery enters the same gap-census pipeline (migration 221)
real census producers feed.

**What it does NOT do**: it is not an automatic resolver for any specific flag namespace - see
`docs/inventories/shared-dataset-ownership.md`'s corrected "Open leaks summary" item 1: it does NOT close
the `intake-seek-study`/`intake-relevance` open leaks, since neither namespace's flags carry a document
url an operator could cite without doing the marker-authoring work by hand regardless.

**Upstream**: none beyond `scripts/lib/db.mjs`'s `guardedInsert` - the decision logic
(`parseRatificationNote`/`evaluateRatification`/`buildCensusRow`) is pure, unit-tested without a DB.

**Ruling**: none by token beyond the marker convention itself (an operator-authored `resolution_note`,
not a ruling requiring a separate citation).

**Dispatch**: `arg` IS REQUIRED (both modes) - the `integrity_flags` id to ratify. `mode=dry` (default
`--dry`) computes + reports the would-be `census_worklist` row, writing nothing. `mode=apply` adds
`--execute`, inserting via `guardedInsert` (rule 015).

**Artifact / read back**: this step's own console output. Confirm against `SELECT id, source_id,
document_url, created_by FROM census_worklist WHERE created_by LIKE 'flywheel-ratified:%'`.

---

