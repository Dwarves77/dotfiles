# Ground-Truth Verification Unit — 2026-07-15

**Dispatch:** operator, 2026-07-15 — ground-truth verification gating the coverage-floor spend.
**Method:** read-only. Per-item Chrome live-read of the cited primary + `section_claim_provenance`
span-vs-claim adjudication, against live/correct sources (seek-correct-source per operator directive).
No writes except this findings doc + raw scratch. No corrections executed.
**Raw per-claim scoring:** `fsi-app/scripts/tmp/gtv-raw-scoring-2026-07-15.md` (scratch).
**Sample:** 27 items, ~738 FACT claims, risk-weighted across type × tier × language × capture-era ×
priority band; drawn from the 185 **untouched** pool (excludes the 34 items Wave 2 grounded in the prior
2 days). 26 verified + 1 untouched hold. Coverage: every item_type; EN/PT/KR/JA/DE; pre- and post-
truncation-fix eras; CRITICAL→LOW.

Related: [source-credibility-model](../../fsi-app/.claude/skills/source-credibility-model/SKILL.md) (tier
+ authority-floor + moat), [environmental-policy-and-innovation](../../fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md)
(integrity rule), [ADR-002-tier-model](../decisions/ADR-002-tier-model.md).

---

## Headline (the ruling input)

**Accuracy is HIGH; the dominant defect is PROVENANCE, and it is fixable without paid re-grounding.**

| Measure | Rate | Nature |
|---|---|---|
| **Accuracy-defect** (fact *wrong* at the correct source) | **~3.0% fact-weighted (~1.7% ex-ISO)** | ~22 defects / ~738 facts (the euro 6,800 suspect was retracted after Task 1 live verification, see below). 17/27 items = ZERO. ISO 14083 alone = ~11 defects (lone systematic-falsehood outlier, by conflation not invention). |
| **Provenance-defect** (broken/unregistered citation; fact usually true) | **~27% of corpus facts** | S1 dead-citation 927 facts + S2 null-source 455 facts. Fixable by re-point + registration; **no re-grounding spend needed.** |

**Recommendation: HOLD the coverage-floor spend; fund citation/registration sweeps instead.** The corpus
is largely factually sound. Paying to re-ground would spend against a problem (broken *pointers*) that a
free re-point + host-registration pass resolves. Reserve content correction for the rare accuracy cases
(ISO 14083 + any siblings a targeted scan surfaces).

**Zero fabricated source spans were found across all 27 items.** Every source span traced to real captured
content (verified live). The failure mode is over-claim or mis-citation from real material, not invention.
The fail-closed provenance gate is verified working (it correctly quarantined item #11 and held 4 zero-
provenance facts inside a quarantined EPA item).

---

## Protocol & defect taxonomy

Three layers, per FACT: **L1 capture fidelity** (did the stored capture represent the live source),
**L2 claim-vs-live-text** (does the span appear in the correct live source; does claim_text represent it),
**L3 analysis honesty** (analysis labeled; legal determinations routed; gaps honest). Verdict per fact:
PASS / DEFECT(class) / UNVERIFIABLE-live.

| Class | Defect |
|---|---|
| C1–C5 | capture: truncated / error-body / furniture / stale / wrong-doc |
| A1 | span-not-found (fabricated span) — **not observed** in 27 items |
| A2 | span-misquoted (number/date/term changed) |
| A3 | claim-distorts-span (claim asserts more than the span supports) — **most common accuracy defect** |
| A4 | qualification-dropped |
| A5 | tier-misstamp / null-tier unregistered |
| A6 | broken/wrong citation-of-record (dead URL, or live-but-wrong doc) — **dominant provenance defect** |
| A7 | language/charset (translation unlabeled / charset-mangled) — **not observed**; non-EN handled well |
| H1 | analysis-as-fact (incl. Q4 "tier-methodology-as-fact") |
| H2 | legal-determination asserted |
| H3 | invented content |
| H4 | false/papered gap |

### Two named accuracy-defect signatures (for the sibling scan)

The accuracy-defect class splits into two mechanical signatures, used by the read-only sibling scan
(`fsi-app/scripts/verify/defect-signature-scan.mjs`) for triage and hold, never for certification:

- **S-CONFLATE (instrument-identity conflation):** a FACT claim names a specific instrument identifier (a
  regulation or directive number, an ISO standard, a named act) and the supporting span does not
  corroborate that identifier beyond title-only matching. The ISO 14083 falsehood is the worked example
  (Regulation (EU) 2023/1805 named as "CountEmissions EU"). Flag especially where one span is reused across
  many claims naming an instrument.
- **S-NUMERIC (span-unsupported numeric):** a FACT claim carries a numeric figure (a monetary amount,
  percentage, threshold, or date-as-obligation) that does not appear in and cannot be traced to its
  supporting span. A hit is a HOLD trigger, not a fabrication verdict: live verification then separates
  real-but-mis-cited (fix the citation, for example the euro 6,800 case in section "Accuracy-defect items")
  from genuinely invented (fix the content).

---

## Systemic findings (quantified corpus-wide, not just the sample)

### S1 — dead / wrong citation-of-record (class-level A6) — DOMINANT
One generic EUR-Lex "junk-drawer" source row (`url = …/EN/TXT?uri=OJ:L_202500040`, **confirmed 404 live**)
is the citation-of-record for **927 FACT claims across 26 non-archived items, all stamped T1** (~18% of
the corpus's 5,090 facts). The spans are *real* (grounded against the correct captured CELEX pages, which
sit in each item's `agent_run_searches` pool); only the stored citation URL is dead. The class also
manifests as **live-but-wrong URLs** — e.g. Brazil Alt Fuels (Lei 14.993/2024) cites
`planalto…/l12305.htm` = **Lei 12.305/2010 (the Solid Waste Policy)**, an unrelated statute.
**Fix (free):** re-point each claim to the correct instrument URL already in its pool (promote-the-stored-
URL). **No re-grounding spend.**

### S2 — unregistered host / null-source (class-level) — SECONDARY
**455 FACTs (8.9%) across 45 items** have `source_id = NULL` (null tier). 451 trace to a real captured
search result whose host was never registered (incl. **Korea FSC, a T2 regulator**, grounding 7 facts
while unstamped). 4 have zero provenance — **all inside one quarantined item** (EPA HDV Phase 3), i.e. the
gate held them. Concentrated in the floor-exempt types (market_signal / initiative / research / regional).
**Fix (free):** register the recurring hosts + re-stamp.

### D1 — duplicate escaping EP-11 dedup
ReFuelEU Aviation 2023/2405 is present **twice, both verified**: #4 (`6f1e6615`, canonical key `32023R2405`)
and #5 (`f2269121`, **canonical_instrument_key = NULL**). The null key defeated the EP-11 uniqueness index.
**Fix:** derive #5's key → dedup → archive loser.

---

## Accuracy-defect items (the only "must-correct-content" cases)

| Item | Type | Accuracy defects | Detail |
|---|---|---|---|
| **ISO 14083** (#10) | standard | **~11/20 (55%)** | **Confirmed false claim by conflation (signature S-CONFLATE).** Wrong-synthesis of two real instruments, not invention from nothing: the brief fuses the substance of CountEmissions EU onto the identifier of Regulation (EU) 2023/1805, which is actually FuelEU Maritime. Result: it tells customers 2023/1805 "CountEmissions EU" mandates ISO-14083 certificates from 1 July 2025. Verified live: 2023/1805 is FuelEU Maritime, names no ISO 14083, applies 1 Jan 2025. 9 claims hang off one reused title-span. The spans are real captured content; the falsehood is in the synthesis, not a fabricated span. **Priority content correction.** |
| EU CO2 Trucks (#2) | regulation | ~2/30 | idx19 debt-mechanism "closes 2030" vs span 2029/2034/2039; idx25 unsupported "30 April/Art 11". **idx28 "euro 6,800/gCO2/tkm" RETRACTED as an accuracy defect:** Task 1 (2026-07-15) verified it live against the primary law. The figure is real and the claim is correct, per Regulation (EU) 2019/1242 Article 8(1)(b) (from 2030 onwards; euro 4,250 applies 2025 to 2029, Article 8(1)(a)), and is not amended by Regulation (EU) 2024/1610. The residual defect on idx28 is only a span-citation mismatch (its stored span "45% by 2030" does not contain the figure), an S-NUMERIC hit that is real-but-mis-cited, not fabricated. |
| Autonomous Freight (#27) | technology | ~2/31 | Q4 tier-methodology-as-fact (idx14/19/23 "…classified as Tier N", idx23 self-inconsistent). |
| Fit for 55 (#1) | regulation | ~2/39 | idx33 ETS "70% in 2025" vs span "2026"; idx35 "100% in 2026" vs span "2027". |
| ReFuelEU 2405 (#4), ReFuelEU-twin (#5), Brazil AltFuels (#3), Stockholm SEI (#20), EU 2023/959 (#6) | mixed | ~1 each | minor A2/A3 date or span-mismatch (see raw). |
| **17 other items** | all types | **0** | K-Tax, Air Cargo, IMO, Iowa, Roadcheck, ASEAN, Mission Innovation, Japan, BloombergNEF, Fraunhofer, JOLT, First Movers, IRENA, Brazil-MT, EIA, Hydrogen, Missouri, Green Building — all accuracy-clean. |

**ACTION:** correct ISO 14083's content; run a targeted scan for ISO-class substantive-falsehood siblings
(same signature: a named instrument's identity/obligation asserted against a mismatched span). Everything
else is provenance or quality, not wrong facts.

---

## Quality patterns (not accuracy defects; cleanup, not spend)

- **Q1 padding** — widespread near-duplicate FACT inflation (Iowa/Missouri ~35% dup restatements; EASA
  "page last updated" ×5; CBP/rate lines repeated). Inflates fact counts; strip at cleanup.
- **Q2 informal-source** — a few null-source items ground to informal digests (ASEAN emoji newsletter).
  Distinct from credible-but-unregistered (FSC/IATA). Source-selection quality.
- **Q3 content-fit** — some `research_finding`/`guidance` items are org *descriptions* (SEI, Fraunhofer,
  Missouri = "what the institute/agency does"), low freight-decision value; format populated off-intent.
- **Q4 tier-methodology-as-fact** — briefs occasionally emit FACT claims about their own tier
  classification (ISO idx20, Autonomous idx14/19/23). Small recurring H1/A3; strip at correction.

---

## Dispositions (for operator ruling — none executed)

1. **Citation re-point sweep (free)** — promote the correct instrument URLs from each item's pool onto the
   927 S1 dead-cite facts (+ the live-but-wrong national URLs). No re-grounding spend.
2. **Host-registration sweep (free)** — register the recurring S2 hosts (FSC, IATA, ACT Research, korea.net,
   mlit.go.jp, etc.) + re-stamp the 455 null-source facts.
3. **ISO 14083 content correction + sibling scan** — the one true accuracy case; correct + scan for the
   signature. Small, targeted.
4. **Dedup D1** — derive #5 canonical key, dedup the ReFuelEU twins.
5. **Quality cleanup (Q1–Q4)** — de-pad, re-home content-fit items, strip tier-methodology-as-fact claims.
6. **Recover hold #11** — register the 1 host, re-fetch the 1 failed capture, relabel/re-attribute the 1
   sub-floor fact. Content is good.

**None of (1)–(6) requires the coverage-floor spend.** Recommend holding the spend pending these sweeps.

---

## Wave-acceptance sampling institution (standing QA lane)

**Ruling proposal:** before any acquisition wave closes, a risk-weighted **N%** of that wave's items pass
this same three-layer ground-truth protocol; the wave cannot close until its sampled accuracy + provenance
rates are recorded. Proposed **N = 10%, floor 3 items/wave**, risk-weighted identically (non-EN, high-fact,
CRITICAL/HIGH, any new source host). Report per wave: accuracy-defect rate, provenance-defect rate (S1/S2
share), any substantive-falsehood item (ISO-class), dedup escapes. Priced into every wave. This unit is the
first execution; Wave 2's items get their verification via this lane once Wave 2 closes (they were excluded
from this sample by construction). **Registered** as
[ADR-014-wave-acceptance-sampling](../decisions/ADR-014-wave-acceptance-sampling.md) (status: *proposed*)
with a read-only scaffold at `fsi-app/scripts/verify/wave-acceptance-audit.mjs` (authored, **not wired**).
Ratification (operator sets N + the spend ruling) flips the ADR to accepted, sets `WAVE_ACCEPTANCE_N`,
and wires the acceptance check into wave-close.
