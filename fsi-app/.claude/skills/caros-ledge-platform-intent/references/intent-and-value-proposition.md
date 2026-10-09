## Why this skill exists in its current form

This skill is the canonical platform model that downstream dispatches load to ground their scoping, audits, and build sequencing. Two corrections that the operator has stated with strong emphasis multiple times across sessions are now codified here, replacing the framings in the prior version (commit `2429d4a`).

The two binding corrections:

1. **Community is a CORE customer-facing surface, co-equal with the four intelligence pages.** Not Category 5. Not an onboarding mechanism. Not a sub-feature. The freight industry has a structural information-isolation problem: industry professionals and clients across geographies duplicate efforts because they do not know what others are doing. Caro's Ledge exists in significant part to fix this. The peer information-sharing function (working groups, forums, peer connection) is non-negotiable. (Per operator-stated correction 2026-05-24, the vendor directory sub-feature has been removed from scope entirely; this prior framing about deprecation no longer applies.)

2. **The Intelligence Assistant is a RESEARCH HELPER, not a synthesis or decision engine.** It leverages Caro's Ledge's accumulated expertise (the platform skills, primarily environmental-policy-and-innovation, plus platform content) to answer cross-cutting questions during user research on the site. Synthesis happens through structured content plus the Assistant plus customer judgment. There is no separate "Operations decision engine" or equivalent to build. Operations surfaces structured content; the Assistant answers questions about it; the customer makes the decision.

These corrections affect downstream work directly: the alignment audit at `docs/sprint-1/alignment-audit-2026-05-18.md` was authored against the prior four-page-plus-onboarding model and missed Community. OBS-18 and OBS-19 routed customer-facing concerns to infrastructure phases. The Chrome audit observed phase-language ("Coming soon, Phase D") shipped to customers on `/operations` and `/research`. The Operations build was scoped as "very large" because it was framed as a separate decision-engine UI rather than structured content plus AI helper.

Future dispatches that treat Community as optional or treat the Intelligence Assistant as a synthesis layer are in violation of this skill and must be surfaced for operator correction.

## Operator-Stated Corrections, 2026-05-24

Four corrections landed in the design rebuild handoff session and are now codified here, followed by later dated corrections. Each is operator-stated with strong emphasis per Section 10 Authority Grant.

1. **Dashboard is a canonical cross-cutting capability.** Dashboard was absent from the surface enumeration in earlier revisions of this skill. The operator confirmed it stays as-is and is part of the canonical model. Dashboard is the digest/triage view that surfaces what is new, important, and flagged across the five intelligence surfaces. It is NOT a sixth intelligence surface; it is cross-cutting alongside Map, Intelligence Assistant, and Onboarding. See the Cross-Cutting Capabilities section below.

2. **Vendor directory is removed from Community.** The vendor directory sub-feature is no longer part of the platform. References to it have been removed from Section 3.5 COMMUNITY and from the Three-Layer Tenant Model. Any prior dispatch report or follow-up that scoped vendor directory expansion is superseded.

3. **Editorial pickup pipeline is retired (ADR-041, operator ruling 2026-10-03).** Community is social only: there is no editorial pickup and no promotion of Community content into any other surface. The customer-facing `/research` surface, like every other page, consumes nothing from Community.

4. **LinkedIn import is in-flight, not a stub.** Section 3 ONBOARDING FLOW previously labeled LinkedIn import as "currently stub". The operator confirmed it is an in-flight feature build. Section 3 ONBOARDING FLOW and Section "Customer-Facing Value Gap" item 5 are updated accordingly.

5. **External data only; no customer data intake (ADR-042, operator ruling 2026-10-03).** The system takes external data and advises what it means. The customer uploads nothing, and no customer-entered data is stored for analysis: the workspace CSV upload, the surcharge-audit, DQI and EUDR/custody panels, the per-tenant planning-assumption register and the Community benchmarks are removed (migration 349). The automate-versus-hire calculator, stated here as staying, was retired the same day by item 6. The workspace profile, watchlist, personal archive and priority, tags and briefing schedule are preference and lens state and stay. An operator-dispatched rows file of external public-source data for a kept domain is the ADR-023 ingest path and stays.

6. **No typed input produces a result; no automate-versus-hire framing (ADR-043, operator ruling 2026-10-03, reversing the same-day "calculator stays").** Operator, verbatim: "I've changed my mind. I don't want to input any outside data to get results from anything in the system, including automate or hire. Also automate and hire seems very non-PC; it would look terrible to say we're going to automate jobs or people are so cheap that we'll just hire them and not pay them enough. It's a bad idea, and we can state the evidence of what wages and stuff cost, but we don't need to blatantly say automate or hire." The Operations calculator, its page, its propagation method and the derived values it produced are retired. Wage, labour-cost and energy-cost evidence stays, shown as sourced regional figures with no verdict. The Operations contract is structured jurisdictional cost and feasibility evidence (labour, energy, materials, infrastructure) for the reader's own decisions; "hire-vs-automate" is not the surface's purpose. Workspace assignment, tags and notes stay as workspace preferences.

These corrections must inform all Sequence C surface rebuild dispatches (Research, Operations, Market Intel, Community, Regulations Detail) starting with the Community rebuild which depends directly on corrections 2 and 3.

## Platform Value Proposition

Caro's Ledge is a freight sustainability intelligence platform with two coupled value halves.

**The intelligence half.** Four pages delivering categorized content. The pages map to the source-category taxonomy in `environmental-policy-and-innovation` (regulatory, research, market_news, operational_data). Caro's Ledge supplies operator-actionable intelligence (regulatory updates, market signals, research findings, operational cost intelligence) in context-anchored briefs that respect the workspace-anchored output rule and integrity rule from that skill.

**The community half.** One surface (Community) addressing the freight industry information-isolation problem. Industry professionals and clients in different geographies duplicate efforts because they do not know what others are doing. Community is the peer resource that fixes this through working groups, forums, and peer connection.

Both halves are core. Neither is sufficient alone. A platform that delivers categorized intelligence without peer information-sharing solves only half the market gap. A peer-sharing platform without categorized intelligence solves only the other half. Caro's Ledge solves both.

**Current operational scope.** Freight forwarders specializing in art logistics, live events, luxury goods, automotive (classic, supercars, prototypes), and humanitarian cargo. Reflects the founding workspace and current customer cohort.

**Architectural intent.** Multi-tenant SaaS with a domain-agnostic core, profiled by industry, role (e.g. shipper, importer of record, forwarder, carrier, public body), and organisation size (per ADR-034). Freight forwarding is the first industry pack, expanding within itself across air (primary), road (secondary), ocean (tertiary), and rail (rarely) modes. A public-body "on behalf of many" aggregate mode and additional industry packs are future, separately-ruled directions. Expansion mechanism is operator onboarding with `sector_profile` customization driving workspace-scoped intelligence delivery and Community participation. The three-layer tenant model and `workspace_settings` shape support this expansion without architectural rework.

**Dual posture is the default.** Decisions about source coverage, classifier scope, jurisdiction taxonomy, ingest volume, page features, Community configuration, vendor directory entries, and onboarding flow must consider both current users (specialized verticals) and onboarding-time-future users (broader freight forwarding). Narrowing scope to current-only or expansion-only must be flagged explicitly. Silent narrowing is forbidden.
