# Lane L11: SBTi Target Dashboard producer (built) + EIA v2 petroleum-spot unblock (real work)

Read first, in this order: this file; `docs/dispatches/lane-common-contract.md` in full; `docs/plans/
complete-build-plan-2026-10-01.md` section 1.2 (row 02S9) and its L11 entry in section 2; `docs/specs/
02-market-intel.md` section 7 in full; then the README for this dispatch, especially "What is already
built" item 4 and the coordinator-ruling section on the lead-time chart / SBTi producer.

Lane id: `l11`. Branch: cut from `origin/master`. Branch name: `lane/l11-sbti-eia-2026-10-03`. Model:
Sonnet for the SBTi producer and workflow (new code, new .xls parsing); Haiku for the EIA unblock
documentation and the post-secret dry-run verification, per the plan's own model assignment for that
half.

## COORDINATOR RULING, 2026-10-03 (under ADR-039's operator delegation) - supersedes the finish-plan hold

Per `docs/dispatches/lane-briefs/2026-10-03/brief-l10.md`'s own ruling section: the complete-build-plan
(ADR-039, 2026-10-01) supersedes `finish-plan-2026-09-02.md`'s lead-time-chart hold. **The SBTi Target
Dashboard producer is built in this lane.** It feeds `LeadTimeChart.tsx` (lane L10) via the existing
`market_series` table and the existing WO-16 producer-registry pattern - the same shape every other
market producer in this codebase already follows (`ecb-fx-producer.mjs`, `eia-v2-petroleum-spot-
producer.mjs`, `eu-weekly-oil-bulletin` producer), not a new shape.

**Dispatch pattern, stated explicitly per the coordinator's ruling:** the SBTi producer's own GitHub
Actions workflow follows the SAME shape `research-assessment.yml` already ships (and `producers.yml`'s
existing per-producer steps): `workflow_dispatch`-only (no schedule, rule 16), a `mode: dry|apply` choice
input defaulting to `dry`, the producer's own reviewed-code `ENABLED` const as the build-time gate, and
secrets wired through the job's `env:` block exactly as `research-assessment.yml` wires
`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`. SBTi's own data source needs no API key (free
.xls, no login, per spec 02 section 7) - "secrets wired like research-assessment.yml" means the
PATTERN (how any secret this producer eventually needs would be wired, and how the two standing DB
secrets are wired), not that SBTi itself requires a new secret today.

**EIA_API_KEY is an operator action the coordinator will request directly.** This lane still prepares
the exact command and runbook (CLAUDE.md rule 13's decision-ready delivery), but you are not the one
asking the operator for it - state this plainly in your report rather than treating the ask as your own
open item to chase.

## Objective and requirement IDs

Spec 02S9 (market series producers): both the EIA v2 unblock (real remaining work, unchanged from this
brief's prior draft) and the SBTi Target Dashboard producer (now built, per the ruling above).

**SBTi half** - a new, free, no-key weekly producer (`sciencebasedtargets.org/target-dashboard`, .xls,
per spec 02 section 7's own table: company, sector, region, near/net-zero target status including
"commitment removed," target type, scopes, base year, temperature classification), writing into
`market_series` via the existing registry pattern, dispatch-only per rule 16.

**EIA half** - unchanged: the producer is code-complete (README's "What is already built" item 4); this
lane's real work is the operator runbook and, once the secret exists, a live dry-run verification of the
product-code set against a real authenticated response.

## Operator rulings that bind you

- **CLAUDE.md rule 2** (never fabricate): if the live SBTi .xls parse or the EIA live response does not
  match what you expected, report exactly what came back; a row this producer cannot parse with
  confidence is skipped with a named warning, never guessed.
- **CLAUDE.md rule 9** (no credentials in the repo): you never see, request, or write the actual
  `EIA_API_KEY` value; the coordinator requests it directly from the operator (ruling above).
- **CLAUDE.md rule 16** (build mode holds the scrape cadence off): the SBTi producer is dispatch-callable
  only, no schedule, same posture as every other producer in `producers.yml`.
- **This dispatch's coordinator ruling** (above): the SBTi producer is in scope, built, not held.

## Exact write set

- `fsi-app/scripts/producers/market/sbti-target-dashboard-producer.mjs` (new) - free .xls fetch (no key,
  no login), parses the per-company rows named in spec 02 section 7, writes through the existing
  `market_series` registry pattern via the guarded path (`fsi-app/scripts/lib/db.mjs`), dry by default,
  `--apply` to write, `deps`-injected fetch so tests run with no network, reviewed-code `ENABLED` const
  per the two-gate shape (ADR-023 section 4).
- `fsi-app/scripts/producers/market/sbti-target-dashboard-producer.test.mjs` (new) - fixture-based, no
  network, no DB credential; includes a negative test for the survivorship case named in spec 02 section
  7's own warning ("SBTi's 'commitment removed' status" - track exits explicitly, never silently drop a
  company that exited).
- A new workflow step or a new workflow file for the SBTi producer, following `research-assessment.yml`'s
  exact shape (`workflow_dispatch`, `mode: dry|apply`, `ENABLED` const gate, chained dry-run guard step
  per rule 16 parity) - decide whether this is a new step inside `.github/workflows/producers.yml`
  (matching its existing per-producer step convention) or a standalone file (matching `research-
  assessment.yml`'s own standalone shape) by reading both first; report which you chose and why.
- `docs/ops/runbooks/eia-api-key-registration.md` (new, S-sized) - the exact operator checklist: the `gh
  secret set EIA_API_KEY --repo Dwarves77/dotfiles` command (value supplied interactively by the operator,
  never embedded in the doc), the workflow dispatch command to run the producer once the secret exists,
  and the expected `harness_runs` read-back query. State plainly in the doc's own header that the
  coordinator requests this secret from the operator directly - this runbook is the decision-ready
  artifact for that ask, not a task for this lane to chase itself.
- No change to `fsi-app/scripts/producers/market/eia-v2-petroleum-spot-producer.mjs` unless your live
  product-code check finds a genuine drift - if it does, STOP and report the exact mismatch before
  editing.
- `docs/ops/session-log.d/2026-10-03-l11.md` (new).

## READ FIRST

1. `fsi-app/scripts/producers/market/eia-v2-petroleum-spot-producer.mjs`, IN FULL - confirm its own
   header's claims against the live files it cites.
2. `fsi-app/scripts/producers/market/ecb-fx-producer.mjs`, IN FULL - the second reference producer for
   the WO-16 registry pattern (the plan's own L11 text names it as precedent for the "existing registry
   pattern").
3. `.github/workflows/research-assessment.yml`, IN FULL - the exact dispatch-only, `mode: dry|apply`,
   `ENABLED`-const, secrets-wired-via-env shape your SBTi workflow step/file must match.
4. `.github/workflows/producers.yml`, IN FULL - the existing per-producer step convention (the `options:`
   choice list, the per-step `if:` gating, the dry/apply command pair) - decide against this and item 3
   above which shape fits your new producer, per the write-set note.
5. `fsi-app/src/lib/market/series-registry.mjs` - the exact `market_series` write contract (key prefix
   convention, required columns) your producer must satisfy; confirm `sbti` or an equivalent key prefix
   does not already exist (prior-art check).
6. `fsi-app/.discipline/governance/secrets-registry.mjs` - confirm `EIA_API_KEY` is listed; confirm no
   new secret is required for SBTi (it should not be, per the ruling above - if your read finds otherwise,
   report the contradiction).
7. `.github/workflows/producers.yml` lines naming the `eia-v2-petroleum-spot` option and dispatch step -
   exact input name and command shape for your runbook.
8. `fsi-app/.env.local.example` - confirm `EIA_API_KEY`'s exact variable name.
9. `docs/inventories/migrations.md` - confirm `market_series`'s current shape (no schema change, this
   lane requests none).

Report "read and reused" naming each file above.

## Migration number

None requested; none needed. Both producers write to the existing `market_series` table via the existing
registry pattern.

## Harness and flywheel wiring (rule 17: nothing runs alone)

The SBTi producer is dispatch-callable (not standing), same posture as `research-assessment.yml` and
`producers.yml`'s existing steps; a run leaves a harness-run artifact / guarded-write read-back exactly
as those do - confirm your new workflow actually produces one (read `research-assessment.yml`'s own
harness-landing step) and name the artifact path in your report. State explicitly that `LeadTimeChart.tsx`
(lane L10) is this producer's downstream consumer - the chart is NOT wired by this lane (L10's own write
set does that), but your report names the exact `market_series` key/shape L10 depends on, so the two
lanes' contracts are explicit rather than assumed. For EIA: state whether the producer's output reaches
`market_series` and from there any consuming UI; if no consumer exists yet beyond this check, name that
as an open item.

## R14 compliance

Tools before data. Both producers ship as tools; no `--apply` run happens without this lane's own dry
verification first, and the EIA live dry-run depends on the operator having set the secret (see
"Dependencies"). $0: SBTi is a free public .xls, no key; EIA is free once a key exists. No LLM call in
either path.

## Tests, and the fire-once requirement

- `node --test fsi-app/scripts/producers/market/sbti-target-dashboard-producer.test.mjs` - fixture-based.
- "Test what you build" (SBTi): run the producer once for real, dry mode, against the live public .xls
  URL (free, no credential, no rate-limit risk) and paste a representative parsed row (company, sector,
  target-type fields), plus confirm the survivorship negative test fires correctly against a fixture
  "commitment removed" row.
- Before the EIA secret exists: `node fsi-app/scripts/producers/market/eia-v2-petroleum-spot-producer.mjs`
  (dry, no key) - confirm it fails closed with a named, honest error. Paste the exact error text.
- "Test what you build" (EIA): if the secret is already set when you run this lane, state that and run
  the producer once for real (dry, key present), paste the raw response's `product`/`product-name` values
  compared against `PRODUCT_CODES`. If not yet set, state that plainly and leave this step for a
  coordinator re-dispatch - do not invent a result.

## UX compliance

Not applicable - this lane touches no `.tsx`/`.css` file.

## Dependencies

None structurally for the SBTi half (the data source is free and public today). The EIA live-response
verification depends on the operator having registered `EIA_API_KEY`, which the coordinator - not this
lane - requests directly.

## Report format

Per the lane common contract. State: which workflow shape you chose for SBTi and why; the SBTi parsed
sample row; the exact `market_series` key/shape L10's `LeadTimeChart.tsx` should read (so the two lanes'
contracts line up without a second round); whether the EIA secret was already set when you ran this lane
and the dry-run output either way.

## Standing prohibitions

No nested agents. No `--no-verify`. No edit to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or
`docs/INDEX.md`. No migration file. No DB credential ever written to a file, no live write without the
operator's own secret-registration action first (EIA) or without `--apply` (SBTi). No standing cron for
either producer (rule 16). No silent drop of an SBTi "commitment removed" company - survivorship is
tracked explicitly.
