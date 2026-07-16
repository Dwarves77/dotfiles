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
`GROUNDING_ACQUIRE_ENABLED` **OFF**; `MONTHLY_SPEND_CEILING_USD` **$130, code-only, frozen** (operator ruling
2026-07-13, flag-system item 0 — raised from $75; the raise removes a stale-ceiling false-red, it does **not**
unlock spend; MTD $75.25 ≈ 58% of $130); Phase 3 **CLOSED** (ADR-013 — do not run regardless of older notes);
the loop/cadence flip is the operator's word only.

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
| — | **Audit-ruled corpus repair** (ISO conflation; 727 dead-cite re-point; 671 null-source dispositioned; ReFuelEU twin dedup; Q1–Q4 cleanup + tier-machinery strip on 63 briefs; hold #11 URL fix) | DONE (this PR) | branch `remediation/audit-ruled-corpus-repair`; close [remediation-close-2026-07-15](audits/remediation-close-2026-07-15.md); [ADR-014](decisions/ADR-014-wave-acceptance-sampling.md) accepted | $0 unit; **8 recurrence items → hardening dispatch** (tier-machinery-in-customer-prose, archive-provenance-flip-guard-collision, standard-own-body-exemption-unwired, chrome-capture-adapter, + 4 mint-class); priced re-ground queue enumerated; PR merges **after #337** |
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
  - **#303 false-red fix (2026-07-13):** the `workflow_dispatch` verify caught the frozen-and-quiet step
    exiting 1 *after* printing the ✓ — the summary block's trailing `[ -n "$rows_md" ] && {…}` returned 1 on
    empty rows (the normal frozen-and-quiet state) and `bash -e` made it the step exit. Fixed (`if` + explicit
    `exit 0`); health logic unchanged; re-verify green.
  - **Ceiling $75 → $130 (operator ruling 2026-07-13, flag-system item 0):** the $75.25 freeze was reporting
    against a superseded ceiling. Updated BOTH homes — `MONTHLY_SPEND_CEILING_USD` (spend-client.ts, the hard
    gate) and `MONTHLY_CEILING_USD` (spend route, the gauge). Does **not** unlock spend: `GROUNDING_ACQUIRE_ENABLED`
    (the master gate) stays OFF, and no paid call is authorized. Gauge now reads MTD $75.25 at ~58% of $130, frozen=false.

- **Flag-system investigation + rulings (2026-07-13) — read-only census → per-mechanism rulings.** The 902/903
  open `integrity_flags` are **22 mechanisms**, largely one underlying item-set seen by several detectors (336 of
  528 subject_refs carry 2+ mechanisms; all 290 skill-conformance subjects are also provenance-quarantined) — so
  the earlier "drain to zero" exit was WITHDRAWN (it targets detector output, not causes). Live vs historical splits
  on arrival timestamps. Operator ruled per mechanism; execution sequenced as: **Unit A** (item 0 ceiling + item 1
  seed-fallback producer fix) → **flag-system-honesty unit** (items 2–5: skill-conformance re-baseline, RD-6 renewal
  enforcement, historical-terminal closures, the flag-age audit that closes the dwell gap) → item 6 (register-step-gap
  scoped, not built) → item 7 (First Movers Coalition merge, on sight).
  - **Item 1 (seed-fallback) — LIVE producer fix:** diagnosis found 119/127 open flags were `null_orgId` on the
    homepage `/` — **anonymous / no-org renders of a public page**, expected traffic mis-filed as `data_integrity`.
    Fix: route `null_orgId` to console telemetry (never an integrity flag); genuine degradations (rpc_error/timeout/
    exception) still flag; `service_role_missing` is structurally un-self-recordable (logged LOUD as `[UNRECORDABLE]`).
    Drop point `resolveOrgIdFromCookies` can't split anonymous from authed-no-org — that split is its own unit if ever needed.
  - **Dwell gap (the enforcement finding):** `quarantine-disposition-audit` enforces dwell on quarantined *items*
    (RD-4/RD-6), NOT on open-flag *age*. The two biggest blocks — skill-conformance (240, on verified items) and
    seed-fallback (127, `surface`-scoped) — are structurally invisible to it, so 450 flags >30d trip nothing. The
    ruled **flag-age audit** (item 5) closes this across all subject_types.
  - **What actually landed → see §7.** The plan above was executed as **Unit A (#304)** + **Unit B (#306)** +
    the diagnosis paired-fix (#307); §7 carries the live queue, the Unit-2 lineage, and the REJOIN.

---

## 7. Flag-system program + live queue (operator-ruled, 2026-07-13)

The flag-system investigation is **superseded as a "drain to zero" exit** and re-expressed as discrete units.
**Unit 2's original three-class scope (skill-conformance / seed-fallback / historical-terminals) is superseded**
by: the read-only **investigation** → **Unit A** → **Unit B** → the **pending backlog disposition**. That is the
real lineage; the §2 "Unit 2 (flag resolver)" row is the autonomous-engine unit, a different thread — do not
conflate the two.

**Landed this session (all $0, CI-green; master `00658a8` at start of the register-step build):**

| Item | Unit | State | Evidence |
|---|---|---|---|
| 0 ceiling $75→$130 + 1 seed-fallback `null_orgId` routed out | **Unit A** | DONE/MERGED | #304 |
| 2 skill-conformance C1 SSOT re-baseline (82 resolved / 65 RD-28-held-mint) · 3 RD-6 renewal enforcement · 4 historical-terminal closures (121 null_orgId, 26 exhaustion, 11 b-audit) · 5 flag-age dwell audit + RD-30 · 7 FMC-1b (keep A/B/C + xrefs) | **Unit B** | DONE/MERGED | #306 |
| diagnosis paired-fix (proxy 503 guard, React #418, prefetch, service-client memo) | — | DONE/MERGED | #307 |

**Live queue (operator-corrected order 2026-07-13):**

1. **Register-step-gap unit** — **DONE/MERGED #309** (SC-13). Deterministic-only register-at-grounding
   (`codifiedTierForHost` + `decidePoolHostRegistration`); ambiguous hosts worklist, never a guessed tier; flag
   text corrected to the live query. Probe gate cleared (floor fails-closed on NULL both directions; guessed-5
   census clean — 0 verified items rest on a guessed tier).
2. **Backlog-disposition dispatch** — **LANDING (this PR)**. Applied to the LIVE partition (which diverged from
   the ruling's stale assumptions — see the PR judgment log). 336 past-bound → **60 RD-28-held** (skill-conf on
   live-verified) + **20 quarantined-item-exempt** (new flag-age boundary: quarantine-disposition-audit owns
   live-quarantined item-flags) + **256 closed** (199 archived-item / 51 deleted-subject / 5 seed-fallback / 1
   entity-gate, all attributed). 48 expired deferrals → 2 renewed (live, register-step reopener) + 46 closed-moot;
   +82 valid-future moot deferrals closed; 5 orphaned deferrals deleted. **124 guessed-5** surfaced as one FK-safe
   review-batch flag. **flag-age + deferral-hygiene both GREEN at exit.** register-gap was **52 live not 182**
   (item-6 stale). **Part A backfill BLOCKED** on the bound reconciler credential (standing DDL-window item) —
   root-cause code fix (`archivePatch` resets status on archive) lands go-forward; backfill re-runs when the cred
   is restored.
3. **ISR detail-cache unit** — `$0`, independent of the grounding lock. The **ceiling-removal** fix for the
   `/regulations/[slug]` 503 mechanism (prefetch fan-out → uncacheable render → Supabase saturation). #307's
   trivials reduced the *trigger* only; this unit removes the ceiling (ISR / cacheable render). Ruled its own
   unit in the diagnosis routing; had fallen off the queue — re-added here.
4. **Vault unit** — docs graph cross-linking backfill (markdown relative links, ADR-010 amendment) + graph triage
   + session-close mechanization (SessionEnd/Stop hook, `/start`, done.md amendment, CLAUDE.md working rule).
5. **MCP cred-indirection** — `~/.claude.json` github + supabase servers to env indirection (copy-first → verify
   → delete literals; HALT if the schema doesn't support env refs). Closes the SF-11 residual.

**REJOIN (so no future session mistakes the hygiene queue for the program):** after the backlog disposition, the
**next sanctioned grounding run** (operator-fired, `GROUNDING_ACQUIRE_ENABLED` ON with a pre-logged I2
justification) realizes the register-step **flip** AND resumes **Unit 3's** remaining keepers in the same run.
From there the **standing sequence** resumes — **T9 accounting** (re-specced against T8's conduction map),
**registry-expansion execution**, the **T10 units** (§2), the **coverage floor**, and the **launch clauses (10)**.

**Stale-verified finding — DIAGNOSED + CORRECTED (2026-07-13, read-only diagnosis then ruled).** The earlier
"168 of 382 stored-`verified` fail the live validator, customer reads gate on `verified`" was **over-stated on
the customer-facing part**: the customer gate is `is_archived=false AND verified`, and **all 168 (now 200) are
`is_archived=true`** (162 `reclassified_to_source` / 4 `error_page_artifact` / 2 `source_not_item` — portals +
fetch-error artifacts). **Customer-visible stale-verified = 0** (182 customer-visible verified items, all pass
the live gate). So the drift is **cosmetic** (an archived row kept `provenance_status='verified'` — the archive
path never reset status), not a customer-facing breach. Root cause: `archiveRows`/`reclassifyToSource` didn't
reset status → fixed go-forward (`archivePatch`, mig-43-safe target `unverified`). Overlap with the backlog
populations = **0** (0 register-gap null-tier spans, disjoint from quarantine by status, 0 open item-flags).
New scoped audit `scripts/verify/stale-verified-audit.mjs` (is_archived=false) mechanizes the customer-visible
metric (currently GREEN). The archived-row backfill is BLOCKED on the reconciler credential (standing item).

---

## Economy-of-information session — LANDED (2026-07-13; PRs #314 `b67b673` + #315 `c51fde2` merged, prod green)

**Three units, both PRs squash-merged, Vercel prod green, spend-model live behind the OFF acquire lock.**

1. **Floor recalibration — SC-14 / migration 202.** `validate_item_provenance` scopes the `standard` floor to the
   item's OWN authoring body (institution_id SSOT): a standard FACT grounds at the standards-body tier (4) only on
   its own body, never a same-tier UNRELATED host. Monotonic + standard-only. **Applied live**; non-regressive
   (30/30 verified stay valid; non-standard controls unchanged); **recovered c3 (GRI) + c4 (ISO 14083) to verified
   at $0**. JS mirror `authorityFloorForFact` + accept/reject golden.
2. **Operator-priced spend model — RD-31 + RD-32; doctrines `operator-sets-cost` + `data-existence-before-acquisition`.**
   ALL standing dollar figures RETIRED as limits (monthly ceiling, per-item breaker, daily cap). The paid path
   requires an operator-priced line (operator-set cost + inventory-miss citation) — the machine never proposes /
   defaults / anchors a price; it REFUSES without both, before the acquire lock. spend-watch = pure alarm on any
   paid row not traceable to a priced line. Gauge reports MTD actuals as information (no denominator). **Refusal
   verified on the live deploy ($0).**
3. **Free-pass tooling ($0).** holdings-inventory (what we hold vs what grounding needs) + the free-pass
   re-attribution decision core (verbatim span ∧ primary-instrument-class `officialnessOf` path-a ∧ error-body-clean;
   goldens for the three rejection/accept cases). DRY-RUN = **0 genuine flips** — the moat working: holding a string
   ≠ holding the floor-qualifying primary (portal snapshots clean to chrome; corroborators are sub-floor).

**The manifest is the live decision point (operator's pen).** `scripts/tmp/acquisition-manifest-2026-07-13.md`
(regenerable) — 35 non-verified residual, FACTS ONLY (document / size / work-scope, **no machine price**):
23 ACQUIRE / 8 RE-SYNTH / 4 RE-GEN, with skip-or-defer flags (paywall / portal / program-page lines marked
non-purchasable; the `0 KB` T1-gazette holes marked worth-pricing). Nothing acquires until the operator prices a line.

**Delegated-pricing successor — REGISTERED as the named pre-Unit-5 gate.** `operator-sets-cost` is build-phase
correct but launch-INCOMPATIBLE: cron autonomy (Unit 5) cannot wait for a per-item pen. BEFORE Unit 5, a DELEGATED
PRICING POLICY must be ruled — the operator sets rules once (e.g. "new instruments from registered T1/T2 sources
ground automatically up to $X per class; anything outside policy queues as a priced line"); the machine executes
within them; spend-watch alarms outside policy. Same authority (operator's), moved from per-line to policy-level.
Flagged now so it lands deliberately, not improvised when the cron unit arrives.

**Operator-parked (nothing machine-runnable until one is unblocked):**
1. **Manifest pricing** — price / skip / defer lines (all three are $0-valid states).
2. **124-host guessed-5 scan** — re-tier the ambiguous-host review-batch (the 44-host pattern).
3. **MCP cred-indirection** — fresh-session four steps (env-copy → rewrite → restart → verify → delete literals).
4. **Reconciler DDL window** — restores the bound reconciler credential (unblocks the archived-row provenance
   backfill + the reconcile lane; 0 customer impact meanwhile).

---

## $0 work queue — items 1/2/4 landed; Unit 0c queued (2026-07-13, session 2)

**Item 1 — 124-host guessed-5 batch (PR #317).** 34 hosts registered at ruled class-rule tiers (gov T2 / lawfirm+news+corporate T7 / analysis T6 / association T4); 6 → permanent worklist; batch flag `fda0f86b` resolved; ~84 zero-span governed lazily by the **SC-13 class-table extension** (`classTierForHost` + `decidePoolHostRegistration` lazy-registration + golden). CORRECTION LOGGED: my first surface under-counted (readClient 1000-row cap) — true span-bearing was **38 not 6**; halted + re-ruled with the operator before writing.

**Item 2 — 44-host expansion (PR #318): was NOT executed; now completed.** The null-tier-host worklist (43 flags) had never been registered. Completed via the class rule: 4 gov→T2 (+15 NULL spans re-stamped — `english.www.gov.cn`/`samr.gov.cn` the real recoveries), 4 inherit, 1 HALT (`eesc.europa.eu` — europa.eu super-domain granularity), 35 → worklist. Two fake-cert risks caught in DRY-RUN before writing: `law.cornell.edu` (Cornell LII) mis-minting T4 via the `.edu` rule → fixed to legal-aggregator→worklist (evaluated before academic); the europa.eu collapse halted.

**Item 4 — T9 8/8 accounting: CANNOT certify (report-the-gap, no close manufactured).** DB evidence: (a) the 8-stage flow is unspecced (T9 re-spec against T8's conduction map still pending); (b) **0 source-less live orphans** — the "two rows" referent is gone (re-sourced/archived; Unit-3 work, never the flow-close population); (c) **0 `manual-intake-run` agent_runs** — the machine-gated cutover has never executed. Structurally blocked on Unit 0c.

**STANDING RULE REFINEMENT (item-2 lesson, ruled 2026-07-13):** *A confirmed operator ruling is an OPEN thread until its execution report lands* — a ruling is not done when spoken, only when executed-AND-reported, and rulings get board entries the same as builds. (The 44-host expansion was "confirmed mid-Unit-3" yet never executed; the gap surfaced only because item 2 forced an execution-verify. Absent that, a spoken-but-unexecuted ruling reads as done.)

**T9 DRY-PROOF CLAUSE DEPENDENCY (recorded):** T9's intake dry-proof clause closes AFTER **(a)** Unit 0c ships the machine-gated cutover AND **(b)** the first machine-gated run carries rows through the full flow to verified — never before. Until both, 8/8 cannot be certified because no run evidence exists.

**NEXT SESSION — FIRST UNIT: Unit 0c ($0), 5 parts, per-part verification:**
1. Retire the human-approval path — `src/app/api/staged-updates/route.ts` POST approve/reject → `410 Gone` (machine gates ARE the approval, RD-20); GET (visibility) stays.
2. Fix the `DashboardAwaitingReview` customer-surface leak — remove from `HomeSurface.tsx:228` + `page.tsx:40` `getAwaitingReview()` prop threading.
3. Relabel human-gate copy → visibility across 6 sites: `AdminDashboard.tsx:114`, `IntegrityFlagsView.tsx:170`, `ResearchPipelineQueueView.tsx:153`, `UserProfilePage.tsx:264`, `FlagsRejectionsQueue.tsx:49`, `AdminIssuesRail.tsx:63/70`.
4. Admin phrase-scan fitness function (SOFT review signal) + ruled allowlist (emergency-stop, SC-3 override, Community controls) + golden.
5. Board same-PR.

---

## Unit 0c — PARTLY LANDED; Parts 1 & 3 HALTED on unnamed surfaces (2026-07-13, session 3)

**Landed (this PR):**
- **Part 2 — customer-surface leak FIXED.** `DashboardAwaitingReview` removed from the customer home (`HomeSurface` mount + `page.tsx` prop-threading + component deleted); tsc clean, no orphaned fetch (`getAwaitingReview` left as a reserved `/admin` accessor, uncalled in the customer render — not an RD-9 render-path dead fetch).
- **Part 4 — admin phrase-scan (SOFT) SHIPPED.** `scripts/lib/admin-phrase-scan.mjs` (pure core + ruled allowlist: emergency-stop / SC-3 override / community-is-human-space) + golden 3/3 + `scripts/verify/admin-phrase-scan.mjs` (report-only, **always exit 0** — never fails the build). Currently flags 10 human-gate phrases: the correct review signal for the un-retired gates below.

**HALTED (per the stop condition — the scope's premise did not hold):**
- **Part 1 — a LIVE caller exists.** `AdminDashboard.tsx:222–242` `handleUpdate()` POSTs `{id, action: approve|reject}` to `/api/staged-updates` — the human-approval UI is still wired. A `410` would break it. The route stays; retiring it requires also retiring the AdminDashboard approve/reject UI (unscoped).
- **Part 3 — coupled to Part 1 + a SECOND live gate.** (a) Part 3 relabels copy to "the machine did it / visibility, not a gate" — but the human gates are STILL LIVE (Part 1 halted), so the relabels would LIE; land WITH the retirement, not before (reverted). (b) `ResearchPipelineQueueView` is a LIVE publish/archive human-gate (`publish()`/`archive()` buttons, "Published — item is now on customer surfaces") — a second human-approval path unnamed in Part 1. (c) Several of the six sites are LEGITIMATE human controls (integrity-flag resolution, spot-check human pass), not intake gates — relabeling them machine-gated would be false.

**T9 dependency (update):** the machine-gated cutover (`runIntakeCycle`/`manual-intake-run`) is NOT shipped — Part 1 halted, the human-approval path remains, 0 machine-gated runs exist. T9's "first machine-gated run" gate stays UNMET.

**Operator ruling needed to unhalt Parts 1+3:** whether to retire the two live human-approval UIs — AdminDashboard approve/reject AND ResearchPipelineQueueView publish/archive — replacing them with visibility-only (the machine-gated cycle), OR keep them. The route `410` + the copy relabels land WITH that decision.

---

## Unit 0c — COMPLETE (2026-07-13, session 3, unhalt PR)

All five parts landed (the halts lifted by operator ruling). $0.
- **Part A — EESC:** `eesc.europa.eu` registered at T3 (advisory-agency precedent; europa.eu super-domain is institution-distinct in `institution.ts`, so no collapse); 1 span re-stamped, flag resolved. The europa.eu granularity halt is CLOSED.
- **Part 1 — human-approval path RETIRED:** `/api/staged-updates` POST → 410; AdminDashboard's approve/reject UI converted to visibility-only (staged · machine-gated; resolves materialized / rejected-with-reason / routed-to-flag). RD-20's residual closed.
- **Part 3a — Research Pipeline publish/archive RETIRED** (entry-29 conformance): the editorial gate was the violation. `pipeline_stage` is VESTIGIAL — the customer read gate is `provenance_status='verified'` (data.ts), not pipeline_stage — so removing the human publish stranded nothing. Pre-convert state reported: 2 live draft items (1 verified/already-visible, 1 quarantined → machine path), 9 archived drafts. The view is now machine-pipeline visibility.
- **Part 3b — relabel split:** intake-gate sites → machine-gated visibility (AdminDashboard staged, Research Pipeline, AdminIssuesRail staged/provisional). Legitimate-human-control sites → **may-act** ("the operator may resolve / review / spot-check", never "needs a human pass") — integrity-flag resolution, spot-check; controls stay.
- **Part 4 — phrase-scan** (from PR #320) re-run post-relabel: **0 residuals** (10 → 3 false-positives on negation/retirement copy → allowlist refined for negation context; golden +1). The SOFT signal is clean.

**T9 line update:** Unit 0c is COMPLETE. The machine-gated intake cutover now exists (approve/reject retired, machine cycle is the path). **The FIRST machine-gated run is the last gate before T9 closes — awaiting the operator's word** (it spends, so it waits on the sanctioned-run go). Until then, 0 machine-gated runs = T9 stays open by evidence, not by missing mechanism.

---

## Standing $0 batch — 5 items (2026-07-14)

Operator batch: run everything $0, log judgments in PR bodies, one consolidated handoff. Execution-report rule applied per thread.

| # | Thread | State | Execution report |
|---|---|---|---|
| **1** | **VAULT UNIT** — session-memory mechanization (SessionEnd hook, /start PROGRAM-BOARD boot, done.md born-linked+board+commit steps, CLAUDE.md prior-art rule) + ADR-010 pt2 + dead-link triage | **LANDED** | **PR #322** (squash `8bdcc43`), CI green. Docs-graph link backfill was already #310 (606 links / 112 docs); this unit did the session-memory half. |
| **2a** | **Re-attribution worklist** — enumerate the live population behind flag `f5a56b11` | **LANDED (logged)** | this PR — [reattribution-worklist-2026-07-14](./ops/reattribution-worklist-2026-07-14.md): 42 FACT spans / 13 items on wikipedia/legiscan/policycommons at the retired `?? 5` T5 stamp. No sweep write to verified briefs (judgment logged). |
| **2b** | **registerCitedSources `?? 5` guess** — credibility-vs-grounding split | **LANDED** | this PR — `source-growth.ts` base_tier now keys off `classTierForHost` (known class → row at class tier; unclassified → `provisional_sources` worklist, never a guessed T5 `sources` row). Golden `register-step.test.mjs` +2 (11/11), tsc clean. |
| **2c** | **Board debt** — execution-report rule on open ruled threads | **LANDED** | this section. |
| **2a-followon** | **reattribution-relabel** — verified remediation unit ($ or model): per item re-home to cited primary (span-match) else relabel FACT→ANALYSIS, re-run `validate_item_provenance`, let re-quarantine fall. Ordered research_finding (sub-floor) → floor-exempt verified → quarantined (held). | **QUEUED / not-started** | no commit; deferred out of the sweep because it mutates 10 verified customer briefs (needs four-part verification, not a bulk write). Doc: reattribution-worklist-2026-07-14. |
| **3** | **Acquisition manifest → one decision sheet** (Section 1 RE-SYNTH 8 / Section 2 ACQUIRE-worth-pricing / Section 3 SKIP-FLAGGED, empty PRICE boxes) | **OPEN — awaits operator's pen** | decision sheet authored this batch (location in handoff); prices are the operator act. |
| **4** | **MCP indirection prep** — exact run-sheet (env-copy → rewrite `~/.claude.json` env → restart → verify github+supabase → delete literals) | **OPEN — operator executes** | run-sheet authored this batch; the verify-before-delete needs a Claude Code restart (unverifiable in-session). Closes the SF-11 residual. |

**Judgment logged (2a):** the sweep SURFACED a live defect (37 of 42 fake-cert T5 spans sit on VERIFIED customer briefs) but did NOT rewrite them. Mutating verified `claim_kind`/`source_id` triggers a `validate_item_provenance` re-run + re-quarantine cascade on the customer surface — a consequential write that needs its own verified unit (production-surface-verification + four-part standard), not a sweep line. Terminal disposition here = "leave held + log" (the worklist doc + the pre-existing flag `f5a56b11`). The go-forward mint is fixed (2b), so the population cannot grow.

---

## Wave 2 concurrent-race recovery + archive-collision reconciliation (2026-07-15)

Branch `remediation/wave2-model-column`; recovery commit **`4ec4f41`** + Step-8 doctrine/board commit. Docs:
`docs/audits/wave2-concurrent-race-incident-2026-07-15.md`, `docs/audits/wave2-archive-collision-reconciliation-2026-07-15.md`.

| Thread | State | Evidence / next |
|---|---|---|
| **Wave 2 recovery (Steps 1-8)** | **DONE** | Dedup 36 race-dupes (zero corpus-wide after); Nashville 0→41 + Fjords 0→43 recovered; **run-lock migration 205** (RD-38 + golden, both halves proven live); close-gate scan clean (no verified item held). Spend $28.76/$60. |
| **Archive-collision reversal** | **DONE** | 19 Wave-2 items un-archived (guarded; Polish→verified). Bounded to 19 today (the 436/201-verified archive population is HISTORICAL, not today). |
| **Reconciliation package** | **DELIVERED** | Read-only forensics: an un-guarded raw disposition actor archived 19 in-window items; content-repair Tasks 1/3/4/7/8/9 show no execution evidence; **ISO 14083 (Task 3) NOT run — false claim still live, uncorrected**. |
| **Step 5 deferred residue** | **QUEUED** | 37 C3-floor candidates deferred to post-Task-2 $0 re-stamp (host registration is the lever). |
| **Hardening unit H1-H6** | **QUEUED — next** | H1 claim-uniqueness, H2 atomic ground writes, H3 mint-time accuracy gates, H4 single entrypoint, **H5 mutation leases**, **H6 mutation attribution + gate the raw write path that permitted today's flips**. Own PR + board. Precondition for the 60→400 coverage-floor expansion. |
| **Corpus-wide 436-archive sweep** | **DEFERRED (operator-owned)** | Separate future unit, sample-verify-first, priced after launch-clause sequencing. NOT the Wave-2 agent's. |
| **ISO 14083 correction** | **DEFERRED (audit-agent-owned)** | Task 3's VERIFIED-mutation authorization sits with the audit agent; flagged un-run. |
