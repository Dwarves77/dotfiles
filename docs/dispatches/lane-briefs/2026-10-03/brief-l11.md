# Lane L11: EIA v2 petroleum-spot unblock (real work) + SBTi producer (held)

Read first, in this order: this file; `docs/dispatches/lane-common-contract.md` in full; `docs/plans/
complete-build-plan-2026-10-01.md` section 1.2 (row 02S9) and its L11 entry in section 2; `docs/specs/
02-market-intel.md` section 7 in full; then the README for this dispatch, especially "What is already
built" item 4 and the "Open question" section.

Lane id: `l11`. Branch: cut from `origin/master`. Branch name: `lane/l11-eia-unblock-2026-10-03`. Model:
Haiku for the secret-registration preparation and the dry-to-apply verification once the secret exists
(per the plan's own model assignment for this half); Sonnet if the live-response check finds the product
codes have drifted and a code change is genuinely needed.

## OPEN QUESTION - read before doing anything else

The SBTi Target Dashboard producer (spec 02S9, feeding the lead-time chart) is HELD on the same operator
ruling named in L10's brief and the README. **Do not build `scripts/producers/market/sbti-target-
dashboard.mjs`.** This brief's write set covers the EIA v2 unblock only.

## Objective and requirement IDs

Spec 02S9 (market series producers). The README's "What is already built" item 4 establishes [CONFIRMED]
that the EIA v2 petroleum-spot producer is code-complete, dry-run-safe and registered in `.github/
workflows/producers.yml`, blocked only on the `EIA_API_KEY` GitHub Actions secret - an operator action,
not code, per the plan's own framing ("this lane prepares the exact `gh secret set` command and the
workflow step, per remediation-style decision-ready delivery under rule 13"). This lane's real work is:
(a) confirm the producer's own header claims against the current live tree, (b) produce the exact,
copy-pasteable operator command, (c) once the operator confirms the secret is set, run the producer in
dry mode against the live API and read back a real authenticated response to confirm the product-code
set named in the producer's header has not drifted (its own header states this was never confirmed live).

## Operator rulings that bind you

- **CLAUDE.md rule 2** (never fabricate): if the live EIA response does not match `PRODUCT_CODES`, report
  exactly what came back, do not guess a fix.
- **CLAUDE.md rule 9** (no credentials in the repo): you never see, request, or write the actual
  `EIA_API_KEY` value. The `gh secret set EIA_API_KEY` command you hand the operator takes the value from
  their own shell/clipboard at the moment they run it; your report never contains it.
- **README's open question**: the SBTi half is out of scope until the operator rules.

## Exact write set

- No change to `fsi-app/scripts/producers/market/eia-v2-petroleum-spot-producer.mjs` unless your live
  product-code check (see below) finds a genuine drift - if it does, STOP and report the exact mismatch
  before editing; do not silently patch the code list.
- `docs/ops/runbooks/eia-api-key-registration.md` (new, S-sized) - the exact operator checklist: the `gh
  secret set EIA_API_KEY --repo Dwarves77/dotfiles` command (value supplied interactively by the operator,
  never embedded in the doc), the workflow dispatch command to run the producer once the secret exists
  (`gh workflow run producers.yml -f producer=eia-v2-petroleum-spot`, confirm the exact input name against
  `producers.yml`'s own `options:` list first), and the expected `harness_runs` read-back query.
- `docs/ops/session-log.d/2026-10-03-l11.md` (new).

## READ FIRST

1. `fsi-app/scripts/producers/market/eia-v2-petroleum-spot-producer.mjs`, IN FULL - confirm its own
   header's claims (data_sources row, sources row, `EIA_API_KEY` registered in `secrets-registry.mjs`,
   the exact endpoint URL) against the live files it cites.
2. `fsi-app/.discipline/governance/secrets-registry.mjs` - confirm `EIA_API_KEY` is listed and what the
   registry requires of a script that reads it.
3. `.github/workflows/producers.yml` lines 84-95 and 260-290, IN FULL for those ranges - the exact
   `options:` input name and the dispatch step shape, so your runbook's `gh workflow run` command is
   exact, not approximate.
4. `fsi-app/.env.local.example` - confirm the variable name matches exactly (`EIA_API_KEY`, not a
   near-miss).
5. `docs/archive/CLAUDE-session-log-2026-04.md`'s B.0 API-integration table (cited by the producer's own
   header) - read the cited row, confirm it says what the producer's header claims it says.
6. `docs/inventories/migrations.md` and `fsi-app/src/lib/market/series-registry.mjs` - confirm
   `market_series` (the table this producer writes to) is unchanged and the `eia-v2` key prefix matches.

Report "read and reused" naming each file above.

## Migration number

None requested; none needed. This producer writes to the existing `market_series` table via the existing
registry pattern.

## Harness and flywheel wiring (rule 17: nothing runs alone)

The producer is already registered as a dispatch-callable workflow step (not a standing cron, consistent
with rule 16); this lane does not change that wiring. If the live dry run in the Tests section below
succeeds, state explicitly whether the producer's output reaches `market_series` and from there any
consuming UI (grep for `eia-v2` or the series key in `fsi-app/src`) - if no consumer exists yet, name that
as an open item for a follow-on lane, per rule 17's own framing (do not leave it unstated).

## R14 compliance

Tools before data. The code is already built (R14 "tools" half is done); this lane's dry run is a
verification, not a population run. No write happens without the operator's own `--apply` dispatch after
reading this lane's report. $0: EIA's API is free once a key exists; no LLM call in this lane.

## Tests, and the fire-once requirement

- Before the secret exists: `node fsi-app/scripts/producers/market/eia-v2-petroleum-spot-producer.mjs`
  (dry mode, no key) - confirm it fails closed with a named, honest error (missing key), never a
  fabricated row. Paste the exact error text.
- "Test what you build": if the operator has already set the secret by the time you run this lane state
  that explicitly and run `node fsi-app/scripts/producers/market/eia-v2-petroleum-spot-producer.mjs`
  (dry, with the key present) once for real, paste the raw response's `product`/`product-name` values
  compared against `PRODUCT_CODES`, and report drift or confirmation. If the secret is not yet set, state
  that plainly and leave this step for the coordinator to re-dispatch after the operator acts - do not
  invent a result.

## UX compliance

Not applicable - this lane touches no `.tsx`/`.css` file.

## Dependencies

None structurally. The live-response verification step depends on the operator having registered
`EIA_API_KEY` first; if not yet done, this lane still delivers the runbook and the pre-secret dry-fail
confirmation, and reports the verification step as pending.

## Report format

Per the lane common contract. State plainly whether the secret was already set when you ran this lane,
the exact command you are handing the operator, the dry-run output (pre- or post-secret, whichever
applies), and the open-question status for the SBTi half (restate that it stays held).

## Standing prohibitions

No nested agents. No `--no-verify`. No edit to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or
`docs/INDEX.md`. No migration file. No DB credential ever written to a file, no live write without the
operator's own secret-registration action first. No SBTi producer code of any shape.
