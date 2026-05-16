---
name: rule-workspace-anchored-output
description: Two-part contract for WORKSPACE CONTEXT outputs (the four pages, internal sharing surfaces, briefs, anything scoped through `org_memberships`). Part 1: do NOT name the workspace, its parent company, or any individual person. Part 2: DO frame output appropriate to the workspace's freight context (its verticals, modes, trade lanes, supply chain role). This rule does NOT apply to community context (see [[rule-community-attributed-output]] for that, where contributions are author-attributed and framing is peer-to-peer).
---

# Rule: Workspace-anchored output

## Scope: WORKSPACE CONTEXT only

This rule applies to the workspace context: the four pages (regulations, market, research, operations), workspace-internal sharing surfaces (assign-to, shared notes, internal watchlists), briefs and summaries generated for the workspace, and any feature scoped through `org_memberships`.

It does NOT apply to community context. Community contributions are author-attributed and follow [[rule-community-attributed-output]]. The platform layer is shared substrate; the workspace and community are two contexts on top with different framing rules.

```
PLATFORM INTELLIGENCE (intelligence_items, sources)
            shared substrate
                  |
        +---------+---------+
        |                   |
WORKSPACE CONTEXT   COMMUNITY CONTEXT
this rule applies   rule-community-attributed-output applies
```

Personal context (current user only) has no framing rule; the output IS to the user themselves and uses their own name where relevant.

## Source

Extracted from the original `environmental-policy-and-innovation` skill (archived at `fsi-app/.claude/skills/_archived/environmental-policy-and-innovation-2026-04-29/SKILL.md`), Sections "The Workspace-Anchored Rule" and "The Seven Anchoring Principles." Refined 2026-05-15 to clarify the two-part contract and the workspace-only scope after the three-context architecture was confirmed.

## The two-part contract

**Part 1: NO NAMING.** In workspace context, never name:
- The workspace
- Its parent company
- Any individual person from the workspace

The output is generic in surface form even when the underlying analysis is specific.

**Part 2: WORKSPACE-CONTEXT FRAMING.** In workspace context, frame the output appropriate to the workspace's freight context:
- The verticals the workspace operates in shape what is surfaced (a luxury-goods workspace gets fine-art-aware framing on Annex VI tracking; a humanitarian workspace gets temperature-controlled-pharma framing on the same regulation)
- The transport modes the workspace uses shape mode-specific implications
- The trade lanes shape jurisdiction prioritization
- The supply chain role shapes which compliance positions apply
- The operational baseline shapes which gaps are highlighted

For the current Dietl/Rockit build, the workspace's freight context aligns with the seven verticals in [[vocabulary-verticals]] and the four modes in [[vocabulary-transport-modes]] with air-primary usage. When multi-tenant onboarding ships (Phase 3 of the multi-tenant foundation), this rule becomes the bridge between platform-wide content and tenant-specific framing: same intelligence_item rendered with framing appropriate to whichever workspace is reading it.

## What this is NOT

This rule is NOT "tenant-blind generic output." Generic framing (no workspace context, no role-aware analysis, no vertical-specific implications) is a failure mode. The rule says "no naming" AND "do framing"; one without the other is wrong.

This rule is NOT "anchor by replacing names with placeholders." `[REDACTED]`, `[CLIENT]`, `[the workspace's parent organization]` are anti-patterns. Use the canonical generic vocabulary below.

This rule is NOT applicable in community context. A forum thread author names themselves; a workspace brief does not. See [[rule-community-attributed-output]].

## Wrong vs right (workspace context)

The following are workspace-context examples. Equivalent examples in community context would have the author named per [[rule-community-attributed-output]].

Wrong:
> "Dietl commissions crate fabrication on behalf of clients."

Right:
> "The workspace, in its role as importer commissioning packaging fabrication on behalf of clients, places packaging on the EU market for the first time."

Wrong:
> "Anthony Fraser, Commercial Director, ROKBOX, has noted..."

Right (in workspace brief):
> "An industry operator interpretation, cited for navigation only and not as legal authority, has noted..."

(In community context, the same content would attribute the author by name; see [[rule-community-attributed-output]].)

Wrong:
> "Rockit currently manages its case inventory on a manual, piece-count basis."

Right:
> "For workspaces operating reusable transport packaging on a manual piece-count basis without serial-level identification, the gap between current state and the regulation's tracking requirements at Annex VI is fundamental."

## The Seven Anchoring Principles (workspace context)

These principles apply IN WORKSPACE CONTEXT. The equivalent principles for community context are in [[rule-community-attributed-output]].

1. Anchored to the workspace's role and operations, never generic, never named.
2. Every claim is sourced inline at the end of each subsection, not just in the sources list at the end.
3. Items requiring legal review are labeled "Legal Confirmation Required" explicitly.
4. Industry operator interpretation is labeled separately and cited as the operator's view, not legal authority. (In community context, this framing changes; the author IS the operator and the attribution IS the citation.)
5. Action items lead with the action, then cost, then who is affected, then why now.
6. Cargo verticals are named throughout where the workspace's profile lists them.
7. Context-first framing: the document explains itself before the regulatory or technical content.

## Workspace profile fields (read at runtime in workspace context)

The writer reads these from the active workspace_settings + profiles overlay (workspace context only; community context reads from community_group_members instead):

- Cargo verticals (e.g., live events, fine art, luxury goods, film and TV production, high-value automotive, humanitarian)
- Transport mode mix (e.g., air primary, road secondary, ocean tertiary, rail rare; per the workspace's actual usage, not a platform default)
- Trade lanes (e.g., Americas, Europe, Asia)
- Supply chain role per transaction type (e.g., importer, manufacturer, distributor, fulfillment provider, freight forwarder)
- Specific products sold under the workspace's name, if any
- Operational baseline (e.g., manual case management, automated tracking, on-grid power, on-site solar)
- External engagements and personnel relationships, anonymized in output

The workspace profile is the runtime input. The output never names the workspace.

## Required vocabulary (workspace context)

Use:
- "the workspace" — the primary referent
- "workspaces in [role]" — for generalized statements across similar workspaces
- "operators in the [vertical] vertical" — for vertical-specific framing
- "an industry operator interpretation" — for cited views attributed to specific people elsewhere
- "high-value cargo workspaces" — when the brief covers the operator's portfolio class

Do not use:
- The workspace's company name, even when the source text uses it
- The workspace's parent company name
- Named individuals from the workspace
- Internal product names, team names, or project codenames

## Permitted naming (workspace context)

The rule permits naming of:
- Sources (laws, regulations, government bodies, agencies)
- Carriers, freight forwarders, shippers, vessel operators, airlines (when discussing the industry, not the workspace's specific relationships)
- Vendors and supplier organizations (when discussing supplier-side activity)
- Authoritative bodies (IMO, ICAO, EU Commission, EPA, CARB)
- Named competitors (when discussing competitive positioning, with attribution to the source naming them)

NOT permitted: any person from the workspace, any company that IS the workspace, any individual whose naming would identify the workspace.

(In community context, named authorship of contributors IS permitted and expected; that is the inverse rule. See [[rule-community-attributed-output]].)

## Audit cross-reference

The audit found this rule is well-honored within `full_brief` outputs from the Sonnet writer (zero leakage of "Dietl," "Rockit," "Anthony Fraser" in 500 sampled briefs in workspace context). The rule is preserved here as a foundational constraint that every workspace-context writer skill inherits.

## Composition

Inherited by every WORKSPACE-CONTEXT writer:
- [[writer-regulatory-fact-document]]
- [[writer-technology-profile]]
- [[writer-operations-profile]]
- [[writer-market-signal-brief]]
- [[writer-research-summary]]
- [[writer-summary-card-surface]]
- [[writer-frame-regulations]] / [[writer-frame-market]] / [[writer-frame-research]] / [[writer-frame-operations]]
- [[writer-yaml-emission]] (metadata emission is workspace-context-aware)
- [[writer-operator-empty-states]]

NOT inherited by community-context writers (future: writer-forum-thread-author, writer-vendor-endorsement-author, writer-case-study-author-post); those inherit from [[rule-community-attributed-output]] instead.

Composes with:
- [[rule-fsi-brief-framework]] — defines action-first ordering for workspace-anchored outputs
- [[rule-no-regulatory-inferences-as-fact]] — workspace-anchored compliance recommendations carry the legal-counsel caveat
- [[rule-character-normalization]] — applied at emission to normalize en/em dashes and smart quotes
- [[rule-group-scoped-features]] — workspace-context features (assign-to, shared notes, internal watchlists) scope through org_memberships, which this rule's framing presumes

## Source attribution history

- Original: `environmental-policy-and-innovation` skill (archived 2026-04-29)
- 2026-05-15 refinement: clarified the two-part contract (no naming AND workspace-context framing) and the workspace-only scope after the three-context architecture (workspace / community / personal) was confirmed by operator
