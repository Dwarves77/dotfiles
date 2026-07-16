---
id: ADR-014
title: Wave-acceptance sampling — standing ground-truth QA lane on every acquisition wave
status: accepted
date: 2026-07-15
scope: acquisition/grounding waves, ground-truth verification, coverage-floor spend gating
supersedes: none
related: ground-truth-verification-2026-07-15 (audits/), ADR-002 (tier model), ADR-012 (intake cadence), source-credibility-model (authority floor + moat), environmental-policy-and-innovation (integrity rule), EP-11 (canonical-key dedup), RD-13/RD-14 (error-body gate)
---

# ADR-014 — Wave-acceptance sampling (standing ground-truth QA lane)

## Status note
**ACCEPTED — ratified by operator 2026-07-15 (audit-ruled remediation session, Task 8).** Parameters
locked: **N = 10%, floor 3 items/wave** (`WAVE_ACCEPTANCE_N = 10`). The mechanical half of the lane is
wired and proven; the live L2/L3 half is spend-gated and deferred until the coverage-floor spend fires.

**Wiring state (honest split, ratified):**
- WIRED now (mechanical, $0): the pre-scan reporter (`scripts/verify/wave-acceptance-audit.mjs`) is a
  ratified tool; a golden (`wave-acceptance-audit.golden.mjs`) locks its risk-weighted sample computation
  + provenance/dedup pre-scan; invariant **QA-1** (invariant registry) asserts a wave cannot record
  `closed` without a recorded acceptance-sample rate row. The already-proven `defect-signature-scan.mjs`
  (+ its golden) is the accuracy-signature half.
- DEFERRED (live, spend-gated): the L2/L3 live-read pass (Chrome live-read of each sampled primary) cannot
  run at $0; it fires with the coverage-floor spend. Until then, the mechanical pre-scan + signature scan
  run at wave-close read-only, and the accuracy-rate escalation gate (§4) is enforced from the live pass
  when spend is authorized. This deferral is NAMED, not silent (QA-1 records "live-pass: deferred/ran").

## Context (Ground-Truth Verification Unit, operator dispatch 2026-07-15)

The 2026-07-15 unit ground-truth-verified 27 sampled items (~738 FACT claims) against live/correct
sources. Findings: [ground-truth-verification-2026-07-15](../audits/ground-truth-verification-2026-07-15.md).
Headline — **accuracy is high (~3% fact-weighted defect, ISO 14083 the lone systematic-falsehood
outlier); the dominant defect is provenance** (S1 dead-citation 927 T1 facts / 26 items; S2 null-source
455 / 45), which is fixable free (re-point + register) and does **not** require paid re-grounding.

The operator's carried ruling: **the coverage-floor spend does not fire until this unit's rates are on
the table.** They are now. This ADR registers the *standing* mechanism the dispatch called for (item 4)
so the one-off unit becomes a permanent lane, not a hero pass.

## Decision

**Every acquisition/grounding wave is gated by a ground-truth acceptance sample before it may close.**

1. **Sample.** Before a wave closes, draw a risk-weighted **N%** (proposed **N = 10%, floor 3 items**)
   of that wave's newly-grounded/re-grounded items. Risk weighting mirrors the unit: over-sample non-EN
   primaries, high-fact items, CRITICAL/HIGH customer rows, and any item citing a **newly-seen source
   host**. Exclude nothing by convenience; log any item dropped from the frame.
2. **Verify (the unit's three-layer protocol).** Per sampled item, per FACT: **L1** capture fidelity,
   **L2** claim-vs-live-text at the *correct* source (seek-correct-source when the cited URL is dead or
   wrong), **L3** analysis honesty. Verdict per fact: PASS / DEFECT(class) / UNVERIFIABLE-live. Defect
   taxonomy per the findings doc (A1–A7, C1–C5, H1–H4; A6 broken-citation and A5/S2 null-source are the
   provenance classes; A3 is the common accuracy class).
3. **Record before close.** The wave cannot close until its sample's rates are recorded: **accuracy-
   defect rate**, **provenance-defect rate (S1/S2 share)**, any **substantive-falsehood item (ISO-class)**,
   any **dedup escape (EP-11 / null canonical key)**, any **error-body or unregistered-host** hit.
4. **Escalation thresholds (proposed, tune on data).** Sample accuracy-defect rate **> 10%**, OR any
   single ISO-class substantive-falsehood item → **wave HELD** for operator ruling, not auto-closed.
   Provenance-defect rate is reported but does **not** hold the wave (it routes to the free re-point /
   registration sweep, not to spend).
5. **Priced in.** The acceptance sample is part of every wave's cost, not an optional add-on.

## Consequences

- Waves carry a standing, mechanical QA floor; the ISO-class falsehood cannot silently reach customers
  wave after wave (it is the one class that must hold a wave).
- The provenance/accuracy split is measured every wave, so the "fix pointers, don't pay to re-ground"
  posture stays evidence-based, not assumed.
- Wave 2 (running in parallel during the 2026-07-15 unit, excluded from that sample by construction)
  gets its verification through this lane on close.

## Verification-of-this-ADR (on ratification)
- `scripts/verify/wave-acceptance-audit.mjs` (scaffold authored 2026-07-15, **not wired**) computes the
  risk-weighted sample for a given wave id and reports the rate table; wiring it into wave-close is the
  ratification step. Until wired, it runs read-only on demand.
- `scripts/verify/defect-signature-scan.mjs` (read-only, authored 2026-07-15) implements the two
  accuracy-defect signatures (S-CONFLATE, S-NUMERIC). It is **already a verified tool, not just authored
  code**: it has a proven caller (its positive control fires 9 S-CONFLATE hits on the known-bad item
  ISO 14083) and a fixture golden (`defect-signature-scan.golden.mjs`, PASS) that locks the positive and
  negative control behavior. Ratification therefore wires an already-proven tool into the wave-close gate
  rather than trusting authorship. One live caller is authorized this cycle by operator relay, the Wave 2
  close gate; permanent wiring into wave-close, CI, or a hook is deferred to this ADR's ratification.
- Set `WAVE_ACCEPTANCE_N` (default 10) + floor 3 as the sanctioned parameters.
