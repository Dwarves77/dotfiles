# Recursive compounding discovery — the flywheel model (Pillar E, made rigorous) (2026-08-10)

Operator directive (2026-08-10): "This needs to be a recursive system that compounds discovery." Correct,
and it reframes everything built so far. Pillar A (connection discovery) + Pillar F (corpus synthesis) as
specified are a LINEAR PIPELINE: scan → items → edges → clusters → briefs, run once. A pipeline does not
compound. This doc turns it into a WELL-FOUNDED RECURSIVE FLYWHEEL: each layer's output becomes an earlier
layer's input, so the system's current knowledge tells it what to discover next, and the value of existing
data grows as new data arrives. It is the rigorous form of Pillar E ("compound + govern") from the
[master plan](./site-completion-masterplan-2026-08-09.md), built on [Pillar F](./system-level-intelligence-2026-08-09.md)
and the [cross-surface](./cross-surface-intelligence-2026-08-09.md) framing.

## The reframe: pipeline → flywheel

The one-shot backfill (`scripts/connections/backfill-edges.mjs`) is NOT wrong and NOT throwaway. It is the
COLD-START crank: the first population that gives the flywheel something to cluster. What is missing is the
set of FEEDBACK EDGES that make later output re-enter as earlier input. Without them the graph is a static
artifact; with them it is a substrate that grows itself. This is the operator's own thesis generalized:
"just as our sources grow from being referenced within existing information, our tools to understand how we
manage information grow as our system cross-references data." Source-growth is the loop we ALREADY run for
SOURCES (`src/lib/sources/source-growth.ts` + `agent_run_searches` + `provisional_sources`, invariant RD-8).
The flywheel is that SAME loop generalized to connections and themes. Reuse, not invention.

## The compounding loops (the feedback edges — this is the substance)

**L1 — Node growth becomes incremental discovery (continuous, not one-shot).** Today a scan mints an item
and writes ONE entity edge (`mint-item.ts`). Extension: each new node runs `discover.mjs` against the
existing pool at mint time (new-node-vs-pool, cheap, not a full O(n²) re-scan), so the graph grows edge-wise
with the corpus and the standalone backfill is only ever needed once. This is the operator's "the scan
collects, the management tools determine relevance" — the scan stays light; per-node discovery is the
management step.

**L2 — Cluster → gap → discovery target (the core flywheel).** Once edges cluster into themes (F1), a
cluster's SHAPE reveals what is missing: a theme present in EU + IMO but absent in the US; a theme with a
research finding and no market signal; a pivot instrument with no operational-profile counterpart. Each gap
is a DISCOVERY TARGET fed back into source-growth / scan targeting: "we hold Scope-3 across EU + IMO but not
the US equivalent — go find it." Finding it adds nodes (L1), which re-cluster, which expose the next gap.
The system's current knowledge is what tells it where to look next. This is the compounding core.

**L3 — Trajectory → anticipatory discovery (forward-looking).** F4 trajectory ordering shows a theme
accelerating toward a window. That forward signal targets ANTICIPATORY discovery — go find the instruments
and research the trajectory implies are coming, before they are asked for. The forward-participation pathway
(B1) already extracts forward events; this loop makes them discovery targets, not just brief content.

**L4 — Capability compounding (the ambitious layer: the METHOD improves).** The operator asked for tools
that GROW, not just data that accumulates. When a connection BASIS recurs and co-occurs with verified
relationships, that pattern is a CANDIDATE new signal or re-weight for `discover.mjs`. The system proposes
improvements to its own discovery method from its own findings. GATED, never silent: a candidate signal is
SURFACED with its evidence for ratification (the same discipline as a new migration or a scorer change), it
does not self-modify the scoring SoT. Human-gated capability compounding is the difference between a system
that improves and a system that drifts.

## Why it is well-founded (it converges, it does not spin)

A "compounding" system with no convergence criterion is a cost-and-noise bomb. This one is well-founded by
construction:

1. **Deterministic fixpoint.** `discover.mjs` is pure and deterministic, so on a STABLE corpus a pass
   produces no new edges — the graph is at a fixpoint. The system rests when there is nothing to find and
   does work only when genuinely perturbed. The only perturbations are new scans (external, rate-limited)
   and ratified new signals (L4, human-gated). It cannot spin on unchanged input.
2. **Monotonic + grounded ⇒ no noise amplification.** The classic failure of recursive/self-feeding systems
   is amplifying their own errors: a spurious edge breeds a spurious cluster breeds a spurious theme. The
   structural damper is the non-negotiable grounding rule — every edge carries a BASIS or is never emitted
   (`discover.mjs`), so a pass can only add PROVABLE edges from a finite corpus. Error cannot enter the loop
   to be amplified. The moat guarantee (no invented links) is also the convergence guarantee.
3. **Bounded growth.** Edges per node are capped (threshold 0.3, per-tag cap, limit N), so the graph is
   bounded O(n²) and in practice near-linear — the recursion terminates on a finite structure.
4. **Loop-until-dry base case.** A discovery pass stops after K consecutive sub-passes surface nothing new
   (edge, theme, or gap-candidate). Explicit termination, not a fixed iteration count that under- or
   over-runs.

## Why discovery compounds but COST does not (the governance insight)

The flywheel spins on the $0 DETERMINISTIC SUBSTRATE. L1 discovery, F1–F4 clustering / centrality /
convergence / trajectory, and L2 gap detection are all graph algorithms — no model, no spend — so they can
run as often as the corpus changes for zero marginal cost. The only metered steps are F5 theme-brief
synthesis and any model-assisted gap-FILLING, and those stay behind the budget kill-switch, pilot-measured
before any corpus-wide run (rule 11 + the fleet-budget control). So "compounds discovery" is decoupled from
"compounds cost": the system can discover unboundedly and spend deliberately. This decoupling is what makes
a recursive discovery system safe to actually run.

## What compounds, precisely

- **Data** compounds: more grounded edges, denser graph, every scan a permanent addition.
- **Structure** compounds: clusters sharpen, convergences strengthen, trajectories lengthen as nodes join —
  so OLD items gain new relevance from NEW arrivals (an item minted months ago becomes a pivot when the
  theme around it fills in). The value of existing data grows with time, un-purchasable by a competitor
  starting today.
- **Capability** compounds (L4, gated): the discovery method itself improves from what the graph reveals.

The moat is the compounding, not the snapshot. A competitor can copy a detector; they cannot copy a
flywheel that has been compounding on a proprietary provenance graph for months. Time-in-loop is the
durability.

## How it extends what exists (reuse ledger)

- **Cold-start:** `backfill-edges.mjs` — the first crank (kept).
- **Scorer (single home):** `src/lib/connections/discover.mjs` — reused by L1 (incremental) and the backfill.
- **Writer (single home):** `src/lib/connections/write-edges.mjs` — origin-aware, idempotent, the fixpoint
  depends on its idempotency.
- **The loop pattern:** `source-growth.ts` — the existing SOURCE compounding loop, generalized to connections.
- **The $0 layers:** Pillar F F1–F4 — the algorithmic substrate the flywheel spins on.
- **The metered gate:** the budget kill-switch + pilot discipline (fleet-budget-control runbook) — unchanged.

## Sequencing (additive to the master plan critical path)

1. Land Pillar A (edges populated) — the cold-start. IN FLIGHT (PR #418).
2. F1–F4 over the populated graph — the $0 corpus view (themes, pivots, convergences, trajectories).
3. **L2 gap detection** — the first feedback edge; turns cluster shape into scan targets. Highest-leverage
   loop to close first: it makes discovery self-directing at zero cost.
4. **L1 incremental discovery at mint** — makes growth continuous; retires the need to re-run the backfill.
5. **L3 anticipatory targeting** — forward-looking discovery from trajectories.
6. **F5 theme briefs** — the metered apex, pilot-first, behind the budget gate.
7. **L4 capability compounding** — candidate-signal surfacing for ratification; last, because it changes the
   scorer and must be governed.

Base case and cost fence (§ well-founded, § governance) are built in at step 3, not bolted on later — a
loop ships with its termination and its budget gate or it does not ship.
