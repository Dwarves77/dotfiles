# Intent vs. live product vs. competition — 2026-09-24

Verified against `docs/specs/07-page-walkthrough.md` and `docs/specs/00-foundation-the-spine.md`
(read in full this session, quotes below carry line numbers) and the six page audits / four market
sweeps supplied to this task (each already status-tokened; this report inherits those tokens and does
not re-run any code, DB or live-site check — none of those channels were available this session either:
`execute_sql` is blocked by a PreToolUse hook, and no live-check ran). Evidence rule: every claim below
carries `[CONFIRMED <how>]`, `[HYPOTHESIS]`, or `[REFUTED]`. Where a synthesis claim could not be traced
to a page-audit line or a spec citation, it is struck in Section 7, not carried into Sections 1-6.

---

## 1. Direct answers

| Page | Why it exists (spec 07, one line) | Delivers today? | Drop us for Greenly+ESG Today+FIATA+a Searoutes/BigMile trial and lose nothing live? | The Market Intel / Operations answer |
|---|---|---|---|---|
| Regulations | "what is binding on me, when, what does it cost, what do I do" (07:15) | **Partly.** Dates, jurisdiction, brief exist; position (07:17-20) is unbuilt on the index and 86% unclassified on the register (dated 2026-09-03) | **Yes**, largely. FIATA pairs a rule with forwarder-specific advice free; Enhesa's corpus is deeper. What would make us undroppable — position-based organisation — is 86% unbuilt | n/a |
| Market Intel | "what is moving, by how much, and am I ahead or behind" (07:88) | **No.** Ribbon shows fuel/FX level+Δ1w only; carbon overlay is `null`→GAP on every corridor; no rate board exists | **Yes.** Searoutes already shows live, per-carrier, per-lane ETS surcharges with dollar figures; ours shows GAP badges | **"What diesel costs."** No consequence (BAF/FSC, quote impact, "ahead or behind") attaches to any number shown |
| Research | "what is emerging, who is studying it, and how does it change my plan" (07:176) | **No.** No horizon/maturity/dissent field exists anywhere; page is grouped by compliance-urgency bands, body is a six-section paper summary | **Yes.** Enhesa's Regulatory Forecaster and a good newsletter (Trellis/ESG Today) do the same job at similar depth | n/a |
| Operations | "where should I do this, and is it cheaper to automate or hire" (07:250) | **No.** Matrix cells show fact *counts*, not comparable values; only 11/86 fact rows are structured, none shared across two regions; the automate-vs-hire calculator is on a separate route, ignores region, and starts from a typed default (32 USD/hr) | **Yes.** ECG's cost index does more with a real (if single-region) index | **"What wages are."** This is the operator's own diagnosis, confirmed in code: a wage or electricity value renders with no loaded cost and no break-even attached |
| Community | "what are peers actually seeing, that no dataset will tell me" (07:342) | **No, and actively worse than nothing.** The index shows name/email + employer next to posts — the opposite of "the room does not know who you are" (07:345) — while its composer 400s without `entity_ids` and the benchmark panel isn't mounted | **Yes**, and a forwarder concerned about antitrust exposure is safer with nothing than with this page live | n/a |

**Bottom line for section 1:** all five spec-07 differentiators are real and, per the two verified
competitor sweeps, unmatched in the market [CONFIRMED, competitor sweeps below]. None is live past a
placeholder/BUILT-NOT-SHOWN/BUILT-NOT-MOUNTED state today [CONFIRMED, six page audits]. A forwarder
combining free vendor content (Greenly/CSO, Blue Yonder, ShipZero), ESG Today/Trellis, FIATA's free
alerts, and a Searoutes or BigMile trial would lose nothing that is *currently live* on any of the five
pages [CONFIRMED, both competitor-sweep documents].

---

## 2. Per-page table

| Page | Question (07) | Differentiator (07) | Live status | Concrete example | EXAMPLE-AS-SCOPE drift | Top blockers |
|---|---|---|---|---|---|---|
| Regulations | 07:15 | "organised by who is bound" (07:17-20) | Partly (bands + brief live; position built-not-shown) | 774/903 register rows "Not classified" (dated 2026-09-03) [CONFIRMED session-log] | The 16-instrument example list at `docs/specs/01-regulations.md:25-44` became the entire classifier: `classify-binding-position.mjs:36-122` is those 16 regexes and nothing else [CONFIRMED read]. The 1-corridor example (Shanghai→Rotterdam, 07:384) became the only seeded corridor [CONFIRMED session-log dated] | No applicability engine beyond the 16-title list; obligation card has no task/owner/evidence fields wired; page organised by urgency band, not position |
| Market Intel | 07:88 | "carbon cost... per corridor, per container" (07:90-93) | No (GAP on every corridor; no rate data of any kind exists) | Shanghai→Rotterdam carbon card renders GAP; ribbon shows fuel Δ1w with no BAF/FSC consequence [CONFIRMED page.tsx:140-146] | Fuel (SKILL.md:75; 07:101-102) became 2 of 3 built producers; the corridor example became 4 of 4 seeded corridors, all ocean-from-Shanghai, for an air-first cohort [CONFIRMED seed-corridors.mjs:102-140 vs. SKILL.md:55]. EUA — the spec's own first line item (07:100) — has **no producer at all**: EEX is licence-blocked [CONFIRMED PROGRAM-BOARD.md:1955, "EEX EUA unbuilt (licence)"] | No freight-rate source anywhere (PROGRAM-BOARD.md:1927, "NOT BUILDABLE... corridor rate board, lead-time chart, peer cohort, capacity panel"); carbon overlay's three inputs (distance, tonnes/FEU, carbon price) are null in code; corridor↔emission-factor join path does not exist at all (PROGRAM-BOARD.md:1606, "WO-24 has no join path") |
| Research | 07:176 | "atomic unit is an assessment, not a paper" (07:178-180) | No (no horizon/maturity/dissent field in schema or UI) | Any finding shows a compliance-deadline band and a keyword "Cost alert" chip, not the methanol-style so-what block (07:196-226) | The spec's own worked example (methanol, 07:196) was **not** taken as scope — it appears in only 2 unrelated files. What was taken as scope instead is the sibling Regulations page's urgency-band layout plus artboard-06 sample strings (search prompt, 4 theme descriptions) copied verbatim into `taxonomy.mjs` [CONFIRMED grep] | No horizon/maturity/TRL/CRI columns exist anywhere; no customer-facing assumption register (the `assumption_register` table holds internal scorer constants, not customer plans); no signposts table; cross-references are untyped `related` edges |
| Operations | 07:250 | "two regions on one axis" (07:252-253) | No (cells show fact counts; base-region control deleted) | US×Labor markets cell shows "3" (a count); opening it shows a BLS median wage with no loaded cost and no break-even | HVAC-vs-two-people (`SKILL.md:120`, `04-operations.md:88`) became the only decision tool built (automate-vs-hire calculator, wired to exactly 2 inputs — a wage fact and an energy fact). 18/86 fact rows and 13/13 state-level rows are wage-only (dated 2026-08-30) [CONFIRMED session-log dated] | Only EU electricity and US wages are structured (75/86 rows are free text, no shared quantity across regions, so the index-vs-base layer never has two comparable numbers); automate-vs-hire calculator lives on a separate route, ignores region, starts from a typed 32 USD/hr default; D1 feasibility gate always blank by design |
| Community | 07:342 | "antitrust-first... platform knows who you are; the room does not" (07:344-345) | No, and worse than absent (identity leaks) | Index shows full name/email + employer next to every post [CONFIRMED page.tsx:108-121, 345-363] | The SAF-premium example (07:359, `05-community.md:80`) became the benchmark's first instrument, generalised to all air lanes; 2 of the remaining 3 instruments are `rate_per_feu`/`capacity_teu` — categories spec 07 itself names as Sherman Act risk (07:369) [CONFIRMED `seed-benchmark-instruments.mjs:48-69`, migration 294:53] | Index composer 400s without `entity_ids` — no thread can be created from the page that's supposed to hold them; benchmark not mounted on `/community`; first possible aggregate output ~2026-12-30 (90-day lag from Q3 period end); identity shown instead of the pseudonymous profile the schema already supports |

---

## 2b. EXAMPLE-AS-SCOPE as a class

**Every confirmed instance found this session:**

1. **Regulations — the 16-instrument list.** Entered as an illustrative set at `docs/specs/01-regulations.md:25-44` and `07-page-walkthrough.md:32-41`. Became the literal, exhaustive classifier (`classify-binding-position.mjs:36-122`, its own header says "16 regex rules and nothing else"). Mechanism: the example list was the only *specific, codeable* thing in the spec; nothing in the spec or the build brief said "and generalise this to the other ~1,300 instruments" as an explicit requirement with its own acceptance test, so the build stopped at the literal list. [CONFIRMED read]
2. **Regulations — the Shanghai↔Rotterdam corridor.** Entered as the worked cross-page example at `07:112, 07:384-392`. Became the only seeded corridor (`seed-corridors.mjs`, later expanded to 4, all ocean-from-Shanghai). Mechanism: same as above — a worked example was the most concrete deliverable in the spec, and no coverage target ("N corridors covering the cohort's top routes/modes") existed to force breadth. [CONFIRMED, session-log dated]
3. **Market Intel — fuel prices.** "fuel pricing signals" (SKILL.md:75) and "EU diesel / Jet kero" (07:101-102) were two of many ribbon items the spec names. 2 of 3 built producers are fuel; the third is FX; freight rates, capacity, SAF and peer data — everything the differentiator (carbon-in-rate) actually needs — have no producer. Mechanism: fuel and FX were the two *free, already-known* sources (EU Oil Bulletin, EIA, ECB), so build effort routed to what was cheap to ingest rather than to what the page's question required. [CONFIRMED session-log dated]
4. **Operations — HVAC-vs-two-people.** `SKILL.md:120` and `04-operations.md:88` name it as one example among five listed decisions Operations supports (cross-regional efficiency, recyclable-materials availability, PPWR feasibility, solar-vs-automate-vs-hire are the other four, `SKILL.md:118-124`). The build made HVAC-vs-hire the *only* decision tool, generalised no further than the two facts (wage, energy) already in hand, and sourced state-level data as 13/13 wage rows. This is the instance the operator named directly: "Wages is one small thing that the build grasped onto... now we have a page built around it." [CONFIRMED session-log dated; operator's own words per the relayed task]
5. **Community — the SAF-premium benchmark.** `07:359` and `05-community.md:80` give it as the worked benchmark question. It became the seeded instrument, generalised to *all* air lanes rather than the one lane in the example, and the two other instruments the build added on its own initiative landed on `rate_per_feu`/`capacity_teu` — the very antitrust-risk categories the spec names as ones to avoid (07:369). Mechanism here is different from 1-4: this is not narrowing to the example, it is the example's *shape* (a price-band poll) being reused for content the spec explicitly flagged as risky, without the "experience question" alternatives (`05-community.md:80-82`, e.g. "how many of your 2026 tenders asked for ISO 14083 figures") ever being built — the schema's `field_key` enum (migration 294:53) cannot even hold that kind of answer. [CONFIRMED migration + seeder read]
6. **Community — layout from a design mock, not the question.** `CommunityRooms.tsx:7`: "Composed against artboard 12 (dc.html id=p12)." The 7-region room grid comes from the artboard, not from the spec's entity-bound-thread model (07:353-354). This is a sixth mechanism: a visual mock, not a written example, became the organising structure. [CONFIRMED read]

**The mechanism, stated once:** in every instance, the spec or the platform-intent skill gave a worked
example to make an abstract requirement concrete. The build then treated the example's *content* (the
16 instruments, the one corridor, fuel, HVAC, SAF-on-one-lane) as the *scope*, because the example was
the only artifact in the brief with a literal, codeable shape — a regex list, a table row, a seed
script argument — while the actual requirement ("organise by position for the whole corpus," "carbon
decomposition on the forwarder's own lanes," "the field that answers automate-or-hire," "peers seeing
what no dataset tells you") remained an unmeasured, unowned prose sentence with no acceptance test tied
to corpus coverage or question-completeness. Nothing in the dispatch or spec format currently forces a
distinction between "here is one worked instance" and "here is the full scope."

**Proposed class fix, for the operator to approve — not adopted:**
- Every worked example in a spec or skill (an instrument list, a corridor, a decision, a benchmark
  question) is marked `EXAMPLE, non-exhaustive` inline, paired with an explicit **coverage requirement**
  stated as a measurable target (e.g., "position-classify ≥95% of the ~1,300-instrument corpus," "≥1
  corridor per mode the cohort ships," "cover all five listed Operations decisions, not one").
- A build brief that implements a page against a spec containing an EXAMPLE marker must carry its own
  line item for the coverage requirement, separate from the example-implementing line item, and the
  dispatch's own verification check (per the worktree's dispatch-discipline doctrine) must test the
  coverage requirement, not just that the example itself renders.
- The session-log addendum for such a dispatch states, in one line, "example implemented: X; scope
  requirement measured: Y% / N of M," so a reviewer can see the gap without re-deriving it.
- This is a proposal, not a ruling — the operator should confirm or amend it before it is written into
  `docs/dispatches/lane-common-contract.md` or an ADR.

---

## 3. Differentiators vs. the market

| Differentiator | Live for us today | Anyone else, live | Verdict |
|---|---|---|---|
| 1. Regulations by binding position | No — 86% unclassified, header not on index [CONFIRMED] | No vendor found organises by actor's own contractual position; closest is FIATA (rule+advice, not a 3-position taxonomy) [CONFIRMED, competitor sweep] | **UNIQUE-BUT-NOT-LIVE** |
| 2. Carbon cost per corridor/container, with derivation+basis+n+as-of | No — every input null, GAP badge, no rate data [CONFIRMED] | Searoutes: live, per-carrier, per-lane ETS surcharge, e.g. "$84 per TEU, Maersk, East Asia→North Europe" [CONFIRMED WebFetch, searoutes.com/2026/01/16]. BigMile monitors ETS surcharges too. Neither publishes derivation/basis/n alongside the number | **NOT-UNIQUE for the base mechanism** (Searoutes ships it); **UNIQUE-BUT-NOT-LIVE for the full provenance contract** (nobody, us included, ships value+derivation+basis+n+as-of together) |
| 3. Research horizon/maturity/dissent triple | No — no such field exists in schema or UI [CONFIRMED] | Enhesa's Regulatory Forecaster scores regulatory-enactment horizon, not technology maturity, and does not split evidence quality from source independence [CONFIRMED, competitor sweep] | **UNIQUE-BUT-NOT-LIVE** |
| 4. Two regions on one axis + automate-vs-hire | No — cells are counts, calculator is region-blind [CONFIRMED] | No cross-region single-axis comparator or automate-vs-hire tool found. ECG's FVL Cost Index is a real quarterly multi-driver index but single-region-at-a-time, vehicle-logistics only [CONFIRMED, competitor sweep] | **UNIQUE-BUT-NOT-LIVE** |
| 5. Antitrust-first peer room + aggregate benchmarks | No — leaks identity, not mounted [CONFIRMED] | Datamaran Harbor (900+ verified peers, no benchmark instrument, not forwarder-specific); TAPA EMEA TIS (peer, but security not cost, anonymised not identity-screened); WCA ECO (badge only) [CONFIRMED, competitor sweep] | **UNIQUE-BUT-NOT-LIVE** |

**Compact matrix** (✗ = not live/absent, partial = some mechanism live, live = fully live):

| Vendor | Reg-by-position | Carbon-in-rate/corridor | Horizon-assessment | 2-region+auto/hire | Antitrust-peer+benchmark |
|---|---|---|---|---|---|
| Caro's Ledge (live today) | ✗ | ✗ | ✗ | ✗ | ✗ |
| Searoutes | ✗ | partial-live (ETS only, no provenance) | ✗ | ✗ | ✗ |
| BigMile | ✗ | partial (ETS surcharge monitor) | ✗ | ✗ | ✗ |
| Enhesa | ✗ | ✗ | partial (regulatory horizon, not tech maturity) | ✗ | ✗ |
| Datamaran/Harbor | ✗ | ✗ | ✗ | ✗ | partial (peer, no benchmarks) |
| ECG (vehicle logistics) | ✗ | ✗ | ✗ | partial (cost index, single region) | partial |
| TAPA EMEA TIS | ✗ | ✗ | ✗ | ✗ | partial (security, not cost) |
| FIATA | partial (advice paired w/ rule) | ✗ | ✗ | ✗ | partial (directory) |
| Greenly/CSO, ESG Today, free layer | ✗ | ✗ | ✗ | ✗ | ✗ |

All five differentiators are real, unmatched ideas [CONFIRMED against two verified sweeps]. None is
built past placeholder on the live product [CONFIRMED, six page audits].

---

## 4. Free substitutes: what they give, what they never give

- **Regulation explainers with primary sources** (Greenly/CSO Connect, Blue Yonder, Tradlinx, CLECAT):
  give a dated timeline, who-is-bound-by-actor-type, PFAS/PPWR limits, EUR-Lex/national-law citations,
  all free, all ending in a vendor CTA [CONFIRMED WebFetch, multiple URLs cited in the source sweep].
  **Never give:** a forwarder's own three-position classification, or applicability tied to a
  forwarder's own profile attributes.
- **Per-corridor carbon numbers** (Searoutes, BigMile, Xeneta/Drewry surcharge series): give live
  per-carrier/per-lane ETS figures, sometimes with dollar amounts, gated behind a demo or dashboard.
  **Never give:** derivation class, sample size, or basis alongside the number, and never a
  forwarder's-own-lanes decomposition against a real rate band.
- **News/newsletter layer** (ESG Today, Trellis, ESG Dive, Splash247/Carbon Wake): give daily headlines,
  occasional primary-source links, and (Splash's Carbon Wake) some contractual-risk framing.
  **Never give:** horizon/maturity scoring, or any operational cost/rate consequence — a fetched ESG
  Today freight headline (2026-09-24) gave "2,500 Class 8 trucks" with no cost-per-mile or rate figure
  [CONFIRMED WebFetch, esgtoday.com].
- **Cost/labour content** (ECG's FVL Cost Index): gives a real quarterly multi-driver index for one
  region (vehicle logistics). **Never gives:** two regions on one axis, or an automate-vs-hire
  break-even.
- **Peer networks** (Datamaran Harbor, TAPA EMEA TIS, WCA ECO): give verified-peer discussion or a
  security-incident database or a certification badge. **Never give:** an aggregate cost/price benchmark
  for a forwarder's own peer set, built antitrust-safe.

---

## 5. What closes the gap first

Sequencing logic reused from `docs/specs/06-gap-register-and-sequence.md` §6-7: spine/foundation gaps
that unblock several surfaces at once go before per-surface polish; data producers run in parallel
because they are independent of the spine; P0 = blocks the contract.

1. **Corridor entity + number envelope on Market Intel's carbon overlay (P0).** Missing data: an EUA
   price (EEX licence-blocked, per `PROGRAM-BOARD.md:1955`) and a corridor↔emission-factor join key
   (`PROGRAM-BOARD.md:1606`, "WO-24 has no join path"). Unlocks: 07:88's "am I ahead or behind" — but
   only the carbon-decomposition half; freight rates are a second, larger gap below. Board status:
   spec 06 Phase 2.2 (corridor entity) and 3.1 (EUA/EEX) are both named but not landed; `06`'s own
   §2 lists S-2 (no corridor entity) as P0, gating "Market Intel components 2, 3, 5, 7."
2. **Freight-rate source or workspace-own-rate upload (P0).** Missing data/code: no rate producer exists
   anywhere in the registry, and spec 02:180 already records that contract benchmarks are not free.
   `PROGRAM-BOARD.md:1927` names this "NOT BUILDABLE (no data source)" for the rate board, lead-time
   chart, peer cohort and capacity panel as a set — i.e. the board itself already flags this as the
   hardest, not-yet-solved item, not a sequencing oversight. Unlocks: the spot/contract band and "your
   rate" plot that spec 07:109-119 calls "the entire value proposition." Decision needed from the
   operator (Section 6) before this can even be scoped, since the free layer genuinely does not carry it.
3. **Operations envelope reader + cross-region index (P0, cheap).** Missing code only, not missing data:
   `PROGRAM-BOARD.md:1587` records that WO-17's enveloped `regional_data_facts` columns already exist
   and are already written, but `fetchOperationsCoverage` selects none of the 11 envelope columns and
   the index-vs-base layer was never built — a **reader gap**, explicitly named "FINDING — reader gap,
   named not silently carried." Unlocks: spec 07's "two regions on one axis" (07:252-253) for the two
   dimensions (EU electricity, US wages) that already have structured data — without this, expanding
   data breadth (item 5 below) still renders as counts. Board sequencing: spec 06 Phase 4.1 names this
   first in Phase 4, "Operations cross-region column... zero backend, converts the surface from a
   gallery of prose cards into the comparative read."
4. **Regulations applicability engine beyond the 16-instrument regex (P0).** Missing code: a
   profile-attribute-driven applicability model (spec 01 §3.5, cited by the regulations audit) to
   replace `classify-binding-position.mjs`'s 16-entry literal list. Unlocks: 07:17-20's "the product" —
   the position split — for the 86% of register rows currently unclassified. Board status: spec 06 Phase
   4.2 names "Regulations `binding_position` and the obligation register" as the product's core
   distinction, second in the Phase 4 sequence after Operations' cheaper fix.
5. **Operations data breadth beyond wages/electricity (P0/P1).** Missing data: producers for the other
   four decisions `SKILL.md:118-124` lists (recyclable-materials availability, PPWR/materials feasibility
   joined to region, solar-vs-automate-vs-hire, infrastructure) — currently 75/86 fact rows are free text
   and only EU electricity + US wages are structured. Unlocks: closing the wages-as-scope drift the
   operator named directly, and the Operations page answering "where should I do this" for more than one
   input. Board status: spec 06 §3.2/D-2 names this P0 for Operations; WO-17 shows the mechanism
   (Eurostat/BLS-style envelope producers) is proven and reusable for the remaining series.
6. **Research assessment data model (P0, large).** Missing data model entirely: no horizon, maturity,
   dissent or `planning_assumption_shifted` columns exist; the brief generator writes a six-section prose
   summary, not an assessment (`system-prompt.ts:250-259`). Unlocks: 07:176-180's differentiator in full.
   Board status: not named as an active lane in the PROGRAM-BOARD excerpts reviewed this session; spec 06
   §4/D-1 names "no autonomous research-source intake" as P0 for Research and Phase 4.4 sequences the
   horizon band/maturity/credibility split fourth, after the two cheaper Operations/Regulations fixes and
   the Market Intel carbon overlay.
7. **Community identity fix + composer entity binding (P0, cheap, safety-relevant).** Missing code only:
   swap the index's name/email+org author line for the already-built `AuthorIdentityChip`/pseudonymous
   profile (migration 293), and send `entity_ids` from the index composer so posting does not 400. This
   is the one item on this list that is a straightforward code fix with no missing data, and it is
   flagged as safety-relevant because the live page currently does the opposite of its own differentiator
   (07:345) — an argument for prioritising it ahead of its position in the board's own Phase 5 sequencing
   (spec 06 Phase 5.1 "antitrust posting guard and verified-pseudonymous identity, before any usage
   expansion").
8. **Community benchmark instrument vocabulary (P1).** Missing schema: `field_key`'s enum (migration
   294:53) only admits price/wage/capacity fields; the "experience" questions spec 05:80-82 lists (ISO
   14083 tender asks, CBAM indirect-representative asks) cannot be stored. Unlocks: a benchmark that
   is not itself in the Sherman-Act-risk category the spec warns about. Sequenced after item 7 because
   it is additive to the same surface and lower severity.

---

## 6. Decisions for the operator

1. **Freight-rate data source.** No free source exists (spec 02:180, confirmed again by the board's own
   "NOT BUILDABLE" line). Closing item 2 above requires either buying/licensing a rate feed, building a
   workspace-own-rate upload flow (reusing the existing spec-09 upload pattern the market-intel audit
   names), or descoping the corridor rate board from the near-term plan. This needs a ruling before any
   lane is dispatched against it.
2. **EEX/EUA licence.** The carbon-overlay differentiator's price input is blocked on a licence
   (`PROGRAM-BOARD.md:1955`). Decide whether to pursue that licence, substitute a free EUA proxy (if one
   exists — not verified this session), or hold the carbon overlay incomplete.
3. **Example-as-scope class fix (Section 2b).** Approve, amend, or reject the proposed spec/dispatch
   convention (EXAMPLE markers + paired coverage requirements + a dispatch verification line). Not
   adopted — this report only proposes it.
4. **Sequencing priority: safety fix vs. board order.** Item 7 (Community identity leak) is currently
   sequenced fifth on the board (Phase 5.1) behind three intelligence-surface P0s. Decide whether the
   identity leak's safety profile (showing real names to competitors) justifies pulling it forward ahead
   of the board's own order, given it is comparatively cheap to fix.
5. **Research assessment model scope.** This is the largest single build item on this list (a full data
   model plus generation-pipeline change) and has no active lane visible in the excerpts of
   PROGRAM-BOARD reviewed this session. Decide whether to open it now or hold it behind the four
   cheaper/partially-built items above.

---

## 7. Struck claims, unverifiable competitors, and coverage gaps

**Struck from the "Differentiator validation" synthesis supplied with this task** (claims not carried
into Sections 1-6 above because this session could not trace them to a page audit or a spec citation, or
because the synthesis itself flagged them as unverified):

- The synthesis's "Merge question" section concludes "keep separate... but this analysis does not answer
  that question yet," self-labels its own Market/Operations overlap claims `[HYPOTHESIS]`, and explicitly
  states the `connection_themes` co-membership query that would decide it was never run (DB blocked all
  session). **Struck from this report's verdicts**: no merge/no-merge recommendation is made here, for
  the same reason the synthesis gives — it was never tested. This report does not answer the merge
  question at all, consistent with the instruction to measure the current state, not assume an answer.
- The synthesis's claim that **PR #604 (nav rename "Market Intel"→"Market", 2026-09-07)** was never
  approved by the operator is unverified — no session-log or ADR check was run against that PR in any
  of the supplied write-ups, and none was run in this session either. **Struck** — carried here only as
  a named coverage gap, not a claim.
- Any figures in the "Operations lane spec" and session-log citations dated 2026-08-30/2026-08-18/
  2026-09-03/2026-09-04 are **carried as dated, not current-state** per this task's own instruction;
  where this report uses them (e.g., "18/86 fact rows," "774/903 unclassified," "13/13 state rows"), they
  are marked "(dated)" and should be read as the most recent measurement available, not today's live
  count. No live DB query ran this session to refresh them.
- **UNVERIFIABLE competitors**: whether Greenly owns/runs CSO Connect was not shown on the fetched page
  and is marked `[HYPOTHESIS: operator-stated]` in the source sweep — not treated as confirmed here.
  Pledge's acquisition by Blue Yonder (inferred from a redirect) is similarly unverified as an
  acquisition, only as a URL redirect. Carrier newsletters (Maersk, DHL, IATA) were never checked in any
  supplied sweep — a coverage gap, not a finding of absence.
- **Coverage gaps this report inherits and does not close**: no live-site check ran (browser/DB
  unavailable to every subagent and to this session); no ADR search for a page-separation/merger
  decision was performed; Market Intel's source-class breakdown (how many live items trace to news vs.
  primary sources) was never measured; `item_cross_references`/`connection_themes` co-membership counts
  between any two surfaces were never measured live.

**Files read this session:** `docs/specs/07-page-walkthrough.md`, `docs/specs/00-foundation-the-spine.md`,
`docs/specs/06-gap-register-and-sequence.md`, `docs/specs/04-operations.md` (grep), `docs/PROGRAM-BOARD.md`
(grep + targeted reads, lines ~1587-1955), `.claude/skills/caros-ledge-platform-intent/SKILL.md` (lines
100-134, this worktree's copy). All page-status tokens and market-sweep citations are inherited verbatim
from the six page audits and two competitor/two free-substitute sweeps supplied with this task, each
carrying its own status token and evidence-limits section (DB blocked all session; no live-site check —
node process count over the harness limit in every audit).
