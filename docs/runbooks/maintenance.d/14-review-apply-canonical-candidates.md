## 14. `review-apply-canonical-candidates`

**Purpose**: apply an operator-ruled ratification digest for the canonical-candidates queue
(`canonical_source_candidates` WHERE `decision='pending'`, 27 rows `[CONFIRMED, live SQL,
2026-09-04]` - see section 6 for the correction to this count). section 6's digest builder groups these by
host of `candidate_url` × `issue_classification` and recommends `accept`/`reject`/`skip`; this step turns
an operator's `decision` on every group into the matching write(s). The one queue of the four whose
"accept" path touches TWO tables - see below.

**Upstream**: `fsi-app/scripts/review/apply-canonical-candidates.mjs`'s own `main({rulingPath, apply})`,
called unmodified by `fsi-app/scripts/maintenance/review-apply-canonical-candidates.mjs`. `reject` →
`canonical_source_candidates.decision='rejected'` only. `accept` is TWO-PHASE (upstream script's own
header): a candidate whose `candidate_url` ALREADY canonically matches a registered `sources` row gets
`canonical_source_candidates.decision='approved'` + `promoted_to_source_id` **and**
`intelligence_items.source_id`/`source_url` repointed to it (both writes, matching the product's own
`/admin/canonical-sources/decide` approve flow); a candidate needing a genuinely NEW source (no existing
registry match) is left untouched and reported under `needs_individual_review` - this digest never
invents a tier, routing that case through the existing `/admin` UI instead, the same fallback
`bulk-approve/route.ts` already uses.

**Ruling**: none by token - same per-group `decision`-field gate as section 13.

**Sequence (updated, lane CANONICAL-AUTOVERIFY, 2026-09-06)**: build digest (section 6, `review-digests`) →
operator group ruling on this step → **section 38 `canonical-autoverify`, `mode=apply`** - a group this digest
routed to `needs_individual_review` (section 6's own recommendation now reads `auto-verify`, not `uncertain`,
for exactly this reason) is what section 38 exists to resolve without waiting on an operator's individual
per-row click; this step keeps applying group rulings an operator HAS already taken, it just no longer is
the only path a "needs a new source" row can take.

**Dispatch**: `arg` is the ruling-file path, required in BOTH modes, resolved the same way as section 13 -
e.g. `arg: docs/ratifications/2026-09/canonical-candidates.ruling.json`. `mode=dry` reports the plan
(`would_apply`/`would_review` per accept group, `would_apply` per reject group) plus
`needs_individual_review` (candidates an "accept" group named that this digest cannot auto-resolve);
writes nothing. `mode=apply` writes through `guardedUpdateByIds` (rule 015) on both tables for a
resolvable accept, on `canonical_source_candidates` alone for a reject.

**Artifact / read back**: `summary.json`'s `plan` / `needs_individual_review` (dry) and `applied` (apply,
summed across groups) plus a **two-table** `read_back`: every candidate row named in the ruling
(`candidates_named_in_ruling`/`candidates_now_live`, columns `id,decision,promoted_to_source_id,
intelligence_item_id`), and - chained off `intelligence_item_id` for every `approved` candidate only -
the `intelligence_items` rows it repointed (`repointed_items_checked`, columns `id,source_id,
source_url`). Confirm against `SELECT id, decision, promoted_to_source_id FROM
canonical_source_candidates WHERE id = ANY(<ruling row_ids>)` and, for the repointed items, `SELECT id,
source_id, source_url FROM intelligence_items WHERE id = ANY(<their intelligence_item_id values>)`.

**Registration**: `canonical_source_candidates` is not a harness/flywheel shared-8 table (same basis as
section 13); `intelligence_items` **is** one - see `docs/inventories/shared-dataset-ownership.md`'s
`intelligence_items` array, which this lane adds `scripts/review/apply-canonical-candidates.mjs` to.

---

