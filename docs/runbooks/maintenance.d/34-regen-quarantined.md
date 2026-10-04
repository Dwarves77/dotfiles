## 34. `regen-quarantined`

**New this runbook, lane ONESHOTS, 2026-09-06** (F25 expiry-52 disposition - the operator-fired script
runners W71-C's own investigation left INVESTIGATED-NOT-RESOLVED, per `docs/plans/complete-system-build-
plan-2026-09-04.md`'s W7.1 ratchet). Written from `scripts/regen-quarantined.mjs`'s own header.

**Purpose**: the Tier-2 snapshot-first restitution resolver (RD-4 research-or-erase). Drives quarantined
items toward `verified` via the ONE `verify-item` entry (RD-24) - never a direct paid re-ground, never a
delete. `.discipline/governance/invariants.mjs` names this the live resolver the enforced invariant
"Quarantine is an open investigation, never terminal" depends on. Per item, `verify-item` reads the
stored snapshot + existing claims and cheap-verifies ($0, no fetch, no model): `verified_cheap` items are
re-validated under `--apply` via the $0 `validate_item_provenance` RPC (the `set_provenance_status`
trigger flips the item iff it now passes the full gate); `stale_flag` / `needs_acquire` items are
reported only - their resolution is the separately-gated Phase-3 paid path, never run from here.
`research_finding`/`technology`/`tool`/`innovation` item types are excluded (Q2 calibration-spec HOLD).

**What it does NOT do**: never fetches, never calls a model, never deletes. Spend is $0 in both modes.

**Upstream**: `src/lib/sources/verify-item.mjs` (decision core), `snapshot-store.mjs`, `freshness-probe.mjs`,
`cheap-verify.mjs` - all called unmodified. The decision loop itself is now `runResolver()`, exported from
the target script and driven unmodified by the wrapper (`scripts/maintenance/regen-quarantined.mjs`).

**Ruling**: none by token - RD-4/RD-24 are standing doctrine, not a per-dispatch ruling gate.

**Dispatch**: `arg`, if given, narrows to a comma-separated `legacy_id`/id-prefix scope (`--only=`); omit
for the full eligible set. `mode=dry` decides and reports, writing nothing. `mode=apply` re-validates
every `verified_cheap` decision via the $0 RPC.

**Artifact / read back**: `summary.json` under this run's `$OUT_ROOT/regen-quarantined/` (counts by
outcome, `applied` = items actually flipped to verified this run). Confirm against `SELECT count(*) FROM
intelligence_items WHERE provenance_status='quarantined' AND is_archived=false` before/after.

**First dispatch** (coordinator): `mode=dry`, `step=regen-quarantined`, no `arg` - a full-scope decision
report with zero writes, to see the live eligible/HOLD/decided split before ever applying.

---

