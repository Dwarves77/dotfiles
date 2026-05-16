---
name: rule-community-attributed-output
description: Two-part contract for COMMUNITY CONTEXT surfaces (forum threads, posts, vendor endorsements, case studies, mentions in community discussions, anything scoped through community_group_members). Part 1: DO NAME the author (full name, affiliation, community role, trust signals). Part 2: PEER-TO-PEER framing (first-person voice permitted, domain shorthand permitted, opinions attributed to author not platform). Inverse of [[rule-workspace-anchored-output]].
---

# Rule: Community-attributed output

## Scope: COMMUNITY CONTEXT only

This rule applies to the community context: forum threads, forum replies, community posts, vendor endorsements, case studies, case study endorsements, mentions in community discussions, and any feature scoped through `community_group_members`.

It does NOT apply to workspace context. Workspace outputs are anonymized and operator-framed under [[rule-workspace-anchored-output]]. The platform layer is shared substrate; the workspace and community are two contexts on top with inverse framing rules.

```
PLATFORM INTELLIGENCE (intelligence_items, sources)
            shared substrate
                  |
        +---------+---------+
        |                   |
WORKSPACE CONTEXT   COMMUNITY CONTEXT
rule-workspace-      this rule applies
anchored-output
```

## The two-part contract (inverse of workspace-anchored)

**Part 1: DO NAME.** Community surfaces show:
- The author's full name (the person who posted the content)
- The author's affiliation (the organization the author belongs to, drawn from their primary org_membership or from a community-specific affiliation field on their profile)
- The author's community group role (Council Member, Verified Operator, Member; rendered as a chip on the author byline)
- Trust signals (LinkedIn verification status, contribution count, time-in-community)

The author IS the source of the interpretation. Anonymizing them would strip the citation that makes the contribution useful.

**Part 2: PEER-TO-PEER FRAMING.** Community contributions read as expert-to-expert exchange:
- First-person voice is permitted ("I ran into this on a charter last month")
- Domain-specific shorthand is permitted (the reader is a peer; over-explanation reads as condescending)
- Opinions and judgments are permitted and attributed to the author, not the platform
- "An industry operator interpretation, cited for navigation only..." framing is NOT used in community context (that framing exists in workspace context to caveat third-party views inside a platform-authored brief; in community context the contribution IS the operator interpretation, attributed by name)
- The platform's voice (the third-person workspace-anchored brief voice) does NOT appear in community context; the community surfaces author voice directly

## What community context is NOT

- Not a substitute for workspace-anchored briefs. A forum thread saying "CARB Phase 1 means X for live events" is a community contribution; the workspace's regulatory-fact-document on CARB Phase 1 is a separate canonical brief. They reference each other (cross-context linking is permitted) but they are different output shapes.
- Not anonymized. If a contributor wants to post pseudonymously, that is a separate UX feature (alias account, gated by the platform) and not in scope of this rule.
- Not regulatory authority. Community contributions are peer interpretation. The platform's workspace-anchored briefs cite primary sources; community contributions cite their author. [[rule-no-regulatory-inferences-as-fact]] still applies inside community context to prevent contributors from presenting interpretation as confirmed fact (the contributor must hedge appropriately; the platform does not strip the contribution but surfaces it as the author's view).

## Author byline shape

Every community contribution renders an author byline that includes:

- Full name (display_name from profiles)
- Affiliation chip (current org name from the contributor's primary org_membership, or a community-affiliation field if distinct)
- Role chip (community group role: Council Member > Verified Operator > Member, or a community-specific role if the group defines one)
- Trust signals (LinkedIn verification badge if present, contribution count, time-in-community)

Byline rendering is the responsibility of the community surface renderer; this rule specifies what the byline contains, not the visual treatment.

## Trust signal surfacing

| Signal | Source | Render |
|---|---|---|
| LinkedIn verification | Profile field set when the user completes LinkedIn OAuth and the integration confirms identity | Verified badge on byline |
| Contribution count | Aggregated from forum_replies, community_posts, case_studies, vendor_endorsements authored by the user, weighted by endorsements received | Numeric badge or tier label |
| Community group role | community_group_members.role (per-group role); platform admin role is distinct and not surfaced in community context unless the moderator action requires it | Role chip |
| Time-in-community | Created_at on community_group_members for the relevant group | "Member since YYYY" on byline hover |

Trust signals are not gates on participation; they are surfacing that helps readers calibrate the weight of a contribution. A new member without trust signals can still contribute.

## Cross-context linking

| Direction | Permitted | Constraint |
|---|---|---|
| Community → Workspace | Yes | A community post can cite a workspace-anchored item (e.g., reference the workspace's regulatory brief on CARB Phase 1). The cited item renders inline as a card. |
| Workspace → Community | Yes for reference, NO for authority | A workspace-anchored brief can mention that community discussion exists on a topic, but it CANNOT cite a community post as regulatory or factual authority. Community contributions are peer interpretation, not primary sources. This preserves [[rule-no-regulatory-inferences-as-fact]]. |
| Community → Community | Yes | Threading, quote-reply, cross-thread reference. |
| Workspace → Workspace | Yes | Already handled by [[extractor-relationships]] and the cross-reference table. Out of scope of this rule. |

## Failure mode signature

The following are wrong in community context:

- "An industry operator interpretation has noted..." (this is workspace-context framing; in community context, name the contributor)
- Stripping the contributor's name and affiliation (anonymization fails the peer-to-peer contract)
- Citing a community post as regulatory authority in a workspace brief (violates rule-no-regulatory-inferences-as-fact)
- Rendering an author byline without trust signals when signals exist (loses calibration value)

## Permitted vocabulary (community context)

Use:
- The contributor's full name (the canonical citation in community context)
- "I", "my", "we" in first-person contributions (the author's voice)
- Domain shorthand without expansion (the reader is a peer)
- Direct opinions and judgments, attributed to the author by the byline

Do not use (in community context):
- "the workspace" (workspace-context referent; not used in community)
- "operators in the [vertical] vertical" as the primary referent (works in community context as a general phrase but the contribution is by THIS named contributor, who happens to be one of those operators)
- "an industry operator interpretation" (workspace-context caveat language)

## Composition

Inherited by future COMMUNITY-CONTEXT writer skills:
- writer-forum-thread-author (future, not yet built)
- writer-vendor-endorsement-author (future)
- writer-case-study-author-post (future)
- writer-community-mention (future, for in-context @-mention rendering)

Composes with:
- [[rule-no-regulatory-inferences-as-fact]] — community interpretations are not regulatory authority even when attributed
- [[rule-source-traceability-per-claim]] — community contributions citing facts still carry source attribution, with the author treated as the source of the interpretation
- [[rule-character-normalization]] — applied at emission to normalize en/em dashes and smart quotes (community contributions are written by humans and pasted from emails; normalization is especially important here)
- [[rule-group-scoped-features]] — community-context features scope through community_group_members, which this rule's framing presumes

Inverse of: [[rule-workspace-anchored-output]] (same two-part-contract structure, opposite values: DO NAME instead of NO NAMING; peer-to-peer framing instead of operator-framing)

## Audit cross-reference

- Operator instruction 2026-05-15: established the three-context architecture (workspace / community / personal) and the inverse-rule structure: rule-workspace-anchored-output applies in workspace context; rule-community-attributed-output applies in community context; personal context has no framing rule
- Community tables in the schema: forum_threads, forum_replies, community_posts, case_studies, vendor_endorsements, case_study_endorsements, community_group_members, community_groups, community_topics, community_group_invitations, plus the moderation tables; all RLS-scoped per migration 029-046 series
- Multi-tenant foundation deploy 2026-05-15 confirmed that all seven community FKs target profiles.id (not the deprecated user_profiles), satisfying the cross-context linking contract by construction
