## 15. `review-apply-portal-links`

**Purpose**: apply an operator-ruled ratification digest for the portal-links queue
(`portal_link_candidates` WHERE `status='candidate'`, **1,837** rows vs **3** `promoted`
[CONFIRMED, live SQL, 2026-09-04] - the single largest of the four queues, and the one
`docs/audits/wiring-audit-2026-09-04/B1-modules.md`'s Gap #1 names by count). section 6's digest builder groups
these by portal host (the registered source the link was found on) × link pattern (which
legal-instrument signal matched) and recommends `link`/`drop`/`skip`.

**Upstream**: `fsi-app/scripts/review/apply-portal-links.mjs`'s own `main({rulingPath, apply})`, called
unmodified by `fsi-app/scripts/maintenance/review-apply-portal-links.mjs`. `drop` →
`status='rejected'` + `disposition_reason`/`dispositioned_at` (migration 220) - this is the one real
mutation, removing chaff from the classify pipeline's cost before it ever spends on these rows. `link` →
**no mutation** - `status='promoted'` already means "minted, item_id stamped" to
`src/lib/intake/portal-harvest.ts`'s `stamp()` and to `scripts/turns/run-ledger-consume.mjs`'s
`PROMOTED_LIKE_DISPOSITIONS`; writing it here (this digest mints nothing) would forge that signal and
permanently hide these rows from the real consume step. A `link`-ruled row stays `'candidate'` - exactly
where `run-ledger-consume.mjs`'s `consumePortalCandidates` already looks for it - the operator's
affirmative ruling lives in the committed ruling JSON, the audit trail, not an invented DB state.

**Ruling**: none by token - same per-group `decision`-field gate as section 13.

**Dispatch**: `arg` is the ruling-file path, required in BOTH modes, resolved the same way as section 13 - e.g.
`arg: docs/ratifications/2026-09/portal-links.ruling.json`. `mode=dry` reports the upstream script's own
per-group plan; writes nothing. `mode=apply` writes through `guardedUpdateByIds` (rule 015) - only for
`drop`-decided groups; `link`/`skip` groups always report `applied: 0`.

**Artifact / read back**: `summary.json`'s `plan` (dry) / `applied` (apply, summed across groups - will
be 0 whenever every ruled group is `link`/`skip`, which is not a failure) plus `read_back` - every row
named in the ruling, re-read for `status`/`disposition_reason`. Confirm against `SELECT id, status,
disposition_reason FROM portal_link_candidates WHERE id = ANY(<ruling row_ids>)`. This queue's real
progress metric is the **1,837 → fewer `candidate` rows** count over successive `drop`-heavy rulings, not
this step's own `applied` figure alone (a `link` ruling correctly leaves the row `candidate`, awaiting
`run-ledger-consume.mjs`).

**Registration**: not added to the enforced JSON allowlist - `portal_link_candidates` is not a
harness/flywheel shared-8 table (same basis as section 13).

---

