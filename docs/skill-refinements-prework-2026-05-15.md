# Skill Refinements Prework, 2026-05-15

Companion to `caros-ledge-product-audit-2026-05-15.md` (v2) and `multi-tenant-foundation-followups-2026-05-15.md`. Mirrors the prework-first discipline added to the multi-tenant foundation dispatch.

This document is the gating artifact for ten skill changes. Operator reviews this document, confirms (or amends), then Claude Code executes the changes in the sequence specified at the bottom. Until operator confirmation lands, NO skill files are modified beyond what is already on disk (the three vocabulary refinements completed earlier this session: vocabulary-verticals, vocabulary-transport-modes, vocabulary-topic-tags).

## Why prework first for skill changes

Per the cost-discipline rule being added below (item 1): a skill written wrong is paid for in every future agent run that inherits it. The original 815-line `environmental-policy-and-innovation` skill is the textbook example: a wrong-shape YAML emission section produced 644 items with the same wrong shape, and the cost of regenerating them now is real even though the per-skill-write cost was $0. Prework lets the operator catch a wrong shape BEFORE it propagates.

This discipline also matches `[[operational-audit-dispatch-pattern]]` and the multi-tenant foundation prework that just shipped: state the plan, surface for review, then execute.

## Scope expansion to the cost rule (carry this into item 1)

Per operator instruction on 2026-05-15 after the multi-tenant deploy:

> The cost-weighted-recommendations rule should explicitly include skill changes in its scope. "Cost surfaces" includes downstream-dispatch quality, not just API/infrastructure dollars. A skill written wrong is paid for in every future agent run that inherits it. That's a real cost, even at $0 in API spend.

The rule as written below has FOUR cost surfaces (three direct, one indirect-but-real), not three.

## Standing facts that frame every item

1. **Skill file locations.**
   - Cross-cutting skills (rules, vocabularies, references) at `dotfiles/.claude/skills/<name>/SKILL.md`
   - Project-specific skills (writers, classifiers, extractors, compute, operational, project-economics) at `fsi-app/.claude/skills/<name>/SKILL.md`
   - Two INDEX.md files, one per location

2. **Three-context architecture** (operator-confirmed 2026-05-15):
   ```
   PLATFORM INTELLIGENCE (intelligence_items, sources)
              shared substrate
                    |
       +------------+------------+
       |                         |
   WORKSPACE CONTEXT     COMMUNITY CONTEXT     PERSONAL CONTEXT
   org_memberships       community_group_       current user only
                         members
   ```
   This is the architectural primitive everything in items 4-6 assumes.

3. **Decomposition principle.** The original 815-line skill is preserved at `fsi-app/.claude/skills/_archived/environmental-policy-and-innovation-2026-04-29/SKILL.md`. New skills inherit from cross-cutting rules + vocabularies; composition is what allows specific workflows to inherit only what they need.

---

## Item 1: rule-cost-weighted-recommendations (NEW, cross-cutting)

**Path:** `dotfiles/.claude/skills/rule-cost-weighted-recommendations/SKILL.md`

**Status:** does not exist

### Current state

There is no codified rule. Operator has stated the cost discipline verbally and via saved memories (`feedback_cost_discipline_manual_controls`). Without a written rule, future dispatched agents have no inheritance path for the discipline.

### Proposed state (content sketch)

**Description:** Every architectural recommendation, dispatch proposal, sequencing plan, or skill change must explicitly weigh four cost surfaces against value impact before being presented. Cost-blind output is a failure mode.

**Four cost surfaces:**
1. One-time agent work (dispatches consume Claude API tokens; estimate scale in rough order: low/medium/high or dollar range)
2. Ongoing runtime cost (per-item AI generation, embedding calls, recomputation triggers, scheduled jobs)
3. Ongoing infrastructure (Supabase tier, Vercel tier, Browserless, vendor services like Resend)
4. Inheritance cost (skill changes, doc changes, architectural decisions are paid in every future agent run or every future feature; this is $0 in API spend but real in downstream-dispatch quality and rework if wrong)

**Three value frames:**
- Revenue-blocking (cannot earn without this)
- Revenue-accelerating (helps close paying customers)
- Polish or scale-prep (defer if revenue isn't there)

**Manual gating requirement (per saved memory):** any feature that triggers AI runs, embedding calls, scrapes, or per-event compute must surface BOTH the per-run cost AND the manual gating mechanism (toggle, kill switch, default-off). "This adds N AI calls per item" is incomplete; "this adds N AI calls per item, gated behind X manual toggle, default off" is complete.

**Scope:** applies to all projects (Caro's Ledge, Pet Pursuit, Plow Louise, others). Each project has its own `reference-<project>-economics` skill for the actual pricing data; this rule is the procedural discipline that consumes those economics.

**Failure mode signature:** any architecture recommendation, dispatch proposal, or skill change presented without naming the cost surfaces and the value frame is incomplete and must be returned for cost analysis before adoption.

### Inheritance / composition

- Inherits from: nothing (foundational discipline rule)
- Composed with: `[[reference-caros-ledge-economics]]` (this project's economics), future per-project economics skills, `[[feedback-cost-discipline-manual-controls]]` saved memory

### Decisions encoded

- Four cost surfaces (not three; the fourth is the inheritance cost the operator surfaced specifically for skill changes)
- Three value frames (revenue-blocking / revenue-accelerating / polish)
- Manual gating is non-negotiable for money-touching features
- Applies across projects (not Caro's Ledge specific)

### Blast radius

- Every future dispatch proposal must compose with this rule
- Every future skill change must include a cost note (one of the four surfaces, with value frame)
- Every architectural recommendation in audits going forward
- Retroactive: existing recommendations that are cost-blind get flagged when re-read, not rewritten retroactively (no churn)

---

## Item 2: reference-caros-ledge-economics (NEW, project-specific)

**Path:** `fsi-app/.claude/skills/reference-caros-ledge-economics/SKILL.md`

**Status:** does not exist

### Current state

No project economics reference exists in skill form. Cost discipline lives in the operator's head and was just captured in saved memory `feedback_cost_discipline_manual_controls`.

### Proposed state (content sketch)

**Description:** Captures the established cost discipline for Caro's Ledge so recommendations weigh against real numbers, not guesses. Consumed by `[[rule-cost-weighted-recommendations]]` and by every dispatch that touches runtime or infrastructure.

**Pricing target:**
- $500/mo per workspace, B2B SaaS
- Comparable products: Bloomberg ESG, Watershed, Persefoni ($20K-100K/yr)
- Positioning: one vertical with depth, accessible pricing

**Operating cost tier model (Wave 1 cost discipline):**
- Lean: $335/mo target, daily T1 + weekly T2 + monthly T3 cadence
- Moderate: ~$1,000/mo, faster cadence
- Comfortable: ~$8,322/mo, real-time
- Kill switch: halt at 100% of authorized ceiling (a UI surface, not just an alerting threshold)

**Cost components at Lean:**
- ~2,160 Sonnet analyze calls/mo × $0.15 = $324/mo
- Supabase Pro ~$25/mo
- Vercel free/Pro ~$0-$20/mo
- Browserless usage variable
- Claude API at runtime hits the Anthropic API console, NOT covered by claude.ai subscription

**Unit economics:**
- 1 workspace at $500/mo covers Lean operating cost 1.5x
- 10 workspaces at $500/mo = $60K/yr revenue, ~$4K/yr operating cost
- Gross margin target: >90%

**Cost impact per major dispatch (rough order, for use in proposals):**
| Dispatch | One-time agent | Ongoing runtime | Ongoing infra |
|---|---|---|---|
| Multi-tenant foundation | medium | low | none |
| Schema cleanup | low | low | none |
| Source registry hygiene | low | low | none |
| Ranking system | medium | low | none |
| Structured extraction | $900-1200 | $50-100/mo | none |
| Per-surface framing | $400-600 | $30-50/mo | none |
| Knowledge graph | medium | low (compute on read) | none |
| Lead time as column | low | low | none |
| Jurisdictions entity table | medium (ingest) | low | none |

**Manual controls as cost discipline (per saved memory):**
- Auto-update is manually toggleable; default off for any new auto-running job
- Money-costing functions sit behind explicit operator controls (UI toggle, not just env var)
- Kill switch is a first-class UI surface, not an alerting threshold
- New dispatches that propose adding AI runs or scrapes must specify the gating mechanism alongside the per-run cost

### Inheritance / composition

- Inherits from: `[[rule-cost-weighted-recommendations]]` (this is the rule's data; the rule is the procedure)
- Composed with: every future dispatch proposal for Caro's Ledge

### Decisions encoded

- Three-tier cost model with the Lean number as the operating ceiling for current scale
- Kill switch is a UI surface (not just an alerting threshold; this is operator-confirmed product behavior)
- The cost table above is the canonical reference for "rough order" cost estimates in future dispatches
- $500/mo per-workspace pricing covers Lean 1.5x with 1 workspace; anything that breaks that unit-economics relationship requires explicit decision

### Blast radius

- Every Caro's Ledge dispatch proposal cites this
- Every recommendation in audits weighs against these numbers
- Onboarding work in Phase 3 of multi-tenant foundation reads this for "what scale does the onboarding flow need to handle"
- Used by the to-be-written rule-cost-weighted-recommendations for the project-specific instantiation

---

## Item 3: reference-jurisdictions REWRITE (entity model spec, not data)

**Path:** `dotfiles/.claude/skills/reference-jurisdictions/SKILL.md`

**Status:** currently wrong-scope inline-data version (~10 KB of country lists, subnational lists, alias examples) that was written earlier this session and then re-scoped by operator. The data (5,000-10,000 entries) belongs in a database table per v2 audit Section 6.1; this skill is the entity MODEL spec.

### Current state

The file as it sits on disk:
- Inline tables of all UN-recognized countries
- Inline tables of US states + DC + territories
- Inline tables of Canadian provinces, Mexican states, Brazilian states, Indian states, Australian states
- Inline tables of German Länder, Spanish autonomous communities, Chinese provinces, UAE emirates, UK constituent countries
- Inline list of freight-significant cities
- Inline alias resolution rules

This is wrong scope. The data volume implied (per operator's expanded coverage: ~195 countries + ~2,500-3,000 subnationals + supranational/treaty blocs + international regulatory bodies + marine regulated zones + ports + low-emission zones + free trade zones + indigenous nations) is roughly 5,000-10,000 canonical entries with hierarchy, aliases, and ISO codes. That does not belong in a markdown SKILL.md file.

### Proposed state (content sketch)

The SKILL.md becomes the MODEL contract; the data lives in the `jurisdictions` entity table (v2 audit Section 6.1).

**Description:** Reference data MODEL for the jurisdiction entity layer. The canonical data lives in the `jurisdictions` entity table populated from ISO 3166-1, ISO 3166-2, UN M49, MarineRegions.org Marine Gazetteer, and hand-curated entries for treaty blocs, free zones, and indigenous nations. Writers and classifiers query the database table at runtime; this skill is the contract for what the table looks like and how to query it.

**Entity types (eleven):**
- `country` (ISO 3166-1 alpha-2)
- `subnational` (ISO 3166-2: state, province, region, prefecture, canton, Land, autonomous community, federal subject)
- `supranational_bloc` (EU, EEA, Schengen, USMCA, Mercosur, ASEAN, GCC, EAEU, AfCFTA, CPTPP, Pacific Alliance, ECOWAS, COMESA, African Union, Commonwealth, etc.)
- `treaty_zone` (rule scope defined by treaty; distinct from bloc membership)
- `maritime_zone` (SECAs, NECAs, EEZs, PSSAs, Polar Code areas, strategic waterways)
- `airspace_zone` (FIR, ATC sectors with cargo-relevant rules)
- `port` (Rotterdam, Singapore, Shanghai, Long Beach, etc.; UN/LOCODE)
- `city` (low-emission zones, congestion zones, noise/emission curfew zones)
- `free_zone` (FTZs, SEZs, customs-special-treatment territories)
- `indigenous_nation` (sovereign tribes with freight-relevant jurisdiction)
- `regulatory_body_global` (IMO, ICAO; their rules carry global jurisdictional weight on flag-state vessels and civil aviation)

**Entity row shape:**
```sql
CREATE TABLE jurisdictions (
  canonical_id text PRIMARY KEY,         -- e.g. "US", "US-CA", "EU", "MARINE-SECA-BALTIC"
  display_name text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN (...11 types...)),
  parent_ids text[] DEFAULT '{}',        -- canonical containment, e.g. US-CA -> [US, NORTH-AMERICA]
  member_ids text[] DEFAULT '{}',        -- bloc membership; e.g. EU -> [AT, BE, BG, ...]
  iso_codes jsonb,                       -- {iso_3166_1: "US", iso_3166_2: "US-CA", un_m49: "840", mrgid: 1924}
  aliases text[] DEFAULT '{}',           -- ["California", "CA", "Cal", "Calif"]
  notes text,                            -- free-text notes (e.g. "Hong Kong distinct from PRC for freight purposes")
  source text,                           -- "ISO 3166-1", "UN M49", "MarineRegions", "hand-curated"
  source_version text,                   -- e.g. "ISO 3166-1:2020"
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX jurisdictions_aliases_gin ON jurisdictions USING gin(aliases);
CREATE INDEX jurisdictions_parents_gin ON jurisdictions USING gin(parent_ids);
CREATE INDEX jurisdictions_members_gin ON jurisdictions USING gin(member_ids);
```

**Hierarchical containment rules:**
- A child entity's `parent_ids` is the closure of its canonical containment (US-CA → [US, NORTH-AMERICA])
- Items tagged with a child match queries for any ancestor
- The closure is materialized in `parent_ids` (not computed at query time) for read performance

**Bloc membership resolution:**
- An item tagged with a bloc (EU) expands to the bloc's `member_ids` for downstream queries
- Bloc membership is distinct from containment; an EU member country has EU in its `parent_ids` for traversal but also appears in EU's `member_ids` for fan-out queries

**Cross-cutting zones:**
- SECAs, EEZs, free zones, indigenous nations do NOT fit the country hierarchy
- They have their own `parent_ids` (e.g. MARINE-SECA-BALTIC's parent is GLOBAL; covered countries are listed in a separate `covers_ids[]` field if needed, or via the jurisdiction reference in items)
- A vessel transiting a SECA gets the SECA rule regardless of flag state

**Alias resolution:**
- Any text form ("California", "Calif", "CA", "Cal", "US-CA") resolves to canonical via the GIN-indexed `aliases` column
- Resolution is case-insensitive and trim-tolerant
- Ambiguity (e.g., "CA" → Canada or California) requires context; the classifier provides the context, the lookup raises if context is missing

**ISO and registry sources:**
- ISO 3166-1 alpha-2 for countries
- ISO 3166-2 for subnationals
- UN M49 for regional groupings
- MarineRegions.org Marine Gazetteer for maritime zones (canonical MRGID identifiers)
- ICAO doc 7474 for airspace zones if needed
- UN/LOCODE for ports and city codes
- Hand-curated for treaty blocs, free trade zones, indigenous nations

**Writer/classifier query contract:**
- All canonical lookups go through the database table, not the skill file
- The skill file is the contract for table shape; it is NOT the source of jurisdiction data at runtime
- Future ingest dispatch (see `multi-tenant-foundation-followups-2026-05-15.md` item 4) populates the table

### Inheritance / composition

- Inherits from: `[[rule-cross-reference-integrity]]` (the table is canonical; surfaces read it)
- Composed with: `[[classifier-jurisdiction]]` (uses table for alias resolution), `[[writer-yaml-emission]]` (emits canonical IDs), `[[operational-entity-resolution]]` (the table IS the entity resolution seed for jurisdictions), `[[reference-priority-source-registry]]` (which references the jurisdictions of its priority sources)

### Decisions encoded

- The skill is a model spec, not a data store
- Eleven entity types (operator-specified)
- Hierarchy materialized in parent_ids closure (not computed at query) for read performance
- Bloc membership stored as member_ids (fan-out queries)
- Cross-cutting zones (SECAs, EEZs, free zones, indigenous nations) sit outside country hierarchy with their own structure
- Aliases GIN-indexed for fast resolution

### Blast radius

- The data ingest (5,000-10,000 entries) is its own follow-up dispatch already flagged in `multi-tenant-foundation-followups-2026-05-15.md` item 4
- `classifier-jurisdiction` becomes table-driven (currently free-text + normalizer trigger)
- Migration 072's `_normalize_jurisdictions()` trigger gets retired in favor of the table-based resolution
- Backfill `intelligence_items.jurisdictions` and `jurisdiction_iso[]` once the table is populated
- No immediate code changes from this skill rewrite; this is documentation of the contract, with execution deferred to the follow-up dispatch

---

## Item 4: rule-workspace-anchored-output FINISH (rescoped to workspace context only)

**Path:** `dotfiles/.claude/skills/rule-workspace-anchored-output/SKILL.md`

**Status:** top half rescoped this session (description and "Scope: WORKSPACE CONTEXT only" section added). Rest of the file is still in original form, including: Source attribution paragraph, "Wrong vs right" examples, the Seven Anchoring Principles, the workspace-profile-fields section, the required-vocabulary section, the audit-cross-reference section, and the Composition section.

### Current state

- Description: refined (two-part contract, workspace-only scope)
- "Scope: WORKSPACE CONTEXT only" preamble: added (with the three-context diagram)
- "Source" attribution paragraph: original (not yet updated to note the 2026-05-15 rescope)
- "What this means" section: refined (the two-part contract paragraph)
- "What this is NOT" section: added (anti-patterns)
- "Wrong vs right" examples: ORIGINAL (does not yet reflect workspace-only scope; the examples are still correct for workspace context but the section needs a header note clarifying scope)
- Seven Anchoring Principles: ORIGINAL (need a workspace-only note + cross-link to the community-attributed counterpart)
- Workspace profile fields section: ORIGINAL (needs a note that this is the workspace context input only; community context reads from `community_group_members` instead)
- Required vocabulary section: ORIGINAL (correct for workspace context; needs the scope clarification)
- Permitted naming section: ORIGINAL (correct for workspace context; needs a cross-reference to community-attributed which permits author naming)
- Audit cross-reference section: ORIGINAL (still accurate)
- Composition section: ORIGINAL (lists writers but doesn't yet distinguish workspace vs community surfaces)

### Proposed state (content sketch)

Finish the rewrite by:

1. Adding scope-clarification notes to each pre-existing section that's now workspace-only ("In workspace context, ..." prefix on the principles and on the required-vocabulary list)

2. Adding cross-references to `[[rule-community-attributed-output]]` at:
   - The Seven Anchoring Principles section (these principles apply to workspace context; community context has its own attribution principles)
   - The Permitted naming section (workspace context permits source naming but not person naming; community context permits author naming because the author IS the source)
   - The Composition section (split the writers list into workspace-anchored writers vs community-attributed writers; many writers operate in both contexts and the framing rule that applies depends on which surface is rendering)

3. Updating the Composition section's writer list to distinguish:
   - Workspace-context writers (all current writers; brief/summary/profile/frame surfaces)
   - Community-context writers (forum-thread author, post-author, vendor-endorsement-author, case-study-author; to be added per [[rule-community-attributed-output]])
   - Cross-context writers (writers that emit content rendered in both surfaces with different framing applied at the rendering layer)

4. Adding a footer note: "Source attribution rewrite history: original from environmental-policy-and-innovation; refined 2026-05-15 to clarify the two-part contract and the workspace-only scope after the three-context architecture was confirmed."

### Inheritance / composition

- Inherits from: no rule above this; this is a foundational writer-framing rule
- Inherited by: every writer that emits to workspace context (regulatory-fact-document, technology-profile, operations-profile, market-signal-brief, research-summary, summary-card-surface, frame-{regulations,market,research,operations}, operator-empty-states); all of these need a frontmatter note that this rule applies in workspace context only

### Decisions encoded

- Two-part contract (no naming AND workspace-context framing) is the canonical form, not just "no naming"
- Workspace-only scope is explicit; community context is governed by `[[rule-community-attributed-output]]`
- Personal context (current user only) has no framing rule; output IS to the current user themselves

### Blast radius

- Every writer skill needs a one-line scope clarification: "applies the rule in workspace context"
- The Composition section in 12 writer skills gets a one-line addition
- Future community writers (forum-thread, vendor-endorsement) will inherit from `[[rule-community-attributed-output]]` instead

---

## Item 5: rule-community-attributed-output (NEW, cross-cutting)

**Path:** `dotfiles/.claude/skills/rule-community-attributed-output/SKILL.md`

**Status:** does not exist

### Current state

There is no codified rule for community-context framing. The original 815-line skill predates the community layer's UX shape and only addressed workspace-anchored output. The community tables (forum_threads, forum_replies, community_posts, case_studies, vendor_endorsements, case_study_endorsements, community_group_members, community_groups, community_topics, community_group_invitations, plus the moderation tables) exist but their content shape is uncodified.

### Proposed state (content sketch)

**Description:** Inverse of `[[rule-workspace-anchored-output]]`. Applies to COMMUNITY CONTEXT surfaces (forum threads, posts, vendor endorsements, case studies, mentions in community discussions, anything scoped through `community_group_members`). Community contributions are author-attributed: the person posting is named, framing is peer-to-peer, trust signals (LinkedIn verification, contribution score, community group role) are surfaced.

**The two-part contract (inverse of the workspace-anchored two-part contract):**

Part 1: DO NAME. Community surfaces show:
- The author's full name (the person who posted the content)
- The author's affiliation (the organization the author belongs to, drawn from their primary org_membership or from a community-specific affiliation field)
- The author's community group role (Council Member, Verified Operator, Member, etc.)
- Trust signals (LinkedIn verification status, contribution count, time-in-community)

Part 2: PEER-TO-PEER FRAMING. Community contributions read as expert-to-expert exchange:
- First-person voice is permitted ("I ran into this on a charter last month")
- Domain-specific shorthand is permitted (the reader is a peer; over-explanation reads as condescending)
- Opinions and judgments are permitted and attributed to the author, not the platform
- "An industry operator interpretation" framing is NOT used in community context (that framing is for workspace-context briefs where the operator interpretation needs caveat against the platform's regulatory analysis)

**What community context is NOT:**
- Not a substitute for workspace-anchored briefs. A forum thread saying "CARB Phase 1 means X for live events" is a community contribution; the workspace's regulatory-fact-document on CARB Phase 1 is a separate canonical brief. They reference each other (cross-context linking is permitted) but they are different output shapes.
- Not anonymized. If the author wants to post pseudonymously, that is a separate UX feature (alias account), not a framing rule.

**Trust signal surfacing:**
- LinkedIn verification badge (LinkedIn integration confirmed the author's identity)
- Contribution score (number of accepted contributions × peer endorsements)
- Community group role (Council Member > Verified Operator > Member; rendered as a chip on the author byline)
- Time-in-community (used as a tiebreaker for ranking by recency-of-relevant-contribution)

**Cross-context linking:**
- A community post can cite a workspace-anchored item (the workspace's regulatory brief on CARB Phase 1)
- A workspace-anchored brief CANNOT cite a community post as authority (community contributions are peer interpretation, not regulatory authority; this preserves `[[rule-no-regulatory-inferences-as-fact]]`)
- A community post can reference another community post (threading, quote-reply)
- Cross-context citation is permitted both directions for reference; only the from-community-to-workspace direction has the authority constraint

### Inheritance / composition

- Inherits from: nothing direct (foundational framing rule for community context)
- Composed with: `[[rule-no-regulatory-inferences-as-fact]]` (community interpretations are not regulatory authority), `[[rule-source-traceability-per-claim]]` (community contributions citing facts still need source attribution, with the author treated as the source of the interpretation), future writer skills for community surfaces (writer-forum-thread, writer-vendor-endorsement, writer-case-study-author-post)
- Inverse of: `[[rule-workspace-anchored-output]]`

### Decisions encoded

- Authors ARE named in community context (inverse of workspace-anchored)
- Peer-to-peer framing (inverse of generic workspace framing)
- Trust signals are first-class UI (LinkedIn verification, contribution score, community group role)
- Community contributions are not regulatory authority (compose with rule-no-regulatory-inferences-as-fact)
- Cross-context linking permitted; the direction matters for authority

### Blast radius

- Future community writer skills (forum threads, vendor endorsements, case studies, posts) all inherit from this rule
- The community surface rendering layer reads the author byline and trust signals per this contract
- The cross-context linking rule shapes how community ↔ workspace references are rendered (workspace surfaces never cite community as authority)

---

## Item 6: rule-group-scoped-features (NEW, cross-cutting)

**Path:** `dotfiles/.claude/skills/rule-group-scoped-features/SKILL.md`

**Status:** does not exist

### Current state

The audit found that some features (notification target lists, mention pickers, share-with dropdowns) currently filter through the global `profiles` table or use ad-hoc scope rules. After the multi-tenant foundation deploy (`get_workspace_members` RPC added in PR #116; community_group_members table exists in migration 029), the architectural primitive for group-scoped features is in place but is not codified as a rule.

### Proposed state (content sketch)

**Description:** Every UI surface that lists or filters by people declares its context first, then scopes accordingly. Three contexts: workspace, community, personal. No feature filters by all platform profiles.

**The three contexts and their scoping:**

| Context | Source of "who is in this scope" | Examples |
|---|---|---|
| Workspace | `org_memberships` of the current workspace | Assign-to within workspace, shared notes on items, org-shared watchlists, mentions in workspace notes |
| Community | `community_group_members` of the relevant community group (which can be public or invitation-only via `community_group_invitations`; group-owner controls access) | Forum thread participants, post authors, vendor endorsers, case study contributors, mentions in community discussions |
| Personal | Current user only | Personal watchlist, personal pins, individual preferences |

**Feature design rule:** when adding any UI element that surfaces other humans, the developer must identify which group scope applies BEFORE the feature is built. The context is part of the feature's specification, not a runtime inference. Workspace features filter through `org_memberships` of the current workspace. Community features filter through `community_group_members` of the relevant group. Personal features see only the current user.

**No feature filters by all platform profiles.** A "mention anyone on the platform" feature is an anti-pattern; it leaks the existence of one workspace's users to another workspace.

**Implementation note (post-multi-tenant-foundation):**
- Workspace-scoped pickers query `get_workspace_members(p_org_id)` RPC (added in migration 077, gated by `_assert_org_membership`)
- Community-scoped pickers query `community_group_members` with the appropriate group_id (RLS-scoped to members of that group)
- Personal-scoped features need no picker (they operate on the current user; reads use `auth.uid()` directly)

**The community-context invitation-only behavior:**
- A community group can be public (anyone authenticated can join) or invitation-only (gated by `community_group_invitations` where group-owner controls access)
- The group-owner role is distinct from the platform admin role; one user can own a community group without being a platform admin
- Invitation tokens for community groups follow the same shape as org invitations (migration 076), one-shot, expirable; bundled into the invitation-polish dispatch

### Inheritance / composition

- Inherits from: nothing direct (architectural rule)
- Composed with: `[[rule-workspace-anchored-output]]` (workspace-context features apply that framing rule when they generate content), `[[rule-community-attributed-output]]` (community-context features apply that framing rule), every future feature spec that surfaces people
- Built atop: `org_memberships` (workspace context), `community_group_members` + `community_group_invitations` (community context)

### Decisions encoded

- Three contexts, mutually exclusive at the feature level (a feature is in one of the three; cross-context features are explicit composites, not implicit)
- Context declared in the feature spec, not inferred at runtime
- No platform-wide profile filtering (anti-pattern)
- Community groups can be public or invitation-only; group-owner controls access independently of platform admin

### Blast radius

- Every future feature spec that surfaces people uses this rule
- Existing workspace-internal features that may have been using global profile queries get migrated to `get_workspace_members` (audit-then-fix; not a single dispatch but a sweep)
- Mention autocomplete in workspace notes: scopes to workspace
- Mention autocomplete in community threads: scopes to community group
- Share-with pickers: scope per the share intent (workspace share = workspace scope; community share = community scope)
- Notification targets: scope per the notification origin (workspace event → notify workspace members; community event → notify community group members; personal event → notify only the actor)

---

## Item 7: rule-character-normalization (NEW, cross-cutting)

**Path:** `dotfiles/.claude/skills/rule-character-normalization/SKILL.md`

**Status:** does not exist

### Current state

The v2 product audit found 49 en/em dashes in `intelligence_items.why_matters` and 168 in `full_brief` across the corpus. The original 815-line skill says nothing about character normalization. The result: regulator-citation glyphs like `§§2015-2015.6` arrived from sources containing `§§2015–2015.6` (U+2013, en dash) and survived end-to-end into operator-facing output. Smart quotes (curly quotes) survive similarly. Double-encoded characters (e.g., `â€"` for a corrupted em dash) appear occasionally.

### Proposed state (content sketch)

**Description:** Every writer normalizes Unicode glyphs to plain ASCII equivalents before emission. Em dashes (—, U+2014) and en dashes (–, U+2013) normalize to commas or hyphens depending on grammatical role. Smart quotes ("", '', U+201C/D/E/F) normalize to plain quotes. Double-encoded characters (â€™, â€", â€œ, â€‹) detected and resolved to their intended glyph then normalized.

**The normalization table:**

| Source character | Unicode | Normalized to |
|---|---|---|
| Em dash | — (U+2014) | comma (with surrounding spaces if mid-sentence) or hyphen (if joining a range like 100—200 → 100-200) |
| En dash | – (U+2013) | hyphen (-) for ranges, comma for parenthetical |
| Left double quote | " (U+201C) | plain double quote (") |
| Right double quote | " (U+201D) | plain double quote (") |
| Left single quote | ' (U+2018) | plain single quote (') |
| Right single quote / apostrophe | ' (U+2019) | plain single quote (') |
| Horizontal ellipsis | … (U+2026) | three plain periods (...) |
| Non-breaking space | (U+00A0) | regular space |
| Bullet | • (U+2022) | hyphen (-) in lists |
| Double-encoded em dash | â€" | em dash, then normalize per above |
| Double-encoded smart quote | â€™, â€œ, â€ | smart quote, then normalize per above |

**Special-case preservation:**
- Section symbol § (U+00A7) is PRESERVED (used in regulatory citations like §2015 and is canonical)
- Paragraph symbol ¶ (U+00B6) is PRESERVED (used in regulatory citations)
- Currency symbols (€, £, ¥) PRESERVED (operationally meaningful)
- Degree sign ° PRESERVED (temperature, geo coordinates)
- Trademark/registered ™, ® PRESERVED (legal attribution may require)
- All accented Latin characters PRESERVED (proper names, regulator names: Müller, Naerøyfjord, etc.)
- Cyrillic, Greek, CJK PRESERVED (source language fidelity)

**Application points:**
- After every full_brief regeneration, before write to DB
- After every summary card emission
- After every YAML metadata field is populated
- In the writer prose stream; not at render time (render normalization would mask the underlying data quality problem)

**Failure mode signature:**
- An em dash or en dash appearing in operator-facing prose is a writer bug
- A smart quote in a CSV export is a writer bug
- A double-encoded character anywhere is a writer bug AND a source ingest bug (the ingest layer should detect and fix at ingest, not at writer time; but writer-time normalization is the safety net)

**What this rule is NOT:**
- Not a render-time fix. Normalization happens at write time so the stored data is clean.
- Not a justification to strip non-ASCII broadly. The preserved characters above are explicitly load-bearing.
- Not a substitute for source-text fidelity. If the source uses a specific glyph (e.g., a regulator's official citation), preserve in the `sources_used` provenance with the original glyph; normalize only in the writer's narrative emission.

### Inheritance / composition

- Inherits from: nothing direct (foundational data-shape rule)
- Inherited by: every writer skill (12 of them), the YAML emission skill, every classifier that emits text fields
- Composed with: `[[rule-cross-reference-integrity]]` (normalized values are canonical; if a normalized value disagrees with the source's original glyph, the source is preserved separately)

### Decisions encoded

- Normalize at write time, not render time (data quality is at the storage layer, not the presentation layer)
- Preserve legally and operationally meaningful glyphs (§, ¶, currency, accented Latin, CJK)
- Strip stylistic glyphs (em/en dashes, smart quotes, ellipsis, bullets) to ASCII equivalents
- Double-encoded characters are a bug to fix at ingest AND at writer (defense in depth)

### Blast radius

- Every writer skill gets a "applies rule-character-normalization on emission" note in its frontmatter
- Existing 49 en/em dashes in why_matters and 168 in full_brief get cleaned via a one-time backfill sweep (low-cost, one-time agent work; bundled into the source-registry-hygiene + audit-cleanup dispatch)
- The writer prompt template adds a "Output uses only plain ASCII punctuation per rule-character-normalization, with these exceptions: [preserved list]" instruction
- Regenerations after this rule lands automatically apply the normalization

---

## Item 8: extractor-intersections DECISION (clarify distinct, do NOT merge)

**Path:** `fsi-app/.claude/skills/extractor-intersections/SKILL.md`

**Status:** stub exists, decision needed between (a) merge into `extractor-relationships` or (b) keep separate and clarify distinct purpose

### Current state

`extractor-intersections` stub:
- Identifies pairs sharing operational_scenario_tag + compliance_object_tag
- Computes strength score via [[compute-intersection-strength]]
- Drives the Intersections sub-tab in Source Health Dashboard
- Writes to intersection store

`extractor-relationships` stub:
- Identifies cross-references, supersessions, implementations from full_brief prose
- Writes to canonical `item_relationships` table
- Relationship types: supersedes, implements, references, conflicts_with, depends_on, amends, related_to, sector_competitor

The operator surfaced the question: "Clarify purpose distinct from extractor-relationships, OR merge into extractor-relationships. If genuinely separate, document the distinct use case explicitly."

### Decision: KEEP SEPARATE, clarify the distinction

Rationale: they are different computations producing different outputs for different consumers:

| Dimension | extractor-relationships | extractor-intersections |
|---|---|---|
| Input | Item's `full_brief` prose | Item's tag arrays (operational_scenario_tags + compliance_object_tags) |
| Method | NLP / pattern extraction over text (citations, "supersedes" language, "implements" language) | Set intersection over tag arrays + strength scoring |
| Output | Directed edges with relationship_type semantics (A supersedes B; A implements C) | Undirected pairs with shared-tag count + strength score |
| Store | `item_relationships(source_item_id, target_item_id, relationship_type, confidence, provenance)` | Intersection store (canonical pair, shared_operational_scenario_tags, shared_compliance_object_tags, strength) |
| Consumer | Renderer's LinkedItemsCard, cross-page framing, knowledge graph layer | Source Health Dashboard intersections sub-tab, per-item metadata strip |
| Trigger | After every full_brief regeneration | After any item regeneration (the new item's tags may form new intersections with existing items) OR periodic batch |
| Semantic | "Item A narratively connects to Item B" | "Items A and B are pattern-similar" |

Merging them would conflate narrative linkage (extracted from prose) with structural similarity (computed from metadata). They are graph-like but they are different graphs.

### Proposed state (content sketch)

Update the stub's frontmatter description to explicitly call out the distinction. Update the body to:

1. Open with the "What this is NOT" clarification: "This is NOT [[extractor-relationships]]. Relationships extract narrative linkage from full_brief prose. Intersections compute structural similarity from tag arrays. Both are graph-like; both write to graph-like stores; they answer different operator questions."

2. Add explicit operator-question framing: "Intersections answer: which items are pattern-similar to this one based on shared operational scenarios and compliance objects? Relationships answer: which items does this one cite, implement, supersede, or otherwise narratively reference?"

3. Tighten the inputs/outputs/process sections (already in stub, but the "TO REFINE" markers go away).

4. Clarify composition with `[[extractor-relationships]]`: extractor-intersections READS from extractor-relationships's output as one input (explicit narrative linkage adds +5 to intersection strength, per the earlier sketch); they cooperate but are not the same skill.

### Inheritance / composition

- Inherits from: `[[reference-operational-scenarios]]`, `[[vocabulary-compliance-objects]]`, `[[compute-intersection-strength]]`
- Reads from: `[[writer-yaml-emission]]` outputs (tag arrays), `[[extractor-relationships]]` (explicit linkage modifier on strength score)
- Output consumed by: Source Health Dashboard intersections sub-tab, per-item metadata strip, agent's source pool (intersection partners join AVAILABLE SOURCES)
- Cross-references: explicitly NOT mergeable with `[[extractor-relationships]]` (decision encoded in this skill)

### Decisions encoded

- Keep separate from extractor-relationships
- Inputs are tag arrays (not prose)
- Output is undirected pairs with strength scores (not directed edges with semantic types)
- Consumer is operator-facing intersections UI (not the knowledge graph render layer)

### Blast radius

- No file restructure (the file stays where it is)
- The stub status remains for the implementation details; this decision unblocks future implementation work
- Documentation clarity for future dispatched agents writing either extractor (they won't accidentally merge them)

---

## Item 9: INDEX.md cross-cutting (UPDATE)

**Path:** `dotfiles/.claude/skills/INDEX.md`

### Current state

Lists 17 cross-cutting skills in three categories (Rules 7, Vocabularies 6, References 4).

### Proposed state

Add three new entries:

To Rules (becomes 10):
- `rule-character-normalization` — every writer normalizes en/em dashes, smart quotes, double-encoded glyphs to plain ASCII; preserves §, currency, accented Latin
- `rule-community-attributed-output` — inverse of workspace-anchored-output; community contributions are author-attributed and peer-to-peer-framed
- `rule-group-scoped-features` — every people-listing feature declares its context (workspace/community/personal) and scopes accordingly
- `rule-cost-weighted-recommendations` — every architectural recommendation weighs four cost surfaces against three value frames before being presented

Wait, that's 4 new rules (10+4=11... actually 7+4=11 rules total). Update the rules count line accordingly.

Categories count after: Rules 11, Vocabularies 6, References 4 = 21 cross-cutting skills (was 17).

Add a "Rule sequencing for cross-cutting composition" footer paragraph noting that:
- Foundational data-shape rules (rule-character-normalization, rule-no-speculation-as-fact) are applied at writer emission time
- Foundational framing rules (rule-workspace-anchored-output, rule-community-attributed-output) are applied per-surface depending on context
- Foundational discipline rules (rule-cost-weighted-recommendations, rule-cross-reference-integrity) apply at the dispatch and recommendation level

### Blast radius

- The INDEX.md becomes the canonical citation list for dispatched agents (per the activation gap I flagged earlier; agent prompts cite skill paths explicitly)
- The footer paragraph teaches the composition convention to future dispatches

---

## Item 10: INDEX.md project-specific (UPDATE)

**Path:** `fsi-app/.claude/skills/INDEX.md`

### Current state

Lists 33 project-specific skills in five categories (Writers 12, Classifiers 6, Extractors 3, Compute 4, Operational 8).

### Proposed state

Add one new entry:

To References (NEW category, becomes 1):
- `reference-caros-ledge-economics` — pricing target, operating cost tiers, kill switch, unit economics, per-dispatch cost ranges; consumed by rule-cost-weighted-recommendations

Categories count after: Writers 12, Classifiers 6, Extractors 3, Compute 4, Operational 8, References 1 = 34 project-specific skills (was 33).

Add a "Composition with cross-cutting skills" footer noting that:
- Every writer composes with rule-workspace-anchored-output OR rule-community-attributed-output (which depending on the surface context per rule-group-scoped-features)
- Every writer composes with rule-character-normalization on emission
- Every dispatch proposal composes with rule-cost-weighted-recommendations using reference-caros-ledge-economics as its data input

### Blast radius

- Same as item 9 (canonical citation list for dispatched agents)

---

## Order of commit (sequencing)

Per operator sequencing (cost discipline first, then vocabulary, then context framework, then char-norm, then extractor decision, then INDEX):

1. **rule-cost-weighted-recommendations** (item 1) — load-bearing for all subsequent recommendations
2. **reference-caros-ledge-economics** (item 2) — load-bearing for all subsequent Caro's Ledge recommendations
3. **reference-jurisdictions** REWRITE (item 3) — vocabulary/reference layer (the three vocabularies — verticals, transport-modes, topic-tags — were refined earlier this session and are already on disk)
4. **rule-workspace-anchored-output** FINISH (item 4) — context framework
5. **rule-community-attributed-output** (item 5) — context framework
6. **rule-group-scoped-features** (item 6) — context framework
7. **rule-character-normalization** (item 7)
8. **extractor-intersections** DECISION (item 8) — clarify-not-merge
9. **INDEX.md cross-cutting** (item 9) — update after all cross-cutting skills land
10. **INDEX.md project-specific** (item 10) — update after reference-caros-ledge-economics lands

Total: 10 file changes (8 SKILL.md files + 2 INDEX.md files).

## Acceptance criteria (operator review checklist)

Before authorizing execution, confirm:

- [ ] Item 1: four cost surfaces (one-time + ongoing-runtime + ongoing-infra + inheritance) is the right count and right framing
- [ ] Item 2: the cost table for major dispatches is accurate and complete (and the "rough order" estimates match operator's mental model)
- [ ] Item 3: the entity model spec covers the eleven entity types; the table shape SQL is approximately right (refinement at ingest time is OK)
- [ ] Item 4: the workspace-only scope clarification on the existing rule is sufficient (no further restructure needed)
- [ ] Item 5: the community-attributed-output rule's two-part contract (DO NAME, peer-to-peer framing) and the trust-signal surfacing list are right
- [ ] Item 6: the three contexts (workspace/community/personal) and the "no platform-wide profile filtering" rule are right
- [ ] Item 7: the character normalization table preserves the right characters (§, ¶, currency, accents, CJK) and normalizes the right ones
- [ ] Item 8: the decision to keep extractor-intersections separate from extractor-relationships (with the explicit clarification of the distinction) is right
- [ ] Items 9-10: the INDEX updates capture all the new files and the composition footers are useful

## Cost analysis (per rule-cost-weighted-recommendations, applied to this work)

- **One-time agent work:** ~ten focused writes, ~30-45 min wall time. No Claude API spend (text edits via local Claude Code). Low.
- **Ongoing runtime cost:** zero. Skill files are read by dispatched agents at dispatch time; no runtime impact on the live system.
- **Ongoing infrastructure:** zero.
- **Inheritance cost:** HIGH leverage in both directions. Done right, every future dispatch composes with these rules cleanly. Done wrong, every future dispatch inherits the wrong framing. This is exactly why the prework-first gate exists.

**Value frame:** revenue-accelerating (the cost discipline rule alone could prevent six-figure errors over the next year; the three-context framework prevents architectural drift as features ship). Not revenue-blocking today, but the cost of NOT doing this work is paid every dispatch.

**Manual gating:** none required; these are text edits with no runtime activation.

## After this work lands

The operator flagged the next initiative: "we have to go through the entire site and all content to define and refine." That is a separate dispatch with its own prework. It will compose with every skill landed here. The natural sequence:

1. Land these 10 skill changes (this prework, then execution)
2. Site + content review dispatch (its own prework first, per the discipline now established)

Standing by for operator review of this document before any of the 10 changes are executed.
