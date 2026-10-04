## 2026-10-04, lane s1b-host-verdicts: unknown hosts decide themselves; machine promotion carries bias tags

### Accomplished
- Host verdict batches: `fsi-app/scripts/maintenance/host-verdicts/` (README, `schema.json`, loader, test, fixture `host-verdicts-000.fixture.json`). Per-entry rejection of an unknown class or a `tier` field, later batch wins, never throws.
- `host-authority.ts`: additive `HOST_CLASS_TIER`, `isKnownHostClass`, `verdictPlacementForHost`, `classTierForHostWithVerdicts` (thin wrapper, `classTierForHost` untouched). Built-in rules run first; `permanentlyUnregisteredClass` hosts never register.
- `resolve-provisional-sources.mjs`: rule b2 (verdict promotes at the class table tier); residue reason "awaiting host verdict batch", exit 0; open `null-tier-host` flag of a verdict-resolved host resolved with a note naming the batch (`buildNullTierHostResolution` in `null-tier-host-worklist.mjs`); `--arg export-unplaced` read-only export; bias tags written through `writeBiasTags` and `guardedInsertMany` on a newly inserted source; `tier_override` guard (`sourcesActivationPatch`).
- `enumerate-unclassified-hosts.mjs`: shared `collectUnresolvedRows` and `buildUnplacedHostExport`; verdict-aware; also writes `unplaced-hosts.json`.
- Bias banding: 0.65 to 0.79 stored as `haiku_auto_high_confidence` with confidence kept. `bias-tags/logic.ts` `checkActionable` now accepts adopted and legacy pending rows (optional override).
- MAINTENANCE-RUNBOOK section 46 updated. F28 pending markers for `carrier-ets-proxy`, `inaccessible-triage`, `state-cost` (host-authority.ts is a governing file of all three).

### Read and reused
Read in full: source-credibility-model SKILL, host-authority.ts, null-tier-host-worklist.mjs, resolve-provisional-sources.mjs (+ test, npmtest), enumerate-unclassified-hosts.mjs (+ test), resolve-cited-host-gate.mjs, promote-provisional.ts, promote route, bias-tag-pipeline.mjs (+ test), bias-tags logic.ts and route.ts, ledger-verdicts README and schema, `discoverVerdictsFiles`, migrations 092 and 097, runbook sections 46 and 46a, `db.mjs` guarded writers. Reused: `groupUnresolvedHosts`, `existingTierForHost`, `buildNullTierHostWrite` flag read path, `writeBiasTags`, `guardedInsertMany`, `guardedUpdate`, the ledger-verdicts numbered-batch idiom.

### Decisions
- Stored value for adopted 0.65 to 0.79 tags is the existing `haiku_auto_high_confidence` (migration 092 CHECK has no other automatic value; migration 097 set the precedent). No migration 351 needed.
- Rejection of a bad verdict entry is per entry and reported, never fatal (no human gate, rule 6).
- Bias tags are not written when the promote reused an existing source (unique key; admin route behaves the same).
- Export mode rides `--arg export-unplaced` (cli.mjs already passes `arg` and `out`); the workflow-dispatchable producer of the same file is the `enumerate-unclassified-hosts` step.

### NOT done
- `ProvisionalReviewCard.tsx` still describes the 0.65 to 0.79 band as proposed on approval, and the header comment of `bias-tags/route.ts` still says only pending rows are actionable; both are outside this lane's write set (stale wording, behaviour is correct).
- No real verdict batch authored; no live run; no workflow edit (resolve-provisional-sources has no `--arg` in maintenance.yml, so export mode is CLI-only there).
- Open `null-tier-host` flags for hosts resolved by rules a or b are not closed by this step (only verdict-resolved hosts are).
- Local run limited to the touched test files; CI is the gate.

### Open items
- Coordinator: decide whether to pass `--arg export-unplaced` from maintenance.yml.
