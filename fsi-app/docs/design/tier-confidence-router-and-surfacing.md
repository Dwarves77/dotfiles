# Tier → Confidence-Label Router + Moat Surfacing

Status: DESIGN LOCKED with Jason 2026-06-25. Supersedes the binary per-type authority floor's
treatment of sub-floor claims (migration 141) by adding a gradient ROUTER and reverses
`source-credibility-model` Section 8's "show customers the T1–T7 badge" doctrine.

Nothing builds against this doc until Jason ratifies the label-register wording (§3) and the
two-workstream scope (§7). This is the verification-before-authorization investigation artifact.

---

## 1. The bug (verified in code)

The 7-tier credibility gradient (`src/lib/trust.ts` TIER_WEIGHTS: T1=1.0 … T7=0) is **collapsed in
two opposite directions** by `validate_item_provenance` (migration 141):

- **FACT** collapses the gradient to a per-item-type BINARY (`source_tier_at_grounding > v_floor_max
  → fail`, criterion 3, lines 225–239). A reg FACT at T3 and at T6 fail identically — the gradient
  between them is discarded.
- **ANALYSIS** ignores the gradient ENTIRELY (criterion 4 only checks label-token presence, lines
  242–282; ANALYSIS claims are stamped `source_tier_at_grounding = NULL` at
  `canonical-pipeline.ts:672`). A T3-credible analysis and a T6-opinion analysis are
  indistinguishable.

The middle of the gradient (T3–T6), where credible-vs-weak actually matters, is used by neither
path. The existing mitigation ("relabel sub-floor FACT → ANALYSIS",
`scripts/phase2-analysis-relabel.mjs`) moves a claim from the collapsed-binary bucket into the
ignored-entirely bucket — it deepens the problem rather than honoring the gradient.

## 2. The design — two orthogonal axes that COMPOSE

One trustworthiness ranking (the tier) drives a label; a separate when-question drives a section.
They are independent and combine.

| Axis | Question | Sets | Mechanism |
|---|---|---|---|
| **Authority tier** (T1–T7) | how trustworthy is the source | the **confidence label** | pure deterministic function of `source_tier_at_grounding` |
| **Temporal status** | enacted-now vs forthcoming/in-progress | the **section** | enacted → body section; forthcoming → the format's forward section |

Worked: **CBAM** 9 amendment facts = T3 (ICAP) → *credible* label, **AND** forthcoming → route to
S6 (Anticipated Guidance) + MONITORING. **EUDR** 5 contextual facts = T3 (WRI) → *credible* label,
**AND** current → kept in place (body). Collapsing to one axis mishandles one of them.

**The label is the tier's plain-language face, never a second ranking and never a stored field.** It
is rendered from the tier at display time by a fixed mapping, so it can never drift out of sync.
There is NO confidence column and NO `claim_kind = SIGNAL`; the tier is the single source of truth.

## 3. The confidence-label registers (PURE function of tier) — RATIFY THE WORDING

`confidenceLabel(tier)` — one module, the single source of truth, consumed by every surface:

| Tier | Register | Customer/admin wording (proposed — ratify) |
|---|---|---|
| T1–T2 | confirmed fact | **"Confirmed — grounded in [instrument, article]"** |
| T3–T4 | credible analysis | **"Credible analysis — [source]"** |
| T5 | early signal, reported | **"Early signal — reported, not yet confirmed"** (a real development reported, not yet official) |
| T6–T7 | early signal, analytical | **"Early signal — analytical, unconfirmed"** (analysis of what may come) |

The two early-signal registers (T5 news vs T6–T7 opinion) come from the tier itself
(`source-credibility-model` §3: T5 = factual news, T6 = analysis/opinion, T7 = overflow), so the
register stays a pure function of tier. Routing (forward-section + lower-authority treatment) is
identical for the whole T5–T7 band; only the label *wording* distinguishes the two registers.

## 4. WS1 — the router (generation + validation; data correctness)

Autonomous; no human gate (stays inside the runtime-autonomy boundary).

1. **Stamp tier on ANALYSIS claims** (`canonical-pipeline.ts:672`). Today only FACT carries a tier;
   ANALYSIS = NULL. The gradient and the render-label both need ANALYSIS to carry its grounding
   tier. LEGAL (callout) and GAP stay NULL.
2. **Contract** (`system-prompt.ts`): sub-floor / contextual / forward facts are emitted as
   ANALYSIS with the existing label tokens, placed in the format's forward section when forthcoming.
   The model labels FACT vs ANALYSIS and current vs forthcoming; it does NOT emit a confidence token
   (that is render-derived).
3. **Validator** (new migration over `validate_item_provenance`):
   - **Criterion 3 (FACT floor) stays** as the backstop — a sub-floor FACT still fails — but the
     intended cure is relabel-to-ANALYSIS (contract/script), not permanent quarantine.
   - **Criterion 4 gains the gradient check on ANALYSIS:** ANALYSIS must carry a non-NULL tier
     stamp + a label token; a **T5–T7 ANALYSIS claim must sit in a forward-eligible section**
     (reg S6 / research S5 / market S1–S3 by `section_key`) — speculative content in a
     body/requirement section is a failure.
   - **Legal-line guard (the anti-laundering rule):** a claim carrying present-tense enacted-law
     modals (`requires|must|mandates|obligates|prohibits|applies to`) that is sub-floor CANNOT
     relabel-to-ANALYSIS to escape the floor — it is a T1/T2 FACT or a `*Legal Confirmation
     Required:*` callout, or it is wrong. Only **forward-framed** claims (forthcoming / proposed /
     will / expected) take the early-signal route. (Heuristic: modal + tense markers; flagged as
     iterable — present-tense-vs-forward detection is the weak point to watch.)
4. **Backward relabel** (`scripts/phase2-analysis-relabel.mjs` generalized): for the 131, relabel
   sub-floor FACT → ANALYSIS, stamp tier, move forthcoming claims to the forward section, apply the
   legal-line guard (present-tense enacted claims are flagged for re-source, NOT laundered).

## 5. WS2 — the moat surfacing (presentation)

Expose THAT we grade and THAT it holds; hide HOW.

- **Expose** (customers AND admins): the 3-register confidence label + the checkable citation
  (article-level law on Confirmed claims). Admins additionally see the **grounding detail** (source
  + span) to verify a citation holds — the audit question is "does this confirmed claim ground in
  the law it cites", not "what's the tier number".
- **Hide** (backend-only, rendered NOWHERE — customer or admin): the 7-tier scale, the numeric
  weights, per-host classifications, the floor/router logic, authority-origin rules. No "T1/T3/T6",
  no 7-value type-ladder.
- **Build:** a single `confidenceLabel(tier)` fn; replace the 11 numeric-tier render sites (audit
  2026-06-25 — 7 customer-facing: AskAssistant citation pill, SourceProvenanceBadge, CredibilityBadge,
  regulations SourcesList, research + market tier legends; 4 admin: SourceHealthDashboard,
  CanonicalSourceReview, ProvisionalReviewCard, TierOpinionDisagreementsView) with the derived label
  + citation. Admin tier-selection controls (override / classify) express choices qualitatively, not
  as T-numbers.
- **Skill rewrite:** `source-credibility-model` Section 8 signal-set table + "Vocabulary
  consistency" — customers/admins see the qualitative confidence register + citation; the numeric
  tier is backend-only; admin gets grounding detail, not the tier number.

## 6. CBAM + EUDR resolution (the two test cases)

| Item | Tier | Label (axis 1) | Temporal (axis 2) | Section | Outcome |
|---|---|---|---|---|---|
| CBAM 9 amendment facts | T3 (ICAP) | "Credible analysis — ICAP" | forthcoming | S6 Anticipated Guidance + MONITORING | relabel FACT→ANALYSIS; forward-framed ("the proposed amendment would…") passes the legal-line guard; KEPT |
| EUDR 5 contextual facts | T3 (WRI) | "Credible analysis — WRI" | current | body (in place) | relabel FACT→ANALYSIS; previously QUARANTINED → now KEPT with honest T3 provenance |

Neither renders "T3" to anyone; both render "Credible analysis — [source]".

## 7. Scope, sequencing, spend

- **WS1 first** (unblocks the 131 backward batch + clears the Data-audit lane — the actual
  problem). Code only, $0, except prove-on-one CBAM + EUDR (~$1.50 each) before the 131 batch. The
  131 batch quote (~$131–197, regenerate + free legal-host fetch, NO web_search) stands and runs
  only after prove-on-one + Jason's go.
- **WS2 second** (presentation; the label is render-derived so it layers on after WS1 stamps tiers
  correctly). Pure code, $0.
- **Skill edits ride WITH each workstream** (env-policy + analysis-construction with WS1;
  source-credibility-model Section 8 with WS2) — mechanism and doctrine land together.
- **Recurrence-signal** mechanism (prevent = the router as a mechanical default; catch = a check red
  across N runs forces root-cause) tracked separately, built alongside.
