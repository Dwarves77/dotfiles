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
| **Hardening unit H1-H6** | **QUEUED — next** | H1 claim-uniqueness, H2 atomic ground writes, H3 mint-time accuracy gates, H4 single entrypoint, **H5 mutation leases** (DONE — migration 211, RD-38), **H6 mutation attribution + gate the raw write path that permitted today's flips**. Own PR + board. Precondition for the 60→400 coverage-floor expansion. |
| **Confidentiality-marking detector (capture-gate)** | **QUEUED** | Screens fetched content for explicit third-party-disclosure-prohibition language before staging into `agent_run_searches`, analogous to the roadblock-detection gate already wired into primary acquisition. Origin case: NCAER "Logistics Cost in India" confidentiality incident (`docs/compliance/confidentiality-incident-2026-07-17-ncaer.md`, traced 2026-07-17, resolved 2026-07-18 — zero grounding exposure, zero customer-surface exposure, verified independently twice). Scoped alongside the `operator_review_queue` admin-surface dispatch; not yet built. |
| **Corpus-wide 436-archive sweep** | **DEFERRED (operator-owned)** | Separate future unit, sample-verify-first, priced after launch-clause sequencing. NOT the Wave-2 agent's. |
| **ISO 14083 correction** | **DEFERRED (audit-agent-owned)** | Task 3's VERIFIED-mutation authorization sits with the audit agent; flagged un-run. |

---

## Session D forensics + C4 sibling-resolution enforcement-infrastructure fix (2026-07-18)

Branch `corpus-integrity/cc-grounding-executor-d`. `docs/ops/session-log.md` has the full detail (two entries:
the forensics report, and the push-resolution entry below it); this is the board-level pointer.

| Thread | State | Evidence / next |
|---|---|---|
| **Discovery/scanning forensics** | **DELIVERED** | Read-only, no corpus/drain_worklist writes. Founding design was source-monitoring-first (2026-04-04); real discovery mechanisms (change-detection, portal-crawl) landed dormant; acquisition crons frozen 2026-07-12/13, unresumed through 2026-07-18; `seek-more` was item-level acquisition, not new-instrument discovery, retired 2026-07-14 as the campaign's built-with-zero-callers precedent. `/api/admin/scan` is the one surviving live-wired path. Session C's coverage-discovery lane diverges from the founding automated/recurring design (bounded one-time census, not restored). |
| **wt-audit inventory registration** | **DONE** | `docs/inventories/worktrees.md` — Session E's audit lane registered (bare basename `wt-audit`, per operator confirmation it is legitimate, launched without registration at dispatch). Resolved by registration, not override, per operator ruling. |
| **C4 (worktrees.md reality) sibling-resolution bug** | **FIXED** | `fsi-app/.discipline/consistency/checks/C4-worktrees-reality.mjs` resolved the sibling-path convention against `getRepoRoot()` (`git rev-parse --show-toplevel`), which returns the CURRENT worktree's own path when the pre-push hook runs from a secondary worktree, not the main repo. Broke resolution for any push originating outside the main checkout, always, not specific to wt-audit. Fixed via `getMainRepoRoot()` (`git rev-parse --path-format=absolute --git-common-dir`, then `dirname()`), verified context-invariant from both the main checkout and `wt-session-d`. No override trailer used (operator ruling: root-cause fix required, Session E's own push depends on it). |
| **Skill-gate invocation-vs-resolution finding** | **QUEUED (Session E, inventory-4)** | The PreToolUse skill gate's transcript matcher (`skill-token.mjs`) accepts an ERRORING `Skill` tool invocation as satisfying "governing skill loaded" — it checks that the tool-use shape appears in the transcript, not that the skill resolved. Operator call on whether this is intended or a gap; not resolved here. |
| **C4 enforcement-history finding** | **QUEUED (Session E, inventory-4)** | Because the sibling-resolution bug predates this fix, C4's enforcement on prior secondary-worktree pushes is unproven for that whole period. Session E should determine how each prior secondary-worktree push (wt-session-b, wt-session-c, `.claude/worktrees/agent-*`, historical sibling-path worktrees) actually landed: pre-dates the check/hook, ran from the main checkout despite the worktree existing, or carried a `Consistency-Override: C4` trailer. Any override trailers found are themselves undocumented drift-adjacent history, their own inventory-4 entries. |
---

## Session E — dormant-systems audit LANDED (2026-07-18)

Branch `audit/dormant-systems-2026-07-18` (worktree `wt-audit`). Read-only audit; the document plus
this board entry, an INDEX line, and the wt-audit worktree registration are the only writes. Doc:
[dormant-systems-audit-2026-07-18](./audits/dormant-systems-audit-2026-07-18.md). Baseline master
`eb99dc64`. Session D's forensics (commit `048669a9`, branch `corpus-integrity/cc-grounding-executor-d`)
read in full and re-verified where relied on.

| Thread | State | Evidence / next |
|---|---|---|
| **Prior-audit scope diagnosis** | **CONFIRMED, corrected** | 2026-07-11 full-system audit saw dormancy piecemeal but its P1-P4 taxonomy routed it to "P3 dead-weight" and its build-first lens excluded frozen intake from correction; no dormant-wired class existed. Audit doc section 1. |
| **Inventory 1 (gates/flags)** | **DONE** | 18 gates catalogued with state-change commits + caller status; all live gate machinery judged keep-and-integrate; ACTIVE_PHASE pointer stale (unresolved-operator). Section 2. |
| **Inventory 2 (83 routes)** | **DONE** | 75 live-wired / 4 gated (check-sources, spot-check, run-intake, q7) / 4 orphaned (sources/discover, notifications/preferences, regulations-defaults, staged-updates GET). Section 3. |
| **Inventory 3 (workers/workflows)** | **DONE** | 2 frozen schedules (`11c008c2`), 5 active workflows all name-honest; the check-sources name-vs-behavior gap is CURED in code (PR #252/#253) and frozen in operation; reconcile = deliberately-unwired consume half. Section 4. |
| **Inventory 4 (governance divergence)** | **DONE** | ADR-012 decomposed into G-1..G-5 (owed intake surfaces; flip-cost falsified by the freeze; live contradiction with founding doctrine text; sign-off = operator ruling). Plus G-6 research feedstock, G-8 rss-fetch false header, SW-3 worklist-note class (bec305e1: note 4 vs live 28), and D's two handoff findings folded in: G-12 skill-gate accepts an erroring Skill invocation, G-13 C4 override-history reconciled (2 overrides ever, both documented; physical push origin unknowable, labeled). Section 5. |
| **Inventory 5 (purge candidates)** | **LIST DELIVERED — awaits operator ruling** | P-1..P-8 (small list: most dormant-wired machinery meets the keep bar); explicit not-purge list protects the restoration surface. Purge executes later as tombstone-then-delete migrations, not by Session E. Section 6. |
| **Session A stall gate** | **ANSWERED** | The drain queue is real; worklist NOTES are hints with a proven 1-in-7 material error on the sampled bank. Drain against live `validate_item_provenance` output, never notes (RD-33 extension). Section 5.3. |
| **Crawl-rebuild spec input** | **READY** | Keep-and-integrate set = section 8 roll-up; two-tier spec builds on check-sources/change-detection/portal-links/reconcile + run-intake-cycle handoff; one intake path holds. |
| **Operator-dashboard checks** | **OPEN — operator** | 7 checks carried forward (pause flags, scan reachability, deployed env, Actions UI state, SW-3 flag row, drain queue, D-report merge state). Section 7. |

---

## Session E — execution lane: post-audit rulings (2026-07-18)

Read-only audit mandate DISCHARGED; execution lane opened for the operator's post-audit rulings R1-R5
(five phases, one PR each). Worktree `wt-audit`.

**Phase 1 — MERGES: DONE.** PR #342 (Session D forensics + C4 fixes) merged, then PR #343
(dormant-systems audit) merged onto it. PROGRAM-BOARD append conflict resolved keep-both, chronological
(D entry then E entry). Both CI-green at merge, no admin-merge. Master at `fa1e135b`, wt-audit synced.

**Phase 2 — GOVERNANCE: this PR.**
| Item | State | Evidence |
|---|---|---|
| **R1/R2a — ADR-015** (supersede ADR-012) | **DONE** | `docs/decisions/ADR-015-restore-source-monitoring-supersede-adr-012.md`; founding source-monitoring restored as operating design; ADR-012 status→`superseded` + banner; R5 dispute recorded asserting neither side; G-2 restoration cost corrected to code+config+env; G-1 owed run-intake surfaces recorded as crawl debts; two-tier model behind the gate stack. |
| **R1/2b — research-is-horizon-scan feedstock gap** | **DONE** | Doctrine register: named feedstock-gap residual (G-6), same pattern as `analysis-follows-page-intent`; wave-three lands the enforcedBy. `fsi-app/.claude/CLAUDE.md` founding text unamended (it won). |
| **2c — RD-33 extension** | **DONE** | `no-execution-from-stale-state` gains the worklist-note-is-a-proposal clause (section 5.3): queue consumers re-derive per-item state from the live gate at action time; notes are routing hints (bec305e1 case). |
| **R3/2d — ACTIVE_PHASE advance** | **DONE** | `phase-intake-gate` → `phase-2` in GOVERNING-PROGRAM.md. Derived from the doc's own dependency order: intake-gate flipped live 2026-07-08 (all four anchors verified present), next uncompleted phase is phase-2 (Source→sub-source), which precedes phase-3 (the freshness-loop/change-scan crawl work). C5 PASS on phase-2's anchor. intake-gate marked DONE. |
| **2e — cosmetic G-9/G-10** | **DONE** | G-9: stale `drain-first-fetch` references corrected in `pause.ts` header + `agent/run` comment (worker dissolved 2026-07-12). G-10: ADR-001 `(tenant)` route-group consequence corrected (group never created; proxy.ts session-gates, no middleware.ts). |

Local gates green before commit: C5 PASS (phase-2 anchor), meta-gate PASS (63 doctrines wired), tsc clean.

**Phases 3-5 — QUEUED (this session, in order):** P-1..P-8 purges (tombstone-then-delete, discipline
suite between each); skill-gate resolved-not-invoked fix (R4/G-12); dashboard checks + two-tier crawl
spec draft (3 waves, costed wave one).

---

## Session E — execution lane Phase 3 (PURGES): this PR (2026-07-18)

Executes operator ruling R2 ("the old needs to be purged if not used"; P-1..P-8 all purge). Code
deletions execute directly; the one data-touching drop is a committed migration for the operator DDL
window. Full local discipline suite (tsc + meta-gate + consistency C3/C4/C5 + fitness 104/104 + affected
unit tests) run after each deletion; every gate/register/comment reference to a purged item amended in
this same PR. No purge target was force-deleted over a live caller.

| Purge | What went | References amended |
|---|---|---|
| **P-5** | `secFairAccessUaForUrl` re-homed to `sec-fair-access.ts`; `rss-fetch.ts` deleted (dead transport, only a test called `rssFetch`; `buildLiveTransports` never wired it) | `browserless.ts` import; F16 `TRANSPORT_MODULES` (rss-fetch removed, "four transports"→"every live transport"); RD-15 residual (invariants.mjs); `transport-hold-wiring.npmtest.mjs` rssFetch leg; `_pause-gate-verify.mjs` regex |
| **P-1** | `/api/admin/sources/discover/route.ts` + `discovery.ts` (zero callers since Wave-α A5) | `verification.ts` comment; `_pause-gate-verify.mjs` regex |
| **P-2/P-8** | `/api/staged-updates/route.ts` (GET zero-caller + POST 410 tombstone) | `apply-staged-update.ts` (stale "two callers" → runIntakeCycle is the sole live caller); `data.ts` ×2 comments |
| **P-3** | `/api/community/notifications/preferences/route.ts` (zero callers) | none |
| **P-4** | `/api/workspace/regulations-defaults/route.ts` (zero callers) | none |
| **P-7** | `/api/admin/q7-daily-recompute/route.ts` (no scheduler; superseded by end-of-cycle recompute) | F2 `WORKER_SECRET_ALLOWLIST` + comment; `worker-auth.ts` comment |
| **P-6** | `computeConflictResolutionImpact` engine (test-only caller) + the full `source_conflicts` dormant slice: `fetchOpenConflicts`, `SourceData.openConflicts`, the store slice, the "Data Conflicts" admin tab, the `initialOpenConflicts` prop chain, `SourceConflict`/`ConflictStatus`/`ConflictResolution` types; migration **215** drops the 0-row table (content-gated, AUTHORED-not-applied per ADR-011 break-risky, rides the operator DDL window) | `trust.ts`, `types/source.ts`, `supabase-server.ts`, `sourceStore.ts`, `AdminDashboard.tsx`, `SourceHealthDashboard.tsx`, `admin/page.tsx`, `trust-evaluators.npmtest.mjs`; migrations inventory |

**P-6 DEFERRAL surfaced (materially unexpected, reported not forced):** P-6's description also named "the
never-emitted trust-event types". Those live on `source_trust_events` — a LIVE table actively written by 6
routes (bulk-approve, decide, promote, tier-override, spot-check, check-sources) and explicitly slated for
CHECK-widening by **phase-3 fruition**, which ADR-015 (Phase 2, R1) just restored as the active path.
Narrowing that CHECK now would delete inputs the restoration needs and churn against phase-3. Per the
standing stop-and-report rule this narrowing is DEFERRED to the operator, not forced. `ConflictOpenedDetails`
(a member of the trust-event details union) is retained for the same reason. DB-2 F19 already ruled this
class "revisit when conflict detection ships".

**Operator action owed:** apply migration 215 in the DDL window (destructive DROP on prod, dev=prod); rule
on the deferred `source_trust_events` never-emitted event-type narrowing.

---

## Session E — execution lane Phase 4 (SKILL-GATE FIX): this PR (2026-07-18)

Executes operator ruling R4 (G-12 is a gap, not a tolerance). `skill-token.mjs` (the PreToolUse
skill-gate's matcher) now requires a matched `Skill` invocation to have RESOLVED SUCCESSFULLY, not merely
to appear in the transcript. It parses the JSONL transcript, correlates each `Skill` tool_use to its
`tool_result` by `tool_use_id`, and counts the invocation only when a result EXISTS and `is_error !== true`.
An errored invocation (Session D's "Unknown skill" case) and an in-flight/result-less invocation both now
FAIL the gate. All prior discrimination preserved (scoped slugs resolve, passive prose rejected, suffix
collisions rejected, literal slug match). Selftests: `skill-token.test.mjs` 12/12 (adds errored-fails,
in-flight-fails, resolved-passes, errored-then-resolved-passes); hook `pretooluse-skill-gate.test.mjs` 26/26
(fixtures updated to resolved tool_use+tool_result pairs). meta-gate PASS, consistency PASS.

---

## Session E — execution lane Phase 5 (CHECKS + CRAWL SPEC): this PR (2026-07-18)

Operator granted full access mid-lane ("nothing is operator owned"), so the section-7 checks were run
directly and migration 215 was applied, rather than left as operator-owned items.

| Item | State | Evidence |
|---|---|---|
| **Section-7 checks (all 7)** | **RUN LIVE** | [dormant-systems-section7-results-2026-07-18](./audits/dormant-systems-section7-results-2026-07-18.md): cadence `off` / scan returns 503 / source-monitoring+spot-check `disabled_manually` / SW-3 flag 1-open / drain 66 / D-report merged. ONE unreachable: deployed Vercel env values (secret-scope tool limit; moot — cadence-off already blocks fetch). |
| **Migration 215 (P-6 source_conflicts DROP)** | **APPLIED** | applied this session (content gate passed, 0 rows); table + view now null. P-6 purge complete in code AND data. Migrations inventory corrected AUTHORED→APPLIED. |
| **Two-tier crawl rebuild spec** | **DRAFT DELIVERED for operator pricing** | [crawl-rebuild-spec-2026-07-18](./plans/crawl-rebuild-spec-2026-07-18.md): awareness tick at check-sources → one intake path (run-intake-cycle + the two owed surfaces) → depth tier behind GROUNDING_ACQUIRE_ENABLED; source-type-agnostic (wave 1 registers / 2 market feeds / 3 research feedstock, same tick+intake+gates); coverage honesty per surface (Operations gap labeled); costed wave-one Phase 1 (cheap awareness, dormant-safe) + Phase 2 (~$16-37 depth over the 106 MISSING candidates, operator-priced). No build until priced. |
| **Relabel primitive** | **DEFERRED (not built)** | per mandate — belongs to the session that resumes Session A. |

**Execution lane COMPLETE.** Phases 1-5 landed: #342+#343 merged (Phase 1), #344 governance (Phase 2),
#345 purges (Phase 3), #346 skill-gate fix (Phase 4), this PR checks+spec (Phase 5). Standing operator
decisions: price the crawl-spec waves; rule on the deferred `source_trust_events` never-emitted event-type
narrowing (held on merits — collides with phase-3 fruition).

---

## Session E — EXECUTION LANE COMPLETE (2026-07-18)

Phases 1 through 5 landed, all CI-green-then-merged (no admin-merge):

- **#342 + #343** — Phase 1 merges (Session D forensics + the dormant-systems audit; board keep-both resolved).
- **#344** — Phase 2 governance: ADR-015 restores source-monitoring, supersedes ADR-012; register amendments; RD-33 extension; ACTIVE_PHASE → phase-2; G-9/G-10.
- **#345** — Phase 3 purges: P-1..P-8; migration 215 applied (source_conflicts dropped).
- **#346** — Phase 4 skill-gate G-12 fix (require RESOLVED).
- **#347** — Phase 5: section-7 checks + two-tier crawl rebuild spec + migration 215 apply.

**Section-7 checks: six of seven CLOSED.** cadence off / scan returns 503 / source-monitoring + spot-check
disabled_manually / SW-3 flag open / drain 66 / D-report merged. The seventh — deployed Vercel env values
(SCRAPE_HOLD / GROUNDING_ACQUIRE_ENABLED / SPEND_REGIME) — is a **re-arm-time operator check** (secret-scope
tool limit; moot for fetch-blocking because cadence-off already blocks every fetch).

**Standing operator decisions (lane handed off):**
1. Price the crawl-spec waves ([crawl-rebuild-spec-2026-07-18](./plans/crawl-rebuild-spec-2026-07-18.md)) — no build until priced.
2. Rule purge on the deferred `source_trust_events` never-emitted event-type narrowing — evidence in crawl-spec §8.1 points to purge (held on merits, not access; lands as a content-gated migration at the ruling).
3. The relabel primitive goes to the session that resumes Session A.

Session E's lane is DONE. The operator takes the crawl spec from here.

---

## Session E — RECOVERY MANDATE (2026-07-18): ingest behavioral read + merge re-verification

The day's work rested on a wiring map, not a behavioral read of the ingest pipeline. Recovery Step 1
read the code end to end and re-verified every merge behaviorally.

**Step 1 findings** ([ingest-behavioral-read-2026-07-18](./audits/ingest-behavioral-read-2026-07-18.md)):
- **What the system actually does:** one-document-per-item everywhere (workflow AND acquire scripts); NO
  per-source document sweep exists. The change-to-analysis loop TERMINATES (check-sources sets
  change_detected, reconcile writes intelligence_changes, but that table has 0 rows and is read only by the
  dashboard digest; no re-ground consumer; auto-action "deliberately NOT wired"). Save-everything (permanent
  raw_fetches snapshot) is TRUE only on the operator-fired acquire-script path Session A ran; the live
  /api/agent/run workflow persists only the replaceable agent_run_searches pool.
- **Merge re-verification: all purges P-1..P-8 SAFE, ZERO restorations.** Verified against dynamic dispatch,
  string routes, config (access_method only api-vs-browserless; the 189 rss sources were always browserless),
  and DB objects (0 functions/views reference source_conflicts post mig-215; staged_updates table intact,
  35 rows). No merge touched the live ingest path.

**Crawl spec SUPERSEDED as a build basis.** [crawl-rebuild-spec-2026-07-18](./plans/crawl-rebuild-spec-2026-07-18.md)
was authored from the wiring map; it duplicated existing discovery machinery and ignored the two real gaps
(complete per-source extraction; the open change-to-analysis loop). Its register-enumeration research is
salvage material only. The build plan (Step 2) is grounded in the behavioral read instead.

---

## Session E — RECOVERY Step 2: build plan DELIVERED for operator ruling (2026-07-19)

Step 1 ruling received (zero restorations accepted, findings accepted, strong list fenced). Step 2 is the
one phased, costed build plan, existing-first per component with Step-1 finding citations, operator decision
points marked. **PLAN ONLY — nothing executes until the operator rules on the document.**

Doc: [ingest-repair-and-extraction-build-plan-2026-07-19](./plans/ingest-repair-and-extraction-build-plan-2026-07-19.md).

| Phase | What it closes | Shape | Preserves the strong list by |
|---|---|---|---|
| **R — Repair** (first, bounded) | F3/F4/F5/F6 + cheap F13/F19/D2; rest triaged | live snapshot writer + crit-3 on durable storage (zero-flip prover-gated); one tier discipline (verification.ts + bulk-approve conform to the deterministic rule); apply CHANGE fail-closed; plan-intake RETIRED into a dry-run mint | hardens the moat + non-destructive apply; adds no gate logic; per-fix test asserts fenced behavior intact |
| **1 — Complete extraction** (closes F1) | one-document-per-item | the missing seam: enumerate → classify (4 contracts, multi-tag) → existing intake path; proving slice of 5 (EUR-Lex/leginfo/MPA/CARB/NLR, each multi-item so dedup is proven); slice IS the sizing instrument; snapshot via Phase R | every document flows the unchanged chokepoint/mint-gates/target-match/apply/validate; multiplies volume, changes no gate |
| **2 — Change-to-analysis** (closes F2) | terminating loop | NEW re-ground consumer on existing check-sources/reconcile/intelligence_changes; USES compareFreshness + cheapVerifyClaims; paid re-ground HOLDS behind acquire lock + operator go | fires the existing grounding pipeline as actuator; adds consumer + router only |
| **3 — Discovery (third only)** | — | inside-out (grow-step + portal_link_candidates finally consumed) then outside-in (register/feed/catalog, gap measured only vs full extraction — false-denominator rule cited); salvages crawl-spec register research, discards its primary-build framing | stages through unchanged chokepoint; grow writes effective_tier only (moat) |
| **4 — Reconciliation** | orphaning risk | Session A drain (66) + relabel-primitive (A's session builds it) between R and corpus-wide; Session B lane; Session C census (109/62 feeds) as Phase-3 feedstock; campaign machinery unchanged | campaign grounding machinery IS the strong list, used unchanged |

**Sequencing:** one dependency graph, R → Gate1 → {A/B drain ∥ Phase1 build} → Gate2 proving-slice →
Gate3 corpus-wide → {Phase2 ∥ backfill} → Gate4 tick re-arm (ADR-015 code+config+env checklist) → Phase3
→ Gate5 outside-in. Five operator gates plus the proving-slice-composition choice (Operations swap: u.ae).

**STOP.** The plan lands as one PR; the operator rules on the document before anything in it executes.

---

## Session E — RECOVERY Phase R: repair EXECUTED, stopped at Gate 2 (2026-07-19)

Operator ruling: plan APPROVED, all three recommendations adopted (five gates stand; u.ae swap for a pure
Operations source in the proving slice, composition-only; plan-intake RETIRED into a dryRun mint). Merged
#349, then executed **Phase R only**. Every fix touches the most load-bearing machinery, so each landed with
its own proof artifact, same standard the machinery was held to. Branch `repair/phase-r-ingest-hardening`.

| Fix | State | Proof artifact |
|---|---|---|
| **F3** live snapshot writer + crit-3 on durable storage | **STOPPED + SURFACED** (materially unexpected, operator ruling owed at Gate 2) | `raw_fetches` body lives in Supabase STORAGE (no body column), so the plpgsql validator CANNOT read it; and the FACT span is CLEANED text vs `raw_fetches` RAW body — a literal move would FLIP verified items. Corrected design (a durable, DB-queryable, append-only CLEANED-text criterion-3 fallback, monotonic-safe) proposed in the Gate 2 report; writer + checker designed together, no half-slice landed. |
| **F4 + F18** one tier discipline | **DONE** | verification.ts executeAction + bulk-approve both stamp base_tier from the DETERMINISTIC `classTierForHost` (never the Haiku / cached guess); ambiguous host WORKLISTS (verification → provisional; bulk-approve → individual review). bulk-approve gained the vertical-fit gate + `source_role` + derived types; frozen 2026-04-28 date dropped in bulk-approve AND decide. Proof `tier-discipline-no-guess.test.mjs` (5/5, source-scan covering both live paths) + updated `w2f-basetier.npmtest.mjs`. |
| **F5** applyLedgerDiff CHANGE fail-closed | **DONE** | warn → THROW before the overwrite when the `claim_versions` archive fails, matching `eraseClaimWithProof` + the file's own header. Proof `ledger-apply.test.mjs` (3/3): archive-failure throws + the current claim is never overwritten (prior attribution survives); happy path still versions-then-updates. |
| **F6** retire plan-intake → dryRun mint | **DONE** | `mintIntelligenceItem(sb, plan, {dryRun})` runs every gate and returns the disposition without the INSERT; `applyStagedUpdate` + run-intake-cycle plan-mode thread it; `plan-intake.ts` + its test + the `_diag` proof deleted. One source of truth, drift impossible. Proof `mint-dryrun-equivalence.npmtest.mjs` (3/3): dry == real on would-mint / dedup-reject / the SOURCE-LINK reject the old planner got WRONG. |
| **F13 / F19 / D2** (cheap-in-R) | **DONE** | F13 state-min-wage registerSource EXECUTE-gated (dry-run no longer writes a source); F19 decide fails the response on a candidate-mark failure (names the durable partial state, warns against blind-retry); D2 canonical-fetch header corrected 2-tier→3-tier. Proof `phase-r-cheap-fixes.test.mjs` (3/3). |
| **Routed (NOT touched this phase)** | per plan | F14/F16/F17 → Phase 4 drain-tools touch; D1/D4/D5 → Phase 1/3 file touches. F15/F20/D3 accepted-as-documented. |

**Fenced strong-list regression: GREEN.** Discipline suite **864 pass / 0 fail** (non-destructive apply,
dominance guard, mint gates, target-match, moat resolver, verify-item, error-body, audit-gate/preflight
goldens all unchanged), fitness **16 checked / 0 violations** (single-mint-chokepoint, F12 moat, F2
admin-routes), npmtests **52 pass / 0 fail**, tsc clean. No strong-list gate logic was modified; the two
edits inside strong-list files (F5 ledger-apply CHANGE-path, F4 verification tier) are additive hardening
with per-fix proofs.

**STOPPED at Gate 2 (proving-slice go).** Nothing past Phase R executes without the next operator ruling.
The Gate 2 report carries: per-fix proof summary, the regression result, the F3 corrected-design proposal
(operator ruling owed), the final proving-slice composition with the u.ae swap rationale, and the per-source
enumeration approach for each of the five slice sources.

---

## Session E — RECOVERY Part 1: F3 durable-evidence addendum EXECUTED (2026-07-19)

Operator rulings: F3 option (a) approved, proving-slice GO, strict order (F3 lands + proves FIRST, slice
SECOND). Branch `repair/phase-r-f3-durable-evidence`. Built the corrected design exactly as proposed, writer
and checker together, no half-slice.

| Component | State | Proof / evidence |
|---|---|---|
| **Migration 216** — `item_source_evidence` append-only store | **APPLIED** | New table holding the cleaned pool text (byte-identical to `result_content_excerpt`), keyed by (item, content_hash), RLS on / no policy; BEFORE UPDATE/DELETE trigger RAISES for anyone incl. service role. Append-only proven: `scripts/_diag/_f3-append-only-proof.sql` rolled-back probe → `upd_blocked=t del_blocked=t`, 0 rows persisted. |
| **Live writer** (canonical-pipeline.ts) | **DONE** | Both generate paths (generateBrief + generateBriefRefreshPrimary) persist the cleaned pool text to the durable store BEFORE the `agent_run_searches` DELETE-then-INSERT — the per-generate erase of prior evidence ENDS on the everyday path. Idempotent (ON CONFLICT DO NOTHING, never trips the append-only trigger). Proof `f3-durable-evidence.test.mjs` (3/3, ordering + idempotency + same-cleaned-text source-scan). |
| **Migration 217** — criterion 3 SUPERSET | **APPLIED, prover-gated** | Surgical anchor-verified `replace()` on the DB's own `validate_item_provenance` def: span passes if in the working excerpt OR the durable store. Monotonic add. Zero-flip prover (`scripts/_diag/_f3-zero-flip-prover.sql`) run + committed BEFORE apply: **0 would-flip / 210 baseline verified / 0 evidence rows**. Post-apply verified: superset present, old null-check cleanly replaced (not duplicated), verified-live still 210, sample verified item still valid. |

**Fenced strong-list regression: GREEN.** Discipline suite **867 pass / 0 fail** (the 3 new F3 assertions plus
every prior golden unchanged), fitness **16 / 0 violations**, tsc clean. The only strong-list-adjacent change
is criterion 3 becoming a proven-monotonic superset; no gate weakened.

Migrations inventory updated (216/217). Lands as PR (Part 1). Merge on green, then Part 2 (proving slice)
runs SECOND through the completed gate.

---

## Session E — F3 addendum REVERTED as dead/duplicate code (2026-07-19)

Operator pushed (correctly, repeatedly) to check existing structure first; a full Supabase table audit
established the F3 addendum (PR #351: item_source_evidence + migrations 216/217 + the writer + tests) was
DEAD/DUPLICATE code I created by not auditing existing structure:
- `item_source_evidence`: **0 rows**; its writer stored `cleanCtl(b.text)` — BYTE-IDENTICAL to the existing
  `agent_run_searches.result_content_excerpt` (per-item, SQL-queryable, 21 MB, up to 600 KB/row).
- **0 of 210 verified items were missing pool evidence** — the "pool erased on re-generate" problem the store
  was built for does not manifest.
- `raw_fetches` (678 rows) is the existing permanent snapshot store the original F3 instruction named.
- Keys exist and the pipeline has run (631 agent_runs with a model) — the earlier "no keys / Part 2 walled"
  claim was wrong (checked the local shell, not where the app runs).

**Reverted:** migration 218 (applied) restores criterion 3 to the pre-217 working-excerpt-only check and DROPs
the empty table + trigger + function; verified post-apply (function no longer references the table, restored
to original, table null, verified-live still 210, sample still valid). The writer, `f3-durable-evidence.test.mjs`,
and the two prover scripts are removed; 216/217 files kept as history + marked reverted in the inventory.

**Process reset (operator directive):** no more building. Next is a detailed audit of the EXISTING structure
(tables: row counts + writers + readers, per RD-9 producer-consumer; code), THEN a build plan for operator
approval, THEN build. The repeated check-first failures this session are the reason.

---

## Session E — FULL structure audit DELIVERED (cleanup phase before scrape-and-build) (2026-07-19)

Doc: [supabase-structure-audit-2026-07-19](./audits/supabase-structure-audit-2026-07-19.md). Every table:
exact rows + mechanical writer/reader map + code trace + INTENT judgment (five-surface model / ADR-015 /
Community-as-core). Deletes PROPOSED not applied.

**Operator rulings owed:**
1. SAFE-DROP backup set (6 tables, ~1045 rows of before-state copies, zero code refs) — .proposed migration
   219 authored, ruling-gated.
2. `hold_resolution_queue` (39 queued held-items; created by NO committed migration = out-of-repo DDL;
   overlaps live drain_worklist) — confirm superseded → migrate-then-drop, or re-wire.
3. `briefings` (0 rows, early predecessor of full_brief) — likely-drop.

**Key corrections on record:** keys exist + pipeline has run (631 model agent_runs); agent_run_searches
(21 MB per-item) + raw_fetches (678) ARE the durable content stores — what the reverted F3 (#351/#352)
wrongly duplicated. Dormancy = the frozen source-monitoring cron + four missing consumers
(portal_link_candidates→intake, register index-walk, feed transport, intelligence_changes→re-ground), NOT
rotting modules. Next: the scrape-and-build plan grounded in this audit, for operator approval.

---

## Session E — CLEANUP EXECUTED + scrape-and-build plan DELIVERED (2026-07-19)

Operator: "Do it." Migration **219 APPLIED**: 8 dead tables dropped (6 zero-ref backups/one-shots +
hold_resolution_queue — superseded by drain_worklist, proven 32/39-in-drain/6-verified/1-gone/0-residue —
+ briefings). Post-apply verified: all 8 gone, verified-live 210 intact, drain intact, validator valid.
Inventory updated.

Plan: [scrape-and-build-content-plan-2026-07-19](./plans/scrape-and-build-content-plan-2026-07-19.md) —
four builds (B1 portal-harvest consumer / B2 register index walk / B3 feed transport / B4 change-to-analysis
consumer) + the ADR-015 cron re-arm; reuse-first (the audit proved everything else is built); proving slice
prices the corpus sweep; no new store, no new intake path, no spend-rule change. Build begins on this plan.

---

## Session F — B1 BUILT: portal-harvest consumer (2026-07-19)

The first of the four builds. PR feat/b1-portal-harvest-consumer:

- **Migration 220 APPLIED** (two-track, DDL before code): disposition columns on `portal_link_candidates`
  (`disposition_reason` / `dispositioned_at` / `item_id`) — no disposition without a recorded reason (RD-6).
- **`src/lib/intake/portal-harvest.ts`**: `persistPortalCandidates` (the ONE ledger write-site — the
  check-sources crawl refactored onto it, so scheduled + manual producers share identical upsert semantics)
  and `consumePortalCandidates` (ledger → ladder fetch direct-first → firstFetchClassify entity gate →
  the intake chokepoint via dryRun pre-pass; apply pushes only would-mint candidates into runIntakeCycle
  and stamps every ledger disposition with the machine reason verbatim). Gate placement preserved: this
  module PRECOMPUTES; every gate DECISION stays in the chokepoint. Deep links preset `source_id` from the
  parent portal (the source-link seam — a deep link is deliberately NOT in the registry; its portal is).
- **Seam fix riding B1**: `applyStagedUpdate` strips `relevance` from the INSERT seed (no such column;
  B1 is the first relevance-bearing caller — a dry run cannot catch it because dry stops before the write).
- **D1 landed** (routed Phase-R triage): haiku-classify.ts dead header corrected (content classification
  lives in first-fetch-classify.ts).
- **Runner** `scripts/run-portal-harvest.mjs` (--harvest / --consume, --mode plan DEFAULT | apply gated on
  EXECUTE=1, --render opt-in so Browserless units are conserved by default).
- **Proofs**: portal-harvest.npmtest.mjs 7/7 (one-write-site semantics; severity display→db + source_id
  preset; plan mode is READ-ONLY; entity-gate stamps; inconclusive ≠ reject; exists short-circuit = no
  re-ground spend). Suite 864/0, npmtests 36/0, fitness 16/0 (F14 confirms the ledger now has its reader —
  allowlist entry retired), meta-gate PASS, consistency 3/0, tsc clean.

## Session F — B2 BUILT: register-API index walk (2026-07-19)

The second build. PR feat/b2-register-walk:

- **`src/lib/sources/register-walk.mjs`**: pure builders (ojDailyViewUrl DDMMYYYY, frDocumentsUrl with
  range/type/term/fields, dateRange capped at 366d — no unbounded walks) + dep-injected walkers.
  `walkEurlexOj` (per-day daily-view HTML → extractPortalLinks → B1's persist; a failed day is recorded,
  the walk continues) and `walkFederalRegister` (paged documents.json, no key; a page cap is REPORTED
  as droppedPages/totalPages — a bounded walk is never silent). Both feed the SAME ledger B1 consumes.
- **D4/D5 landed** (routed Phase-R triage): api-fetch.ts normalizes FULL then caps at the return site,
  reporting `truncated` + `fullTextLength` (the canonical-fetch contract); BrowserlessResult types the
  optional fields the pipeline already read untyped.
- **Runner** `scripts/run-register-walk.mjs` (--register eurlex-oj|federal-register, --from/--to,
  --types/--term/--max-pages; hold-gated free HTTP; source defaults to the register's root portal row).
- **Proofs**: register-walk.test.mjs 6/6. Suite 870/0, npmtests 36/0, fitness 16/0, tsc clean.
- **LIVE**: FR walk 2026-07-15..17 → 35 RULEs ledgered; OJ walk 07-16..18 → 3 daily views (33/39/39
  upserts, new instruments only after chrome dedup). Consume plan-mode on FR: **8/8 would_mint on real
  final rules**, every chokepoint gate passed dry, honest low-relevance flags (an unfiltered RULE walk
  is mostly off-vertical — the sizing signal; --term scopes it). Zero writes: plan-mode contract held.

## Session F — B3 BUILT: feed transport (2026-07-19)

The third build. PR feat/b3-feed-transport:

- **`src/lib/sources/feed-walk.mjs`**: parseFeedEntries (RSS 2.0 items + Atom entries, CDATA unwrap,
  rel=alternate preference, https-only) + walkFeed (fetch injected → ERROR-BODY GATE before parsing —
  a bot-block is {ok:false} INCONCLUSIVE, never an honest "empty feed" → persist via B1's ONE write-site).
  No new deps (regex parse; the ledger's UNIQUE-url dedup absorbs over-extraction).
- **Runner fold-in**: run-register-walk.mjs gains `--register feed --feed <url>` (source defaults to the
  feed host's registered row). One CLI for all index walks.
- **Proofs**: feed-walk.test.mjs 5/5. Suite 875/0, fitness 16/0, tsc clean.
- **LIVE**: CARB RSS (ww2.arb.ca.gov/rss.xml) walked free → 10 entries ledgered; consume plan-mode:
  **10/12 would_mint, genuinely ON-VERTICAL** (Cap-and-Invest updates, Volvo $197M emissions settlement,
  $1B electric-truck rebates, HVIP, Climate Transparency Regulation) and **congruence 1a fired live** on
  every news-page instrument (retyped — the moat working). 2 sub-portals honestly rejected.

## Session F — POPULATION STARTED + holdings-keying seam fixed (2026-07-19)

Operator ruling: NO scheduled scrapes during build (re-arm closed/deferred; schedules stay commented,
hold stays). Phase = POPULATE manually with the built tools. Population targets RFD-format PRIMARY
instrument pages only (congruence 1a retypes news-page announcements to non-ratified formats).

- Scoped FR walk (--term emissions, RULE, 30d): 30 candidates, 30/30 would_mint (plan).
- **Bounded apply sample: 3 FR rules MINTED through every gate** (staged → chokepoint → ledger
  promoted w/ item ids): NESHAP Plywood/PCWP, Counter-UAS IFR, Michigan St. Clair SO2 SIP.
- **SEAM FOUND + FIXED: holdings-gate keying.** raw_fetches is per-SOURCE (no URL column); the guard
  counted the FR PORTAL's old snapshot as every portal-derived item's holdings → all 3 refused
  grounding as falsely "held". Fix: the snapshot half counts ONLY when source.url == item.source_url
  canonically (the per-instrument shape, ruled behavior unchanged); portal-derived items key on their
  own pool. Proof holdings-keying.npmtest.mjs 3/3.
- Post-fix: all 3 generated FULL RFDs (60825/77555/48776 ch, 14-15 sections, 6 web_search
  corroborators each, real FR citations); truncation guard reported a 383KB PDF honestly
  (60000/383344 collected). All 3 correctly QUARANTINED at the ground step: **GROUNDING_ACQUIRE_LOCKED**
  — model grounding is paid acquisition behind the operator's per-run flag (GROUNDING_ACQUIRE_ENABLED).
- Sample actuals: ~\$2.53 est across 18 runs (3 Sonnet deep-dive generates + classifies), ≈\$0.80/item
  generate. FLAG: July agent_runs est \$140.28 vs the \$75-ceiling doctrine — needs operator read.
- Runner: --newest consume option (freshest walk results first). Diag: _b1-ground-sample.mjs.
- OPERATOR DECISION OWED: flip GROUNDING_ACQUIRE_ENABLED for a bounded funded pass to ground the 3
  (est <\$1), then the corpus-sweep price rides the audited sample.

## Session F — B4 BUILT: change-to-analysis consumer (2026-07-19) — ALL FOUR BUILDS COMPLETE

The fourth and final build. PR feat/b4-change-sweep. Retrieval-first paid off: verify-item.mjs
(snapshot-first entry, F21) already IS the routing core — B4's genuine residual was ONLY the bridge.

- **`src/lib/sources/change-sweep.mjs`**: sweepChangedSource (a changed source's VERIFIED items →
  verifyItem each → disposition split: verified_cheap record-only / stale_flag queue / needs_acquire
  LOCKED) + sweepAllChangedSources (bounded, skippedSources reported). READ-ONLY default; --act gates
  the stale-flag queue writes. Scope: verified items only (quarantine belongs to research-or-erase).
- **Runner** `scripts/run-change-sweep.mjs`: --source | --all-changed (reads the check-sources
  monitoring_queue change_detected signal); the SAME live dep binding groundStep uses — no drift.
- **Proofs**: change-sweep.test.mjs 4/4. Suite 879/0, fitness 16/0, meta-gate PASS, tsc clean.
- **LIVE smoke ($0, read-only)**: leginfo's 3 verified items (SB 253/261, AB 1305) swept — all route
  needs_acquire honestly (spans not in the PORTAL homepage snapshot: the KNOWN portal-source corpus
  defect surfacing through the new lens; no false flip, no spend, lock holds).

Build scoreboard: B1 #354 / B2 #355 / B3 #356 / population+holdings-fix #357 / B4 this PR.

---

## Session A (resumed, intake-census lane) — keyset pagination for plan-mode consume (2026-07-19)

New mandate (operator, this session): enumerate the full document universe of every held source
(~209 verified-backing sources), disposition every document through the real chokepoint's dryRun.
Measurement only — zero corpus writes, zero real mints, zero grounding. Drain queue (66 rows) and the
relabel-primitive spec REMAIN PARKED, untouched, separate mandate (Session E's audit still holds that lane).

**Environment finding (logged for the record): `run_in_background` is unusable for long-running consume
jobs.** Two 500-candidate `consumePortalCandidates` plan-mode runs, backgrounded via the Bash tool, died
silently after printing only the source-resolution header line — no error, no stack trace, no partial
per-candidate output — despite a "completed" notification. A foreground run of the same command with an
explicit long timeout completed correctly end to end (50 candidates in 4m03s, ≈4.9s/candidate: one fetch +
one Haiku classify + one dry-mint check each). Root cause not fully isolated (background stdout buffering
vs. an environment-specific process timeout shorter than requested); the finding is empirical and
reproducible, not theorized. **Going forward: foreground chunks only for this census, sized to stay well
under the tool's timeout ceiling (50-60 candidates, ~5 min).** Also found and killed one orphaned duplicate
EUR-Lex consume process from an earlier mistracked background attempt — correctness unaffected (plan mode
never writes; the only cost was small duplicate Haiku spend), logged for the record per operator instruction.

**Root problem this surfaced: plan mode has no pagination.** `consumePortalCandidates` in plan mode never
marks a candidate consumed (the disposition stamp is `apply`-only by design), so repeated calls against the
same source re-read the identical oldest-N candidates forever — no way to reach candidate 51-500 of a
501+-candidate source (EUR-Lex enumerated **1098 candidates in a single 30-day window alone** — itself
census data, recorded). Foreground chunking alone doesn't fix this without a way to advance past what was
already read.

**Fix: keyset pagination, not offset (operator-specified).** Offset is positional — it shifts under a
walk if new candidates land mid-run, silently skipping or double-reading rows at chunk boundaries. Keyset
names a fixed point in a stable total order and is immune to that drift; it also matches the drain-loop
pattern already used elsewhere in this codebase.

- `consumePortalCandidates` now orders by `(first_seen_at, id)` and accepts `opts.after: {firstSeenAt, id}`
  — a `.or()` filter (`first_seen_at.gt.X OR (first_seen_at.eq.X AND id.gt.X)`, `.lt` under `newestFirst`)
  resumes strictly past that keyset position. Returns `nextCursor` (the last row's own keyset position) when
  the chunk was full (more may remain); omits it when the chunk came up short (source exhausted at this
  cursor).
- `opts.censusExclusion: {table, runId}` additionally excludes candidates already recorded against a census
  run, once `census_worklist` lands (Session B's build) — a prior `SELECT candidate_id` + `.not("id","in",...)`
  (no native cross-table anti-join in the query builder). **Feature-detected, fails CLOSED to no exclusion**
  when the table doesn't exist yet — cursor-only fallback, never a hard dependency, never a throw.
- CLI: `scripts/run-portal-harvest.mjs --consume` gained `--after "firstSeenAt|id"` and `--census-run <uuid>`;
  every run prints the next cursor to pass forward (or "exhausted" when there is none).

**Scope confirmed exactly as specified: plan-mode-only, read-only.** Changes only which page of
already-persisted `portal_link_candidates` rows a plan-mode call reads. Touches no gate, no mint logic, no
grounding, no apply-mode code path (apply mode is untouched — it doesn't need a cursor, its disposition
stamp already advances the ledger). Non-destructive: the query gains an `.order("id")` tiebreaker and an
optional `.or()`/`.not()` filter; nothing about `.select()`, the fetch/classify/dry-mint sequence, or the
apply-mode cycle changed.

**Proof.** `portal-harvest.npmtest.mjs` 15/15 (7 existing unchanged + 8 new): keyset OR-filter shape
(ascending `.gt`/descending `.lt`), no-filter on a fresh walk, `nextCursor` present-on-full/absent-on-short,
census-exclusion applied-when-found/absent-when-empty/fails-closed-when-the-table-errors. Full suite 721/0,
npmtests 61/0, meta-gate PASS (marker baselines unchanged — no new normative-language claim), tsc clean
(pre-existing `.next/types` staleness from the Phase-3 route purges, unrelated, cleared locally).

**Resume:** walk EUR-Lex from the top of the ledger with the cursor, foreground chunks, report at
source-bank boundaries.

### Follow-up: censusExclusion re-pointed to the real census_worklist shape (2026-07-19)

The keyset PR (#360, merged) built `censusExclusion` blind, before `census_worklist` landed — it assumed a
`{candidate_id, census_run_id}` shape. Session B then landed the table with a DIFFERENT shape, and with **no
committed migration file and no schema doc**, so the first consumer (this lane) had to introspect `pg_catalog`
to learn it (finding logged; routes to B, see below). The real shape: keys on `(source_id, document_url)`,
completion marked by a non-null `dryrun_disposition`, **no run-id column, no candidate-id column**. The
exclusion is re-pointed to match: it reads DISPOSITIONED census rows (`.not(dryrun_disposition, is, null)`,
scoped to the source) and anti-joins the ledger on **URL** (`.not("url","in",...)`), not id. CLI flag changed
`--census-run <uuid>` → `--census-exclude` (no run id exists to pass). Feature-detection unchanged: a
table/column-absent lookup still fails CLOSED to no exclusion, never a throw.

**PROVISIONAL — DISCHARGED (2026-07-19).** The shape was read from the LIVE table via `pg_catalog` because
Session B had landed the table with no committed migration. B's committed **migration 221** then merged to
master (this branch synced it) and **confirms the introspected shape exactly**: `UNIQUE (source_id,
document_url)`, `dryrun_disposition` CHECK enum (`would_mint`/`dedup_hit`/`congruence_reject`/`invariant_reject`
/`hold`), `surface_tags text[]` constrained to `{regulations, operations, market_intel, research}`, `lane`
CHECK `('A','C')`, identity columns immutable-after-insert via trigger. No re-point needed — the re-pointed
`censusExclusion` (URL anti-join, dispositioned-only read) already matches the committed contract. The
`column`/`dispositionColumn` overrides stay as cheap insurance. Proof: `portal-harvest.npmtest.mjs` 15/15
(census tests assert URL-anti-join + dispositioned-only read + fail-closed); live-probed against the real
table (query shape valid). tsc clean.

**FINDING (routes to Session B, logged for the record):** `census_worklist` existed live with **no committed
migration and no schema doc** at the moment the first consumer (this intake lane) needed it; that consumer
had to introspect `pg_catalog` to learn its shape and shipped a provisional consumer against it. Migration 221
has since landed and closes the gap, but the ordering — live table before committed DDL — is the same
out-of-repo-DDL class SW-2 and the reconciler-credential item track. Not this lane's to fix; recorded so the
sequencing (commit the migration before or with the live table, never after a consumer already needs it) is
visible. No corrective action owed here beyond this note; 221 resolved the instance.

### Census writer + four-contract multi-tag classifier (2026-07-19)

The intake-census lane needs to PERSIST what it enumerates, and the mandate's step 3 is "classify every
document against all four page contracts, multi-tag." Two operator rulings this session: (1) extend the
classifier to a real four-contract verdict (not single-surface-from-item_type); (2) build the writer as its
own tested PR before resuming the walk. Both done:

- **Classifier (`first-fetch-classify.ts`):** `firstFetchClassify` now emits `surface_tags: string[]` — a
  verdict against EACH of [regulations, operations, market_intel, research] independently, in the SAME Haiku
  call (expanded prompt, no second call, no extra spend). Validated to the four allowed surfaces; empty on a
  portal/uncertain verdict. Threaded through `CandidateOutcome.surfaceTags` in portal-harvest so the writer
  gets it without re-classifying. Proven live: a CARB Cap-and-Invest regulation tagged `[regulations,
  market_intel]`, a Volvo emissions settlement `[regulations, operations, market_intel]` — genuine multi-tag,
  not a dominant-surface collapse.
- **Writer (`census-writer.mjs`):** `writeCensusRows` upserts one `census_worklist` row per DISPOSITIONED
  document on the `(source_id, document_url)` UNIQUE key (idempotent, resumable), under a per-source
  `mutation_leases` lease (holder = lane id, so lanes A and C never write the same source concurrently — a
  held lease is a REFUSAL, never a clobber). Disposition map: would_mint→would_mint, exists→dedup_hit,
  would_reject→congruence_reject|invariant_reject (reason picks), not_an_item→hold (with the DB-required
  hold_reason). `enumeration_status` set forward-only-safe (dry_run_complete / classified). Skipped/
  inconclusive outcomes are counted and reported but NOT written — no census verdict yet, re-walkable, and
  writing them would risk the forward-only status guard and clobber a prior disposition to null.
- **Runner:** `--census-write [--lane A] [--shape <class>] [--cap-hit] [--created-by <id>]`, composes with
  `--census-exclude` for a resumable walk. Proven end-to-end: 5 CARB rows written live (3 would_mint, 2 hold),
  surface_tags + hold_reason + shape_class all correct in the table.
- **Proof:** `census-writer.npmtest.mjs` 9/9 (disposition map, hold-requires-reason, forward-only status,
  lease refusal, DB-error-not-swallowed, skipped-not-written) + `portal-harvest.npmtest.mjs` 15/15 (surfaceTags
  threading unchanged the existing assertions). tsc clean.
- **Minor B finding (logged, not this lane's):** migration 221's `COMMENT ON COLUMN ... shape_class` text
  actually describes `dryrun_disposition` (a copy-paste slip); the CHECK constraints are correct, only the
  comment is misplaced. Routes to B, cosmetic.

### Cap-completion pass complete; census walk attempted-complete (2026-07-20, resumed post-crash)

Session A resumed after a mid-turn process crash; state was recovered from the repo and the DB, not
conversation memory, and verified before anything ran. NSW EPA's pre-crash writes landed exactly as the
idempotent upsert promised: 220/220 rows in `census_worklist` (176 new holds + 4 new would_mint this pass,
on top of the prior 40).

**Delta vs the PR #365 tally (915 rows / 39 sources / 110 relevant would-mints):**

- `census_worklist` now holds **1,331 rows / 39 sources / 619 would_mint / 112 relevant would-mints**
  (the not-low-relevance split), 710 holds, 2 dedup_hit.
- Pass delta +416 rows: NSW EPA +180 (176 hold, 4 would_mint, all low-relevance), SCDES +124 (all hold),
  Australia Infrastructure +88 (87 hold, 1 relevant would-mint), ncleg +24 (all would_mint, 1 relevant).
- Relevant would-mints 110 → 112: the two new are Australia Infrastructure (1) and ncleg (1).

**Tier B re-harvests at `--cap 200`, true link counts:** Australia Infrastructure 128 (below cap,
MEASURED), SCDES 164 (MEASURED), ncleg Chapter 136 145 (MEASURED), NSW EPA 200 AT CAP (a floor, true
universe exceeds 200; raising past 200 is deferred to the operator per the mandate). The NSW re-harvest
added 0 new ledger rows, all 200 extracted links were already held. Ledger audit found no other source at
exactly 40 links, so the plausibly-capped set was exactly the four; the census-wide DEFAULT_CAP=40 caveat
paragraph (with the residual multi-page-walk gap, labeled as a gap) is in `gap-census-2026-07.md`.

**Fetch-blocked residue, honest gaps, all re-walkable:** 117 ledger candidates cannot be dispositioned
because the document fetch itself fails without render or transport work: ncleg 109 per-section /PDF/
paths (every one attempted this pass, every one js_shell; dispositioning needs the Browserless render
path, conserved per the unit budget, operator decision), Alaska DOT&PF 2 (http_404), Melbourne 1
(http_404), Nova Scotia 1 (http_404), EC DG-Env PPWR guidance 1 (empty), EP Legislative Train 1 (empty),
NYC Article 320 PDF 1 (empty), MPA pointer to Singapore Statutes Online 1 (error_body; also the cross-host
boundary case already flagged). Separately, 3 Federal Register / DOT ledger rows sit `status='promoted'`
(pre-census promotions, 2026-07-19), outside the candidate walk by construction; recorded so the ledger
arithmetic is complete (FR/DOT 438 ledger = 435 censused + 3 promoted).

**Spend and safety:** 0 metered grounding, 0 Browserless units, 0 mints, 0 corpus writes; plan-mode Haiku
only fires on a successful fetch, and every remaining candidate failed at fetch, so classification spend
this pass was ≈$0. Foreground chunks only, keyset cursor, per-source mutation leases honored.

### Exhaustion pass — R2 no-cap rule, flow walk proven exhausted (2026-07-20)

Operator rulings R1-R5 landed: PR #366 merged (R1); enumeration caps ABOLISHED for free harvest (R2 —
free enumeration is never capped, walks run to exhaustion, the only stops are crawl trap / metered path /
technical block); ncleg's 109 Browserless PDFs deferred (R3); the 8 dead/empty residue written off (R4);
CI guards authorized (R5, Task 3). Task 1a-1c complete.

- **Task 1a, NSW EPA:** re-harvested uncapped → 220 (below ceiling, MEASURED). Supersedes last pass's
  "200 AT CAP" floor; 0 new ledger rows (the 200-cap re-harvest had already captured them).
- **Task 1b, the two multi-page walks.** Federal Register uses the JSON API (`walkFederalRegister`), NOT
  the 40-link `extractPortalLinks`, so it was never subject to that cap. Re-walked the flow window
  2026-06-22..07-17 (RULE) unbounded: the complete universe is **278 documents, 3 pages, 0 dropped —
  EXHAUSTED**. All 278 already accounted (275 censused + 3 promoted); the census's 435 dispositioned FR
  rows superset this window. **Side effect caught and reverted:** `portal_link_candidates` has
  `UNIQUE(url)` (global, not per-source), so the API re-walk's upsert reassigned ~272 FR rows from the
  census source `d9e0948e` to the FR-root row `dc907f90` (the default shortest-URL match). Reverted by an
  exact `source_id` UPDATE back to `d9e0948e` (444 restored, `dc907f90` back to 0); census_worklist was
  never touched. EUR-Lex OJ daily-view is now a **technical block (HTTP 202 JS-shell)** on plain HTTP for
  every probed day; the 157 flow candidates were captured 2026-07-19 pre-wall and are dispositioned; a
  Chrome-rendered probe of the 17 Jul L-series view returned the full instrument list (`render_path_
  available = true`). True EUR-Lex exhaustion is delivered by the stock walk (Task 4, CELEX API, not
  governed by the page wall) — the daily-view re-walk is recorded superseded_by_stock_walk per operator.
- **Task 1c, ledger audit (per-source AND per-page):** NO source and NO single page sits at a harvest
  ceiling (no count at 40 or 200). Every per-source count is MEASURED or carries an honest R2 stop-reason.
  The four formerly `cap_hit=true` sources (NSW 220, SCDES 164, AusInfra 128, ncleg 145) are all measured;
  the 132 stale `cap_hit=true` flags were cleared to `false` (clear-flags-when-satisfied) so no
  floor-by-policy remains. `cap_hit_remaining = 0`.

**Code (R2 made mechanical):** `walkEurlexOj` no longer hardcodes `DEFAULT_CAP=40` — it takes `cap`
(default Infinity, uncapped) and passes it through; `run-register-walk --cap` exposes it (default
uncapped). register-walk.test.mjs + portal-links.test.mjs 15/15.

**Delta vs PR #366 (1,331 rows / 39 sources / 112 relevant would-mints):** census totals UNCHANGED — the
exhaustion pass CONFIRMED exhaustion (proved no floors) rather than adding rows. Live rollup at close:
Regulations held 302/held 2/missing 300, Operations 161/2/159, Market Intel 38/0/38, Research 8/1/7;
world side moving as Session C lands its sweep4 recovery rows (pull live, do not cite priors).

**Findings recorded (route to B, not fixed here):** (1) `--census-exclude` anti-join fails at ~435
dispositioned rows for one source (client-built `NOT IN (…URLs…)` overflow) — the stock walk needs a
server-side `NOT EXISTS` RPC before it hits large held sets; (2) the FR census flow is attributed to a
DOT-document source row (`d9e0948e`) while a clean FR-root row (`dc907f90`, 0 census) exists — a source-
identity smell for the operator, left as-is to preserve census/candidate agreement.

**Spend and safety:** 0 metered grounding, 0 Browserless units, 0 mints, 0 corpus writes. The FR API
re-walk and NSW re-harvest are free HTTP; the one browser action was a single read-only Chrome probe of an
EUR-Lex page. Foreground only, keyset cursor.

### Task 3 — two CI guards (R5), fork-log + schema-drift (2026-07-20)

Both authorized guards built, tested (trip + pass), and wired into the discipline engine + invariant
registry. Full discipline suite 896/0 incl. the meta-gate.

- **Fork-log guard (rule 020, invariant RD-50).** A commit-time discipline rule (`.discipline/rules/
  020-fork-log-frozen.mjs`, like rule 012) that REJECTS any commit ADDING content to the deprecated fork
  `fsi-app/docs/ops/session-log.md`. A pure deletion is allowed; merge/revert commits are exempt. Four
  recorded fork-write instances (the fourth was this session's own near-miss, caught at staging) justified
  replacing the advisory header with a mechanical gate. Runs in the "Validate commits against discipline
  rules" CI job on every non-merge commit — it fires regardless of session type at commit time, closing
  the gap that PreToolUse (which does not fire in subagents) left open. 8/8 selftests.
- **Schema-drift audit (invariant RD-49).** A live-data audit (`scripts/verify/schema-drift-audit.mjs`)
  that introspects the live public schema (tables + views + matviews) and diffs object names against every
  committed `CREATE TABLE/VIEW` in `supabase/migrations/`. A live object with no committed source is DRIFT
  — the exact apply-then-commit-later window that burned the census twice (census_worklist,
  coverage_gap_census_findings). Pure diff core (`scripts/verify/lib/schema-drift.mjs`) unit-tested 7/7
  (trip + pass + allowlist + stale-allowlist); added to the data-audit lane (`run-data-audit-lane.mjs`,
  hard) so it runs nightly with DB secrets; three-state 0/1/2 (pass / drift-or-stale / no-creds). The
  allowlist is reason-bearing and self-audited (an entry that goes stale — object gone or now committed —
  is reported for removal).
- **Finding the guard caught on its first run (routes to Session B):** exactly one genuine drift —
  `acquisition_backlog_v`, a view over `coverage_gap_candidates`, live with NO committed migration
  anywhere in `supabase/migrations/`. The census tables (221/222) correctly show NO drift (the burn is
  closed). `acquisition_backlog_v` is allowlisted with a review-by tag pending its retroactive migration
  (or a drop if it is dead); the staleness check will flag the allowlist entry the moment the migration
  lands. Route to B: author the migration or drop the view.

---

## Session B, resume sync, session-log reconciliation, census-lane mandate opened (2026-07-19)

Session B's worktree (`wt-session-b`, branch `corpus-integrity/cc-grounding-executor-b`) was 47 commits
behind master (last synced before Phase R). Merged master in (not rebased, since Session B's own commits
were already pushed and public; rewriting them would have been the destructive move). Two conflicts, both
resolved non-destructively:

- **Compliance doc** (`docs/compliance/confidentiality-incident-2026-07-17-ncaer.md`): took master's side.
  Session A's restart independently re-verified the NCAER grounding-exposure finding and added the
  resolution sections; master's version is a strict superset of Session B's original.
- **`fsi-app/docs/ops/session-log.md`** (the deprecated fork): master had added a deprecation header to
  this exact file mid-merge, naming this canonical `docs/ops/session-log.md` (repo root) instead, per
  `CLAUDE.md` standing rule 6. Concatenated both sides, all history preserved, master's deprecation header
  kept at the top, consistent with the fork's own left-in-place policy.

**Reconciliation entry landed at the canonical root file** (this PR): Session B's final fsi-app-fork batch
(2026-07-17/18, 3 items promoted via mechanical repoint-then-stamp, 7 reassigned with concrete findings)
was verified against this file first and found genuinely missing, since Session A's 2026-07-18 restart
reconciliation snapshot (`drain_worklist` 64 rows) predates it (the batch grew the worklist to 66). Entered
through the reconciliation door the restart's TWO-FILE correction established, explicitly marked as
reconciled backfill, not ordinary new content. Full detail in the dated 2026-07-19 entry, root session log.

**Findings entry (divergence register): third instance of the fsi-app fork written as canonical.** Two
prior instances are named in the 2026-07-18 restart correction (its own initial misdiagnosis, and Session
B's independent 2026-07-17 containment-bank miss); this merge is a third, caught pre-commit this time,
during conflict resolution rather than after the fact. Three independent misses against one advisory
header is a pattern. Recommend the operator consider a hard guard (a CI or pre-commit check rejecting any
new commit touching `fsi-app/docs/ops/session-log.md`) rather than continuing to rely on the header alone.
Recommendation only, not built in this PR, consistent with the SW-2 item already queued on the sweep
ledger for the same root cause.

**NEW MANDATE opened this PR: census management lane.** Sessions A (intake) and C (discovery) are
launching a full-corpus gap census; Session B owns the data layer. Task 1 (`census_worklist` table,
migration, one PR) begins immediately after this merge lands, per operator dispatch. Tasks 2 (standing
dedup/rollup/flag-back duties) and 3 (`docs/census/gap-census-2026-07.md` skeleton) follow. No corpus
writes in this lane, census tables only; $0, no fetching.

---

## Session B, Task 1: `census_worklist` migration LANDED (2026-07-19)

Migration 221 applied (`kwrsbpiseruzbfwjpvsp`, via `apply_migration`, verified live + smoke-tested inside
a rollback: forward status transition passes; backward transition, identity-column mutation, hold-without-
reason, an invalid surface tag, and DELETE are all correctly rejected; zero rows persisted). Full design
rationale and column-by-column detail in `docs/inventories/migrations.md` row 221.

**Reuse-before-construction, stated:** neither existing table serves. `corpus_census` (mig 212) keys on
`intelligence_item_id`, a document with no corpus item yet cannot be represented there, which is the
entire point of a gap census. `coverage_gap_candidates` (mig 214) is a hand-curated, one-off ranked
pricing input, not a mechanical multi-lane enumeration ledger. The closest precedent, `portal_link_
candidates` (mig 162/220), is B1's live intake ledger; its shape (source_id + url + guarded status +
disposition-reason) is reused, but the table is new since coupling a measurement pass onto a production
intake ledger would conflate two different lifecycles. Lease discipline reuses `mutation_leases` (mig 211)
unmodified, its lease key column carries no FK constraint, so `census_worklist.id` leases through it
with zero schema change.

**Sessions A and C unblocked.** Producer lanes can now write rows: `source_id` + `document_url` (UNIQUE
pair) + `lane` (A|C) + `shape_class` + `enumeration_status` (guarded ladder) + `cap_hit` +
`dryrun_disposition` (+ `hold_reason`) + `surface_tags` (multi-tag, the four machine-addressable
surfaces) + `instrument_identifier`/`resolved_into_id` (Task 2 dedup) + `flagged_reason`/`flagged_at`
(RD-6 shape). Append-only (DELETE blocked unconditionally); `enumeration_status` transitions guarded
forward-only by trigger, with `flagged` reachable from any rank and one reset path back to `discovered`.

**Next:** Task 2 (standing dedup/rollup/flag-back duties) self-activates once rows exist to work; nothing
to do yet, table is empty. Task 3 (`docs/census/gap-census-2026-07.md` skeleton) follows in this session.

---

## Session B, Task 3: gap-census report skeleton LANDED (2026-07-19)

`docs/census/gap-census-2026-07.md` authored, structure only, per the dispatch: per surface (Regulations,
Operations, Market Intel, Research) four populations (enumerated, held, missing-from-held-sources tagged
to Session A, missing-from-the-world tagged to Session C), a cap-hit-sources table, per-surface and
per-source rollup tallies, a flagged-rows table, and a cross-source dedup log. Rank fields present on
every gap row, left empty; final FSI-lens prioritization is the operator's at review, not built here.
INDEX.md born-linked (new `## census` category, one entry, cross-linked to the migrations inventory).

No data populated (`census_worklist` is empty, migration 221 just landed). The document converges as
Sessions A and C write rows; Session B's standing Task-2 duties (dedup, rollup, flag-back) keep the
rollup tables and logs current against live state, not hand-maintained.

**Task 1 + Task 3 both riding PR #361** (Task 3 had no file overlap with Task 1 and no dependency that
required waiting on a separate merge, so it landed as a follow-up commit on the same open branch rather
than opening a second PR for two commits from the same dispatch). Session B now stands on Task 2: idle,
self-activating on the first `census_worklist` row Sessions A or C write.

---

## Session B, discipline correction + census rollup stitch LANDED (2026-07-19)

**Correction.** Operator flagged `census_worklist` reaching production via `apply_migration` with no
committed migration file at the time. Verified, not assumed: the file existed and was already merged (PR
#361) by the time of the correction, and fresh introspection confirmed zero drift from live. The real gap
was a roughly 20-25 minute window between the live apply and the commit reaching master, long enough for a
concurrent consumer to hit it: PR #362 shows a session that built against a guessed shape and had to
re-point once the real one landed. Third process finding of the census lane in one day (session-log fork;
a background-truncation finding named by the operator; this one). Full account:
`docs/ops/session-log.md`, 2026-07-19.

**Migration 222, two parts.** PART 1 retroactively captures `coverage_gap_census_findings` (Session C's
table, same DDL-before-migration gap, closed for reproducibility, ownership stays with C). PART 2:
`census_rollup_by_surface`, the view `census_worklist`'s own header committed Session B to owning. Built
against Session C's posted schema-stitch spec (commit `b5185b6d`), verified independently before building:
`census_worklist.source_id` is `NOT NULL`, a structural grain mismatch with `coverage_gap_census_findings`
(candidate sources not yet held), confirmed live (zero of C's 81 rows match a registered source). No merge
forced; the view normalizes both to a per-surface reporting projection, `pending_on_session_a` carried as
its own visible column per C's explicit ask, never folded into "missing."

**Live and verified against real data.** `regulations` 20 enumerated-world / 18 missing / 1 pending-on-A /
1 declined-or-parked (`census_worklist`-side all 0, table still empty); `operations` 18/18/0/0;
`market_intel` 5/3/0/2; `research` 3/3/0/0. `docs/census/gap-census-2026-07.md` gained a schema-reference
section (columns for both tables + the view, so no future consumer introspects `pg_catalog`) and the live
snapshot in its rollup table.

**Standing posture.** Session C idle, mandate closed. Session B resumes Task 2, self-activating on the
first `census_worklist` row Session A writes.

## Session A — census sweep execution begins, bank 1 register-API sources DONE (2026-07-19)

**Execution discipline (operator ruling, standing for the remainder of the sweep).** Every census chunk
runs FOREGROUND, no `run_in_background`, explicit timeout, 50-80 candidates per chunk, DB-verified via
direct query before the next chunk starts. This follows the run_in_background silent-truncation finding
from earlier the same day.

**Bank 1 — EUR-Lex + Federal Register, register-API sources, COMPLETE.**
- EUR-Lex (`260089a9-e334-4104-843c-cdfc28a94dcc`): 157 rows, ledger fully exhausted (not 1098+/cap-hit as
  the pre-compaction session record stated — live `portal_link_candidates` held only 157 rows for this
  source; both walk chunks together exhausted it). 104 `would_mint`, 53 `hold`. `cap_hit` was mismarked
  `true` on all 157 rows (inherited CLI flag from the stale pre-compaction assumption) and corrected to
  `false` by direct UPDATE once the discrepancy surfaced.
- Federal Register (`d9e0948e-71c7-4234-9ab4-28302141826f`): 435 rows, ledger fully exhausted. 42
  `would_mint` cleared the relevance floor normally; 387 `would_mint` are self-flagged `low-relevance`
  (Fork-4 floor, fail-open by design per D3 ruling — minted-and-flagged, not blocked); 6 `hold`.
  **Calibration check run mid-walk** (operator-requested): confirmed the enumeration layer
  (`extractPortalLinks`) is a genre-regex walk, unfiltered by agency/docket/date — for a rulemaking
  aggregator this trivially over-enumerates on structure, not topic. The domain discriminator is the
  downstream relevance floor, and a 25-item sample confirmed it discriminates correctly (verdict:
  CONFIRMED, not over-admitting). Universe-scope finding recorded durably in
  `docs/census/gap-census-2026-07.md` (new section, with the read-rule: filter
  `would_mint AND notes NOT ILIKE '%low-relevance%'` for the relevant-gap subset on register-class
  sources). Two title-insufficient residuals (`removal-of-self-reporting-requirement`,
  `completed-inspection-report-disposition`) tagged `[needs_title_review]` in `notes` per the operator's
  disposition, to settle at population ruling rather than chase full text now (census discipline is
  enumerate-and-disposition, not investigate). One tangential over-score accepted as within tolerance
  (1-in-10), per the operator: the low-relevance/normal split column is the systemic answer, not
  per-item perfection.

**Second environment finding, same class as the run_in_background truncation.** A foreground Bash call
(MPA Singapore chunk 1, `c49414da-7c9e-45cc-a629-f138166ecda5`) returned `[Tool result missing due to
internal error]` with zero rows written — confirmed via direct `census_worklist` count before re-running.
Re-ran the identical chunk command; it completed clean (18 rows, source ledger exhausted). **The recovery
pattern is now standing for the rest of the sweep**: on any mid-walk tool-call failure, verify row count
for the source against the expected chunk range before assuming loss; if zero (or short), re-run the exact
same chunk — the upsert on `(source_id, document_url)` is idempotent by construction, so a re-run is safe
by design, not a special case. Tool-call failures mid-walk (background-truncation, internal-error) are now
a recognized class; the cursor-plus-upsert pattern is the answer to all of them, not a per-incident patch.

**Third bug found and fixed mid-walk: census-writer identity-clobber on re-upsert.** CARB
(`45140924-25b6-4d2c-abe5-11a65386acdc`) had 5 pre-existing rows from an earlier smoke test under
`created_by='session-A-intake-census'`. `writeCensusRows` unconditionally stamped every row with the
CURRENT caller's `lane`/`createdBy` before upserting; migration 221's identity-immutability trigger
(`IS DISTINCT FROM` on source_id/document_url/lane/created_by/created_at) correctly rejected the whole
batch. Root cause: the writer never checked whether a URL already had an owning identity before
overwriting it — append-only identity-preservation is the DB's explicit intent (whoever discovers a
document owns that row's identity permanently, even across lanes/sessions re-walking the same source),
and the writer violated it blindly. Fixed in `src/lib/intake/census-writer.mjs`
(`writeCensusRows`): looks up existing `(lane, created_by)` for any URL already present for the source
before building rows, passes existing identity straight through unchanged (mutable fields — disposition,
tags, notes — still update normally), only stamps the current caller's identity on genuinely new URLs.
3 new unit tests (identity preserved on conflict / current caller's identity on a new url / lookup error
not swallowed), 12/12 passing. Verified live on CARB: 7 new rows under `session-A-census`, 5 preserved
byte-for-byte under the original `session-A-intake-census` identity.

**All-holds calibration check (operator-requested, resolved).** Six sources enumerated to all-holds
(Australia Infrastructure 40/40, MPA 18/18, SDDOT, Missouri DNR, DG TAXUD, FDOT). Real-dud vs shallow-walk
was settled without a paid re-walk, via (1) a read-only eyeball audit of every held row's URL + hold_reason
(the cheap discriminator a Fable second-opinion recommended before any re-walk, to separate
classifier-miscalibration from page-targeting), and (2) a FREE Chrome ground-truth check (claude-in-chrome,
zero Browserless) on MPA's merchant-shipping-act page. Verdict: **all-holds STANDS as genuine census data
for all six — the entity-gate is discriminating correctly** — with one structural refinement: for MPA and
Australia Infrastructure the held pages are real instrument INDEXES whose actual instruments live
CROSS-HOST (Singapore Statutes Online sso.agc.gov.sg; legislation.gov.au), which `extractPortalLinks`
excludes by design (same-host only, cross-host = new-source lead). Two `coverage_gap` flags logged routing
both cross-host registers to Session C as missing-from-the-world candidate sources. The IMO mepc-80
narrow-extraction flag rides the same finding class. A render-enabled MPA re-walk was run before the free
rail was re-confirmed — the render transport never fired (direct fetch non-thin, ladder never escalated;
log grep 0 browserless mentions) so **zero metered units were burned**; the standing rail from here is
free-only: plain fetch + Chrome-in-Claude-Code as the ground-truth instrument, no `--render`.

**Banks 2-6 COMPLETE: Regulations surface fully dispositioned (2026-07-19).** All 36 distinct
Regulations-surface hosts walked or dispositioned. 24 sources produced 777 census rows: 109 relevant
would-mints, 474 low-relevance would-mints (register-class overflow, correctly split), 2 dedup hits
(DG CLIMA), 192 holds, 0 gate rejects. 12 hosts zero/blocked, each with a recorded reason: JS-shell
(PIB India, EC Press Corner), dead URL (Brazil MMA), 403 bot-block (Victoria DEECA), static-register
shape gap (Leginfo — named plan-1.1 gap), English-only genre regex class finding (GIOS Poland, Mexico
DOF — class flag filed; DOF additionally needed NODE_OPTIONS=--use-system-ca for its broken TLS chain,
which worked), extraction-pattern miss (IMO mepc-80), pdf_direct single-doc shape (IMO CDN), genuine
zeros (ENERGY STAR, Port of LA Chrome-confirmed, driveelectric.gov). Fourth code fix this lane: the
census disposition map sent dedup rejections ("chokepoint:duplicate — subject already exists") to
invariant_reject; census-wise that IS a dedup_hit (coverage confirmed). Fixed in census-writer.mjs +
test (12/12), table-wide absence sweep found exactly the 2 miswritten CLIMA rows, corrected, 0 residual.
Standing harvest pattern from mid-bank: harvest-first then consume (SDDOT proved consume-only misreads
"not yet harvested" as "zero candidates"). Next: Operations surface (25 sources).

**Banks 7-9 COMPLETE: Operations surface fully dispositioned (2026-07-20).** All 24 distinct
Operations-surface hosts walked or dispositioned. 10 sources produced 130 census rows: 1 relevant
would-mint (NC General Assembly), 6 low-relevance, 123 holds, 0 rejects. Three sources hit the
extractPortalLinks 40-link per-page cap and are marked cap_hit (NSW EPA 40, SC DES 40, ncleg 40-extracted
/ 12-written) — as is Australia Infrastructure retroactively (also exactly 40; the cap was recognized as
the extractor's DEFAULT_CAP mid-Operations, another no-silent-truncation catch). 14 hosts zero/blocked
with recorded reasons: 403 roadblocks (ILO, Nunavut — flagged), dead URL (American Samoa — flagged),
language-regex class (Brazil Transportes pt, MLIT-PRI ja — rides the standing class flag),
data-tool/report-library zeros (EIA, IMF PortWatch, IEA), pdf_direct asset host (UK DfT
assets.publishing.service.gov.uk), thin/JS or nav-only (Clark County, MOT Singapore, u.ae, ASEAN),
Nova Scotia (1 candidate, inconclusive fetch, re-walkable). Next: Market Intel + Research (~113 sources).

**SWEEP COMPLETE: Market Intel + Research dispositioned; full census walk DONE (2026-07-20).** The ~113
MI/Research raw rows dedupe to 23 distinct hosts (heavy host overlap with already-walked surfaces). 8
rows written (Cranfield 3, Fraunhofer 2, WRI 1, IPCC 1, ILO 1); six 403 roadblocks (ITF-OECD, OECD, OECD
iLibrary, IADB, UNCTAD, McKinsey — one class flag), two dead URLs (IRENA, ERIM — one class flag), the
rest zeros under the research-genre extractor class finding (flag filed: INSTRUMENT_RE is
legal-instrument-genre only; research sources publishing report/paper/study links enumerate to zero
structurally — the Research/MI rollup carries this caveat until the extractor is genre-aware).

**FINAL SWEEP TALLY (census_worklist, 2026-07-20):** 915 rows across 39 sources with rows (of ~83
distinct hosts walked across all four surfaces): 110 relevant would-mints, 480 low-relevance would-mints,
2 dedup hits, 323 holds, 0 gate rejects; 132 cap-hit rows across 4 sources. Every zero/blocked host
carries a recorded reason (flag or bank-report line) — none silently dropped. Four sweep-wide extractor
caveats are durably recorded in docs/census/gap-census-2026-07.md (language class, research-genre class,
40-link page cap, cross-host instrument boundary) plus per-source universe-scope notes. Four code/data
fixes landed mid-sweep: keyset --census-exclude URL-blowup workaround, census-writer identity
preservation (+3 tests), dedup->dedup_hit disposition mapping (+1 test, table-wide sweep, 0 residuals),
EUR-Lex cap_hit correction. Rollup consumption: Session B's census_rollup_by_surface view self-activates
on these rows; population ruling on the 110 relevant would-mints is the operator's next decision point.
