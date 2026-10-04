## 39. `remediate-orphan-sources`

**New this runbook, lane F25-WAVE52, 2026-09-07** (F25 module-liveness expiry-52 disposition -
`docs/audits/f25-wave52-dispositions-2026-09-07.md`). Written from
`scripts/verify/remediate-orphan-sources.mjs`'s own header.

**Purpose**: the REMEDIATION half of invariant SC-2-source-registration
(`.discipline/governance/invariants.mjs`): a source-not-item item is registered as a scannable source,
never archived-without-registration. `rule:019` (commit-time) and `migration:135` (DB guard) stop NEW
orphans; `scripts/verify/orphan-source-audit.mjs` (wired into the data-audit lane, `.github/workflows/
data-audit-lane.yml` - a different workflow from this one) DETECTS pre-existing orphans; this step FIXES
them: (A) registers the host of a source-y archived item whose host is not yet an active registered
source (`base_tier` by institutional type, operator-overridable, honest T4 default for an ambiguous
host), (B) `reclassifyToSource` for the mis-labeled `source_not_item` portals whose host is already
registered. Both through the guarded `db.mjs` path (snapshotted, cited).

**What it does NOT do**: never guesses an institutional tier outside its own `classify()` table's
patterns (falls back to the honest T4 default); halts a batch on the first write failure rather than
continuing past an unverified registration (per-step verification).

**Ruling**: none by token - a standing remediation pass over whatever the live orphan population is each
time it runs, per the invariant's own residual note ("orphan-source-audit ... must reach 0 to clear
pre-existing orphans").

**Dispatch**: `mode=dry` reports the orphan population and the tier/role each would get, writes nothing.
`mode=apply` registers/reclassifies each orphan through the guarded path with a read-back verify.
`arg=<N>` bounds a batch via the target script's own `--limit=N` (omit for the full unbounded
population).

**Artifact / read back**: `summary.json` under `$OUT_ROOT/remediate-orphan-sources/` (`orphans_found`,
and - apply only - `registered`/`failed`). Confirm against `scripts/verify/orphan-source-audit.mjs`'s own
next run (the detector this step feeds) trending toward 0.

**First dispatch** (coordinator): `mode=dry`, `step=remediate-orphan-sources`, no `arg` - the full
population report (no write) to see the real orphan count and proposed tiers before any apply.

---

