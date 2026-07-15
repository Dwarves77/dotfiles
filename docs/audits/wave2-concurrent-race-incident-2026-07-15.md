# Wave 2 Concurrent-Race Incident — 2026-07-15

Status: recovered + hardened. Incident record for the funded-pass concurrent-race that duplicated claims on
6 items and zeroed 2 items during the Wave 2 re-attribution run.

## Root cause

The first Wave 2 funded-pass launch nested `node` under a `nohup ... &` inside a wrapper script that then
exited. The detached child survived the wrapper exit. A relaunch (believing the first had ended) then drove
the **same worklist** concurrently. Two funded-pass processes ran lock-step over one worklist.

Two independent structural gaps let a launch-method error become data corruption:

1. **No run-level mutual exclusion.** Nothing mechanically prevented a second funded-pass from driving a
   worklist already in flight. The armed-lock (`GROUNDING_ACQUIRE_ENABLED`) gates *fetching*, not *concurrency*.
2. **Delete-then-reinsert ground writes.** `canonical-pipeline.ts` grounds by deleting an item's whole claim
   ledger (line 1173, a raw client delete — no snapshot) then re-inserting the new set (line 1498). Between
   those, the item's ledger does not exist. The in-memory dominance-guard restore (lines 1520-1523) only runs
   on an in-process regression; a `taskkill` mid-write kills the process before either the re-insert or the
   restore, leaving the item at zero claims.

## Damage (measured against the DB)

- **Spend:** Wave 2 cumulative $23.71 across 129 paid rows (the authoritative-cumulative bound held under the
  two-process race — a now-proven property; neither process breached the ceiling).
- **Duplicate claims:** 36 full-identity duplicate rows across 6 items (WAC 13, Oregon 11, Slovenia 5, India 4,
  IMO Air 2, Wyoming 1). Same `(item, section_row_id, claim_text, source_id, tier, kind, source_span)`, byte-
  identical except id/extracted_at. NOT the 163 legitimate multi-section claims (same claim_text across
  different sections) — those are pre-existing corpus structure, control-proven on verified items never in the
  worklist, and were untouched.
- **Zeroed items:** 2. Nashville Building Energy Programs (`e65ec48d`) 31->0; Zero-Emission Requirements for
  World Heritage Fjords (`82f09535`) 32->0. Killed mid-write after the delete, before the re-insert.
- **Flips:** 0. No verified item was touched.

## Recovery

1. **Dedup (Step 2).** Field-identity verification first (delete nothing until proven): 36 full-identity groups
   cleared, 163 multi-section + 2 span-divergent HELD. Corrected guarded dedup (keyed on the full identity
   tuple, NOT claim_text alone — the original race-cleanup script would have destroyed the 163 legitimate
   claims). 36 rows deleted. Post-dedup SQL `GROUP BY` over all 10,026 rows confirms **zero** remaining full-
   identity duplicate groups corpus-wide.
2. **Zeroed items (Step 3).** Non-restorable from any snapshot (raw delete, in-memory restore died with the
   process, no history table). But sections (14 each) and source pools (Fjords 17 substantive rows, Nashville
   5) survived, so recovery is a cheap resynth (`generateBriefFromStored`, zero Browserless) reusing the stored
   pool. Queued into the Step 5 relaunch.
3. **Relaunch (Step 5).** Single supervised process, direct launch (no nested nohup), under the run-lock.

## The fix (mechanical, so a launch-method error can never again corrupt data)

- **Run-lock (migration 205, this recovery).** `public.funded_pass_runlock` + atomic
  `acquire_funded_pass_lock` / heartbeat / release SQL functions. Acquired at process start, heartbeat between
  items, released at clean exit, with a stale-lock takeover rule (heartbeat older than 300s is claimable, the
  takeover is logged in the row). A second live acquisition FAILS and the runner exits with **zero spend**
  (exit code 6). Proven live: a second funded-pass launched while the first held the lock was refused, naming
  the incumbent pid. Golden: `scripts/verify/funded-pass-lock-golden.mjs` (second-instance reject, stale
  takeover, heartbeat ownership, release). Invariant: run-lock enforced. Doctrine: `funded-pass-run-lock` /
  `funded-pass-single-entrypoint`.
- **Emergency-pause poll (this recovery).** The runner polls `system_state.global_processing_paused` between
  items, so an operator STOP is a flag-flip, not a process kill. Kills mid-write are what zeroed the two items;
  the graceful-stop path removes that vector for a supervised single process.
- **Atomic ground writes (hardening H2, sequenced after recovery close).** Replaces delete-then-reinsert with
  build-then-swap so a ground interrupted at any instant leaves the item with either the complete prior ledger
  or the complete new ledger, never empty. Makes the Nashville/Fjords zeroing impossible, not merely
  recoverable. (Tracked in the grounding-pipeline hardening unit.)

## Proven properties

- The authoritative-cumulative bound held the total spend under a two-process race (neither process breached
  the $60 ceiling; the blind-spot-closing sum over all run-window rows is why).
- Duplicate defect is zero corpus-wide (whole-table SQL aggregate, not a sample).
- Second-instance launch is refused with zero spend (live proof + golden).

## Lesson

Launch background node **directly** as the supervised task. Never nest `node` under `nohup ... &` inside a
wrapper that can exit — the detached child outlives the wrapper and races the next launch. The run-lock is the
mechanical backstop, but the launch discipline is the first line.

## Branch-rule amendment (operator ruling 2026-07-15) — history rewrite is precise, not absolute

The standing "do not rebase, reset, or force-push this branch" rule is now precise: **no history rewrite may
remove or orphan `8eb7534` or any other agent's committed work.** Rewrites of your OWN commits, unshared by
other actors, with a safety ref in place and `--force-with-lease`, are permitted **when per-commit CI
validation forces it** (e.g. a rule-015 fix baked into an already-pushed commit that a new commit cannot
clear). The prohibition protects other agents' work and the shared history, not branch history for its own
sake. Any such rewrite records old-head → new-head + reason + operator-authorization in the reconciliation
doc — today's incident was about unattributed mutations, and git history does not get to acquire one.
