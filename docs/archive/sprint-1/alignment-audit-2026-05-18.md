# Caro's Ledge Alignment Audit, 2026-05-18

**Date:** 2026-05-18
**Branch:** `feat/sprint-1-phase-5-implementation` at `2429d4a` or later
**Canonical reference:** [fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md](fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md) (committed at `2429d4a`); cross-references [fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md](fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md) for the canonical four-category source taxonomy.
**Method:** four parallel research agents (Sections A+B, C+D, E+F, G+H+I+J), synthesized.
**Skill load:** `caros-ledge-platform-intent`, `environmental-policy-and-innovation`, `sprint-followups-discipline` all loaded by every agent and by this synthesis.
**Status:** REPORT ONLY. No remediation. Operator authorizes any new OBS additions, sequence changes, or build dispatches separately.

---

## Audit summary

**Overall alignment: SIGNIFICANT DRIFT.**

Sprint 1's scope is correctly bounded to infrastructure and chrome remediation (Section D ALIGNED), but the underlying schema, page routing, and recent dispatch framings are significantly misaligned with the platform-intent skill's four-page architecture. The four-category source taxonomy (regulatory, research, market_news, operational_data) has no canonical column in the schema; the three category-aware routing RPCs (`get_market_intel_items`, `get_research_items`, `get_operations_items`) are orphans that no UI invokes; /market and /operations share the same unfiltered payload via `getResourcesOnly`; /research has zero category filter; and the anti-patterns the skill was authored 2429d4a hours ago to prevent are already committed in OBS-18, OBS-19, and the system-audit doc (routing customer-facing remediation to Phase 7 or Phase 6 when neither phase builds customer-facing features). Operations is a regex-categorized content surface, not the cross-functional decision engine the skill defines (6 of 7 capabilities ABSENT). Onboarding is in better shape than feared because Multi-Tenant Foundation Workstream B already delivered the minimum mechanism (Section J PARTIAL DRIFT only).

---

## OBS coverage table (per sprint-followups-discipline override)

This is an investigation dispatch. The discipline does not strictly require coverage decisions, but the operator's standing override applies the OBS coverage table broadly. Every open OBS reviewed for audit-relevance.

| OBS | State | Relevance to this audit | Notes |
|---|---|---|---|
| OBS-1 | Cleared | NO ACTION | Phase 5 sequencing closed by migration 082. |
| OBS-2 | Open | NO ACTION | ISO-3166 pass-through; orthogonal. |
| OBS-3 | Open | NO ACTION | ICAO literal-string; orthogonal. |
| OBS-4 | Implemented | NO ACTION | Migration 082 source_column. |
| OBS-5 | Open | NO ACTION | Trigger pollution; orthogonal. |
| OBS-6 | Informational | NO ACTION | severity vocabulary. |
| OBS-7 | Open | NO ACTION | Norway Fjords counsel. |
| OBS-8 | Open | NO ACTION | OBS-2 broader audit deferred. |
| OBS-9 | Deferred Sprint 2 | RELEVANT | Classifier feedback loop is one mechanism that would help drive correct source_role assignment, which Section A/B finds drifted. Sprint 2 sequencing should consider OBS-9 alongside the page-routing remediation surfaced here. |
| OBS-10 | Open | NO ACTION | Spot-check drift rate monitoring. |
| OBS-11 | Implemented | NO ACTION | Phase 5 rollback bracket. |
| OBS-12 | Canonical Pattern | NO ACTION | Bulk SQL CTE. |
| OBS-13 | Open | NO ACTION | Gate 7.2a all-rejected-jurisdictions. |
| OBS-14 | Open | RELEVANT | Triage UI inline source metadata; the integrity_flags absence (per critical-investigations) compounds with the page-routing drift surfaced here. Phase 7 design dependency. |
| OBS-15 | Open | NO ACTION | Phase 6 article-level source context. |
| OBS-16 | Placeholder | NO ACTION | Reserved. |
| OBS-17 | Open | RELEVANT | `/admin` route gate; same surface that has the audit log placeholder; not directly the alignment finding but adjacent. |
| OBS-18 | Open | **CONFIRMS ANTI-PATTERN** | OBS-18's "Phase 7 design dispatch MUST address" routing is exactly the anti-pattern this audit confirms. The entry needs revision (Phase 7 is admin chrome, not customer-facing); flag below. |
| OBS-19 | Open | **CONFIRMS ANTI-PATTERN** | OBS-19's "Phase 7 (customer-facing) or Phase 6 (ingest wiring)" framing is the canonical anti-pattern. Also under-scopes Operations as content surface. Flag below. |
| OBS-20 | Open | RELEVANT | Workspace-anchored rule violation in /market EmptyState; correct as far as it goes, but does not address dual-posture. |
| OBS-21 | Open | NO ACTION | Migration 078 gap. |
| OBS-22 | Open | NO ACTION | Ingest scheduler idle. |
| OBS-23 | Open | NO ACTION | `/admin` audit log placeholder. |

**Coverage top-line:** 0 covered (investigation only), 4 relevant (OBS-9, OBS-14, OBS-17, OBS-20), 2 confirm-the-anti-pattern (OBS-18, OBS-19 require revision per the audit findings; the entries route customer-facing remediation to phases that do not build customer-facing features), 17 not-applicable.

**DP compliance.** Investigation dispatch with no operator-surface design or implementation output. DP-1 NOT APPLICABLE; the binding constraint moves to whatever future dispatch redesigns the page surfaces.

**Recommended new OBS.** Three candidate entries surfaced; listed in the "Recommended new OBS" section below. Not added per operator authorization rule.

---

## Section A: Source taxonomy alignment

**Status: SIGNIFICANT DRIFT.**

The schema has no `classification_category` column matching the canonical four-category taxonomy (`regulatory` / `research` / `market_news` / `operational_data`). The `public.sources` table carries a `source_role` text column with 10 distinct values (`primary_legal_authority`, `intergovernmental_body`, `academic_research`, `statistical_data_agency`, `trade_press`, `industry_association`, `standards_body`, `vendor_corporate`, `industry_data_provider`, `government_press`) plus 39 NULL rows. None of these matches a canonical category name.

The canonical-four taxonomy lives implicitly in the role-to-page mapping inside the three category-aware routing RPCs (Section B), not on any source row. Categorization happens at routing time, not at classification time, and the routing functions themselves are orphans.

**Counts against the canonical four (794 total sources):**

| Status | Count | Notes |
|---|---|---|
| Schema-level: invalid (no canonical category column) | 794 | No source carries a canonical-four assignment because no column holds them. |
| Effective routing aligned (role-to-page mapping produces correct page) | ~462 | Routing via the orphan RPCs lands these on the right page IF the RPCs were wired (they are not, per Section B). |
| Effective routing miscategorized (role does not match nature) | ~293 | E.g. IMO and ICAO route to Research per `intergovernmental_body` membership; skill maps them to Regulatory. |
| Missing role (`source_role IS NULL`) | 39 | Unroutable under any category-aware path. |

**Confirmed miscategorizations (sample):**

| Source | source_role | Skill expects | Drift type |
|---|---|---|---|
| FreightWaves (multiple), The Loadstar (multiple), Reuters Sustainable Business, GreenBiz, Splash247 (3), BizClik Media | `trade_press` | `research` (industry analytical press) | Routes to Market Intel; skill says Research. |
| IMO (10+), ICAO (2) | `intergovernmental_body` | `regulatory` | Routes to Research; skill says Regulatory. |
| Carbon Trust (2), Project Drawdown | `statistical_data_agency` | `research` | Routes to Operations; skill says Research. |
| ICAP Allowance Price Explorer, ICAP Emissions Trading Status Report | `primary_legal_authority` | `research` or `operational_data` | Routes to Regulations; data product, not binding law. |

`intelligence_items.category` carries topic-tag-style values (`research`, `emissions`, `reporting`, `transport`, `fuels`, `corridors`, `regional`, `facility`, `technology`, `packaging`) with 481 of 631 active rows NULL. This column is not consulted by any routing RPC.

**Citation:** [caros-ledge-platform-intent SKILL.md Section "The Four-Page Architecture and Current State"](fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md); [environmental-policy-and-innovation SKILL.md Section "Resource Taxonomy"](fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md).

**Remediation owner:** Sprint 2+ planning. Schema change (add canonical category column + backfill) plus classifier work (assign category at ingest time per OBS-9 classifier feedback loop). Multi-week scope.

---

## Section B: Page routing alignment

**Status: SIGNIFICANT DRIFT.**

**The three category-aware routing RPCs are orphans.** `get_market_intel_items`, `get_research_items`, `get_operations_items` exist in the DB and encode the role-to-category mapping that approximates the four-page taxonomy, but **no `fsi-app/src/` code calls them**. Every customer-facing page actually fetches via the `get_workspace_intelligence_*` family or a direct ORM query, none of which filter by category.

| Function | Source | Page consumed by | Category filter |
|---|---|---|---|
| `get_market_intel_items` | unknown migration | **NONE (orphan)** | `source_role IN ('trade_press','industry_data_provider','vendor_corporate','industry_association')` |
| `get_research_items` | unknown migration | **NONE (orphan)** | `source_role IN ('intergovernmental_body','academic_research')` plus a small standards_body / proposed-regs carveout |
| `get_operations_items` | unknown migration | **NONE (orphan)** | `source_role = 'statistical_data_agency'` |
| `get_workspace_intelligence_dashboard` | 064 | `/` | **NO category filter** |
| `get_workspace_intelligence_listings` | 066 | `/regulations`, `/map` | **NO category filter** |
| `get_workspace_intelligence_slim` | 047 | `/market`, `/operations` | **NO category filter** |
| `get_workspace_intelligence` | 007 | `/regulations/[slug]` | **NO category filter** |
| `fetchResearchPipelineRows` (direct ORM) | n/a | `/research` | **NO category filter; only `is_archived = false`** |

**Critical findings:**

1. **/market and /operations route the SAME unfiltered payload.** Both call `getResourcesOnly` → `fetchWorkspaceResources` → `get_workspace_intelligence_slim` (no role filter). The two pages see identical row sets, distinguished only by client-side rendering (Market shows StatStrip + Watch this week + Cost Trajectory + Policy Signals; Operations shows JurisdictionPanel + chip grid + FacilityPanel). The page-routing distinction the skill assumes is absent at the data layer.
2. **/research pulls ALL items with no category filter.** `fetchResearchPipelineRows` at [fsi-app/src/lib/supabase-server.ts:721-748](fsi-app/src/lib/supabase-server.ts#L721-L748). Filter is `is_archived = false` only; ordered by `added_date DESC LIMIT 100`. Regulatory items, market signals, operational data, and research findings all appear if they pass the archive filter.
3. **Even if the orphan RPCs were wired, they would not match skill intent.** `get_research_items` includes `intergovernmental_body` (which conflates IMO and ICAO regulatory output with IEA, IRENA, IPCC, OECD think-tank research). `get_operations_items` includes only `statistical_data_agency` (which catches Carbon Trust and Project Drawdown, both of which the skill maps to Research). The role taxonomy is too coarse for the four-category mapping.
4. **62 active items belong to NULL-role sources** and are unroutable under any category-aware RPC.
5. The intersection_summary + related_items YAML frontmatter contract (from environmental-policy-and-innovation) is implemented and surfaces in `IntelligenceMetadataStrip` (read by SourceHealthDashboard admin chrome), but the customer pages don't display it.

**Citation:** [caros-ledge-platform-intent SKILL.md Section "The Four-Page Architecture and Current State"](fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md).

**Remediation owner:** Sprint 2+ planning. Requires: (a) decide whether to wire the existing RPCs or replace them, (b) refine the role-to-category mapping to match skill scoping, (c) author per-page data-fetching that respects category, (d) backfill the canonical column from Section A.

---

## Section C: Cross-reference architecture alignment

**Status: PARTIAL DRIFT.**

Cross-reference patterns inventoried:

| Pattern | Location | Active? | Respects content-lives-once rule? |
|---|---|---|---|
| `item_cross_references` table (migration 004) read into xrefIds + refByIds | [fsi-app/src/lib/supabase-server.ts:1465-1502](fsi-app/src/lib/supabase-server.ts#L1465-L1502) | YES (Regulations only) | YES (link out, no copy) |
| `LinkedItemsCard` rendering xrefs and supersessions | [fsi-app/src/components/regulations/LinkedItemsCard.tsx](fsi-app/src/components/regulations/LinkedItemsCard.tsx) wired in `RegulationDetailSurface.tsx:629` + `app/regulations/[slug]/page.tsx:221` | YES (Regulations only) | YES |
| `related_items` + `intersection_summary` YAML frontmatter | written by `src/lib/agent/parse-output.ts`, `system-prompt.ts`, `api/agent/run/route.ts`; read by `IntelligenceMetadataStrip.tsx` and `IntersectionDetectionView.tsx` | PARTIAL (admin only) | YES (strip cites by title with link) |
| `detect_intersections` RPC (migration 021) | called from `/api/admin/intersections` (Source Health Dashboard admin chrome) | YES (operator-facing only) | N/A (operator surface) |

**Findings:**

- Cross-reference surfacing is implemented only for /regulations and admin SourceHealthDashboard. /market, /research, /operations entry points fetch via `getResourcesOnly` / `getResearchPipeline` / `getScopedWorkspaceAggregates` and never thread xrefIds / refByIds / intersection_summary into the page.
- Per platform-intent SKILL.md Section 3: Market Intel "Cross-references Regulations to surface signals like regulatory deadline approaching" and Operations "cross-references Regulations (binding requirements), Research (efficiency data), and Market Intel (cost signals)". Neither of these cross-page surfacings is wired today.
- No content duplication found. The drift is one of incomplete surfacing, not of content-lives-once violation.

**Citation:** [caros-ledge-platform-intent SKILL.md Section "The Four-Page Architecture and Current State"](fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md) (Market Intel cross-references; Operations cross-references).

**Remediation owner:** Sprint 2+ customer-facing page builds (each page's build dispatch wires its own cross-reference surfacing).

---

## Section D: Sprint scope alignment

**Status: ALIGNED.**

| PR | Title | Primary nature | Customer-facing? | State |
|---|---|---|---|---|
| #119 | sprint-1/phase-4a: canonical-entity columns + jurisdiction vocab + admin signal docs | Infrastructure | NO | MERGED |
| #120 | sprint-1/phase-4b: operator queue tables + rejected-token routing | Infrastructure + operator-facing scaffolding | NO | MERGED |
| #121 | perf-1: content-aware browser cache headers on 7 read-heavy routes | Infrastructure (chrome / perf) | NO direct UX change | MERGED |
| #122 | sprint-1/phase-5: dedup transactions + jurisdictions/ISO backfill | Infrastructure (data + docs + skills) | NO | OPEN |

All four Sprint 1 PRs are correctly scoped as infrastructure or chrome consistent with platform-intent SKILL.md Section 5 ("Sprint 1 equals chrome remediation"). None implement Market Intel signal aggregation, Research horizon-scan engine, Operations decision engine, or Onboarding flow features.

**Open feature branches** classified:

- `feat/sprint-1-phase-5-implementation` (this branch): infrastructure
- `feat/sprint-1-phase-5-design`, `feat/sprint-1-phase-4b`, `feat/sprint-1-chrome-remediation`: infrastructure
- `feat/multi-tenant-A/B/C-*`: infrastructure with onboarding-adjacent surfaces (already merged via #114/#115/#116; stale local refs)
- `feat/dashboard-widgets`: stale pre-Sprint-1 customer-facing home-page widget work
- `feat/phase1-routing-restructure`: stale pre-Sprint-1 source-role-driven RPC scaffolding (migration 070; feeds the three broken pages today)
- Other branches: pre-Sprint-1 infrastructure (ingest, schema, migrations)

**No Sprint 1 branch is mis-scoped as customer-facing build.** Section C's drift on cross-references and Section B's drift on routing are consistent with Sprint 1 correctly NOT attempting to fix them; the customer-facing builds are Sprint 2+ per the platform-intent skill.

**Citation:** [caros-ledge-platform-intent SKILL.md Section "Sprint 1's Actual Scope"](fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md) and Section "The Customer-Facing Value Gap".

**Remediation owner:** None (aligned).

---

## Section E: Current vs expansion scope alignment

**Status: PARTIAL DRIFT.**

The **code layer handles dual posture correctly.** `ALL_SECTORS` at [fsi-app/src/lib/constants.ts:171-222](fsi-app/src/lib/constants.ts#L171-L222) enumerates approximately 40 sectors covering both the current cohort (art logistics, live events, luxury goods, automotive, humanitarian) AND broader freight-forwarding cohorts (cold-chain, ecommerce, retail, industrial, bulk, etc.). The constants.ts comment at lines 161-163 explicitly says "extensible. new sectors are added here as the platform expands to serve more freight verticals globally". `getActiveSectors` in `stores/workspaceStore.ts:57-60` returns the full master list when `sector_profile=[]`, the expansion default. `SectorOnboarding.tsx` accepts any subset. No hardcoded narrowing.

The **doc layer is silent on dual posture.** Zero Sprint 1 docs cite the dual-posture discipline by name. No design or audit dispatch emits a "this decision serves both cohorts" line. Sprint 1 work is mode-agnostic by construction (schema, ingest, admin chrome), so the silence is materially fine but not disciplined.

**One real narrowing absorbed silently:** `/operations` chip matchers (Solar, Electricity, Labor, EV Charging, Green Building per `OperationsPage.tsx:64-70` `CHIP_DEFS`) narrow Operations decisions toward expansion-only broader-freight categories. The current-cohort decisions (art-temperature-control, tour-rigging-power, humanitarian-cold-chain-fuel) have no chip representation. OBS-19 captures this as a wiring gap but does not flag the vertical-fit gap.

**Citation:** [caros-ledge-platform-intent SKILL.md Section "The Platform's Stated Value Proposition"](fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md) ("Dual posture is the default" + silent narrowing forbidden).

**Remediation owner:** Sprint 2+ Operations build (chip-set redesign covering both cohorts); also a discipline update prompting Sprint 1 doc-writing to cite dual posture going forward.

---

## Section F: Anti-pattern instances

**Status: SIGNIFICANT DRIFT.**

Multiple confirmed instances of the exact anti-patterns the platform-intent skill was created to prevent. All instances predate the skill's commit at `2429d4a` and therefore did not have the discipline available, but they remain in the docs as live framings that future dispatches will read.

| Anti-pattern | Instance | Severity |
|---|---|---|
| **"Phase 7 will fix Market Intel"** | [docs/sprint-1/followups.md](docs/sprint-1/followups.md) OBS-18 lines 318, 323, 330 ("Phase: 7 (admin chrome and customer-facing surfaces) BINDING CONSTRAINT"; "Phase 7 design dispatch MUST address the alerts card clickthrough"; "Phase 7 design dispatch addresses the alerts card and the related non-interactive customer-facing summaries") | HIGH |
| **"Phase 7 will fix Market Intel" (audit-side)** | [docs/sprint-1/system-audit-2026-05-18.md](docs/sprint-1/system-audit-2026-05-18.md) line 284 ("Phase 7 UI or separate small follow-up" for /market alerts card); REC-OBS-G same framing | HIGH |
| **"Phase 7 will fix Market Intel / Operations"** | OBS-19 lines 337, 342, 352 ("Phase: 7 (customer-facing) or Phase 6 (ingest wiring) BINDING CONSTRAINT") | HIGH |
| **"Phase 6 will fix customer-facing pages"** | system-audit-2026-05-18.md lines 254, 272, 285 ("Phase 6 ingest wiring or matcher relaxation"; "REC-OBS-H: Owner suggestion: Phase 6 ingest wiring") | HIGH |
| **"Infrastructure complete" implying value delivered** | system-audit-2026-05-18.md line 314 ("Sprint 1 has shipped substantive infrastructure (PRs #119, #120, #121 merged; #122 open for review). The architectural patterns established this sprint are intact") with customer-facing issues deferred to "small follow-ups" without naming the customer-facing value gap | MEDIUM-HIGH |
| **Silent customer-facing schedule slip** | [docs/sprint-1/critical-investigations-2026-05-18.md](docs/sprint-1/critical-investigations-2026-05-18.md) lines 237-252 (Phase 6 and Phase 7 design HELD pending reconciliation; new dispatches inserted into sequence). No mention of customer-facing slip. | MEDIUM-HIGH |
| **Operations under-scoped as content surface** | OBS-19, system-audit-2026-05-18.md line 285. Treats /operations as regex-matcher categorization (5 fixed chips) with remediation options that are content-surface tweaks (Uncategorized fallback, relax matchers, change banner copy). None of the proposed remediations are decision-engine remediations. | HIGH |

**Not found** (good news, search scope confirmed):

- Regulatory deadlines mis-placed on Market Intel scope: NOT FOUND. Greps across `docs/sprint-1/*.md` show no instance.
- Research as academic-only narrowing: NOT FOUND. The doc framings treat Research as broader than academic where they touch it.
- Current-vertical-only narrowing without flagging: NOT FOUND in code or sprint-1 docs. The code's ALL_SECTORS taxonomy is correctly extensible.

**Citation:** [caros-ledge-platform-intent SKILL.md Section "Anti-Patterns"](fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md).

**Remediation owner:** Sprint 2+ planning + a Sprint 1 doc cleanup pass to revise OBS-18 and OBS-19 framings (the entries are CORRECT about the gap; their routing of the fix is WRONG). The system-audit-2026-05-18.md customer-facing-value-gap conclusion needs an explicit acknowledgment that infrastructure complete does not equal value delivered.

---

## Section G: Operations page scope alignment

**Status: SIGNIFICANT DRIFT.**

| Capability per skill | Status | Evidence |
|---|---|---|
| Regulatory feasibility by region | ABSENT | OperationsPage.tsx:482-501 only lists item titles as Links. No region+regulation feasibility synthesis. |
| Regional resource availability (recyclables, materials) | ABSENT | CHIP_DEFS covers only Solar/Electricity/Labor/EV Charging/Green Building. No materials registry, no recyclables registry. |
| Labor markets (LinkedIn Economic Graph) | ABSENT (regex-stub) | OperationsPage.tsx:67 regex-matches labor/wage keywords. No LEG integration, no wage benchmark feed. |
| Materials sourcing (regional supplier base) | ABSENT | No code path; no chip; no schema column. |
| Infrastructure capacity (ports, rail, terminals, charging) | ABSENT (regex-stub on EV only) | OperationsPage.tsx:68 only matches EV charging keywords. |
| Operational cost data (electricity, diesel, SAF, port-handling, drayage) | PARTIAL (stubbed) | Electricity chip exists (regex only); no diesel/SAF/port chips; no numeric cost fields; CostTrajectoryChart on Market says "Data layer status: EMPTY". |
| Decision engine logic (synthesis across capabilities) | ABSENT | Page is flat region-and-chip presentation. No HVAC-vs-hire decision, no cross-region efficiency comparison, no solar-vs-automation decision. Falls to `EmptyJurisdiction` or `ComingSoonBanner` when chips miss. |

**Build scope estimate: VERY LARGE.** Six of seven capabilities ABSENT; the seventh is regex-stub only. New data feeds required: LinkedIn Economic Graph (or substitute wage data), regional materials/supplier registry, infrastructure capacity feed, structured cost time-series feeds. Schema additions for cost time-series, materials, infrastructure, labor benchmarks. Decision-engine synthesis layer is wholly new code. **Plausibly Sprint 3 through Sprint 5 territory.**

**Citation:** [caros-ledge-platform-intent SKILL.md Section "The Four-Page Architecture and Current State" / OPERATIONS subsection](fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md).

**Remediation owner:** Multi-sprint Operations build dispatch sequence (Sprint 3-5).

---

## Section H: Research page scope alignment

**Status: SIGNIFICANT DRIFT.**

Current: `/research` calls `fetchResearchPipelineRows` (direct ORM query at `supabase-server.ts:721-748`) which fetches `intelligence_items` ordered by `added_date DESC LIMIT 100` filtered only on `is_archived = false`. No `item_type` filter, no source category filter, no horizon-scan engine.

| Source per skill | In source registry? | Live brief pipeline producing horizon-scan briefs? |
|---|---|---|
| Loadstar | PARTIAL (seed.sql:810 as `r11` legacy resource) | NO |
| FreightWaves Sustainability | PARTIAL (seed.sql:819 as `r12`) | NO |
| Edie | ABSENT | NO |
| GreenBiz | PARTIAL (seed.sql:828 as `r13`) | NO |
| Environmental Finance | PARTIAL (seed.sql:846 as `r15`) | NO |
| Splash247 Green | PARTIAL (seed.sql:873 as `r18`) | NO |
| Supply Chain Digital | PARTIAL (seed-resources.json:3684) | NO |
| Journal of Sustainable Transportation | ABSENT | NO |
| Reuters Sustainable Business (analytical) | PARTIAL (seed.sql:837 as `r14`) | NO |
| IEA, IRENA, IPCC, World Bank, OECD, ICAP, Carbon Trust, Project Drawdown | NOT FULLY AUDITED; partial coverage via Priority Source Registry | partial / NO |

**Gap.** The Research surface is a pipeline-triage view, not a horizon-scan surface. There is no scanning layer pulling articles from the analytical-press sources, classifying them as `research_finding`, and emitting Research Summary briefs (the 6-section format from environmental-policy-and-innovation SKILL.md lines 431-460). Source coverage matrix is hard-coded placeholder; the tab is hidden. `publishedThisWeek` list renders titles as `<b>` text without Links (also captured at audit DRIFT-G.3, OBS candidate not yet added).

**Citation:** [caros-ledge-platform-intent SKILL.md Section "The Four-Page Architecture and Current State" / RESEARCH subsection](fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md); [environmental-policy-and-innovation SKILL.md "Research Summary" format](fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md).

**Remediation owner:** Sprint 2+ Research build dispatch (scanning logic + source curation expansion + 6-section brief format wiring + UI).

---

## Section I: Market Intel page scope alignment

**Status: SIGNIFICANT DRIFT.**

Current: `/market` calls `getResourcesOnly` + `getScopedWorkspaceAggregates({ item_types: ["technology","innovation","market_signal"], domains: [2,4] })`. Client filter splits into `techItems` and `priceItems`. `CostTrajectoryChart` is explicitly data-empty (`MarketPage.tsx` via `CostTrajectoryChart.tsx:10-18` "Data layer status: EMPTY ... No time-series tables in supabase migrations 001-047"). `PolicySignals` IS real (priority CRITICAL/HIGH within last 90 days with source badge).

| Source per skill | In source registry? |
|---|---|
| BloombergNEF | PARTIAL (one entry: "BloombergNEF Energy Storage") |
| MSCI | ABSENT |
| Moody's | ABSENT |
| Workiva | ABSENT |
| S&P Global Sustainable1 | ABSENT |
| ESG Today | ABSENT |
| Bloomberg Green | ABSENT |
| Carbon Pulse | ABSENT from production registry (referenced only in remediation script) |
| FT Moral Money | ABSENT |
| Reuters Sustainable Switch (newsletter) | ABSENT (only the analytical Reuters Sustainable Business is present, and it routes to Research per skill) |
| Corporate-press announcements (BYD-type) | ABSENT (no `corporate_announcement` item_type observed; technology/innovation carry general capability, not corporate-press records) |

**Gap.** Most of the skill-defined Market Intel source set is not in the registry. No signal aggregation engine. No predictive timing. No actionable alerts (OBS-18 confirms the alerts SideCard is non-interactive). EmptyState exposes worker-language (OBS-20).

**Citation:** [caros-ledge-platform-intent SKILL.md Section "The Four-Page Architecture and Current State" / MARKET INTEL subsection](fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md).

**Remediation owner:** Sprint 2+ Market Intel build dispatch (signal aggregation engine + source registry expansion + alerts wiring + cost time-series schema).

---

## Section J: Onboarding flow scope visibility

**Status: PARTIAL DRIFT (better than feared).**

Workstream B (Multi-Tenant Foundation, 2026-05-15) delivered substantially more than the audit's prior critical-investigations doc implied. Inventory:

- Onboarding route: [fsi-app/src/app/onboarding/page.tsx](fsi-app/src/app/onboarding/page.tsx) → `OnboardingWizard.tsx` (4-step wizard: choose path, identity, sector, notifications)
- Signup route: [fsi-app/src/app/signup/page.tsx](fsi-app/src/app/signup/page.tsx) (email/password Supabase signup, redirects to `/auth/callback?next=/onboarding`)
- Invitation routes: page at `/invitations/[token]`, APIs `/api/invitations/[token]/{accept,decline,mine}`. `accept_invitation` / `decline_invitation` / `lookup_invitation` wired.
- Admin panel: `InvitationsPanel.tsx` (create / revoke / copy URL; no email sending per dispatch I.4)
- No-workspace landing: `/workspace/new` → `NoWorkspaceLanding` (three CTAs: pending invitations, token paste, create-org; explicitly minimal per dispatch I.3)
- Sector profile setup: `SectorOnboarding.tsx`; also editable in `WorkspaceProfile.tsx:118`

**Gaps (Sprint 2+):**

1. Sector taxonomy hardcoded to 6 current operational niches in `HIGHLIGHTED_SECTOR_IDS` (OnboardingWizard.tsx:34-41); ALL_SECTORS has the broader taxonomy but the wizard does not yet present it.
2. Invitation email sending out of scope per dispatch I.4 (only "copy URL").
3. LinkedIn import is "Coming soon stub" per onboarding/page.tsx:18.
4. `NoWorkspaceLanding` chrome explicitly minimal-not-polished per dispatch I.3.
5. No sector_profile taxonomy expansion planning observed; no ingest-scaling considerations tied to onboarding flow.

**Sprint 2+ recognition:** confirmed (partially). The gaps are visibly stubbed with inline comments; not silently absorbed.

**Citation:** [caros-ledge-platform-intent SKILL.md Section "The Customer-Facing Value Gap" / Category 4 Onboarding](fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md).

**Remediation owner:** Sprint 2+ Onboarding polish dispatch (sector taxonomy expansion, email layer, LinkedIn import, chrome polish, ingest scaling). Bounded scope vs Operations.

---

## Consolidated drift findings

| ID | Dimension | Intent per skill | Actual state | Severity | Remediation owner |
|---|---|---|---|---|---|
| ALN-1 | Source taxonomy column | Canonical four-category column on `sources` | No column; 10-value `source_role` lives implicitly in dead routing RPCs | HIGH | Sprint 2 (schema + classifier) |
| ALN-2 | Page routing | Each page filters by canonical category | Three category-aware RPCs are orphans; /market and /operations share unfiltered payload; /research has no category filter | HIGH | Sprint 2 (per-page builds) |
| ALN-3 | Source role mapping | IMO/ICAO = regulatory; IEA/IRENA/IPCC = research; Carbon Trust/Project Drawdown = research | IMO/ICAO route to research (intergovernmental_body); Carbon Trust/Project Drawdown route to operations (statistical_data_agency); FreightWaves/Loadstar route to market_news (trade_press) | HIGH | Sprint 2 (role taxonomy refinement) |
| ALN-4 | Cross-reference surfacing | Market Intel surfaces Regulations deadlines; Operations cross-refs all three other pages | Only /regulations surfaces cross-refs; admin SourceHealthDashboard uses intersections | MEDIUM | Sprint 2+ (per-page builds) |
| ALN-5 | Sprint scope | Sprint 1 = chrome remediation (infra + ops triage); no customer-facing builds | ALIGNED. All four Sprint 1 PRs are infrastructure. | NONE | n/a (aligned) |
| ALN-6 | Dual posture in code | ALL_SECTORS extensible | ALIGNED. constants.ts:171-222 covers current + expansion cohorts with explicit expansion comment. | NONE | n/a |
| ALN-7 | Dual posture in docs | Every Sprint 1 doc cites dual-posture discipline where applicable | Zero Sprint 1 docs cite dual-posture by name | LOW | Discipline going forward (caros-ledge-platform-intent skill now binding) |
| ALN-8 | /operations chip vertical fit | Chip set serves both current and expansion cohorts | CHIP_DEFS narrows to expansion-only broader-freight (Solar/Electricity/Labor/EV Charging/Green Building); current-cohort chips absent | MEDIUM | Sprint 2+ Operations build |
| ALN-9 | Anti-pattern: "Phase 7 fixes Market Intel" | Forbidden | Confirmed in OBS-18, OBS-19, system-audit-2026-05-18.md | HIGH | Sprint 1 doc cleanup pass (revise OBS-18, OBS-19 routing) |
| ALN-10 | Anti-pattern: "Phase 6 fixes customer-facing" | Forbidden | Confirmed in system-audit lines 254/272/285 and OBS-19 line 337 | HIGH | Sprint 1 doc cleanup pass |
| ALN-11 | Anti-pattern: infrastructure complete = value delivered | Forbidden | Confirmed in system-audit line 314 | MEDIUM-HIGH | Sprint 1 doc cleanup pass + revised audit conclusion |
| ALN-12 | Silent customer-facing schedule slip | Forbidden | Confirmed in critical-investigations lines 237-252 (Phase 6/7 HELD; no customer-facing slip mention) | MEDIUM-HIGH | Sprint 1 doc cleanup pass + Sprint 2 sequencing dispatch must name the slip |
| ALN-13 | Operations as cross-functional decision engine | 7 binding capabilities | 6 ABSENT; 1 PARTIAL (regex-stub electricity) | HIGH | Sprint 3-5 Operations build |
| ALN-14 | Research as analytical-press-inclusive | Loadstar, FreightWaves Sust., GreenBiz, Environmental Finance, Splash247 Green, Reuters Sust. Business in active brief pipeline | Sources registered as legacy resources; no live horizon-scan engine | HIGH | Sprint 2+ Research build |
| ALN-15 | Market Intel commercial research + trade press | MSCI, Moody's, Workiva, S&P Sustainable1, ESG Today, Bloomberg Green, Carbon Pulse, FT Moral Money, Reuters Sust. Switch in registry | Mostly ABSENT from registry | HIGH | Sprint 2+ Market Intel build |
| ALN-16 | Onboarding for expansion cohorts | Sector taxonomy expansion + email layer + LinkedIn import + polished chrome | Six current-niche sectors highlighted; email stubbed; LinkedIn stubbed; chrome minimal | MEDIUM (better than feared) | Sprint 2+ Onboarding polish |

---

## Recommended new OBS entries (NOT YET ADDED; operator authorizes)

The audit surfaces three candidate OBS entries that the operator should authorize for capture in `docs/sprint-1/followups.md`. Two additional candidates also recommend in-place revisions to existing OBS entries (OBS-18 and OBS-19) rather than new numbers.

- **REC-OBS-G: Page routing uses `source_role` text mapping rather than canonical four-category taxonomy; three category-aware RPCs are dead code.** ALN-1 + ALN-2 + ALN-3. Severity HIGH. Owner: Sprint 2 customer-facing build sequence (schema + classifier + routing). Cross-references: OBS-9 (classifier feedback loop), OBS-14 (triage UI source metadata), platform-intent SKILL.md Section "The Four-Page Architecture".

- **REC-OBS-H: Operations is implemented as a content surface with regex chip matchers; cross-functional decision engine per platform-intent skill is 6 of 7 capabilities ABSENT.** ALN-13. Severity HIGH. Owner: Sprint 3-5 Operations build sequence. Cross-references: OBS-19 (operations chip mis-attribution; revise the routing); platform-intent SKILL.md Section "The Four-Page Architecture / OPERATIONS".

- **REC-OBS-I: Sprint 1 docs contain anti-pattern framings the platform-intent skill was created to prevent.** ALN-9 + ALN-10 + ALN-11 + ALN-12. Severity HIGH. Owner: Sprint 1 doc cleanup dispatch (revise OBS-18, OBS-19, system-audit conclusion, critical-investigations sequencing language). Cross-references: caros-ledge-platform-intent SKILL.md Section "Anti-Patterns".

**Recommended in-place revisions to existing OBS entries:**

- **OBS-18 revision:** strike the "Phase 7 design dispatch MUST address" routing. The alerts SideCard clickthrough is a Sprint 2+ Market Intel build dispatch concern, not Phase 7. Update the entry to reflect this.
- **OBS-19 revision:** strike the "Phase 7 (customer-facing) or Phase 6 (ingest wiring) BINDING CONSTRAINT" routing. The Operations chip mis-attribution is a Sprint 3-5 Operations build dispatch concern. Also note that the chip-matcher remediations proposed in OBS-19 are content-surface fixes, not decision-engine fixes; the deeper Operations build supersedes the OBS-19 remediation list.

---

## Sprint 2 planning input

Customer-facing build work the audit surfaces as required to close alignment gaps, categorized by page:

### Market Intel build (Sprint 2 candidate)
- Schema: add canonical category column + classifier wiring (shared with Research / Operations builds)
- Source registry expansion: add MSCI, Moody's, Workiva, S&P Sustainable1, ESG Today, Bloomberg Green, Carbon Pulse, FT Moral Money, Reuters Sustainable Switch, plus more BloombergNEF entries
- Signal aggregation engine (corporate announcements, capital flows, predictive timing)
- Cost time-series schema (CostTrajectoryChart is data-empty)
- Alerts wiring (close OBS-18; make SideCard interactive)
- Cross-reference surfacing for "regulatory deadline approaching" signals (cross-references Regulations)
- EmptyState copy workspace-anchored rewrite (close OBS-20)

### Research build (Sprint 2 candidate)
- Schema: shared canonical category column with Market Intel build
- Source registry: ensure analytical-press sources (Loadstar, FreightWaves Sustainability, GreenBiz, Environmental Finance, Splash247 Green, Supply Chain Digital, Reuters Sustainable Business) are live ingest pipelines, not legacy resource entries
- Horizon-scan engine (article extraction, classification as `research_finding`, brief generation per 6-section Research Summary format)
- Source coverage matrix implementation (replace hard-coded placeholder; unhide the tab)
- `publishedThisWeek` callout titles as Links (close audit DRIFT-G.3)
- Cross-reference surfacing for Operations decision-support

### Operations build (Sprint 3-5; very large scope)
- All seven decision-engine capabilities per platform-intent skill Section 3
- Multiple new data feeds: LinkedIn Economic Graph (or substitute), regional materials/supplier registry, infrastructure capacity feed, structured cost time-series
- Schema additions for cost time-series, materials, infrastructure, labor benchmarks
- Decision-engine synthesis layer (HVAC-vs-hire, cross-region efficiency, solar-vs-automation, PPWR feasibility by region)
- Chip set redesign covering current cohort (art-temperature-control, tour-rigging-power, humanitarian-cold-chain-fuel) AND expansion cohort
- Cross-references to Regulations + Research + Market Intel

### Onboarding build (Sprint 2-3; bounded scope)
- Sector taxonomy expansion in wizard (present ALL_SECTORS, not just 6 current niches)
- Email-delivered invitations layer
- LinkedIn import implementation (currently stub)
- `NoWorkspaceLanding` chrome polish
- sector_profile-driven workspace_settings tuning for expansion cohorts
- Ingest scaling considerations as user base grows

### Cross-cutting
- Sprint 1 doc cleanup pass (revise OBS-18, OBS-19, system-audit conclusion, critical-investigations sequencing) per REC-OBS-I
- Sprint 2 sequencing dispatch that explicitly names the customer-facing slip the prior dispatches absorbed silently
- Classifier feedback loop (OBS-9 Sprint 2 pre-decisions already locked) is a prerequisite for the canonical-category-column backfill

---

## Methodology notes

**Pipeline.** Four parallel background agents covering Sections A+B (DB + RPCs + code), C+D (cross-refs + Sprint 1 PRs), E+F (current/expansion + anti-patterns), G+H+I+J (per-page + onboarding). Synthesis in the main thread.

**Reproducibility recipe.** All audit artifacts preserved at `fsi-app/scripts/tmp/alignment-audit-*.json`, `.mjs`, `.sql`. Re-running synthesis from those inputs is deterministic.

**Known limits.**

- Section A's exact miscategorization counts (462 aligned / 293 miscategorized / 39 missing) are approximate; the per-source nature judgment depends on skill scoping interpretation which has gray areas (e.g. some FreightWaves articles are trade press, some are analytical; the source-level classification doesn't capture per-article variation).
- Section B's "orphan RPC" finding is conclusive at the file-grep level but does not verify that no admin tool or scheduled job invokes the RPCs out-of-band (low probability based on Section D's branch inspection).
- Section J's onboarding inventory is file-level. Live render verification (does the wizard actually work end-to-end?) requires browser access against carosledge.com which the audit does not have.

---

=== Value Delivery Check ===

This dispatch's work does NOT directly advance customer-facing value delivery.

This is an alignment-audit investigation dispatch. It produces findings, not features. The customer-facing value gap on Market Intel, Research, and Operations remains open per platform-intent SKILL.md Section 6 and is Sprint 2+ territory.

The audit DOES advance the discipline that protects future customer-facing dispatches from silently absorbing schedule slip. By confirming the anti-patterns are in the docs (OBS-18, OBS-19, system-audit) and proposing in-place revisions, the audit clears the path for the platform-intent skill's discipline to be applied retroactively to those entries.

Dual-posture check: this audit applies equally to current operational scope (art logistics, live events, luxury goods, automotive, humanitarian) and expansion-time users (broader freight forwarding cohorts via sector_profile expansion). Section E confirms code-layer dual posture is correct; Section J confirms Onboarding is positioned for expansion (though stubbed); Sections G/H/I confirm the customer-facing pages are broken for both cohorts equally.
