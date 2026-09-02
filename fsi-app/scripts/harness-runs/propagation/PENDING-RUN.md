# Pending run — propagation

F28 rule (b) (first-run acknowledgment, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`):
the `propagation` harness family is registered (`scripts/lib/run-artifact.mjs`'s `ALLOWED_FAMILIES`, F28's
`GOVERNING_FILES.propagation`, `scripts/harness-runs/CONVENTION.md`'s `harness_version` table) but has
never actually run — no `propagation-run-NNN.json` exists yet. This marker is that acknowledgment, per
rule (b)'s own escape hatch (mirrors `scripts/harness-runs/source-sweep/`'s own first-run marker, since
that family shipped under the identical constraint).

**What was built (lane DP-ENGINE, 2026-09-02, system-completion train):** migrations 284-287 (propagation
outbox + trigger, the derivation DAG + `derived_values` + `invalidate_dependents()`/`effective_confidence()`/
`register_derived_value()`, statutory/estimate isolation + `assert_statutory_purity()`, sensitive-aggregate
safeguards + `publish_aggregate()`) — each verified against a local scratch Postgres instance (its own
embedded self-check `DO` block proven live, not merely inspected). `src/lib/propagation/` — `types.ts`,
`effective-confidence.mjs`, `admissible-for.ts` (the pollution barrier, spec §3.3), `register-derivation.ts`
(the atomic value+edges RPC caller), `methods/index.ts` (the `registerMethod`/`METHODS` seam — zero methods
registered by this lane; DP-SURF and later lanes register their own), and `drain.ts` (the governed
invalidate-then-recompute driver) — every one unit-tested (`node --test`, zero npm dependency, Node-native
TS type-stripping) against fixtures and hand-rolled fake Supabase clients, never a live database. This
driver, `run-propagation-drain.mjs`, is the runtime `drain.ts` never had before this lane.

**Why this is not itself a propagation run:** this lane has no live Supabase project credentials and no
`propagation_events` queue with real backlog to drain (the tables migrations 284-287 create hold zero rows
by design — each migration's own self-check proves this and cleans up after itself). Every proof above is
against a local scratch database or an in-memory fake client, never the project's actual Postgres instance
— genuinely different from "ran for real and produced zero events."

**harness_version at write time:** `sha256:5c6afa98c8031239`

**The planned run that supersedes this marker:** the first invocation of
`scripts/turns/run-propagation-drain.mjs --mode apply` against the live project once migrations 284-287
are applied there and at least one governed dispatch of `.github/workflows/propagation-drain.yml` runs
against real `propagation_events` traffic (emitted by the outbox triggers migration 284/285/286 attach to
`emission_factors`/`market_series`/`regional_data_facts`/`derived_values`/`statutory_computations`/
`estimated_values`). That run's artifact re-hashes to this value (assuming no further edit to the three
governing files above lands first) and writes `propagation-run-001.json`, at which point this marker is
stale-by-match and must be deleted per F28's reverse-audit.
