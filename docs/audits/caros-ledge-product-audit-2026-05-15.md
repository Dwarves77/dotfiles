# Caro's Ledge product audit, v2 — 2026-05-15

Read-only audit of the live product against the operator brief dated 2026-05-15. Eight investigation areas covered in parallel: data sufficiency per page, cross-reference integrity, source traceability, route-to-data alignment, AI writer quality, FSI Brief framework + integrity non-negotiables, lead time + vertical/mode priority, multi-tenant 3-layer model.

Population at audit time: 644 active intelligence_items, 794 sources, 1 organization (Dietl/Rockit), 1 user. Live Supabase project kwrsbpiseruzbfwjpvsp queried 2026-05-15.

**v2 changes from v1.** The four-page architecture is the operator-defined design and is correct; the v1 prescription that suggested renaming /research or feature-flagging /operations was wrong-shape and has been removed. v2 prescription is grounded entirely in the data engineering infrastructure required to deliver the four pages as designed, drawing from patterns proven by Bloomberg, Refinitiv, Thomson Reuters Regulatory Intelligence, S&P Capital IQ, Sustainalytics, MSCI ESG, and Compliance.ai. v2 of this document, together with the companion `caros-ledge-supabase-schema-audit-2026-05-15.md`, becomes the spec for the next three dispatches.

This document does not recommend specific fixes or dispatches. Its job is to produce the spec the next dispatches will be measured against.

---

## 1. Executive verdict

Caro's Ledge today is a single-tenant database with four list-page facades, a single detail-page route, and a writer pipeline that has populated the structured columns the renderer reads on roughly one quarter of the corpus. The remaining three quarters live as 25-word neutral-prose summaries written by a 10-line Haiku classifier prompt. The dashboard surfaces the unreliable layer first. The deeper, integrity-bound Sonnet 4.6 layer that meets the FSI Brief framework exists but is invisible on the cards operators actually scan.

The four-page architecture (Regulations, Research, Market Intel, Operations) is a sidebar with four entries and four list-page filters, three of which are page-side OR expressions over `item_type` and `domain`, and one of which (`/research`) has no filter at all. There is exactly one detail-page route in the entire app: `/regulations/[slug]`. Every card click in the codebase, in every component on every page, routes there. A vendor SaaS clicked from /market, an academic working paper clicked from /research, and a regional cost datum clicked from /operations all land on a page whose masthead reads "Regulations · Global." The detail page itself reads three columns that do not exist in the schema (`penalty_range`, `cost_mechanism`, `enforcement_body`, `legal_instrument`) plus two more that no writer populates (`compliance_deadline`, `action_owner`). Every penalty calculator render produces "No structured penalty data on file." Every owner card produces "Unassigned." Every effective-date stat tile is hidden because the underlying date is null.

The 5-axis source classification framework that 70-plus migrations were built around is not surfaced anywhere in the operator's view. The page-data fetchers read zero of the fifteen classification columns. The CONFIDENCE filter chip on /regulations is wired to a field the Resource mapper never sets, so every item collapses into "Unclassified" and the chip filter is dead UI. The SourceProvenanceBadge component reads a store hydrated only by /admin and silently returns null on the four operator-facing pages. Pills that look like authoritative classification (REGULATION, GUIDANCE, IMMEDIATE, ELEVATED) derive from the LLM-classified `item_type` and `priority` columns, not from source role or tier.

Lead time, the brief's competitive frame, is an unrealized concept. There is no item-level lead-time field. There is no UI affordance that surfaces "we caught this N days before the source published." Of 23 regulations with effective dates, all 23 were ingested AFTER the regulation took effect, by an average of 779 days. The product is operating as a historical regulation catalog, not a forward-looking radar. Vertical priority is similarly unrealized: 95.5% of items have no vertical tag, the brief's HIGH verticals (live-events, fine-art, luxury, film-tv, automotive, humanitarian) cover 13 items between them, and mode distribution skews ocean and road over air despite air being PRIMARY in the brief. The sector-aware filtering the brief calls for is a concept with four configuration UIs (one of which writes to nothing), zero server-side enforcement, and structured data that doesn't support filtering even if it were enforced.

The integrity gap is the most operator-consequential finding. 100% of multi-claim card summaries lack per-claim attribution. 61.6% of regulation/directive/standard rows have no legal-counsel caveat anywhere in the brief. 31.3% of regulation rows with full_brief issue imperative obligation language ("operators must," "ACTION NOW," "Owner:") in the visible card surface without a "Legal Confirmation Required" caveat at that surface. 15.5% carry specific numbers, dates, or dollar figures with no inline source and an empty `sources_used` array. The B.2 regeneration framework moved 25% of rows from news-aggregator output to operator-decision output, but propagated a structural integrity gap: per-claim citations and legal caveats live in `full_brief`, the dashboard surfaces `summary`, and the layer the operator reads first strips both.

Structurally, the product has three writer populations colliding in the `summary` column (Haiku classifier, manual seed scripts, legacy "Pre-tracking" placeholders), three vocabularies for source classification on `sources` table (`scope_topics`, `topic_tags`, `intelligence_types`, with 0% agreement on any of 282 dual-populated sources), two competing tier semantics sharing the same `tier` column (legacy 7-tier "trust" hierarchy from `types/source.ts` versus migration 063 framework), and a severity-priority mapping that 209 of 614 rows violate (66% agreement). The B.2 contract is enforced at agent parse time but bypassed by every other writer. The downstream effect is a system whose database honestly reflects the writer's contract drift, and whose UI reads from whichever layer the developer chose, producing a different answer per surface for the same fact.

The four-page architecture is the design and is correct. What is missing is the data engineering infrastructure beneath it. The product as it stands is an ingestion pipeline with display attached. The brief calls for a decision-support system. The gap between the two is structural, not symptomatic, and is replicated at every layer (writer, schema, RPC, page filter, render). Closing it requires the data engineering layers specified in Section 6, modeled on what proven intelligence platforms have built underneath similarly-shaped products.

---

## 2. Per-page assessment vs operator intent

### Regulations

**Operator intent (brief).** "What is binding, when, what does it cost, what do I do."

**Reality.**
- "What is binding": the page filter `(r.domain || 1) === 1` (`RegulationsSurface.tsx:382`) plus a default-to-1 adapter at `supabase-server.ts:494` sweeps 586 of 644 active items into the regulations list. 438 of those 586 (75%) have an `item_type` that is not "regulation" (frameworks, guidance, regional_data, market_signals, research_findings, tools, etc). Operators on /regulations see a vendor SaaS (EcoVadis), a learned society (IIC), regional electricity tariffs, market signals, and research findings rendered with the same REGULATION pill as primary legal authority items. The page is a regulation directory in name only.
- "When": `compliance_deadline` is null on 100% of rows (the column exists, no writer ever populates it). `entry_into_force` is populated on 23/644 rows, and 22 of those are pre-B.2 legacy rows the agent has never regenerated. `item_timelines` table has 107 rows across 30 items (4.7% coverage), all from the migration 010 backfill, none from current code paths. The "Effective" stat tile is hidden on 95% of detail pages because the underlying date is null.
- "What does it cost": `penalty_range`, `cost_mechanism`, `enforcement_body`, `legal_instrument` columns referenced by the renderer (`supabase-server.ts:1411-1413`) do not exist in the schema. The PenaltyCalculatorPanel renders "No structured penalty data on file" on 100% of regulation detail pages. The fallback regex scrape of `full_brief` for sentences matching `penalt|fine|surcharge` fires on roughly 10% of rows, returning unstructured prose snippets, not structured tiles.
- "What do I do": `action_owner` and `last_verified_date` columns referenced by `OwnerTeamCard` do not exist. The card renders "Unassigned" with no last-update date on 100% of detail pages. The four-stat strip's "Lanes affected" and "Your exposure" tiles are hard-coded "—" literals (`RegulationDetailSurface.tsx:219-220`) gated to never render. The AffectedLanesCard renders the honest-empty footnote "Lane-pair, volume, and origin/destination data not yet in schema" on 100% of pages.

**Verdict.** The page fails to deliver on its stated intent across all four operator questions. It can answer "what" (titles and descriptive text) for ~25% of items where the operator-authored seed fields (`what_is_it`, `why_matters`) are populated, "when" for 0% of items via the structured columns the UI reads, "what does it cost" for 0% via structured tiles, and "what do I do" for 0% via owner attribution. It is structurally a regulation directory, not a binding-action workbench.

### Research

**Operator intent (brief).** "What is emerging, who is studying it, how does it change my planning horizon."

**Reality.**
- "What is emerging": no filter is applied at all. `RESEARCH_SCOPE = {}` (`research/page.tsx:17`) plus `getResearchPipeline()` returns the entire workspace pipeline capped at 100 items. Every item type, every status, every source role is in scope. The "research" framing is a label on a list of everything.
- "Who is studying it": the page is the only one of the four that surfaces `sourceName` from the joined sources table (95% coverage) at `fetchResearchPipelineRows:713`. This part works. But the source name is text only, the URL is not clickable, the source tier is not shown, the source classification confidence is not shown.
- "How does it change my planning horizon": the page's two flagship features are broken. The coverage matrix at `ResearchView.tsx:162-167` is a 28-cell hand-coded mock with the disclaimer "Coverage values are placeholders pending the source registry rollup endpoint." The stage-driven workflow narrative builds the entire UI around `pipeline_stage = "active_review"` as the primary CTA tile (`ResearchView.tsx:277`), but zero items in the database have that stage. 71% of items show as "Published" by default because their `pipeline_stage` is null and `normalizeStage()` falls back to "published." The most prominent CTA on the page leads to an empty list.

**Verdict.** Partially delivers the list shape. The pipeline list works on real data; "what's new this week" via `addedDate` works. But the planning-horizon angle the page is built around (active review queue, coverage matrix) is a mock or a zero-result default. The source-credibility tier the brief makes central to research evaluation is not surfaced. The right items are not yet being routed here either: peer-reviewed studies, industry-academic research collaborations, credible white papers are absent, and parliamentary portals and unrelated rentals are present (Section 5 names specific cases). The page is correctly designed; the source registry curation and the routing layer that would feed it correctly are not built.

### Market Intel

**Operator intent (brief).** "What are competitors and adjacent industries doing, what does it cost me to ignore."

**Reality.**
- "What are competitors doing": the page filter pulls `r.type IN (technology, innovation, market_signal) OR r.domain IN (2, 4)` (`MarketPage.tsx:134-145`), yielding ~62-72 items. The filter does not consider source role, so vendor_corporate sources (EcoVadis), trade_press (Lloyd's List, Aviation Week, FreightWaves), industry_data_provider (BloombergNEF), and primary_legal_authority items coexist in the same HIGH-priority POLICY ACCELERATION SIGNALS strip alongside CARB-grade regulations.
- "What does it cost me to ignore": no penalty/cost field on these items. No severity-tier filter. `severity` (which has dedicated labels COST ALERT 34, COMPETITIVE EDGE 12, WINDOW CLOSING 6) is populated on 612 rows but the page does not surface it. The page reads `priority` (4 generic levels) when the richer `severity` signal is already in the database. The cost-trajectory chart and key-metrics rows would need separate verification but are likely component-level mocks.
- Source attribution: the PolicySignals SourceBadge fires on every card because `sourceName` and `sourceTier` are never hydrated by the RPC fetchers used by /market. Every card shows the "SOURCE PENDING" or "Unsourced" fallback.

**Verdict.** Partially delivers a list of items the page calls market-relevant. The source-classification machinery that would tell an operator a vendor's sustainability platform card is not the same trust weight as a CARB rule is built but not wired to this surface. The "cost of inaction" framing has no structured representation in the data layer the page reads.

### Operations

**Operator intent (brief).** "Hire vs. automate, regional cost intelligence, infrastructure decisions."

**Reality.**
- The page filter pulls `r.type === "regional_data" OR r.domain === 3` for the Jurisdiction tab and `r.domain === 6` for Facility, totaling 70 rows.
- 100% of regional_data rows have empty `tags[]`. The chip-grid taxonomy that the page is built around is derived by regex on title + note text via `inferChipKey` (`OperationsPage.tsx:90-96`), not by reading the structured `compliance_object_tags` and `operational_scenario_tags` arrays the worker actually populates.
- 18% of regional_data rows have populated category, what_is_it, key_data. The remaining 82% trigger the ComingSoonBanner ("Operations data points (solar, electricity, labor, EV charging, green building) for this jurisdiction will populate here as the source monitoring system ingests them"), which is the dominant detail-area content on the page.
- The "hire vs automate" and "infrastructure decisions" promises are not surfaced anywhere. No automation/labor cost field. No facility cost field. Facility tab has 4 rows total.

**Verdict.** Page shape is correct for its intent; data infrastructure to populate it is not yet built. Of 66 regional_data items, the page can populate at most 12 with the structured fields the chip grid expects. The structured tag arrays the worker writes (region_tags, topic_tags, compliance_object_tags, operational_scenario_tags, vertical_tags) are not in any RPC projection. Adding a real regional_data item with full structured tags would not light up any chip on the current page. The fix is the Section 6.2 (source registry curation), Section 6.3 (classification), and Section 6.5 (structured fact extraction) work, applied to operations-domain sources.

### Cross-page assessment

| Page | Operator intent | What page actually delivers |
|---|---|---|
| /regulations | Binding obligations with cost and action | Item directory of mostly-not-regulations with 0% structured cost data and 0% structured ownership |
| /research | Emerging research with credibility and horizon | List of all items with one mocked coverage matrix and a primary CTA pointing to an empty bucket |
| /market | Competitor moves with cost-of-inaction | List of mixed-tier items with no source credibility surfaced and no cost-of-inaction structure |
| /operations | Regional cost decisions for capex and hiring | List of mostly-empty regional rows with chip taxonomy derived from title text, dominated by Coming Soon banners |

No page meets its stated intent today. /regulations and /operations fail across all dimensions. /research and /market partially deliver core list functionality and fail on the analytical surfaces that distinguish them from a list of items. All four pages are correctly designed; none of them have the data engineering infrastructure beneath them to deliver as designed.

---

## 3. Structural failures

These are the failures that produce the symptomatic bugs surfaced over the past several days. Each is structural in the sense that no per-bug fix removes the underlying generator.

### S1. The detail-page is single-purpose

There is exactly one intelligence detail-page route in the entire app: `/regulations/[slug]/page.tsx`. Every card-click in 16 components across the codebase plus one `router.push` in DashboardHero hardcodes `/regulations/${id}` regardless of item_type. The detail page itself hardcodes the masthead eyebrow as "Regulations · {jurisLabel}" with no item-type branching. A vendor tool clicked from /market, an academic paper clicked from /research, and a California tariff datum clicked from /operations all render on a page that frames itself as a regulation. PR #100 (Phase 1 routing, currently flag-gated and default-off) addresses list-page filter overlap on the three forward-looking pages but does not change the detail-page situation. The four list-page facades sit on top of one detail-page system.

### S2. Routing is item_type+domain on the page, not source_role at the data layer

The four list-page filters are page-side OR expressions over `item_type` and `domain`. The `domain` field is essentially binary (91% domain=1) and the default-to-1 adapter at `supabase-server.ts:494` makes every NULL/0-domain row collide into /regulations. The downstream effect is the routing failures the operator surfaced today (EcoVadis on /market, IIC typed as regulation, CARB regulation cross-listed on /market, every misc category landing on /regulations). PR #100 shifts to source_role-keyed RPCs but leaves /regulations untouched, so /regulations continues to sweep in the 438 non-regulation rows even after Phase 1 ships.

### S3. The schema-renderer contract is broken at the column level

The renderer reads columns that do not exist (`penalty_range`, `cost_mechanism`, `enforcement_body`, `legal_instrument`, `last_verified_date`, `action_owner`, `authority_level`). The renderer reads columns that no writer populates (`compliance_deadline`, `next_review_date`). The renderer reads structured tag arrays that no RPC projects (`region_tags`, `topic_tags`, `compliance_object_tags`, `operational_scenario_tags`, `vertical_tags`). At each of these joints, the rendered output is a placeholder ("No structured penalty data on file," "Unassigned," "Coming soon") that fires on the majority of rows. The placeholders are not the bug; they are the visible symptom of a data contract that was specified at the type level and the component level but never wired through the schema and the writer.

### S4. The 5-axis source classification framework is invisible to the operator

15 columns added by migrations 063 and 067 are read by zero of the four page-data fetchers. `Resource` type carries no field for `sourceRole`, `classificationConfidence`, `classificationRationale`, `expectedOutput`. The CONFIDENCE filter chip on /regulations reads `Resource.authorityLevel` which the mapper never sets, so every item collapses into "Unclassified" and the chip is dead UI. The SourceProvenanceBadge reads from a store hydrated only by /admin and silently returns null on the four operator-facing pages. The pills that look like authoritative classification (REGULATION, GUIDANCE, IMMEDIATE) derive from the LLM-classified `item_type` and `priority`, not from source role or tier. 28% of sources are bulk-defaulted with rationale "tier N default" and 27.6% are LOW confidence; the operator sees no LOW-confidence indicator anywhere. Lithuanian Parliament, Slovenian Parliament, Arkansas General Assembly, Cortes Generales (Spain) all render as standard REGULATION cards with no visible flag that the source classification was a tier-default guess.

### S5. Three writer populations collide in the same column

`summary` is written by three independent processes:
1. Haiku 4.5 cold-start classifier with a 10-line prompt that has no integrity rule, no normalization rule, no source-grounding requirement, and no length floor. This writer produces 4-word summaries ("Tracks China's carbon policy trajectory") and emits unverified specifics (UK SECR Scope 3 freight mandate which does not exist in real SECR; China Environmental Code passage date; Singapore Green Finance dates) with the same authoritative tone as legitimate sourced summaries.
2. Manual seed scripts (`supabase/seed/*.mjs`) with operator-authored TLDR/action-list templates ("X. ACTION NOW: ... Owner: Sustainability + Operations.").
3. Legacy "Pre-tracking historical record. Superseded before continuous..." placeholders.

The dashboard surface does not distinguish which writer produced which row. Operators see two-to-three voices in the same column. The Haiku writer's content errors render with the same visual weight as the operator-vetted seed summaries.

### S6. The B.2 contract is enforced on one writer path, bypassed by all others

The Sonnet 4.6 agent at `/api/agent/run` enforces the locked severity-to-priority mapping at parse time via `parse-output.ts:258-263`. Three other writer paths bypass it:
- The staged_updates materializer writes priority directly without computing severity.
- Pre-B.2 legacy rows that existed before the locked mapping (164 rows seeded as "medium" per migration 018, 162 of which have never been regenerated).
- Direct admin SQL (cannot be ruled out).

Result: 209 of 614 rows with severity violate the lock (66% agreement). The dashboard counters that read `urgency_tier` and the kanban that orders by `priority` are running on un-validated data. A MONITORING-severity item can rank as HIGH-priority because the priority column was set independently.

### S7. Three vocabularies for source classification on the sources table

`scope_topics` (framework 063), `topic_tags` (community 007), `intelligence_types` (original 004) coexist on the same table. Of 282 sources where two are populated, **0 are equal** (different vocabularies entirely). `scope_modes` vs `transport_modes`: 29% agreement on 334 dual-populated rows. `scope_verticals` vs `vertical_tags`: 0% agreement on 9 dual-populated rows. The shared `_workspace_active_items` RPC and the new `get_market_intel/research/operations_items` RPCs filter on `source_role` not on these tag columns, so divergence has no current read-path consequence, but every UI surface that groups sources by topic, mode, or vertical will produce inconsistent groupings depending on which column it picks up.

### S8. Two competing tier semantics share the same tier column

Migration 063 introduces a 5-axis framework with default tiers per source_role (vendor_corporate T6, intergovernmental_body T2, academic_research T3). The legacy `types/source.ts` defines a parallel 7-tier "trust" hierarchy (T3 = "Intergovernmental Body," T4 = "Expert Analysis," T6 = "Crowd-Sourced"). Live data follows the legacy semantics: vendor_corporate sources are T3-T5 (not T6), intergovernmental_body is T3 (not T2), NREL is T4 (not T3). Two contradictory tier systems share the same numeric column. Any rendering that interprets tier-as-authority gets a different answer depending on which definition it picked up at write time.

### S9. Source URL is the operational join key, not source_id

`/api/agent/run` step 4 (`route.ts:380`) re-locates existing items by `source_url` only, not by `source_id`. An item whose `sources.url` is the parent portal but `intelligence_items.source_url` is a deep link is keyed off the deep URL. If the deep URL ever changes, the item is orphaned even though its `source_id` FK still resolves. 30 of 614 items (5%) currently disagree between source_id and source_url after normalization. The schema-typed FK is not the operational identity.

### S10. Modern relational tables are populated only by migration 010 backfill

`item_timelines` (107 rows), `item_changelog` (9), `item_disputes` (7), `item_cross_references` (49), `item_supersessions` (5) are all populated exclusively by the migration 010 backfill of legacy data. No current writer code path inserts into these tables. The "rich relational" data model the renderer reads from is a frozen 2026-04 snapshot. New items added after 010 do not get timeline rows, do not get changelog entries, do not get supersession links.

### S11. Multi-tenancy is schema-only

Production has 1 organization (Dietl/Rockit, seeded by hand), 1 user, 1 row in workspace_item_overrides (an archived item), 0 rows in briefings, 0 rows in user_watchlist. No workspace creation flow, no switcher, no member management. UserProfilePage's "Organization," "Members & roles," and "Billing & plan" tabs all render "Coming soon — Phase D." The RLS policies are correctly written; the table partitioning is correct; the runtime is single-tenant. The seven page RPCs are SECURITY DEFINER and accept any `p_org_id` without checking `auth.uid()` membership in the org, which is a soft confidentiality leak (workspace_notes and workspace_tags would leak cross-org via `get_workspace_intelligence`) waiting for a second tenant to exist.

### S12. Sector is a concept with four configuration UIs

Four UIs configure sector profile: `/onboarding` writes to `workspace_settings.sector_profile`, `/admin` writes to `workspace_settings.sector_profile`, `/profile` writes to `user_profiles.sectors`, `/settings DashboardSettings.SectorProfileSection` writes to nothing persistent (Zustand only, vanishes on reload). AuthProvider reads `user_profiles.sectors` and pushes it into `workspaceStore.sectorProfile`, so the value the UI uses is the per-user value, not the per-workspace value. The two stores can drift. Server-side has zero sector filtering: the seven page RPCs accept only `p_org_id`. None take a sector parameter. The `_workspace_active_items` shared scope function projects `verticals` and `vertical_tags` but its WHERE clause has no verticals predicate. Even if a workspace correctly declares its sectors, every rendering layer ignores the declaration and returns the full unfiltered set.

### S13. Lead time is an unrealized concept

The brief calls lead time the competitive frame. `sources.avg_lead_time_days` and `sources.lead_time_samples` columns exist; `lib/trust.ts:144-174` reads them in the timeliness component of the trust score. **0 of 794 sources have ever recorded a lead-time sample.** Every source therefore receives the neutral 10/20 timeliness score. No item-level lead-time field exists. No UI affordance shows "we caught this N days before X." Of 23 regulations with `entry_into_force` populated, **all 23 were ingested AFTER the regulation took effect, by an average of 779 days**. The product is operating as a historical regulation catalog with no early-warning capability.

### S14. Vertical and mode priority are not enforced anywhere

95.5% of items have empty `verticals[]`. The brief's HIGH verticals (live-events, fine-art, luxury-goods, film-tv, automotive, humanitarian) cover 13 items between them. 71.4% of items have empty `transport_modes[]`. Mode distribution skews ocean (145), road (138), air (106), rail (15), the opposite of brief's air-primary intent. No code in `src/lib` or `src/components` enforces an air-first sort. The 28-chip sector filter operates on regex against `r.title + r.note + r.tags + r.whatIsIt + r.whyMatters`, not on the structured `verticals[]` array. The brief's HIGH/MEDIUM weighting is not encoded in any priority table. The operator cannot see content prioritized by their portfolio mix because the surfacing layer doesn't know about the portfolio mix at all.

### S15. Integrity non-negotiables are violated at the card surface, not in the brief

The Sonnet 4.6 prompt at `system-prompt.ts` is 380 lines and enforces the integrity rules (research-gap labeling, "Legal Confirmation Required" markers, sourced inline citations on 165/169 sampled briefs). The dashboard does not surface `full_brief`. It surfaces `summary`, `what_is_it`, `why_matters`, and the priority/severity pills. Per-claim citations live in `full_brief`; the card surface strips them. **100% of multi-claim card summaries lack per-claim attribution.** Legal-counsel caveats live in `full_brief`; the card surface omits them. **61.6% of regulation/directive/standard rows have no caveat anywhere; 31.3% issue imperative obligation language ("operators must," "ACTION NOW," "Owner:") in the visible summary without any "Legal Confirmation Required" caveat at that surface.** 15.5% of sampled rows carry specific numbers, dates, or dollar figures with no inline source and an empty `sources_used`. The integrity contract is enforced in the layer the operator does not read.

---

## 4. Symptomatic failures

These are visible bugs that flow from the structural failures above. They are not the root problems. Listing them here makes the structural-vs-symptomatic distinction concrete.

| Symptom | Structural source |
|---|---|
| EcoVadis SaaS surfacing on /market POLICY ACCELERATION SIGNALS | S2, S4 (no source-role-keyed routing; classification not surfaced) |
| IIC professional society typed as regulation | S5 (Haiku classifier with no integrity rule), S2 (no item_type validation against source_role) |
| CARB regulation cross-listed on /market | S2 (domain==2 sweep; no source_role gating on PolicySignals) |
| Empty Timeline tab on regulation detail page | S10 (item_timelines populated only from 2026-04 backfill) |
| Empty Penalty calculator on every regulation detail page | S3 (penalty columns referenced by renderer do not exist in schema) |
| "Unassigned" owner on every detail page | S3 (action_owner column does not exist; no writer would populate it if it did) |
| En-dash in CARB summary (§§2015–2015.6) | S5 (operator-authored seed script with no normalization discipline; writer prompts have no character-normalization rule either) |
| Dashboard masthead reads "644 regulations tracked" | S2 (page reads workspace total, not regulation count) |
| Vendor card detail page reads "Regulations · Global" | S1 (single detail-page route hardcodes regulation framing) |
| Coverage matrix on /research is hand-coded | S3 (no source registry rollup endpoint; column on Resource never wired) |
| "Active review" tile on /research has 0 items | S5/S6 (pipeline_stage NULL on 71% of items, primary CTA points to empty bucket) |
| "Coming Soon" banner dominates /operations regions | S3 (chip taxonomy derived from regex on text instead of structured tag arrays the worker populates) |
| "Source pending" / "Unsourced" badge on every /market card | S4 (sourceName not hydrated by RPC fetchers; SourceProvenanceBadge reads empty store) |
| 209 rows with severity-priority mismatch | S6 (B.2 contract enforced only at agent parse time, not at materializer or seed paths) |
| 75% of /regulations items are not regulations | S2 (domain default-to-1 adapter sweeps everything in) |

The symptom list will keep growing as long as the structural failures persist. Each individual fix removes one card from the deck without changing the deck.

---

## 5. Live-site cross-validation (Chrome UX audit)

A parallel audit was conducted on 2026-05-15 by an independent agent browsing the production site at carosledge.com, with no access to the code or database. That audit cross-validates the structural failures above with operator-visible evidence and adds findings the code/data audit could not see from inside the repo. Its full text is on file. The distinct contributions are summarized here.

### 5.1 New findings the code/data audit did not surface

**Counter math is broken on the page itself.** Three different "items tracked" totals on /regulations (header 643, in-page counter 643 tracked, secondary counter 585 of 586 platform). On /market, "WATCH THIS WEEK — 28 alerts" sidebar header contradicts the "0 Watch" card directly above it (the 28 is the Elevated count borrowed without relabeling). On /operations, the bucket cards count to 70 (0+10+7+53) when the page header says 68 in scope; Coverage card says 43 jurisdictions while the page header says 82.

**Schema field names and pipeline component names leak into operator copy.** PenaltyCalculatorPanel renders "When the ingestion worker populates penalty_range / cost_mechanism / enforcement_body, the schedule will appear here." Market Intel KEY METRICS block renders "once intelligence_items.market_data is populated." Operations renders "Coming soon — Phase D." Affected Lanes renders "Lane-pair, volume, and origin/destination data not yet in schema." This is developer-facing copy reaching the operator surface. The integrity cost compounds: an operator reading these placeholders learns the names of incomplete pipeline components, which is the opposite signal the brief is meant to send.

**Admin chrome bleeding into operator chrome.** User menu shows "404 admin items need attention" to all users.

**Mode and jurisdiction field semantics are corrupted, not just sparse.** The Norway fjords item (correctly classified item_type=regulation, real CARB-grade content) renders Mode = "GLOBAL" and Jurisdiction = "MINISTRY OF CLIMATE AND ENVIRONMENT" on the AffectedLanesCard. The exposure narrative literally renders "applies to global freight in MINISTRY OF CLIMATE AND ENVIRONMENT." Mode field is being used as both a transport-mode and a fallback "global" sentinel. Jurisdiction field is being populated with agency names where country names belong, with continents (AFRICA) where countries belong, with municipalities (ALBUQUERQUE, ARBOLETES) where regions belong. The two filter axes the operator most needs to compare across are the two most corrupted.

**Compliance Obligation scoring is semantically backward in some cases.** The Trump EPA endangerment-finding repeal item scores 3/3 High on Compliance Obligation. A repeal removes federal regulatory authority. The score is measuring the wrong direction.

### 5.2 Off-domain items in the registry, by name

The Chrome audit named specific items the code audit could only describe as a class. Capturing them here as evidence:

In the /regulations Awareness column (should not be there, per brief: "vendor SaaS platforms, professional society guidance documents (unless they have legal force), market analysis... do NOT belong"):
- EcoVadis Enterprise Sustainability Intelligence and Ratings Platform Overview (vendor SaaS)
- EcoVadis 2025 Purpose Report (vendor report)
- BREEAM V7 (voluntary certification framework)
- Gallery Climate Coalition (voluntary industry initiative)
- EIA Spot Prices for Crude Oil — Monthly Data (price data, belongs in Operations or Market Intel)
- NJEDA Opens Multiple Business Support Programs (a grant program, not a regulation)
- Active Vehicle Module (AVM) Search Tool (a database tool)
- International Institute for Conservation — Professional Guidance
- American Alliance of Museums — Professional Resources
- ICOM-CC 2026 Conference and Membership Information
- Financial Conduct Authority – Main Portal and Regulatory Resources (a portal, not a specific instrument)
- The Decarb Hub: Industry Initiative for Sustainable Shipping Decarbonization (industry voluntary)
- Major Corporate and Institutional Renewable Energy Investments Signal (the title literally calls itself a signal)

In the /research Draft pipeline (should not be there, per brief: "peer-reviewed studies, industry-academic research collaborations, credible white papers"):
- Czech Chamber of Deputies parliamentary portal
- VARAM Official Portal (Latvia environment ministry)
- Matrix Hudson Unit Lottery Opening — 2BR Affordable Rental at 80% AMI in Boston (an affordable-housing lottery)
- Tweede Kamer COVID-19 Rules for Parliamentary Operations

In the dashboard /What changed feed (should be filtered to freight-relevance; tagged "NEW · CRITICAL" with no scoring):
- EU AI Act (Reg 2023/1804)
- EU Digital Markets proposal COM(2023)441
- NYC Council vs. Mayor ICE-on-Rikers lawsuit
- Estonian Riigikogu fuel-price session agenda
- Luxembourg multi-sector strategy
- Lei nº 12.305/2010 (Brazilian solid waste)
- UK private rented property MEES landlord guidance

In Market Intel watchlist (should not be there, both are scrape-pipeline exhaust):
- Naturvårdsverket Cookie and Data Processing Policy (a cookie banner page)
- SSO AGC Singapore Service Availability — CloudFront 403 Error (an HTTP 403 from a failed scrape, ingested as a tracked object)

In /operations under AFRICA jurisdiction (should not be there at all):
- GEF Leadership and Organizational Structure (staff biographies for the Global Environment Facility, framed as regional operations data)

These are concrete instances of the structural failures S1, S2, S5, and S6 in operator-visible form. Each one is a "this should never have been ingested or should never have been routed here" event. Together they make the registry untrustworthy at the per-item level, even where the surrounding chrome is correct.

### 5.3 Three deep-dive case studies (preserved)

**Norway zero-emission fjords (Immediate, Critical).** Summary correctly states "from January 1, 2025" and "by January 1, 2032." Timeline tab returns "No timeline milestones recorded yet." Penalty calculator returns the schema-field-name placeholder. Sources tab shows a single bare URL to regjeringen.no with no tier label, no fetch date, no document title, no cited section. Affected Lanes shows Mode = "GLOBAL" (wrong, ocean), Jurisdiction = "MINISTRY OF CLIMATE AND ENVIRONMENT" (wrong, Norway). Exposure narrative reads "applies to global freight in MINISTRY OF CLIMATE AND ENVIRONMENT" — a structural data-shape failure leaking into operator-facing prose. This is the cleanest demonstration of how multiple structural failures (S3, S4, S15, plus mode/jurisdiction corruption) compound on a single high-priority item.

**EcoVadis Enterprise Sustainability Intelligence and Ratings Platform Overview.** Lives in /regulations Monitor 6-12 mo column. Detail page badge "TOOL · 6-12 MO," pre-title "REGULATIONS · DE," breadcrumb "← Regulations." Summary is vendor marketing copy ("150,000+ rated companies, €1.7 trillion in business spend"). Cost Impact 0/3, Compliance Obligation 0/3. Internally consistent rendering of an item that should never have entered the regulations registry. This is S2 made concrete on a single item that operator can name.

**Trump Administration Repeals EPA Endangerment Finding; California Announces Legal Challenge.** Flagged on dashboard top-priority and as IMMEDIATE / REGULATION. This is a news event about a regulatory rollback plus an announced legal challenge, not a binding instrument with a compliance deadline. Compliance Obligation scored 3/3 High, semantically backwards (the action removes federal regulatory authority). Summary asserts the repeal "eliminating federal authority to regulate" without qualifying that endangerment-finding repeals are typically subject to APA review and have historically been enjoined. This is the integrity non-negotiable #1 violation in the most consequential possible form: a politically charged news event presented as binding regulatory fact, with backwards scoring, on the dashboard's top-priority surface.

### 5.4 Cross-page item framing failure (the strongest single finding)

The Chrome audit observed the same underlying item appearing on multiple pages with identical chrome. Examples:

- FCA Main Portal appears in /regulations Awareness column (badged "GUIDANCE"), in /research Draft pipeline (badged "DRAFT"), and the detail page is identical regardless of entry point.
- IIC appears in /regulations Awareness AND /research Draft.
- ESMA MiCA, European Banking Authority, Financial Conduct Authority all appear in both /regulations Awareness and /research Draft.
- California Advanced Clean Fleets Rule (CARB) appears as a market signal on /market under POLICY ACCELERATION SIGNALS and presumably also exists as a regulation; the framing does not change for the audience.
- Norway fjords and EPA Phase 3 appear on Dashboard top-priority, Dashboard "what changed," and /regulations Immediate.

The same content body is shown with different chrome wrappers depending on entry point. The brief's lead-time competitive frame would be implemented as: "on /regulations, this is `effective Jan 1, 2025; ocean-mode; penalty TBD`; on /market (if it appears there as a signal), this is `Norway moves first on fjord ZE — competitive signal for cruise/luxury maritime peers operating in Nordic waters`; on /operations, this is `shore-power infrastructure requirement at Norwegian heritage-fjord ports`." Today the same summary is rendered with different page chrome but identical content. The four-page architecture exists in navigation; it does not exist in content framing.

This single failure (cross-page-framing-doesn't-vary) is what the operator means when they describe the system as "scraping data and writing summaries that don't connect the intent of the site." The data is in there. The page-purpose framing is not applied at render time. This sits inside structural failure S1 (single detail-page route) but is even more visible on the list pages, where the same item literally appears twice with two different lifecycle pills.

### 5.5 Cross-reference between Chrome findings and structural failures

| Chrome finding | Structural source from Section 3 |
|---|---|
| EcoVadis, IIC, BREEAM, Gallery Climate Coalition in /regulations | S2, S5 (routing + Haiku classifier without integrity rule) |
| Boston housing lottery in /research, GEF biographies in /operations | S2, S5 |
| EU AI Act, NYC ICE lawsuit in dashboard /What changed | S2 (no freight-scope filter at ingest) |
| Cookie banner and HTTP 403 in /market watchlist | S5 (scrape pipeline ingests every fetched page including failures) |
| Counter math mismatches across /regulations | S2 (default-to-1 adapter creates two counts), surfacing inconsistency |
| "0 Watch" vs "28 alerts" on /market | S5/S6 (priority/urgency_tier coupling) plus copy-template bug |
| Schema field names leaking into operator copy | S3 (placeholders implemented as developer-facing diagnostics, never replaced with operator copy) |
| Admin "404 items need attention" leaking | S11 (single-tenant; admin chrome bleeds into operator) |
| Mode = GLOBAL on Norway fjord regulation | S3 + S5 (mode field has no validator; writer uses GLOBAL as a sentinel) |
| Jurisdiction = MINISTRY OF CLIMATE AND ENVIRONMENT | S3 + S5 (jurisdiction field overloaded with agency names) |
| Continents and cities on /operations By Jurisdiction tab | S2 + S3 (no jurisdiction-grain enforcement) |
| Compliance Obligation 3/3 for repeal item | S5 + S15 (Haiku-classified scoring with no integrity check) |
| Same item, four labels (DRAFT, AWARENESS, GUIDANCE, REGULATIONS) | S1 + S4 (no canonical type; pills are page-derived) |
| "WATCH THIS WEEK 28 alerts" sidebar | S6 (LIFECYCLE label collapses priority semantics) |
| Single bare source URL with no tier, no date | S4 (5-axis classification not surfaced) |
| Empty Timeline tab on Norway fjords | S10 (item_timelines populated only by 2026-04 backfill) |
| "Coming soon — Phase D" placeholders dominate /operations | S3 (chip taxonomy regex on text vs structured tag arrays) |
| Cross-page same-item-different-chrome | S1 (single detail-page route) + S5 (no per-page framing layer) |

Every Chrome finding maps cleanly to one or more structural failures in Section 3. No new structural failures were discovered, but the Chrome audit elevates the relative impact of three failures the code audit ranked lower:

- S3 (schema-renderer contract) is more operator-damaging than the code audit conveyed, because the placeholders themselves leak schema field names into operator chrome, which is worse than a blank state.
- S5 (writer collision) is more operator-damaging than the code audit conveyed, because the resulting off-domain items in the registry are visible by name and are the kind of thing an operator notices on first encounter (cookie banners, HTTP errors, parliamentary procedure agendas).
- S2 (routing) is more operator-damaging than the code audit conveyed, because cross-page same-item-different-chrome is the visible manifestation of the architecture being aspirational. The operator's exact words ("we have a system that's pulling bits of information and not connecting the dots between pages") describe S2 specifically.

### 5.6 The Chrome audit's UX fix priorities, mapped to the data infrastructure work

The Chrome audit ranked five (plus one) UX fixes by operator-decision impact. Mapped to the data engineering layers in Section 6:

1. **Type-aware routing and detail templates** → addresses S1 + S2. Implemented by Section 6.1 (master data and entity resolution) plus Section 6.9 (per-surface framing). Chrome calls this the single biggest credibility problem.
2. **Hide or rewrite developer-facing placeholders** → addresses S3 at the operator-copy layer. Implemented by Section 6.5 (structured fact extraction so the columns exist and populate) plus a copy pass to replace developer-language placeholders with operator-language ones.
3. **Repopulate /research with the right items** → addresses S2 (routing) at the per-page level. Implemented by Section 6.2 (source registry curation, including ingesting the academic and white-paper sources that should feed /research) and Section 6.3 (deterministic source-role-keyed routing). The page is correctly designed; it needs the right items routed to it.
4. **Cross-page item framing** → addresses S1 (single detail-page route) at the content-framing layer. Implemented by Section 6.9 (per-surface framing as a derived view).
5. **Source tier visible at every claim** → addresses S4. Implemented by Section 6.10 (operator-facing data quality affordances) and reading through the existing classification columns the page-data fetchers currently ignore.
6. **Mode and jurisdiction field cleanup** → addresses S3 (data-shape) at the most operator-visible field pair. Implemented by Section 6.1 (master data: canonical jurisdictions and transport_modes entity tables) and Section 6.5 (structured fact extraction with validation).

The Chrome audit's verdict: the gap between the current state and a defensible v1 is concentrated in routing, in placeholder hygiene, in repopulating /research with the right sources, and in mode/jurisdiction data-shape. /operations is furthest from delivery; it needs the source registry curation work in Section 6.2 to bring in the regional cost data the page is designed to display, and the structured fact extraction work in Section 6.5 to populate the chip taxonomy from real columns rather than regex-on-text. The page is correctly designed; the data infrastructure beneath it is not yet built.

---

## 6. Data engineering infrastructure specification

The four-page architecture is the design. It is the correct shape for a freight sustainability intelligence product serving a Director of Environmental Affairs at a freight forwarder. The pages are not under audit. The infrastructure that fails to support them is.

This section specifies what the data engineering infrastructure must look like for the four-page architecture to deliver as designed. It is grounded in patterns proven by Bloomberg, Refinitiv (London Stock Exchange Group), Thomson Reuters Regulatory Intelligence, S&P Capital IQ, Sustainalytics, MSCI ESG, Compliance.ai, and the regulatory-event vendors that serve global enterprise compliance teams. The intent is to adopt the proven wheel and build a better product on top of it, not to reinvent.

Caro's Ledge today does not have these infrastructure layers. It has a scrape-classify-store pipeline writing into a single intelligence_items table whose typed columns are partially populated, partially phantom, and partially read by surfaces that ignore the typing. Closing the gap to the brief requires the layers below.

### 6.1 Master data and entity resolution

**What major platforms do.** Every regulation, organization, jurisdiction, transport mode, vertical, and event in Bloomberg / Refinitiv / Thomson Reuters has a canonical entity ID (Refinitiv calls them PermIDs; Bloomberg uses BBGIDs; LSEG uses RICs and PermIDs). Multiple URLs, aliases, citations, and document versions resolve to the same entity. The entity is the unit of versioning, the unit of cross-reference, and the unit of permissioning. New ingestion attaches to existing entities through entity-resolution pipelines (rule-based plus ML disambiguation); it does not create duplicates.

**What Caro's Ledge has today.** intelligence_items.id is a per-row UUID. There is no canonical entity layer. The same regulation can be ingested twice from two URLs and become two rows. The same source can have multiple entries (the EcoVadis case: 5 source rows for one company). Cross-references are at the row level, so when a row is regenerated it loses or duplicates its links. Migration 010's `item_cross_references` table is populated only by a 2026-04 backfill; current writers do not maintain it.

**What Caro's Ledge needs.**
- A `regulations` entity table separate from intelligence_items. Each entity has a canonical ID, a canonical title, the issuing authority, the legal instrument citation, and a relationship to its current and historical versions.
- An `organizations` entity table separate from sources. EcoVadis-the-company is one entity; EcoVadis press releases, EcoVadis blog, EcoVadis platform documentation are sources owned by that entity.
- A `jurisdictions` entity table with canonical IDs, ISO codes, hierarchy (US-CA is child of US, which is child of NORTH-AMERICA), and aliases (so "California" and "CA" and "US-CA" all resolve to the same entity).
- A `transport_modes` entity table (small: air, road, ocean, rail, plus a few hybrid modes) with canonical IDs and disallowed sentinel values (no "GLOBAL" as a mode).
- A `verticals` entity table matching the brief's taxonomy with canonical IDs and operator-readable labels.
- An `events` entity table for announcements, publications, effective dates, enforcement actions, revisions, and supersession events. Every dated fact lives here, not in free-text inside a brief.
- An entity-resolution pipeline at ingest: every new scrape is matched against existing entities by URL, by title-normalized hash, by jurisdiction+citation pair. Matches attach; non-matches create new entities flagged for human review.

This layer alone removes the EcoVadis-class duplication, the IIC-class miscategorization (because IIC-the-organization is recognized at ingest as a learned society, not a regulator), and the cross-page same-item-different-chrome problem (because the entity is canonical regardless of which page surfaces it).

### 6.2 Source registry as a curated product

**What major platforms do.** Refinitiv's source registry, S&P Capital IQ's data lineage, and Thomson Reuters Westlaw's source catalog are first-class data products with their own product managers and SLAs. Each source has: canonical ID, owning organization, content typology (what kinds of items come from this source), publication frequency, historical reliability score, last-verified date, escalation contact when the source fails. New sources go through onboarding with structured classification before they ingest a single row. Deprecated sources are archived with provenance preserved for items that came from them. Sources have quality SLAs: "tier 1 sources have 99% classification correctness over 90 days; tier 5 sources have 80%."

**What Caro's Ledge has today.** 794 sources in a flat sources table. 28% bulk-defaulted with rationale "tier N default." 27.6% LOW confidence. 20 unclassified sources at T7. Three competing vocabularies (scope_topics / topic_tags / intelligence_types) with 0% agreement on dual-populated rows. Two competing tier semantics (legacy 7-tier from types/source.ts vs migration 063 framework). No SLA. No publication frequency tracking. No content typology beyond a free-text scope. No source-onboarding workflow (sources are added by scraper paths and bulk-defaulted to a tier on creation).

**What Caro's Ledge needs.**
- A source-onboarding workflow. New sources are reviewed (human or human-confirmed-LLM) before they ingest. Classification is non-default: source_role, tier, jurisdictions, scope_topics, scope_modes, scope_verticals are explicitly assigned with rationale.
- One canonical vocabulary per dimension. Pick scope_topics as the canonical topic vocabulary; deprecate topic_tags and intelligence_types or remove them. Same for modes and verticals. Enforce with CHECK constraints or triggers.
- One canonical tier system. Pick the migration 063 framework as canonical (vendor_corporate T6, intergovernmental_body T2, etc.). Migrate the 794 sources to this system. Remove the legacy 7-tier definition from types/source.ts. Code that reads `tier` reads it under one definition.
- Source content typology. Each source declares: "this source produces regulations" or "this source produces market signals" or "this source produces vendor announcements." Items typed differently than what the source produces get flagged at write time, not silently accepted (this is the IIC case fixed at the source, not at the item).
- Source reliability scoring. Track when a source's items are reclassified after ingest, when its content is contradicted by a higher-tier source, when its scrape fails. Surface as a per-source quality score in the source registry. Use it to decide which sources to deprecate.
- Source ownership tree. Sources roll up to organizations (the entity from 6.1). The ownership tree makes "all EU institutional sources" a queryable concept, not a regex over scope_jurisdictions.

### 6.3 Content typology with deterministic + LLM hybrid classification

**What major platforms do.** Compliance.ai, Thomson Reuters Regulatory Intelligence, and Sustainalytics use a hybrid classification stack: deterministic rules where possible (source_role + URL pattern + content features → item_type, with a published rule table the operator can audit), LLM classification for the residual, human review for low-confidence cases. Classification confidence is a structured value tied to which classifier path produced it (deterministic = confidence 1.0, LLM-high = 0.85, LLM-low + human-confirmed = 0.95, LLM-low + un-confirmed = 0.4). Items with confidence below a threshold are not surfaced to operators; they enter a queue.

**What Caro's Ledge has today.** A 10-line Haiku classifier prompt that produces title and summary with no confidence score, no source-grounding requirement, no length floor, no integrity rule. The output is written directly to intelligence_items with no review queue. Misclassifications (IIC as regulation, EcoVadis as statistical_data_agency) reach operators on first ingest.

**What Caro's Ledge needs.**
- A deterministic classification layer. Source-role + content-feature rules produce most item_type assignments without LLM involvement. EcoVadis is vendor_corporate → vendor product page URL pattern → item_type=tool. IIC is industry_association → conservation-society URL pattern → item_type=guidance (not regulation). CARB regulation has source_role=primary_legal_authority → CFR citation present → item_type=regulation.
- An LLM classifier for the residual, with structured confidence output. The LLM proposes item_type, jurisdiction, mode, vertical, and severity with per-field confidence. Output schema enforced at parse time.
- A human review queue for low-confidence classifications. The operator (or a designated analyst) confirms or corrects. Confirmation upgrades the confidence score and feeds back into the deterministic layer (rule learning).
- A quarantine state. Items below confidence threshold do not surface on /regulations, /research, /market, /operations until reviewed. They live in a queue that an analyst works through. Operators do not see speculative classifications.
- Classification audit log. Every classification has provenance: which classifier, which rules fired, what confidence, who confirmed, when. Visible in the admin chrome, not just in the database.

### 6.4 Knowledge graph layer

**What major platforms do.** S&P Capital IQ's entity relationship model, Refinitiv's PermID network, and the regulatory-intelligence vendors (Compliance.ai, Westlaw Edge) maintain a knowledge graph: regulations relate to other regulations (supersedes, implements, references, conflicts with), to entities (issuing authority, affected jurisdictions, applicable industries), to events (announcement, publication, effective date, enforcement action). Cross-references are queries against the graph, not redundant writes. The graph is populated by the same writers that populate the items, plus a relationship-extraction pass that pulls cross-references out of full briefs.

**What Caro's Ledge has today.** intelligence_items.related_items UUID array (agent-emitted, not maintained), item_cross_references table (49 rows, all from migration 010 backfill, no current writer), four parallel linked_*_ids columns (linked_regulation_ids, linked_vendor_ids, linked_case_study_ids, linked_forum_thread_ids — written by no current code), `intersection_summary` JSONB column with similar duplication. Five overlapping mechanisms; one populated by a frozen backfill; the others empty. No graph query layer.

**What Caro's Ledge needs.**
- One canonical relationship store. `item_relationships` with (source_item_id, target_item_id, relationship_type, confidence, provenance). Relationship types are an enumerated vocabulary: supersedes, implements, references, conflicts_with, depends_on, amends, related_to, sector_competitor.
- Bidirectional indexing. Querying "items that reference X" is as cheap as "items X references." This unlocks the cross-page framing in 6.9.
- A relationship-extraction pass on every full_brief regeneration. The LLM is asked to identify cross-references with structured output. Confidences are stored. Above-threshold relationships auto-write; below-threshold enter a review queue.
- Entity edges. Items relate to entities (jurisdictions, organizations, modes, verticals) through typed edges, not free-text columns. "Items affecting US-CA ocean freight" becomes a graph traversal, not a regex over jurisdictions[0] || jurisdictions[1].
- Event edges. Items relate to events (announcement, effective date, enforcement, revision). Lead time (6.7) is a graph computation, not a column.

### 6.5 Structured fact extraction

**What major platforms do.** Bloomberg's filings extraction pipeline, Refinitiv's structured data products, and the regulatory-tech platforms separate three layers: the source document (raw text, immutable), the LLM-proposed structured extraction (every fact with confidence and span reference), the human-confirmed structured columns (load-bearing, used by all downstream computation). Display layer reads the confirmed columns. Confidence visible. Span-level provenance ("this date came from paragraph 3 of Annex II of the cited document, extracted on [date] by [classifier], confirmed by [analyst] on [date]") clickable from the operator's view.

**What Caro's Ledge has today.** Sonnet 4.6 writes a markdown full_brief with embedded prose dates, prose penalty figures, prose enforcement bodies. The renderer reads typed columns (compliance_deadline, penalty_range, enforcement_body, legal_instrument) that either don't exist (penalty_range, cost_mechanism, enforcement_body, legal_instrument are referenced but not in the schema) or are never populated (compliance_deadline 0/644, entry_into_force 23/644, item_timelines populated only by the migration 010 backfill). The narrative-text columns became the de facto structured store. Operators reading the page see a 3-tile penalty calculator collapsed to "No structured penalty data on file" because the structured layer is missing.

**What Caro's Ledge needs.**
- A structured-extraction pass after full_brief generation. The LLM is asked to extract: effective_date, compliance_deadline, penalty_range, cost_mechanism, enforcement_body, legal_instrument, jurisdictions, transport_modes, verticals, severity, urgency_tier — each with confidence and a span reference back to the source text.
- Schema columns for every extracted fact. The phantom-column problem (penalty_range etc.) is closed by adding the columns. No renderer reads a column the schema does not have.
- A confidence column per extracted fact. compliance_deadline has compliance_deadline_confidence. Display layer surfaces low-confidence facts with a visible indicator (a faded value, a "tentative" badge, an inline link to the analyst review queue).
- Span provenance. Every fact has a JSONB pointer to the source: source_document_id, paragraph_index, character_range. The operator clicking on a date can see the exact paragraph it was extracted from. This is the integrity non-negotiable #3 ("source traceability at every claim level") implemented as infrastructure, not as a writer-prompt aspiration.
- Human-in-loop for high-stakes facts. Penalty figures, effective dates, compliance deadlines on tier-1 regulations enter a confirmation queue. Analyst confirms before they go live on the operator surface. Confirmation upgrades confidence to 1.0.

### 6.6 Versioning and audit trail

**What major platforms do.** Westlaw's change-tracking, Bloomberg's filings revision history, S&P's rating action history. Every fact change is logged: who/when/why/what-changed-from-what. Operators can see a "this rule was amended on [date]; previously the threshold was X, now it is Y." Rollback is possible. The audit trail is operator-visible for legal-defensibility reasons (a director defending a compliance posture to legal counsel needs to show what they knew and when).

**What Caro's Ledge has today.** intelligence_item_versions table (8 rows, populated by trigger on regeneration), version_history JSONB column (populated by no writer), item_changelog table (9 rows from migration 010 backfill). Three storage shapes for the same fact, only one being kept current. No operator-visible change-tracking. A regulation amended last week looks identical in the UI to one unchanged for 3 years.

**What Caro's Ledge needs.**
- Append-only version table per entity. intelligence_item_versions retains every state the item has ever been in, with the regeneration timestamp, the writer (Haiku / Sonnet / human / migration), the diff against the prior version.
- Operator-visible change log on every detail page. "Last revised [date] · Changes: effective date moved from [X] to [Y], penalty range increased from [A] to [B]." Click to see the full version diff.
- Per-fact provenance retention. When penalty_range changes, the new value carries who/when/why; the old value is preserved with its own provenance. Operators see the lineage of a fact, not a snapshot.
- Suppress chrome on items with no changes. Items unchanged for over N days carry a "Stable as of [date]" indicator instead of a re-rendered "NEW" badge. The dashboard's "What changed" feed shows actual changes, not re-ingestions.
- Soft-delete with retention. Deprecated items are not destroyed; they are flagged and retained with a deprecation event. Audit trail survives delete.

### 6.7 Lead time as a first-class column

**What major platforms do.** Bloomberg's news desk reports lead time as a competitive metric (we got this 2 hours before Reuters). Compliance.ai reports regulatory lead time (we caught this proposed rule 6 months before the comment period closed). Refinitiv's earnings flash measures latency-to-publish in milliseconds. Lead time is a first-class operational metric, surfaced to subscribers as a value proposition, tracked internally as a quality SLA.

**What Caro's Ledge has today.** sources.avg_lead_time_days exists with 0/794 sources populated. Trust formula reads it; every source gets the neutral 10/20 timeliness score. No item-level lead-time field. Of 23 regulations with effective dates, all 23 were ingested AFTER the regulation took effect, by an average of 779 days. The product is a historical catalog with no early-warning capability and no measurement of when it became one.

**What Caro's Ledge needs.**
- A `source_publication_date` column on intelligence_items, captured at ingest. This is the date the source first published the content (extracted from the source page if possible, fallback to fetched_at).
- A `first_observed_at` column on intelligence_items, set at ingest, immutable. This is when Caro's Ledge first saw the content.
- Lead-time computations as derived columns or views. Lead-time-vs-effective-date = entry_into_force - first_observed_at. Lead-time-vs-publication = source_publication_date - first_observed_at. Both indexed and sortable.
- Operator-visible lead time on every card. "We surfaced this 6 months before it takes effect" or "Surfaced 14 days before public announcement" or "Reactive: surfaced 60 days after enforcement." Operators see the lead-time value of each item explicitly, per the brief's competitive frame.
- Lead-time as a sort and filter axis. The /regulations kanban gets a "sort by lead time" option. The /market dashboard gets an "early signals" view that filters to items surfaced before competitors' public announcements.
- Lead-time as an SLA. Per-source lead-time targets (T1 sources surface within 24h of publication, T5 sources within 7 days, etc.). Misses surface as quality-engineering work, not as silent ingestion gaps.
- Forward-looking ingestion priority. Sources publishing proposed rules, comment-period openings, draft directives are prioritized over sources publishing already-effective summaries. The 779-day-late ingestion of effective regulations is a system-design failure to fix at the source-onboarding layer.

### 6.8 Multi-tenancy with sector ranking

**What major platforms do.** Bloomberg Terminal lets a user configure their function set, watchlists, and news filters per identity, and the same Terminal instance serves an FX trader and a credit analyst with completely different surfacings of the same underlying registered data. Refinitiv's Eikon does the same. Sector ranking is not a boolean filter (show me only X); it is a relevance score factored into ranking (show me everything, ordered by relevance to my portfolio mix, with off-portfolio items still visible at the bottom for serendipity). Sector mix is workspace-level, role overlay is user-level.

**What Caro's Ledge has today.** 1 organization, 1 user, single-tenant in production. Sector configuration writes to four different stores (one of which writes to nothing). Server-side sector filtering is unwired (the seven page RPCs accept only p_org_id; none take a sector parameter). 96% of items have empty verticals[]; even the populated ones are dubiously tagged. Brief's promise "live-events shouldn't drown in fine-art" is unrealized.

**What Caro's Ledge needs.**
- One canonical sector store. workspace_settings.sector_profile is workspace-level. user_profiles.sectors is a per-user override layer ("I personally focus on the live-events portion of our workspace's portfolio"). Drift between the two is impossible by construction.
- One configuration UI for sector. Onboarding sets the workspace default; admin edits the workspace profile; profile sets the user override; settings is removed or wired correctly. No UI writes to a store that vanishes on reload.
- Server-side sector relevance scoring. The seven page RPCs take a sector_profile parameter. _workspace_active_items returns items with a `sector_relevance_score` derived from item.verticals × workspace.sector_profile (graded, not boolean: an item tagged live-events scores 1.0 for a live-events workspace, 0.5 for a film-tv workspace that frequently does live broadcasts, 0.1 for a humanitarian workspace, 0 for a workspace with neither vertical declared).
- Ranking, not filtering. Items with low sector relevance still appear, ranked lower. The operator can scroll past them. Filtering hides items entirely; ranking lets the operator see them when they want to. Bloomberg does ranking; the brief's "should not be drowning" language describes ranking, not filtering.
- Vertical-tag population at write time. The classification pipeline (6.3) emits verticals[] per item with explicit reasoning, not absence. EcoVadis is tagged with the verticals its content actually addresses (procurement-side vertical-agnostic = `["all"]`); CARB Advanced Clean Fleets is `["road-freight", "automotive"]`; SAF mandate is `["air"]`. The 96% empty rate is closed by the classification pipeline owning vertical assignment.
- Authorization on workspace-scoped RPCs. The seven SECURITY DEFINER RPCs check auth.uid() membership in p_org_id. Cross-workspace leak is impossible.

### 6.9 Cross-page framing as a derived view

**What major platforms do.** Bloomberg's news article appears on the FX desk function FXIP, the credit desk function CRED, and the equities function EQS, with different headlines, different surrounding context, and different action affordances. The underlying article is one canonical entity in their MDM (6.1); the per-surface framing is a derived view computed at render time against a per-surface narrative template. Refinitiv's Eikon does the same with company news appearing differently on the M&A surface vs the earnings surface vs the supply-chain surface. The framing is a query against the knowledge graph, not a duplicate write.

**What Caro's Ledge has today.** Same item appears on /regulations, /research, /market with identical content body. Single detail-page route hardcodes "Regulations · {jurisdiction}" eyebrow regardless of item_type. Cross-page same-item-different-chrome is the system's most operator-visible failure (the Chrome audit names this as the strongest single finding).

**What Caro's Ledge needs.**
- Per-surface framing templates. /regulations renders the regulatory frame (effective date, compliance deadline, penalty schedule, enforcement body). /market renders the same item as a competitive signal (peer adoption, cost of inaction, lead-time advantage). /research renders the same item as an emerging force (research methodology behind the rule, expected operational relevance window). /operations renders the same item as a cost reality (per-jurisdiction compliance cost, hire-vs-automate implications). Framing is a query template, not a separate row.
- Per-surface detail-page routes. /regulations/[slug], /market/[slug], /research/[slug], /operations/[slug] all exist. Each renders the canonical item under that surface's framing template. The detail page is a function of (item, surface), not a single hardcoded layout.
- Surface-aware writer pass. When an item is regenerated, the writer produces a regulatory frame AND (when applicable) a market frame AND a research frame AND an operations frame. Each frame is short (the FSI Brief 30-second test). They are stored separately and rendered per surface.
- Surface-aware navigation. Clicking an item from /market routes to /market/[slug] and renders the market frame. Clicking the same item from /regulations routes to /regulations/[slug] and renders the regulatory frame. The breadcrumb returns to where the operator came from.
- Cross-frame consistency check. When the same fact appears in multiple frames (effective date, penalty figure), the structured-extraction layer (6.5) is the source of truth and all frames render the same value. Drift between frames is impossible by construction.

### 6.10 Operator-facing data quality affordances

**What major platforms do.** Sustainalytics and MSCI ESG show their rating methodology, the data points feeding each rating, the analyst confidence per data point, and the change history. S&P's rating action surface shows the analyst, the date, the basis. Compliance.ai shows source provenance per regulatory event ("extracted from Federal Register Vol X No Y page Z, published [date], indexed [date]"). The operator does not have to trust the platform; the platform shows its work.

**What Caro's Ledge has today.** Single bare URL on Sources tab with no tier label, no fetch date, no document title, no cited section. Confidence chip on /regulations is dead UI (Resource.authorityLevel never set). Source tier framework built but invisible. Analyst attribution non-existent. Per-claim sourcing strips at the card layer.

**What Caro's Ledge needs.**
- Source tier visible on every card. The migration 063 framework (T1 primary legal authority through T7 vendor product pages) is rendered next to every source URL. Operators distinguish CARB-grade items from EcoVadis-grade items at first glance.
- Confidence visible on every claim. Every extracted fact (date, penalty, jurisdiction, mode) carries its confidence as a visual treatment (bold for human-confirmed, italic for LLM-high-confidence, faded for LLM-low-confidence). Operators know which claims to trust without reading methodology pages.
- Analyst attribution where it exists. When a fact has been confirmed by a human reviewer, the reviewer's name and confirmation date are visible on hover or click. This is the legal-defensibility pattern Westlaw uses.
- Per-claim provenance click-through. Every claim on a card surface has a source pointer. Click → see the exact paragraph of the exact source document the claim was extracted from, with the source's tier and confidence.
- "Last verified" surfaced explicitly. Each detail page shows "Information last verified [date] against [source URL]." Operators know freshness without inferring it from added_date.
- Integrity non-negotiable rendering. Regulatory inferences carry an explicit "consult legal counsel" caveat AT THE CARD SURFACE, not buried in full_brief. The card layer respects the integrity contract.

---

## 7. Reading order for fixes (priority by infrastructure dependency)

A priority order for the data engineering layers in Section 6, ordered by what unlocks what.

1. **Master data and entity resolution (Section 6.1).** Unlocks every other layer. Without canonical entities for regulations, organizations, jurisdictions, and verticals, all downstream classification, cross-reference, and framing work is built on sand. The EcoVadis and IIC miscategorizations are entity-resolution failures; the cross-page same-item-different-chrome is a missing-canonical-entity failure.

2. **Source registry as a curated product (Section 6.2).** Unlocks correct classification. Without a curated source registry with onboarding workflow, content typology, and one canonical vocabulary per dimension, the classification layer (6.3) cannot produce trustworthy item types. This is also the layer that brings in the academic and white-paper sources /research is designed to display, and the regional cost-data sources /operations is designed to display.

3. **Schema-renderer contract (Section 6.5 plus the closing of Section 6.10's phantom-column problem).** Unlocks every operator-visible decision surface. Penalty calculator, owner card, effective date tile, exposure narrative — all currently render placeholders because the columns either don't exist or aren't populated. This is the single most visible operator failure and is the layer most directly under engineering control.

4. **Type-aware routing and per-surface framing (Section 6.9).** Unlocks the four-page architecture's promise. The cross-page same-item-different-chrome failure is the operator's most damning observation about the product. Per-surface routes plus per-surface framing templates plus surface-aware writer passes close it.

5. **Structured fact extraction with confidence and provenance (Sections 6.5 + 6.10).** Unlocks the integrity non-negotiables at the card layer. Per-claim citations and confidence indicators stop the card-vs-brief integrity gap. Operator decisions become legally defensible.

6. **Knowledge graph layer (Section 6.4).** Unlocks cross-references, supersessions, lead-time computation, and the per-surface framing in 4. Currently five overlapping link mechanisms exist with frozen population; one canonical relationship store consolidates them.

7. **Lead time as a first-class column (Section 6.7).** Unlocks the brief's competitive frame. Currently the system is a 779-day-late historical catalog. Source publication date capture plus item-level lead-time computation plus operator-visible lead-time indicators turn it into the early-warning radar the brief calls for. Depends on 1, 2, 5.

8. **Multi-tenancy with sector ranking (Section 6.8).** Unlocks the brief's "live-events should not drown in fine-art" promise. Currently sector configuration writes to four stores (one of which is null), zero server-side filtering exists, and the verticals[] tagging is 96% empty. The infrastructure is built (RLS, schema, configuration UI scaffold); the wiring is not. Critical for the multi-tenant product the brief describes, even before a second tenant exists, because the routing and ranking infrastructure must be production-ready when growth lands.

9. **Versioning and audit trail (Section 6.6).** Unlocks legal defensibility and operator trust over time. Currently three storage shapes exist for change history with one populated by frozen backfill. Consolidating to one append-only version table per entity plus operator-visible change logs closes the integrity layer.

10. **Operator-facing data quality affordances (Section 6.10).** The visible expression of all the layers above. Cannot be done without 1-9. When done, the product looks and behaves like Bloomberg / Refinitiv / Westlaw quality intelligence rather than a scrape pipeline with display attached.

The infrastructure layers above are mutually reinforcing. Building 1-3 unlocks 4-6. Building 4-6 unlocks 7-9. Building 10 is the surface manifestation of the whole stack working. None of them is a "rip out and replace" cost; each one composes on top of work that exists, with deletion of dead-code paths as part of the consolidation. The work is engineering, not product reinvention.

---

## 8. Closing observation

The audit found one cross-cutting pattern that does not fit cleanly into the structural list above. The product has substantial investment in correct underlying machinery: a 380-line writer prompt with integrity rules, a 5-axis source classification framework, a multi-tenant schema, a lead-time formula in the trust score, structured tag arrays for chip taxonomies, an item_timelines table for milestone tracking, a B.2 SKILL contract for writer output. None of these reach the operator. Each was built, then left disconnected from the surface the operator reads.

The four-page architecture is the product. The pages are the right shape for the operator. The brief's vocabulary is correct, the routing intent is correct, the integrity standards are correct. What is missing is the data engineering infrastructure (Section 6) that proven intelligence platforms have built underneath their similarly-shaped products. The next phase of work is building those layers, not reconsidering the architecture they support.

The Chrome audit independently arrived at the same conclusion from the operator's chair: "the brief's vocabulary is visible in the chrome (FSI Brief Framework hooks like 'Read operational briefing — What to do, when, who's affected — 30-second scan'), but the routing, the templates, and the registry contents do not yet enforce that brief. The visual layer is overcommitted to a uniform regulatory shape; the data layer hasn't completed the typing and tiering work that would justify a more differentiated visual layer." Two independent audit methodologies converging on the same diagnosis is the strongest signal in this document.

The work ahead is concrete: master data and entity resolution, source registry as a curated product, structured fact extraction with confidence and provenance, type-aware routing with per-surface framing, knowledge graph, lead time as a first-class column, multi-tenancy with sector ranking, versioning, operator-facing quality affordances. None of these reinvent the wheel. All of them have been proven by intelligence platforms serving global enterprise compliance, finance, and ESG functions. Caro's Ledge can adopt the patterns and build the freight-sustainability product on top.

This document, together with the companion `caros-ledge-supabase-schema-audit-2026-05-15.md` (table-by-table inventory of what exists, what works, what is dead, and what must be added), is the spec for the next three dispatches.

---

## Appendix: Methodology

Eight investigation areas dispatched in parallel as read-only sub-agents on 2026-05-15. Each agent had access to:
- Repo at C:\Users\jason\dotfiles
- Live Supabase project kwrsbpiseruzbfwjpvsp via service role key in fsi-app/.env.local
- Full latitude on methodology and depth within their assigned area
- Explicit constraint: read-only, no fixes, no migrations, no PRs, no downstream dispatches

Total tool uses across the eight agents: ~480. Total runtime: ~17 minutes wall clock (parallel). Audit scripts authored by sub-agents are in `fsi-app/scripts/` and `fsi-app/scripts/tmp/` for re-run.

Sub-agent output files (not read directly to avoid context overflow):
- Area 1 (data sufficiency per page): `tasks/afcf062583717b668.output`
- Area 2 (cross-reference integrity): `tasks/acd11ea792449f785.output`
- Area 3 (source traceability): `tasks/ad62b54a2026166ce.output`
- Area 4 (route-to-data alignment): `tasks/a12657c2aa15266c6.output`
- Area 5 (AI writer quality): `tasks/a01ea189fd3b47df0.output`
- Area 6 (FSI Brief framework + integrity non-negotiables): `tasks/a536549ffe3806440.output`
- Area 7 (lead time + vertical/mode priority): `tasks/ae699c85170babfd7.output`
- Area 8 (multi-tenant 3-layer model): `tasks/ad0c7907bfce6060c.output`

A parallel live-site UX audit was conducted on 2026-05-15 by an independent agent (Claude Chrome) browsing the production site at carosledge.com with no access to the repo or database. That audit cross-validated the structural failures in Section 3 with operator-visible evidence and surfaced new findings (counter math mismatches, named off-domain items, schema field names leaking into operator copy). Its findings are integrated into Section 5. Two independent methodologies converged on the same diagnosis.

A companion Supabase schema audit (`caros-ledge-supabase-schema-audit-2026-05-15.md`) provides table-by-table inventory of the database, mapped to the entity tables and infrastructure layers specified in Section 6.

Synthesis composed by parent agent on 2026-05-15. v2 revisions composed 2026-05-15 to remove wrong-shape prescriptions (rename /research, feature-flag /operations) per operator clarification that the four-page architecture is the design and is correct.
