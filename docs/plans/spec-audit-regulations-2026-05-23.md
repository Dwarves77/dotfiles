# Regulations surface, spec audit (2026-05-23)

**Status**: READ-ONLY audit. No code touched, no prescriptions, no remediation.
**Auditor**: dispatched read-only agent under `caros-ledge-platform-intent` SKILL discipline.
**Branch**: `chore/spec-audit-regulations` from `origin/master` at `9ca913c` (audit-target snapshot).
**Scope**: `/regulations` index plus `/regulations/[slug]` detail, post Migration 101, post A+B+C hotfix (`db3a8b0`), post clarification (`25ff7ff`).
**Stale-state note**: between dispatch start and commit, `bebec9f` plus follow-ups landed on `origin/master` (B4 leakage fix: classifier emits `domain`, ingest sites stop hardcoding `1`). The audit was scoped to the pre-B4 state per the dispatch; gap R1 below refers to that pre-B4 surface state. Post-B4 the upstream cause of item_type leakage is addressed for NEW classifier output, but the 120 of 588 historically-misclassified items in `domain=1` remain present until a backfill runs.
**Operator's prior diagnosis**: "Regulations, spec binding law, built binding law content, mostly matches (post Migration 101 cleanup)."
**Audit verdict, one line**: Index surface mostly matches the spec at the routing and chrome level, but the regulation DETAIL page is substantively under-built against the binding 14-section Regulatory Fact Document; "mostly matches" holds for the index, holds only at the chrome layer for the detail page, and breaks for the four customer questions when measured end to end.

---

## Section 1, Spec excerpts (Regulations)

From `fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md` section "REGULATIONS" (lines 49 to 56):

> **Scope.** Binding regulatory intelligence. Laws, agency rules, court decisions, treaties, and rulemaking outcomes affecting freight operations across air, road, ocean, rail modes. Includes regulatory deadlines, enforcement dates, comment periods, and binding compliance requirements.
>
> **Source category mapping** (per environmental-policy-and-innovation `item_type` and `format_type` derivation). Regulations surfaces items of `item_type` in (`regulation`, `directive`, `standard`, `guidance`, `framework`), formatted as Regulatory Fact Documents (14 sections, conditional).
>
> **Current state.** Functional. The only intelligence page currently delivering its stated intent.

From `environmental-policy-and-innovation/SKILL.md` "Regulatory Fact Document (14 sections, conditional)" (lines 200 to 322), the binding section taxonomy is:

| # | Section | Always-present? |
|---|---|---|
| 1 | Purpose and Scope of This Document | always |
| 2 | What This Regulation Is and Why It Applies | always |
| 3 | Issues Requiring Immediate Action | always |
| 4 | How the Workspace Sits in the Compliance Chain | always |
| 5 | Authoritative Guidance Document Analysis | conditional |
| 6 | Anticipated Authoritative Guidance and Pending Regulatory Events | conditional |
| 7 | Threshold Questions | conditional |
| 8 | Substantive Requirements | always |
| 9 | Product-Specific Compliance Status | conditional |
| 10 | Registration and Reporting Obligations | always |
| 11 | Operational System Requirements | always |
| 12 | Exemptions and Edge Cases | conditional |
| 13 | Adjacent Industry Research and Alternatives | conditional |
| 14 | Confirmed Regulatory Timeline | always |
| 15 | Sources | always |

The reader question the spec binds the page to (line 204):

> what does this regulation require, where does the workspace sit in the compliance chain, what is decided versus what is unresolved, and what does the workspace do now?

From `source-credibility-model/SKILL.md` Section 8 (line 297):

> | Regulations | tier + jurisdiction + binding status |

Plus the vocabulary-consistency clause (line 317):

> Tier badge means the same everywhere (T1-T7 with the same labels and colors). Jurisdiction renders the same way wherever it appears.

---

## Section 2, Current built reality

### 2.1, Index page chain

`fsi-app/src/app/regulations/page.tsx` (135 lines), server component:

- Fetches via `getListingsOnly()` (slim RPC, no full briefs) at `page.tsx:79`.
- Strict `r.domain === 1` filter at `page.tsx:101` (post-hotfix, post-clarification at `25ff7ff`).
- Computes platform-total count via `cachedPlatformTotal` (60s cache, `APP_DATA_TAG` invalidation) at `page.tsx:34 to 60`.
- Composes masthead meta `"<n> regulations tracked · <j> jurisdictions · last sync ~"` at `page.tsx:115`.
- Passes `regulationResources` (filtered) to `DashboardHero` at `page.tsx:122` (hotfix B).
- Accepts `?priority=` and `?region=` query strings at `page.tsx:70 to 73`.

`fsi-app/src/components/home/DashboardHero.tsx` (255 lines):

- Four tiles, CRITICAL / HIGH / MODERATE / LOW (`DashboardHero.tsx:107 to 112`).
- Each tile deep-links to `/regulations?priority=X` (`DashboardHero.tsx:163`).
- Tile labels: "Critical, within 90 days", "Action, 6 mo", "Monitor, 6 to 12 mo", "Awareness only" (`DashboardHero.tsx:108 to 111`). These are static labels, not dynamic windows.
- CRITICAL tile only carries `helper` text via `criticalSnapshot` (`DashboardHero.tsx:75 to 93`); `/regulations` does not pass `criticalSnapshot`, so the helper is suppressed (`page.tsx:122`, no `criticalSnapshot` prop).

`fsi-app/src/components/regulations/RegulationsSurface.tsx` (1800 lines), client component:

- AI prompt bar at top, placeholder "Ask anything about your regulations" with three chips (`RegulationsSurface.tsx:656 to 664`).
- Toolbar: free-text search, sort row (newest / priority / confidence / alpha at `SortRow.tsx:14 to 19`), view toggles (card grid / dense list / table at `ViewToggles.tsx:16 to 20`), bulk-select toggle, expandable filters (`RegulationsSurface.tsx:703 to 823`).
- Filters when expanded: Mode (`MODES`), Priority chips with isolate semantics, Topic (from `TOPICS`), Region (from `JURISDICTIONS`), Sector (28 chips at `SectorChipFilter.tsx:27 to 56`), Confidence (5 authority levels plus unclassified at `ConfidenceFacet.tsx:33 to 49`).
- Save-as-default / reset-to-my-sectors / clear-saved-default actions persisted to L1 localStorage plus L2 `/api/workspace/regulations-defaults` (`RegulationsSurface.tsx:319 to 357, 572 to 619`).
- Default filter initial state honours `?priority=` (`RegulationsSurface.tsx:246 to 253`) and `?region=` (Tier 1 ISO, `RegulationsSurface.tsx:260 to 269`).
- Result-count heading with platform-total tooltip (`RegulationsSurface.tsx:996 to 1036`).
- Kanban view (4 priority columns, default, `RegulationsSurface.tsx:1050 to 1057, 1080 to 1195`).
- Dense list view (`RegulationsSurface.tsx:1058 to 1065, 1197 to 1344`).
- Table view (`RegulationsSurface.tsx:1066 to 1073, 1346 to 1530`).
- Bulk select: add to watchlist (localStorage only, see 2.3 below), Export TSV, Clear, Done (`BulkSelectBar.tsx:81 to 147`).

### 2.2, Detail page chain

`fsi-app/src/app/regulations/[slug]/page.tsx` (237 lines), server component:

- UUID-to-slug redirect via service-role lookup on `legacy_id` (`[slug]/page.tsx:62 to 89`).
- `fetchIntelligenceItem(id)` returns `{resource, changelog, dispute, supersessions, xrefIds, refByIds}` (`supabase-server.ts:1680`).
- Related-items lookup pulled separately by id-or-legacy-id (`[slug]/page.tsx:111 to 169`).
- Masthead: eyebrow `Regulations · <jurisdiction label>`, title, meta `Effective <date> · Reviewed <date>` (`[slug]/page.tsx:211 to 215`).
- Renders `<RegulationDetailSurface ...>`.

`fsi-app/src/components/regulations/RegulationDetailSurface.tsx` (2028 lines), client component:

- Hero card: mode chips, type+priority pills (top right), 1-paragraph note/whatIsIt, tag chips, three action buttons (`RegulationDetailSurface.tsx:296 to 437`).
- Action buttons: `Add to watchlist` HIDDEN (`RegulationDetailSurface.tsx:419 to 427`, `false && <ActionButton primary>`), Export brief (Blob markdown download), Share (Web Share API plus clipboard fallback).
- 4-stat strip: Effective (countdown), Penalty rate, Your exposure, Lanes affected (`RegulationDetailSurface.tsx:439 to 473`); three of four are emitted only when value is real; `Your exposure` and `Lanes affected` are hard-wired to `"—"` (lines 219 to 220) and therefore conditionally suppressed.
- AI inquiry bar with regulation-aware placeholder (`RegulationDetailSurface.tsx:478 to 487`).
- Tabs: Summary, Exposure, Penalty calculator, Timeline, Sources (`RegulationDetailSurface.tsx:79 to 85`).
- Summary panel composition (`SummaryPanel`, `RegulationDetailSurface.tsx:956 to 1228`):
  - AI plain-language summary block (Tier 1, `whatIsIt` or `note`).
  - Tier 2 operational-briefing expander, populated by `extractOperationalBriefing` from `r.fullBrief` markdown (`extract-sections.ts:212`); renders only when at least one of the three target sections (Immediate Action, What This Regulation Is, Compliance Chain) has content.
  - Inline horizontal `TimelineBar` (when timeline rows exist).
  - `ImpactScores` gradient bars (4 dims, cost / compliance / client / operational).
  - What changed, Why it matters, Key data, Recommended actions, Disputed, inline Full text (markdown-rendered `r.fullBrief` via `IntelligenceBrief`).
- Exposure panel (`ExposurePanel`, lines 1807 to 1950): emits a sector-profile-grounded narrative; falls back to a `/settings` CTA when no sector profile. Anticipated impact is a heuristic from priority plus matched sector ("high" / "medium" / "low").
- Penalty calculator panel (`PenaltyCalculatorPanel`, lines 1643 to 1741): renders structured `penaltyRange / costMechanism / enforcementBody / complianceDeadline` tiles plus regex-extracted "penalty / fine / shortfall / surcharge / forfeit / infringement" sentences from the brief markdown. No workspace-volume calculation.
- Timeline tab: reuses `TimelineBar` (empty fallback line).
- Sources tab: single anchor for `r.url` plus `r.sourceTier` if present, or "Primary source not yet linked." fallback.
- Right rail: `DeadlineCard` (when real value), `AffectedLanesCard`, `OwnerTeamCard`, `SideCard "Identification"` (ID, Type, Instrument, Publisher, Effective, Reviewed, Priority), `SideCard "Coverage"` (Jurisdiction, Modes, Topic), `LinkedItemsCard` (cross-refs, refByIds, supersessions; max 8 plus overflow indicator).

### 2.3, Adjacent honest-empty patterns

- `AffectedLanesCard` (`AffectedLanesCard.tsx:33 to 159`): always renders. Shows mode chips and jurisdiction chips when present, plus an italicized "Affected lanes will appear here once your workspace shipment data is connected." This is per the F22 halt clause (no lane-pair schema yet).
- `OwnerTeamCard` (`OwnerTeamCard.tsx:29 to 149`): shows `actionOwner` string or "Unassigned"; splits `"X + Y"` into team chips; shows `lastVerifiedDate` as "Last update".
- `Add to watchlist` button on the detail page is conditionally rendered behind `false &&` (`RegulationDetailSurface.tsx:427`); operator-visible as no-op. The index-page bulk-select watchlist writes to `localStorage` only (`BulkSelectBar.tsx:178 to 199`); no server-side persistence.
- `Your exposure` and `Lanes affected` stat tiles in the hero strip are hard-coded to `"—"` (lines 219 to 220) and therefore suppressed; no workspace-shipment data feeds them.

---

## Section 3, Line-cited gap analysis

### 3.1, Per spec requirement

| # | Spec requirement | Status | Evidence |
|---|---|---|---|
| R1 | Surface items of `item_type in (regulation, directive, standard, guidance, framework)` | MIS-FRAMED via domain proxy | Index filters by `r.domain === 1` (`page.tsx:101`, `RegulationsSurface.tsx:392`). Domain is the proxy for "regulatory", but per `docs/plans/regulations-classification-mismatch-counts-2026-05-22.md` 120 of 588 domain=1 items are misclassified by item_type (initiative 98%, market_signal 71%, research_finding 69%, technology 45%). Strict `r.domain === 1` doesn't dedupe by `item_type` so non-regulation items still surface; the operator's "post-Migration 101 cleanup" framing addresses count reconciliation, not item_type leakage. |
| R2 | Format items as Regulatory Fact Documents (14 sections, conditional) | PARTIAL, presented as ad-hoc Tier 1 / Tier 2 / Tier 3 stack | The detail page does not enumerate or label the 14 spec sections. Tier 2 extracts three sections (Immediate Action, What This Is, Compliance Chain) by heading match (`extract-sections.ts:212 to 229`). Tier 3 (Full text) renders the raw markdown via `IntelligenceBrief`, so all 14 sections appear IF the brief content includes them, but the page-level surface treats them as opaque markdown body rather than as the spec's named, navigable sections. Sections 5, 6, 7, 9, 10, 11, 12, 13 have no first-class UI affordance; Section 14 (timeline) and Section 15 (sources) are first-class as tabs. The hero card's Penalty calculator and Exposure tabs are NOT in the spec's 14-section taxonomy; they are product additions. |
| R3 | Cover laws, agency rules, court decisions, treaties, rulemaking outcomes | PARTIAL | `Resource.type` enumerates "framework, regulation, law, standard, innovation" etc. (`resource.ts:99` comment). No first-class court-decision or treaty type; nothing in the filter facets distinguishes them. Topic filter (`TOPICS`) is freight-domain (likely Climate / Emissions / Air Quality etc.), not regulatory-instrument-type. |
| R4 | Cover air, road, ocean, rail modes | PRESENT | Mode chips and `MODES` filter (`RegulationsSurface.tsx:834 to 844`) plus mode pills on detail hero (`RegulationDetailSurface.tsx:309 to 331`) plus modes in Coverage SideCard. |
| R5 | Include regulatory deadlines | PRESENT | `r.complianceDeadline` plus `r.timeline[].date` surface as: dense-list "due" column, kanban-card due footer, detail-page Effective stat, DeadlineCard right rail, Timeline tab, Penalty calculator tile. |
| R6 | Include enforcement dates | PARTIAL | `nextDeadline()` (`RegulationDetailSurface.tsx:2006 to 2027`) picks next future timeline milestone OR `complianceDeadline`. No semantic distinction between an "effective date" and an "enforcement date"; the schema has `complianceDeadline` only. |
| R7 | Include comment periods | MISSING | No schema field, no UI affordance. Comment periods are a regulatory-lifecycle signal the spec explicitly names. Closest proxy: Section 6 of the Regulatory Fact Document (Anticipated Authoritative Guidance and Pending Regulatory Events), which renders only as opaque markdown inside the Full text section. |
| R8 | Include binding compliance requirements | PARTIAL | Spec Section 8 (Substantive Requirements) lives inside the brief markdown only; no first-class UI section. Recommended-actions card (`RegulationDetailSurface.tsx:1132 to 1145`) lists `r.recommendedActions` when present, which is the closest first-class affordance. |
| R9 | Per source-credibility-model Section 8: tier + jurisdiction + binding status | PARTIAL | Tier: `r.sourceTier` rendered in Sources tab only (`RegulationDetailSurface.tsx:577`); not on index cards, not as a filter facet. Jurisdiction: rendered consistently (eyebrow, kanban card header, dense-list cell, Coverage SideCard, Affected Lanes). Binding status: MISSING. The spec calls for an explicit binding-status badge on a Regulations item (binding law vs guidance vs framework vs proposed rule); the UI surfaces `r.type` once on the hero (e.g. "REGULATION"), but neither index cards nor the masthead carry a "binding" / "non-binding" signal, and the Confidence facet exposes authority-level (provenance), not binding status (legal force). |
| R10 | Vocabulary consistency: tier renders the same everywhere | MIS-FRAMED | The Confidence chip on cards is labelled "authority level" (primary_text, official_guidance, intergovernmental, expert_analysis, unconfirmed; `ConfidenceFacet.tsx:33 to 49`). That is a 5-level provenance scale, not the Tier 1 to Tier 7 source-credibility tier. The page never renders the canonical "Tier N" badge. Tier is in the type but unsurfaced on cards. |

### 3.2, Per the spec reader-question (line 204)

| Reader question | Helped? | Evidence |
|---|---|---|
| What does this regulation require? | PARTIAL | Section 8 (Substantive Requirements) lives only inside the Full text markdown. The "Recommended actions" card surfaces some action-level requirements when populated. The Tier 2 expander pulls Immediate Action but not Substantive Requirements. |
| Where does the workspace sit in the compliance chain? | PARTIAL | Section 4 (Compliance Chain) is one of the three Tier 2 sections (`extract-sections.ts:212 to 229`). It also appears in the Full text. ExposurePanel (lines 1807 to 1950) composes a sector-profile narrative that approximates the compliance-chain question for the workspace, but it is heuristic, not legal-role-grounded. |
| What is decided versus what is unresolved? | MISSING as a first-class affordance | Spec sections 5 (Authoritative Guidance), 6 (Anticipated Events), 7 (Threshold Questions) are the spec's home for the decided / unresolved discrimination. None has a first-class UI section; all live only inside the markdown. The "Disputed" section renders only when `dispute.note` is populated, which is a different concept (factual dispute, not regulatory ambiguity). |
| What does the workspace do now? | PARTIAL | Recommended-actions card (when populated) plus Tier 2 Immediate Action expander. No deadline-rollup view per jurisdiction or per workspace operation. The 4-priority Kanban surfaces this at the portfolio level. |

### 3.3, Per the customer questions enumerated in the dispatch

| Customer question | Helped? | Evidence and gap |
|---|---|---|
| "What new binding law affects my routes / cargo?" | PARTIAL | Sort by `newest` (`SortRow.tsx:14`) returns `r.added` descending; that is ingestion timestamp, not law-publication date. No "new this week" or "new this month" callout on the index. The sector facet (28 chips, `SectorChipFilter.tsx:27 to 56`) and `?region=` deep link approximate the "my routes / my cargo" filter, but there is no "new + matches me" pre-built view. The DashboardHero is on `/` (home), not on `/regulations`, so the `WhatChanged` strip per the hotfix at `3133b82` is on home, not on /regulations. |
| "What's coming into force in the next 90 days?" | PARTIAL | The CRITICAL tile is labelled "Critical, within 90 days" but the label is static (`DashboardHero.tsx:108`); the count is by `priority === 'CRITICAL'`, not by `complianceDeadline within 90 days`. There is no time-window filter on the index (no "due in 30 / 60 / 90 days" facet). Sort by `priority` puts CRITICAL first, but priority is operator-curated, not deadline-derived. |
| "Per regulation: what is it, what does it require, what's the deadline, what's the penalty?" | PARTIAL | What it is: hero whatIsIt or note paragraph plus Full text. What it requires: Section 8 lives only in Full text markdown. Deadline: Effective stat + DeadlineCard + Timeline tab. Penalty: Penalty calculator tab renders structured fields plus regex-extracted sentences. Coherent on penalty + deadline; weak on substantive requirements (no first-class affordance). |
| "Per jurisdiction I operate in: what's the regulatory load?" | PARTIAL | Region filter chip (legacy jurisdiction slug at `RegulationsSurface.tsx:906 to 918`) plus Tier 1 ISO `?region=` deep-link (lines 260 to 269) plus jurisdictionsCount in masthead meta (line 115). No per-jurisdiction rollup view (e.g. "California: 12 critical, 8 high, 3 due in 30 days"). No deadline-by-jurisdiction view. Map at `/map` is a separate cross-cutting capability; the spec calls Map a view of Regulations content, not a rollup. |

### 3.4, Detail-page-specific gaps (the operator's caveat)

The detail page is substantively less complete than the index against the spec:

- **Spec-named sections rendered as first-class UI**: 1 of 14 (Section 14, Timeline). Possibly 2 of 14 (Section 15, Sources) if a single anchor counts.
- **Spec-named sections surfaced via the Tier 2 expander**: 3 of 14 (Section 2 What This Is, Section 3 Immediate Action, Section 4 Compliance Chain).
- **Spec-named sections living only inside the markdown Full text block**: 9 of 14 (Sections 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, minus whichever are conditionally omitted).
- **Product additions not in the spec's 14-section taxonomy**: Penalty calculator tab, Exposure tab, hero stat strip's "Your exposure" and "Lanes affected" placeholders, ImpactScores gradient bars.
- **Spec sections that are always-present per the spec but have no first-class affordance**: 1 (Purpose), 8 (Substantive Requirements), 10 (Registration and Reporting Obligations), 11 (Operational System Requirements). These are spec-mandatory but the page treats them as opaque markdown body.

This is the under-built that the operator's "mostly matches" framing does not surface. The Tier 2 expander gives the illusion of structured navigation by surfacing 3 of 14 sections; the other spec-mandatory sections are present only when the brief markdown happens to include them.

### 3.5, PRESENT_BUT_UNAUTHORIZED items

| Item | Authorization concern |
|---|---|
| `Add to watchlist` button on detail page hidden via `false &&` (`RegulationDetailSurface.tsx:419 to 427`) | DEAD CODE under the operator's "no dead code on the site" rule. PR-E3 is deferred; the gated button is built-but-not-wired and lives in customer-facing source. Per operator rule: should be presented with WHAT/WHEN/WHY/STATE for keep/wire/remove. |
| Bulk-select watchlist (`BulkSelectBar.tsx`) | Same concern at the index. Writes to `localStorage` only (`BulkSelectBar.tsx:178 to 199`); the customer sees a "Added N to watchlist" toast but the watchlist has no destination, no server persistence, no read-back surface beyond local storage. Not dead code (the toast and local persistence work) but the customer-facing value loop is incomplete. |
| `Your exposure` and `Lanes affected` hero stat tiles | Hard-wired to `"—"` (`RegulationDetailSurface.tsx:219 to 220`) and conditionally suppressed. Honest empty by design, but the stat strip's slot-count (4 columns at line 444) implies they will be populated; they never will until workspace shipment data is connected. Operator-visible only as missing tiles. |

---

## Section 4, Missing data shapes

These are data shapes implied by the spec but not produced by the current schema or fetch path:

| Data shape | Spec source | Current state |
|---|---|---|
| Per-section structured content for Sections 5, 6, 7, 8, 9, 10, 11, 12, 13 of the Regulatory Fact Document | environmental-policy-and-innovation Section "Regulatory Fact Document" | Stored only as markdown text inside `intelligence_items.full_brief`. No `intelligence_item_sections` table, no `section_type` enum, no per-section editorial control. The Tier 2 extractor (`extract-sections.ts`) pattern-matches three headings; extending to 14 would require either the agent to emit canonical heading text reliably or a schema migration to first-class section storage. |
| Binding status (binding law vs guidance vs framework vs proposed rule) | Section 8 SCM SKILL Section 8 "binding status" | `Resource.type` carries a free-text label ("regulation", "framework", "guidance", etc.) but no normalized `binding_status` enum. No filter, no badge. |
| Comment-period close date (open consultations) | REGULATIONS spec line 51 ("comment periods") | No schema field. |
| Enforcement-date vs effective-date distinction | REGULATIONS spec line 51 | Single `complianceDeadline` field; timeline rows are free-form labels. |
| Compliance deadline rollup per jurisdiction | Customer question 4 ("per jurisdiction: what's the regulatory load") | Not aggregated. The masthead surfaces a jurisdictionsCount, not a deadline-by-jurisdiction matrix. |
| New-this-week / new-this-month rollup | Customer question 1 | `r.added` is ingestion timestamp, not regulation publication date. No dedicated "new in window" view; sort=newest is the closest approximation. |
| Lane-level affected scope (origin/destination city pairs, volume estimates) | Detail dispatch F22 (referenced in `AffectedLanesCard.tsx:9`) | No `lane_pairs` schema; AffectedLanesCard renders modes + jurisdictions plus an italicized "shipment data not connected" message. |
| Workspace shipment volumes (for Your exposure stat) | Hero stat strip | No workspace shipment data layer. The stat tile is hard-wired to `"—"`. |
| Watchlist (per-user or per-workspace) | Bulk-select Add to watchlist + detail-page Add to watchlist | No `watchlists` table, no API route. localStorage only. |
| Tier 1 to Tier 7 source tier on every regulation card | source-credibility-model Section 8 ("tier + jurisdiction + binding status") plus vocabulary-consistency clause | `r.sourceTier` exists as 1-5 (`resource.ts:152`) and renders only in the Sources tab. Cards do not show tier. |
| Citation count + last-cited-at (per Section 8) | Added in migration 098, types updated at `resource.ts:200 to 201` | Not surfaced on the Regulations index or detail page. Per source-credibility-model Section 8 the Regulations surface signal set is "tier + jurisdiction + binding status", so citation count is correctly NOT a Regulations signal, but the fields exist on `Resource`; worth a sanity check that they don't leak into Regulations UI. |
| Cross-reference relationship type (`relationship` enum: related / supersedes / implements / conflicts / amends / depends_on) | Migration 004 (`item_cross_references.relationship`) | Schema field exists; `LinkedItemsCard.tsx:14 to 27` notes it is NOT in the fetch path and the card renders only direction (Cross-reference / Referenced by) plus supersession-direction. Result: customers see "References" / "Referenced by" but cannot tell if a link is a `conflicts` vs a `depends_on`. |
| Misclassified-but-domain=1 items (120 of 588 per `regulations-classification-mismatch-counts-2026-05-22.md`) | Implied by REGULATIONS scope | Surfaces today; the strict `r.domain === 1` filter does not catch them because they ARE domain=1 with `item_type` such as `market_signal` or `research_finding`. The `25ff7ff` clarification commit explicitly acknowledges this; dispatch E (ingest investigation) owns the fix. |

---

## Section 5, Operator questions before any rebuild

1. **Does "mostly matches" hold for the detail page, or only for the index?** The detail page is substantively under-built against the 14-section Regulatory Fact Document spec (1 to 3 of 14 sections first-class; 9 of 14 living only inside opaque markdown). Is the operator's framing intended to cover both surfaces, or is the implicit posture "index mostly matches, detail page intentionally minimal"?

2. **Is the spec's 14-section Regulatory Fact Document binding on the customer-facing UI, or only on the agent output stored in `full_brief`?** If binding on UI, the detail page needs first-class per-section navigation (TOC, anchors, conditional empty-section markers per the spec's conditional-section rules). If binding only on agent output, current Tier 1 / Tier 2 / Tier 3 stack is acceptable and the audit gap collapses to "renders the canonical sections through the Full text only".

3. **Should the Confidence facet (5-level authority) be renamed or supplemented to surface the canonical Tier 1 to Tier 7 source-credibility tier?** Source-credibility-model Section 8 names "tier" as a Regulations signal and Section "Vocabulary consistency" requires the same tier vocabulary across surfaces. The page today exposes a different vocabulary (authority_level) under the "Confidence" label; this is a vocabulary-coherence gap the operator may or may not want to close on this surface.

4. **Is binding status (binding law vs guidance vs framework vs proposed rule) a first-class need on Regulations, or is it folded into the Type pill and item_type?** The current Type pill on the detail hero shows e.g. "REGULATION" or "FRAMEWORK" but does not enumerate a canonical binding-status vocabulary. SCM Section 8 lists "binding status" as the third Regulations signal alongside tier and jurisdiction; the index cards carry neither.

5. **Should the index acquire a "new this week / new this month" affordance and a deadline-window facet (due in 30 / 60 / 90 days)?** Customer questions 1 and 2 are not closed by sort=newest plus priority-equal-CRITICAL; the page surfaces priority (operator-curated) and ingestion date (system-curated) but not regulation publication date or deadline window. The CRITICAL tile's "within 90 days" label is static text, not a dynamic count.

6. **Should the operator-rule "no dead code on the site" be applied to the hidden `Add to watchlist` button (`RegulationDetailSurface.tsx:419 to 427`) and the placeholder-only hero stats (`Your exposure`, `Lanes affected`)?** These are built-but-not-wired customer-facing affordances. Per the operator rule the auditor presents WHAT/WHEN/WHY/STATE and operator decides keep/wire/remove.

7. **Is the ingest classification leakage (120 of 588 domain=1 items with non-regulation item_type per the 2026-05-22 quantification) acceptable as a Sprint 1 known-issue, or does the audit count this as a customer-facing surface defect that should be re-prioritized?** Dispatch E owns the upstream fix; the Regulations surface today still ships visibly-non-regulation items inside the kanban. The strict `r.domain === 1` filter post-hotfix does not catch them.

---

## Value Delivery Check

```
=== Value Delivery Check ===

This dispatch's work does NOT directly advance customer-facing value delivery.

This is a READ-ONLY audit against the binding caros-ledge-platform-intent
SKILL Regulations surface definition plus the environmental-policy-and-
innovation Regulatory Fact Document spec plus source-credibility-model
Section 8. The dispatch produces no code change, no migration, no
schema, no ingest fix; it produces only a gap report and operator
questions. Customer-facing value delivery on /regulations is unchanged
by this audit.

The five customer-facing surfaces (Regulations, Market Intel, Research,
Operations, Community) and the cross-cutting capabilities (Map,
Intelligence Assistant, Onboarding) are unaffected by this audit. Any
work to close the gaps surfaced here is operator-authorized Sprint 2+
scope; the audit itself surfaces the gaps and does not silently absorb
them.

Dual-posture: the audit applies equally to the current operational
verticals (art logistics, live events, luxury goods, automotive,
humanitarian) and the expansion-time cohort (broader freight forwarding
across air, road, ocean, rail). No narrowing flag.
```
