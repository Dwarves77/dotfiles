---
name: caros-ledge-platform-intent
description: Caro's Ledge platform value proposition and customer-facing value-delivery discipline. The platform is a freight sustainability intelligence SaaS serving freight forwarders (art logistics, live events, luxury goods, automotive, humanitarian today; broader freight forwarding across air/road/ocean/rail at expansion). Four customer-facing pages (Regulations, Market Intel, Research, Operations) map to the four-category source taxonomy in environmental-policy-and-innovation. Three of four pages do not currently deliver their stated value despite Sprint 1's infrastructure work (Phase 5/6/7/8/9-11) building foundations rather than customer-facing features. Every dispatch on Caro's Ledge build sequencing, design, or implementation MUST emit a Value Delivery Check section confirming whether the work advances customer-facing value or extends the gap. Loads alongside environmental-policy-and-innovation (canonical source taxonomy), sprint-followups-discipline (OBS loop closure), frontend-design (UI conventions).
---

# Caro's Ledge Platform Intent

## Why this skill exists

Caro's Ledge has been built with comprehensive foundations (schema, classifier, ingest, admin chrome, jurisdiction taxonomy) but three of four customer-facing pages do not deliver their stated value proposition. Multiple build sessions have pointed at infrastructure phases (Phase 5 data migration, Phase 6 ingest wiring, Phase 7 admin chrome and triage UI) as "what will fix the customer-facing pages." None of those phases actually builds customer-facing page features. They build the substrate the pages would eventually run on.

This skill encodes the platform's stated value proposition, the four-page architecture, the honest current state, and a binding discipline: every relevant dispatch MUST explicitly state whether its work advances customer-facing value delivery or extends the gap. The intent is to prevent infrastructure work from silently absorbing customer-facing schedule slip.

## The Platform's Stated Value Proposition

Caro's Ledge is a freight sustainability intelligence platform.

**Current operational scope (what it serves today).** Freight forwarders specializing in art logistics, live events, luxury goods, automotive (classic, supercars, prototypes), and humanitarian cargo. This reflects the operational reality of the founding workspace and the current customer cohort.

**Architectural intent (what it is built to become).** Multi-tenant SaaS designed to expand into the broader freight forwarding industry across air (primary), road (secondary), ocean (tertiary), and rail (rarely) modes. The expansion mechanism is operator onboarding with `sector_profile` customization driving workspace-scoped intelligence delivery. The platform's three-layer tenant model and `workspace_settings` shape are designed to support this expansion without architectural rework.

**Value proposition.** Operator-actionable intelligence (regulatory updates, market signals, research findings, operational cost intelligence) delivered in context-anchored briefs that respect the workspace-anchored output rule from `environmental-policy-and-innovation`. Value scales from the current specialized verticals into broader freight forwarding sectors as expansion proceeds.

**Dual posture is the default.** The architecture must support BOTH the current operational scope AND the future expansion. Decisions about source coverage, classifier scope, jurisdiction taxonomy, ingest volume, and customer-facing page features should consider both current users (specialized verticals) and onboarding-time-future users (broader freight forwarding cohorts). Dispatches narrowing scope to current-only or future-only must surface that narrowing explicitly; silent narrowing is forbidden.

## The Four-Page Architecture and Current State

The four customer-facing pages map directly to the four source categories defined in `environmental-policy-and-innovation` SKILL.md (the canonical source for the taxonomy: regulatory, research, market_news, operational_data). Page scoping derives from that taxonomy, not the other way around. When the taxonomy evolves, page scope follows.

### REGULATIONS

**Scope.** Binding regulatory intelligence. Laws, agency rules, court decisions, treaties, and rulemaking outcomes affecting freight operations across air, road, ocean, rail modes. Includes regulatory deadlines, enforcement dates, comment periods, and binding compliance requirements.

**Source category.** `regulatory` (IMO, ICAO, EPA, EU and EUR-Lex, CARB, CBAM, SAF and CORSIA, EUDR, PPWR, FuelEU, etc.).

**Current state.** Functional. The only customer-facing page currently delivering its stated intent.

### MARKET INTEL

**Scope.** Industry signals and what the industry is doing. Corporate announcements (vendor claims, capital flows, technology deployment, supplier shifts, capacity changes), commercial research output (BloombergNEF, MSCI, Moody's, Workiva, S&P Global Sustainable1), cross-cutting sustainability trade press (ESG Today, Bloomberg Green, Carbon Pulse, FT Moral Money, Reuters Sustainable Switch), carbon market intelligence, fuel pricing signals, predictive timing on market movements. Cross-references Regulations to surface signals like "regulatory deadline approaching," but the deadline content itself lives in Regulations.

Example: BYD announcing a battery advancement is Market Intel. The CBAM 2026 enforcement deadline is Regulations; Market Intel may surface a signal "CBAM enforcement window closing in 90 days" that links back to the Regulations entry.

**Source category.** `market_news` plus corporate press.

**Current state.** Broken. "8 alerts" SideCard is non-interactive (no click-through), EmptyState exposes worker-language to end users (violates workspace-anchored rule), no real signal aggregation engine running. Captured at OBS-18, OBS-20.

### RESEARCH

**Scope.** Horizon-scan content with analytical or quantitative depth. Includes:

- Peer-reviewed academic journals (Journal of Sustainable Transportation, transport research journals)
- Think-tanks and policy analysis (IEA, IRENA, IPCC, World Bank, OECD, ICAP, Carbon Trust)
- Quantified climate research (Project Drawdown)
- Industry analytical press with named editorial provenance (Loadstar, FreightWaves Sustainability, Edie, GreenBiz, Environmental Finance, Splash247 Green, Supply Chain Digital)
- Reuters Sustainable Business analytical reporting (distinct from the trade-press Sustainable Switch newsletter which lives in Market Intel)

Research is BROADER than peer-reviewed academic; it includes industry analytical news with named editorial provenance and horizon-scanning relevance. The discriminator is analytical and horizon-scanning depth, not academic publication form.

**Source category.** `research`.

**Current state.** Broken. Weekly briefing regulation references are wired as Links per audit Section G, but the `publishedThisWeek` callout list renders titles as `<b>` text without Links. No apparent horizon-scan engine running. Source coverage matrix stub deferred.

### OPERATIONS

**Scope.** Jurisdictional decision intelligence for freight operators. This is a cross-functional decision-support engine that integrates regulatory requirements, regional resource availability, labor markets, materials sourcing, infrastructure capacity, and operational cost data to support forward-looking operator decisions.

Examples of decisions Operations is meant to support:

- Should the operator invest in an HVAC monitoring system or hire two people to do it manually? (cost and labor decision)
- Which region is more efficient and cheaper for a given operation? (cross-regional comparison)
- What recyclable materials are available in a given region? (materials sourcing)
- Can a region meet PPWR packaging compliance given its available material supply? (regulatory feasibility by region, integrating regulation + region + resource availability)
- Solar versus automation versus hire decisions across regions
- Labor markets (LinkedIn Economic Graph, regional wage data)
- Infrastructure capacity (ports, rail, terminals, charging)

Operations is the page that turns intelligence into actionable operator decisions. It cross-references Regulations (binding requirements), Research (efficiency data, technology readiness), and Market Intel (cost signals, fuel pricing) to surface a unified decision picture by jurisdiction.

**Source category.** `operational_data` plus cross-references from `regulatory` and `market_news`.

**Current state.** Broken. "Not yet ingested" across jurisdictions even when data exists; "Coming soon Phase D" banner fires when chip regex matchers miss items (wiring gap masquerading as coverage gap per OBS-19); cross-functional decision engine not running.

Of the three broken pages, Operations is the most complex because it is a cross-functional decision engine, not just a content surface. Its build is plausibly the largest of the three remaining customer-facing builds.

## The Three-Layer Tenant Model

- **Platform layer.** Shared intelligence, source registry, classifier, internal staff. `profiles.is_platform_admin = true` gates platform-level surfaces.
- **Workspace layer.** Org-scoped intelligence delivery. `workspace_settings`, `org_memberships`, sector_profile drive what each workspace sees and how briefs are anchored.
- **Community layer.** Cross-org, pre-launch, never drop. The community schema (migrations 028-032) exists for future cross-workspace collaboration patterns.

Onboarding (a Sprint 2+ build category, see Section 6) is the mechanism by which expansion-time users join the workspace layer with appropriate sector_profile.

## Sprint 1's Actual Scope

Sprint 1 equals chrome remediation. RC-1 admin signal split, RC-7 jurisdiction vocabulary, RC-9 canonical entity dedup, plus supporting schema infrastructure and operator queue plumbing.

**Sprint 1 includes:**

- Phase 1: admin signal documentation (RC-1; split helpers Option C selected)
- Phase 2: dedup schema design
- Phase 3: jurisdiction vocabulary extension
- Phase 4: migrations 079, 080, 081, 082
- Phase 5: data backfill (dedup transactions + jurisdictions / ISO backfill)
- Phase 6: ingest wiring (gets data INTO the system; classifier source onboarding plus jurisdiction normalization at ingest time)
- Phase 7: admin chrome + minimum viable triage UI (operator-facing, NOT customer-facing)
- Phase 8: workspace_settings finalization
- Phases 9-11: less defined; Phase 11 is hard-delete loser rows from dedup

**Sprint 1 does NOT include:**

- Market Intel feature build (signal aggregation, predictive timing, alert wiring)
- Research feature build (horizon-scan engine)
- Operations feature build (cross-functional decision engine)
- Onboarding flow build (the expansion mechanism for new freight forwarding cohorts)
- Any currently-broken customer-facing page becoming functional

Anyone describing Phase 6 or Phase 7 as "what will fix Market Intel" or "what makes Operations work" is wrong. Phase 6 is data plumbing. Phase 7 is admin chrome and the operator-side triage queue for the data Phase 6 plumbs. Neither builds customer-facing features.

## The Customer-Facing Value Gap

Five customer-facing feature categories require build work that has not been scoped or sequenced in Sprint 1:

1. **Market Intel.** Signal aggregation, predictive timing, actionable alerts on industry behavior. Requires functional specification, data pipeline design, UI design, implementation. Currently a placeholder shell with non-interactive alerts SideCard and worker-language-leaking EmptyState.

2. **Research.** Horizon-scan engine that pulls from academic + industry analytical sources, surfaces findings, connects to operational implications. Requires source curation (the industry analytical press list in Section 3 is the starting set), scanning logic, UI design, implementation. Currently a placeholder pipeline with the source coverage matrix stub deferred.

3. **Operations.** Cross-functional decision engine integrating regulatory requirements, regional resource availability, labor markets, materials sourcing, infrastructure capacity, and operational cost data. Largest scope of the three. Requires extensive specification, multi-source integration (LinkedIn Economic Graph, regional wage data, materials registry, infrastructure capacity feeds, cost data feeds), decision logic design, UI design, implementation. Currently shows "Not yet ingested" and "Coming soon Phase D" banners across most jurisdictions.

4. **Onboarding flow.** The mechanism for expansion-time users (broader freight forwarding cohorts) to join the platform with appropriate sector_profile customization and workspace_settings. Required for the architectural intent to materialize. Requires UX design, sector_profile taxonomy expansion, ingest scaling considerations. Not currently scoped.

5. **Future categories surfaced during expansion planning.** Reserved.

**Realistic scope.** Each of categories 1-4 is plausibly its own sprint of build work. Sprint 2 through Sprint 5 territory. Not Sprint 1.

## When This Skill Applies

Apply this skill on:

- All design dispatches and implementation dispatches on Caro's Ledge build work
- All sprint planning or sequencing dispatches
- All audits (system audit, page audit, value audit, alignment audit)
- Any work that proposes to change phase or sprint order
- Any work touching customer-facing surfaces (Market Intel, Research, Operations, Regulations, onboarding)

Do NOT trigger on:

- Pure investigation or research dispatches with no build surface
- Hotfix dispatches addressing a specific incident
- Dispatches strictly bounded to a single non-sprint workstream (e.g. fixing a typo in a doc)

When in doubt, apply the skill. The cost of emitting the Value Delivery Check section on a small dispatch is one paragraph. The cost of missing it on a sprint-level dispatch is multi-week customer-facing schedule slip going unsurfaced.

## What You Must Do

At the start of every relevant dispatch, before drafting the work product:

1. **Read this skill in full.** Skill content evolves; do not rely on memory.
2. **Identify the work's nature.** Does the dispatch's deliverable directly advance customer-facing value delivery (Market Intel, Research, Operations, onboarding feature builds), or does it advance infrastructure, foundations, or chrome (schema, ingest, classifier, admin tools, triage)?
3. **State the nature explicitly in the dispatch report.** If the dispatch is infrastructure work, state in the report that this work does NOT directly close the customer-facing value gap, and identify which sprint or phase IS responsible for that closure.
4. **Surface sequence changes.** If the dispatch proposes changing build sequence, state explicitly whether the change pushes customer-facing value delivery further out or brings it closer. If further out, surface for operator decision; do not silently absorb the delay.
5. **Emit the Value Delivery Check section** in every dispatch report (see format below). Even infrastructure-only dispatches emit a brief section confirming the work is infrastructure and identifying which dispatch IS expected to close the customer-facing gap.
6. **Surface narrowing decisions.** If the dispatch narrows scope to current operational verticals only (art logistics, live events, etc.) without serving expansion-time users, OR narrows to abstract expansion users without grounding in current customer cohort, surface the narrowing for operator decision.

## Value Delivery Check section format

Every dispatch report invoking this skill MUST include a section formatted exactly as:

```
=== Value Delivery Check ===

This dispatch's work [does / does not] directly advance customer-facing value delivery.

[If does not: identify which sprint or phase IS responsible for that closure, and whether the work pushes customer-facing value delivery further out.]

[If does: identify which customer-facing feature category (Market Intel / Research / Operations / Onboarding) and what specific gap it closes.]

[Optional one line: dual-posture check confirming the work serves both current operational scope AND expansion-time users, OR a narrowing flag if it serves only one.]
```

This format applies to ALL dispatch reports invoking this skill, including infrastructure-only dispatches (which emit the section briefly to confirm awareness). The section is not optional. A dispatch report missing the section is incomplete.

## Worked example

A Phase 7 implementation dispatch's Value Delivery Check would read:

```
=== Value Delivery Check ===

This dispatch's work does NOT directly advance customer-facing value delivery.

This is admin chrome and operator-facing triage UI work per [phase-7-scope-amendment.md](docs/sprint-1/phase-7-scope-amendment.md). It closes the RC-1 admin signal leak and ships the minimum viable jurisdiction triage queue for operator review of ingest_rejections and pending_jurisdiction_review rows. None of this work is visible to customer-facing users (workspace owners, end users on /, /regulations, /market, /research, /operations, /map).

The customer-facing value gap on Market Intel, Research, and Operations is NOT closed by this dispatch. Closure is Sprint 2+ scope per caros-ledge-platform-intent SKILL.md Section 6, currently unscoped.

Dual-posture check: this work serves the operator role (platform layer admins) regardless of expansion. No current-vs-expansion narrowing.
```

A Sprint 2 Market Intel design dispatch's Value Delivery Check would read:

```
=== Value Delivery Check ===

This dispatch's work DOES directly advance customer-facing value delivery.

Feature category: Market Intel. Specific gap: the /market page currently shows a non-interactive "8 alerts" SideCard (OBS-18) and a worker-language-leaking EmptyState (OBS-20). This dispatch designs the signal aggregation engine, alert clickthrough wiring, and workspace-anchored EmptyState copy that turn the page from placeholder shell into a functional Market Intel surface per the platform-intent skill Section 3.

Dual-posture check: signal aggregation targets both current cohort (art logistics market signals, live events procurement signals) AND expansion-time users (general freight market signals via BloombergNEF, MSCI, Workiva, ESG Today, Carbon Pulse). Source curation explicitly covers both.
```

## Authority Grant

You are authorized to:

- Flag when work descriptions conflate infrastructure completion with customer-facing value delivery
- Recommend reordering work if the current sequence is leaving customer-facing pages broken longer than necessary
- Surface scope gaps where customer-facing builds have not been scoped or sequenced
- Surface narrowing decisions where work serves only current operational scope but not expansion-time users (or vice versa)
- Emit the Value Delivery Check section without operator pre-authorization on every relevant dispatch

You are NOT authorized to:

- Unilaterally reorder sprints
- Build customer-facing page features without explicit operator authorization on scope, design, and sequence
- Author new design principles (those require operator authorization per `sprint-followups-discipline`)
- Modify the platform's value proposition or four-page architecture without operator authorization
- Modify the source taxonomy in `environmental-policy-and-innovation` (that skill owns the canonical taxonomy; this skill cites it)

## Anti-Patterns

These framings mean the skill was loaded but not followed:

- **"Phase 7 will fix Market Intel / Research / Operations."** Phase 7 is admin chrome and operator triage UI, not customer-facing pages. Anyone making this framing is conflating operator surfaces with customer surfaces.
- **"Phase 6 will fix customer-facing pages."** Phase 6 is ingest wiring (data into system), not customer-facing UX. Plumbing better data does not by itself fix a placeholder UI shell.
- **"Infrastructure complete" implying value delivered.** Infrastructure completion and customer-facing value delivery are different. A dispatch saying "all foundations ready" without also saying "the customer-facing pages are still broken" is misleading.
- **Silently absorbing schedule slip for customer-facing pages when infrastructure work expands.** If a Sprint 1 phase grows in scope, the customer-facing build sprints get pushed further out. Surface the push; do not absorb silently.
- **Narrowing scope to current operational verticals without flagging.** A decision that serves art logistics and live events but not generic freight forwarders is a real narrowing; flag it.
- **Narrowing scope to expansion-only without flagging.** A decision that serves only the abstract future cohort without grounding in current customers is also a real narrowing; flag it.
- **Page scope drift across the four-category taxonomy.** Examples: putting regulatory deadlines in Market Intel scope when they belong in Regulations; treating Research as academic-only when it includes industry analytical press; under-scoping Operations as a content surface when it is a cross-functional decision engine. The four-page mapping is binding; drift requires operator authorization.
- **Skipping the Value Delivery Check section because the dispatch is "small."** The section is one paragraph; it is not skippable.

## Integration With Other Skills

This skill loads alongside, not in place of, three other skills. Every relevant dispatch loads all four:

- **`environmental-policy-and-innovation`** is the canonical source for the four-category source taxonomy (`regulatory`, `research`, `market_news`, `operational_data`) and for content integrity, workspace-anchored output, source classification hierarchy, severity labels, and the integrity rule. This skill cites that one for taxonomy and content rules; this skill does NOT duplicate them. When the canonical taxonomy in `environmental-policy-and-innovation` evolves, the page scoping in Section 3 of this skill follows.

- **`sprint-followups-discipline`** owns OBS loop closure and DP compliance enforcement. Every relevant dispatch emits the OBS coverage table and DP compliance section per that skill, AND the Value Delivery Check section per this skill. The two sections coexist; neither replaces the other.

- **`frontend-design`** owns UI conventions for customer-facing build work. When a customer-facing build dispatch is authorized, `frontend-design` governs how the UI is structured.

When all four skills are loaded, every dispatch addresses content integrity, OBS coverage, design conventions, AND customer-facing value-delivery awareness. The four are additive, not exclusive.

## Skill Load Confirmation

When this skill loads on a dispatch, the agent's pre-work report states:

- That this skill loaded
- The dispatch's nature (infrastructure / customer-facing build / mixed)
- The Value Delivery Check section preview (the dispatch may refine the section in the final report; the preview confirms the skill is applied)

If any of these cannot be stated cleanly, HALT and surface the ambiguity to the operator before proceeding.
