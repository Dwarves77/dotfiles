# Site completion master plan — the whole restructure, sequenced (2026-08-09)

The single roadmap that ties this session's work into a path to a complete site. It supersedes nothing —
it INDEXES the sub-plans (anchoring, cross-surface, data-buildout, skill-delta) into one critical path.
Every state figure here is measured live this session, not assumed.

## What "complete" means

Not "every regulation is in" — a living intelligence platform's corpus grows forever. Complete means THE
LOOP WORKS END TO END and delivers the core value: a change is collected → its cross-surface significance
is determined ("this reg matters BECAUSE that research / that BYD launch / that ops tooling") → the core
analysis is built grounded in those connections → it is anchored to the reader's workspace at read time →
and it compounds, connections begetting connections. When that machine is fully wired and running, the site
is complete; the data then accumulates on rails. The architecture is domain-agnostic — any regulation, any
industry; only the seed data is freight-specific. That generality + the provenance-grounded connection web
is the moat: a competitor can list regulations; they cannot reproduce the grounded "why it matters."

## Where we are (measured)

DONE this session — the FOUNDATION (a platform you can trust and that can't silently drift):
- Integrity: the provenance→verified guard rebuilt on trigger depth + adversarially proven (mig 250). 800/800 verified items pass live revalidation.
- Wiring truth: every proof now executes; cited-but-unrun fails CI (execution-wiring gate, proven on live code PRs #416/#417). The "built but not connected" class is now caught mechanically.
- Anchoring ENGINE: read-time profile model (mig 251) + the pure relevance lens, merged (#417).

REMAINING — the machine is not yet delivering its core value:
- Cross-surface connections are DORMANT: 25/800 items have an intersection_summary (3%), 61 edges corpus-wide, ~80% lack the tags that drive detection. Root cause confirmed: generation is never fed related corpus items, so connections are ungrounded and correctly nulled.
- The anchoring engine is BUILT but NOT WIRED to any surface page — it reaches no user yet (itself an instance of the built-not-connected pattern, honestly flagged).
- Corpus: 109 quarantined items with briefs (806 Gate-A orphans, avg 9.5) sit below the verified line.
- Generation contract is frozen pre-v2.2: the forward-participation pathway + role-generic correction are not shipped (deferred with the regeneration decision attached).
- Loose ends from the wiring audit: 2 orphan API routes, dead UI (SectorSynopsis + 5 superseded controls), a CLAUDE.md drift line, the redundant surface-contracts skill, the skill↔code drift gate not built.

## The five pillars

**A — Connection intelligence (the moat).** Over the collected pool, on the MANAGEMENT side (scan stays light).
- A1 Connection-discovery module: pure scorer + a corpus candidate query over SHARED PROVENANCE (same instrument key / source / overlapping compliance+scenario tags / jurisdiction+topic / existing citation edge). $0, no model. Reuses the entity linker + related_items_derived; does not rebuild.
- A2 Backfill edges: run A1 over the verified corpus → populate item_cross_references from shared provenance. Model-independent, immediate — moves the 61 edges / 3% toward real coverage with zero spend.
- A3 Grounded connection generation: feed the top candidate related items into synthesiseAndWriteBrief as a "RELATED CORPUS ITEMS" block; the model writes the grounded "this matters because ___" (intersection_summary / conversion_trigger / cross_references) against the real corpus. Grounding guarantee: a link is asserted only when the related item AND the shared basis are both real.

**B — Generation at full standard.**
- B1 Contract advance: role-generic (Option B) prompt correction + the forward-participation pathway + BOTH contract-version homes moved together (the deferred work; held because a bump primes corpus-wide regeneration).
- B2 Cross-surface grounding block in generation (A3's prompt half) — ships WITH B1.
- B3 Skill↔code drift gate: CI fails if the runtime contract lags the skill or a binding skill section isn't reflected in code. Closes the class that froze the contract; the structural "no third time."

**C — Corpus completion (the data).**
- C1 Quarantine buildout: the 109 → verified via $0 in-session authoring (Gate-A orphans, one verbatim-span FACT each; Claude-in-Chrome fetches a primary when a figure isn't in capture). The Decision-3 engine.
- C2 Selective regeneration under the new contract (needs B1+B2): high-value items gain forward-participation + grounded connections. Pilot-measured, $0, never corpus-wide-automatic.
- C3 Ongoing intake: scan collects new changes → management tools interpret. The standing supply.

**D — Surface it (what clients see).**
- D1 Wire the read-time lens into the 5 surface pages + detail views ("relevance to your operation"). The built engine reaches users. HIGH priority — value already built, not yet visible.
- D2 Cross-surface links on all 5 surfaces (LinkedItemsCard wired everywhere) + the connection folded into the read-time lens ("relevant to you AND connected to [item] on [surface]").
- D3 Close the wiring-audit loose ends: orphan routes, dead UI, the CLAUDE.md drift line, cut the redundant skill.

**E — Compound + govern.**
- E1 Scan-as-light-collector / heavy-management separation made explicit: collection cheap and frequent; interpretation (A/B/C) behind the budget kill-switch + machine gates, over the durable pool.
- E2 Periodic connection re-score: second-order links (A↔B, B↔C ⇒ A→C candidacy). Connections beget connections.
- E3 Fleet/budget: re-arm the interpretation tools at a cadence the budget allows; the kill-switch + self-metering already exist.

## Critical path (what gates what)

1. **A1** connection-discovery — no dependencies, $0. The keystone; everything cross-surface needs it. START HERE.
2. **A2** backfill edges from provenance — uses A1; immediate grounded connections with zero spend. Fastest visible win for the moat.
3. **D1** wire the anchoring lens to the UI — parallel, no dependency; ships already-built value to users now.
4. **B1+B2** contract advance + cross-surface grounding block — together (both change generation; both need the regen decision). **B3** lands with them.
5. **C2** selective regeneration — applies B to high-value items, pilot-measured; where the new analysis + grounded connections reach existing briefs.
6. **C1** quarantine buildout — parallel, $0, independent of B/C2.
7. **D2+D3** surface the connections + close orphans — makes it visible + clean.
8. **E** the standing loop — compounding + governance.

Moat = A+B. Data = C. Visibility = D. Durability = E.

## What gates the client-value date

The date clients get the differentiated product is gated by A1→A2→A3/B2 (grounded connections) and D1→D2
(made visible). A2 alone — provenance-derived edges, no spend — delivers a visible connection web quickly;
the grounded "this matters because" prose follows with B2+C2. I will measure the real per-item cost of A3/C2
on a small pilot before any corpus-level estimate — no guessed timelines, consistent with everything else
this session.

## Governance (non-negotiable, carried from this session)

- No invented connections — a link needs a real related item AND a real shared basis, same moat as FACT spans.
- Shared briefs stay role-generic; anchoring is read-time only.
- Heavy interpretation runs behind the budget kill-switch + machine gates; collection stays light.
- Every new capability ships execution-wired (the gate now enforces it) with its proof; nothing built-not-connected.
- Contract advances only where regeneration is actually planned; no silent corpus-wide queue.
```
```
INDEX of the sub-plans this master path sequences:
- analysis-anchoring-resolution-2026-08-09.md  (Pillar D1, engine built)
- cross-surface-intelligence-2026-08-09.md     (Pillars A + B2)
- data-buildout-zero-cost-2026-08-09.md        (Pillar C1)
- skill-vs-runtime-analysis-delta-2026-08-09.md (Pillars B1 + B3)
- product-code-wiring-truth-2026-08-09.md      (Pillar D3)
```
