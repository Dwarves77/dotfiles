# Flywheel build plan — concrete units (2026-08-10)

The engineering plan for [recursive-compounding-discovery](./recursive-compounding-discovery-2026-08-10.md)
(the architecture) under its Execution model (operator-cadence, default off, never always-on). Plan
before build, per operating discipline: every unit names its files, its proofs (execution-wired, rule
15), its cost class, and its definition of done. Wave 1 = U0–U3, all $0. U4 optional same wave. U5/U6
specified but gated.

Reuse ledger up front (reuse-before-construction): scorer `src/lib/connections/discover.mjs` and writer
`write-edges.mjs` (built, tested); `surfaceOf` (surface mapping); `workspace/profile.ts` +
`relevance.mjs` (read-time lens); `integrity_flags` category `coverage_gap` + the existing admin Platform
flags queue (L2's entire output surface already exists); `scripts/lib/db.mjs` guarded path;
`detect_intersections` (mig 021) is the v1 this supersedes at the reader step (U3), per the Pillar A
reconciliation.

## U0 — Populate the graph (data step; the gate for everything below)

The corpus backfill has NOT run; the graph is still ~61 edges. On the operator's machine (creds):
`node scripts/connections/backfill-edges.mjs --dry` → review edge/cross-surface/skip counts → run live.
Definition of done: reported counts; `item_cross_references` carries `origin='provenance_discovery'`
rows with basis+score. No code. Everything below clusters NOTHING until this runs.

## U1 — Cluster engine: `src/lib/connections/cluster.mjs` (+ `.test.mjs`) — F1+F2+F3+F4-basic, $0

PURE module (no DB, no LLM), same discipline as discover.mjs. Input: nodes
`{id, item_type, dates?}` + edges `{source, target, score, basis}`; optional `surfaceOf`. Output:
`{themes: [{id, members, dominantSignals, surfaces, density, convergence, pivots}], ...}`.

- **F1 clustering:** weighted label propagation, DETERMINISTIC by construction (stable id-ordered
  iteration, fixed tie-break by lowest label id, bounded rounds). Determinism is load-bearing: the
  flywheel's fixpoint guarantee ("rests on a stable corpus") requires same-input ⇒ same-themes.
- **F2 pivots:** weighted-degree centrality per node; top-k per theme.
- **F3 convergence:** per theme, `surfaceSpan × density × recency` (recency from member dates; absent
  dates degrade gracefully to span×density — never invented).
- **F4-basic trajectory:** members ordered by date/effective-date within a theme (the full
  forward-events version arrives with B1; see U5).
- **Proofs (suite-glob-wired by construction, `src/lib/connections/*.test.mjs`):** two dense components
  → two themes; bridge node scores max centrality; cross-surface theme outranks same-surface at equal
  density; shuffled-input determinism (identical output); empty/degenerate inputs.

## U2 — The operator command: `scripts/connections/analyze-corpus.mjs` + mig `connection_themes` + L2 gaps

"Run the scan" made literal — ONE invocable command, on demand or operator-scheduled, default no
schedule. Loads corpus signatures + edges (readAll), runs cluster.mjs, persists results, detects gaps.

- **DDL (two-track: applies live before the dependent code commits):** `connection_themes`
  (id, computed_at, member_ids uuid[], dominant_signals jsonb, surfaces text[], density real,
  convergence real, pivots jsonb) + `connection_theme_runs` ledger row per pass (started/finished,
  counts, args) so every run is auditable. Derived, recomputable data — each pass replaces prior themes.
- **Writes through the guarded path** (rule 015): guardedDelete of prior themes + guardedInsertMany of
  new, each with a cite; runs ledger via guardedInsert. `--dry` mode; exit 2 without creds; non-gating.
- **L2 gap detection: `src/lib/connections/gaps.mjs` (+ test), PURE.** Input: themes + the workspace
  profile (reuse `profile.ts` jurisdiction/mode expectations). Output: gap candidates — a theme
  spanning EU+IMO with no US member, a theme with research+regulation but no market signal, a pivot
  with no operations counterpart. Each carries its evidence (the cluster shape that implies it).
- **Gap output = `integrity_flags` rows, category `coverage_gap`** — the ENTIRE output surface already
  exists (admin Platform flags queue, status workflow, operator resolution). Dedup before insert:
  stable `subject_ref` key per gap; never re-flag an open or resolved-same-key gap. This closes the
  first feedback loop: the graph's shape produces scan targets the operator triages in an existing UI.
- **Proofs:** gaps.test.mjs (suite-glob); rule-015 lint enforces the write path; the runs-ledger row is
  the execution record.
- **Cadence:** none by default. When the operator says "weekly" or "monthly," a scheduled task is
  created THEN, its charter carrying the STEP-0 halt-row check like every fleet worker.

## U3 — Surface it: `/api/themes` + Themes view (D-class), $0 reads

- Route `GET /api/themes`: requireAuth + rate limit (house pattern), reads `connection_themes` ordered
  by convergence. No compute at read time — the command computed it.
- `ThemesView` component (admin first; customer surface placement decided at D1 with the read-time
  lens): themes ranked by convergence, surface-span badges, pivots, members linking to items;
  `relevanceForItem` composition for the viewer lens. Reuse card/section patterns.
- **detect_intersections supersession lands here** (the ratified reconciliation): re-point
  `IntersectionDetectionView` to persisted edges/themes (richer basis, one scoring home) and retire the
  RPC's scoring — reader-semantics change executed WITH this unit, where consumer queries are in scope.
  Includes the edge-directionality decision (canonicalize vs both-directions) deferred out of the
  rule-015 fix.
- **Proofs:** route auth/shape test; component fixture render. Definition of done: an operator can SEE
  the corpus's themes, pivots, and convergences after running U2 once.

## U4 — L1 incremental discovery at mint (closes the growth loop; optional in wave 1)

In `mint-item.ts`'s post-insert surfacing block (non-fatal, moat-bounded — the block that already
writes the entity edge): load corpus signatures, `discoverConnections(newItem, corpus)`,
`writeDiscoveredEdges` (reuse; origin-aware writer already proven). Per-item bounded (limit 12);
piggybacks the scan's existing clock — no new resident process, per the Execution model.
**Proofs:** planning already unit-proven (discover.test.mjs); add a mint-path test with a fake client
asserting edges land only in `item_cross_references` (the existing moat-boundary test pattern).
After U4, the standalone backfill is only ever a cold-start/repair tool.

## U5 — L3 anticipatory targeting — BLOCKED BY B1, honestly

Full trajectory→anticipatory-find needs forward events, which arrive with the deferred
generation-contract advance (forward-participation, its own PR + regeneration plan). Until then,
F4-basic (U1) orders by dates only. No partial hack that fakes forward events.

## U6 — F5 theme briefs + L4 capability compounding — SPECIFIED, GATED, not wave 1

F5: metered synthesis over a theme's members; behind the budget kill-switch; pilot-first on ONE theme
with measured cost before any batch (fleet-budget-control discipline). L4: recurring-basis patterns
surfaced as candidate scorer signals via `integrity_flags` for ratification — never self-modifying the
scoring SoT. Both need U0–U3 live first; neither ships in wave 1.

## U7 — Contract advance: the skills-consume unit (operator-directed 2026-08-10: "no reason all items
## should not be wired")

The three HIGH/MED gaps from the [skill-vs-runtime delta](../audits/skill-vs-runtime-analysis-delta-2026-08-09.md),
closed in ONE unit, its own PR: (a) role-generic system-prompt correction (the "Workspace profile
(runtime input)" section stops promising a profile that is never fed — profile is READ-TIME, Option B);
(b) forward-participation pathway into the contract; (c) A3: feed discovered connection candidates
(from the now-populated graph) into `synthesiseAndWriteBrief` so new briefs write grounded "this
matters because" — asserting ONLY graph-shown links; (d) BOTH contract-version homes bumped together
(system-prompt.ts + contract-version.mjs SSOT — the two-homes CI test that caught the #417 attempt
stays the guard). **Regeneration policy inline (what previously blocked this unit, dissolved by the
Execution model ruling):** existing briefs remain valid under their stamped version; NOTHING
auto-regenerates on the bump; regeneration is an operator-invoked pass — pilot 3 items, measure real
cost (~$0.15/item baseline), then batches at operator cadence behind the budget kill-switch. Proofs:
contract-version test green; a generation-path test asserting the candidates/profile reach the prompt
assembly; pilot briefs show the new sections grounded.

## U8 — Skill↔code drift gate ($0; extends execution-wiring's lesson to skills)

The goldens class-fix made "proof exists but runs nowhere" mechanically impossible. This does the same
for "skill says X, runtime encodes Y": a discipline-lane check that maps each governing skill's
operative clauses to named runtime contract markers and FAILS on drift in either direction (skill
edited without code, code edited without skill). Buildable now, independent, no spend trigger. Proof:
negative-tested like execution-wiring.test.mjs (a seeded drift must redden it).

## U9 — D1: read-time lens + connections into the five surfaces ($0 reads)

The built-but-invisible layer becomes visible: `relevanceForItem` lens + item connections (with basis)
rendered on Regulations / Market Intel / Research / Operations / Community item views; composes with
U3's themes view (same D-class wave, same card patterns). Proof: fixture renders per surface; no new
data paths (reads existing tables only).

## Sequencing + definition of done

U0 (operator machine, minutes) → U1 → mig + U2 → U3 (U4 rides along if wave capacity allows) → U9 with
U3's wave → U7 as its own PR once the graph is populated (A3 needs real candidates) → U8 anytime,
independent. All units $0 except U7's OPTIONAL operator-invoked regeneration (metered, gated,
pilot-first). DONE when: graph populated (U0 counts reported); `analyze-corpus` runs clean on demand
with its ledger row; themes visible; gap flags in the existing Platform flags queue with evidence;
lens + connections visible on the five surfaces (U9); contract advanced with both homes green and the
regeneration policy recorded (U7); drift gate red-tested then green (U8); **no major function of the
system unwired** — skills consumed by the runtime, goldens executing (already CI-enforced), proofs
execution-wired; zero new standing schedules (`SELECT count(*) FROM cron.job` = 0 and no new
triggers). Build order honors the relay: DDL applied live first, code commits after, PR per unit or
wave-PR at CC's discretion.
