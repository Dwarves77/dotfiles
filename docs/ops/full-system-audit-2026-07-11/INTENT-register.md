# INTENT Register — Intent-vs-Delivery (Full-System Audit 2026-07-11)

Agent: INTENT. Branch `audit/full-system-2026-07-11`, baseline master `71bcbd4`. READ-ONLY
throughout: no existing file modified (this register is the only new file); DB access = 7 SELECT-only
`execute_sql` queries against live `kwrsbpiseruzbfwjpvsp`; zero fetches; zero scripts.

**Canonical intent source:** `fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md` (binding
five-surface model, read in full). **Delivery evidence:** every surface's `src/app/<surface>/page.tsx`
read in full; live-DB measurements; all ten Wave-1 registers (DB-1..4, CODE-1,2,3,4b,5a,5b) mined for
surface-bearing findings (cited by their register IDs).

**Mission framing (operator):** "the audit should also be in regards to the intent of the site and
what does and does not work to be the best product available to date for what we intend. If we miss
the mark on delivering these services for any of the pages and their specific intent we need to
correct that now."

Gap classes: **content** (corpus/coverage) · **feature** (unbuilt/unwired) · **quality**
(broken/wrong) · **honesty** (fabricated/misleading).

---

## 0. The live baseline a customer sees today (measured 2026-07-11)

Verified-live (`provenance_status='verified' AND is_archived=false`) = **179 items** (query 1,
reconciles with the 2026-07-11 honest quarantine of 62 floor-failing items). Routed by the format
mapping:

| Surface | item_types | Verified-live | Jurisdictions | Quarantined-live (hidden) | Newest added |
|---|---|---|---|---|---|
| Regulations | regulation 25, directive 5, guidance 7, framework 4, standard 0 | **41** | **12** | **99** (reg 60, fwk 16, guid 11, std 9, dir 3) | 2026-05-10 |
| Market Intel | market_signal 44, initiative 28 | **72** | 33 | 2 | 2026-05-11 |
| Research | research_finding 37 | **37** | 9 | 4 | 2026-05-10 |
| Operations | regional_data 25 | **25** | 14 | 1 | 2026-05-10 |
| (off-model) | technology 4 | 4 | 3 | 0 | 2026-04-11 |

Cross-cutting facts that bear on every surface:

- **Intake is frozen.** Max `added_date` corpus-wide = **2026-06-21** (archived rows); max among
  live-verified = **2026-05-11**. Scrape hold ON since 2026-05-18, cadence `off` (DB-3 §e),
  monitoring_queue has **zero future scheduled checks** (DB-3 F7). Nothing new has reached any
  customer surface in ~2 months.
- **The quarantine gate is honest and holding** — the 106 hidden live items are quarantined for real
  floor failures, and RLS/view gates (mig 116/157) keep them off the surfaces. That honesty is a
  design win; what the customer *experiences* is thin coverage.
- Community substrate (query 7): 1 org, 2 profiles, 7 seeded rooms, **1 member, 1 test post,
  0 replies, 0 invitations, 0 sign-offs, 0 promotions, 0 active verifiers**.

---

## 1. REGULATIONS

**Intent (skill Section 3).** Binding regulatory intelligence: laws, agency rules, treaties,
rulemaking outcomes, deadlines, enforcement dates, comment periods — Regulatory Fact Documents.
Skill's recorded state: "Functional. The only intelligence page currently delivering its stated
intent."

**Delivery today.**
- Page machinery is genuinely good: `regulations/page.tsx:35-38` reads verified-gated listings +
  `get_surface_counts('regulations')` (single-SoT counts, fail-soft, never mock literals — CODE-4b
  clean-bill). Provenance moat holds on the index.
- **Content is hollow at the flagship level.** 41 verified-live items across 12 jurisdictions
  (EU 16, US 12, US-CA 3, then singletons). Meanwhile **99 reg-family live items are quarantined**,
  and the quarantined set (query 5) is the flagship spine of freight sustainability law: **EU CBAM,
  EUDR, FuelEU Maritime, Fit for 55, CORSIA, CII/EEXI, IMO Net-Zero Framework, ISO 14083, CA SB 253 +
  SB 261, NYC LL97 (one row; another LL97 row is verified), EPA HDV Phase 3, EU HDV CO2 2019/1242,
  UK SAF Mandate, UCC**. A freight forwarder asking "what binds me?" is shown a corpus missing most
  of what binds them.
- **Deadline/comment-period tracking is not alive.** Intake frozen since 2026-05-11; item_timelines
  exist (127 items) but nothing new flows; `is_completed` flips early for period-precision milestones
  (CODE-1 F-15).
- Quality defects on what IS shown: 5 verified-live items with **NULL full_brief** (DB-1 ITM-1 —
  TCEQ, MEPC.377(80), Amendment C376, EPA Fast Facts, North Carolina Register; all five appear in the
  verified ledger per query 6); 4 verified duplicate clusters shown side-by-side (DB-1 ITM-7), incl.
  **two verified PPWR rows** (DB-2 deliverable b); detail-page xref/supersession lookups have no
  provenance predicate (CODE-4b F1 class, `regulations/[slug]/page.tsx:116-174`).
- Honesty defect: masthead hardcodes "workspace verticals: Live events · Fine art"
  (`regulations/page.tsx:66-67`, CODE-4b F5) — a workspace fact asserted from a string literal.

**Verdict: PARTIALLY DELIVERS.** The machinery and the integrity discipline deliver; the *content*
a customer needs from this page mostly does not reach them, and the skill's "Functional" state note
is now stale in the other direction (the 2026-07-11 quarantine was correct, but it hollowed the
surface).

**Top gaps.**
1. **Content gap — flagship corpus quarantined.** 99/140 live reg-family items hidden, incl. nearly
   every flagship instrument (query 5). Evidence: queries 1/2/5; DB-1 §1. This is the single biggest
   intent-delivery miss in the product.
2. **Content gap — freshness frozen.** Newest live item 2026-05-10; hold ON since 2026-05-18 (DB-3
   §e); "regulatory deadlines, comment periods" cannot be delivered by a static corpus.
3. **Quality/honesty — defects inside the visible 41.** 5 NULL-brief verified items (ITM-1), 4 dup
   clusters incl. PPWR twins (ITM-7, DB-2 F3), hardcoded verticals fragment (CODE-4b F5), ungated
   detail lookups (CODE-4b F1).

**Corrections.**
- (1) Backward re-point + re-ground the quarantined reg corpus through the truncation-fixed pipeline
  (PR #155 machinery, PPWR-proven). Mechanism: promote stored enacted-URLs from `agent_run_searches`
  pools (retrieval-before-generation; DB-1's 62-item pool coverage: 45 COVERED / 8 PARTIAL /
  9 NOT-COVERED), then batch-1 fetch for the residual. Dependency: **batch-1 fetch authorization +
  spend**; partially loop-independent (45 covered items need zero fetches). Effort: **dispatch**
  (the standing funded-pass/batch1-runner lanes exist).
- (2) Loop flip decision (cadence weekly/monthly) + monitoring_queue re-seed (DB-3 F7) so deadlines
  flow again. Dependency: **operator loop-flip ruling** (Browserless budget). Effort: hours once
  ruled.
- (3) Regenerate-or-requarantine the 5 NULL-brief items; RC-9 dedup the 4 clusters; read verticals
  from workspace_settings.sector_profile or drop the fragment. Dependency: pure code + 1 guarded
  data-op. Effort: **hours-days**.

---

## 2. MARKET INTEL

**Intent.** Industry signals — corporate announcements, capital flows, carbon markets, fuel pricing,
**predictive timing**; "timely first, confirmed later" (the page's own masthead). Skill's recorded
state: "Broken" (OBS-18 alerts, OBS-20 worker-language, taxonomy bleed, no aggregation engine).

**Delivery today.**
- Materially better than the skill snapshot: category routing is WIRED and fail-closed
  (`market/page.tsx:38-41` via `get_market_intel_items`; taxonomy bleed with /operations is cured);
  severity tiles/bands read single-SoT counts; 72 verified-live signals across 33 jurisdictions —
  the widest jurisdiction coverage of any surface.
- **But the surface's defining value — timeliness — is absent.** Newest live signal 2026-05-11
  (query 1). A market-signal page whose masthead says "timely first" while every signal is two
  months old is an intent inversion; unlike Regulations, stale market signals lose most of their
  value.
- Price tiles: `published_price_statistics` promises `next_release_at=2026-07-03` and was not
  refreshed — **8 days past its own promise** at audit date (DB-1 PPS-1; confirmed still stale in
  query 7).
- Sprint-3 trajectory schema landed (mig 107/108) but **`trajectory_points` = 0 rows on all 653
  items** (DB-1 ITM-6; query 1 has_traj=0) — the trajectory UI payload is structurally empty.
  `signal_band` populated on only 23/44 signals + 14/28 initiatives (query 1).
- Security/doctrine regression found by CODE-5b F1: `get_market_intel_items` **lost the
  `_assert_org_membership` gate** in the mig-108 rewrite (108:37-124, final body 125:11-67) — any
  authenticated user can read a foreign org's override overlay. Mitigated only by single-tenancy.
- No signal-aggregation/predictive-timing engine exists (unchanged from skill; the monitoring →
  reconcile → intelligence_changes chain has never fired a change: DB-3, `intelligence_changes` 0
  rows).

**Verdict: PARTIALLY DELIVERS** (routing/structure fixed; the timeliness half of the value
proposition undelivered; one security regression).

**Top gaps.**
1. **Content gap — staleness contradicts the surface's core promise.** All signals ≥2 months old
   under a "timely first" masthead (query 1 + system_state hold). Dependency: loop flip +
   `/api/admin/scan` cadence + staged_updates review loop (24 rows, all from one 2026-04-05 batch —
   DB-3). Effort: hours after the loop ruling; ongoing operator triage.
2. **Quality gap — price tiles broken on their own terms.** PPS-1: lapsed next_release with no
   stale-state UI. Dependency: pure code (cron honoring unit budget, or an is-stale visual state).
   Effort: **hours**.
3. **Feature gap — trajectory + bands half-wired; membership gate regression.** trajectory_points 0
   rows (ingestion never built), signal_band 50% coverage, F1 assert restoration (one migration +
   meta-gate probe per CODE-5b). Effort: hours (F1) / days (trajectory backfill design).

---

## 3. RESEARCH

**Intent.** Horizon-scan with analytical/quantitative depth — academic + think-tank + analytical
trade press (broader than peer-review). **Open repositioning decision** (editorial staging queue vs
customer horizon-scan destination) — operator decides.

**Delivery today.**
- Improved since the skill snapshot: category routing wired (`research/page.tsx:46-59` — pipeline
  rows ∩ `getResearchItems` allow-list; IMO/ICAO routed out, trade-press analytical routed in);
  source coverage matrix is now a real RPC (mig 100), not the hardcoded stub; credibility chips
  (citation count, tier, bias tags) render per row.
- **The repositioning decision was never made.** The page still renders `pipeline_stage` framing —
  an editorial-queue shape — as the customer surface. `owner: null, partnerFlagged: false`
  placeholders ship to the UI (`research/page.tsx:95-96`, CODE-4b F10). The skill's open question
  from Sprint-2 planning is still open in Sprint 4+.
- 37 verified-live research findings, 9 jurisdictions, newest 2026-05-10. No live ingest from the
  analytical-press source list (sources registered; intake frozen; 92 active sources have zero edges
  anywhere — DB-2 F15).
- **Theme routing is inert by construction** (CODE-1 F-10): the parser validates `theme` against the
  7 topic-tag values while the DB CHECK is a disjoint 7 — `toDbTheme()` nulls every agent-emitted
  theme (ITM-6: theme = 0 rows on 653; theme_candidate banks 20). Any "theme-first" research
  navigation renders from nothing. Accepted Emergence-Capture interim, but it is a customer-visible
  nothing.
- 4 verified `technology` items have **no surface home** (off-model 6th surface; `routing.mjs` flags
  it; `get_technology_items` RPC exists but no page consumes it as a surface) — they are reachable
  only via dashboard/community links that dump to /market or /operations lists that exclude them.

**Verdict: PARTIALLY DELIVERS.**

**Top gaps.**
1. **Feature/decision gap — repositioning never ruled.** The surface is still an editorial-queue UI
   wearing a customer route; the skill explicitly parked this for "Sprint 2 planning" and it never
   closed. Dependency: **operator decision**, then a bounded UI rebuild. Effort: decision (minutes) +
   days.
2. **Content gap — horizon-scan without a horizon.** 37 items, frozen 2026-05-10; no Research
   Summary generation cadence from the analytical-press registry. Dependency: loop flip +
   INGESTION-BRIEF-GENERATION (already a Sprint-4 corpus-axis candidate). Effort: dispatch.
3. **Feature gap — theme routing inert (F-10) + 4 homeless technology items.** Dependency:
   Emergence-Capture vocabulary cure (sequenced follow-on) + an operator ruling on where technology
   items surface (skill says Research when horizon-scan, Market when signal). Effort: days.

---

## 4. OPERATIONS

**Intent.** Jurisdictional decision intelligence as **structured content + Assistant + customer
judgment — NOT a decision engine** (binding framing). Six dimensions: regulatory feasibility,
resources, labor, materials, infrastructure, cost.

**Delivery today.**
- The build honors the binding framing — `operations/page.tsx:71-77` cites it verbatim and
  implements regulatory feasibility as cross-references into /regulations, not an engine. Phase-D
  banner and regex-chip stubs (OBS-19 era) are gone; regions/dimensions/facts UI is real (mig
  106/109/152).
- **Content is thin exactly where the intent points.** `regional_data_facts` = 75 rows covering
  ASIA/UK/UAE only; **EU and US — the two regions ranked "critical" in the regions table — have ZERO
  facts** (DB-1 RDF-2/§11); the `regulatory_feasibility` dimension has 0 rows in every region.
  `state_cost_facts` = 13 rows, one dimension (minimum wage). All facts last_updated 2026-05-28.
- **Honesty tension in the masthead.** `operations/page.tsx:89` prints "every fact carries a source
  and date" — but all 75 regional facts have **NULL source_id**, carrying only free-text
  `source_note`s, many citing tier-5-ish hosts (Indeed, Mordor Intelligence, vendor blogs) (DB-1
  RDF-1). The claim is defensible only on a generous reading ("a source" = a note); it is not the
  provenance standard the platform sells. Plus the `|| 5` hardcoded jurisdiction fallback
  (`operations/page.tsx:88`, CODE-4b F10).
- **Quality defect:** the related-items rail bypasses the verified gate — service-role select with
  only `is_archived=false` (`operations/[slug]/page.tsx:176-244`, CODE-4b F1): quarantined titles can
  render and link on this customer surface (106 active-quarantined items in range).
- 25 verified-live regional_data items over 14 jurisdictions support the item list.

**Verdict: PARTIALLY DELIVERS** (framing right, skeleton right; content missing for the critical
regions, provenance below the platform's own bar).

**Top gaps.**
1. **Content gap — EU + US facts empty; regulatory_feasibility dimension empty everywhere.** The
   cohort's two most critical regions render "missing" honestly but render nothing. Dependency:
   content-generation dispatch (fact sourcing per region×dimension); no loop dependency (facts are
   researched, not scraped). Effort: **dispatch**.
2. **Honesty/doctrine gap — facts without source FKs under a "every fact carries a source" masthead**
   (RDF-1). Correction: register the recurring publishers as sources + link source_id (the
   `state_cost_facts` table proves the pattern — 13/13 have FKs + statute citations), or soften the
   masthead. Dependency: guarded data-op + registry inserts. Effort: days.
3. **Quality gap — quarantine leak in the related rail (CODE-4b F1) + staleness (facts 6 weeks old,
   premature is_completed flips CODE-1 F-15).** Dependency: pure code. Effort: **hours**.

---

## 5. COMMUNITY

**Intent.** CO-EQUAL core surface fixing the freight industry's information-isolation problem:
working groups, forums, peer connection; editorial pickup in-flight; vendor directory removed.

**Delivery today.**
- **The build half is genuinely shipped.** The conversation layer is live end-to-end (DB-4 §d):
  rooms UI (`community/page.tsx` — 481 lines, honest fail-soft everywhere), groups/join/star,
  posts/replies, invitations, sign-off workflow (verifier makes peer posts citable), moderation,
  notifications v2, promote-to-intelligence route, admin pickups queue heuristic. Region rooms
  seeded (7). Verified-ledger items classified into rooms with real counts.
- **The network half is empty.** 1 org, 2 users, **1 member, 1 operator test post, 0 replies,
  0 invitations, 0 sign-offs, 0 promotions, 0 active verifiers** (query 7). Information isolation
  cannot be fixed on a network of one. This is not a code gap — it is the adoption/multi-tenant gap
  the skill's "expansion mechanism" (Onboarding) exists to close.
- **Latent defects positioned to fire exactly at adoption** (all DB-4): F1 **profile self-edit
  silently no-ops** (no UPDATE policy on profiles; author-identity work rides on this), F10 counter
  triggers run as INVOKER → member/reply counts drift on RLS-path writes, F9 `weekly_post_count`
  displayed but never written (false metric the moment posting starts), F16 ban re-join hole,
  F7 case_studies seed rows carry **fabricated `peer_validated` labels** (latent integrity-rule
  breach if the family is ever surfaced). Forum layer (17 seeded sections) + case studies are
  seeded-never-used dead families (F6/F7).
- Editorial pickup: promote route + pending-count + admin queue exist; `/research` does not consume
  pickups; zero promotions ever — **in-flight, half-built** (matches skill's corrected status).

**Verdict: PARTIALLY DELIVERS.** Feature-complete enough to demo; value-empty until peers exist;
several adoption-time landmines.

**Top gaps.**
1. **Adoption/content gap — no peers.** The co-equal surface has one user's test post. Dependency:
   pilot-cohort onboarding (second org +), which itself depends on Onboarding completion (email
   invitations are copy-URL only). Effort: **dispatch + operator BD**, not code alone.
2. **Quality gap (latent class) — the adoption-time landmines.** F1 profile writes no-op, F10
   counter drift, F9 false metric, F16 ban hole. All are cheap now, expensive after members arrive.
   Dependency: pure code + 3 RLS policies + 1 migration. Effort: **days** total.
3. **Feature gap — editorial pickup loop unclosed** (promote exists; intelligence surfaces never
   consume pickups; 0 uses). Dependency: Community-rebuild scope per skill correction 3. Effort:
   days.

---

## 6. DASHBOARD (cross-cutting)

**Intent.** Digest/triage: what's new, important, flagged; every tile cross-references its canonical
surface. Skill state: "Functional. Stays as-is."

**Delivery today.**
- Masthead reads true aggregates (mig 068) with fail-soft; rail reads `get_all_surface_counts`.
- **CODE-3 F-01 (P1): the 8s-timeout fallback still serves SEED data** on the home surface —
  `supabase-server.ts:1425-1452` passes the seed tuple, so a slow DB renders unattributed seed
  content as if live, contradicting the SF-2 empty+sentinel decision documented 60 lines above it.
  Direct surface-honesty breach on the customer's first page.
- **"What changed" renders demo-era data with cross-item bleed**: item_changelog = 9 rows, all
  2026-03-01, with PPWR-shaped diffs attached to the CII item (DB-1 CHG-1). A customer reading
  "what changed" on a maritime item sees packaging-law diffs.
- "What's new" has had nothing new since 2026-05-11 (intake freeze) — the digest of a frozen corpus.
- Dead slices feeding it: synopses always [], intelligence_changes 0-row (CODE-3 F-23).

**Verdict: PARTIALLY DELIVERS.** Top gaps: (1) **honesty** — F-01 seed fallback (pure code, hours:
copy the fetchMapData empty-fallback shape); (2) **honesty/quality** — CHG-1 purge/regenerate the 9
changelog rows + wire `detected_by` (guarded data-op, hours); (3) **content** — freshness freeze
(same loop dependency as everywhere).

---

## 7. INTELLIGENCE ASSISTANT (cross-cutting)

**Intent.** Research helper grounded in platform skills + content. **NOT a synthesis or decision
engine.** Skill state: wired; quality unverified.

**Delivery today.**
- Wired globally + per-page (`/api/ask`, AskAssistant, skill-loader consumed by the route — CODE-1
  wiring map). Scope posture is correct: per-question answering over platform content; no decision-
  engine shape found anywhere (PI-4 exempt-axiom holds; no violation observed in any register).
- **Grounding-quality verification has still never been done** (the Sprint-2+ dispatch the skill
  names remains unexecuted). Nobody has verified the Assistant actually loads and honors
  `environmental-policy-and-innovation`.
- Gate belt gap: the FTS re-fetch trusts `search_intelligence_items` to enforce verified+non-archived
  internally and does not re-apply the filters (CODE-3 F-09); doctrine says 10/workspace/hour, code
  has only the generic 60/min limiter (doctrine drift).

**Verdict: PARTIALLY DELIVERS.** Gaps: (1) **quality** — grounding verification dispatch never run
(hours-days: sample Q&A against skill + citation checks); (2) **quality** — re-apply
verified/non-archived on the hit re-fetch + reconcile the rate-limit doctrine (hours); (3)
**content** — the Assistant is only as good as the 179-item verified corpus it searches (same corpus
dependency as the surfaces).

---

## 8. MAP (cross-cutting)

**Intent.** Geographic view of Regulations content; possible future community-presence overlay.

**Delivery today.** Functional as built: verified-gated map data (`getListingsMapData` uses empty
fallbacks — the corrected shape), coverage-gaps card, `?region=` ISO filtering, community-activity
dot overlay already wired (`map/page.tsx:51-73`, fail-soft). But it inherits Regulations' hollow
corpus: **41 items / 12 jurisdictions** — a world map with 12 lit points, EU+US dominant, and the
community dots read from 1 test post (≈1 dot). coverage_gaps card runs on 2 rows from 2026-05-10
(DB-1 CVG; one row carries a raw `<i>` tag — renderer-escape check owed).

**Verdict: PARTIALLY DELIVERS** (feature delivers; content mirror of Regulations). Gaps: (1)
**content** — inherits Regulations gap 1 (the reg re-ground IS the map fix); (2) **quality** —
CVG-1 markup-in-description + 2-month-stale gap rows; (3) **content** — jurisdiction breadth (12) vs
the 30-jurisdiction weights the workspace declares (DB-4 §1.5) — the customer's own configured scope
outstrips the corpus.

---

## 9. ONBOARDING (cross-cutting)

**Intent.** Expansion mechanism: wizard, signup, invitations, sector_profile → workspace-scoped
delivery + Community participation. Required for the architectural intent (multi-tenant expansion)
to materialize.

**Delivery today.**
- The plumbing exists end-to-end: 4-step wizard, `/workspace/new` bounce, invitation
  accept/decline + org-ban enforcement (mig 156), LinkedIn OAuth routes (deploy-config-gated, not a
  stub — CODE-4b F10 comment drift noted).
- **The identity step silently does not persist** (DB-4 F1): `OnboardingWizard.persistIdentity`
  writes `profiles` via the browser client; profiles has NO insert/update policy; the update matches
  0 rows and returns no error → the wizard reports success and writes nothing. The one historical
  edit that stuck went through the user_profiles mirror. This is a breaks-customer defect in the
  exact flow expansion depends on.
- Email-delivered invitations remain unbuilt (copy-URL only); sector taxonomy still the 6 current
  niches (dual-posture narrowing the skill already flags); LinkedIn scopes are deprecated for new
  apps (CODE-3 F-21 — will fail at the provider on a fresh app registration).

**Verdict: PARTIALLY DELIVERS (functionally broken at one step).** Gaps: (1) **quality
(breaks-customer)** — F1 profile-write no-op: add a column-constrained self-update RLS policy or
route through a service API, + rows-affected assertion (hours; DB-4 has the exact policy shape);
(2) **feature** — email invitation delivery (days); (3) **feature** — sector taxonomy expansion +
LinkedIn OIDC scope migration (days). All three gate the Community adoption lever.

---

## 10. Product-level: the two coupled value halves

**Intelligence half (Regulations + Market + Research + Operations, + Dashboard/Map/Assistant).**
Closer to shippable-best-in-class. What exists under the hood — the canonical pipeline, claim-level
traceable provenance (8,686 claims, span→source→tier), the fail-closed floor, honest quarantine, the
truncation fix, the invariant/meta-gate lattice — is a real, defensible moat no competitor shape
matches (the accuracy-moat doctrine made mechanical). Its failure mode today is NOT architecture: it
is that the moat currently *hides* most of the flagship content (99 reg-family items quarantined) and
the intake loop is off, so every surface digests a corpus frozen on ~2026-05-11.

**Single biggest lever (intelligence): execute the quarantine drain — re-point + re-ground the
reg-family corpus through the truncation-fixed pipeline (45/62 pool-covered items are zero-fetch),
then flip the loop at a budgeted cadence.** One dispatch converts the moat from a subtraction into
the visible product: Regulations refills with flagship instruments, Map lights up, Dashboard has
"what's new", the Assistant's search space triples.

**Community half.** Structurally shipped but value-empty: the surface works, the network is one
person. Best-in-class here is measured in peers, and the count is zero. The half also carries the
adoption-time landmines (profile-write no-op, counter drift, false weekly metric, ban hole) that
would make a first cohort's experience quietly broken.

**Single biggest lever (community): land the pre-adoption fix bundle (DB-4 F1/F9/F10/F16 + email
invitations) in days, then onboard the pilot's second organization.** No content or pipeline
dependency — this is the one core surface whose gap is closable without touching the corpus, but
only the operator can supply the peers.

**Which half first?** They are coupled but not symmetric: the intelligence half's lever is
executable now by dispatch and improves every surface at once; the community half's lever needs the
code-fix bundle (small) plus a business action. Run the intelligence drain as the headline
correction; run the community fix bundle in parallel as cheap insurance so adoption is never blocked
on code.

---

## 11. Summary verdict table

| Surface | Verdict | Dominant gap class | The one-line miss |
|---|---|---|---|
| Regulations | **PARTIALLY DELIVERS** | content | Flagship regs (CBAM, EUDR, FuelEU, CORSIA, ISO 14083…) quarantined; customer sees 41 items / 12 jurisdictions |
| Market Intel | **PARTIALLY DELIVERS** | content (timeliness) | "Timely first" surface with 2-month-old signals + price tiles past their own release promise |
| Research | **PARTIALLY DELIVERS** | feature/decision | Repositioning decision never made; still an editorial-queue UI; theme routing inert |
| Operations | **PARTIALLY DELIVERS** | content + honesty | EU + US (critical regions) have zero facts; facts carry no source FK under a "every fact carries a source" masthead |
| Community | **PARTIALLY DELIVERS** | adoption + latent quality | Built but network-of-one; profile edits silently no-op; counters will drift at first adoption |
| Dashboard | **PARTIALLY DELIVERS** | honesty | Timeout path serves seed data; "what changed" shows demo rows with cross-item bleed |
| Intelligence Assistant | **PARTIALLY DELIVERS** | quality (unverified) | Wired, scope-correct, grounding quality never verified |
| Map | **PARTIALLY DELIVERS** | content (inherited) | Faithful view of a hollow Regulations corpus |
| Onboarding | **PARTIALLY DELIVERS** | quality (breaks-customer) | Identity step silently persists nothing (profiles RLS) |

No surface earns DELIVERS today; none is an outright MISS — every surface has real, working
machinery whose intent is undercut by one of: the frozen/quarantined corpus, an unmade decision, or
a small set of named defects. The corrections are enumerated per surface above; the two levers in
§10 cover the majority of the distance.

**Single biggest miss (product-wide):** the Regulations flagship-corpus gap — the page whose intent
the skill called "the only one delivering" currently hides most of the binding instruments a freight
forwarder exists to track, and nothing new has entered the system in two months.

---

## 12. Tool-call count and deviation log

**Tool-call count: 40** (Read 23 — skill, manifest, 10 Wave-1 register reads incl. 2 paginated,
8 surface pages, 1 partial; Bash 3; Glob 2 timed-out attempts; ToolSearch 2; TodoWrite 4;
execute_sql 7 SELECT-only; Write 1 — this register).

**Deviation log.**
1. Two initial Glob calls timed out (20s ripgrep limit on the large repo); replaced with `ls`/`wc`
   via Bash. No coverage impact.
2. CODE-5a register (768 lines) read to line 314: its complete findings table (§12, F-5a-1..15) and
   all body sections §1-§13 fell inside the read window; only Appendix A/B per-file classification
   tables were not re-read (their content is summarized in the body sections used here).
3. Surface component internals (HomeSurface, the Ledger components, AskAssistant, OnboardingWizard)
   were assessed via the page files + the CODE-3/CODE-4b/DB-4 register evidence rather than re-read
   line-by-line — Wave-1 already covered them; re-reading would duplicate audited ground. Note:
   there is no CODE-4a register in the audit directory (ui-components slice) — component-level
   claims here rest on CODE-4b's declared out-of-slice excerpts and DB-4's code-path scans, flagged
   as the register set's one coverage seam.
4. Surface routing in queries 1-4 was computed with an explicit item_type CASE mirroring the format
   mapping (environmental-policy-and-innovation) rather than calling the DB `surface_of()` function,
   to avoid signature coupling; the CASE matches the mapping the skill and mig 148 encode.
5. READ-ONLY honored: zero writes, zero DDL, zero fetches, zero script executions; 7 SELECT-only
   queries; this register is the only file created.
