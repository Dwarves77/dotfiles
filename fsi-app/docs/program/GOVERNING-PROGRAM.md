# Governing Program — Caro's Ledge Remediation + Build

> **This is THE contract.** One artifact holding the decided program: the phases, their locked
> decisions, the dependency order, and per-phase the concrete code-dependencies each phase's plan
> rests on (the "re-ground anchors"). It is NOT scattered across chat / design-docs / memory — this
> file is the governing plan. Seed and amend it here; everything downstream plans against it.
>
> **The re-grounding gate (mechanical, not remembered).** Consistency check **C5**
> (`.discipline/consistency/checks/C5-program-anchors-reality.mjs`, invariant **RG-1**) reads the
> `ACTIVE_PHASE` below, finds that phase's `anchors` block, and verifies each declared substring is
> still `present`/`absent` in the actual code. If a prior phase changed the code a later phase's plan
> assumed, C5 fails loud at pre-push + CI and names exactly what drifted — the phase cannot execute on
> a stale plan. This converts "re-read the code before each phase" from an honor-system habit into a
> structural requirement, the same judgment→mechanical conversion applied to the pause gate, the
> render-derive stance, and the moat assertion.
>
> **How to use it.** Before a phase executes: set `ACTIVE_PHASE` to that phase's id, run the
> consistency runner (`node .discipline/consistency/runner.mjs --check=C5`). GREEN = the plan still
> matches the code, proceed. RED = the named anchor drifted; re-read that code, correct THIS phase's
> plan (and its anchors) before building. When a phase lands and changes code, update its own anchors
> to the new reality in the same change.
>
> **Anchor grammar** (inside a fenced ```anchors block): one per line —
> `present :: <repo-relative-file> :: <verbatim substring>` (substring MUST exist) or
> `absent :: <repo-relative-file> :: <verbatim substring>` (substring MUST NOT exist). C5 reads the
> ACTIVE phase's block only.

ACTIVE_PHASE: phase-2

---

## Locked decisions (the program is decided; execution is in dependency order, not per-phase approval)

- **D1 — `source_tier_at_grounding` = CACHE** → render-derive it from `source_id` at display; stop
  storing it as authoritative on FACT claims. The DB floor resolves tier inline from
  `source_id → sources.(tier_override ?? base_tier)` (moat-pure, drift-proof). Root cure for the
  week-long data-audit lane red. Do NOT re-run the backfill first (re-bakes the ambiguity).
- **D-moat — base_tier-only for reg-fact eligibility.** Dynamic reputation (`effective_tier`) and
  time-in-system never confer reg-fact grounding eligibility; reputation earns a SIGNAL trust within
  the signal tier, it never promotes a signal to a fact. Hardened in code (`tierOfSource` =
  `base_tier ?? null`) and now guarded by fitness F12 / invariant SC-9 (A1).
- **D-immune — small by design.** ONE new producer→consumer orphan check (A2, dead-subsystem
  ceiling), ONE stance (render-derive-by-default), a FEW targeted assertions (the moat, A1), TWO
  process disciplines (plans cite code — this mechanism; prove end-to-end). Resist adding more.
- **D-community — conversation is social, the submission tool is the one bridge.** The
  groups/posts/members conversation layer grounds nothing (resolves corpus-vs-social: social, full
  stop). A distinct member-invoked submission tool (URL required, optional steering note) is the only
  Community→corpus bridge; the finder confers zero tier; only the authoritative primary the system
  finds-and-tiers ever grounds.
- **D-map — gate markers to regulations.** The Map is a view over Regulations; its markers must be
  regulation-domain-gated (closing the live geographic moat-blur). Multi-tier geographic layering is a
  deliberate future feature carrying a fact/signal visual-distinction requirement, not a fix now.
- **D-two-tier model.** FACT tier (verified, checkable, grounded in domain-authoritative primaries —
  spanning Regulations / Operations / Research) vs SIGNAL tier (Market Intel, early, unverified-by-
  design). The T1–T7 authority gradient operates WITHIN each role. The only bridge signal→fact is
  verification against the domain's authoritative primary.

---

## Phases (dependency order)

### phase-A1 — Moat-boundary assertion + drop effective_tier from the grounding resolver  ✅ LANDING
Status: shipping in the immune-foundation unit with this mechanism.
- Promote the pure resolver proof to a committed selftest (`src/lib/sources/institution.selftest.mjs`).
- Fitness F12 (`F12-moat-base-tier`) spawns it; invariant SC-9 maps F12 (meta-gate green).
- Drop `effective_tier` from the grounding resolver SELECT (`canonical-pipeline.ts`) so the leak is
  impossible-by-construction (the value the regression would fall back to is no longer fetched).
```anchors
present :: fsi-app/src/lib/sources/institution.ts :: (s.base_tier ?? null)
```

### phase-4 — Floor render-derive (D1)  ✅ DONE 2026-06-29 (master pending merge)
DONE: migration 145 — `validate_item_provenance` criterion-3 floor derives the FACT tier inline from
`source_id → COALESCE(tier_override, base_tier)` (base_tier-only + sanctioned override, never
effective_tier — moat-pure; read live — drift-proof). claims-tier audit re-pointed from
stored-==-resolveSpan(URL)-NOW to **derivation-consistency** (stored == source_id-derived) → lane GREEN.
**0 blast radius proven**: 0 drift on the source_id basis, 145 output == 143 output for all 658 items
(the lone confirm-script "flip" was a stale-stored-status false positive — 143 quarantines it
identically). The "41 non-FACT → NULL" and "264 re-stamp" premises were already cured (0 found) — moot;
the backfill was NOT re-run. The stored `source_tier_at_grounding` is now a pure cache the floor ignores
→ drop in phase-7. SEPARATE small follow-ups (not blockers): release the 1 stale-quarantined item
(50ccd5cc, forgiving direction); the empty-span-URL data-quality note; sinir.gov.br canonicalize + the
expired deferral.
```anchors
present :: fsi-app/supabase/migrations/145_provenance_floor_inline_derive.sql :: COALESCE(src.tier_override, src.base_tier)
```

### phase-intake-gate — Source-role congruence + subject-existence dedup + entity extract→resolve→wire  ⏳ DEFINED (activates ahead of phase-2 when the atomic unit lands)
CONTRACT: `docs/design/intake-gate-plan.md` (v2.2 — the full spec this phase's anchors verify).
One intake discipline, all gate DECISIONS inside the shared chokepoint `mintIntelligenceItem()` (BOTH mint paths call it — Path A `drain-first-fetch`/`seedStubIntelligenceItem`, Path B `staged_updates`/`applyUpdate:new_item`; neither self-INSERTs). Classify layers only precompute inputs. (1) source↔claim-type congruence — (1a) primary-artifact type on a news source → retype to market_signal; (1b) research_finding on a press-release/news source → keep the type, demote the press release to corroborator, surface to seek the study as primary (regional_data evaluated + EXCLUDED: news is a congruent primary for its cost-data); (2) subject-existence
dedup at the chokepoint (high-precision `matchExistingSubject`); (4) Fork-4 relevance branch (surface-only data_quality flag, NEVER blocks a mint; enforcement waits for labeled-data precision); (3) deterministic entity
extract (wide detect) → resolve → wire (narrow) feeding the EXISTING `item_cross_references` (SoT; `related_items`
render-derives from it). Moat boundary: extraction writes cross-ref EDGES, never grounding CITATIONS. Ambiguous/
unknown-standard → surfaced to `integrity_flags`, never dropped. Bypass-proof: no INSERT into intelligence_items outside `mint-item.ts` (fitness fn, red-then-green). ACTIVE_PHASE flips here as the FINAL build step,
when these anchors match code (never active-with-failing-anchors):
```anchors
present :: fsi-app/src/lib/intake/mint-item.ts :: function mintIntelligenceItem
present :: fsi-app/src/lib/entities/entity-resolve.mjs :: export function resolve
present :: fsi-app/src/workflows/generate-brief.ts :: linkStep
present :: fsi-app/src/lib/entities/entity-resolve.mjs :: LINK_ALLOWED_TABLES = ["item_cross_references", "integrity_flags"]
```

### phase-2 — Source → sub-source hierarchy
Re-parent the multi-page rows as sub-sources under their institution (not collapse, not peers); tier
lives on the source, sub-sources inherit, no override; source dark → sub-sources dark; collapse the
exact-URL dups; resolve the sinir.gov.br tier conflict. Render-derive-first (inherited tiers, not
stored-and-synced). Designed WITH the engine's cross-page linkage (the change-scan operates over the
source→sub-source structure: a sub-source's change is a source's change).
```anchors
present :: fsi-app/src/lib/sources/institution.ts :: hostInstitution
```

### phase-3 — Freshness loop + system-wide change-scan + cross-page linkage + fruition
Revive the dormant change loop: un-hardcode `change_detected` (currently `false` in check-sources),
hash/diff the rendered body (currently discarded), schedule reconcile under the scrape cadence
(`scrapeWindowOpen`), broaden reconcile's per-source scope to a system-wide cross-page scan. Give
`item_cross_references` a live writer (real item→item edges) for cross-page linkage. Build fruition
(temporal signal→fact confirmation edge + detector + a new reputation metric class; widen the
`source_trust_events.event_type` CHECK). Map Q1 (change-aware spatial render) folds in here.

BASELINE + GROWTH FRAMING (recorded 2026-06-29, from Phase 4 — core to "everything grows"): the system
is BASELINE + GROWTH. The initial audit/grounding SETS the baseline (the fixed reference a thing is
grounded against); everything then moves POSITIVE or NEGATIVE from that baseline as intelligence
accumulates; current state = baseline + accumulated movement, and THE MOVEMENT IS THE INTELLIGENCE
(which sources trend up/down, which claims strengthen/weaken). Design Phase 3 as "set baseline, then
grow from it (positive/negative) on new intelligence" — NOT as "store value / prevent drift". Phase 3
MUST own:
  • REGISTRY-GROWTH RE-GROUND TRIGGER: when a host becomes registered (or new intelligence bears on a
    claim), re-ground the related claims — moving them positive from baseline, a NEW grounding event
    reflecting current knowledge; the old record stays as history (the growth trail). The claims-tier
    audit DELIBERATELY STOPPED doing registry-growth re-attribution in Phase 4 — so Phase 3 MUST do it,
    or claims go static (violating the whole point). The audit sets/verifies the baseline; the growth
    engine moves from it.
  • Mirrors D1 dynamic reputation: base_tier = the BASELINE (reg-facts anchor to a fixed reference);
    effective_tier = the CURRENT POSITION (tracks the movement); the GAP between them IS the growth
    signal. base_tier fixed (the reference), effective_tier fluid (the growth), the gap = the
    intelligence. Everything fluid except the baseline reference itself.
```anchors
present :: fsi-app/src/app/api/worker/check-sources/route.ts :: change_detected
present :: fsi-app/src/app/api/worker/reconcile/route.ts :: monitoring_queue
```

### phase-community — Conversation layer (kept) + the submission/lead-triage tool (built)
Conversation layer (groups/posts/members) grounds nothing — leave as the live social system; the
migration-007 forum layer stays dead. The submission tool: `POST /api/community/sources/submit`
accepting `{url, optional note}`, member recorded as finder-provenance only (zero tier),
`discovered_via='community_submission'`. Triage on the FETCHED page: Branch 1 (page is a primary) →
verifyCandidate the source; Branch 2 (page is a news LEAD) → find the authoritative primary behind it,
verifyCandidate THAT (the article gets nothing) — NET-NEW beyond verifyCandidate; Branch 3
(unresolvable) → notify a real Admin "needs manual research" queue (a producer needing a real
consumer). Moat holds at every branch. The `kind='direct'` promote bypass was REMOVED 2026-06-28
(closed as a grounding-bypass defect): promotions are staged-only — a post never becomes an
intelligence_item directly; it goes through staged_updates → admin review → grounding. The anchor
below guards against re-introducing a direct intelligence_items insert.
```anchors
present :: fsi-app/src/lib/sources/verification.ts :: verifyCandidate
absent :: fsi-app/src/app/api/community/posts/[id]/promote/route.ts :: .from("intelligence_items")
```

### phase-map-q2 — Gate Map markers to the regulations domain (live moat-blur defect)
The masthead says "Regulations by jurisdiction" but markers count all item_types with no fact/signal
visual distinction. Gate the marker layer to the regulations domain (mirror the masthead's existing
`domain === REGULATIONS_DOMAIN` gate). Folds in alongside Map Q1 in phase-3, or lands standalone.
```anchors
present :: fsi-app/src/components/map/MapPageView.tsx :: REGULATIONS_DOMAIN
```

### phase-A2 — Producer→consumer orphan check (independent; slots in any time)
Static `src/`-only table-level writer-without-reader check at the honest ceiling (catches the
dead-subsystem class — `notification_events`/`_deliveries`/`_subscriptions`), on the
`invariant-coverage.mjs` template + a hand-curated reason-bearing terminal-sink allowlist + a negative
self-test. Does NOT chase the wrong-column class (covered by A1 + render-derive instead).
```anchors
present :: fsi-app/.discipline/governance/invariant-coverage.mjs :: git ls-files
```

### phase-7 — Dead-code + schema cleanup (LAST)
Verify zero-reader against the live graph (A2 makes this rigorous), snapshot, reversible. Targets:
`notification_*` subsystem, dead `trust.ts` exports, the 094 `sources.tier` compat-shim drop, and the
now-redundant `source_tier_at_grounding` column once phase-4's floor derives inline.
```anchors
present :: fsi-app/supabase/migrations/094_tier_compat_shim.sql :: tier
```
