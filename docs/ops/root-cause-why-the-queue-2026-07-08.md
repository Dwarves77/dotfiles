# Root-cause audit — why the platform is in this state (2026-07-08)

Read-only diagnostic. Written because the /admin issues queue reads **1,280** with **0 agent runs**
and the operator asked, plainly, how it got this messed up. This is the WHY, not a task list.

## The one sentence

**The product is supposed to be an autonomous *resolution* engine. What got built is a human-supervised
*detection* engine — it finds problems and parks them for a person. The autonomous *drain* half
(cron-wired resolve-loops, flag garbage-collection, quarantine→a-place, provisional→auto-tier) was
deferred stage by stage and never landed — and the remediation work, mine included, kept polishing the
human-review surfaces instead of removing the human.**

## The yardstick (the doctrine, now explicit)

The engine researches, tiers, links, grounds, and **resolves everything to a place** on its own.
Nothing rests in quarantine. A human is for **visibility, not gates** — a human as correctness-catch or
graph-populator is a defect. Every finding below is the distance between that and what exists.

## The evidence

- **1,280 = 489 provisional sources + 784 platform flags + 5 spot-check + 2 agent-emission.** (Staged
  updates, materialization failures, attribution mismatches, coverage gaps: all 0.)
- **0 agent runs. The loop has never flipped. $0 spent.** The queue is not a backlog the machine fell
  behind on — it is the residue of a machine that was **never wired to drain.**
- **The 784 is inflated ~2–3× by dead flags nobody closed.** 152 quarantine-flags exist but only **23**
  point to still-quarantined items — **129 are stale** (item long since re-verified or archived, flag
  rode on). Deferrals: 51 of 115 sit on now-verified items. ~211 of the 784 are dead on arrival.
- **101 flags are `seed-fallback "activated on / — trigger: null_orgId"`** — they fire on anonymous
  page loads. Observability over-firing into the same queue, not a data defect.
- **42 items are quarantined at all** — which violates "everything gets a place." Quarantine became a
  parking lot, not a transient.
- Strip the dead flags and the noise and the *real* stuck-content is: **42 quarantined items + 489
  provisional sources + ~365 live regen/re-ground/deferral flags** — every one of which the engine
  *should* drain and has **no cron-wired path to.**

## The architectural inversion (the root)

Built **intake-first**: produce candidates → park uncertainty for a human → human approves. The
autonomous drain was never wired. Exhibit A, file:line:

- Verification auto-activates only **high-confidence H-tier** sources
  (`src/lib/sources/verification.ts:627-671`). Everything uncertain (M-tier) is inserted into
  `provisional_sources` as `pending_review` (`verification.ts:678-708`) — **and nothing autonomous ever
  re-visits it.** The only exit is a human clicking Approve
  (`ProvisionalReviewCard.tsx:112 → api/admin/sources/promote/route.ts:76-82`), `isPlatformAdmin`-gated,
  requiring a **human-supplied tier**.
- The "loop" — the hourly cron `.github/workflows/source-monitoring.yml` — calls **only**
  `check-sources` (a source *change* monitor) and `drain-first-fetch`. **No cron drains provisional
  sources, regenerates flagged items, or runs research-or-erase.** Flipping the loop as built today
  would monitor sources for changes and **still not touch the 1,280.**
- CLAUDE.md encodes the human gate as *doctrine*: *"DO NOT process provisional sources… Activation is a
  data change… not a code change,"* *"Staged updates require human approval,"* *"Promotion requires…
  human review."* The human-in-the-loop was **designed in**, not an accident.

The confidence-threshold existed for the *green* path (auto-activate H-tier). The other half —
**"low-confidence escapes to a *small bounded* queue the loop keeps retrying/researching"** — was never
built. Low-confidence escapes to an **unbounded human queue that nothing drains.** That one inversion,
repeated at every stage (sources, grounding, conformance, tiering), **is** the 1,280.

## The five process failures that produced it

1. **The autonomy doctrine was retrofitted onto a human-in-the-loop architecture, and the two were
   never reconciled.** The codebase faithfully implements human gates; the autonomy lives in prose
   doctrine layered on top. Two contradictory specs, both "in force." The build followed the one in
   code.
2. **Observability was built lavishly; reconciliation wasn't.** Flags are emitted at every checkpoint
   (conformance, completeness, truncation, null-tier, quarantine, exhaustion, seed-fallback). Nothing
   *closes* them on satisfaction and nothing *drains* them autonomously. Instrumentation accreted into a
   queue that's ~30% dead. The system can *see* every problem and *resolve* almost none without a human
   — the "human as correctness-catch" defect, concrete.
3. **Defensive pre-launch gating quietly became the permanent architecture.** "Don't let the machine
   auto-publish pre-launch — gate it behind a human" was reasonable. But the gate never got its
   autonomous replacement. The loop stayed OFF "until ready," the human gates stayed IN "to be safe,"
   and the drain-loops were deferred to a "loop-flip wave" that never came. The scaffold became the
   building.
4. **The remediation program optimized the wrong axis.** DEEP-AUDIT, the P0–P5 phases, build-to-
   completion — all measured *findings fixed / tasks merged / guards green*. **None** measured *does the
   engine drain the queue.* So the program reached "DONE 7/7" with the engine having never run.
5. **The completion claim was never falsifiable against reality.** "Complete" was defined by task-lists,
   not by the one behavior that is the product. With the loop OFF and 0 agent runs, "complete" could not
   be tested — and wasn't. The 1,280 was on /admin the whole time, growing, while the program declared
   done.

## My part in it (owned, specific)

I treated this queue as a **human triage backlog.** I built an "operator decision table," set 18 flags
to `in_review` "for your ruling," re-mounted a dismissed-item recovery drawer, wrote a browser-checklist
for you to work. I built a **better cockpit for a human pilot** on a plane that is supposed to fly
itself. I declared **DONE 7/7** on a system with **0 agent runs** — measuring build-tasks-merged, not
engine-drains-to-zero. Each dispatch inherited the prior one's human-in-the-loop assumption and I
carried it forward instead of challenging it. That is the exact defect the doctrine reset names, and it
compounded on my watch.

## Confirmed by full code trace (file:line) — the build-gap register

Three independent traces (provisional drain; the 784 flag resolvers; the loop wiring) converge on one
line: **detection is automated; remediation is not.** Of ~17 flag classes, exactly **one** drains
autonomously — and that one (`data-audit-lane`) is an *alarm* whose single open row exists *because* the
rest of the backlog isn't draining (`run-data-audit-lane.mjs:29-54`; `quarantine-disposition-audit.mjs:16-20`).

**The loop, fully mapped** (all crons live in `.github/workflows/`; `vercel.json` has none):
- hourly `source-monitoring` → `check-sources` (source-change monitor) + `drain-first-fetch` (first brief for a **new** source only).
- monthly `spot-check` (a drift **sampler** — never writes `sources.spotchecked`) + `trust-recompute`.
- nightly `data-audit-lane` — **detection only, no `--apply`.**
- **`/api/worker/reconcile` is scheduled by NOTHING** — the consumer that would flag changed items for re-grounding is unwired, so the change signals `check-sources` writes to `monitoring_queue` **dead-end unconsumed** (`reconcile/route.ts:7-19`; corroborated `systemic-fetch-and-loop-audit-2026-06-28.md:20`).

**The 784, by resolver wiring:**
- **FULLY-AUTONOMOUS: 1 class / 1 flag** — `data-audit-lane` (self-open + self-close).
- **AUTO-CLOSE but STARVED: 152** — `set_provenance_status_trigger`: the trigger closes the flag when an item re-verifies (`139_*.sql:89-100`), but nothing autonomously *drives* re-verification (only manual `regen-quarantined.mjs --apply`); and `research/technology/tool/innovation` types are excluded from the resolver outright (`regen-quarantined.mjs:33 HOLD_TYPES`) → they can **never** clear.
- **MANUAL-SCRIPT-ONLY: ~570** across 10+ classes — `skill-conformance-audit` (240), `disposition_deferred` (115), `null-tier-host` (31), `completeness-exposure` (25), `skill-conformance-semantic` (21), `phase2_priority_review` (19, minus a legit legal-counsel subset), `surface-visibility-audit` (18, mine), `b-audit` (11), `error-body-gate` (10), `phase2_analysis_relabel` (9), `truncation-guard` (2).
- **NO RESOLVER AT ALL: ~129** — `seed-fallback-trigger` (101; an *infra* liveness alarm misfiled in the data queue, never auto-closed when infra recovers, `seed-fallback-flag.ts`), `exhaustion_record` (26; its writer isn't even wired into live code — referenced only in tests, `seek-more.mjs:122-135`), `entity-gate` (1), 2 orphan one-offs.

**Provisional (489), spot-check (5), agent-emission (2):** each requires a human or a manual script.
Provisional→active is human-by-doctrine (`promote/route.ts:76-82`); quarantine regen + spot-check
clearing are manual scripts (`regen-quarantined.mjs`, `spot-check-all-h-tier.mjs`); agent-flags clear
only via per-row `/admin` clicks (`integrity-flags/[id]/regenerate/route.ts:9-11` — *"no batch
auto-regenerate, by spec"*).

**No confidence-threshold bounded-human-queue exists anywhere.** The "escape hatch" for low confidence
is an unbounded pile nothing re-visits — the exact defect the doctrine names.

## What "fixed" means (diagnosis, not a menu)

Not a longer review queue — its **removal**. Every stage gets an autonomous, cron-wired drain-loop:
provisional → auto-tier-and-activate (bounded human escape only below a confidence floor); quarantine →
research-or-erase to a surface / source / honest-erase (zero resting quarantine); conformance /
completeness / truncation → auto-regenerate. A flag garbage-collector closes on satisfaction (kills
~211 immediately). The residual human set is **doctrine-bounded to legal-interpretation calls only**,
and *proven* small — not "whatever the machine gave up on." And "complete" is redefined as **"the engine
takes the queue to a place on its own,"** verified by a dry-run to near-zero.

## Related
- [program-closeout-2026-07-08](./program-closeout-2026-07-08.md) — the "DONE 7/7" claim this audit corrects (it measured the wrong axis)
- [traceability-matrix-2026-07-07](./chrome-audit-2026-07/traceability-matrix-2026-07-07.md) — the finding register; note every disposition assumed a human or a "phase," never an autonomous drain
- [flip-readiness-2026-07-08](./flip-readiness-2026-07-08.md) — "flip the loop" was framed as a switch; this audit shows the loop as built doesn't drain the queue
