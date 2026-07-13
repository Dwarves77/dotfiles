# Program Board — Caro's Ledge

**This board is the resume state.** No session should ever need chat archaeology to know what thread is
open, closed, or deferred.

> **STANDING RULE (binding).** Every session that opens or closes a thread — or moves one between
> ACTIVE / QUEUED / DEFERRED / DONE / CLOSED — **updates this board in the same PR** that does the work.
> A thread state that lives only in chat or a closeout is a board defect; capture it here. Counts are STATE
> (query /admin or the live surface); this board carries thread *state*, not live numbers.

**Provenance:** reconstructed 2026-07-13 from the **repo itself** — merged PR titles/bodies, the ADR index
(`docs/decisions/`), the doctrine register (`fsi-app/.discipline/governance/doctrine-register.mjs`),
`invariants.mjs`, `docs/tech-debt-log.md`, the closeouts under `docs/ops/*`, and `git log --all`. Not from
chat, not from memory. Anything that exists only in chat is flagged **chat-only** below — that is itself a
finding. Master tip at reconstruction: `e3b3a74`.

**Standing constraints (2026-07-13):** `$0` default — the answer to "should I spend" is **no**;
`GROUNDING_ACQUIRE_ENABLED` **OFF**; `MONTHLY_SPEND_CEILING_USD` **$75, code-only, frozen** (July exceeded
at $75.25); Phase 3 **CLOSED** (ADR-013 — do not run regardless of older notes); the loop/cadence flip is
the operator's word only.

---

## 0. Taxonomy finding (read first — it shapes the whole board)

**The operator's "T1–T12" program numbering is almost entirely a CHAT overlay. There is NO repo document
that enumerates a T1–T12 thread list.** Only **T7** and **T8** are anchored to work by a *verbatim* commit
tag. "T4–T7" exists only as a **range title** (PRs #282/#283) whose commits use a different internal
scheme. **T1, T2, T3, T9, T10, T11, T12 have no repo evidence as threads** (their meaning lives in chat).

Both "T" and "C" are **heavily overloaded** — do not conflate:

| Symbol | Scheme A | Scheme B | Scheme C | Scheme D |
|---|---|---|---|---|
| **T*n*** | operator **program threads** (this board) | source **Tiers** T1–T7 (credibility model) | **redesign templates** t01–t11 (surface mockups) | design **tranches** T1–T4 (`docs/design/decision-package-2026-07-06.md`) |
| **C*n*** | **Community** blocks C5–C9 (`docs/plans/C*-spec.md`) | **Wave-α pipeline tracks** C1–C8 (`wave-alpha-closeout`) | **Ruling-2 hygiene clusters** C3/C5/C9–C14 (`hygiene-residual` audit) | — |

Where the operator says "T10 Units 1–5" the repo calls it **"Autonomous Disposition Engine (Units 0–5)"**
(`docs/ops/wave-alpha-closeout-2026-07-11/closeout.md:127`) with no "T10" tag. Where the operator says
"C3/C5/C9–14 deferral" the repo means the **hygiene clusters** (Scheme C), not the community blocks.

---

## 1. Master thread table (actual repo work; operator T-label annotated where it exists)

| Operator label | Thread (repo name) | State | Evidence | Deferral / next |
|---|---|---|---|---|
| — | **Redesign / surface migration** (templates t01–t11) | DONE (integration waves) | #215/#219/#223 (+ waves); `redesign/full-migration` line | STATUS.md is stale to this thread |
| T1–T3 | *(no repo thread evidence)* | **chat-only** | none found (`T1–T3` hits = source-tiers / registrations) | definitions live in chat — capture when next referenced |
| T4–T6 | **Dead-code disposition + doctrine sweep** (range) | DONE/MERGED | PRs **#282** `d5a473f` / **#283** `1daabc9` (title "T4-T7"); internal commits use C1/C3/C4/C7/C8 + "Ruling 1/2" | range title only; no discrete T4/T5/T6 commit |
| **T7** | **Dead-code / dead-weight deletion pass** | DONE/MERGED | *verbatim:* `f384966` "chore(T7): delete 5 verified-orphan files"; `c749842` "perf(T7): drop 1.23 MB seed JSON" (in #282/#283) | tail deferral → see DEF-1/DEF-2 |
| **T8** | **Conduction census** (route/cron/workflow → live-invoker + gate-state) | **CORE LANDED** — honest core recovered from `f8698c0`, re-verified vs post-rebuild master, on master | doc `fsi-app/docs/ops/conduction-census-2026-07-13.md` + wake-proof `scrape-schedule.test.mjs` (4/4). Ruling 1 = #286 | breadth **still deferred-registered** (line-weight table, ARCHITECTURE.md one-pager, sediment policy, CI census check) — none taken this pass |
| **T9** | **Machine-flow close** ("N/8 stages flowing; both orphans through full cycle") | **NOT STARTED — no artifact** | none. Only referent: "the two T9 orphans" = grandfathered source-less rows (`source-link-invariant.mjs GRANDFATHERED_SOURCELESS`), **re-sourcing assigned to Unit 3** | **see §3 — cannot be closed; premise unmet** |
| **T10** | **Autonomous Disposition Engine (Units 0–5)** | Units 0/0b/0c CLOSED; 1–5 mixed (see §2) | closeout `:127`; PRs #274–#280 | per-Unit in §2 |
| T11, T12 | *(no repo thread evidence)* | **chat-only** | none (`T11/T12` hits = redesign templates / tiers) | T12 flagged "deferral" in chat — capture when referenced |
| — | **Intake correctness (Steps 1–5)** | DONE/MERGED | #281 `4d52105` — one URL canonicalizer, retro-adjudication, one grounding contract, golden gates, plan/apply | paired with the T4–T7 sweep (#282/#283) |
| — | **Wave-α full-system correction** (12 P1s + 23 migrations + guards + C7/C8) | DONE/MERGED | #270 `2c51d7d`; closeout `wave-alpha-closeout-2026-07-11/` | C7 paid recovery HALTED 1/9 (pool-insufficiency) → handed to Disposition Unit 3; Units 0–5 queued here |
| — | **Reconciliation remediation** (65-item backlog dispositioned, lane GREEN) | DONE/MERGED | #269 `71bcbd4`; closeout `reconciliation-remediation-closeout-2026-07-11.md` | **open unit:** reconciler credential broken post-mig-157 → operator DDL window owed |
| — | **Snapshot-first grounding rebuild** | **CLOSED** | #295 `19c6b33`, #296 `11c3864`, #297 `ae9a85d` (ADR-013), #298 `e3b3a74` | grounding-acquisition only; source-tooling fetchers OUT of scope (tech-debt 2026-07-13). Phase 3 CLOSED |
| — | **Community pre-adoption (C-blocks)** | mostly DONE; C9 removed | see §4 | — |

---

## 2. T10 — Autonomous Disposition Engine, Units 0–5

Definitions: `docs/ops/wave-alpha-closeout-2026-07-11/closeout.md:127`.

| Unit | Definition | State | Evidence | Gating / next |
|---|---|---|---|---|
| **0 / 0b / 0c** | doctrine register + meta-gate (unenforced-doctrine=FAIL); F16 two-caller signed exception; staged-transit max-age (RD-20, "no-human-finish-of-intake" ENFORCED); explicit F16 caller-thread | **CLOSED / DONE** | #274 `d50fc10`, #275, #276 `6425b74`, #277 `957defb`, #280 `bc2a5fe` | — |
| **1** | 489-provisional triage resolver | **QUEUED / not-started** | no build commit; `doctrine-register.mjs:283` "lands with Unit 1"; `dormancy-register` R-2 re-homes 36 rows to "Unit 1's candidate population"; gap-register P1#2 | build owed; also unblocks `evaluateDemotion.critical_conflict` stub (CLAUDE.md) |
| **2** | flag resolver (859+ flags) | **QUEUED**; only **2a** (operator-control credential binding) authored, **NOT applied** | routing target `invariants.mjs:666`; **2a** = #285 `fe14552` "AUTHORED, not applied" | 2a apply is operator-boundary (needs mig 201 + `OPERATOR_CONTROL_DATABASE_URL`). Flag-hygiene population (47 expired-open + 62 deleted-subject) = correction-plan rider 5, unresolved |
| **3** | 62-quarantine → recover-or-delete (zero-survivors) | **ACTIVE — not zero-survivors yet** | #291 `119a501` ("…Unit 3"); regen-quarantined snapshot-first `d7bf9f3`; snapshot tooling #295–#296 | the 62 carry valid RD-6 deferrals **`deferred_until 2026-10-31`** (event-bound to batch-1 enacted-primary re-fetch at hold-lift). Also owns re-sourcing the **two T9 orphans** |
| **4** | queue honesty | **QUEUED / not-started as a discrete unit** | no distinct commit; partially covered by RD-20 (landed in 0b `957defb`) | discrete build not started |
| **5** | standing cron autonomy | **QUEUED / not-started (named residual)** | no build commit; `doctrine-register.mjs:301` D-4 "ENFORCEMENT-TO-BUILD (Unit 5 daily-cron observability)… REVISIT at Unit 5"; `:283` D-2 satisfied only when U5 lands | needs cron + stored age-series; "alerts only if a resolver fails" |

---

## 3. T9 — status: **NOT CLOSED (evidence incomplete)**

The dispatch asked to formally close T9 *iff* the machine-flow evidence exists ("N/8 stages flowing; both
orphans verified through the full cycle"). **It does not.** Findings:

- **No T9 commit, branch, or artifact exists** in the repo (both independent sweeps + direct search agree).
- The only concrete referent is **"the two T9 orphans"** = two 2026-07-12 grandfathered source-less live
  rows recorded in `source-link-invariant.mjs GRANDFATHERED_SOURCELESS` (cited by `doctrine-register.mjs:369`
  + `invariants.mjs:692`). Their **re-sourcing is explicitly assigned to Unit 3, "not this doctrine"** — and
  they carry deferrals to **2026-10-31**. They are therefore **NOT "verified through the full cycle"**; they
  are grandfathered exceptions awaiting Unit-3 re-sourcing.
- There is **no "8-stage flow-number" artifact** anywhere.

**Ruling applied (per dispatch): report what's missing, do not manufacture a close.** For a genuine T9
close, what's needed: (a) a decision on whether T9 is a *distinct* thread or is *folded into Unit 3* (no
artifact decides this today); (b) the two orphans actually re-sourced + re-ground through the full cycle to
`verified` (blocked by their 2026-10-31 deferral / batch-1 hold-lift); (c) an N/8-stage flow map with
per-gate evidence refs — which does not exist yet and would be Unit-3/census work.

**T9 respec note (operator ruling 2026-07-13, not spec'd yet):** T9 is to be **re-specced against T8's
conduction map** (`conduction-census-2026-07-13.md` — the machine that actually exists on master, not the
07-12 machine). Its candidate rows **must be non-grandfathered** — the two grandfathered source-less orphans
are Unit-3 re-source work and cannot be the flow-close population. Do not spec T9 until that re-spec is
dispatched.

---

## 4. Community & hygiene C-schemes (disambiguated)

**Scheme A — Community blocks** (`docs/plans/C*-spec.md`):

| Block | State | Evidence |
|---|---|---|
| C5 feed | DONE/BUILT | spec "Live" (mig 030); feed in `/community/[slug]` |
| C6 promote | DONE/BUILT | spec "Implemented"; mig 041 + promote route/UI |
| C7 notifications | DONE/BUILT | mig 032; #247 `34612f0` (un-orphan browse + moderation) |
| C8 moderation | DONE/BUILT | spec "Files shipped"; reports routes + RLS |
| C9 realtime | **REMOVED / DEFERRED** | #258 `3bf9b20` "C9 removed" (no-half-built doctrine; polling is the working consumer). Spec header is **stale** |

**Scheme C — Ruling-2 hygiene clusters** (the operator's "C3/C5/C9–14 deferral"): C3 done (`d23cfbc`
service-client consolidation); C10–C14 = deliberate hygiene follow-on tail (C10 effective_tier =
doctrine-sanctioned inline, not a defect; C11 safeJson / C12 uiId / C14 retry = deferred; C13 already
consolidated). Owner: next hygiene pass. *(Scheme B — Wave-α tracks C1–C8 — all landed in #270/#282.)*

---

## 5. Registered deferrals (durable)

- **DEF-1** — 13 redesign-remnant worktrees (`feat/redesign-t01..t11`), dwell to **2026-08-10**, owner
  orchestrator (`docs/ops/registered-deferrals-2026-07-11.md`).
- **DEF-2** — 10 stale stashes → ride to **Wave-β B1**.
- **T7 tail** — dead-weight erase riders (Wave-γ E1–E7 + governance riders 1–6, `correction-plan.md`).
- **Reconciler credential** — operator DDL window owed (SELECT policies on validator inputs + WITH-CHECK
  root-cause); `reconcile-revalidate.mjs` unsound until fixed.

---

## 6. Open questions / honesty flags

- **T1–T3, T11, T12** are chat-only — no repo thread evidence. Capture their definitions here the next time
  the operator references them.
- **T8 census** core is now **landed + re-verified on master** (`conduction-census-2026-07-13.md`); the
  breadth (line-weight table, ARCHITECTURE.md, sediment policy, CI census check) stays deferred-registered.
- **T9** — distinct thread vs folded-into-Unit-3 is undecided (see §3).
- `fsi-app/STATUS.md` is stale (April editorial migration); `docs/ops/session-log.md` stops at 2026-07-11
  (does not cover the 07-12/07-13 work). This board supersedes both for thread-state resume.
- Live counts (489 provisional / 859 flags / 62 quarantine / 37 live-quarantine) are STATE — query /admin;
  and per ADR-013 always state the archival predicate (live-only vs status-only).
- **R0.2 observability — spend-watch fixed + sanctioned-window semantics (2026-07-13):** the daily spend
  probe was permanent-red (alarmed at `pct ≥ 80%` on the frozen $75 ceiling, MTD 100.3%). Verdict is now the
  pure, tested `spend-health.mjs` against the acquisition-freeze baseline (`2026-07-13T02:05:26Z`, env
  `SPEND_FREEZE_SINCE_ISO`): **frozen-and-quiet** (0 paid rows since freeze) = PASS; **sanctioned window** (paid
  rows since freeze but `GROUNDING_ACQUIRE_ENABLED` ON AND every row carries a pre-logged I2 justification) =
  PASS + enumerated in the job summary; **leak** (any paid row while the lock is OFF — justified-but-lock-off is
  still a leak — or an unjustified paid row while lock ON, or an unreadable gauge) = FAIL. This is the
  probe's August behavior, defined before August needs it. Surface-honesty probe un-skipped on the daily cron.
  When the operator opens a sanctioned window then re-freezes, move the baseline forward.
