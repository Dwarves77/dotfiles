# DEEP AUDIT — Caro's Ledge — 2026-07-07

> Line-by-line functional audit of the five subsystems (generation, source-monitoring/intake,
> read-layer/surfaces, community/admin/tenancy, database↔code wiring), reconciled against the
> **live production database** (`kwrsbpiseruzbfwjpvsp`, read this session). This supersedes the
> top-down `GAPS.md` where they conflict — several `GAPS.md`/inventory claims are corrected here by
> live evidence. Companion remediation + strategy: [MASTER-PLAN.md](MASTER-PLAN.md).
>
> Severity: **S1** = data loss / security / false customer-facing claims · **S2** = core feature
> broken or hollow · **S3** = waste / quality · **S4** = hygiene.

---

## 0. The one-paragraph truth

Caro's Ledge has a **real, verified corpus (654 items, 450 verified) and a genuinely strong
FACT-grounding engine that is actively running** — but it is a **read-only intelligence magazine,
not the autonomous monitoring system it describes**, and the gap is caused by three things the live
DB now proves: (1) the automated intake loop is **switched off at the database**
(`system_state.global_processing_paused = true`, `scrape_cadence = 'off'`, untouched since
2026-05-18) *and* structurally incomplete in code (change-detection hardcoded false, approval
doesn't trigger generation); (2) the **data layer is ahead of the wiring** — dozens of columns,
tables, RPCs, and whole subsystems (watchlist, notes, community groups, price boards, provenance
chips) exist and are populated or ready but no surface reads them; (3) **governance drift** — the
migration ledger and the inventory doc both disagree with the actual database. None of this is
fatal. The expensive, hard-to-build parts (grounding, verification, the corpus, the approval UI)
are done and sound. What is missing is *connection and completion*, which is weeks of work, not
months.

---

## 1. LIVE DATABASE EVIDENCE (ground truth, this session)

| Signal | Live value | What it means |
|---|---|---|
| `intelligence_items` | **654** rows | Corpus real and larger than the June audit's 333. |
| provenance split | **450 verified / 128 quarantined / 57 unverified / 19 pending_human_verify** | 69% customer-ready. Verification model is working. |
| newest item **created** | **2026-06-21** | Some intake as recently as ~2 wks ago, but… |
| newest **staged_update** | **2026-04-05** | …the scan→stage intake path has produced **nothing in 3 months**. |
| `agent_runs` last 7d | **498 runs across only 39 distinct items** (10 failed) | Generation is alive — but it's a **manual retry loop hammering ~39 items ~13× each**, not healthy throughput. Matches the no-cooldown + verified-desync bugs. |
| items **updated** last 3d | active | Manual regeneration bypasses the pause (by design). |
| `monitoring_queue.change_detected = true` | **0 rows, ever** | Change detection has never fired. "Monitoring" = reachability ping. |
| newest `monitoring_queue` check | **2026-06-28** | Even the reachability cron appears to have stopped ~9 days ago. |
| `system_state` | **`global_processing_paused=true`, `scrape_cadence='off'`, `scrape_start_date=null`** (since 2026-05-18) | **The autonomous loop is OFF at the switch.** Single biggest cause of "zero new items." |
| weakest surface | **regulation 71/133 verified (53%)**, standard 46%, tool 38%; **market_signal strongest 83%** | The flagship surface (Regulations) has the thinnest verified coverage. |
| community | **7 groups (seeded), 0 members, 0 posts, 0 notifications** | Hollow, confirmed. |
| tenancy | **1 org, 2 profiles, 2 memberships** | Single-tenant in practice. |
| `user_watchlist` / `notifications` | **0 / 0** | Dead-end loops confirmed empty (no writer exists). |
| backups in prod | `intelligence_items_pre_phase5` (655), 4 other `_pre_phase5` tables | Migration-era backups never swept. |

---

## 2. CORRECTIONS to the static audit (live DB overturned these)

Being honest both ways — the static passes got three things wrong, and the reason matters:

- **The migration ledger is unreliable — and the inventory is wrong in the *opposite* direction.**
  `supabase_migrations.schema_migrations` **stops at 135**, yet the objects from 146 (`origin`),
  147 (`fetch_status`), 148 (`get_surface_counts`), 150 (`canonicalize_citation_url`), 152
  (`state_cost_facts`), 153 (`signoff_requests`) **all exist in the live schema.** So migrations
  136–153 were applied via direct `db query` **without being recorded in the ledger**, while
  `docs/inventories/migrations.md` simultaneously marks them "NOT YET APPLIED." Both governance
  surfaces disagree with the database. **The DB is the only trustworthy source of truth right now.**
  (S1 governance — §7.)
- **The "#1 most urgent, live data-loss" cross-reference defect is a FALSE ALARM.** The static
  wiring pass predicted every `item_cross_references` write was silently failing because
  migration 146's `origin` column "wasn't applied." Live DB: the column **exists**, and **all 48
  xref rows have `origin` populated.** Writes are succeeding. Retract this finding.
- **BUT the phantom-column reads are REAL.** `intelligence_items.penalty_range`,
  `enforcement_body`, `legal_instrument` exist in **no** migration and **not** in the live schema,
  yet `supabase-server.ts:2209-2212` reads them — they are always `undefined`. That half of the
  finding stands (S3 — §4).

Lesson for every future audit: **verify phantom/unapplied claims against the live DB before acting.**
Static analysis of this repo's migration files cannot be trusted because DDL was applied out-of-band.

---

## 3. GENERATION PIPELINE — the engine is sound, three claims are hollow

Verdict: **the FACT/span grounding moat is real and better-defended than typical** (verbatim span
→ linked pool row → `base_tier`-only resolver → DB-derived floor → non-bypassable cross-item audit
gate). But doctrine over-claims on three fronts, and there is real waste.

- **S1 — The workspace profile is NEVER injected into generation.** `system-prompt.ts:74-84`
  promises briefs "anchored" to the workspace (verticals, mode priority, trade lanes); the user
  message built at `canonical-pipeline.ts:570-581` contains **no profile at all**. Every
  "workspace-anchored" brief is written for a generic imagined forwarder. This is the single
  highest-leverage quality fix in the codebase. `sources_used` and `related_items` mechanics
  likewise describe inputs that aren't passed, so `related_items` is structurally dead (then
  FK-filtered away at `:639-644`).
- **S1 — Re-running a verified item silently desyncs the brief from its certified provenance.**
  Nothing gates the workflow on `provenance_status` (`generate-brief.ts` preflight, `run/route.ts`).
  `generateStep` overwrites `full_brief` while `sectionBrief`/`groundBrief` **skip** on an
  already-verified item (`canonical-pipeline.ts:843,898`) — leaving certified spans grounding the
  *previous* text. Live proof this path is hot: **498 runs on 39 items in 7 days** with no cooldown.
- **S1 — False claims can survive two routes.** (a) `groundBrief` pre-registers **every** URL in
  any section as an `agent_run_searches` stub (`:931-938`), so criterion-2's "an ungrounded URL
  WILL REJECT the brief" is self-satisfied — hallucinated URLs get laundered into verified briefs.
  (b) ANALYSIS-labeled claims require no source and the label check is section-scoped, so one
  labeled sentence whitelists every inference in that section (a fabricated "*Analytical
  inference:* per the IEA…" with an auto-grounded URL passes). The FACT-span path is strong;
  everything labeled ANALYSIS is effectively ungoverned.
- **S1 — The authority-floor moat can be disarmed by the model's own severity choice.** The floor
  applies only when `priority IN ('CRITICAL','HIGH')` (migration 145), and priority derives from
  the agent's own severity emission. A regulation emitted as MONITORING → LOW priority → **no
  floor** → reg FACTs may ground to unregistered/low-tier hosts. F12 doesn't cover this bypass.
- **S3 — Real cost is ~6–10× the documented $0.15/item, and the $5/day cap double-counts.**
  Grounding re-sends the entire ~560K-char source pool to a second full-price Sonnet call with
  **no prompt caching anywhere**; the ledger writes both real per-call costs *and* flat per-step
  estimates, and the daily cap sums both. Prompt-caching the shared source-block prefix is a
  **~40–50% program-spend reduction** and the single biggest cost lever.
- **S3 — Failure-ladder waste:** the thinning-guard restore is immediately CASCADE-deleted by the
  retry it triggers (`H2`); slot-forcing's RELABEL branch is a recorded no-op that guarantees
  quarantine→erase (`H6`); deterministic failures (ledger truncation, missing-slot) pay full
  re-research before erasing. Each is 1–3 wasted Sonnet calls per affected item.
- **S2 — The freshness lever is unreachable:** `run/route.ts:80` starts the workflow without
  `refresh`, so "regenerate" can never actually re-pull a source; MONITORING items with re-check
  windows never refresh. The doctrine's "1h cooldown per source" does not exist in code.

Full detail: 4 CRITICAL, 7 HIGH, 11 MEDIUM findings with file:line in the generation report.

---

## 4. READ LAYER & SURFACES — "a read-only magazine wearing a workbench costume"

The data layer is consistently **ahead of the wiring**. What a paying forwarder gets today is a
fast, honestly-labeled reading experience over a real corpus; almost every *interactive* affordance
beyond navigation is dead or amnesiac.

- **S1 — Workspace overrides never load on reload (RLS-blocked anon SSR read).** Three fetchers
  (`supabase-server.ts:1575, 1723, 1459`) read `workspace_item_overrides` with the **anon** client
  and no JWT; RLS returns `[]`. A customer dismisses a regulation, adds a note, reloads — it's
  back. Index and detail pages then disagree about the same item's priority. (Live: only 3 override
  rows exist, consistent with a feature nobody can rely on.) Fix: use the service client (orgId is
  already authenticated upstream). One-line-per-site.
- **S1 — The Ask assistant (flagship, on all five surfaces) can only ever see the same 30 items.**
  `ask/route.ts:111-141`: context = `order("priority").limit(30)` with **no relevance retrieval,
  no keyword/FTS, no conversation history**, and `order` is TEXT-alphabetical. Every Ask bar funnels
  into an assistant contractually forbidden from answering outside a fixed 30-row slice.
- **S1 — "Your notes · visible to your workspace" is false** — notes are `localStorage`
  (`MarketSignalDetailSurface.tsx:836-880`). "Watch" buttons toggle local state and write nothing;
  the `user_watchlist` table + dashboard widget exist and read live (**0 rows** because there is no
  writer). Both backends already exist.
- **S2 — The provenance moat is invisible on ~80% of the UI.** `Resource.sourceTier`/`sourceName`
  are **never populated by any fetcher**, so tier chips and publisher lines render nothing across
  regulations/market/operations/research/home. One join in the RPCs/`rpcRowToResource`/
  `fetchIntelligenceItem` lights up eight bound-but-dead affordances. This is the product's entire
  differentiator, dark on every surface.
- **S2 — Detail pages ignore the classified columns the DB has** (severity, signal_band, theme,
  trajectory_points, conversion_trigger, what_it_changes — all confirmed present live), falling
  back to regex derivation, so index and detail show **different severity/band labels for the same
  item** (`fetchIntelligenceItem` `select("*")` maps none of them). Market/research trajectory data
  is fetched and never drawn; big price figures are 100% em-dashes (`marketData` never populated;
  and legacy-slug items throw on the price query, C3).
- **S2 — Whole export/share system is dead code** (`ExportBuilder`, `ShareMenu`, `BulkSelectBar`,
  `src/lib/export/*` mounted nowhere). A forwarder's core job is forwarding intelligence to clients;
  today the product exports exactly one markdown file at a time.
- **S3 — Redundant/ignored fetches:** /research runs the pipeline twice and discards a coverage RPC
  it pays for; /operations fetches the entire ~450-row slim corpus to regex-match cross-refs.
- **S3 — Scoring:** two unrelated "urgency" systems coexist unlabeled (DB 1–10 vs client 0–240;
  exports show a bare number differing from the on-screen one); the trust prior blend lets a T1
  gazette decay toward ~50 after routine uptime checks because health-checks count as "signals"
  (`trust.ts:101-111`).
- **S3 — Related-item lists skip the provenance gate** (`research/[slug]`, `operations/[slug]`):
  unverified titles leak into customer views and their links 404.

Full detail: 5 CRITICAL, 8 HIGH, 8 MEDIUM with file:line in the surfaces report.

---

## 5. SOURCE-MONITORING / INTAKE — the core loop, confirmed dead (switch + code)

Verdict: **as coded and configured, "the system monitors sources and autonomously discovers new
content" is not true.** Two independent causes, both confirmed:

1. **Off at the switch (live):** `global_processing_paused=true` + `scrape_cadence='off'` since
   2026-05-18. Every automated path no-ops: check-sources exits, drain no-ops, admin scan 503s,
   generation preflight throws. The hourly cron has been firing into nothing.
2. **Incomplete in code (even if switched on):**
   - **S1 — Change detection does not exist.** `check-sources/route.ts:80` writes
     `change_detected: false` hardcoded, discarding page text (no hash, no diff). Live:
     `change_detected=true` count is **0, ever**.
   - **S1 — Its consumer is dead on both ends.** `reconcile` reads a structurally-empty queue and
     is scheduled by nothing (only 2 jobs in `source-monitoring.yml`), and even if it ran, nothing
     turns an `intelligence_changes` row into a regeneration.
   - **S1 — Approval doesn't generate.** Approving a staged item mints a stub and stops — no
     `full_brief`, no sections, invisible to customers (who gate on `verified`). The single missing
     call: `start(generateBriewWorkflow, [itemId])` after materialization (~5 lines).
   - **S2 — Scan can't materialize + throws away work:** stages 3 columns that don't exist
     (`penalty_range`, `cost_mechanism`, `authority_level` — confirmed absent), collects
     `jurisdiction_iso` then discards it, never resolves `source_id`. Also parses only the first
     content block, which breaks under `web_search` (`scan/route.ts:244`).
   - **S2 — Nothing enumerates new documents inside a portal.** ~55% of registered sources are
     root portals; first-fetch correctly mints nothing from them, and no crawler ever lists deep
     links. New-item discovery has exactly one manual path (admin scan, 4h cooldown).

The encouraging half: generation, grounding, auto-verification, the approval UI, and the cron
plumbing all exist and work. **~1 day of code + one operator setting** turns "cron fires → staged
item → human approves → verified item on a surface" into reality. Change detection (§5 item 1) is
the only genuinely new build.

---

## 6. COMMUNITY / ADMIN / TENANCY — one new S1, lots of hollow

- **S1 — `/api/staged-updates` has NO admin gate.** It's outside `/api/admin/*` and checks only
  `requireAuth()`, then uses the **service-role** client to approve/reject/materialize
  (`staged-updates/route.ts:20-24, 91, 330`). **Any authenticated customer can approve or bulk-
  materialize staged intelligence into production** — a direct violation of "staged updates require
  human review." Add `isPlatformAdmin`. (New; `GAPS.md` #10 said routes were fine because it only
  checked `/api/admin/*`.)
- **S2 — ~5,000 lines of working community UI are orphaned from navigation.** Groups, threads,
  replies, moderation queue, the notifications bell, the realtime layer — all built, all reachable
  only by typing URLs (`/community` links to none of them). There is also **no group-creation path
  at all** and presence reads a column nothing writes. Community's emptiness is *seed-not-run **plus**
  functional blockers*, not just "no data yet."
- **S2 — Admin "Add member by email" writes the wrong row** (discards the email, re-inserts the
  caller; `AdminDashboard.tsx:209-225`) while a **working** member-management backend
  (`/api/orgs/[id]/members`) sits behind an honest-pending panel.
- **S2 — Notifications are decorative:** preferences are never read, `mention`/`promote` kinds
  never fire, there is **no email library in the repo at all**, invites are copy-a-URL.
- **S2 — Verifier sign-off (the "peer signal → citable" moment) is a stub end-to-end** — no admin
  queue, and the community button is hard-disabled.
- **Verdicts:** Community **HOLLOW** · Admin **PARTIAL** (well-gated except the staged-updates hole;
  Jason *can* review/approve staged updates in-browser) · Tenancy **WORKS** (a 2nd org can sign up;
  frictions are email + billing) · Onboarding **PARTIAL** (discards half its input, dead-ends on
  empty community) · Notifications **HOLLOW**.

---

## 7. WIRING & GOVERNANCE — the "half-built" signature, quantified

The pattern the operator named ("half-complete and non-wired builds") is real and measurable:

- **~60 write-only or dead columns** across the core tables — schema and often the *writer*
  shipped, the consuming surface never did. Worst offenders: `sources` trust-scoreboard inputs
  (recomputed from columns nothing increments), `agent_runs` telemetry half (write-only),
  `intelligence_item_sections.source_ids` (always `'{}'`), `agent_run_searches.agent_run_id`
  (never written), `section_claim_provenance.verified_by/at` (verify queue never built),
  `workspace_settings` migration-025 columns (dead despite doctrine claiming them wired).
- **~16 orphaned tables** (forum×3, vendors×4, case_studies×2, taxonomy_nodes,
  community_topic_groups, user_profiles, briefings, org_watchlist, 5 `_pre_phase5` backups) —
  live-confirmed near-empty, flagged on 2026-06-20, **untouched 17 days later** despite the
  "deprecation means deletion" rule.
- **Half-built loops:** `user_watchlist` (read, no writer, 0 rows), `coverage_gaps` (no writer),
  the entire migration-007 notification chain (reads a table nothing writes → writes tables nothing
  reads; the live app uses the separate migration-032 cluster).
- **S1 governance — three sources of truth disagree:** live schema (ahead, through 153) vs the
  migration **ledger** (stops at 135) vs the **inventory doc** (says 146–153 "not applied"). The C3
  consistency check compares files to the inventory, not to the DB, so it structurally cannot catch
  this. `d3_runs` is written by code but created by a DDL file that was never made a migration
  (phantom).
- **S2 security advisors (live):** **1 ERROR** (`security_definer_view` — a view runs as owner,
  bypassing RLS), **13** `rls_enabled_no_policy`, **56** `function_search_path_mutable`, **29+29**
  security-definer functions executable by `anon`/`authenticated`, and **leaked-password protection
  is OFF**. Plus the confirmed **S1 anon-read exposure**: `intelligence_items`, `sources`,
  `staged_updates`, `provisional_sources` all carry `SELECT TO public USING (true)` — the shipped
  anon key reads 128 quarantined + 57 unverified items, 497 provisional sources, and all staged
  updates.

---

## 8. Consolidated S1 register (fix first — the whole list in one place)

| # | S1 finding | Location | Live-confirmed? |
|---|---|---|---|
| 1 | Autonomous loop off at the switch | `system_state` (paused=true, cadence=off) | ✅ |
| 2 | `/api/staged-updates` approval has no admin gate | `staged-updates/route.ts:20-24` | code |
| 3 | Core tables anon-readable (`USING(true)`) — unverified/quarantined/provisional exposed | migration 005 policies | ✅ (live policies) |
| 4 | Worker secret falls back to public `"dev-worker-secret"` | 7 worker/cron routes | code |
| 5 | Workspace profile never injected → no real personalization | `canonical-pipeline.ts:570-581` | code |
| 6 | Re-running a verified item desyncs brief↔provenance | `generate-brief.ts` / pipeline | ✅ (498 runs/39 items) |
| 7 | Hallucinated URLs + ANALYSIS claims can pass verification | `canonical-pipeline.ts:931-938` + mig 145 | code |
| 8 | Workspace overrides RLS-blocked on reload (dismiss/notes lost) | `supabase-server.ts:1575,1723,1459` | ✅ (3 override rows) |
| 9 | Ask assistant sees a fixed 30 items, no retrieval | `ask/route.ts:111-141` | code |
| 10 | Change detection hardcoded false → no autonomous discovery | `check-sources/route.ts:80` | ✅ (0 change rows) |
| 11 | Approval doesn't trigger generation → invisible stubs | `staged-updates/route.ts:330` | ✅ (staged frozen since Apr) |
| 12 | `security_definer_view` (ERROR) + 25 no-policy/search_path advisories | Supabase advisors | ✅ |

The complete S2/S3/S4 lists live in the five subsystem sections above; the sequenced fix order is
in [MASTER-PLAN.md](MASTER-PLAN.md).
