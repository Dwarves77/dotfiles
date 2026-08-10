# Runtime clock inventory + spend containment (2026-08-10)

Operator concern (verbatim intent): "I'm extremely worried that we are building a tool that constantly
is at work and will cost us money at a level I cannot contain if it is not able to be scheduled to run
at times I specify and not always." This audit is the durable answer: every place a clock can exist in
the product, verified LIVE (not from docs) on 2026-08-10, with the containment levers and the actions
taken. Reference doc for any future "what runs on its own?" question. Method for each finding is named
per rule 14.

## The inventory (every possible clock, checked)

1. **Vercel crons — NONE.** `[CONFIRMED]` `fsi-app/vercel.json` contains no cron config (read
   2026-08-10). No deployment-side scheduler exists; the "monthly spot-check" cron referenced in
   CLAUDE.md is disabled AND has no scheduler that could run it.
2. **Server daemons — impossible by architecture.** `[CONFIRMED]` The app is serverless (Next.js on
   Vercel); every function is request-scoped. There is no resident process that can idle, poll, or
   loop when no one is using the site.
3. **Database cron (pg_cron 1.6.4 installed) — now ZERO jobs.** `[CONFIRMED by live query]` The sole
   job (`gate-a-health-refresh`, `*/10 * * * *`, jobid 1) was UNSCHEDULED this session by operator
   ruling — see Actions below. Read-back: `SELECT count(*) FROM cron.job` → 0.
4. **The fleet (15 Claude scheduled workers — the only component that has ever burned real spend) —
   HALTED.** `[CONFIRMED by live query]` The `fleet-budget-halt` row is OPEN (armed 2026-08-09
   00:15 UTC). History shows 7 halt cycles since 2026-08-07: each release was for a single measured
   firing (cost measurement, backfill batches), each re-armed within minutes. Every charter checks the
   row as STEP 0 and stops if open; the check overrides all other instructions; time never
   auto-releases it. (Governing runbook: [fleet-budget-control](../runbooks/fleet-budget-control.md).)
5. **capture-worker — no clock.** `[CONFIRMED by elimination]` It is a Supabase Edge Function
   (`supabase/functions/capture-worker/`), invoked-only; with zero cron jobs and the fleet halted,
   nothing invokes it.
6. **Browser polling — only while a page is open.** `[CONFIRMED]` All `setInterval` uses are
   client-side (notifications bell 60s, community sidebar 60s, admin B2 banner 30s, relative-time
   ticker). They stop when the tab closes; cost is DB reads only while an operator is looking.
7. **In-app Claude API calls — request-triggered only, cooldown-gated.** `[CONFIRMED from the enforced
   route table + code]` Per-item generation: platform-admin only, 1h/item cooldown. Admin scan: 4h
   cooldown. /api/ask: rate-limited. Nothing fires without a person acting.
8. **The flywheel — zero lines built.** Its spec ships with the operator-cadence execution model
   (default OFF, operator-scheduled or on-demand only, kill-switched, bounded per firing) written in
   BEFORE construction: [recursive-compounding-discovery](../plans/recursive-compounding-discovery-2026-08-10.md).

**Bottom line:** metered spend is zero at rest and can only become nonzero through a deliberate
operator act (release the halt, re-enable tasks, or click generate/scan in admin). `[CONFIRMED]`

## Actions taken this session (durable data changes, recorded per code-vs-data separation)

- **`gate-a-health-refresh` cron UNSCHEDULED** (operator ruling 2026-08-10: the health checks "always
  come back negative because the system isn't done being built... pointless at the moment and should be
  halted until needed"). Executed live via `SELECT cron.unschedule(1);` → `true`; read-back 0 jobs.
  The job was dashboard-created (never in a migration), so there is no migration to keep in sync.
  Consequence (verified from the functions' own source): `gate_a_health()` has a built-in 30-minute
  staleness gate, so `/api/health/surfaces`' gate_a section now reports an explicit
  `cache stale since <ts>` error — visibly dormant, never silently stale. **Re-enable when needed:**
  one-shot on demand `SELECT public.gate_a_health_refresh();` or re-schedule
  `SELECT cron.schedule('gate-a-health-refresh', '<cadence>', 'SELECT public.gate_a_health_refresh()');`
  at whatever cadence the operator then chooses.
- **Dev-harness stop-hook governed** (session-scoped): the per-turn git nag was re-firing an
  unactionable condition every turn — per-turn context injection is real spend for zero information.
  Rebuilt as a governor: change-triggered alerts immediate; unchanged-state repeats timed (1h) and
  hard-capped (3) then permanently silent; kill-switch file; fail-to-silence. Ten executed tests,
  including one that caught a cap-reset defect pre-ship. The script dies with the dev container (it was
  never part of the product); the PATTERN is the durable artifact — reuse it for any future recurring
  alert: change-triggered + timed repeats + hard cap + kill switch + fail-to-silence.

## The rulings this audit operationalizes (operator, 2026-08-10)

1. "Something that runs every turn... running and getting no answer... is wasted cost for zero return."
   → No unconditional per-event checks; alerts are change-triggered, repeats timed and capped.
2. "Run the scan of existing docs once a month or once a week. Not having it running automatically all
   the time." → All corpus-wide passes are on-demand + operator-scheduled, DEFAULT OFF, never
   always-on. Encoded in the flywheel plan's Execution model section before any construction.
3. Health checks on an unfinished system are noise → halted until needed (action above).

## Containment levers (the operator's switches, paste-ready)

- **Halt the fleet** (works even if every schedule were re-enabled — workers stop at STEP 0):
  `INSERT INTO integrity_flags (category,subject_type,subject_ref,description,status,created_by)
  VALUES ('workflow_gap','system','fleet-budget-halt','Halted <date>: <reason>','open','operator-budget-control');`
- **Release** (deliberate act; time never clears it):
  `UPDATE integrity_flags SET status='resolved' WHERE subject_ref='fleet-budget-halt' AND status='open';`
- **Second independent layer:** pause/delete the scheduled tasks themselves (Claude UI). Both layers
  must be open for any fleet work to run — an accidental restart requires two separate mistakes.
- **Metered generation** sits behind the budget kill-switch + pilot-first discipline (rule 11 /
  fleet-budget-control); the flywheel's algorithmic layers (discovery, clustering, gaps) are $0 by
  construction.

## Residuals (named, not hidden)

- Claude scheduled-task pause states not re-queried this session: `list_triggers` costs ~300k tokens
  per call (rule 11's own measured lesson). `[HYPOTHESIS: still paused per runbook 2026-08-07]` —
  immaterial to containment while the halt row is open, which IS live-verified.
- `gate_a_health_refresh`/`gate_a_health_cache` exist only in the live DB (dashboard-created, no
  migration). Acceptable for a cache surface; if it graduates to a load-bearing product path, it needs
  a migration home (two-track policy).
