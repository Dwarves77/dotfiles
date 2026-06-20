# Caro's Ledge — Tracked Follow-Ons (as of 2026-06-20)

Durable list of known, **deliberate, non-urgent** work surfaced during the streaming-fix +
grounding run and the Supabase table audit. **None of these blocks anything.** Each carries a
*named fix* so nothing is ambient. Schedule as a tracked batch; do not interleave with an active run.

Context: the streaming root-cause fix (PR #148) and the `--regen-quarantined` second pass (PR #149)
are MERGED. Corpus is 256 verified / 77 quarantined. Data-audit lane is 7/8 hard PASS; the one red is
item 3 below (named, tracked, benign).

---

## 1. Content fixes — the 3 flagship errors (content, NOT streaming)
**Status: deliberate, not urgent. Small.**
- **2× max_tokens truncation** on the largest regs (`CSRD`, `EU ETS extension to maritime`): the
  brief + Claim Provenance Ledger + trailing YAML overran the 24000-token budget, so the closing YAML
  frontmatter was never emitted → parse fail → item stayed quarantined.
  **Named fix:** raise `max_tokens` headroom for oversized regs, or split generation (brief, then
  ledger+YAML in a second pass) so the trailing YAML is never the truncation casualty. Gate on
  `stop_reason === "max_tokens"` to detect it deterministically.
- **1× out-of-vocab `compliance_object_tags`** value (`89656109`): the model emitted a tag outside the
  CHECK-constraint vocab.
  **Named fix:** one-line — either add the value to the metadata vocab (if legitimate) or tighten the
  generator prompt's allowed-tag list. Mechanical.

## 2. Residual quarantined cohort (~11 KEEP items) — label/slot discipline class
**Status: deliberate, not urgent.**
After the regen pass (+34 verified), the residual fail on `unlabeled_assertion` /
`missing_required_slot` (a binding/analytical sentence with no label, or a required structured slot the
brief didn't fill), and on `fact_below_authority_floor` (source genuinely too low-tier).
**Named fix:**
- label/slot class → from-stored regeneration with stronger generation-labeling enforcement (the
  current generator occasionally emits an unlabeled assertion the strict validator catches; retries are
  stochastic). A deterministic post-generation label-sweep is the durable fix.
- `fact_below_authority_floor` → NOT regen-fixable: route to 1A-relabel (FACT→ANALYSIS) or counsel hold;
  never relabel slot-bound reg facts.

## 3. `unregistered-span-host` audit red (the 1/8 lane red) — NAMED, TRACKED, BENIGN
**Status: deliberate, not urgent. This is the standing lane red — known, not a mystery.**
Cause: grounding legitimately grounded facts against real cited corroborator hosts faster than the
(separate, human-reviewed) source-registration loop registers them. The count rose with the run.
It will **not** go green on its own.
**Named fix (this is also fix #4's payoff):** wire the canonical **per-item `growStep`** into the
reground/regen runners (`e2-phase3-ground.mjs`, `phase2-reground.mjs`) so cited-host registration runs
**per item, host-tier-consistently**, the same way the live workflow does (generate→register→section→
ground→grow). Alternative/complement: host-tier canonicalization via the credibility-model (Phase 0').
**Do NOT** re-attempt a batch grow — that broke one-tier-per-host/claims-tier/ledger on 2026-06-20 and
had to be reverted (snapshot + guardedDelete). **DOCTRINE: grow is per-item in the workflow, never batch.**

## 4. Per-item grow wired into the runners
**Status: deliberate, not urgent.** (Resolves #3.)
**Named fix:** add a `growStep(itemId)` call after a successful `ground` in the reground/regen runners,
guarded so it runs incrementally per item (host-deduped, tier-consistent) — not as a batch. Verify
against ALL lane invariants (one-tier-per-host, claims-tier, ledger, unregistered-span) before scaling,
since the batch version broke three of them.

## 5. Scheduled backup job (none exists today)
**Status: deliberate, do soon-ish. NOT critical path.**
Today's protection is purely architectural: soft-delete (`is_archived`, rows intact) + append-only
versioning (`intelligence_item_versions`, trigger) + occasional MANUAL `*_pre_phase5` snapshots. That
covers the common cases (accidental edit/archive). It does NOT cover catastrophic loss (project/account).
**Named fix:** a scheduled GitHub Action (or Supabase scheduled Edge Function) running `pg_dump` to
object storage on a cron — fully external to the app, a few hours' work.
**Separate confirm (outside the repo):** check the Supabase **platform** plan setting for automated daily
backups / Point-in-Time-Recovery, so we know what platform-level protection already exists before
building a code-owned one.

## 6. `institutions` documentation — DONE 2026-06-20
**Status: COMPLETE (non-destructive).**
Added a clarifying comment to `src/lib/sources/institution.ts`: the `institutions` table (+ the
`sources.institution_id` FK, mig 122) is a publisher-identity/grouping registry, **orthogonal to tier**
and **not read at tier resolution**; the tier authority is `sources.base_tier`. So `institutions` being
write-only at runtime is intended, not a divergence. (This closes the only "actionable" item from the
table audit — by documentation, not by wiring.)

## 7. Dead/empty table cleanup
**Status: deliberate, NOT now. Per-candidate verification required. Blocks nothing.**
Documented finding from the table audit (forum_* cluster, vendor* cluster, case_studies/endorsements,
community_topic_groups, taxonomy_nodes, user_profiles, etc.). "Zero `src/` references" proves the APP
doesn't read them, NOT that nothing does.
**Named process (NOT a quick migration — DROP is irreversible on the shared dev=prod DB):**
per candidate confirm: no trigger, no scheduled job, no live FK depending on it, no mid-design use;
then a reversible migration with table definitions preserved.
**`*_pre_phase5` snapshots are BACKUPS — do NOT drop them.** Decide separately (export-then-keep).
`intelligence_summaries` (2,310 rows) is SHELVED per CLAUDE.md — not a drop candidate.

---

### Doctrine captured from this run
- **Grow is per-item in the workflow, never batch** (a batch grow over 251 items broke 3 lane invariants
  on 2026-06-20; reverted via snapshot + guardedDelete with verified items unchanged).
- **Streaming for large completions** (buffered max_tokens-24000 hangs; `stream:true` completes) — the
  canonical path now streams; heartbeat is progress-tied so a real hang is never masked.
- Validate a broad mutating pass against **all** invariants before running, not just the one it targets.
