# Data buildout plan — $0 verified-corpus completion via the existing CC-grounding executor (2026-08-09)

Operator ruling (Decision 3, verbatim intent): use the tools that already exist, build no new modules,
$0 outside the subscription, the connection to Claude-in-Chrome used directly, a measured and thoughtful
build to the highest data standard. Pilot 3 already-captured items with exact telemetry, then scale.
This plan is written BEFORE any item is touched. Governing skills: environmental-policy-and-innovation,
remediation-discipline, source-credibility-model.

## 1. Method — selected on merit, not precedent

**The CC-grounding executor injected-ledger seam** (`scripts/_reground/executor-ground.mjs` →
`groundBrief(itemId, "cc-grounding-executor", { injectedLedger })`, `canonical-pipeline.ts:1472`).
Verified in source, not assumed:

- The injected ledger REPLACES the paid Sonnet extraction (`claims = injected ?? extractClaimLedgerLenient(await callSonnet(...))`, `:1472`). No Claude API call, no Browserless fetch, no acquire lock (`:1199`). Truly $0.
- The injected ledger flows through the IDENTICAL system judgment as a paid ground: the verbatim kept-filter (`:1485` — a FACT whose `source_span` is not a literal substring of the captured text is DROPPED), the institution tier-stamp + floor re-attribution, the mint gates, Gate-A `scanBrief`, the non-destructive `applyLedgerDiff` (adds/versions, NEVER deletes, `:1643`), and `validate_item_provenance`. The machine judges the extraction; I only supply candidate spans.
- This tool was ruled into existence by the operator on 2026-07-16 for exactly this purpose ("$0, no metered spend"). It is an existing tool, not a new module. It does NOT bypass the sourcing guides — every claim passes the full validator or the item stays quarantined.

Why this beats the alternatives on merit:
- The paid fleet / `/api/agent/run`: costs credits per item (Sonnet synth + extract). Rejected by the $0 constraint.
- A new session-transport seam: rejected by the operator (new module, bypasses sourcing guides).
- Direct SQL writes via MCP: bypasses the guarded writers, tier-stamp, and mint gates. Rejected — it is exactly the "bypass" the operator forbids.

The executor is the only path that is $0, uses existing tooling, and routes every claim through the real integrity gates. It wins on evidence.

Best-in-class check (operator directive to research top methods): the architecture already IS the
state of the art — span-level citation-grounded extraction with a verbatim integrity check, an authority-tier
floor, and an orphan-fact gate (Gate-A) is precisely the citation-grounding / self-refinement pattern the
current literature prescribes for legal-regulatory extraction. The innovation here is not a new algorithm;
it is driving that existing pipeline with an intelligent author (this session) in place of the paid model,
at $0 marginal cost. No superior method needs importing.

## 2. Worklist — real numbers (live, 2026-08-09)

109 non-archived quarantined items with a brief (the buildout target; the corpus is otherwise 800 verified).
Triaged by the ACTUAL failure that gates each — measured, not assumed:

| Class | Count | Fix | Effort |
|---|---|---|---|
| Gate-A hash-stale / missing state | 3 | minimal injected ledger → triggers `scanBrief` rescan against existing claims → flips | near-free |
| Gate-A orphans (current hash, `orphan_count>0`) | 85 | author one span-proven FACT per orphan from captured text; Claude-in-Chrome fetches the primary when a figure is absent from the capture | ∝ orphan count |
| Gate-A clean but quarantined (criteria 1-6) | 21 | fact-floor re-attribution / missing-slot claims / labeling | moderate |

Orphan load (the dominant class): **806 orphans across 85 items**, avg 9.5, range 1-49 (6 items ≤3, 46
items 4-8, 33 items >8). Each orphan is a specific actionable figure or deadline the brief prose asserts
without a span-proven claim (e.g. EU 2023/959: €15/€27/€44 ETS prices, 97.5%/51.5% thresholds, 2026
deadlines). This is the true unit of work and the true cost driver.

## 3. Per-orphan procedure (the authoring unit)

For each orphan token on an item:
1. Search the item's captured text (`agent_run_searches` excerpts, already staged, $0) for the figure.
2. FOUND → author a FACT claim: `{ section, claim_text, claim_kind:"FACT", source_span:<verbatim substring containing the figure>, slot_key }`. The kept-filter guarantees a non-verbatim span is dropped, so fabrication is structurally impossible.
3. NOT FOUND in the capture → Claude-in-Chrome fetches the primary source (e.g. the EUR-Lex enacted text) at $0, locates the figure. If present, stage it via the existing `acquire-primary.mjs` path, then author the claim. If the figure is in NO source → the brief prose is unsupported; record it for a prose correction (the honest outcome the gate exists to force — never fabricate a span to clear it).
4. Labeling failures (criterion 4, `unlabeled_assertion` / `analysis_missing_label_syntax`) check brief PROSE and are NOT groundable by the executor (binding 4: no `content_md` writes). These route to a separate brief-prose edit; flagged here, handled as its own step, not silently skipped.

## 4. Execution path (existing tools, creds on the CC machine)

`executor-ground.mjs` needs DB creds (`.env.local`), which live on the operator's machine, not this cloud
session. So the loop is: I author the ledger(s) in-session ($0, telemetry measured here) → deliver + relay
to Claude Code → CC runs `node scripts/_reground/executor-ground.mjs <itemId> <ledger.json>` (existing
tool, real creds) → I verify the flip via Supabase MCP (`provenance_status='verified'`,
`validate_item_provenance.valid=true`) and spot-check the item on the /admin surface via Claude-in-Chrome.
No new module; the relay is the same one already in use for pushes.

## 5. Pilot (3 items, spanning the classes) — measure before scaling

1. **EU 2023/959 — EU ETS amending directive** (`15f63ea9`, 12 orphans, EUR-Lex tier-1, Gate-A-only): proves the dominant orphan-authoring path on flagship data, isolated from other failure classes.
2. **A fact-floor-only item** (e.g. WAC `45f85547`): proves the tier re-attribution path.
3. **A multi-failure item** (e.g. North Carolina `cd5c84e3`: floor + gate-a + slot + labeling): proves the hard case AND exercises the labeling-needs-prose-edit constraint honestly.

Telemetry captured per item: my authoring tokens, orphans covered from capture vs. requiring Chrome,
verified-pass outcome, any residual failure. Deliverable: a real per-class cost, then a scale decision for
the remaining ~106 with numbers, not estimates.

## 6. Scale model (after pilot confirms the numbers)

Batch by class, cheapest-leverage first: the 3 hash-stale items (near-free), then the 21 Gate-A-clean
(criteria 1-6), then the 85 orphan items ordered by ascending orphan count (6 items ≤3 first). Each batch:
author → relay to CC → verify → measure. The block-state reflect in the data-audit lane means a genuine
corpus violation surfaced mid-buildout HALTS generation until fixed — correct: we do not build on a broken
invariant. Stop points are the operator's, not this session's.

## 7. Integrity guarantees (why this meets the highest standard)

- Every FACT is a verbatim span of real captured (or Chrome-fetched primary) source text, or it is dropped.
- The machine validator decides verified/quarantined; I never stamp status (migration 250 makes a direct stamp impossible).
- Non-destructive apply: existing good claims are never deleted; a wrong re-attribution is versioned, retrievable.
- An orphan with no real source is corrected in prose, never papered over with a fabricated span.
- $0 outside the subscription; no new tools; no sourcing-guide bypass.

## 8. Pilot log

### Item 1 — EU 2023/959 (ETS amending directive, `15f63ea9`), 12 orphans

Findability of each orphan in the item's already-captured text (measured 2026-08-09, $0 via one MCP window query):

- **9 findable verbatim in capture** → author FACT claims directly: `24%` ("reduced by the maximum rate of 24%"), `43%` ("previously -43%"), `5,000 GT` ("ships of or above 5,000 GT"), `97.5%` + `51.5%` ("CBAM factor... from 97.5% in 2026, to 51.5% in 2030"), `March 2026` ("EU Council... in March 2026, postponed"), `USD 113` ("penalty of EUR 100 (USD 113)"), and the `€15`/`€27`/`€44` trio.
- **Judgment call — the €15/€27/€44 trio** is a DERIVED cost projection in the captured text ("Permit cost €15 €27 €44... *Assumes a modest EUA price rise") — a surcharge illustration, not a primary directive fact. Correct treatment is ANALYSIS-labeled (criterion 4, prose), not a FACT claim. This is the "content-is-not-nature" discipline: a verbatim span existing does not make a projection a fact.
- **2 not in capture** → `27 May 2026`, `May 2026` (0 hits). Next step: Claude-in-Chrome fetches the enacted EUR-Lex directive to confirm/locate, or the prose date is unsupported and gets qualified. This is the $0-Chrome path in action.

Reading (rule-14 honest): EU 2023/959 will NOT flip on a pure from-capture ledger — 2 date orphans need Chrome verification and the € trio needs an analysis-label prose treatment. So the true per-item cost for an orphan item is: (from-capture FACT authoring) + (occasional Chrome verification) + (occasional prose relabel/qualify). The clean-from-capture fraction here is 9/12 = 75%. This is the measured texture the scale model must price in, not the optimistic "all orphans free from capture" assumption. Telemetry for the remaining pilot items + the exact my-token cost per item continues.
