## 27. `screen-worklist`

**Documentation gap closed, Lane W71-WIRE, 2026-09-05** (plan section W7.1). Written from
`scripts/mint/screen-worklist.mjs`'s own header. B1 classifies this WIRED already (manual-only,
artifact-proven - `scripts/harness-runs/screen/screen-run-{001,002,003}.json`), but the mechanical
graph+workflow check cannot see hand-run evidence; this step gives it a CI dispatch root without changing
what it does.

**Purpose**: the $0, rule-based relevance re-screen (`screen-rules.mjs`) against a JSON dump of
`census_worklist` rows. No DB access, no network - reads one input file the coordinator exported,
classifies every row with `classifyRelevance()`, writes a results JSON + human-readable summary, and (per
Wave MH-2) its own `scripts/harness-runs/screen/` run artifact as part of the same execution path.

**What it does NOT do**: never talks to Supabase itself (MINT-RUNBOOK.md's $0/no-DB-writes-from-a-mint-
lane rule) - the coordinator exports the census dump and applies this script's recommended dispositions
separately.

**Upstream**: `scripts/mint/screen-rules.mjs` (`classifyRelevance`), `scripts/lib/run-artifact.mjs`
(`writeRunArtifact`).

**Ruling**: none by token - the rule engine's on/off-vertical/ambiguous verdicts are the standing
mechanism (MINT-RUNBOOK.md), not a per-dispatch ruling.

**Dispatch**: `arg` IS REQUIRED (both modes - there is no DB-side "dry" concept here since the script
never touches Supabase) and is the repo-relative path to a COORDINATOR-COMMITTED census-worklist dump
JSON (this step never calls `export-census-rows.mjs` itself). `--out-dir`/`--harness-runs-dir` point
INSIDE this run's own `$OUT_ROOT` (never the live repo tree), so results/summary/harness-run artifacts
land ONLY as this run's uploaded GitHub Actions artifact.

**Artifact / read back**: `$OUT_ROOT/screen-worklist/` holds `<basename>.screen-results.json`,
`<basename>.screen-summary.md`, and `harness-runs/screen-run-NNN.json` - all three uploaded as this run's
artifact. **The coordinator must download this run's artifact and commit `screen-run-NNN.json` into
`scripts/harness-runs/screen/` by hand afterward** (mirroring the existing manual-hand-run workflow, now
CI-dispatched instead of locally shelled) - this step does not commit anything itself.

---

