# Block 4 — Grounding Pipeline Scope (2026-06-02)

**Goal.** Make intelligence items genuinely PASS the provenance gate (migration 119) by
populating the per-claim grounding substrate that is currently empty corpus-wide
(`section_claim_provenance` = 0 rows, `agent_run_searches` = 0 rows). Until this exists,
nothing is `verified` and every customer surface is honestly empty.

**Why it's the blocker.** A brief passes criteria 2-5 only if, per item:
- **C2** every URL in `content_md` resolves to `source_url` / an `agent_run_searches.result_url` for the item / a `sources.url`.
- **C3** every FACT claim has a non-empty `source_span` that appears in its linked `agent_run_searches.result_content_excerpt`, and (CRITICAL/HIGH) `source_tier_at_grounding IN (1,2)`.
- **C4** ANALYSIS claims sit in one of the 4 label patterns; LEGAL in the callout; no unlabeled strong-modal prose.
- **C5** every required slot (4 per regulation-family `item_type`) is covered by a claim whose `claim_text` carries the slot_key.

None of that substrate is produced today.

## What already exists (do NOT rebuild)

| Piece | State |
|---|---|
| `validate_item_provenance` (114→119) + trigger (115) + binding (118) + customer gate (117/120) | DONE, verified |
| `parse-output.ts::extractClaimLedger` — parses agent's FACT/ANALYSIS/LEGAL/GAP claims w/ spans | Real, robust |
| `span-check.ts` — fetch+verify-span primitive, retry policy, unit-tested | Real |
| Task 1.12 human-verify loop (`loadPendingFactClaims`/`recordClaimVerification`/`flipToVerifiedIfAllTicked`) | Real, runtime-verified |
| `system-prompt.ts` — integrity rule, formats, ANALYSIS/LEGAL label conventions (C4), source hierarchy | Mostly there |
| `generate-brief.ts` workflow skeleton — durable steps registered | Stub bodies |
| `item_type_required_slots` (20 rows, 4 per type) | Seeded |

## What Block 4 must build (the stub bodies)

1. **Claim-ledger emission in the prompt (S–M).** Confirm/extend `system-prompt.ts` so generation emits the structured claim ledger `parse-output` already expects — each FACT with a verbatim `source_span` + grounding URL + the slot_key token; ANALYSIS/LEGAL routed to the label/callout. The integrity scaffolding exists; this is the contract that feeds C2–C5.
2. **`sourceOrFindForClaim` — active sourcing (M–L).** Per FACT: locate the span in the item's `source_url` content; else `web_search` a Tier-1/2 authority; return `{source_span, source_id, tier}`. Wire the reserved `DurableAgent`. This is the substantive piece.
3. **`persistAgentRunSearches` (S–M).** Write each search (query, result_url, result_title, result_content_excerpt) → `agent_run_searches`. Returns the row ids the claims cross-link to (C2/C3 depend on these rows existing).
4. **Claim-ledger persistence (S–M).** INSERT parsed claims → `section_claim_provenance` (source_span, search_result_id, source_tier_at_grounding, slot_key-in-claim_text). Not even a named stub today.
5. **`validateItemProvenance` (S).** Replace stub with the real RPC call.
6. **`routeOnValidation` (S–M).** Valid → write `intelligence_items` + sections (trigger flips status); invalid → `staged_updates` with the failures payload.

## The hard part (the real risk)

The criteria are strict and conjunctive — **every** URL grounded, **every** FACT span-verified against a live excerpt, **every** slot covered, **every** modal labeled. The difficulty is not the plumbing (steps 3–6 are small); it's getting a *generated* brief to actually satisfy all of C2–C5 at once. That's an iterative prompt + grounding-tuning loop, plus a per-FACT fetch/verify that can fail (dead/changed sources → claim routes to staging, not verified). Expect several pilot rounds before a flagship passes clean.

## Recommended sequence

1. **Pilot on 1 flagship (e.g. CBAM `t1`).** Build steps 1–6 minimally; run generation+grounding on ONE item; iterate the prompt/grounding until `validate_item_provenance` returns `valid=true`. This de-risks the criteria-passing before any scale.
2. **Pilot batch (3–5 flagships)** across item types to shake out C5 slot coverage + C3 tier floors.
3. **Scale to the corpus** in checkpoint-resumable batches (mirror `b2-runner`).

## Cost / time (rough, confirm at pilot)

- Per item: 1 agent generation (Claude + web_search, ~$0.15–0.40) + N per-FACT span-check fetches (Browserless). Ballpark **$0.30–0.70/item** all-in.
- ~109 sectioned items → **~$35–75**; full corpus re-generation higher.
- Wall-clock dominated by per-item fetch/verify; checkpoint-resumable like b2.
- **The estimate is generation cost; the real cost is the engineering iteration to pass the strict criteria — scope that at the pilot, not up front.**

## Decision owed before building

- **Re-generate vs. retro-ground.** Option A: re-run generation through the pipeline (new briefs, fully grounded) — replaces existing prose. Option B: retro-ground the EXISTING 1005 sections (extract claims from current prose, find spans) — preserves prose.

## PILOT RESULT (2026-06-02) — retro-ground is VIABLE

`scripts/_diag/block4-pilot-cbam.mjs` (non-mutating: transaction + ROLLBACK) ran the
retro-ground path on the real CBAM item (`t1`, CRITICAL, 7 sections), against the live
DB and the real sources (eur-lex CELEX:32023R0956 + the EC CBAM portal):

1. Fetch the two source contents.
2. One Claude call (`claude-sonnet-4-6`, ~11.5k in / ~4k out, **no web_search needed** — sources provided) emits a Claim Provenance Ledger: ~21 FACT claims with **verbatim** spans + 1 GAP, covering all 4 required slots and every modal-bearing section.
3. Span-check gate (mirrors `span-check.ts`): drop any FACT whose span isn't verbatim in its excerpt.
4. Transaction: insert `agent_run_searches` (per source) + `section_claim_provenance` (slot_key embedded in `claim_text` for FACT/GAP), `crossLinkClaimSources` for `search_result_id`, `source_tier_at_grounding=2`.
5. `validate_item_provenance(t1)` → **valid=true, 0 failures, recommended_status=`pending_human_verify`.** ROLLBACK.

Progression across iterations: 9 failures (baseline) → 3 (`c4`) → 1 (`c3` span-fidelity) → **0**.

**Conclusions:**
- **Retro-grounding the EXISTING briefs works** — no regeneration required. The current prose + real sources yield criteria-passing claims.
- **Cost ~$0.05–0.10/item** (claim extraction, no web_search) vs. ~$0.30–0.70 for full re-generation. ~109 sectioned items → **~$5–11**.
- The one reliability knob is span fidelity (the agent must copy spans character-exact); `span-check.ts` already gates this — a non-verbatim FACT routes to staging/retry rather than passing.
- CRITICAL/HIGH items land at `pending_human_verify` (correct); the existing task-1.12 tick loop flips them to `verified`.

**Recommendation (updated):** build Block 4 as a **retro-ground** pipeline (Option B), not full re-generation. The pilot harness is the working core of steps 1–5; productionizing = wire it into the durable workflow steps (or a checkpoint-resumable batch runner like `b2-runner`), add the real `span-check` retry, and run the corpus in batches. Far cheaper and preserves the existing prose.
