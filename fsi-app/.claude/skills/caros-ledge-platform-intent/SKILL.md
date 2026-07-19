---
name: caros-ledge-platform-intent
description: Caro's Ledge platform value proposition, the binding five-surface customer-facing model, and the customer-facing value-delivery discipline. The platform is a freight sustainability intelligence SaaS with two coupled value halves, intelligence (four pages: Regulations, Market Intel, Research, Operations, mapped to the source-category taxonomy in environmental-policy-and-innovation) and community (one surface: Community, co-equal with the four pages, addressing the freight industry information-isolation problem). Cross-cutting capabilities include Map (geographic view of Regulations content) and Intelligence Assistant (research helper grounded in platform skills and content, NOT a synthesis or decision engine). Serves freight forwarders (current scope: art logistics, live events, luxury goods, automotive, humanitarian; expansion: broader freight forwarding across air, road, ocean, rail). Every dispatch on Caro's Ledge build sequencing, design, audit, or implementation MUST emit the structured Value Delivery Check section listing the five surfaces explicitly. Loads alongside environmental-policy-and-innovation, sprint-followups-discipline, frontend-design.
when_to_load:
  - "Any Caro's Ledge build sequencing dispatch (sprint planning, phase scoping, build allocation)"
  - "Any Caro's Ledge design dispatch (phase design, feature design, surface design)"
  - "Any Caro's Ledge audit dispatch (alignment audit, sweep, code review of customer-facing surfaces)"
  - "Any Caro's Ledge implementation dispatch (phase build, feature build, schema work)"
  - "Any dispatch touching the five customer-facing surfaces (Regulations, Market Intel, Research, Operations, Community) or cross-cutting capabilities (Map, Intelligence Assistant)"
  - "Borderline cases: default to load and emit the Value Delivery Check section"
---

# Caro's Ledge Platform Intent

## Why this skill exists in its current form

This skill is the canonical platform model that downstream dispatches load to ground their scoping, audits, and build sequencing. Two corrections that the operator has stated with strong emphasis multiple times across sessions are now codified here, replacing the framings in the prior version (commit `2429d4a`).

The two binding corrections:

1. **Community is a CORE customer-facing surface, co-equal with the four intelligence pages.** Not Category 5. Not an onboarding mechanism. Not a sub-feature. The freight industry has a structural information-isolation problem: industry professionals and clients across geographies duplicate efforts because they do not know what others are doing. Caro's Ledge exists in significant part to fix this. The peer information-sharing function (working groups, forums, peer connection) is non-negotiable. (Per operator-stated correction 2026-05-24, the vendor directory sub-feature has been removed from scope entirely; this prior framing about deprecation no longer applies.)

2. **The Intelligence Assistant is a RESEARCH HELPER, not a synthesis or decision engine.** It leverages Caro's Ledge's accumulated expertise (the platform skills, primarily environmental-policy-and-innovation, plus platform content) to answer cross-cutting questions during user research on the site. Synthesis happens through structured content plus the Assistant plus customer judgment. There is no separate "Operations decision engine" or equivalent to build. Operations surfaces structured content; the Assistant answers questions about it; the customer makes the decision.

These corrections affect downstream work directly: the alignment audit at `docs/sprint-1/alignment-audit-2026-05-18.md` was authored against the prior four-page-plus-onboarding model and missed Community. OBS-18 and OBS-19 routed customer-facing concerns to infrastructure phases. The Chrome audit observed phase-language ("Coming soon, Phase D") shipped to customers on `/operations` and `/research`. The Operations build was scoped as "very large" because it was framed as a separate decision-engine UI rather than structured content plus AI helper.

Future dispatches that treat Community as optional or treat the Intelligence Assistant as a synthesis layer are in violation of this skill and must be surfaced for operator correction.

## Operator-Stated Corrections, 2026-05-24

Four corrections landed in the design rebuild handoff session and are now codified here. Each is operator-stated with strong emphasis per Section 10 Authority Grant.

1. **Dashboard is a canonical cross-cutting capability.** Dashboard was absent from the surface enumeration in earlier revisions of this skill. The operator confirmed it stays as-is and is part of the canonical model. Dashboard is the digest/triage view that surfaces what is new, important, and flagged across the five intelligence surfaces. It is NOT a sixth intelligence surface; it is cross-cutting alongside Map, Intelligence Assistant, and Onboarding. See the Cross-Cutting Capabilities section below.

2. **Vendor directory is removed from Community.** The vendor directory sub-feature is no longer part of the platform. References to it have been removed from Section 3.5 COMMUNITY and from the Three-Layer Tenant Model. Any prior dispatch report or follow-up that scoped vendor directory expansion is superseded.

3. **Editorial pickup pipeline status is corrected to in-flight.** Section 3.5 previously listed editorial pickup pipeline as shipped per Workstream B. The 2026-05-23 cross-surface audit confirmed the pipeline is absent or stubbed. Section 3.5 now reflects the actual in-flight state. The customer-facing `/research` surface does NOT consume Community pickups today; that wiring is part of the Community rebuild dispatch.

4. **LinkedIn import is in-flight, not a stub.** Section 3 ONBOARDING FLOW previously labeled LinkedIn import as "currently stub". The operator confirmed it is an in-flight feature build. Section 3 ONBOARDING FLOW and Section "Customer-Facing Value Gap" item 5 are updated accordingly.

These corrections must inform all Sequence C surface rebuild dispatches (Research, Operations, Market Intel, Community, Regulations Detail) starting with the Community rebuild which depends directly on corrections 2 and 3.

## Platform Value Proposition

Caro's Ledge is a freight sustainability intelligence platform with two coupled value halves.

**The intelligence half.** Four pages delivering categorized content. The pages map to the source-category taxonomy in `environmental-policy-and-innovation` (regulatory, research, market_news, operational_data). Caro's Ledge supplies operator-actionable intelligence (regulatory updates, market signals, research findings, operational cost intelligence) in context-anchored briefs that respect the workspace-anchored output rule and integrity rule from that skill.

**The community half.** One surface (Community) addressing the freight industry information-isolation problem. Industry professionals and clients in different geographies duplicate efforts because they do not know what others are doing. Community is the peer resource that fixes this through working groups, forums, and peer connection.

Both halves are core. Neither is sufficient alone. A platform that delivers categorized intelligence without peer information-sharing solves only half the market gap. A peer-sharing platform without categorized intelligence solves only the other half. Caro's Ledge solves both.

**Current operational scope.** Freight forwarders specializing in art logistics, live events, luxury goods, automotive (classic, supercars, prototypes), and humanitarian cargo. Reflects the founding workspace and current customer cohort.

**Architectural intent.** Multi-tenant SaaS designed to expand into the broader freight forwarding industry across air (primary), road (secondary), ocean (tertiary), and rail (rarely) modes. Expansion mechanism is operator onboarding with `sector_profile` customization driving workspace-scoped intelligence delivery and Community participation. The three-layer tenant model and `workspace_settings` shape support this expansion without architectural rework.

**Dual posture is the default.** Decisions about source coverage, classifier scope, jurisdiction taxonomy, ingest volume, page features, Community configuration, vendor directory entries, and onboarding flow must consider both current users (specialized verticals) and onboarding-time-future users (broader freight forwarding). Narrowing scope to current-only or expansion-only must be flagged explicitly. Silent narrowing is forbidden.

## The Five Customer-Facing Surfaces

The four intelligence pages map to the source-category taxonomy in `environmental-policy-and-innovation` (the canonical source for the mapping; do not duplicate the taxonomy here, cite it). The fifth surface (Community) is co-equal.

### REGULATIONS

**Scope.** Binding regulatory intelligence. Laws, agency rules, court decisions, treaties, and rulemaking outcomes affecting freight operations across air, road, ocean, rail modes. Includes regulatory deadlines, enforcement dates, comment periods, and binding compliance requirements.

**Analysis contract (RULED 2026-07-12).** Regulations is the ONLY page whose read is a COMPLIANCE-ACTION TEXT brief — what is binding, when, what it costs, what to do. Not comparative/numerical. One generic analysis path serving all pages is forbidden. Doctrine register: `analysis-follows-page-intent`.

**Source category mapping** (per environmental-policy-and-innovation `item_type` and `format_type` derivation). Regulations surfaces items of `item_type` in (`regulation`, `directive`, `standard`, `guidance`, `framework`), formatted as Regulatory Fact Documents (14 sections, conditional).

**Current state.** Functional. The only intelligence page currently delivering its stated intent.

### MARKET INTEL

**Scope.** Industry signals and what the industry is doing. Corporate announcements (vendor claims, capital flows, technology deployment signals, supplier shifts, capacity changes), commercial research output (BloombergNEF, MSCI, Moody's, Workiva, S&P Global Sustainable1), cross-cutting sustainability trade press (ESG Today, Bloomberg Green, Carbon Pulse, FT Moral Money, Reuters Sustainable Switch), carbon market intelligence, fuel pricing signals, predictive timing on market movements.

Cross-references Regulations to surface signals like "regulatory deadline approaching," but the deadline content itself lives in Regulations. Example: BYD announcing a battery advancement is Market Intel. The CBAM 2026 enforcement deadline is Regulations; Market Intel may surface a "CBAM enforcement window closing" signal that links back to the Regulations entry.

**Analysis contract (RULED 2026-07-12).** Market Intel reads are COMPARATIVE / NUMERICAL — deltas, trajectories, lead-time against competitors and adjacent industries — not a compliance-action text brief. Doctrine register: `analysis-follows-page-intent`.

**Source category mapping.** `market_signal`, `initiative` (Market Signal Brief format) plus corporate-press records.

**Current state.** Broken. Alerts SideCard is non-interactive (OBS-18), EmptyState exposes worker-language to end users (OBS-20), taxonomy bleed because `/market` and `/operations` share the same unfiltered payload (per alignment audit Section B), no real signal aggregation engine running.

### RESEARCH

**Page intent (RULED 2026-07-12).** Research answers the operator question: *what is emerging, who is studying it, how does it change my planning horizon.* This is horizon-scan by construction. Research IS the customer-facing horizon-scan destination; its feedstock is AUTONOMOUS intake from research-role sources (universities, academic journals, institutes, analytical/horizon-scan press) — machine-ingested, not editor-selected. An editorial / curation / draft-staging QUEUE on Research is REJECTED (intent-drift + a no-human-finish-of-intake / RD-20 violation). Doctrine register: `research-is-horizon-scan`.

**Scope.** Horizon-scan content with analytical or quantitative depth. Includes:

- Peer-reviewed academic journals (Journal of Sustainable Transportation, transport research journals)
- Think-tanks and policy analysis (IEA, IRENA, IPCC, World Bank, OECD, ICAP, Carbon Trust)
- Quantified climate research (Project Drawdown)
- Industry analytical press with named editorial provenance (Loadstar, FreightWaves Sustainability, Edie, GreenBiz, Environmental Finance, Splash247 Green, Supply Chain Digital)
- Reuters Sustainable Business analytical reporting (distinct from the trade-press Sustainable Switch newsletter which lives in Market Intel)

Research is BROADER than peer-reviewed academic. The discriminator is analytical and horizon-scanning depth, not academic publication form.

**Analysis contract (RULED 2026-07-12).** Research reads are STRUCTURED HORIZON ASSESSMENTS — horizon distance, maturity, credibility of who is studying it, and the planning-assumption shift — NOT paper summaries. Doctrine register: `analysis-follows-page-intent`.

**Source category mapping.** `research_finding` (Research Summary format, 6 sections); some `technology`, `innovation`, `tool` items (Technology Profile format) also surface here when the substance is horizon-scan rather than market-signal.

**Current state.** Broken. Currently functioning as an editorial draft-staging queue for Regulations content rather than as a horizon-scan destination. The `publishedThisWeek` callout titles render as `<b>` text without Links. No live ingest pipeline producing Research Summary briefs from the analytical-press sources; the sources are registered as legacy resource entries only. Source coverage matrix is a hardcoded placeholder with the tab hidden.

**Positioning — RULED (operator 2026-07-12), decision CLOSED.** Research IS the customer-facing horizon-scan destination; the editorial draft-staging queue is REJECTED (intent-drift + RD-20 no-human-finish-of-intake — an editorial queue makes a human the finish of the Research pipeline). Any editorial draft-staging need moves to admin chrome, never onto the Research surface. Future Research-surface work that introduces curation queues, operator-approval affordances, editor-picked content, or "featured/selected by" framing is a regression against this ruling and RD-20. Doctrine register: `research-is-horizon-scan`.

### OPERATIONS

**Scope.** Jurisdictional decision intelligence. Surfaces structured content across:

- Regulatory feasibility by region (which regulations apply where, with what enforcement)
- Regional resource availability (materials, recyclables, qualified suppliers)
- Labor markets (regional wage data, workforce availability)
- Materials sourcing (regional supplier base, qualified mills)
- Infrastructure capacity (ports, rail, terminals, charging)
- Operational cost data (electricity, diesel, SAF, port handling, drayage)

Examples of decisions Operations supports:

- HVAC monitoring system versus hiring two people manually (cost and labor)
- Cross-regional efficiency and cost comparison
- Recyclable materials availability by region (materials sourcing)
- PPWR packaging compliance feasibility by region given material supply (regulatory feasibility integrated with regional resources)
- Solar versus automation versus hire decisions across regions

**Build framing (binding).** Operations surfaces structured content. The customer reads the content and uses the Intelligence Assistant for cross-cutting questions during research. Synthesis happens through structured content plus Assistant plus customer judgment, NOT through a separate decision-engine UI. Operations is a content build, not a synthesis-engine build. Anyone scoping Operations as a separate "cross-functional decision engine UI" build is scoping wrong; this is the framing that the prior version of this skill propagated and that the alignment audit absorbed.

**Analysis contract (RULED 2026-07-12).** Operations reads are STRUCTURED JURISDICTIONAL DATA SURFACES — comparative/numerical regional intelligence (feasibility, cost, labor, materials, infrastructure) for hire-vs-automate and infrastructure decisions — not a text brief. Doctrine register: `analysis-follows-page-intent`.

**Source category mapping.** `regional_data` (Operations Profile format, 8 sections) plus cross-references from `regulatory` and `market_news` items.

**Current state.** Broken. Stub gallery with regex chip matchers (Solar, Electricity, Labor, EV Charging, Green Building) that mis-attribute wiring gaps as coverage gaps (OBS-19). Phase-language banner "Coming soon, Phase D" leaked to customers (anti-pattern; see Section 11). No real content for most jurisdictions.

### COMMUNITY

**Scope.** Peer information-sharing across organizations and client cohorts to address freight industry information isolation. CORE value surface, equal status with the four intelligence pages. The freight industry has a structural problem: professionals and clients in different geographies duplicate efforts because they do not know what others are doing. Community is the peer resource that fixes this.

**Components currently shipped** (per Multi-Tenant Foundation Workstream B, 2026-05-15):

- Private working groups (org-scoped or cross-org peer collaboration spaces)
- Public forums (open discussion threads)
- Promote-to-public workflow (private content can be promoted to public discussion)

**In-flight, not yet shipped:**

- Editorial pickup pipeline (Caro's Ledge editors surface a public Community thread inside platform intelligence). The 2026-05-23 cross-surface audit confirmed this is absent or stubbed. Wiring is part of the Community rebuild dispatch.

**Removed from scope** (operator-stated correction 2026-05-24):

- Vendor directory. No longer part of the platform. Any prior dispatch report or follow-up that scoped vendor directory expansion is superseded.

**Source category mapping.** Community does NOT map to the four-category source taxonomy. Community content is user-generated peer discussion plus editorial pickups; it is not classifier output from external sources. The two halves of the platform (intelligence and community) are structurally distinct in this respect.

**Current state.** Partially functional. Working groups, forums, and promote-to-public shipped per Workstream B. Editorial pickup pipeline is in-flight (absent/stubbed per the 2026-05-23 audit). Gaps: author-identity rendering (org + role + sector + region), region/group structure on the index page, AI prompt bar wiring, topic-by-region matrix, sector-taxonomy-driven group seeding for new workspaces.

## Cross-Cutting Capabilities

These span the five surfaces; they are not surfaces themselves.

### DASHBOARD

**Surface.** Home route at `/`.

**Function.** Digest and triage view surfacing what is new, important, and flagged across the five intelligence surfaces. The customer's first stop on each session, organizing recent updates, urgent items, and saved attention items into a scannable single page. NOT a sixth intelligence surface; Dashboard does not introduce its own content category. Every item rendered on Dashboard cross-references back to its canonical surface (Regulations, Market Intel, Research, Operations, Community).

**Operator-stated framing (2026-05-24).** Dashboard stays as-is. The current "what's new + what's important + flagged items" framing is correct. Not in design rebuild scope; Sequence C rebuilds do not touch Dashboard. Future refinement, if any, runs as a separate parallel dispatch.

**Source category mapping.** Dashboard is a view across all four source categories; it does not surface its own content category.

**Current state.** Functional.

### INTELLIGENCE ASSISTANT

**Surface.** Available globally (floating button in `AppShell`) and per-page (Ask anything about prompt bars on `/market`, `/research`, `/operations`, `/regulations`, `/map`).

**Function.** Research helper. Leverages Caro's Ledge accumulated expertise (the platform skills, primarily `environmental-policy-and-innovation`, plus platform content) to answer questions arising during user research on the site. Grounded in skill content and platform records, not free-form LLM output.

**Not a synthesis engine. Not the Operations decision engine. Not the Research horizon-scan engine.** It is an answer-generation helper for cross-cutting questions during the customer's research session on the site. The customer reads the structured content on the surface they are on, asks the Assistant for help with cross-cutting questions, applies their own judgment, and decides.

**Current state.** Wired into the surfaces. Quality and grounding of responses against platform skills not yet verified end-to-end (Sprint 2+ Intelligence Assistant quality dispatch).

### MAP

**Surface.** Geographic visual layer over Regulations content. Lives at `/map`.

**Function.** Region-specific search done visually as a filter alternative to the Regulations list view. A view of Regulations content, not a separate content category.

**Future cross-cutting use.** Visualizing agent availability across regions (when that feature ships). Possibly visualizing Community working group presence by region.

**Source category mapping.** Map is a view of Regulations content; the source category is `regulatory`. Map does not surface its own content.

**Current state.** Functional as a view of Regulations.

### ONBOARDING FLOW

**Surface.** Multi-step wizard at `/onboarding`, plus `/signup`, `/invitations/[token]`, `/workspace/new`.

**Function.** Mechanism for expansion-time users to join the Workspace layer with appropriate sector_profile customization and Community participation. Required for the architectural intent to materialize.

**Current state.** Partially shipped per Multi-Tenant Foundation Workstream B (4-step wizard, signup, invitation accept/decline plumbing, minimal NoWorkspaceLanding). Gaps: sector taxonomy expansion in the wizard (currently highlights 6 current niches), email-delivered invitations (currently copy-URL only), chrome polish on `NoWorkspaceLanding`, sector_profile-driven Community group seeding for new workspaces. LinkedIn import is in-flight (operator-stated 2026-05-24, not a stub).

Onboarding is a customer-facing capability, but it is cross-cutting rather than a content surface; it provisions access to the surfaces rather than displaying content itself.

## Three-Layer Tenant Model

- **Platform layer.** Shared intelligence, source registry, classifier, internal staff (`profiles.is_platform_admin = true` gates platform-level surfaces).
- **Workspace layer.** Org-scoped intelligence delivery. `workspace_settings`, `org_memberships`, `sector_profile` drive what each workspace sees and how briefs are anchored.
- **Community layer.** Cross-org peer information-sharing. Working groups, forums, promote-to-public, editorial pickup (in-flight). Spans organizations. (Vendor directory removed from scope per operator-stated correction 2026-05-24.)

Onboarding is the mechanism by which an expansion-time user joins the Workspace layer and gains Community participation.

## Sprint 1 Actual Scope

Sprint 1 equals chrome remediation and foundations. Phases 1 through 11 of foundation work. Sprint 1 does NOT include customer-facing feature builds for any of the five surfaces.

**Sprint 1 includes:**

- Phase 1: admin signal documentation (RC-1)
- Phase 2: dedup schema design
- Phase 3: jurisdiction vocabulary extension
- Phase 4: migrations 079, 080, 081, 082
- Phase 5: data backfill
- Phase 6: ingest wiring (data into the system)
- Phase 7: admin chrome + minimum viable triage UI (operator-facing, not customer-facing)
- Phase 8: workspace_settings finalization
- Phases 9-11: less defined; Phase 11 is hard-delete loser rows from dedup

**Sprint 1 does NOT include:**

- Category routing wiring (the existing category-aware RPCs are orphans not invoked by application code, per alignment audit Section B; this is REC-OBS-G remediation, Sprint 2)
- Market Intel feature build
- Research feature build or repositioning decision
- Operations content build
- Community expansion (vendor / group / onboarding seeding for expansion cohorts)
- Intelligence Assistant quality verification
- Onboarding completion (email, LinkedIn, chrome polish)
- Any currently-broken customer-facing surface becoming functional

Anyone framing Phase 6 or Phase 7 as "what will fix Market Intel / Research / Operations / Community" is wrong. Phase 6 is data plumbing. Phase 7 is operator chrome.

## Customer-Facing Value Gap

Sprint 2+ work, not scoped in Sprint 1:

1. **Category routing wiring (REC-OBS-G remediation).** Connect the existing category-aware RPCs (`get_market_intel_items`, `get_research_items`, `get_operations_items`) into application code so the four intelligence pages deliver differentiated content. Foundation for everything else; without this, /market and /operations continue to share the same unfiltered payload.
2. **Market Intel feature build.** Signal aggregation, predictive timing, source-registry expansion, alerts wiring (close OBS-18), EmptyState workspace-anchored rewrite (close OBS-20), taxonomy bleed cleanup.
3. **Research repositioning and build.** Decide whether Research stays as the editorial draft-staging queue or becomes the customer-facing horizon-scan destination. Then build accordingly: source-registry expansion for analytical-press sources, scanning logic, 6-section Research Summary brief generation, source coverage matrix implementation.
4. **Operations content build.** Surface jurisdictional decision intelligence per Section 3 as structured content. NOT a separate decision-engine UI. Build the content (regulatory feasibility by region, regional resource availability, labor markets, materials sourcing, infrastructure capacity, operational cost data) and let the Intelligence Assistant handle cross-cutting questions. Replace stub chips with real content; remove phase-language banner; redesign for current cohort and expansion cohort coverage.
5. **Community expansion and onboarding completion.** Extend working-group taxonomy beyond current art-logistics cohort; complete onboarding flow (sector taxonomy expansion in wizard, email-delivered invitations, chrome polish on NoWorkspaceLanding, LinkedIn import completion); wire sector_profile-driven Community group seeding for new workspaces. (Vendor directory removed from scope per operator-stated correction 2026-05-24; LinkedIn import is in-flight rather than a stub per the same correction.)
6. **Intelligence Assistant quality.** Verify the Assistant loads and uses platform skills (especially `environmental-policy-and-innovation`) to ground responses. Verify it does not behave as a synthesis or decision engine. Bound its scope to research-helper function.

Items 2 through 5 each plausibly their own sprint. Sprint 2 through Sprint 5 territory. Item 1 (routing wiring) is the foundation that gates items 2 through 4 and should run first.

## When This Skill Applies

Apply this skill on:

- All design dispatches and implementation dispatches on Caro's Ledge build work
- All sprint planning or sequencing dispatches
- All audits (system audit, page audit, value audit, alignment audit, chrome audit)
- Any work that proposes to change phase or sprint order
- Any work touching customer-facing surfaces (the five surfaces, plus Map, Intelligence Assistant, Onboarding)
- Any work proposing to modify this skill's framing (such work requires the operator's explicit authorization with strong-emphasis correction; see Section 10)

Do NOT trigger on:

- Pure investigation or research dispatches with no build surface
- Hotfix dispatches addressing a specific incident
- Dispatches strictly bounded to a single non-sprint workstream (e.g. fixing a typo)

When in doubt, apply the skill. Emitting the Value Delivery Check section on a small dispatch costs one paragraph; missing it on a sprint-level dispatch costs multi-week customer-facing schedule slip going unsurfaced.

## What You Must Do (Active Discipline)

At the start of every relevant dispatch, before drafting the work product:

1. **Read this skill in full.** Skill content evolves; do not rely on memory.
2. **Identify the work's nature.** Does the dispatch's deliverable directly advance customer-facing value delivery on any of the five surfaces (Regulations, Market Intel, Research, Operations, Community) or on the cross-cutting capabilities (Map, Intelligence Assistant, Onboarding), or does it advance infrastructure, foundations, or chrome (schema, ingest, classifier, admin tools, triage)?
3. **State the nature explicitly in the dispatch report.** If infrastructure, name the work as infrastructure, state that it does NOT directly close the customer-facing value gap, and identify which sprint or phase IS responsible.
4. **Surface sequence changes.** If the dispatch proposes changing build sequence, state whether the change pushes customer-facing value delivery further out or brings it closer. If further out, surface for operator decision; do not silently absorb the delay.
5. **Emit the Value Delivery Check section** in every dispatch report (format below).
6. **Surface narrowing decisions.** Flag if the dispatch serves only current operational verticals without expansion-time users, or only expansion-time users without current cohort grounding.

### Value Delivery Check section format

Every dispatch report invoking this skill MUST include a section formatted exactly as:

```
=== Value Delivery Check ===

This dispatch's work [does / does not] directly advance customer-facing value delivery.

[If does not: identify which sprint or phase IS responsible for that closure, and whether the work pushes customer-facing value delivery further out.]

[If does: identify which surface (Regulations / Market Intel / Research / Operations / Community / Map / Intelligence Assistant / Onboarding) and what specific gap it closes.]

[Optional one line: dual-posture check confirming the work serves both current operational scope AND expansion-time users, OR a narrowing flag if it serves only one.]
```

This format applies to ALL dispatch reports invoking this skill, including infrastructure-only dispatches (which emit the section briefly to confirm awareness). The section is not optional. A dispatch report missing the section is incomplete. A dispatch report whose Value Delivery Check omits Community from the surface enumeration is in violation; surface for operator correction.

### Worked example: Phase 7 implementation dispatch

```
=== Value Delivery Check ===

This dispatch's work does NOT directly advance customer-facing value delivery.

This is admin chrome and operator-facing triage UI work per docs/sprint-1/phase-7-scope-amendment.md. It closes the RC-1 admin signal leak and ships the minimum viable jurisdiction triage queue. None of this work is visible to customer-facing users on Regulations, Market Intel, Research, Operations, Community, Map, the Intelligence Assistant, or Onboarding.

The customer-facing value gap on Market Intel, Research, Operations, Community expansion, and Onboarding completion is NOT closed by this dispatch. Closure is Sprint 2+ scope per caros-ledge-platform-intent SKILL.md Section "Customer-Facing Value Gap", currently unscoped.

Dual-posture: this work serves the operator role (platform layer admins) regardless of expansion. No current-vs-expansion narrowing.
```

### Worked example: Sprint 2 category routing wiring dispatch

```
=== Value Delivery Check ===

This dispatch's work DOES directly advance customer-facing value delivery.

Surface: foundation under all four intelligence pages (Regulations, Market Intel, Research, Operations). Closes REC-OBS-G by wiring the existing category-aware RPCs (get_market_intel_items, get_research_items, get_operations_items) into application code. Without this work, /market and /operations continue to share the same unfiltered payload and /research has no category filter at all.

Does NOT directly close gaps on Community, Map, Intelligence Assistant, or Onboarding; those are addressed by separate Sprint 2+ dispatches.

Dual-posture: routing wiring serves both current operational scope and expansion-time users equally; the routing applies to all sources regardless of cohort.
```

## Authority Grant

You are authorized to:

- Flag work descriptions that conflate infrastructure completion with customer-facing value delivery
- Recommend reordering work if the current sequence is leaving customer-facing surfaces broken longer than necessary
- Surface scope gaps where customer-facing builds have not been scoped or sequenced
- Surface narrowing decisions (current-only or expansion-only) without operator flag
- Emit the Value Delivery Check section without operator pre-authorization on every relevant dispatch

You are NOT authorized to:

- Unilaterally reorder sprints
- Build customer-facing surface features without explicit operator authorization on scope, design, and sequence
- Author new design principles (those require operator authorization per `sprint-followups-discipline`)
- Modify this skill's platform model framing (five-surface model, Intelligence Assistant as research helper, Map as view of Regulations, Operations as structured content not separate decision engine, Community as core not Category 5) without explicit operator authorization with strong-emphasis correction. The framing in this skill is binding. Drift requires operator-stated correction, not synthesis agent inference.
- Modify the source taxonomy in `environmental-policy-and-innovation` (that skill owns the canonical taxonomy; this skill cites it)

## Anti-Patterns

These framings mean the skill was loaded but not followed:

- **"Phase 7 will fix Market Intel / Research / Operations / Community."** Phase 7 is admin chrome and operator triage UI, not customer-facing surfaces. Confirmed in OBS-18 and OBS-19 prior to this skill's rewrite; those entries need in-place revision.
- **"Phase 6 will fix customer-facing surfaces."** Phase 6 is ingest wiring (data into system), not customer-facing UX. Plumbing better data does not by itself fix a placeholder UI shell.
- **Treating Community as Category 5, an add-on, or an onboarding mechanism.** Community is a core value surface, equal status with the four intelligence pages. Audit reports or dispatch scopes that omit Community from the customer-facing surface list are in violation.
- **Treating Intelligence Assistant as a synthesis layer, decision engine, or Operations build deliverable.** It is a research helper grounded in platform skills and content. Any Operations build that scopes "a separate Intelligence Assistant powered decision engine" is over-scoping; the Assistant is cross-cutting, not Operations-specific.
- **Treating Map as a separate content category.** Map is a geographic view of Regulations content. It does not surface its own content category.
- **"Infrastructure complete" implying value delivered.** Infrastructure completion and customer-facing value delivery are different. A dispatch saying "all foundations ready" without also saying "the customer-facing surfaces are still broken" is misleading.
- **Silently absorbing schedule slip for customer-facing surfaces when infrastructure work expands.** Surface the push; do not absorb silently.
- **Narrowing scope to current operational verticals without flagging.** A decision that serves art logistics and live events but not generic freight forwarders is a real narrowing; flag it.
- **Narrowing scope to expansion-only without flagging.** A decision that serves only the abstract future cohort without grounding in current customers is also a real narrowing; flag it.
- **Allowing phase-language ("Coming soon, Phase D", "Phase N", etc.) to leak into customer-facing UI.** Customers do not know what Phase D is. This anti-pattern has reached production at `/operations` and `/research`; flag wherever observed.
- **Page scope drift across the four-category source taxonomy.** Examples: putting regulatory deadlines in Market Intel scope when they belong in Regulations; treating Research as academic-only when it includes industry analytical press; under-scoping Operations as a content surface that needs a separate "decision engine" build when the correct framing is structured content plus Intelligence Assistant plus customer judgment.
- **Operations as separate decision-engine UI build.** Wrong framing. The product shape is structured content on the page plus Intelligence Assistant for cross-cutting questions plus customer judgment. Anyone scoping a separate decision-engine UI is over-scoping per the prior version of this skill's mis-framing.
- **Skipping the Value Delivery Check section because the dispatch is "small."** One paragraph; not skippable.
- **Value Delivery Check section that omits Community from the surface enumeration.** Violation. The five-surface model is canonical; Community is co-equal. Reports that enumerate "four pages plus onboarding" reflect the pre-rewrite mis-framing.

## The Five-Surface Scope Test (every decline names the five contracts)

Scope verdicts — decisions to DECLINE or PARK a candidate source, data feed, or instrument — failed three times in one week (2026-07-17) by testing the candidate against ONE surface and dropping it whole when it failed that surface. A candidate that fails the Regulations contract can still be an Operations cost feed; declining it against Regulations alone silently loses that value. This section makes the five-surface test a mechanical, universally-loaded step.

**Every scope decision that declines or parks a candidate MUST record a five-surface test (PI-5)** — a verdict and a one-line reason for EACH of the five surface contracts — before the decision stands. Doctrine register: `every-decline-names-the-five-contracts`. The live gate is the CHECK constraint on `coverage_gap_candidates` (a declined/parked row without the record fails the write); the fixture proof is `scripts/verify/surface-contract-gate.golden.mjs`.

### The five contracts (verbatim — what each surface would DO with the candidate)

- **Regulations** — a compliance-action text brief: what is binding, when, what it costs, what to do. Not comparative/numerical.
- **Operations** — structured jurisdictional cost / feasibility intelligence: per-region cost, labor, materials, infrastructure, feasibility for hire-vs-automate and lane decisions.
- **Market Intel** — comparative and numerical signal: deltas, trajectories, lead-time against competitors and adjacent industries.
- **Research** — a structured horizon assessment: horizon distance, maturity, credibility of who is studying it, and the planning-assumption shift.
- **Community** — human-operated peer surface, OUTSIDE machine intake by construction. A candidate never "routes to Community" as machine content; Community's verdict is essentially always out-for-machine-intake, recorded so the reasoning is explicit, not skipped.

Verdict vocabulary (recommended): `in` (this surface should carry it) / `out` (no fit) / `route` (belongs to this surface's sourcing program, hand it over) / `revisit` (conditional — names the condition, e.g. "check corpus coverage first"). The gate forces the DECISION to be recorded for all five; it does not constrain the verdict's shape beyond a non-empty verdict + reason.

### Inline test format (fill this on ANY decline/park verdict)

```
=== Surface-Contract Scope Test ===
Candidate: <name>          Disposition: declined | parked
- Regulations:  <in|out|route|revisit> — <one line: what Regulations would do with it, or why nothing>
- Operations:   <in|out|route|revisit> — <one line>
- Market Intel: <in|out|route|revisit> — <one line>
- Research:     <in|out|route|revisit> — <one line>
- Community:    <in|out|route|revisit> — <one line>
```

If any surface's verdict is `in` or `route`, the candidate is NOT a clean decline — it is a hand-off to that surface, recorded as `parked` (routed) rather than `declined`.

### Worked examples — the four 2026-07-17 failures and the test that catches each

- **(a) Cost/price/labor data feeds declined despite Operations = cost intelligence.** Industrial-electricity, transport-sector-wage, and bunker-fuel-price feeds were treated as "not a regulation" and dropped. The Operations line catches it: `Operations: in — per-region cost benchmark, exactly the jurisdictional cost-intelligence contract`. These are Operations feeds, not declines. (Session C's coverage lane got this right: it KEPT 27 such data-feed candidates.)
- **(b) Market Intel source discovery omitted.** A scope pass listed no candidate sources for Market Intel signals. The Market Intel line catches it: a decline/scope pass that leaves `Market Intel: <blank>` is incomplete — the contract (comparative/numerical signal discovery) was never tested.
- **(c) Research source discovery omitted.** Same shape on Research: `Research: <blank>` means the horizon-scan contract (who is studying it, maturity, assumption-shift) was never tested against the candidate.
- **(d) Clean Truck Check declined whole — the gate catching its own author.** The dispatch that ordered this gate had itself declined Clean Truck Check (CARB's heavy-duty inspection-and-maintenance program) outright. The five-surface test yields `Operations: in — recurring per-vehicle emissions-testing fee + cadence + non-compliance penalty on every heavy-duty vehicle on California lanes; a real drayage/warehousing cost`. So the correct verdict is parked-for-Operations, not a whole decline. The gate catches a mis-decline even in the dispatch that created it.

## Integration With Other Skills

This skill loads alongside, not in place of, three other skills. Every relevant dispatch loads all four:

- **`environmental-policy-and-innovation`** owns the canonical source taxonomy (`regulatory`, `research`, `market_news`, `operational_data` via the `item_type` and `format_type` derivation), the content integrity rule, the workspace-anchored output rule, the source classification hierarchy, severity labels, and the intersection-detection contract. This skill cites that one for taxonomy and content rules; this skill does NOT duplicate them. When the canonical taxonomy in `environmental-policy-and-innovation` evolves, the page scoping in Section 3 of this skill follows. The Intelligence Assistant is grounded primarily in this skill's content.

- **`sprint-followups-discipline`** owns OBS loop closure and DP compliance enforcement. Every relevant dispatch emits the OBS coverage table and DP compliance section per that skill, AND the Value Delivery Check section per this skill. The two sections coexist; neither replaces the other.

- **`frontend-design`** owns UI conventions for customer-facing build work. When a customer-facing build dispatch is authorized, `frontend-design` governs how the UI is structured.

When all four skills are loaded, every dispatch addresses content integrity, OBS coverage, design conventions, AND customer-facing value-delivery awareness against the binding five-surface model. The four are additive, not exclusive.

## Skill Load Confirmation

When this skill loads on a dispatch, the agent's pre-work report states:

- That this skill loaded (and its commit identifier if known)
- The dispatch's nature (infrastructure / customer-facing build / mixed / planning / audit)
- The Value Delivery Check section preview (the dispatch may refine the section in the final report; the preview confirms the skill is applied AND that all five surfaces plus the cross-cutting capabilities are correctly enumerated)

If any of these cannot be stated cleanly, HALT and surface the ambiguity to the operator before proceeding.

If the preview's surface enumeration omits Community or treats Intelligence Assistant as a synthesis layer, that is a skill-load failure; the agent must re-read this skill before proceeding.
