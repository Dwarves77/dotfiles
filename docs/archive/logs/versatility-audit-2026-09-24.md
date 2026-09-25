# Caro's Ledge — Multi-Industry Architecture Brief
**2026-09-24. Decision-ready. Nothing here is adopted — every change below is a proposal awaiting a ruling.**

Built on the three prior audits handed into this session (code generality audit, vault rulings audit,
external-architecture verification) plus two direct reads this session to get exact quotes:
[CONFIRMED docs/decisions/ADR-020-sustainability-first-vertical-scope.md] and
[CONFIRMED fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md]. `execute_sql` was blocked all
session (governing-skill hook could not verify a session transcript); every DB-shape claim below is
file-based (migration source), marked [HYPOTHESIS — DB unreachable] where it depends on live
CHECK-constraint text or row counts. Live re-verification of those points is Open Point #1 in §8.

---

## 1. The answer in ten lines

1. The mechanism layer is already close to industry-general: entity spine core kinds, source-tier
   resolver, workspace/`sector_profile` scoping, and `surfaceOf()` routing carry no freight-specific logic.
2. The lock-in is concentrated in **content and vocabulary**, not schema: the system-prompt identity
   line and two closed enums (`topic_tags`, `theme`) that hard-fail generation outside
   freight/sustainability terms are the highest-blast-radius blockers.
3. Verified external players (Enhesa, C2P, Assent, Wood Mackenzie, and others) confirm one shared
   pattern: one corpus + one applicability engine, industry breadth delivered as filters/modules on that
   core, never as per-industry rebuilds.
4. The minimum fix is a `regulatory_domain`-style dimension set (industry, domain, jurisdiction, role,
   subject/entity, site/lane) that a customer profile intersects against content — the same computation
   `sector_profile` already does for freight verticals, generalized one level up.
5. `regulatory_domain` is not a new idea — ADR-020 already owes it as backlog; this brief proposes
   widening its scope from "freight regulatory domain" to "industry × domain," not inventing a new
   mechanism.
6. Freight becomes the first "industry pack": its verticals, transport modes, and corridor entity kind
   move from being baked into core code/prompts to being data inside a pack, alongside a generic core.
7. The four product questions (what's happening / how it affects me / what to do / invest-or-not)
   already generalize as written — they name no freight noun; only their current implementation
   (freight-only prompts and enums) is industry-bound.
8. The five surfaces generalize as *shapes* (binding-obligation content, cost/pricing signal content,
   longer-range research, operational applied-content, peer community) but their current definitions
   ("port handling," "SAF," "bunker fuel," "forwarder invoice") are freight-worded and need re-abstraction.
9. Two binding texts contradict the operator's 2026-09-24 statement and need a ruling before any build
   proceeds: ADR-020's freight-sustainability scope decision, and the platform-intent skill's
   freight-only "Architectural intent" / Authority Grant language.
10. Nothing here should touch the live product yet — this is an S/M/L phased proposal, phase S is
    pure naming/parameterization with zero behavior change, and the in-flight artboard-parity and
    surfaces-study lanes are unaffected until a ruling authorizes phase M.

---

## 2. What is already versatile (keep), with evidence

| Mechanism | Why it's already generic | Evidence |
|---|---|---|
| Entity spine core kinds (`node`, `jurisdiction`, `organisation`, `asset`) | No freight-specific fields or logic found in the core kind set | [CONFIRMED migrations/282_entities.sql:58] |
| `sector_profile` on `workspace_settings` | A tenant-scoped filter/weighting object driving content delivery — the shape is domain-agnostic even though today's values are all freight verticals | [CONFIRMED constants.ts:177,287,475] |
| `jurisdiction_weights` override mechanism | Generic weighting layer, not freight-coupled | [CONFIRMED constants.ts:475] |
| `institution.ts` source-tier resolver (host→tier) | No domain coupling found; resolves trust by institution class, which is industry-neutral | [CONFIRMED institution.ts:1-92] |
| `surfaceOf(item_type, domain)` routing mechanism | The *routing function* takes an item_type/domain pair and maps to a surface — mechanically reusable; only the five surface *definitions* it routes to are freight-shaped | [CONFIRMED item-links.ts:1-78] |
| Propagation outbox, derivation DAG, statutory/estimates, sensitive-aggregates infra (migrations 284-287) | Generic computed-value infrastructure per remediation-discipline categories 32/48 — no domain coupling found | [CONFIRMED migration filenames + 282 header] |
| `remediation-discipline` skill | Explicitly platform-engineering-agnostic by its own declaration | [CONFIRMED SKILL.md:3,20] |

**Net read (carried over from the code audit, re-stated here as the section-2 conclusion):** the entity
spine, source-tier resolver, surface-routing mechanism, and workspace/`sector_profile` scoping mechanism
are GENERIC or PARAMETERIZABLE today. Multi-industry expansion is architecturally supported at the
mechanism layer already; the work is not "build a new engine," it's "stop feeding it only freight nouns."

---

## 3. What is freight- or sustainability-hardcoded, ranked by blast radius

Ranking combines: how many generation paths / customer surfaces it touches, and whether it is a closed
enum that hard-fails outside its vocabulary (worse than a soft default) versus a naming choice a
non-freight tenant could route around.

| Rank | Item | Why it blocks a 2nd industry/domain | Blast radius | Evidence |
|---|---|---|---|---|
| 1 | System-prompt identity: *"You are the Freight Sustainability Intelligence Agent...global freight forwarding operation"* | Every generation run of every format opens by declaring itself a freight-sustainability agent; a non-freight tenant's content would be generated by an agent that has already told itself what industry it's in | Every brief, all 5 formats | [CONFIRMED system-prompt.ts:13] |
| 2 | Closed `topic_tags` vocabulary (7 values, sustainability/freight-only; "outside vocabulary fails regeneration") | A hard validation failure, not a soft mismatch — any non-freight/non-sustainability topic literally cannot be tagged, so it cannot render | Every brief | [CONFIRMED system-prompt.ts:333-346] |
| 3 | Closed `theme` vocabulary (7 sustainability research themes) | Same hard-fail shape as #2, scoped to `research_finding` | Every research_finding brief | [CONFIRMED system-prompt.ts:296,353-354] |
| 4 | `operational_scenario_tags` mode-keyed to ocean/air/road/rail + forwarder roles | Encodes freight transport modes and freight supply-chain roles directly into a tagging enum; a non-transport industry (e.g., a manufacturer or a retailer) has no slot | Every brief's scenario layer | [CONFIRMED system-prompt.ts:364-388] |
| 5 | Platform value proposition text itself, defining the product as freight-sustainability-only, expansion framed as "broader freight forwarding" | This is the framing every dispatch loads before doing any Caro's Ledge work — it is the thing that would need a ruling first, because the Authority Grant makes it binding | Governs all dispatch scoping | [CONFIRMED platform-intent SKILL.md:43-58, quoted in full in §6] |
| 6 | `why_matters` / `cost_mechanism` field instructions ("how this item affects freight forwarding operations: pricing, procurement, carrier contracts..."; "how the cost reaches a forwarder's invoice") | Bakes a freight-forwarder economic frame into two mandatory fields on every brief | Every brief | [CONFIRMED system-prompt.ts:308,312] |
| 7 | Transport-mode taxonomy (air/road/ocean/rail) in constants, filters, scoring | Filter UI and scoring logic assume every item has a transport mode | Filter UI, scoring, item metadata app-wide | [CONFIRMED constants.ts:14-17] |
| 8 | Vertical taxonomy (~40 entries, all freight sub-industries) + adjacent-vertical crosswalk keyed to `general-air/ocean/road` | No non-freight vertical exists in the data; the crosswalk logic assumes a freight-mode key | ~40-entry taxonomy + cross-vertical recommendation logic | [CONFIRMED constants.ts:190-283] |
| 9 | `corridor` entity kind + dedicated `corridor-scope.ts` / `corridor-scope-cache.ts` + UN/LOCODE resolver | The one freight-specific limb on an otherwise-generic entity spine; a non-freight domain has no equivalent "lane" primitive and no reason to carry UN/LOCODE | 2 dedicated modules + 1 entity-kind slot + port/location resolution | [CONFIRMED 282_entities.sql:58; entities/ file listing] |
| 10 | Operations surface scope definition: "port handling, drayage, SAF, bunker fuel" | The most freight-worded of the five surfaces; hardest to reread as an industry-neutral "applied operations" shape without a redesign | Operations Profile format, 8 sections | [CONFIRMED platform-intent SKILL.md:109-116] |
| — | Entity spine's nine canonical entities (Organisation, Vessel/asset, Node, Corridor, Jurisdiction, Regulatory instrument, Method/standard, Fuel/technology, Person/research org) | [HYPOTHESIS, carried from the vault audit] Freight/transport-specific by construction (IMO ship numbers, UN/LOCODE, corridor hash); no generic "entity" shape exists for a non-freight business object (a SKU, a BOM line, a tariff line-item) | Entire entity-modeling layer for any 2nd industry | [CONFIRMED docs/specs/00-foundation-the-spine.md:54-70 — the entity list is confirmed; the "no generic entity gap" reading is HYPOTHESIS, not stated anywhere as a gap] |

**Reading the ranking:** items 1-6 are the generation-pipeline / prompt-and-vocabulary layer. Items 7-10
are schema/data-layer. The prior audit's conclusion holds: *the lock-in is concentrated almost entirely
in content — the system prompt's identity line and two closed enums — not in the entity or routing
mechanisms.* The critical path for a multi-industry pivot is therefore the generation pipeline, not a
schema rewrite.

---

## 4. The pattern multi-industry products use (verified), and what to borrow

Twelve claims from twelve primary sources were opened and adversarially checked this session-prior
(dates and corrections recorded in the source audit). Re-stated here as the pattern, with corrections
folded in — do not restate the raw figures elsewhere without re-verifying, per standing rule 1.

**The pattern, confirmed across every vendor examined:** one shared content core (a single corpus of
regulations / HS codes / bills / rules), reused across industries and jurisdictions via **facet
filters** (jurisdiction, topic, industry/market, responsibility/role) applied at read time — never
rebuilt per industry. [CONFIRMED — see external-architectures audit, "Common pattern" row]

Specific mechanisms worth borrowing, each independently confirmed:

- **Standardized topic taxonomy that collapses every jurisdiction to one structure** (Enhesa) — the
  taxonomy is the generalization point, not the content. `["Enhesa taxonomy collapses regulations to a
  single structure"]` (https://www.enhesa.com/ehs-intelligence/regulatory-topics/)
- **A profile object with three axes — market, content area, responsibility — gating what a given
  tenant sees** (Compliance & Risks / C2P) — structurally identical in shape to what `sector_profile`
  already does for freight; the axes are just named more generically.
  (https://complianceandrisks.zendesk.com/hc/en-us/articles/29082751428509)
- **Bottom-up "parts of parts, suppliers of suppliers" object model in one central database** (Assent)
  — an argument for a generic subject/entity graph beneath any industry-specific labeling, echoing the
  entity-spine gap noted in §3 item 10.
- **Asset-level spine with licensable per-sector modules layered on shared data** (Wood Mackenzie) —
  "built bottom up, asset-by-asset," sector modules (Metals, Power, Upstream) as add-ons, not rebuilds
  — the closest verified analogue to the "industry pack" idea in §5.
  (https://www.woodmac.com/lens/)

**What NOT to borrow:** none of the verified vendors run a closed, hard-failing topic/theme enum the way
`system-prompt.ts` does (item 2/3 in §3) — every one examined uses open or extensible taxonomies. That
closed-enum design is Caro's Ledge-specific and is the single most direct blocker to a second industry.

**What was refuted and should not recur as a stale figure:** Descartes is 190+ countries (not 160+);
FiscalNote has no published "$1/user/year" tier; ONESOURCE lists 775+ (not 750+) denied-party lists.
[REFUTED — see external-architectures audit, "Key Refutations"]

---

## 5. The minimum architecture

### 5.1 Generic dimensions

Reusing ADR-020's already-owed `regulatory_domain` dimension as the anchor rather than inventing a
parallel structure (reuse-before-construction). Proposed dimension set — **none of these are ruled**,
all await §6:

| Dimension | What it is | Existing precedent to extend |
|---|---|---|
| **industry** | Top-level tenant vertical class (freight forwarding, and later others — none named or designed for here) | New — but the same slot `sector_profile` currently conflates with "freight vertical" |
| **domain** | Regulatory/content domain within an industry (sustainability, customs, and later others, per ADR-020) | `regulatory_domain` — [CONFIRMED ADR-020:69-73, "owed on the schema"] |
| **role** | Who in the value chain a fact obligates (forwarder, customs-broker, importer... generalizes to any industry's role set) | `compliance_object_tags` party vocabulary [CONFIRMED ADR-020 Amendment 1:110-112] already separates "who" from "what domain" — extend the vocabulary, don't rebuild the separation |
| **jurisdiction** | Geographic/regulatory authority scope | Already generic — 8-jurisdiction taxonomy, `jurisdiction_weights` mechanism [CONFIRMED constants.ts:475] |
| **subject/entity** | The thing a fact is about (freight: corridor/vessel/node; other industries: SKU, asset, facility, BOM line) | Entity spine's generic kinds (node, jurisdiction, organisation, asset) [CONFIRMED 282_entities.sql:58] — extend the kind enum per industry pack rather than widen `corridor` |
| **site/lane** | Where the entity operates or moves (freight: corridor/lane; other industries: facility, store, plant — not every industry has a "lane") | `corridor` entity kind — becomes an industry-pack-scoped kind, not a core kind (see §5.3) |
| **transport/operational mode** | Freight: air/road/ocean/rail. Generalizes to "how the subject operates" — a retailer's channel, a manufacturer's process line | `constants.ts` transport-mode array — becomes pack-scoped data, not a hardcoded array |

The customer profile computes applicability as an intersection over these dimensions (industry ∩ domain
∩ role ∩ jurisdiction ∩ subject) the same way `sector_profile` + `jurisdiction_weights` already compute
applicability today [CONFIRMED constants.ts:177,287,475] — this is a generalization of an existing
mechanism, not a new one.

### 5.2 The four product questions, generalized

> "What is happening in this industry and how does it affects me; how does it affect the choices I
> make as a business; what do I do to meet regulations; where do I invest or not?"

As stated, this maps directly onto the existing five-surface intent with no freight noun required:

| Question | Surface(s) it already maps to | Freight-specific today? |
|---|---|---|
| What is happening | Regulations, Market Intel | Content is freight-worded; the surface *contract* ("what is binding, when, what it costs, what to do" — [CONFIRMED platform-intent SKILL.md:67]) is industry-neutral as written |
| How does it affect me | Regulations (item-level `why_matters`), Research | `why_matters` field instruction is freight-hardcoded (§3 item 6); the field itself is generic |
| What do I do to meet regulations | Operations, Regulations | Operations Profile's section vocabulary ("port handling, drayage, SAF, bunker fuel") is the most freight-worded surface (§3 item 10) |
| Where do I invest or not | Market Intel, Research, Technology Profile format | Verticals/crosswalk logic assumes freight modes (§3 item 8) |

**Reading:** the four questions and the five-surface *shape* generalize without redesign. What blocks
generalization is exactly the same content layer identified in §3 (items 1-2, 6, 10) — the surfaces
would not need new surfaces, they need their section vocabularies re-abstracted per industry pack.

### 5.3 Core vs. industry pack

Proposed split (unruled, decision-ready for §6):

**Stays core (industry-agnostic mechanism):**
- Entity spine core kinds, propagation/derivation infra, source-tier resolver, `surfaceOf()` routing,
  the five-surface *shapes*, the applicability-intersection engine (generalized `sector_profile`).

**Becomes an industry pack (freight forwarding is the first pack, not special-cased core):**
- The system-prompt identity line and field instructions (§3 items 1, 6)
- `topic_tags` / `theme` / `operational_scenario_tags` vocabularies (§3 items 2-4) — packs supply their
  own vocabulary registered against a generic "closed-vocabulary-per-pack" mechanism rather than one
  global hardcoded enum
- Transport-mode taxonomy, vertical taxonomy, corridor entity kind, UN/LOCODE resolver (§3 items 7-9)
- Operations surface's section definitions (§3 item 10)

### 5.4 Generality test — three hypothetical industries, three hypothetical domains

Required by the brief's rules: used only to test the dimension set above for gaps, and explicitly NOT
allowed to shape the design. None of these are proposed as next steps.

**Industries tested:** (a) commercial food-service / restaurant supply chain, (b) pharmaceutical
distribution, (c) construction materials / building-products distribution.

**Domains tested:** (a) food-safety/labeling regulation, (b) data-privacy/cybersecurity regulation,
(c) building-code/zoning regulation.

Fit check against §5.1's dimensions:

- **industry** slot: all three sit fine as a top-level value, same as "freight forwarding" would.
- **domain** slot: food-safety, data-privacy, and building-code all fit `regulatory_domain`'s
  `sustainability | customs | ...` open-ended shape without change.
- **role**: pharma distribution needs roles like "wholesaler," "pharmacy," "manufacturer" — none exist
  today, but the vocabulary is already an extensible list per ADR-020 Amendment 1, not a fixed enum with
  a hard ceiling — no structural gap found.
- **subject/entity**: this is where the fit strains. A pharmaceutical lot number or a construction
  building-permit record is not well-served by `node`/`asset`/`organisation` alone — construction
  material tested here surfaces the same generic-entity gap the vault audit already flagged
  [HYPOTHESIS] in §3 item 10 (originally item "—"). This is a genuine, evidence-surfaced gap, not
  invented for the test cases — it independently confirms the pre-existing hypothesis rather than
  introducing new scope.
- **site/lane**: food-service and construction both have a "site" concept (kitchen/plant, job site) but
  no "lane" — confirms `corridor`/lane should be pack-scoped, not core, exactly as proposed in §5.3.
- **transport/operational mode**: data-privacy domain has no transport mode at all — confirms this
  dimension must be optional/pack-scoped, not a required core field (today it is a required-feeling
  array baked into scoring — §3 item 7 — which would break for a non-transport industry pack).

**Net result of the test:** the proposed dimension set holds for 5 of 7 axes without change; two axes
(subject/entity generality, and making transport-mode/site-lane optional-not-required) need explicit
design attention before a second pack is built. No hypothetical industry was allowed to add a
bespoke field — where none of the three fit an axis cleanly (subject/entity), the finding is recorded
as a gap against the existing dimension set, not as a new industry-specific field.

---

## 6. Rulings the operator must make

### Ruling 1 — ADR-020's scope decision vs. the 2026-09-24 multi-industry statement

**ADR-020 decision text, quoted in full:**
> "Caro's Ledge is a freight-SUSTAINABILITY platform, first. Pure customs-procedure and
> transport-administration law is out of scope for what the platform ingests, classifies, and serves
> today." [CONFIRMED ADR-020:37-39]

**ADR-020's own pitch-vision passage, quoted in full:**
> "A tool that will eventually take ALL regulations for any freight forwarder and categorize them
> recognizably and actionably — starting with sustainability, ingesting customs and other domains
> later." [CONFIRMED ADR-020:55-57]

**The operator's 2026-09-24 statement:** "We are building this system to take on multiple industries,
not just freight forwarding... What we build as a tool can be used for many things like tariffs and
import and export regulations." (Relayed, this task.)

**The gap:** ADR-020's pitch vision is breadth **within** freight forwarding (more regulatory domains
for the same customer type — "any freight forwarder"). The 2026-09-24 statement is breadth **across**
customer types (any industry). ADR-020 never rules on non-freight industries because it was never
asked — this is not a direct contradiction, but the ADR's binding decision text is freight-scoped, and
a session building toward "any industry" would be extending past what ADR-020 authorized.

**Options:**
- (a) Amend ADR-020 in place with a new "Amendment 2" recording the 2026-09-24 statement as the
  vision this decision's `regulatory_domain` item now serves, widening its scope from freight-domain
  breadth to industry×domain breadth.
- (b) Leave ADR-020 untouched (it remains correctly scoped to the freight-sustainability intake
  decision it made) and record the multi-industry vision as a new ADR that supersedes only the
  *scope-of-ambition* framing, not the intake ruling.
- (c) Take no action; treat this brief as informational only until a build dispatch is authorized.

### Ruling 2 — platform-intent skill's freight-only expansion language

**Quoted in full, "Current operational scope" / "Architectural intent":**
> "Current operational scope. Freight forwarders specializing in art logistics, live events, luxury
> goods, automotive (classic, supercars, prototypes), and humanitarian cargo... Architectural intent.
> Multi-tenant SaaS designed to expand into the broader freight forwarding industry across air
> (primary), road (secondary), ocean (tertiary), and rail (rarely) modes." [CONFIRMED
> fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md:53-55]

**Quoted, description frontmatter (line 3):**
> "Serves freight forwarders (current scope: art logistics, live events, luxury goods, automotive,
> humanitarian; expansion: broader freight forwarding across air, road, ocean, rail)." [CONFIRMED
> SKILL.md:3]

**Why it matters:** the skill's own Authority Grant states this platform-scope language is binding and
"may not be modified without explicit operator authorization with strong-emphasis correction" — the
2026-09-24 statement is exactly that correction, but has not yet been transcribed into the skill. Every
dispatch loads this skill; until it is amended, every future dispatch will keep scoping itself to
freight-only expansion regardless of this brief.

**Options:**
- (a) Amend SKILL.md now: change "expansion: broader freight forwarding" to name freight forwarding as
  the first industry pack, with multi-industry as the platform's architectural intent — using this
  brief's §5.3 core/pack split as the amendment's structural basis.
- (b) Leave SKILL.md as-is until the dimension design in §5 is itself ruled and stable, to avoid
  amending the binding skill twice.
- (c) Split the difference: add a pointer from SKILL.md to this brief ("multi-industry vision recorded,
  not yet architected") without changing the binding scope language itself.

### Ruling 3 — whether to proceed to Phase S (see §7) at all

Given the operator correction that tariffs/customs must not shape the design, and that this is the
second time an operator example became scope (per the "examples are not scope" memory feedback): should
any phase-S work start now, or should this brief sit until the operator explicitly authorizes a next
step, with no default lane spun up from it?

---

## 7. Phased plan (S/M/L)

Every phase below is proposed, not authorized, and none is scheduled against the live product without a
ruling from §6.

**Phase S — naming and parameterization, zero behavior change.**
Rename/re-scope internal variable and type names that currently hardcode "freight" where the value is
already data-driven (e.g., treat `sector_profile`'s *slot* as generic even though its *values* stay
freight verticals for now). No schema migration, no prompt change, no vocabulary change. Verification:
existing test suite and goldens pass unchanged; no customer-visible diff. Risk to live product: none by
construction — this phase touches naming/typing only.

**Phase M — the `regulatory_domain`-widening migration + pack-scoping the closed vocabularies.**
Land the `regulatory_domain` (or `industry`/`domain` pair) schema dimension ADR-020 already owes,
per the two-track migration policy (schema DDL first via Supabase CLI, then dependent code)
[CONFIRMED CLAUDE.md standing rule 3]. Move `topic_tags`/`theme`/`operational_scenario_tags` from one
global hardcoded enum to a pack-registered vocabulary mechanism, with the freight pack as the one
concrete instance. Verification: every existing freight item still classifies identically post-migration
(regression goldens); no second pack is built in this phase — the freight pack is proof the mechanism
works for one industry before a second is attempted. Risk: schema-level, needs the standing
two-track discipline and the artboard-parity/surfaces-study lanes checked for column assumptions before
this lands (see below).

**Phase L — a second industry pack, built only after Phase M is verified stable.**
Genuinely out of scope for this brief per the operator's correction (§0): no specific second industry is
named or designed here, and none should be chosen opportunistically from an example. Phase L is: pick
one candidate (via a future ruling, not this brief), build its pack (vocabulary + entity-kind extensions
+ prompt identity), and use it as the second data point that either confirms or breaks the Phase M
mechanism design.

**Effect on in-flight work:**
- **Artboard parity lanes**: these operate on the five surfaces' visual/component layer, not on the
  content vocabulary or entity schema — Phase S and M as scoped do not touch component code, so parity
  lanes should be unaffected. This is a [HYPOTHESIS] — not independently checked against the parity
  lanes' current file list this session; confirm before Phase M starts.
- **Surfaces study**: directly relevant, since §5.2's surface-generalization argument bears on whatever
  the surfaces study is currently measuring; the study's authors should read §5.2/§5.3 before Phase M is
  scheduled, to avoid the study locking in freight-worded surface definitions that Phase M would then
  have to re-open.

---

## 8. Unverified and open points

1. **Live schema verification blocked.** All CHECK-constraint/enum text, row counts, and live vocabulary
   state in this brief are read from migration *source files*, not live queries — `execute_sql` was
   blocked the entire session. Every figure carrying [HYPOTHESIS — DB unreachable] in §3 and §5 needs a
   live re-check before Phase M is scoped in detail.
2. **Generic-entity gap is a hypothesis, not a named board item.** §3's entity-spine row and §5.4's test
   both surface the same gap (no generic "subject" shape below industry-specific entity kinds) from two
   independent angles, which strengthens it, but it has not been independently verified against a live
   query or added to PROGRAM-BOARD as an open item. Recommend it be added there regardless of which
   ruling in §6 is chosen.
3. **Artboard-parity-lane impact is asserted, not checked.** §7's claim that Phase S/M don't touch parity
   lanes is a [HYPOTHESIS] pending a file-list cross-check against those lanes' current scope.
4. **No cost/timeline estimate given for any phase.** Sizing (S/M/L) is relative ordering, not effort
   estimation — none of the source material in this session priced Phase M or L, and inventing a number
   would violate the no-fabrication rule.
5. **External-architecture pattern (§4) is applicability-relevant, not proof of Caro's Ledge's specific
   fit.** The vendors verified are all pure regulatory-intelligence products; none is a hybrid
   intelligence+community platform like Caro's Ledge, so the "shared core + facets" pattern is verified
   for the intelligence half but not independently tested against the Community surface's generalization
   needs — that surface was not examined in this brief's evidence base at all and is a real gap in
   coverage, not an oversight to paper over.
