# Caro's Ledge — Product State (2026-06-20)

Honest full-app state across corpus, the new-content pipeline, customer surfaces, and known-open code
work. Ground truth = live DB + code on `origin/master`. **No execution, no fixes — assessment only.**
The grounding engine is ONE subsystem; this covers the rest.

Legend: **WORKS** = built and reads real data · **STUBBED** = built UI/path but placeholder/empty/disabled ·
**NOT-BUILT** = absent · **UNPROVEN** = exists in code but never demonstrated end-to-end.

---

## A. CORPUS — what's actually customer-ready

Live (non-archived) intelligence_items by type × provenance (2026-06-20):

| item_type | total | verified | quarantined |
|---|---|---|---|
| market_signal | 72 | **69** | 3 |
| research_finding | 47 | **42** | 5 |
| initiative | 30 | **28** | 2 |
| regional_data | 30 | **26** | 4 |
| guidance | 21 | **18** | 3 |
| framework | 20 | **15** | 5 |
| directive | 8 | **5** | 3 |
| **regulation** | **96** | **49** | **47** |
| standard | 9 | **4** | 5 |
| **TOTAL (live)** | **333** | **256** | **77** |

- **Customer-visible = 256** (the customer RPCs/views gate on `provenance_status='verified'` AND
  `NOT is_archived` — migrations 116/117/125). Note: 427 rows are `verified` total, but 171 are archived,
  so the honest customer-ready number is **256**, not 427. (324 more items are archived and excluded.)
- **Customer-ready fraction: 256/333 = 77% of the live corpus.** Strong on market_signal (96%),
  research (89%), initiative (93%); **weak on regulation (51%)** — 47 of 96 regs are quarantined, 15 of
  those are below the per-type authority floor (source too low-tier → relabel/counsel, not regen-fixable).
- **The 30 flagships** (the regulatory backbone re-run this session) are the honest soft spot:
  **6 verified / 17 counsel-held / 3 error / (2 already-verified skipped, india+japan)**. Only ~20% of
  the flagships are customer-ready; the 17 counsel are held out of the surface by design (honest), and
  the 3 errors are content bugs (2 max_tokens truncation on CSRD/ETS-maritime, 1 out-of-vocab tag).
- **Bottom line:** the corpus is majority customer-ready, but the highest-value slice (flagship
  regulations) is the least ready. "Shippable content" is concentrated in market/research/initiative;
  the regulation surface ships thin until the below-floor/counsel cohort is dispositioned.

## B. NEW-CONTENT PIPELINE (discover→ingest→classify→generate→ground→verify→surface)

Per-stage mechanism:

| Stage | Mechanism | Automated / Human | Evidence |
|---|---|---|---|
| DISCOVER (sources) | hourly GHA cron → `/api/worker/check-sources` (reachability/trust; enqueues `monitoring_queue`). Does NOT find new items. | automated, but no item-level delta | `.github/workflows/source-monitoring.yml`; `check-sources/route.ts` |
| DISCOVER (new regs) | `/api/admin/scan` (Sonnet+web_search) → **stages to `staged_updates`** + `provisional_sources` | **admin-triggered only** (4h cooldown) | `admin/scan/route.ts` |
| INGEST (scan path) | approved `staged_updates` → `applyUpdate()` inserts item | **HUMAN approval gate** | `staged-updates/route.ts` |
| INGEST (auto-mint) | `/api/worker/drain-first-fetch` drains `pending_first_fetch`, Haiku-classifies, **auto-inserts a live stub** (entity-gate blocks portals) | automated (cron), but only on **already-human-vetted sources** | `drain-first-fetch/route.ts` |
| CLASSIFY | Haiku `firstFetchClassify` sets item_type/domain/priority | automated (within drain) | `drain-first-fetch/route.ts` |
| GENERATE→GROUND→VERIFY | `/api/agent/run` → `generateBriefWorkflow` (preflight→generate→register→section→ground→grow); `set_provenance_status` trigger flips to verified | automated | `agent/run/route.ts`; `workflows/generate-brief.ts` |
| SURFACE | customer reads gate on `verified` | automated (passive) | migrations 116/117/125 |

**VERDICT: the end-to-end autonomous new-content loop is UNPROVEN.**
- **No single orchestrator spans discover→surface** — the loop is stitched from independent triggers
  (hourly cron, admin scan, human approval, the durable generate workflow). No code path runs the whole
  chain as one unit.
- **Intake is human-gated or source-vetted by design.** The scan path NEVER auto-inserts (CLAUDE.md
  doctrine); the one auto-minting path (`drain-first-fetch`) only acts on sources that themselves passed
  human `provisional_sources`/scan review. So "fully autonomous new content" is not the architecture.
- **Runtime evidence — the intake loop is idle:**
  - newest `intelligence_items.created_at` = **2026-05-19** → **zero new items in a month**.
  - `staged_updates`: all approved+materialized, idle since early May.
  - `pending_first_fetch`: all terminal (no `queued`) → the auto-mint drain has nothing to process.
- **What IS proven (this session, 2026-06-20):** **77 items regenerated** (`last_regenerated_at`) and the
  corpus flipped to 256 verified — i.e. **generate→ground→verify works on EXISTING items**. BUT this ran
  via DIRECT canonical-function calls (the reground/regen runners), which **bypass `agent_runs`
  telemetry** (hence `agent_runs` idle since 2026-06-05 — a telemetry gap, not dormancy) AND **bypass the
  `/api/agent/run` → `generateBriefWorkflow` route**. So even "generation works post-streaming-fix" is
  proven at the **function level, not the full workflow/route level**.
- **No end-to-end full-loop test exists.** `verify-end-to-end.mjs` is a UI/community E2E;
  `canonical-pipeline-proof.mjs` proves only the generate→ground→grow segment on a pre-existing item.

**This is the core product loop, and it is the single biggest unproven thing in the app.** A
freight-sustainability intelligence product whose value is "know it before competitors" needs a
demonstrated autonomous (or one-click) discover→surface path for a brand-new regulation. Today that path
exists in pieces, has produced no new item in a month, and has never been shown to flow end-to-end —
especially not post-streaming-fix.

## C. CUSTOMER SURFACES & CHROME

App-wide auth is real and platform-level: `src/proxy.ts` redirects any unauthenticated non-public
request to `/login`; API routes also call `requireAuth()`. All five surfaces read **verified-gated**
data via the shared RPC/view plane (migrations 116/117/125); Market + Operations **fail CLOSED** to an
honest empty state rather than leaking ungated seed data.

| Surface / chrome | Verdict | Notes (evidence) |
|---|---|---|
| **Regulations** | WORKS | index + `[slug]` detail read `active_intelligence_items` (verified-gated) routed by item_type; client search + region/priority filters. ~49 verified regs live. |
| **Research** | WORKS | `get_research_items` (research_finding), real source-coverage RPC; fail-open to unfiltered pipeline if category RPC empty. ~42 verified. |
| **Market Intel** | WORKS | `get_market_intel_items` (market_signal+initiative), fails CLOSED; per-source citation chips. Best-populated (~69+28 verified). |
| **Operations** | WORKS | `get_operations_items` (regional_data), fails CLOSED; regions/coverage/facts (migrations 106/109) return honest empty arrays when unconfigured. ~26 verified. |
| **Community** | **STUBBED (empty-state)** | Fully wired UI + queries + RLS + ILIKE search against the LIVE `community_*` tables — but **`community_groups`=0 and `community_posts`=0 rows**. Genuinely wired, zero content. |
| **Onboarding** | **PARTIAL/STUBBED** | `/onboarding` wizard reachable by direct link but **NOT auto-mounted** (doctrine); LinkedIn import is "Coming soon" disabled (gated on `LINKEDIN_CLIENT_ID`); the sector feature it configures is SHELVED. |
| **Auth** | WORKS | Supabase email+password (`/login`,`/signup`,`/auth/callback`); platform-gated; no OAuth login. |
| **Billing / subscription** | **NOT-BUILT** | Confirmed: zero billing API routes, no Stripe/checkout/plan-gating/subscription_status consumed. The only `stripe`/`paywall` hits model *source* paywalls as a trust signal + privacy-policy boilerplate. |
| **Search** | WORKS (as Q&A) | No global full-text index. Corpus "search" = `/api/ask` (auth-gated, rate-limited LLM Q&A over verified items, inline citations) + per-surface client-side text/chip filters + a Community-only ILIKE endpoint. |
| **Dashboard** (`/` + `/map`) | WORKS | real aggregates (dashboard RPC, watchlist, coverage-gaps, credibility); degrades to an EMPTY shape + fires a platform integrity flag on data-path error (no seed fallback). `/map` community dots empty while posts=0. |

**Honest cross-cutting flags:** Community is wired-but-empty; **no billing exists at all**; onboarding is
reachable-but-shelved with a stubbed LinkedIn path; there is **no full-text search engine**.

## D. KNOWN-OPEN CODE WORK (with rough effort)

| Item | What | Effort | Urgency |
|---|---|---|---|
| **New-content loop demonstration** (§B) | prove (or build a one-click orchestrator for) discover→intake→generate→ground→surface on a brand-new reg, post-streaming-fix; exercise the `/api/agent/run` workflow path (not just direct functions) | **M–L** (1–3 days to demonstrate; more to build a true autonomous orchestrator) | **Highest — it's the core product loop, currently unproven** |
| Flagship content errors (§A) | 2× max_tokens truncation (CSRD/ETS-maritime → headroom/2-pass); 1× out-of-vocab compliance tag (one-line) | S | med (blocks flagship readiness) |
| Residual ~11 quarantined | label/slot class → regen w/ labeling enforcement; below-floor facts → relabel/counsel | S–M | low–med |
| `unregistered-span-host` lane red | wire **per-item `growStep`** into the runners (never batch — that broke 3 invariants 2026-06-20) OR host-tier canonicalization | M | low (benign; lane's standing red) |
| Scheduled backup job | GH Action `pg_dump` to storage; + confirm Supabase platform PITR/plan separately | S–M | med (no catastrophic-loss cover today) |
| A1 / A2 / A3 / A6 (your review's A-series) | **see note below** — could not map A1/A3 to code; A2/A6 have Sprint-3 markers that may differ from your review numbering | ? | per your ledger |

(See [docs/FOLLOW-ONS-2026-06-20.md](FOLLOW-ONS-2026-06-20.md) for the named-fix detail on the content +
infra items.)

## E. F/A REVIEW LEDGER — confirm/correct (PART 1 #3)

**Caveat:** the canonical F1–F7 / A1–A6 ledger is from your code-review, not committed to the repo. Below
is reconstructed from code markers + git history + the audits I ran on `origin/master`. Pipeline findings
(F1–F3) map cleanly and are verified; the A-series markers I found are **Sprint-3-era** "A1–A6" UI work
and may be a DIFFERENT numbering than your recent review — flagged where I can't be sure.

| ID | Finding (reconstructed) | Your status | My verified status | Evidence |
|---|---|---|---|---|
| F1 | fake-certification: canonical institutional tiers + reg-only floor + claims-tier honesty | fixed | **CONFIRM FIXED** | commit c84a9c6; claims-tier + ledger-onepass audits GREEN |
| **F2** | sectionBrief destructive re-section | **reported** | **CORRECT → FIXED on master** | commit 2a55d0b; skip-if-verified guard `canonical-pipeline.ts:373–379` (confirmed on origin/master) |
| **F3** | one-pass ledger | **reported** | **PARTIAL (confirm reported)** | deterministic VERIFIER (E1) committed + GREEN (commit 34cf35b, `ledger-onepass-audit.mjs`), BUT `groundBrief` STILL makes a 2nd `callSonnet` to extract the ledger — the generation-emitted ledger is NOT consumed. Deterministic *verification* yes; single-LLM-*pass* no. |
| F4 | community-promote urgency (no silent schema default) | fixed | **CONFIRM FIXED** | `community/posts/[id]/promote/route.ts` "F4 enforces" |
| F5 | dashboard hero (Stage B) | fixed | **CONFIRM FIXED** | commit 2a55d0b; `DashboardHero.tsx` marker |
| **F6** | 3-digit migration naming + profile | **reported** | **CORRECT → FIXED** | commit 8531c4a; profile markers |
| F7 | profile quick-links (PR-L) | fixed | **CONFIRM FIXED** | `QuickLinksSection.tsx` PR-L/F7 marker |
| A4 | market trajectory bars | conditional | **CONFIRM CONDITIONAL** | `TrajectoryBars.tsx` "Sprint 3 A4-3", conditional on trajectory data |
| A5 | regulations section rendering/backfill | fixed | **CONFIRM FIXED** | "Sprint 3 A5.3" sections backfilled to `intelligence_item_sections` |
| A1 | (definition not in repo) | open | **cannot map — no code marker (consistent with open)** | — |
| A2 | worker first-fetch signal_band+theme | open | **AMBIGUOUS** — Sprint-3 A2 work IS committed (`drain-first-fetch` marker); if your review's A2 is a different concern, I can't confirm | `drain-first-fetch/route.ts:315` |
| A3 | (definition not in repo) | open | **cannot map — no code marker (consistent with open)** | — |
| A6 | operations regions/coverage | open | **AMBIGUOUS** — Sprint-3 A6.3 work IS committed (`operations/page.tsx` markers); your-review A6 may differ | `operations/page.tsx:61` |

**Net corrections to your ledger:** F2 and F6 are **FIXED on master** (not merely "reported"). F3 is
**partially** addressed — deterministic verifier green, but the redundant 2nd-LLM ledger extraction
remains. A2/A6 have committed Sprint-3 work that may or may not be your review's A2/A6 (need your
definitions to confirm). A1/A3 have no code footprint (consistent with open).
