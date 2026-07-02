# phase-intake-gate — CONTRACT (governing-program phase; C5 anchors reference this doc)

Status: **APPROVED design, awaiting build.** This is the CONTRACT for governing-program phase `phase-intake-gate`
(activates ahead of phase-2). C5 verifies code against the anchors this doc declares.
Date: 2026-07-01 (v2.2 — mintIntelligenceItem() shared chokepoint + two-path mint reality + Fork-4 relevance branch; v2.1 research_finding fold; v2 post-tightening). Author: CC. Basis: verified against schema + live data (citations inline).

## Verified diagnosis (why this build exists)
- Intake **only synthesizes** mentioned entities into prose; there is **no structured entity layer**. On the 3 GLEC items `instrument_identifier` is `null`, `compliance_object_tags` are supply-chain *roles*, `cross_references` empty — yet all three briefs+pools **name "ISO 14083" and "GHG Protocol"** in text. Producer-with-no-consumer.
- Matching (dedup, `detect_intersections`) runs on **titles + role/scenario tags + agent-emitted `related_items`**, never on "content names entity X's identifier" — why `FuelEU ≡ 2023/1805` slipped; the live GLEC↔ISO-14083 edges came from **manual** curation.
- Content is **not full-text-indexed** (only trigram index is `vendors.name`, a dead forum table).
- `item_cross_references` (mig 004) **exists** (49 rows, holds GLEC↔ISO-14083↔CountEmissions) but **autonomous intake never writes it** — written only by admin scripts. `50ccd5cc` proves the bypass: 0 edges, 0 `related_items`, minted isolated.
- **TWO mint paths, not one (surface-review 2026-07-01 — corrects Tightening 1's "single chokepoint at staged_updates").** (A) the **source-monitoring worker** `drain-first-fetch` mints DIRECTLY via `seedStubIntelligenceItem` (a direct INSERT into `intelligence_items`, `route.ts:557`) — this is the PRIMARY intake and the path that produced all 38 pre-gate polluters; (B) `staged_updates` materialization (`applyUpdate:new_item`) from scan + community-promote. The prior build placed congruence + dedup on (B) only; (A) had neither. **Resolution: a single `mintIntelligenceItem()` function both paths call; gate DECISIONS live inside it; neither caller self-INSERTs.** (linkStep, piece 3, already covers both — it runs post-generation and both paths reach `/api/agent/run`.)

## One discipline, three integrated pieces — all gate DECISIONS inside `mintIntelligenceItem()`
```
Path A: drain-first-fetch ─┐
  (precompute: verdict,     │
   item_type, source-role,  ├─► mintIntelligenceItem(plan) ─► (1) CONGRUENCE ─► (2) DEDUP ─► (4) RELEVANCE(surface-only)
   relevance)               │         (THE chokepoint —        (retype/flag)     (mint or       (flag low, never block)
Path B: applyUpdate:new_item ┘        the ONLY INSERT site)                        link-to-existing)
                                                                                        │
                          (3) ENTITY EXTRACT→RESOLVE→WIRE  ◄──── post-generation, both paths via /api/agent/run
                              (deterministic; feeds the EXISTING item_cross_references)
```
**Placement constraint (binding, dispatch §1).** Classify layers (`first-fetch-classify`, `applyUpdate` pre-processing) may *precompute* the inputs (verdict, item_type, source-role, relevance). The accept/reject/retype/dedup DECISIONS run at the chokepoint — NOT in `first-fetch-classify` (congruence there recreates the current defect mirrored onto Path B, which never touches that file). Both `seedStubIntelligenceItem` and `applyUpdate:new_item` become callers of `mintIntelligenceItem()`; neither performs its own INSERT.
(3) makes (2) reliable instead of title-dependent; (1) decides what (2) matches; (4) is surface-only (Fork 4).

## Atomic build unit (ships together, sample-proven, or not at all)

New single-source modules (can't drift into copies — DOMAIN/severity Step-3 lesson). **File extension is `.mjs`** (node-builtins only, so the depless discipline CI runs the tests) — the anchors and every reference use `.mjs`, not `.ts`:
- `src/lib/entities/canonical-entities.mjs` — dictionary + identifier regexes (Fold 1). **BUILT.**
- `src/lib/entities/entity-resolve.mjs` — `detectMentions(text)`, `resolve(mention, corpus)`, `classifyBucket(mention)`, `planLinks`, `planLinkWrites`, `assertMoatBoundary`, `matchExistingSubject`; promoted from the proven `_wave-dedup3` matcher; shared by dedup AND extraction. **BUILT (13/13 tests green).**
- `src/lib/entities/source-role.mjs` — `sourceRole(url)`, `congruentType(itemType, url)` (1a), `PRIMARY_ARTIFACT_TYPES`, `STUDY_BACKED_TYPES` (1b). **BUILT.**
- `src/lib/intake/mint-item.ts` — **the shared chokepoint** `mintIntelligenceItem(sb, plan)` (NEW; §"Shared mint chokepoint" below). The ONLY code path that INSERTs into `intelligence_items`.

**(1) Source-role congruence gate** — decision in `mintIntelligenceItem()`; source-role precomputed in `src/lib/entities/source-role.mjs`
- Deterministic source-role: `NEWS_RE` (`/news/ /press/ /media/…`) vs `PRIMARY_URL_RE` (eur-lex, legislation.gov.uk, federalregister, `.pdf`, `/documents/`, `/eli/`, CELEX) — patterns proven in `_cat-audit.mjs` (7/155 flagged).
- The gate enforces source↔claim-type congruence, and there are **TWO distinct incongruence shapes with DIFFERENT remedies** (v2.1 tightening — do NOT collapse them into one type set):
  - **(1a) TYPE-incongruence — primary-artifact type on a news source.** `entity_verdict=specific_document` AND `item_type ∈ {regulation,directive,standard,guidance,framework}` AND source-role=news → **retype to `market_signal`**. The TYPE was wrong: a regulation-on-news is really a signal ABOUT the regulation, and news IS a signal's correct primary. Retyped, never discarded. (`PRIMARY_ARTIFACT_TYPES`.)
  - **(1b) SOURCE-incongruence — research_finding grounded on a press release / news.** `item_type = research_finding` AND source-role=news → the TYPE **stays** `research_finding` (it genuinely IS research); the defect is the SOURCE. **Demote the press release to a corroborator and SURFACE to seek the study/report as the primary** (`integrity_flags`, `category=data_quality`, seek-canonical-study) — do **NOT** retype to `market_signal` (that would lose the research nature — a *different* pollution). One line in the contract now; the study-sourcing remediation is its own class later. Live case: **MIT Climate item `88c3a053`** — a `research_finding` whose S6 lists a PR Newswire press release as "Primary source". (`STUDY_BACKED_TYPES = {research_finding}`.)
  - **regional_data — evaluated, NOT added.** A `regional_data` item legitimately grounds its cost-data sections on news / industry reporting (a freight index, a published rate); news is a *congruent* primary there, like a market_signal. Its feasibility sections require ≤T3, which the **per-section tier floor** (source-credibility-model) already enforces — not the source-role gate. Adding regional_data would false-flag legitimate regional cost signals. **Excluded, with this reason on record** (revisit only if a concrete miscategorization surfaces).
- Proof: `source-role.test.mjs` gains a 1b case (research_finding + news URL → type unchanged, `sourceIncongruent=true`, surfaced) alongside the existing 1a retype cases.

**(2) Subject-existence dedup** — inside `mintIntelligenceItem()`, covering BOTH mint paths
- CORRECTED (surface-review 2026-07-01): the "single chokepoint at `staged_updates`" claim was **false** — `drain-first-fetch` mints directly (Path A, `route.ts:557`). Dedup therefore lives in `mintIntelligenceItem()`, which BOTH `seedStubIntelligenceItem` (A) and `applyUpdate:new_item` (B) call. There is no per-route dedup.
- Before minting, `matchExistingSubject(candidate, corpus)` (high-precision: instrument_identifier / normalized source_url / shared reg-# — NOT title-similarity) against the live corpus:
  | new item | existing subject? | action |
  |---|---|---|
  | primary src | none | mint primary-artifact |
  | news src | none | mint `market_signal` |
  | primary src | yes (existing news/thin) | route to re-source canonical, no dup |
  | news src | yes (primary exists) | mint `market_signal` + write `item_cross_references` edge → primary |
- **Bypass-proof (dispatch §2, A2 pattern):** `mintIntelligenceItem()` is the SOLE INSERT into `intelligence_items`, enforced by a fitness function (below), demonstrated red-against-a-simulated-bypass then green — so "single chokepoint" is an INVARIANT, not an assertion.

**(2b) Shared mint chokepoint** — `src/lib/intake/mint-item.ts`
- `mintIntelligenceItem(sb, plan)` receives a `plan` carrying the precomputed inputs (`sourceUrl`, `itemType`, `sourceRole`, `entityVerdict`, `relevance`) + seed fields. It runs, in order: **(1) congruence** (1a retype / 1b surface-seek-study), **(2) dedup** (`matchExistingSubject` → mint | link-to-existing), **(4) relevance** (Fork-4, surface-only), then the single INSERT. Returns `{ itemId, action: 'minted'|'linked'|'retyped', flags: [...] }`.
- Callers: `seedStubIntelligenceItem` (A) and `applyUpdate:new_item` (B) delete their own INSERT and call this. The stub-seed shape (Path A's minimal seed for `/api/agent/run`) is preserved — the chokepoint accepts a `seedOnly` flag so Path A still mints a stub, Path B a full staged row.

**(4) Relevance branch (Fork 4 — surface-only, NEVER blocks)**
- The Haiku classify output (`first-fetch-classify`) gains a `relevance` dimension (prompt surface only — NO new call). `mintIntelligenceItem()` carries a **stubbed third branch**: on low relevance it writes a `data_quality` integrity_flag (`created_by='intake-relevance'`) and **mints anyway**. Enforcement (blocking) waits for proven precision against labeled data — the branch exists for future promotion, not to gate today. This is the logged topical-relevance gap (sub-class c), made observable without a new enforcement path.

**(3) Entity extract → resolve → wire** — new `linkStep` after `growStep` (`src/workflows/generate-brief.ts:393`; content available post-ground)
- DETECT (no LLM; wide net — Tightening 3) → RESOLVE → WIRE (narrow).
- WIRE writes `item_cross_references` edges; `related_items` render-derives from them (Confirmation 1).

## Fold 3 / Tightening 3 — DETECTION is WIDER than WIRING (fails safe for real)
Two concentric nets:
- **DETECT (noticed, wide):** identifier regexes (`\bCELEX:\w+`, `\b(19|20)\d{2}/\d{1,4}\b`) + **standard/reg-SHAPED** patterns (`ISO/IEC \d+`, `EN \d+`, `Regulation|Directive \(EU\) …`, capitalized multi-word `… (Framework|Standard|Protocol|Directive|Regulation|Act)`) + dictionary named-entities.
- **WIRE-eligible (linked, narrow):** ONLY {identifier exact-resolves to one item, dict-named-entity exact-resolves to one item}.
- A DETECTED standard/reg-shaped mention **outside** the wire-eligible set (unknown to dict, no exact item) is **SURFACED, never dropped** (Fold 1). Detection⊋wiring is what makes "fails safe" real.

Bucket rule (mechanical — kind, not a runtime score):
| bucket | example | action |
|---|---|---|
| IDENTIFIER / DICT-NAMED exact → one item | `2023/1805`, `CELEX:…`, "ISO 14083" | **WIRE** |
| TOPICAL TOKEN | "batteries", "emissions", "hydrogen" | **NEVER wire** (shared word ≠ match) |
| AMBIGUOUS (close-not-exact; identifier→>1 item) or UNKNOWN standard-shaped | new "ISO 14084" not in dict | **SURFACE to Admin** |

## Fold 1 — Dictionary is a living, drift-prone asset
- Lives in `canonical-entities.ts` — ONE source (like `domains.ts` post-Step-3); a `vocab-drift-guard` test pins it (Step-3 pattern) so additions are deliberate.
- Detected-but-not-in-dictionary standard-shaped mention → **captured + surfaced** (never silently dropped). Regex identifiers need no dictionary; only the named list drifts, and it fails safe via the wide detection net.

## Fold 2 / Tightening 2 & 4 — Producer+consumer+SURFACE ship as ONE unit; prove BOTH samples
- Extract (producer) + resolve + wire (consumer) + **surface (the AMBIGUOUS/UNKNOWN consumer)** land together. **Surface target = `integrity_flags`** (Tightening 2 — VERIFIED the existing live Admin queue: `PlatformIntegrityFlagsView`, category+status; written today by d3-hooks/truncation). New category `entity_candidate` (or reuse `data_quality`). Don't surface into nothing.
- Sample-proof (build tests) — must include the **MISSED** case, not just the curated one:
  1. **Curated case:** GLEC content names "ISO 14083" → `detectMentions` → dict-named → `resolve` → item `7d2f8d88` → edge `3581c084 -[references]-> 7d2f8d88`.
  2. **MISSED case (the one the layer exists to catch):** content names `2023/1805` → `resolve` → FuelEU item `e4d84c60` **despite no title overlap** → edge written.
  3. **Negatives:** "emissions" (topical) → **no** edge; unknown standard-shaped ("ISO 14084") → **surfaced to `integrity_flags`, not dropped**.

## Moat boundary (explicit + enforced)
Extraction writes **cross-reference EDGES (`item_cross_references`), NEVER grounding CITATIONS (`section_claim_provenance`)**. A `market_signal` naming a reg-# gets a *references* edge — it does NOT ground the regulation's facts. Grounding stays reserved for primary-instrument sources. Guard test: the `linkStep` path must not touch `section_claim_provenance`.

## Confirmation 1 — item_cross_references is the SINGLE SOURCE OF TRUTH; related_items is a PROJECTION
- VERIFIED: `item_cross_references` (mig 004) = `(source_item_id, target_item_id, relationship, UNIQUE(src,tgt))`, **no `origin`**. `related_items` = separate agent-emitted `UUID[]` read by metadata/ask/b2-progress routes. They can drift.
- Resolution: **`item_cross_references` is the SoT** for all item↔item links. Add an `origin` column (`agent_semantic | entity_extraction | manual`) so the agent's semantic intersections AND the deterministic extractions both land as edges, distinguished. **`related_items` render-derives from `item_cross_references`** (view/RPC or read-time projection) — never independently stored — so it cannot drift. Single writer per origin.

## Enforcement — C5 phase + invariants
- Governing-program phase `phase-intake-gate`, ACTIVE **ahead of phase-2** (flipped as the FINAL build step, when the anchors match code — never active-with-failing-anchors). C5 anchors:
  - `present :: src/lib/intake/mint-item.ts :: function mintIntelligenceItem` (the chokepoint — where congruence + dedup DECISIONS run; token omits `async` so it matches the decl)
  - `present :: src/lib/entities/entity-resolve.mjs :: export function resolve`
  - `present :: src/workflows/generate-brief.ts :: linkStep`
  - `present :: src/lib/entities/entity-resolve.mjs :: LINK_ALLOWED_TABLES = ["item_cross_references", "integrity_flags"]` (moat boundary — the link path's allow-list is EXACTLY those two tables; adding a grounding table like section_claim_provenance changes the literal and trips this anchor. A plain `absent` string anchor is unusable — every file that *names* section_claim_provenance in a comment/erase-path would false-fire. Runtime guard: `assertMoatBoundary`, with a demonstrated failing mode in the unit test.)
- Invariants (meta-gate → fitness functions):
  - **Single-mint-chokepoint (dispatch §2):** no `.from("intelligence_items").insert(` outside `mint-item.ts` — the bypass-proof self-test, red-against-simulated-bypass then green.
  - A1 audit CI guard — (1a) no primary-artifact item on a news `source_url` un-reclassified, AND (1b) no `research_finding` whose primary `source_url` is a news/press page left un-surfaced (seek-canonical-study flag open).
  - never-wire-on-topical-token; dictionary single-source; related_items-derives-from-edges (no independent write).

## Downstream — each its own sequenced step (NOT in this build)
1. Categorization remediation of the 7 A1 items (closed set, after the gate exists).
2. GLEC resolution: 3581c084 canonical + rich rebuild (~$1–1.5, quoted); 50ccd5cc → `market_signal` + write `50ccd5cc -[references]-> 3581c084`; 4939b133 keep-or-fold per doc-set crawl.
3. Retroactive backfill (Fold 4): extractor over all existing items' stored content; gated AFTER (a) proven on new intake AND (b) the categorization fix — never wire miscategorized items.
4. Phase 2 (tier-home A) — scoped; waits behind the intake gate.
5. Free-deletes — per-item, as each live-counterpart is verified correctly-typed + primary-grounded.

## Order (dispatch §4 ship order — binding)
(a) contract amendment committed first → (b) `mintIntelligenceItem()` extraction, both callers wired (neither self-INSERTs) → (c) migration 146 (Option A) → (d) end-to-end DB proof on BOTH samples (GLEC→ISO-14083, AFIR→2023/1805) + the MIT 1b sample, through the full path → (e) bypass self-test red-then-green → (f) CI green → (g) flip ACTIVE_PHASE to phase-intake-gate, LAST act, nothing after it. No spend (deterministic, no LLM). Scrape hold stays LIVE. Downstream 1→5 each separately gated.
