# Data-audit lane recurrence — root-cause audit (2026-06-28)

**Question (operator):** the Data-audit lane has gone RED every night for a week+; multiple fixes
were attempted with no success. Why have none of the fixes worked?

**Short answer:** the fixes were the wrong *category*. Every recurring red is a **data-state drift
check** (does the stored data still agree with the live resolver / gate / canonical tier?). The
fixes were **code / rule / gate** changes. A correct gate evaluated over un-re-synced data is RED
*by construction* — `claims-tier-audit.mjs` literally says so in its header: *"honestly RED until the
Phase 1 backfill re-stamps every FACT claim from the resolver."* The one-time **data** re-sync that
each gate change requires was run **once** (2026-06-11), went green that day, and was **never re-run**
while the corpus kept moving. There is **no forcing function** that re-runs it, so the lane re-reports
the same red each morning and the next attempt reaches for another code fix.

---

## Tonight's lane (run 28317628476, 2026-06-28 09:18Z)

| check | verdict | what actually drives it |
|---|---|---|
| one-tier-per-host | FAIL | **1 host** `sinir.gov.br` carries base_tier 1 *and* 2 (split-tier rows, no override) |
| claims-tier | FAIL | **309** claims: 264 FACT `stamp != resolver` + **41 non-FACT carrying a stamp** |
| substrate-agreement | FAIL | **2** items stored=quarantined but `validate()`=verified (stale status cache) |
| ledger-onepass | FAIL | same roots as claims-tier (264 stamp drift + 41 non-FACT stamped) |
| quarantine-disposition | FAIL | **1** reg item, deferral clock expired & re-fired; 75 deferrals validly standing |
| vocab-sync / orphan-source / unregistered-span-host | PASS | — |
| skill-conformance (soft) | PASS | 247/334 conformant |

Not a crash. The audits ran fully (1m22s is their normal runtime). 5 hard checks red.

---

## The five reds decompose into THREE drift mechanisms + TWO maintenance debts

### Mechanism 1 — the FACT re-stamp backfill ran once and was never re-run (264 FACT drift)
- The audits compare each FACT's stored `source_tier_at_grounding` against what the resolver
  (`src/lib/sources/institution.ts`) computes **now**. The corpus is a moving target: every source
  registration / re-tier and every new generation changes the resolver's answer while previously
  stamped rows stay frozen.
- The one-time re-sync tool exists: **`scripts/backfill-claim-tiers-pg.mjs`** (idempotent; re-stamps
  every FACT from the resolver, then runs a corpus revalidation). It was run with `--apply` on
  **2026-06-11** (snapshot `scripts/_snapshots/a6-claim-tiers-prior.jsonl` = 3,851 rows; commit
  c84a9c6 reported all three data audits GREEN that day: *"claims-tier 0 mismatches over 5,864 rows"*).
- Since then: migrations 138 (06-11) and 141 (06-15) changed the **gate**, generation kept adding
  claims (5,864 → 7,748), and sources were registered/re-tiered — but **the backfill was never re-run**.
  It is a one-shot manual tool with no scheduler and no "owed-after-change" trigger. So the corpus
  re-drifted and the gate (correctly) fails it.
- **Why prior fixes didn't help:** 138 and 141 were gate-logic changes. They ship a *status*
  revalidation (recompute `provenance_status`) but **not** a *stamp* backfill (recompute
  `source_tier_at_grounding`). The stamp drift was never re-cured after 06-11.

### Mechanism 2 — generation is stamping NON-FACT claims, and 40/41 of them are this session's WS1 (41 violations)
- `claims-tier` + `ledger-onepass` both assert **every non-FACT claim (ANALYSIS/GAP/LEGAL) must hold
  NULL** `source_tier_at_grounding` (invariant SC-7). 41 claims violate this — all ANALYSIS.
- Diagnostic (`scripts/_diag/_nonfact-stamp-diag.mjs`): **40 of 41 are on the 9 Path B items I
  re-grounded this session.** They were written to the live DB by the **uncommitted WS1 edit-1**
  (`canonical-pipeline.ts:730`, the R1 "stamp grounded-ANALYSIS" change) which the Path B batch runs
  via jiti against the working tree.
- **The backfill cannot fix these** — `backfill-claim-tiers-pg.mjs:31` does `if (c.claim_kind !==
  "FACT") continue;`. It only re-stamps FACT; it never NULLs an errant non-FACT stamp. So re-running
  the backfill leaves `claims-tier` RED on the non-FACT class.
- **This is a WS1 design defect, not a fix that "didn't work."** WS1's R1 (store a tier on grounded
  ANALYSIS to drive the confidence label) directly contradicts SC-7. The right implementation is to
  **render-derive** the label's tier (resolve the span host at display time) and keep the stored
  non-FACT stamp NULL — which also matches the locked design principle "the label is a pure function
  of tier, **no stored field**." WS1 edit-1 must be reworked (and the 40 rows NULLed) before any commit.

### Mechanism 3 — the status cache was not recomputed after the last data change (2 stale items)
- `substrate-agreement` (invariant EP-8) asserts stored `provenance_status` agrees with `validate()`
  now. 2 items are stored=quarantined while `validate()`=verified — including
  **`eu_ets_directive_2023_959` (= item 15f63ea9)**, the item my migration-143 label fix made
  validate-verified. The fix made it *verifiable* but nothing re-ran `validate()`→write-status, so the
  cache is stale. A corpus revalidation flips it (and realizes the "1/9 verified" for real).

### Debt A — one split-tier host (one-tier-per-host)
- `sinir.gov.br` has two source rows at T1 and T2 with no `tier_override`. Canonicalize to one honest
  institutional tier (or set an explicit override). Independent of the backfill; never owned.

### Debt B — one expired deferral (quarantine-disposition)
- A single `regulation` item's time-bounded deferral expired and re-fired (now undispositioned past
  bound). 75 deferrals are validly standing. Re-dispose the one (re-defer with a window, research→
  re-ground, or honest archive). A maintenance treadmill item with no per-class owner.

---

## The DEEPER driver under the quarantine backlog (truncation is NOT fully cured)
The reason regulation items keep landing **sub-floor** (ledger CROSS-FORMAT: regulation items=97,
verified=50, quar=47, below-floor=14) — which feeds the quarantine backlog the disposition check
polices — is that **the truncation defect was moved, not eliminated**:

- PR #155 removed the **fetch** cap (full enacted text is now *fetched*).
- But `buildSourceBlocks` (`canonical-pipeline.ts:127`) divides `SYNTH_INPUT_BUDGET_CHARS` (560k)
  across the pool: `perCorr = floor((budget − primaryLen) / corrCount)`. On a large-pool item the
  per-source share collapses. **Live evidence from tonight's restore run on item 5cc10a6d (PPWR):**
  ```
  [truncation-guard] eur-lex .../OJ:L_202500040  — collected 7444/40000 (cap 7444; synthesis-budget)
  [truncation-guard] ec.europa.eu/document/...   — collected 7444/40000 (cap 7444; synthesis-budget)
  ```
  The binding **legal text is truncated to 7,444 chars in the grounding input** (≈560k/75 sources)
  because it is a *corroborator*, not `fetched[0]`. Only `fetched[0]` is kept "full"; the actual
  enacted law isn't the designated primary. The back of the law (penalties / annexes / per-year
  trajectory) never reaches the extractor → required-slot facts ground to commentary (T5–6) →
  below floor → quarantine. This is why re-running Path B does **not** cleanly recover these items
  (7a0ead55 failed re-grounding again tonight with `fact_below_authority_floor`).

---

## Why it RECURS (the meta-cause)
1. **No forcing function.** The lane reflects RED into an `integrity_flags` block row (Layer C) that
   HALTS generation — but it does **not trigger the remediation**. Each morning the same red is
   re-read as "still broken," and a code-category fix is attempted; the data re-sync is never scheduled.
2. **Moving corpus.** Every source edit, generation run, and gate migration silently re-owes a
   backfill + revalidation that nobody schedules.
3. **One-shot manual tools.** `backfill-claim-tiers-pg.mjs` and the corpus revalidation are manual,
   `--apply`-gated, with no "owed-after-change" trigger and no idempotent nightly re-run.
4. **Partial/stale dispositions.** `docs/data-audit-dispositions.md` waives only `unregistered-span-host`
   (to 2026-07-15). `claims-tier` / `substrate-agreement` / `one-tier-per-host` reds are **uncovered** —
   neither fixed nor waived, so they just persist.

---

## What turns it green AND keeps it green
| # | action | clears | kind |
|---|---|---|---|
| A | Re-run `backfill-claim-tiers-pg.mjs --apply` (re-stamp FACT from resolver) | claims-tier/ledger 264 FACT drift | data |
| B | NULL the 40 self-inflicted non-FACT stamps **and rework WS1 edit-1 to render-derive the label tier** (stored non-FACT stays NULL) | claims-tier/ledger 41 non-FACT + stops re-seeding | code+data |
| C | Corpus revalidation (recompute `provenance_status`) | substrate-agreement 2 (realizes 15f63ea9 verified) | data |
| D | Canonicalize `sinir.gov.br` to one tier (or override) | one-tier-per-host | data |
| E | Re-dispose the 1 expired-deferral reg item | quarantine-disposition | data |
| F | **Fix the synthesis-budget truncation**: designate the binding legal text as the never-truncated primary (or cap corroborator count / raise budget so the law isn't divided down to 7.4k) | the sub-floor quarantine *source* | code (the deeper cure) |
| G | **Add the forcing function**: after any gate/source change OR N nights red, the backfill+revalidation is OWED and tracked; ideally an idempotent nightly re-stamp+revalidate so the data can't drift silently | the recurrence itself | process/code |

A–E are a one-evening green. F + G are what stop it coming back. Doing A–E without F+G buys one green
night; the corpus re-drifts and the lane reds again — exactly the loop we are in.

## Forensic sort of the recurrence week (last-green = c84a9c6, 2026-06-11)

Read-only classification of every in-window change touching the lane / gate / audits / pipeline.
**Headline: no correct gate was weakened to dodge the owed data re-sync. The gates were STRENGTHENED.**
The recurrence is fully explained by the missing data re-sync + no forcing function — not by any code
that made a check more lenient.

### The dangerous bucket (weaken-a-correct-gate-to-silence-a-red) — searched, essentially CLEAN
- **Lane composition got stronger.** The only edit to the `AUDITS` list (run-data-audit-lane.mjs) was
  *adding* `ledger-onepass` (hard, 34cf35b/06-15). No check removed; none demoted hard→soft
  (skill-conformance was soft from lane creation).
- **unregistered-span baseline never ratcheted up.** Set once to 841 at lane creation
  (62c4ef4/06-11, `"recorded":"first-run"`); tonight's count 836 is *below* it. No silent rebaseline.
- **Floor migration 141 (036ce3b/06-15) is STRICTER than 138, not weaker.** 138 floored reg-only
  (all non-reg exempt); 141 *added* floors (research ≤T4, technology ≤T5) while carrying the
  market/initiative/regional exemptions forward as registered SC-8 named exemptions (REVISIT). It
  tightened the gate.
- **Layer B/C (3a38004/06-22) added teeth** (block generation on red) — strengthening.
- **DATA-layer caveat (not a code weakening):** 131 `disposition_deferred` flags, all open,
  bulk-created by script on 06-18/06-19 (48 in one minute) with a *generic* shared reason
  ("blocked on the network-stable generation lane"), owner Jason. Legitimate **at creation** (a real
  systemic blocker — the Anthropic/Browserless hang, fixed 06-19→06-21) and anti-silence by design
  (deferrals expire → self-resurrect → hard-fail; tonight's "1 resurrected" is one firing). BUT the
  cited blocker is now resolved and the items were never re-grounded — and for the large-pool ones the
  REAL blocker is the synthesis-budget truncation (F), not network stability. So these are drifting
  toward stale. **Action: work them via F + regen, do NOT re-defer.** Re-deferring resolved-blocker
  items *would* be the dodge.

### Bucket 1 — WRONG, REVERT/REWORK
- **WS1 edit-1** (uncommitted, `canonical-pipeline.ts:730`): the only wrong code. Violates SC-7
  (stores a tier on non-FACT), contradicts the locked "label = render-derived, no stored field"
  principle, and wrote 40 of tonight's 41 non-FACT violations. Rework to render-derive + NULL the 40
  rows. **Nothing committed is in this bucket.**

### Bucket 2 — CORRECT CODE, WRONG TARGET (or incomplete) — KEEP
- Migration 141 (per-type floor) — correct calibration; it shipped a *status* revalidation but not the
  owed *stamp* backfill, so it didn't green the lane, but it is correct work. KEEP.
- #155 fetch-truncation fix (54b4de8) — correct but incomplete (synthesis-budget half remains = F). KEEP.
- 743594a register-before-ground (NULL-stamp), ledger-onepass, Layer B/C teeth, deferral-split
  legibility (0078ea2/3477e23), and the pipeline/error-handling hardening (streaming, anthropic
  fatal/transient classify, retain-on-failure, reason-aware retry, max_tokens headroom, persist-pool,
  fetchPrimaryWithFallback) — all correct. KEEP. Reverting any undoes real work.

### Bucket 3 — DEAD, REMOVE
- None outstanding. 429ea4c already dropped the vestigial generation ledger (self-cleanup). The `_diag`
  scratch is uncommitted and handled by the never-`git add -A` discipline.

**Net: the only thing to "address before committing" is the uncommitted WS1 edit-1. There is no
committed wrong/dead code to revert and no weakened gate to restore.** The corollary matters: a strong,
correct, *strengthening* set of gates over un-re-synced data is exactly the loop — which is why the
forcing function (G) + the data re-sync (A/C) are the pairing the gates always needed.

## WS1 commit verdict
**Do not commit WS1 as-is.** Edit-1 (stamp grounded-ANALYSIS) is mis-built against SC-7 and is the
source of 40 of tonight's 41 non-FACT violations. The other WS1 pieces (migrations 142/143, the
label-variant matcher, the relabel-script extension, the Path B full-fetch) are sound; only edit-1 and
its 40 live rows need rework/cleanup first. Reworking edit-1 to render-derive the label also satisfies
the "no stored confidence field" design principle.
