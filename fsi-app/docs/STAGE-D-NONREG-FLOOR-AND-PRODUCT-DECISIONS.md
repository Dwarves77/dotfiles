# Stage D — Non-Reg Authority-Floor Calibration + Two Product Decisions (RATIFIED 2026-06-15)

**Status: D1 RATIFIED + LANDED; D2 ratified, implementations are scoped follow-ons.**
Grounding data: `scripts/_diag/probe-nonreg-floor-calibration.mjs` (read-only, 2026-06-15).

## Ratification & landing record (2026-06-15)
- **D1 codified** as migration `141_per_type_authority_floor.sql` (reg ≤T2 unchanged, research_finding ≤T4,
  technology/innovation/tool ≤T5; market_signal/initiative/regional_data EXEMPT). APPLIED + corpus
  revalidated (status-is-a-cache): **2 research_finding items flipped verified→quarantined** (37→35); 0
  technology items (none exist). The floor bites only CRITICAL/HIGH; the T3 research core + MODERATE/LOW
  research are preserved.
- **T4 confirmation (operator condition):** per source-credibility-model Section 3 the established research
  core — IPCC/OECD/IEA/World Bank/ICAP/UNCTAD — sits at **T3** (intergovernmental analysis body), not T4;
  T4 is industry bodies / class societies; peer-reviewed academic is a *role*, not a type-tier. A ≤T4 floor
  therefore PRESERVES the T3 core (332/643 research FACTs) with one tier of industry-analysis margin and can
  only over-admit T4, never false-quarantine the core. T4 ratified; **≤T3 is the tighter alternative** if
  research-core-only is wanted later.
- **technology ≤T5 labeled FORWARD DEFAULT** (0 live items = hypothesis, not measurement); REVISIT
  registered (invariant SC-8) for when the first technology items land.
- **#1 (market/initiative corroboration gate) + #3 (regional_data per-section)** registered as NAMED
  EXEMPTIONS with REVISIT in the invariant registry as **invariant SC-8** (source-credibility-model), so
  neither silently becomes permanent — the same honest-absence discipline as the original non-reg exemption.
- **T5‑6 → ANALYSIS relabel** uses the IDENTICAL Phase 2 mechanical prose-safe discipline (label-only,
  claim_text byte-identical, content_md byte-delta = marker token only) — `phase2-analysis-relabel.mjs`
  generalized to per-type floors, run with the Stage E/F batch (recovery, not part of the gate migration).

---

## D1 — Non-reg authority-floor calibration (closes the migration-138 named exemption)

### The exemption being closed
Migration 138 made the criterion-3 authority floor (`source_tier_at_grounding IN (1,2)`) bite ONLY on the
regulatory family (regulation/directive/standard/guidance/framework). Non-reg item types are EXEMPT with a
named REVISIT: "set per-type non-reg floors when [this] spec lands." This is that spec.

### What the data says (FACT-claim tier distribution per non-reg item_type, live corpus)
| item_type | items (verified/quar) | FACT claims | tier mode | T1‑2 share | reads as |
|---|---|---|---|---|---|
| market_signal | 74 (56/18) | 999 | **T3** (379) | 241/999 = 24% | signals: news/analyst/trade-press, all tiers + null |
| research_finding | 50 (37/13) | 643 | **T3** (332) | 78/643 = 12% | think-tank / peer-reviewed analysis cluster at T3 |
| initiative | 34 (23/11) | 418 | **T4** (168) | 91/418 = 22% | intergovernmental / industry-body programmes |
| regional_data | 30 (21/9) | 267 | **T2** (111) | 127/267 = 48% | gov tariffs (T1‑2) + commercial rate data (T5‑6) |
| technology / innovation / tool | **0** | — | — | — | none in corpus today (floor is theoretical until items exist) |

**Conclusion the data forces:** a single tier floor is the WRONG instrument for non-reg. Applying the reg
T1‑2 floor would false-quarantine 76–88% of correctly-sourced market/research facts. Authority for these
types is not "is it primary legal text" — it is type-specific. The exemption was correct as an interim;
the calibrated gate below replaces "no floor" with an honest, type-appropriate one.

### Proposed per-type gates (grounded in source-credibility-model)
1. **market_signal / initiative → NOT a tier floor. A corroboration-count gate.**
   Per source-credibility-model Section 4, a signal's strength is N INDEPENDENT, tier-weighted
   corroborators (`aggregateConvergence`), not the authority of one source. Proposed gate: a CRITICAL/HIGH
   market_signal/initiative is grounded iff it carries ≥2 independent corroborators (syndication collapsed)
   with highest-citing-tier ≤ T4. **Until that gate is wired into `validate_item_provenance`, these stay
   EXEMPT (honest) — do NOT bolt a tier floor onto them.**
2. **research_finding → tier floor at T4, with T5‑6 forced to ANALYSIS.**
   Research's value is analytical/horizon-scan depth (think-tank T3, industry-body T4), not primary
   authority. Proposed: principal FACTs must be ≤ T4; T5 (news) / T6 (opinion) content must be
   ANALYSIS-labeled (not FACT); T7 (overflow) rejected. Preserves the T3 think-tank core (332 facts),
   catches the 49 T5‑6 facts presented as FACT.
3. **regional_data → per-SECTION, not item-level.**
   Operations facts are bimodal by design: feasibility/regulatory facts want T1‑3; cost-data facts (diesel,
   SAF, drayage rates) are legitimately T5‑6 commercial sources. An item-level floor is category-wrong.
   Proposed: feasibility-section FACTs ≤ T3; cost-section FACTs any tier WITH a registered source. This
   needs section-keyed floor logic (more than a one-line predicate) — **flag as its own follow-on**, keep
   regional_data EXEMPT until built.
4. **technology / innovation / tool → tier floor T5 (reject T7 only).**
   Technology Profiles ground in vendor announcements (T4‑5) + analytical press. 0 items today, so this is
   a forward default; ratify the value now so the gate exists when items arrive.

### What ratification unlocks
Only #2 (research_finding T4 floor + T5‑6→ANALYSIS) and #4 (technology T5 floor) are ready to codify as a
migration now. #1 (market/initiative corroboration gate) and #3 (regional_data per-section) are HONEST
deferrals to their own build dispatches — naming them here so the exemption is no longer a silent blanket.

---

## D2 — Two product decisions to FLAG

### D2.1 — `pending_human_verify`: retire or repurpose?
`provenance_status` enum carries `pending_human_verify`, but migration 121 removed human-in-the-loop
(uniform promotion: valid → verified). **0 items are in this status; nothing assigns it; nothing surfaces
it.** It is a dead enum value. Options:
- **(a) RETIRE** — mark deprecated; document that uniform promotion superseded it. Lowest friction.
- **(b) REPURPOSE** — wire it to the Phase 2 *counsel queue*: the priority_review / relabel residual
  (the ~290 non-recoverable below-floor facts + items that stay quarantined) are exactly "needs human
  sign-off before it can be trusted." Giving that residue a real `pending_human_verify` state + an admin
  review surface turns the honest-quarantine backlog into an actionable queue.
- **Recommendation: (b)** — the Phase 2 work just created the precise use case the status was designed for.

### D2.2 — Technology surface: sanction or fold?
Technology renders as a 6th sidebar nav surface, OUTSIDE the binding five-surface model
(Regulations / Market Intel / Research / Operations / Community). **0 technology/innovation/tool items
exist.** Options:
- **(a) FOLD** — remove Technology from nav; route technology items into Research (horizon-scan) and
  Market Intel (deployment signals) per `caros-ledge-platform-intent` (which already maps technology →
  those surfaces). Keeps the five-surface model intact; no skill change.
- **(b) SANCTION** — make Technology a real 6th surface. This MUTATES the binding five-surface model and
  per the platform-intent skill's Authority Grant requires explicit operator strong-emphasis authorization
  (a synthesis agent cannot do it by inference).
- **Recommendation: (a) FOLD** — 0 items + binding 5-surface model + zero skill-change cost. SANCTION is a
  deliberate product expansion that only Jason can authorize, and there's no content pressure forcing it.

---

## Ratification asks (one line each)
- **D1:** approve #2 (research_finding floor T4 + T5‑6→ANALYSIS) and #4 (technology floor T5) to codify as a
  migration now; confirm #1 (market/initiative corroboration gate) and #3 (regional_data per-section) as
  named follow-on dispatches (stay exempt meanwhile). Adjust any tier value.
- **D2.1:** retire vs repurpose `pending_human_verify` (recommend repurpose → Phase 2 counsel queue).
- **D2.2:** fold vs sanction Technology (recommend fold).

## D2 dispositions (ratified 2026-06-15)

### D2.1 — `pending_human_verify` → REPURPOSE for the counsel queue (approved). Implementation = scoped follow-on.
**Mechanical dead-verification (operator condition 1), all three confirm dead:**
1. ASSIGNMENT: only migrations 114/119 ever set it (criterion 6); migration 121 (uniform promotion) removed
   that and the current function (138/141) emits ONLY `verified`/`quarantined`. No live assignment path.
2. SURFACING: `grep pending_human_verify src/` = **0 references** — no UI/RPC reads or displays it.
3. LIVE COUNT: **0 items** in this status.
→ Truly dead; repurposing cannot mix two populations (no path sets it today).

**Proposed customer-surface state for a counsel-queued item (operator condition 2 — define before writing):**
- **Customer surfaces (the five pages): NOT shown as verified.** Customer RPCs gate on
  `provenance_status='verified'`; a counsel-queued item is `pending_human_verify ≠ verified`, so it never
  renders as trustworthy content. Satisfies "must NOT read as verified."
- **Must NOT silently vanish:** it surfaces in an ADMIN counsel-review queue (distinct from `quarantined`),
  labeled "awaiting human verification," actionable (operator verifies → `verified`, or sends back to
  `quarantined`). The distinction: `quarantined` = failed the gate (re-ground/fix needed);
  `pending_human_verify` = honest residual needing human sign-off before customer exposure (the Phase 2
  ~290 non-recoverable below-floor facts' items, and relabeled items awaiting confirmation).
- **No new customer-facing "pending" badge** is proposed — unverified content stays off customer surfaces
  per the integrity rule; the non-vanishing happens on the admin side. (Open for operator adjustment if a
  customer-visible "verification pending" state is wanted for known-anticipated items.)
- **Implementation deferred** to its own scoped dispatch (wire the trigger/function to emit
  `pending_human_verify` for the counsel residual + add the admin counsel-review surface).

### D2.2 — Technology surface → FOLD (approved). Implementation = scoped follow-on.
Remove Technology from the sidebar nav; route the 0 technology items into Research (horizon-scan) / Market
Intel (deployment signals) per `caros-ledge-platform-intent`. No skill change; reversible. SANCTION (6th
surface) is NOT authorized — it mutates the binding five-surface model and the platform-intent Authority
Grant requires explicit strong-emphasis authorization; with 0 items there is no case to mutate the core
model on inference. Implementation deferred to its own scoped dispatch (nav removal + routing).
