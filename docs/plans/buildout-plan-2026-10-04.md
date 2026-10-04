# Buildout plan, 2026-10-04

Coordinator plan for finishing the Caro's Ledge build. Written from
[system-map-2026-10-04](./system-map-2026-10-04.md), which records what is designed, built, run and
connected for every subsystem, with live counts read on 2026-10-04. Supersedes the lane list L15 to L28 in
[complete-build-plan-2026-10-01](./complete-build-plan-2026-10-01.md) where the two differ; that plan's
register of spec requirements stays the reference for the page-level work in stage 8.

## Operator rulings this plan is built on (2026-10-03 and 2026-10-04)

- External data only. Customers never upload or type their own data (ADR-042, ADR-043).
- Community is social only and never feeds other pages (ADR-041).
- Everything is free. Model judgement runs in Claude sessions through Sonnet and Haiku sub-agents, never
  the metered API.
- No human gates. Nothing in the data machine or flywheel waits on a review, a ruling file or a typed token.
- The admin can edit tiers and data quality when needed, never by default. Automatic writers respect an
  admin override.
- The flywheel grows: it scans all data from all pages, finds connections, analyses what they mean, and
  proposes what the system does not yet hold.
- Population of data happens after every layer is built. The scheduled judgement drain is built as a tool
  and stays off until the site build is complete.
- The coordinator designs. Sub-agents build, run, read the database and land work.

## How model judgement runs

Rule work (walking, matching, grounding checks, clustering) is code that runs in GitHub workflows chained
by completion events. Judgement work (classifying a page or a host, writing a brief, answering a question)
runs in a Claude session: a workflow exports the items, a session writes a committed verdict or batch file,
and the next workflow applies it by rule. A workflow cannot start a session, so a scheduled drain session
(kill switch, off during build) is the runtime after build. During build, sessions run judgement only to
prove a tool on fixtures.

## Stages

Each stage reuses existing mechanisms. Every lane is fixture-proven and dry by default.

### Stage 0: tidy
- Migration 350 applied; six stale pull requests closed (done 2026-10-04).
- Exempt series items from the hollow-record sweep (lane S0).
- Bring the chain manifest in line with what has fired (lane S0).
- Establish what happens at the 2026-10-15 layout-baseline expiry and the deferral expiry of the same date.

### Stage 1: source loop
- S1-A: the free brief path registers and rates every source a brief cites, records tier opinions, writes
  citation edges, and logs the reputation audit under a label the table accepts.
- S1-B: unknown hosts are decided by committed host-verdict batches instead of code edits; machine
  promotion carries bias tags; low-confidence tags adopt with their confidence; tier override respected.
- S1-C: promotion and demotion apply to the effective tier; repeated tier opinions move it one step; the
  recompute is a maintenance step and a link in the downstream chain.
- S1-D: the research walker registers and rates an unknown publisher instead of rejecting the paper.
- S1-E: source discovery, promotion and demotion become links in the chain manifest. Bias tags and tier
  shown to customers on every item.

### Stage 2: typed connections
- Run the existing relationship typing at mint and in the free brief path.
- Store the strongest signal discovery already computes instead of the generic type.
- A named parent instrument the corpus does not hold becomes a discovery target.
- The whole-corpus typing backfill is the population step, held to stage 9.

### Stage 3: cross-page analysis
- Intersection detection across Regulations, Market Intel, Research and Operations: shared scenario and
  shared compliance object.
- Theme briefs for every theme, authored by session lanes, shown on every page a theme touches.

### Stage 4: learning loop
- Questions fire on value changes as well as on mint.
- Answers come from held pools; the residue goes to a session lane, not an operator-priced request.
- The first write of an inference from an answered question; cited, labelled, shown on the pages.
- Predictions scored when the watched entity changes; the source reliability ledger adjusts weighting
  automatically.

### Stage 5: growth
- Repeated mentions of an entity, material, theme or term the system does not hold raise a proposal,
  adopt past a threshold, and become a source search target.

### Stage 6: remaining gates removed
- The three ruling-file queues decide by rule or lane verdict.
- Acceptance tokens come off the maintenance steps.
- The scheduled drain session is built with its kill switch, off.

### Stage 7: admin override
- Every automatic tier writer respects the tier override.
- A correction layer for item data (fact, tag, connection, brief text), applied over the machine value,
  preserved through re-runs, with an audit trail and an admin screen.

### Stage 8: workspace and pages
- Notes at the bottom of any item, private per workspace; multi-person assignment with notification; tag
  attribution; membership checks on the two count functions; a cross-organisation attack test.
- The grade chip restored on the live list and detail pages.
- Obligation as a first-class object with its binding position; portfolio; the five public-data domains.
- Industry-level statements replace the removed calculator.

### Stage 9: prove, then populate
- Fire the whole chain end to end on a branch copy of the database.
- Switch on the drain. Then, in order: the sitemap walk, the Gate A rescan, source promotion, candidate
  promotion, the typing backfill, record-to-brief upgrades.

## Open items carried
- Design changes owed for artboards 09, 13 and 15.
- Public-source intake for auxiliary energy and indexation mechanics.
- `regional_data_facts` and `estimated_values` have no consumer after ADR-043.
- The rendering audit generator fails on master with DetailShell import errors.
