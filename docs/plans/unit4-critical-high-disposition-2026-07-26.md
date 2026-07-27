# Unit 4 — CRITICAL/HIGH coverage-gap disposition (session-labor lane)

**Status:** ruled 2026-07-26, recorded-before-execution (per the durable-record meta-rule below). Operator-authorized under the ADR-016 acceleration order.
**Lane:** session labor ONLY — zero-spend doctrine. No API generation calls.
**Related:** [session-log 2026-07-26](../ops/session-log.md) · [ADR-016 storage-side uncap](../decisions/) · the STANDING FINANCIAL LAW (session-log 2026-07-25) · [metered-gate wall](../../fsi-app/src/lib/llm/metered-gate.mjs)

## Durable-record meta-rule (adopted 2026-07-26, standing)

Any operator ruling that authorizes multi-step work is written to the session log or a `docs/plans` file **at receipt, before execution starts**. Chat is a delivery channel, not a record. The specs that survived this week are the ones that reached an ADR or the log; Unit 4's spec was lost to context compaction because it only ever lived in conversation — the same failure class as every other undocumented ruling. This rule closes it.

## Scope

The **36 undispositioned CRITICAL/HIGH rows** in `coverage_gap_candidates`. Preliminary split (verify live, do not trust the estimate):

- **~3 repairs** — CORSIA item `cc0958fb` (quarantined); EEXI+CII `93c344a1` (already re-ground in Unit 2 — verify and mark); GFI `e241fe75` (quarantined).
- **~18 mints** — UK CBAM, CSDDD, LkSG, LCFS, ESPR, F-gas, EmpCo, NY Part 218, CARB/WA trackers, Bizot, WEF SAFc, IATA SAF, remainder.
- **~15 feeds** — BLS, EIA, Eurostat, ONS, IBGE, INEGI, Freightos, Ship&Bunker, LUCID, CONAI, Verpact, FMC → **register-as-source** at honest codified tier, $0, no brief.

## Lane discipline (zero-spend)

- **No API generation calls.** Briefs are drafted **in-session** (by Claude) at the full **19-field contract**; the **claim ledger is extracted in-session**; **every mechanical gate is enforced in code** (mint gates, per-type authority floors, verbatim-standard, dedup); the result is written through the **canonical guarded write site**.
- **Capture via free transports** — ladder first; Chrome for bytes only, and the **pipeline extractor always** (never a browser text renderer — the subscript-extraction lesson: `htmlToText` inserts a space at the `<sub>` boundary; Chrome `innerText` does not, breaking verbatim FACT-span guards).
- An item whose document **exceeds session context is reported and held**, never sent to the API.

## Per-row discipline

- **Retrieval check through the `staged_updates` dedup** — the real matcher, not fuzzy term-match. The **UK-CBAM-vs-EU-CBAM false positive is the recorded cautionary case**: UK CBAM is verified genuinely missing and is a valid mint.
- Write the corrected **`coverage_class` + `corpus_match_ref`** back to each candidate row as it is checked.
- **Mark dispositions as rows complete.**
- Any gate firing on the fuller text: **the hold stands — integrity over customer visibility** (the r28 H2-Accelerate precedent).

## Execution order

1. **CORSIA repair-prove** — re-ground quarantined `cc0958fb`; report the one-item result **including gates fired**.
2. **UK CBAM mint-prove** — full chain: stage → register source → capture full → mint → ground in-session; report.
3. **Remaining 34** — without further check-in.

## Report contract

- Three-way split table (**repaired / minted / registered-as-source**, with held-why).
- **Gates fired per item.**
- **Corrections written back.**
- **Session-lane throughput** (items per session, wall-clock).
- **Surface counts before → after.**
