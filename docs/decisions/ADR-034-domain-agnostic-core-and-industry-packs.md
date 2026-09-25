---
id: ADR-034
title: Domain-agnostic core and industry packs; freight forwarding is the first industry
status: accepted
date: 2026-09-25
scope:
  - "fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md"
  - "fsi-app/src/lib/agent/system-prompt.ts"
  - "fsi-app/src/lib/constants.ts"
  - "supabase/migrations/"
supersedes: "ADR-020 (partial ,  the pitch-vision passage only; see Supersedes section below)"
related:
  - ADR-020
  - ADR-009
---

# ADR-034 ,  Domain-agnostic core and industry packs; freight forwarding is the first industry

## Context

ADR-020 [CONFIRMED docs/decisions/ADR-020-sustainability-first-vertical-scope.md] made one narrow,
operator-ruled decision: intake scope for the live corpus is sustainability-first within freight
forwarding; customs/transport-administration law is parked, not purged:

> "Caro's Ledge is a freight-SUSTAINABILITY platform, first. Pure customs-procedure and
> transport-administration law is out of scope for what the platform ingests, classifies, and serves
> today." [CONFIRMED ADR-020:37-39]

Alongside that ruling, ADR-020 recorded the operator's pitch vision, explicitly labeled "the vision, not
a verbatim-sacred spec":

> "A tool that will eventually take ALL regulations for any freight forwarder and categorize them
> recognizably and actionably ,  starting with sustainability, ingesting customs and other domains
> later." [CONFIRMED ADR-020:55-57]

That is breadth **within** freight forwarding (same customer type, "any freight forwarder"). It does not
rule on breadth **across** customer types. The operator's 2026-09-24 statement goes beyond it on that
axis:

> "We are building this system to take on multiple industries not just freight forwarding. Freight
> forwarding is the start. What we build as a tool can be used for many things like tariffs and import
> and export regulations. So we [aim] to make a versatile and comprehensive system that looks at things
> from a broad perspective." Clarified same session: "Tariffs and trade were an example of future
> structure" / "It's an example of how this system can be used in the future."

The operator went further the next day, naming WHO the core should serve, not just which industries:

> "think about this being used by the UK government or US government so small businesses can compete in
> the ever changing market with regulations and things changing fast. They opt out of expanding or
> governments provide carve outs because they don't know how these things affect them, this needs to be
> able to be used in that sense as well, or by a museum shipping items, or any company shipping goods,
> not just freight forwarders." (operator, 2026-09-25)

**UK/US government, a museum, and "any company shipping goods" are ILLUSTRATIONS of a class ,  public
bodies acting on behalf of many, and any organisation in any role affected by regulation ,  not scope
commitments to those named entities.** Per the examples-are-not-scope convention, no UK/US government
integration, museum-specific feature, or named-shipper feature is authorized by naming them here.

Three things to reconcile: ADR-020's vision is freight-internal breadth; the 2026-09-24 statement is
cross-industry breadth; the 2026-09-25 statement is cross-role/cross-audience breadth (any affected
organisation, plus public bodies viewing in aggregate). None contradict ADR-020, which closed none of
these doors ,  but ADR-020's words no longer describe the full ambition, and per standing rule 4 a
decision becomes an ADR at the moment it is made. This is that ADR.

**The product question the core must answer, for any industry or role** [HYPOTHESIS ,  general-form
restatement of platform-intent SKILL.md's per-surface contracts, not an operator-authored sentence]:
(1) what is happening; (2) how it affects me; (3) what I must do to comply; (4) where to invest or not.

## Decision

The **core** ,  entity spine, sources and tiers, routing (`surfaceOf()`), applicability computation, the
four product questions, and the five surface *shapes* (binding-obligation, cost/pricing signal,
longer-range research, operational applied-content, peer community) ,  is **industry-agnostic**. Not a new
build: the versatility audit found these mechanisms already carry no freight-specific logic today
[HYPOTHESIS ,  versatility-audit-2026-09-24.md section 2, unverified against live schema; the audit itself flags
DB-shape claims [HYPOTHESIS ,  DB unreachable] pending live re-check].

**Freight forwarding is the first industry pack**, not privileged core: its vocabularies
(`topic_tags`/`theme`/`operational_scenario_tags`), transport modes, the `corridor` entity kind, the
system-prompt identity line, and Operations' section definitions are pack content, not core mechanism
[HYPOTHESIS ,  versatility-audit-2026-09-24.md section 3/section 5.3, not independently re-verified this session].

This extends ADR-020's already-owed `regulatory_domain` dimension [CONFIRMED ADR-020:69-73, "owed on the
schema... before any future customs restoration is attempted"] rather than a parallel structure, per
reuse-before-construction [CONFIRMED CLAUDE.md "Memory conventions"]. The proposed generic dimension set
,  industry, domain, role, jurisdiction, subject/entity, site/lane, and an optional transport/operational
mode ,  is **direction for a future schema design**, not a ruled or final schema.

Four further decision points, direct from the 2026-09-25 statement:

1. **The core's user is any organisation affected by regulation and market change, profiled by ROLE**
   (e.g. shipper, importer of record, exporter, forwarder, carrier, warehouse operator, lender/borrower
   of goods, public body). One organisation may hold several roles. Industry is one dimension; role and
   applicability together decide what applies ,  industry alone is not the gate.
2. **Organisation size is a profile dimension.** Thresholds (headcount, revenue, shipment volume) gate
   applicability; a profile omitting size cannot compute a small business's carve-out correctly.
3. **A second usage mode: "on behalf of many."** Public bodies, agencies, and associations use aggregate
   views across many profiles to see where a rule bites and on whom. Aggregate-only, under the same
   privacy and antitrust discipline already binding on Community [CONFIRMED platform-intent SKILL.md , 
   Community is human-operated, "OUTSIDE machine intake by construction"]: no individual organisation's
   data is exposed.
4. **Plain-language answers are a requirement, not polish.** A small business or public-body analyst
   without in-house counsel is a primary user; outputs must be readable without a specialist, alongside
   (not instead of) the sourced, citation-grounded detail already required.

These four points change WHO asks the four product questions (any organisation in any role; public
bodies on behalf of many) and HOW the answer reads (plain language first), not the questions themselves.

## What this does NOT decide

- **No new content enters scope now.** ADR-020's intake scope stands; no customs/tariff content.
- **Tariffs/trade, UK/US government, museums, and "any company shipping goods" are illustrative only**
  [CONFIRMED feedback_examples_are_not_scope.md] ,  no work is scoped to any of them by this ADR.
- **No schema change.** The dimension set above is direction; landing `regulatory_domain` or any
  industry/role/size field still needs its own dispatch under the two-track migration policy [CONFIRMED
  CLAUDE.md standing rule 3].
- **No second industry, and no aggregate "on behalf of many" mechanism, is designed or built here.**
  Point (3)'s privacy/antitrust design must at minimum match Community's existing discipline before any
  aggregate view ships; picking a second industry is gated on a separate ruling per the audit's Phase L.

## Supersedes

This ADR supersedes **only** ADR-020's pitch-vision passage ,  the block beginning "A tool that will
eventually take ALL regulations for any freight forwarder..." (ADR-020 lines 55-57, "## The pitch
vision"), because it described freight-internal breadth as the vision's outer bound; this ADR records a
wider bound. **The rest of ADR-020 remains in force**: the intake-scope decision, edge-zones-in/customs-
out ruling, archive-reversibility consequence, the `regulatory_domain` backlog item (widened in direction
only), the fail-open-floor open question, the ADR-019 re-basing note, and Amendment 1.

## Consequences

- **The platform-intent skill's expansion language needs amending ,  now on industry, role, and audience,
  not industry alone.** Former binding text:

  > "Architectural intent. Multi-tenant SaaS designed to expand into the broader freight forwarding
  > industry across air (primary), road (secondary), ocean (tertiary), and rail (rarely) modes."
  > [CONFIRMED SKILL.md:55]

  Replacement, adopted by this ADR (operator approval landed 2026-09-25; the skill's Authority Grant
  requirement for "explicit operator authorization with strong-emphasis correction" is satisfied by
  that approval):

  > "Architectural intent. Multi-tenant SaaS with a domain-agnostic core, profiled by industry, role
  > (e.g. shipper, importer of record, forwarder, carrier, public body), and organisation size (per
  > ADR-034). Freight forwarding is the first industry pack, expanding within itself across air
  > (primary), road (secondary), ocean (tertiary), and rail (rarely) modes. A public-body 'on behalf of
  > many' aggregate mode and additional industry packs are future, separately-ruled directions."

  The description frontmatter line [CONFIRMED SKILL.md:3] receives the equivalent edit, applied by this
  same dispatch.

- **Examples-are-not-scope gets two fresh instances** (tariffs/trade; UK/US government, museums, "any
  company shipping goods") [CONFIRMED feedback_examples_are_not_scope.md]. No process change proposed.

- **First phase, if authorized, is naming-only** [HYPOTHESIS ,  versatility-audit-2026-09-24.md section 7]: zero
  behavior change, no schema/prompt/vocabulary change. Not authorized here; audit Ruling 3 governs.

- **Open items, named not resolved:** (a) generic entity/subject shape for a non-freight object
  [HYPOTHESIS ,  versatility-audit-2026-09-24.md section 3/section 5.4]; (b) transport mode made optional, not required,
  in scoring [HYPOTHESIS ,  section 3 item 7]; (c) role, organisation-size, and the aggregate-mode privacy
  mechanism (Decision points 1-3) have no schema or UI design yet.

## Open items (future ADRs)

These are named as questions for a future ADR to resolve. Nothing below is decided by ADR-034.

**Open Item 1 ,  Population view and aggregation thresholds.** Covers the mechanics of Decision point (3)
("on behalf of many"):
- Data sources: how aggregate views join internal profiles with external public registers and trade
  data sets.
- Privacy and anonymity minimums: k-anonymity before any aggregate is shown. The operator's example is
  N ≥ 10 unique profiles. Spec 07's Community benchmark already uses ≥5 contributors with no contributor
  above 25%. The future ADR must reconcile the two into one rule; ADR-034 does not pick one.

**Open Item 2 ,  Public sector and government operations framework.** Covers what a public-body
deployment (illustrated, not scoped, by the UK/US government example in Context) would require:
- Security and procurement: required certifications (e.g. FedRAMP; UK Cyber Essentials Plus / G-Cloud).
- Data residency and sovereignty: localised hosting models per jurisdiction.
- Accessibility: WCAG 2.1 AA, Section 508, and EN 301 549 across public-facing interfaces.
- Demonstrable neutrality: an audit mechanism for generation prompts and source verification, so policy
  output is non-partisan and evidence-backed.

## Alternatives Considered

- **Amend ADR-020 in place.** Rejected: ADR-020 is a point-in-time intake-scope ruling with its own
  evidence trail; a new ADR superseding only the vision passage keeps it legible.
- **No action; treat as informational only.** Rejected: standing rule 4 requires a decision to become an
  ADR when made, and the operator approved landing this ADR 2026-09-25.
