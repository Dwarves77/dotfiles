# MASTER PLAN — Caro's Ledge — 2026-07-07

> The forward plan. Pairs with [DEEP-AUDIT-2026-07-07.md](DEEP-AUDIT-2026-07-07.md) (evidence) and
> the original [GAPS.md](GAPS.md) (top-down list). Answers three questions directly:
> **(A) Does the app do what it says? (B) Is it better than what's out there? (C) What gets it there
> and keeps it there?** Then a sequenced, dependency-ordered execution plan.
>
> Written after a live production-DB audit, so the sequencing reflects real state, not doc claims.

---

## PART A — Does the app do what it says it does?

**Partly. The hard half is real; the loop that defines the product is not running.**

What it *claims* (from doctrine + skills): an autonomous system that monitors public regulatory
sources, discovers new intelligence, generates workspace-anchored briefs where every fact is
grounded in a verifiable source span, and serves five customer surfaces plus a community.

What is **true today** (live-verified):
- ✅ A real corpus: **654 items, 450 verified (69%)**, span-grounded, with a genuinely rigorous
  verification gate (verbatim-span → institutional-tier floor → non-bypassable cross-item audit).
  This is the hard, defensible part and it exists.
- ✅ The generation engine runs (498 runs in the last week).
- ✅ Five surfaces render real, honestly-labeled content; tenancy, auth, and the approval UI work.

What is **not true**:
- ❌ **"Autonomous monitoring."** The loop is off at the switch (`global_processing_paused=true`,
  `scrape_cadence='off'` since May 18) *and* incomplete in code (change-detection hardcoded off,
  approval doesn't generate). New-item intake has produced nothing since **April 5**. The 498 recent
  runs are **manual re-runs of 39 items**, not discovery.
- ❌ **"Workspace-anchored briefs."** The workspace profile is never passed to the model — every
  brief is written for a generic forwarder.
- ❌ **The interactive product.** Watch doesn't watch, notes aren't shared, dismissals don't
  survive reload, the Ask bar sees a fixed 30 items, provenance chips (the differentiator) render
  nowhere, exports are one file at a time, community is hollow.

**Blunt version:** it is an excellent *grounded-intelligence corpus with a reading UI*, mis-described
as an *autonomous monitoring platform*. The distance between the two is connection and completion of
things already built — not new invention.

---

## PART B — Is it better than anything like it in the real world?

**On one axis, potentially yes. On the axes customers actually buy today, not yet.** The honest
competitive read:

**The market has three camps, and Caro's Ledge sits in the gap between them:**

1. **Regulatory-intelligence incumbents** — [Enhesa](https://www.enhesa.com/),
   [3E](https://www.3eco.com/ai-solutions/), Compliance & Risks. Enormous coverage (160+ in-house
   legal experts, 40+ countries, 60+ languages), authored + AI. They win on **breadth and legal
   authority**. They are **generic across industries** — not freight-specific, expensive, enterprise.
2. **AI-native regulatory-change platforms** — [Regology](https://www.regology.com/regulatory-change-agent),
   [4CRisk](https://www.4crisk.ai/regulatory-change-management), [FinregE](https://finreg-e.com/).
   These already ship **obligation-level extraction with source citations** and change alerts.
   Meaning: **"AI + citations" is no longer a differentiator by itself** — the incumbents-of-the-new
   have it. They skew finance/GRC, human-in-the-loop by design.
3. **Freight carbon/emissions platforms** — [Pledge](https://www.netnada.com/post/best-sustainability-reporting-software-for-logistics-transport-companies),
   [Cozero](https://www.cozero.io/blog/cozero-ecotransit-integration),
   [BigMile](https://www.bigmile.eu/blog/best-carbon-accounting-software-logistics), Searoutes,
   EcoTransIT. These do **emissions *calculation*** (ISO 14083 / GLEC), not regulatory
   *intelligence*. They tell a forwarder their CO₂ number; **none tells them what regulation is
   coming and what to do about it.**

**Where Caro's Ledge could genuinely be best-in-class — the defensible wedge:**
> **The only regulatory-intelligence product built *for specialty freight forwarders*
> (art, live events, luxury, automotive, humanitarian), at the exact moment that vertical needs it.**
Nobody serves that intersection. And 2026 is the hardest compliance year in freight history:
[CBAM's definitive regime began Jan 1](https://www.searates.com/blog/post/eu-customs-rules-2026-ics2-cbam),
the [first FuelEU Maritime reporting cycle](https://transport.ec.europa.eu/transport-modes/maritime/decarbonising-maritime-transport-fueleu-maritime_en)
is due, EU ETS maritime surrender is live, and
[30+ emissions trading systems are in force or in development](https://news.yrules.com/en/archives/3930).
Forwarders are being asked by their own customers to itemize regulatory surcharges and they have no
tool that maps *the rule* to *their lane and cargo*.

**Two moats are technically real if finished:** (1) the **verbatim-span grounding + institutional-
tier floor** is stronger provenance discipline than the "AI + citation" competitors typically ship —
*if* the ANALYSIS/URL laundering holes (DEEP-AUDIT §3) are closed and the tier chips actually render;
(2) the **community co-equal with intelligence** is a real answer to freight's information-isolation
problem that no calculator or GRC tool has — *if* it's un-orphaned and seeded.

**The uncomfortable truth:** the competitors' weakness is narrowness-of-fit (generic) and
absence-of-freight-context; Caro's Ledge's weakness is that its differentiators (autonomy, workspace-
anchoring, visible provenance, community) are **the exact things not wired yet.** Right now a buyer
comparing it to Regology sees fewer working features. The wedge is real; the execution to occupy it
is the whole game.

**Verdict:** Not better today. **Best-in-class-capable for one specific, underserved, high-urgency
vertical** — but only after Part C.

---

## PART C — What gets it there, and keeps it there?

Three things, in order. **Get there:** finish the loop and wire what's built. **Be better:** turn on
the two real moats (grounded, freight-anchored briefs; community). **Stay there:** make "wired" and
"honest" structurally enforced so the half-built pattern can't recur.

### C1 — Get there (make the product do what it says)
1. **Turn the loop on and close it** (§Execution Phase 2). One operator setting + ~1 day of code.
2. **Wire what already exists** — overrides, watchlist, notes, provenance chips, Ask retrieval,
   detail-page columns. This is the highest-value week in the codebase: no new features, just
   connecting a data layer that's already ahead of the UI.
3. **Inject the workspace profile into generation.** Turns "generic brief" into the actual product
   promise.

### C2 — Be better (light up the moats competitors don't have)
4. **Freight-anchored briefs:** profile injection (#3) + per-lane/per-cargo exposure
   (`item_timelines` + modes already exist) + deadline countdowns. This is the thing Enhesa/Regology
   structurally don't do and the calculators can't.
5. **Make provenance *visible*** (tier chips + source cards) and **close the ANALYSIS/URL grounding
   holes** so the "every claim is grounded" claim is both true and legible — the one thing that beats
   "AI + citation" competitors.
6. **Un-orphan and seed community**, wire verifier sign-off (peer signal → citable). The only feature
   in the whole market aimed at freight's information isolation.

### C3 — Keep it there (structural guarantees against regression)
7. **A wired-ness fitness function**: every table/column/RPC either has a live consumer or an
   explicit `@orphan`/`@shelved` annotation — CI fails on a third state. This is the direct
   antidote to the "half-built" pattern, and this codebase already has the `.discipline/` machinery
   to host it.
8. **Reconcile the three sources of truth** (live schema ↔ migration ledger ↔ inventory) and make
   the consistency check compare against the **live DB**, not the inventory doc.
9. **An end-to-end loop smoke test** that runs the full cron→stage→approve→generate→verify→render
   path on one item and asserts a verified row appears on a surface — so "the loop works" is a green
   check, not a belief.

---

## EXECUTION PLAN — dependency-ordered, each item scoped for a single focused task

Phases are sequenced so nothing depends on a later item. Effort: **S**=hours, **M**=1–2 days,
**L**=3–5 days. Every data/schema change follows the repo's two-track migration + guarded-write
discipline; **apply migrations through the ledger this time** (see P0-3).

### PHASE 0 — Stop the bleeding (security + governance; do first, this week)
- **P0-1 [S] Kill the `"dev-worker-secret"` fallback** in all 7 worker/cron routes; throw if unset;
  switch `!==` to `crypto.timingSafeEqual`. (GAPS #1/#18; DEEP-AUDIT S1-4)
- **P0-2 [S] Add `isPlatformAdmin` to `/api/staged-updates`.** One check; closes the anyone-can-
  approve hole. (DEEP-AUDIT S1-2)
- **P0-3 [M] Tighten anon-read RLS.** Migration: `intelligence_items` →
  `USING (provenance_status='verified' AND is_archived=false)`; drop anon SELECT on
  `staged_updates` + `provisional_sources`; decide `sources` deliberately. Apply via the ledger and
  record it. Smoke-test the anon/seed read paths. (GAPS #4; DEEP-AUDIT S1-3, live-confirmed)
- **P0-4 [S] Fix the ERROR-level `security_definer_view`**, turn on leaked-password protection, and
  set `search_path` on the flagged functions (batchable). (DEEP-AUDIT §7 advisors)
- **P0-5 [M] Reconcile the migration ledger with the live DB.** The ledger stops at 135 but schema
  is at 153; `migration repair --status applied` for 136–153, update `docs/inventories/migrations.md`
  to match reality, and make C3 compare against the DB. Delete the false "NOT YET APPLIED" notes.
  (DEEP-AUDIT §2, §7 — this unblocks trusting any future migration claim)

### PHASE 1 — Wire what already exists (highest value/effort ratio; ~1 week)
- **P1-1 [S] Overrides read via service client** at `supabase-server.ts:1575,1723,1459`; destructure
  the error. Dismissals/notes survive reload. (DEEP-AUDIT S1-8)
- **P1-2 [M] Provenance join → tier chips + source names** in the workspace RPCs / `rpcRowToResource`
  / `fetchIntelligenceItem`. Lights up ~8 dead affordances; makes the moat visible. (DEEP-AUDIT S2)
- **P1-3 [M] Map the classified columns in `fetchIntelligenceItem`** (severity, signal_band, theme,
  trajectory_points, conversion_trigger, what_it_changes — all confirmed present live) so detail
  pages stop disagreeing with index and stop regex-guessing. (DEEP-AUDIT §4)
- **P1-4 [S] Delete the 3 phantom-column reads** (`penalty_range`/`enforcement_body`/
  `legal_instrument`) or add the migration; they're always `undefined`. (DEEP-AUDIT §2)
- **P1-5 [M] Watchlist + workspace-notes write routes.** `/api/watchlist` (POST/DELETE) so Watch
  buttons + the dashboard widget work; point NotesField at `workspace_item_overrides.notes`. Both
  read-backends already exist. (DEEP-AUDIT S1)
- **P1-6 [L] Make Ask real:** Postgres FTS (`websearch_to_tsquery` over title/summary/full_brief)
  scoped by question + workspace jurisdictions/sectors; pass conversation history; segment the rate
  limit. The flagship interaction. (DEEP-AUDIT S1-9)

### PHASE 2 — Close the autonomous loop (the core product claim; ~1 week + 1 setting)
- **P2-1 [S] Operator: set `scrape_cadence` + `scrape_start_date`, clear `global_processing_paused`,
  confirm GHA secrets.** Nothing below matters until this. (DEEP-AUDIT §5)
- **P2-2 [S] Fix scan output parsing** (join all `web_search` text blocks) and **paginate the two
  dedup reads**. (DEEP-AUDIT §5)
- **P2-3 [M] Make approval materialization sound:** strip-or-add the 3 phantom scan columns, stage
  `jurisdiction_iso`, resolve `source_url`→`source_id` at mint. (DEEP-AUDIT §5)
- **P2-4 [S] Wire approve → generate:** `start(generateBriefWorkflow, [itemId])` after a successful
  `new_item` materialization. **This one call closes "human approves → verified item on a surface."**
- **P2-5 [M] Schedule the scan** (worker-secret variant of `/api/admin/scan` + a 3rd job in
  `source-monitoring.yml`). Cheapest route from "cron fires" to "staged item appears for approval."
- **P2-6 [L] Build change detection** (the one genuinely new organ): content-hash column,
  check-sources fetches via the transport ladder + flips `change_detected` on hash change; a
  reconcile job; reconcile enqueues `generateBriefWorkflow(itemId, refresh=true)`.
- **P2-7 [S] Add per-item cooldown + thread `refresh`** through `/api/agent/run`; short-circuit on
  `provenance_status='verified'` unless refreshing. Fixes the 498-runs/39-items waste and the
  verified-desync. (DEEP-AUDIT S1-6)

### PHASE 3 — Brief quality & the moats (be better; ~2 weeks)
- **P3-1 [M] Inject the workspace profile** (+ a compact candidate related-item list) into the
  synthesis prompt. Single highest-leverage quality change. (DEEP-AUDIT S1-5)
- **P3-2 [M] Close the grounding holes:** restrict criterion-2 URL auto-stubbing to known hosts;
  require pure-inference ANALYSIS labels to prefix the claim; make the reg-family floor unconditional
  on `item_type` not model-chosen priority. (DEEP-AUDIT S1-7)
- **P3-3 [M] Prompt-cache the shared source-block prefix** (synthesis→ground→re-ground). ~40–50%
  program-spend cut; also fix the double-counted daily cap. (DEEP-AUDIT S3)
- **P3-4 [M] GAP-verification + emit-GAP-for-RELABEL + thinning-terminal:** stop good briefs dying on
  criterion technicalities; verify deadline/penalty GAPs against the pool. (DEEP-AUDIT §3)
- **P3-5 [L] Freight-anchored value:** per-lane/per-cargo exposure + deadline countdowns as a home
  widget and a Regulations sort. The competitor-proof feature. (DEEP-AUDIT §4)
- **P3-6 [M] Restore export/share** to the ledgers (or delete the dead system per doctrine and extend
  the working single-item export to multi-select + HTML briefing).

### PHASE 4 — Community, notifications, cleanup (round out; ~2 weeks)
- **P4-1 [M] Un-orphan community:** link `/community` → browse/groups/moderation; add a group-create
  path; mount the built realtime layer and the notifications bell. Seed regional rooms.
- **P4-2 [M] Fix admin add-member** (route to invitations) and wire the honest-pending members panel
  to its existing backend.
- **P4-3 [L] Wire verifier sign-off** end-to-end (admin queue + the migration-153 consumer).
- **P4-4 [M] Notifications:** read preferences before dispatch, add an email provider (Resend/
  Postmark), fire the missing `mention`/`promote` kinds, or explicitly scope email to "later" in UI.
- **P4-5 [S] Sweep the orphan graveyard** (16 tables + ~60 dead columns + `_pre_phase5` backups) per
  "deprecation means deletion." (DEEP-AUDIT §7)

### PHASE 5 — Keep it there (structural guarantees; ongoing)
- **P5-1 [M] Wired-ness fitness function** (`@orphan`/`@shelved`-or-consumed, no third state).
- **P5-2 [M] End-to-end loop smoke test** asserting a verified item reaches a surface.
- **P5-3 [S] Error-drop lint guard** for `const { data }` without `error` (108 live instances; the
  named bug-class still has no automated guard). (GAPS #9)
- **P5-4 [M] Database backup** — confirm/enable PITR + a weekly `pg_dump` job. (GAPS #15)

---

## Sequencing rationale (why this order)

- **Phase 0 first** because two S1s are security-exposed *right now* (public secret default,
  anyone-can-approve, anon reading unverified rows) and the ledger reconciliation is what makes every
  later migration claim trustworthy.
- **Phase 1 before Phase 2** because wiring the read layer is the highest value/effort ratio in the
  whole plan and needs no loop — it makes the *existing verified corpus* feel like a product this
  week, independent of intake.
- **Phase 2 before Phase 3** because there's no point improving brief *quality* until new briefs are
  actually being *produced* by the loop; and profile injection (P3-1) wants the loop live to matter.
- **Phase 4/5 last** because they round out and protect, but nothing above depends on them.

**First two weeks, if you do nothing else:** Phase 0 (secure + reconcile) + Phase 1 (wire what
exists). That alone converts "a corpus with a reading UI" into "a working freight-intelligence
product for one org," with the moats visible — enough to put in front of a design-partner forwarder
while Phase 2 turns the autonomy back on.
