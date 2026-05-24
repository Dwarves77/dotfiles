# Spec-vs-Built Audit: Cross-Surface Synthesis (2026-05-23)

Compiles findings from the 8 spec-vs-built audits dispatched 2026-05-23 in response to operator's diagnosis that three (and now five) of the customer-facing surfaces were built to the wrong specifications. Each underlying audit is a separate doc at `docs/plans/spec-audit-<surface>-2026-05-23.md`.

## 1. Headline

Five of six substantive customer-facing surfaces have fundamental gaps between the `caros-ledge-platform-intent` spec and the built reality. Map is the one clean match. User chrome (9 sub-pages) is mostly clean with one dead file and one inert panel. Substrate work (Migration 101, leakage fix at `4ca7fbd`) is correct and complementary to the surface rebuilds, not a substitute for them.

| Surface | Verdict | Rebuild scope | Audit commit |
|---|---|---|---|
| Dashboard | Engineering-fixed but customer-decision-misframed | Substantial reframing | `e84011c` |
| Operations | Fundamental gap; 0 of 5 named decisions supported; 1 of 5 spec bullets delivered | Substantial rebuild; entangled with Fix D Operations Facility decision | `1f5a784` |
| Market Intel | Fundamental gap; 0 of 4 customer questions fully answered; TRL framing + tech scope drift + lossy severity vocabulary | Substantial rebuild | `e790b71` |
| Research | Fundamental gap; editorial CMS instead of horizon-scan destination; 9 of 14 Regulatory Fact sections invisible to customer | Substantial rebuild; net-new detail route | `35c5894` |
| Community | Fundamental gap; generic forum, no org-context, no cross-surface integration; PLUS spec/reality drift (vendor directory + editorial pickup listed as shipped but absent/stubbed) | Substantial rebuild; spec correction also needed | `b982ebe` |
| Regulations | Index mostly matches spec at chrome + routing layer; DETAIL page materially under-built (only 1 to 3 of 14 spec sections rendered as first-class UI); vocabulary drift on Section 8 signals | Index: small fixes; Detail: substantial rebuild | `d02e20c` |
| Map | Spec matches build (intentionally a thin cross-cutting visualization layer, not a surface) | None | `b79e64a` |
| User chrome (9 sub-pages) | 7 clean (login, signup, onboarding, invitations, workspace/new, settings, privacy); 1 small issues (profile Sectors panel inert); 1 dead (events 308s to 404) | Small tactical fixes | `c23091a` |

## 2. Three classes of gap discovered

Audits surface three distinct gap patterns. Different remediation shapes per class.

**Class A: Customer-decision-axis missing.** The surface organizes by internal data architecture (item_type, pipeline_stage, domain, source.category) instead of by the question a freight forwarder uses the page to decide. Found on Dashboard, Operations, Market Intel, Research, Community. Affects 5 of 6 substantive surfaces.

**Class B: Spec data shapes invisible.** The spec defines a data format (Regulatory Fact Document 14 sections, Research Summary 6 sections, Operations Profile 8 sections) and the agent pipelines may populate the format into `intelligence_items.full_brief` markdown, but the customer-facing UI never renders the format as first-class structure. Found on Regulations (9 of 14 sections invisible), Research (6 of 6 sections invisible), Operations (8 of 8 sections invisible).

**Class C: Spec/reality drift.** The spec lists capabilities as shipped that don't exist or are stubs. Found on Community (vendor directory documented but removed per NO VENDORS rule; editorial pickup pipeline documented but only a one-shot copy button) and user chrome (LinkedIn import documented as stub but shipped at `a5db2fa`). Two-way: spec needs correction in some places (capabilities removed); build needs to deliver in other places (capabilities not yet shipped).

## 3. Cross-cutting themes

Several findings recur across multiple audits and warrant cross-surface decisions rather than per-surface ones.

**Vocabulary drift on Section 8 credibility signals.** `source-credibility-model` Section 8 specifies per-surface signal sets (Regulations: tier + jurisdiction + binding status; Research: tier + bias tag + citation count + recency; Market Intel: tier + recency + signal-strength; Operations: tier + jurisdiction + applicability). Multiple surfaces apply the Research-style chip set uniformly (Dashboard WeeklyBriefing rows) or are missing signals their spec calls for (Regulations missing binding status enum). Decision: enforce Section 8 per-surface signal asymmetry, or accept uniform chip vocabulary as a design simplification?

**Section 8 was not enforced during Build 7-11 dispatches.** The spec exists, my dispatches did not gate on it. Same root cause as the broader spec-vs-built misalignment. Lifting the binding rule "every dispatch's Value Delivery Check must include explicit spec-match assessment against the canonical SKILL section for the touched surface" prevents the recurrence; the rule applies prospectively.

**Detail pages are systematically under-built relative to index pages.** Regulations detail renders 1 to 3 of 14 Regulatory Fact sections; Research has no detail route at all (cards link to /regulations/[id]); Market Intel has no detail route; Operations has no detail route. The format-per-surface specs (Regulatory Fact Document, Research Summary, Operations Profile, Technology Profile, Market Signal Brief) are binding for `full_brief` markdown but invisible in the navigable UI. Decision: are the format specs binding on customer-facing UI, or only on agent output?

**Cross-surface integration is absent.** Community is "co-equal" with the four intelligence pages per spec but renders today as a sidebar nav item with one-way wiring (Community can promote a post INTO intelligence_items; no peer commentary on intelligence pages going the other way). Dashboard counts surfaces 5 widgets but routes 6 of 7 widgets exclusively to /regulations. The five-surface model is documented but not wired bidirectionally.

**The Value Delivery Check section became boilerplate.** Every Build 7-11 dispatch returned a Value Delivery Check section that confirmed the dispatch advanced customer-facing value. The reports were not false (Q9 chips did mount, count incoherence did get fixed) but they did not gate on "does this surface match the spec for what a freight forwarder uses this page to decide." That gate would have caught the misalignment before merge. Acknowledged in the operator's diagnosis and lifted into a binding rule going forward.

## 4. Operator decisions consolidated (24 across surfaces + cross-cutting)

Grouped by class. Operator decides per item; some have cross-surface implications worth resolving once rather than five times.

### Class A: Customer-decision-axis decisions (per surface)

| # | Decision | Surface | Audit ref |
|---|---|---|---|
| 1 | Dashboard formal status: cross-surface aggregator OR add to canonical 5 OR demote | Dashboard | `e84011c` Q1 |
| 2 | Hero tile click-target semantics: link to filtered /regulations OR cross-surface aggregator detail OR rework count | Dashboard | `e84011c` Q4 |
| 3 | Operations: jurisdiction-primary OR decision-primary OR toggle | Operations | `1f5a784` Q1 |
| 4 | Operations cost-model integration scope (cost-discipline gating implied) | Operations | `1f5a784` Q5 |
| 5 | Market Intel detail-page format: new `/market/[id]` OR polymorphic `/regulations/[id]` route | Market Intel | `e790b71` Q1 |
| 6 | Severity vocabulary: spec's 5-label decision-pressure-coded OR keep 4-tier lifecycle | Market Intel | `e790b71` Q3 |
| 7 | Tech surface scope: stay on Market Intel OR new Technology surface OR absorb into Operations | Market Intel | `e790b71` Q2 |
| 8 | Source registry expansion (BloombergNEF, MSCI, Carbon Pulse, etc.): which paid, which free-tier, which placeholder | Market Intel | `e790b71` Q6 |
| 9 | Research organization unit: themes OR raw clustered findings OR individual Research Summary briefs | Research | `35c5894` Q1 |
| 10 | Research editorial pipeline UI: admin-only OR remove OR power-user toggle | Research | `35c5894` Q2 |
| 11 | Research format rendering scope: Research Summary (6 sections) AND Technology Profile (8 sections) OR unified card abstraction | Research | `35c5894` Q3 |
| 12 | Cargo vertical filter source of truth: `intelligence_items.verticals` (item-level) OR `sector_profile` (workspace-level) OR both | Research | `35c5894` Q4 |
| 13 | "What's emerging" landing: time-ordered feed OR theme hub OR workspace-personalized OR hybrid | Research | `35c5894` Q7 |
| 14 | Community co-equal rendering interpretation: sidebar entry OR cross-surface integration OR both | Community | `b982ebe` Q1 |
| 15 | Community org/employer surfacing on post authors with privacy default | Community | `b982ebe` Q2 |
| 16 | Community platform-layer topic taxonomy approach | Community | `b982ebe` Q3 |

### Class B: Spec data shapes binding-or-not

| # | Decision | Affected surfaces | Audit ref |
|---|---|---|---|
| 17 | Is the 14-section Regulatory Fact Document spec binding on customer-facing UI, or only on agent `full_brief` output | Regulations | `d02e20c` Q2 |
| 18 | Add Regulations "new this week" + "due in 30/60/90 days" facets to the index | Regulations | `d02e20c` Q5 |
| 19 | Section 8 vocabulary on Regulations: rename Confidence to surface canonical Tier 1 to Tier 7 OR add binding-status enum + filter | Regulations | `d02e20c` Q3, Q4 |
| 20 | Q9 chip vocabulary per-surface (Section 8 asymmetry) vs uniform across surfaces | Dashboard | `e84011c` Q7 |

### Class C: Spec/reality drift (small)

| # | Decision | Action shape | Audit ref |
|---|---|---|---|
| 21 | Vendor directory: spec correction (capability removed per NO VENDORS) OR re-spec | spec correction (1 line) | `b982ebe` |
| 22 | Editorial pickup pipeline: build the full pipeline OR re-spec the line | re-spec OR build | `b982ebe` |
| 23 | LinkedIn import: update spec text to remove "(currently stub)" (capability shipped at `a5db2fa`) | spec correction (1 line) | `c23091a` Q3 |
| 24 | `/events` dead code: delete (zero blast radius) | code delete (operator signoff) | `c23091a` Q1 |

### Smaller chrome items

- /profile Sectors panel inert (writer not wired to composition path): mirror wizard write to `workspace_settings.sector_profile` OR remove panel
- Email-delivered invitations gap: assign ownership between onboarding completion and notifications scope
- /privacy reachability: add to global footer / login / signup OR leave Settings-only
- /onboarding bounce when no org: route /signup directly to /workspace/new OR keep bounce

## 5. Recommended rebuild sequencing

Five substantive rebuilds + small tactical fixes. Suggested order based on dependency, customer pain, and operator-reachable scope.

### Sequence A: tactical fixes first (low risk, unblocks visibility)

These can ship in a single small dispatch and don't depend on the bigger rebuilds:

1. Delete /events (zero blast radius; cousin of /community/events already removed)
2. Spec correction: vendor directory line (remove per NO VENDORS), LinkedIn import line (remove "stub")
3. /profile Sectors panel: either wire it or remove the panel (operator picks)
4. /privacy reachability: add to footer/login/signup (or leave; operator picks)
5. Em-dash sweep across surfaces (flagged in Dashboard audit; small)
6. Bind the Value Delivery Check spec-match rule into a dispatch-template helper so future dispatches automatically gate against the canonical SKILL section

### Sequence B: cross-cutting decisions first (unblock rebuild design)

Before scoping any rebuild dispatch, decide the cross-cutting questions so each rebuild doesn't re-litigate them:

1. Section 8 vocabulary: enforce per-surface asymmetry or accept uniform
2. Detail-page format binding: is the format spec binding on UI or only on agent output
3. Cross-surface integration shape: how does Community wire bidirectionally
4. Q9 chip vocabulary: per-surface or uniform on Dashboard
5. Dashboard formal status: aggregator or canonical-5 member or demoted

### Sequence C: substantive rebuilds (one at a time, ordered by leverage)

Each is a substantial rebuild dispatch with explicit Value Delivery Check spec-match assessment as the merge gate. Suggested order:

1. **Research** (highest customer-decision leverage; cleanest spec because the Research Summary 6-section format is well-defined; rebuild absorbs the no-detail-route gap)
2. **Operations** (5 named decisions are concrete; absorbs Fix D Operations Facility decision per the audit's recommendation rather than waiting for Fix D to ship first)
3. **Market Intel** (depends on cross-cutting decision 1 from Sequence B; severity vocabulary + tech surface scope are upstream)
4. **Community** (depends on cross-cutting decision 3 from Sequence B; rebuild includes spec correction work)
5. **Regulations Detail** (index already mostly matches; detail rebuild is the focused scope)

Dashboard is a reframing (not a rebuild) and can happen in parallel with any of the above since it consumes from each.

## 6. What this changes about the existing roadmap

Fix D (per `docs/plans/fix-d-scope-2026-05-23.md`) is partially superseded by the rebuilds. Specifically:

- Fix D Operations Facility decision: ABSORBED by the Operations rebuild per the Operations audit's recommendation
- Fix D /research surface limitation: ABSORBED by the Research rebuild
- Fix D REC-OBS-G full wiring: STILL APPLIES, lands with the rebuilds rather than as a standalone dispatch
- Fix D domain constants file: ALREADY LANDED via the leakage fix (`4ca7fbd`)

Ingest restart sequencing is unchanged. The substrate work (Migration 101, leakage fix) protects data correctness through restart; the rebuilds are surface work and do not affect ingest cadence decisions.

## 7. The Value Delivery Check failure mode (honest accounting)

Every Build 7-11 dispatch I architected returned a Value Delivery Check section confirming customer-facing value delivery. None of those checks failed because none of them tested against the canonical SKILL section for the surface they touched. The dispatches were scoped from build deliverable lists, not from spec match. The Q9 chips landed, count incoherence got fixed, classification leakage got closed; these were real engineering wins on a substrate that was already on the wrong page architecture. The architecture mismatch was the silent failure mode.

Lifting the binding rule "every dispatch's Value Delivery Check must include explicit spec-match assessment against the canonical SKILL section for the touched surface" prevents the recurrence. The rule applies to every future surface dispatch including the rebuilds outlined above.

## 8. References

- `caros-ledge-platform-intent` SKILL.md (the spec)
- `source-credibility-model` SKILL.md Section 8 (per-surface signal sets) + canonical domain INT-to-label cross-reference (added post-merge of leakage fix)
- `environmental-policy-and-innovation` SKILL.md Section 3 (routing rules) + Section 14 (Regulatory Fact Document 14 sections)
- `docs/plans/dead-code-disposition-2026-05-21.md` (5-surface model context + Q9 chip family)
- `docs/plans/ingest-restart-sequencing-2026-05-22.md` (substrate sequencing; pre-restart verification gates)
- `docs/plans/fix-d-scope-2026-05-23.md` (Fix D scope; partially superseded by this synthesis)
- `docs/plans/spec-audit-<surface>-2026-05-23.md` for each of: dashboard, operations, market-intel, research, community, regulations, map, user-chrome
