# Ratification digests, 2026-09

Four review queues have sat unworked since they were built: 927 `sources` rows stuck at
`status='provisional'`, 331 `canonical_source_candidates` rows pending, 1,457
`portal_link_candidates` rows awaiting disposition, 91 `coverage_gap_candidates` rows with no
disposition. Nobody rules on 2,806 individual rows in one sitting — the queues stayed dead. This
directory is the fix: a **ratification digest** turns each queue into a small number of **groups**,
sized so an operator can rule on the whole queue in minutes, and an **apply script** that turns a
ruling into row mutations through the one guarded write path (`fsi-app/scripts/lib/db.mjs`).

Nothing under `fsi-app/scripts/review/` writes to the database on its own. `build-review-digests.mjs`
only reads. An `apply-*.mjs` script writes only when you pass it `--apply` **and** a ruling file you
edited — never on its own initiative, never without your explicit `decision` on every group.

## Table names: a correction to the brief

The finish plan named this lane's tables in parentheses — `provisional_sources`, `coverage_gaps` — as
a shorthand pointer, not a literal instruction. Reading the live schema (`fsi-app/supabase/migrations/`)
and the counts the plan itself cites (`docs/audits/system-review-2026-09-01.md`,
`docs/ops/session-log.md`) against those two names shows they are the wrong tables:

- **927 provisional sources** is `sources` rows at `status='provisional'`
  (`docs/audits/system-review-2026-09-01.md:29`: "2,561 sources (1,612 active, 927 provisional)").
  The `provisional_sources` table (migration 004) is a *different* discovery queue with its own
  `pending_review`/`confirmed`/`rejected`/`needs_more_data` vocabulary — no `suspended` state, so a
  "suspend" ruling could never be written there, and its row count does not match 927.
- **91 gap dispositions** is `coverage_gap_candidates` rows with `disposition IS NULL` (migration 214,
  extended by migration 273 with the `disposition`/`surface_test`/`data_class`/`discovery_class`/
  `access_model` columns — `disposition` is the exact word the brief uses). `coverage_gaps` (migration
  061) is a two-row, hand-curated Dashboard marketing widget with no status or decision column at all
  and no growth path in the repo.

Every digest module documents this at its own top; this section is the one place that says it once.

## What a digest is

Each queue gets two files, written by `build-review-digests.mjs`:

- `<queue>.digest.md` — human-readable. One section per group: count, the recommended decision, the
  evidence that produced it, and up to three example rows (title + URL).
- `<queue>.ruling.json` — the file you edit. Same groups, machine-shaped:
  ```json
  { "queue": "...", "generated_at": "...", "groups": [
    { "key": "...", "count": 12, "row_ids": ["..."], "recommended_decision": "keep",
      "decision": null, "rationale": null, "evidence": {...}, "examples": [...] }
  ]}
  ```

`recommended_decision` is a **label**, not an instruction — it is the output of an explicit, tested
rule (see each queue's rule below) and is never auto-applied. Nothing is mutated until you set
`decision` on every single group and run the matching apply script with `--apply`.

## How to rule

1. Build the digests (reads only):
   ```
   node fsi-app/scripts/review/build-review-digests.mjs --out docs/ratifications/2026-09
   ```
   Add `--queue <queue-id>` to rebuild one queue only (`provisional-sources`, `canonical-candidates`,
   `portal-links`, `coverage-gaps`).
2. Open `<queue>.digest.md` to read the groups and their evidence.
3. Edit `<queue>.ruling.json`: for every group, set `"decision"` to one of that queue's allowed
   values (below) and, optionally, `"rationale"` (a short note carried into the apply script's audit
   trail — used verbatim as the `disposition_reason`/`surface_test` reason where the queue has one).
   Leaving a group's `decision` as `null` is refused whole by the apply script (`ruling.mjs`'s
   `validateRuling`) — a half-ruled file cannot partially apply.
4. Dry-run the apply script (default; no `--apply`) to see exactly what it would do.
5. Run with `--apply` when the dry-run plan looks right.

If the live queue picked up new rows after the digest was built (a worker discovered more candidates,
another session inserted one), the apply script refuses with a **STALE** error — rebuild the digest and
re-rule rather than applying a ruling that never saw those rows (`ruling.mjs`'s `isRulingStale`, compared
against the live queue's newest relevant timestamp).

## The four queues

### 1. Provisional sources — `sources` WHERE `status = 'provisional'`

- **Grouping**: officialness tier (`src/lib/sources/host-authority.ts`'s `classTierForHost` — the
  deterministic host→tier classifier the registration path uses, not the row's own `base_tier`, which
  defaults to 7 for almost every provisional row) × reachability bucket (derived from the row's own
  `total_checks`/`accessibility_rate`/`status` columns — no network call). Same-institution duplicates
  within a group (`institution-key.mjs`'s identity rule) are surfaced in `evidence`.
- **Recommendation rule** (`lib/provisional-sources.mjs`'s `recommendDisposition`): confirmed-inaccessible
  or unreachable → `suspend`; never-checked → `uncertain` (no accessibility evidence yet); reachable/flaky
  at tier 1/2/4 (legal-primary, government/intergovernmental, verifier/academic/association) → `keep`;
  reachable/flaky at an unclassifiable host → `uncertain` (a relevance call, not a reachability one).
- **Decisions → mutation**: `keep` → `sources.status = 'active'`; `suspend` → `sources.status =
  'suspended'`; `skip` → no mutation.
- **Apply**: `node fsi-app/scripts/review/apply-provisional-sources.mjs --ruling
  docs/ratifications/2026-09/provisional-sources.ruling.json [--apply]`
- **Maintenance step** (intended wiring point; not yet wired — see "What is not done" below):
  `review-apply-provisional-sources`.

### 2. Canonical source candidates — `canonical_source_candidates` WHERE `decision = 'pending'`

- **Grouping**: host of `candidate_url` × `issue_classification` (`stale_url`/`missing_link`/
  `missing_source`/`thin_match`, migration 021's own vocabulary).
- **Recommendation rule** (`lib/canonical-candidates.mjs`'s `recommendGroupDecision`, a GROUP-level
  call): every row in the group already `verified` at `confidence='high'` → `accept`; every row
  unverified → `reject`; a mixed group → `uncertain` (the operator's own per-row review, same as this
  table's existing `/admin/canonical-sources/decide` route already offers).
- **Decisions → mutation**: `reject` → `canonical_source_candidates.decision = 'rejected'`. `accept` is
  **two-phase**: a candidate whose `candidate_url` already canonically matches a registered `sources` row
  gets `canonical_source_candidates.decision = 'approved'` + `promoted_to_source_id` **and**
  `intelligence_items.source_id`/`source_url` repointed to it (both writes, matching the product's own
  approve flow, `decide/route.ts`). A candidate needing a **new** source (no existing registry match) is
  left untouched and reported under `needs_individual_review` — this digest never invents a tier; run it
  through the existing `/admin` canonical-sources UI instead (the same fallback `bulk-approve/route.ts`
  already uses).
- **Apply**: `node fsi-app/scripts/review/apply-canonical-candidates.mjs --ruling
  docs/ratifications/2026-09/canonical-candidates.ruling.json [--apply]`
- **Maintenance step**: `review-apply-canonical-candidates`.

### 3. Portal link candidates — `portal_link_candidates` WHERE `status = 'candidate'`

- **Grouping**: portal host (the *registered source* the link was found on, via `source_id` →
  `sources.url`) × link pattern (which legal-instrument signal token matched the URL/anchor text —
  `gazette_path`/`legislation_path`/`guidance_path`/`compliance_path`/`other`).
- **Recommendation rule** (`lib/portal-links.mjs`'s `recommendLinkDecision`): a gazette or legislation
  signal → `link`; no recognizable signal → `drop`; a guidance/compliance signal → `uncertain`
  (procedural-adjacent, not a strong instrument tell).
- **Decisions → mutation**: `drop` → `status = 'rejected'` + `disposition_reason`/`dispositioned_at`
  (migration 220). `link` → **no mutation**. This is deliberate, not an oversight: `status='promoted'`
  already has an established, narrower meaning elsewhere in the repo —
  `src/lib/intake/portal-harvest.ts`'s `stamp()` writes it only on an actual mint (`item_id` stamped),
  and `scripts/turns/run-ledger-consume.mjs`'s `PROMOTED_LIKE_DISPOSITIONS` treats a `'promoted'` row as
  already done, permanently skipping it. Writing `'promoted'` here (this digest mints nothing) would
  forge that signal and hide `link`-ruled rows from the real consume step
  (`consumePortalCandidates`/`run-ledger-consume.mjs`) forever. So `link` leaves the row at `'candidate'`
  — exactly where that consume step already looks — and the operator's affirmative ruling lives in the
  committed ruling JSON, not in an invented DB state. `drop` is the one real mutation this queue needs: it
  removes chaff from the classify pipeline's cost before that pipeline ever spends on it.
- **Apply**: `node fsi-app/scripts/review/apply-portal-links.mjs --ruling
  docs/ratifications/2026-09/portal-links.ruling.json [--apply]`
- **Maintenance step**: `review-apply-portal-links`.

### 4. Coverage gap candidates — `coverage_gap_candidates` WHERE `disposition IS NULL`

- **Grouping**: `coverage_class` (migration 214's evidence hierarchy: `MISSING` / `AMBIGUOUS_ARCHIVED` /
  `HAVE_QUARANTINED`) × `jurisdiction` × `transport_mode`.
- **Recommendation rule** (`lib/coverage-gaps.mjs`'s `recommendGapDisposition`, straight off migration
  214's own documented evidence hierarchy): `HAVE_QUARANTINED` → `declined` (already in-corpus via the
  drain, not a fresh acquisition target); `AMBIGUOUS_ARCHIVED` → `parked` (depends on the archived-item
  review lane resolving first); `MISSING` → `kept` when `estimated_priority` is `CRITICAL`/`HIGH` (the
  acquisition backlog), else `parked` (a later wave). A `MISSING` group whose rows disagree on priority
  → `uncertain` (the rule cannot call one group verdict).
- **Decisions → mutation**: `kept` → `disposition = 'kept'` (no `surface_test` needed). `declined`/`parked`
  → `disposition` set **and** a uniform `surface_test` JSON (`{regulations, operations, market_intel,
  research, community}`, each `{verdict, reason}`) attached across all five keys — migration 273's
  `coverage_gap_candidates_surface_test_required_check` requires one for any non-null, non-`'kept'`
  disposition, and this queue's gaps are not surface-specific (an instrument's absence isn't scoped to one
  surface), so the group's own rule rationale is the reason recorded on all five.
- **Apply**: `node fsi-app/scripts/review/apply-coverage-gaps.mjs --ruling
  docs/ratifications/2026-09/coverage-gaps.ruling.json [--apply]`
- **Maintenance step**: `review-apply-coverage-gaps`.

## The guarded write path

Every apply script's `--apply` mutation goes through `fsi-app/scripts/lib/db.mjs`'s
`guardedUpdateByIds` — a governing-skill `cite` is required, the matched rows are snapshotted to
`fsi-app/scripts/_snapshots/` before any mutation, the write is chunked (with automatic halving on a
statement-timeout), and the row count is read back and reported. `applyMatch` re-applies each queue's own
filter (e.g. `status='provisional'`) at write time, so a row that already left the queue between "the
digest was built" and "this apply ran" is silently skipped rather than double-dispositioned. No script in
`fsi-app/scripts/review/` constructs its own Supabase write client.

## What is not done by this lane

- **Wiring into `maintenance.yml`.** This lane's write set is `fsi-app/scripts/review/**` and this
  directory only; `.github/workflows/maintenance.yml` belongs to the MAINT lane (same finish-plan wave).
  The step names above (`review-apply-<queue>`) are the intended wiring point — each maps to `node
  fsi-app/scripts/review/apply-<queue>.mjs --ruling <the ruling file> --apply`, run by the coordinator
  once a queue is ruled.
- **Running `build-review-digests.mjs` against the live database.** This lane has no DB credentials —
  every digest above (row counts, table shapes) is read from the schema and the audit/session-log figures
  cited, not generated live. The digest files (`<queue>.digest.md`/`<queue>.ruling.json`) do not exist in
  this directory yet; they appear the first time the coordinator runs the builder.
