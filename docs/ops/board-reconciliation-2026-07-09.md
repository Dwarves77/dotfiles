# Full-Board Status Reconciliation — 2026-07-09

> **Audit executed 2026-07-10** (read-only). Filename honors the dispatch's requested path; the as-of
> timestamp is 2026-07-10. Every claim below carries evidence — merged PR#, commit hash, live-DB read-back,
> CI run, or ledger row — or is marked **UNVERIFIED**. No writes beyond this committed report. Scrape hold
> LIVE, loop OFF, zero fetches, zero mints, zero spend confirmed at source-of-truth (below).

**Method.** Repo: `C:/Users/jason/dotfiles`, product at `fsi-app/`. Master HEAD =
**`4d35120`** (`#268` conservation-audit merge, 2026-07-09 01:17 EDT). Live DB = Supabase project
`kwrsbpiseruzbfwjpvsp` (Caro's Ledge). Governing skills loaded this session: `caros-ledge-platform-intent`,
`remediation-discipline` (the action-time skill gate required them before the DB read channel; the gate
fired correctly and is itself a verified finding — Section D).

---

## A. AGENT / WORKTREE SWEEP

**Uncommitted work anywhere: essentially none.** Every one of the 21 worktrees is git-clean. The only
untracked file across all trees is `docs/Untitled.canvas` in the main tree (a stray Obsidian canvas; not
work product). No collision-by-shared-uncommitted-edit exists — there is nothing to collide.

**Worktrees (21):** 19 under `.claude/worktrees/agent-*`, 1 under `.worktrees/wt-audit-chrome`, plus the
main tree. State:

| Class | Count | Merge state | Disposition |
|---|---|---|---|
| `feat/redesign-t01..t11` agent worktrees | ~13 | **All merged** (redesign waves #201/#205/#209/#215/#219/#223/#227 all in master) | **ORPHANED — cleanup candidates** (work landed; worktrees never removed) |
| Worktrees pinned at `8c8d4c1` (#206 4d-gate) | many | `8c8d4c1` **is** an ancestor of master (verified `git merge-base --is-ancestor`) | ORPHANED — cleanup candidates |
| `agent-ae855c…` `feat/batch1-runner` | 1 | **LOCKED**; tip `d0f066a` **NOT merged** (verified) | Genuinely unmerged batch-1 runner; the lock is why it survived cleanup. Dormant — batch-1 is an operator go-line switch (§C). **Leave locked.** |
| `.worktrees/wt-audit-chrome` (`chore/spec-audit-user-chrome`) | 1 | pushed branch | Chrome spec-audit work; clean. |

**Current checked-out branch (main tree):** `chore/reground-runner-and-mig163` @ **`f66ad74`** —
**unpushed**, 1 commit ahead of `origin/master`, 0 behind. This is the in-flight reground work (§B-2a).
Clean tree. **HALTED, not mid-execution** — safe; nothing to interrupt.

**Collision risk:** no two live worktrees share uncommitted edits (all clean). One superseded-duplicate
pair exists in branch history: `feat/redesign-t10-account` (v1) vs `feat/redesign-t10-account-v2` (v2) —
only v2's work merged (#223 `f4de637`); v1 was superseded. Cosmetic; both merged/orphaned now.

**Stashes (14) + ~50 local branches:** large dangling backlog, mostly May–June WIP (`stash@{13}` is on
`master`; `stash@{0..12}` on old `fix(ui)/*`, `redesign/*`, `phase-c/*` branches). Many local branches are
`: gone` upstream (merged + remote-deleted). **Cleanup backlog — none blocking, none touched.**

---

## B. DISPATCHED-WORK LEDGER (2a–2k)

### 2a — 65-item re-ground · **IN-FLIGHT, correctly HALTED**
- **Proof item: attempted, correctly rejected.** Commit `f66ad74` (2026-07-10): the one-item proof (per
  binding-3) picked the **1 `analysis_missing_label_syntax` outlier**, which grounding cannot fix ($0
  cost, no change) → **invalid proof item, batch stopped.** The 65 = **62 `fact_below_authority_floor`
  (the re-groundable floor class) + 2 `missing_required_slot` + 1 label outlier.**
- **Batch state: not run.** "Zero batch spend ($0.00; ledger unchanged $43.04)." Confirmed against live DB
  (§C).
- **Reconciler path: authored, blocked on RLS.** `scripts/_reground/reconcile-revalidate.mjs` (reconciler
  cred, NO-DOWNGRADE-BYPASS, dry-run default) — reconciler connection **proven reachable**
  (`current_user=reconciler`). The flip verified→quarantined **errored on RLS**: `set_provenance_status`
  (SECURITY INVOKER) inserts the quarantine flag as the reconciler role, which has an `intelligence_items`
  UPDATE policy but **no `integrity_flags` INSERT policy**.
- **Blocker: migration 163** (one-line reconciler INSERT on `integrity_flags`) — **AUTHORED, NOT APPLIED**;
  RLS/break-risky → operator DDL window per ADR-011.
- **Live truth:** the Data-audit lane on master (ran 2026-07-10 09:43) fails with
  **"65 item(s) whose stored `provenance_status` disagrees with validate()"** — this IS the live 65-count
  today (was **63** on 7/9 per conservation-audit; +2 from the-18 retypes, §D drift).

### 2b — Lane acknowledgment mechanism + standards-change CI doctrine · **BUILT; lane is RED**
- **Mechanism = the "Live-data audits" (Data-audit) lane** + the deferral system
  (`scripts/lib/deferral.mjs` `isValidDeferral`/`assertValidDeferral`, invariant RD-6): a **valid
  time-bounded deferral acknowledges a blocked item without failing the lane**; an undispositioned crossing
  fails it. **Standards-change CI doctrine = the status-is-a-cache rule (RD-5):** *any migration changing a
  gate/slot input must ship a corpus revalidation.*
- **Seeded with the 65? NO.** The 65 are **not** deferred/acknowledged — they are the hard-failing
  status-disagreement set. **40 items ARE deferred** (standing, valid — e.g. `o4` CII until 2026-10-31,
  owner=operator).
- **Lane color RIGHT NOW: 🔴 RED** on master HEAD `4d35120` (CI run 2026-07-10). **Why:** (1) 65
  status-disagreements; (2) **"7 NEW undispositioned crossings [g33, t1, autonomous-connected-freight,
  battery-electric-vehicle, marine-fuel-decarbonisation, …] + 1 RESURRECTED (deferral expired)."** This is
  the gate **doing its job** (flag-rate ≠ defect-rate) pending the operator-gated reground + drain.
- **Not blocking:** the Data-audit lane is **not one of the 4 required checks** (§C), so RED here does not
  block merges. It is the standing "work remains" signal.

### 2c — DATA_AUDIT_BLOCK / generation preflight · **BLOCK CONDITION OPEN (moot under loop-off)**
- The data-audit lane is RED (2b) → the block condition the generation preflight gates on **is open**.
- **Moot at runtime:** generation is independently halted (`global_processing_paused=true`,
  `scrape_cadence='off'`, §C), so nothing is generating regardless. **Action owed:** the lane must be
  driven green (reground the 65 + dispose the 7 crossings) **before** the loop flip, or generation preflight
  will block on it the moment the loop turns on. Flag at loop-flip time. (Reference: `DATA_AUDIT_BLOCK` in
  `docs/design/systemic-fetch-and-loop-audit-2026-06-28.md`.)

### 2d — Conservation-audit rulings 2a–2e (`conservation-audit-2026-07-09.md`, merged `#268`)
| Ruling | State | Evidence |
|---|---|---|
| **3 attribution conflicts** (span-dups differing source/kind) | **PENDING ruling** — left for operator, NOT deleted | Doc §"Executed now". **DB note:** grouping `(item,section,span,claim_text)` with >1 distinct source/kind now returns **0** — the 3 may be resolved or defined at span-not-claim level (§D anomaly). |
| **4 near-dup pairs** (same jurisdiction + title-stem) | **PENDING ruling** — reported, NOT auto-deleted (Fit-for-55 lesson) | Doc Axis-3 |
| **Identifier backfill + URL-dedup ratification** (defect-class #6) | **PROPOSED, NOT ratified** — `instrument_identifier` 95% empty (13/288); dedup actually held by URL-uniqueness (0 dup URLs) | Doc defect-class #6; no ratification record found |
| **Key-figure store design** (U-06) | **NOT STARTED** — BUILD GAP, 0 tables/0 columns; needs a design pass | Doc Axis-1 + remediation #4 |
| **51 archive disposition notes** | **DEFERRED (low-value)** — NOT backfilled; **confirmed 51 in DB** (366 archived: 315 with reason / **51 without**) | Doc §"Gated by credential-binding guard"; DB read §C |
| **88 dup claim rows** | **ENACTED** (guarded, zero-spend) | `section_claim_provenance` **8,773→8,685** — **verified in DB (§C)** |

### 2e — Instance fixes F-1, D-1, D-2, Q-1, Q-2, Q-3
| ID | State | Evidence |
|---|---|---|
| **F-1** (fabricated-source class) | ✅ **MERGED — PR `#267`** (`a1d8d84`) | Parser fix + render-trust gate at 4 renderers + CI detector; corpus sweep = **97/103** reg-family briefs carried the two-table defect |
| **D-1** (admin `display_name` chain) | ⏳ **NOT MERGED — "in wave"** | site-gap-register row; no fix commit on master past `#268` |
| **D-2** (Sources count two-homes) | ⏳ **NOT MERGED — "in wave"** | same |
| **Q-1** (tier vocab two-homes on cards) | ⏳ **NOT MERGED — "in wave"** | same |
| **Q-2** (two unlabeled gap numbers) | ⏳ **NOT MERGED — "in wave"** | same |
| **Q-3** (casino off-domain signal) | ⏳ **NOT MERGED — "in wave"**; casino delete **NOT executed**, sibling relevance sweep **NOT run** | same |
> Only **F-1** is done. D-1/D-2/Q-1/Q-2/Q-3 remain the un-started remediation wave. The site-gap-register
> is itself a **SKELETON** ("detail rows cut in transmission, arrive from Jason") — U-01..U-06, U-08..U-10
> are `⏳ AWAITING DETAIL`.

### 2f — Phase-7 dead-code erase · **NOT STARTED (design/in-flight)**
- Code **not** deleted; erase migrations **not** authored; orphan checker is **green by allowlist, not by
  deletion.** The producer-consumer-orphan gate (F14, RD-9) first-run report (2026-07-03) **grandfathered**
  `notification_deliveries` / `bulk_imports` / `ingestion_control_log` pending Phase-7 disposition — "it
  does not authorize deletion" (invariant text). Register: "Phase-7 dead-code erase (in flight, Unit 2)."

### 2g — Section-7 backend units ×6 (ban/role guards, activity events, mode tags, state-cost facts, supersessions feed, price feed) · **UNVERIFIED / in-flight**
- Register lists "Section-7 backend ×6 (in flight, Unit 3)." **No per-unit build evidence located** on
  master (no dedicated merged PRs found for these six). Marked **UNVERIFIED** pending the register's detail
  rows. Do not assume built.

### 2h — Loop-flip drain builds · **SCOPED, NOT BUILT (dormant by design)**
- **Provisional promotion (489 sources, 0 ever promoted)** — BUILD GAP; no cron promotes
  `provisional_sources`. **Quarantine drain (48)** — `regen-quarantined.mjs` is manual-only, not
  cron-wired. Both are **operator/loop-flip-gated** (conservation-audit remediation #3). Scoped; not built;
  correctly dormant behind the loop off-gate.

### 2i — Community · **template-11 wiring INCOMPLETE; launch brief NOT delivered**
- **Template 11 schema-mapping report = GATE/report only** (`#209` `b420590`, `community-schema-mapping.md`).
  **Verifier sign-off wired to the live table** (`#227` `23f7ff9`). Community browse/moderation un-orphaned
  (`#247`). But full Template-11 **wiring is not complete** and the **launch brief is not delivered**
  (register "Community launch prep, Unit 4, in flight"). Redesign surface merged; content/launch pending.

### 2j — U-11 B.2 regeneration · **HALTED; ledger accounting DELIVERED ($0)**
- Reported 88/293 is a **static historical progress count** (batch ran ≤ 2026-07-07); **not live, not
  spending.** `agent_runs` = 0 in 24h (DB §C). **Ledger accounting (owed twice): delivered — "nothing to
  post, active in-flight spend = $0."** Remaining ~205 requires a re-launched batch (loop-flip + batch-1
  go-line). Envelope = batch-1's quote on authorization.

### 2k — Registers · **committed; docs/ IS the Obsidian vault**
| Register | Path | State |
|---|---|---|
| Site-gap register | `docs/ops/site-gap-register-2026-07-09.md` | Committed (INDEX'd); **SKELETON** |
| Conservation-audit | `docs/ops/conservation-audit-2026-07/conservation-audit-2026-07-09.md` | Committed `#268` (INDEX'd) |
| Baseline traceability mapping | `docs/ops/chrome-audit-2026-07/traceability-matrix-2026-07-07.md` | Committed; **superseded as baseline** by the site-gap register (retained as phase-0-5 source data) |
| Browser-verification checklist | `docs/ops/browser-verification-pending.md` | Committed |
| Deletion/reclassification log | `docs/ops/deletion-reclassification-log.md` | Committed |
> `docs/` **is** the Obsidian vault (CLAUDE.md: "Project memory… read in Obsidian"). Committing to
> `docs/ops/` **is** the Obsidian mirror; no separate copy exists or is needed.

---

## C. MONEY + SAFETY STATE (all live-DB / CI verified)

| Item | Value | Evidence |
|---|---|---|
| **Ledger total (all-time)** | **$43.04** | `sum(agent_runs.cost_usd_estimated)` live — exactly matches commit `f66ad74` "ledger unchanged $43.04" |
| **Spend MTD (July)** | **$39.39** | live DB — ⚠️ contradicts U-11's "$0 MTD per /admin" (§D drift) |
| **Spend last 24h** | **$0.00** | live DB — no active spend |
| **Ceiling** | **No hard ceiling set**; **$50/mo recommended** (flip-readiness) | Enforced-in-code by the spend chokepoint (RD-10/F15) when set. MTD $39.39 ≈ 79% of the $50 rec; a $9.50 reground would bring July to ~$48.89 — **tight, still under.** |
| **Unticketed spend found** | **None** | all spend ≤ 2026-07-07; runner authored-not-run |
| **Scrape hold** | **LIVE** — `scrape_cadence='off'` | `system_state` singleton (id=true) live read |
| **Loop** | **OFF** — `global_processing_paused=true` | `system_state` live read |
| **Zero-mint** | **CONFIRMED** — last item minted **2026-06-21**; 0 in 24h / 0 in 3d | `max(intelligence_items.created_at)` live |
| **Runs** | 1,628 all-time · 615 in 30d · **0 in 24h** · last **2026-07-07 16:40 UTC** | live DB — matches conservation-audit exactly |
| **Branch protection** | **INTACT** — enforce_admins=**true**; **4 required checks** | `gh api …/branches/master/protection`: *Discipline engine unit tests · Fitness functions (application-layer enforcement) · Validate commits against discipline rules · HARD — detector discrimination + SSOT units* |
| **F15 allowlist size** | **9** | `LEGACY_ALLOWLIST` in `.discipline/fitness/functions/F15-spend-chokepoint.mjs` on master (matches `#251` "allowlist 9"; invariants.mjs residual text still says "12" = stale doc, §D) |
| **Discipline suite on master `4d35120`** | **4 required checks GREEN**; ⚠️ **Data-audit lane RED** (non-required) | `gh run list --branch master`: *Discipline engine ✅ · Bug-class guard ✅ · Data-audit lane ❌×2* (RED reasons = §B-2b) |

---

## D. DB-VS-REPORT SPOT-CHECK (5 load-bearing claims, re-verified live 2026-07-10)

| # | Prior report claim | Live DB now | Verdict |
|---|---|---|---|
| 1 | **88 dup claims deleted** (8,773→8,685) | `section_claim_provenance` = **8,685** | ✅ **CONFIRMED** (exact) |
| 2 | **366 archived-with-disposition** | 366 archived = **315 with reason + 51 without** | ⚠️ **DRIFT (imprecise claim)** — "366 archived-with-disposition" conflates total-archived with dispositioned; real = **315 dispositioned / 51 undispositioned** (matches conservation-audit's own split) |
| 3 | **0 null-field sources** | `sources` null(name/url/base_tier) = **0** (of 1,193) | ✅ **CONFIRMED** |
| 4 | **exactly-one-surface** (0 no-surface) | verified-live = **240**, null item_type = **0** | ✅ **CONFIRMED** — but the count **evolved 251→240** (closeout 7/8 said 251; conservation-audit 7/9 + DB now = 240; explained by subsequent archival incl. the-18). Closeout's "251" is now stale (§ANOMALY) |
| 5 | **the-18 enactment 4/9/5** | **4** live `technology` items; **5** archived (**2** `off_domain` + **3** `reclassified_to_source`) | ✅ **CONFIRMED** (4 technology + 5 archived; the 9 domain-fixes are surface-reroutes, briefs untouched) |

---

## E. COLLISIONS / ANOMALIES

1. **Data-audit lane RED on master** (non-required, so non-blocking): 65 status-disagreements + 7 new
   undispositioned quarantine crossings + 1 resurrected. Expected (gate working; reground halted, loop off),
   but **must be driven green before the loop flip** or generation preflight will block (§B-2c).
2. **the-18's 4 `technology` retypes are ALL now quarantined** (technology floor=5; DB: technology items=4,
   verified=**0**, quar=**4**). The closeout decision table (§47–53) retyped them for format-fit but the
   retype dropped them below the technology authority floor. **Un-flagged consequence — surface to operator:**
   a research_finding→technology retype trades one surface for a quarantine unless it clears floor=5.
3. **MTD spend drift:** U-11/site-gap-register state "$0 MTD per /admin"; live `agent_runs` show **$39.39**
   spent in July (all ≤ 7/7). The "$0" conflated *no-new-dispatch-spend* with MTD. No safety impact
   (24h = $0), but the number is wrong.
4. **verified-live count 251 → 240:** closeout (7/8) headline 251 is stale after the-18 + surface-visibility
   archival; current truth is 240 (conservation-audit + DB agree).
5. **63 → 65 status-disagreements:** conservation-audit (7/9) said 63; lane (7/10) says 65 (+2 from the-18
   retypes). The dispatch's "65" is the current number; "63" was the 7/9 snapshot.
6. **2 byte-identical residual provenance groups** the 88-row dedup did not remove (DB: strict-key
   `(item,section,span,claim_text,source_id,claim_kind)` with count>1 = 2). Minor; a handful of rows, not 88.
   The "3 attribution conflicts" left for ruling now group to **0** under `(…,claim_text)` — likely resolved
   or defined at span level; worth an operator glance.
7. **21 orphaned worktrees + 14 stashes + ~50 stale local branches** = cleanup backlog (redesign waves all
   merged; branches `: gone` upstream). **Do not delete yet** (per dispatch) — flagged for a cleanup pass.
   One worktree correctly **LOCKED** (feat/batch1-runner, genuinely unmerged, dormant).
8. **`invariants.mjs` F15 residual text says "12 legacy sites"** but the live allowlist is **9** — stale
   doc-string drift (harmless; the enforced array is authoritative).
9. **Action-time skill gate is a hard dependency for DB reads from outside the project root.** This session
   (rooted at `C:/Users/jason`, not `fsi-app/`) was **denied the MCP `execute_sql` read channel** until
   `caros-ledge-platform-intent` + `remediation-discipline` were loaded via the Skill tool — and those
   skills were only *registered* after reading files under `fsi-app/.claude/skills/`. The gate treats
   `execute_sql` as a write (fail-closed; it fails the read-only name regex). **Working as designed**, but a
   reconciliation dispatch launched from the home dir must load the two skills first or every DB read is
   blocked. (The gate does **not** fire inside subagents/workflows — documented limit; mutations must run in
   the gated main session.)

---

## F. SINGLE PRIORITIZED NEXT-ACTION LIST

1. **Operator DDL window: apply migration 163** (reconciler `integrity_flags` INSERT). Unblocks the reground
   flip. Break-risky RLS — operator-gated per ADR-011. *(Owner: operator)*
2. **Re-run the 65-item reground with a VALID proof item** (a `fact_below_authority_floor` item, not the
   label outlier), then the batch of 62. Reconciler-cred path, pool-recoverable → **zero fetches**,
   Sonnet-only, **~$9.50** (over the $5 line → go-line). Drives the Data-audit lane toward green. *(Gated on
   #1 + batch go-line)*
3. **Dispose the 7 new undispositioned quarantine crossings + 1 resurrected** (incl. the 4 quarantined
   `technology` retypes — decide: keep as technology and source to floor=5, or revert the retype). Clears the
   lane's hard tripwire. *(Owner: operator ruling + reconciler path)*
4. **Rule on the pending conservation-audit items** (3 attribution conflicts, 4 near-dup pairs, URL-dedup-as-
   SoT ratification). Zero-spend once ruled.
5. **Complete the F-1-follow-on remediation wave** (D-1, D-2, Q-1, Q-2, Q-3) — merge-on-green, and land the
   site-gap-register **detail rows** (U-01..U-10) so the NOT-ADDRESSED headline can be computed.
6. **Before flipping the loop:** confirm the Data-audit lane is GREEN (or all reds validly deferred), or
   generation preflight (`DATA_AUDIT_BLOCK`) will block. This is the gate between "build done" and "loop on."
7. **Housekeeping (non-blocking):** cleanup pass for the 21 orphaned worktrees + 14 stashes + stale local
   branches; fix the two doc drifts (F15 "12"→9; the "$0 MTD" line). Leave the locked batch-1 worktree.

---

## Value Delivery Check

=== Value Delivery Check ===

This dispatch's work does **NOT** directly advance customer-facing value delivery.

This is a read-only status-reconciliation / governance audit. It produces one committed report and touches
no customer-facing surface (Regulations, Market Intel, Research, Operations, **Community**, Map, Intelligence
Assistant, Onboarding). The customer-facing value gap is unchanged by this dispatch. The threads it
reconciles that DO gate customer value — the 65-item reground (accuracy of verified Regulations/Research
items), the F-1-follow-on wave, and Community Template-11 completion — are owned by their respective
build/remediation dispatches (§B, §F), not by this audit.

Dual-posture: the audit serves the operator role and is cohort-neutral. No current-vs-expansion narrowing.

---

## Related
- [[program-closeout-2026-07-08]] · [[site-gap-register-2026-07-09]] · [[conservation-audit-2026-07-09]]
- [[flip-readiness-2026-07-08]] · [[deletion-reclassification-log]] · [[browser-verification-pending]]
