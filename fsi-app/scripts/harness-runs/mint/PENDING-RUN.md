# Pending run — mint

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates — written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: `sha256:...``). The previous mint marker was
discharged by mint-run-029 (train 37, R-D ratification); this is a fresh one for a single change.

**What changed:** lane DEAD-EXEC (2026-09-04), executing disposition-register row-adjacent cleanup
(`docs/audits/wiring-audit-2026-09-04/`, `docs/plans/unwired-disposition-2026-08-31.md`) plus this repo's
own build-plan instruction to remove the Gate-A single-source collapse's now-pointless indirection layer.
`scripts/mint/lib/gate-a-scan.mjs` and `scripts/mint/lib/gate-a-match.mjs` — pure `export * from
"../../../src/lib/agent/gate-a-{scan,match}.mjs"` re-export shims added by the Gate-A single-source
collapse (the Gate-A single-source collapse, 2026-09-03; see the discharged marker history in git) — were DELETED outright: nothing needed the indirection any more.
Their one production importer, `scripts/mint/validate-mint-payload.mjs` (`scanBrief`), and their one test
importer, `src/lib/intake/record-facts.npmtest.mjs` (`extractFactualTokens`, `containsToken`), now both
import `src/lib/agent/gate-a-scan.mjs` / `gate-a-match.mjs` directly — the exact same two files F28's
`GOVERNING_FILES.mint` already named, so the SET of files this family hashes is
unchanged in substance; only the two now-redundant shim paths were removed from the list (12 → 10 entries
now:
`scripts/mint/MINT-RUNBOOK.md`, `scripts/mint/validate-mint-payload.mjs`, `scripts/mint/payload-schema.json`,
`scripts/mint/item-type-required-slots.json`, `src/lib/agent/gate-a-scan.mjs`, `src/lib/agent/gate-a-match.mjs`,
`scripts/mint/lib/canonicalize-citation-url.mjs`, `src/lib/intake/record-facts.mjs` — 8 files). `governing-files.mjs`
(THE single source `scripts/harness-runs/governing-files.mjs`, Wave GOV-SINGLE) had its own `GOVERNING_FILES.mint`
array edited to drop the two shim entries; `scripts/harness-runs/CONVENTION.md`'s `mint` table row and
`scripts/mint/MINT-RUNBOOK.md`'s "Keeping the kit in sync" section were both updated to match (no more
RE-EXPORT framing — direct import, shims gone). `payload-schema.json`, `item-type-required-slots.json`, and
`scripts/mint/lib/canonicalize-citation-url.mjs` are UNCHANGED by this lane.

Because `governing-files.mjs` is itself one of `meta-harness`'s own `GOVERNING_FILES` entries, this same
edit also moves the `meta-harness` family's own `harness_version` — see
`scripts/harness-runs/meta-harness/PENDING-RUN.md`, re-pinned the same commit this file lands in.

**harness_version at write time:** `sha256:79d41d6130773f0a`

**The planned run that supersedes THIS marker:** the next `population-turn` dispatch (or a direct
`validate-mint-payload.mjs` / mint-kit run) under this landed code — its artifact's own recorded
`harness_version` should read this hash; nothing about `scanBrief`/`extractFactualTokens`/`containsToken`'s
OUTPUT changed (same two `src/lib/agent/` bodies, called directly instead of through a pass-through
re-export), so no behavioral defect is expected to surface, only the marker's discharge. Per F28's
reverse-audit, this marker is deleted the moment a run artifact lands with `harness_version` matching the
hash above (or re-pinned to a new hash, per rule (c), if a governing file changes again before that run
lands).
