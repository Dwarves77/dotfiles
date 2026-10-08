# EIA_API_KEY registration, operator runbook (lane L11, 2026-10-03)

**The coordinator requests this secret from the operator directly.** This runbook is the decision-ready
artifact for that request (CLAUDE.md rule 13), not an open item this lane is chasing itself, the brief
for this lane states plainly: "EIA_API_KEY is an operator action the coordinator will request directly."
This lane never sees, requests, or writes the actual key value (CLAUDE.md rule 9).

## Why this is still needed

`scripts/producers/market/eia-v2-petroleum-spot-producer.mjs` is code-complete, fixture-tested, and
already wired into `.github/workflows/producers.yml` (the `eia-v2-petroleum-spot` dispatch option, two
runtime gates: the producer's own `ENABLED` const, already `true`, and the workflow's
`MARKET_PRODUCER_EIA_V2_ENABLED` env switch, set to `'1'` in that step). The ONE remaining gap is that
`EIA_API_KEY` does not exist as a GitHub Actions repository secret yet, only as a local `.env`
credential, per `fsi-app/.discipline/governance/secrets-registry.mjs`'s own `TOPOLOGY` entry for it
(`vaults: ['github-actions', 'local-.env']`, `writeAuthority: 'gh (repo scope; operator created it from
the GitHub UI 2026-09-03) / local'`). The registry ALREADY lists `EIA_API_KEY` in `WORKFLOW_SECRETS`
(so the secrets-reference-audit admits the workflow's reference to it) and the producers.yml step
already reads `secrets.EIA_API_KEY` into its `env:` block, the wiring on the code side is done; only
the GitHub-side secret VALUE is missing.

**Confirmed this session** (this lane's own dry run, no key, no `--input`):

```
$ node scripts/producers/market/eia-v2-petroleum-spot-producer.mjs
eia-v2-petroleum-spot-producer: no EIA_API_KEY in the environment, cannot fetch live (this is the
gate 3 note in this file's own header, not a code defect). Set EIA_API_KEY, or pass --input <path>/
stdin with a saved EIA API v2 response.
```

Exit code 3 (`NetworkError`), a named, honest refusal, never a fabricated fetch. This is the correct,
expected failure mode with no key present; it is not evidence of a code defect.

## Step 1, operator registers the secret (not this lane, not the coordinator)

The operator runs, from a machine with `gh` authenticated against this repo and the real EIA API key in
hand (obtained free, no cost, at <https://www.eia.gov/opendata/register.php>):

```bash
gh secret set EIA_API_KEY --repo Dwarves77/dotfiles
```

`gh` will prompt for the secret value interactively (or read it from stdin/a file with `--body`/`<
file`, the operator's choice); the value is never typed into this runbook, a commit, or a chat
message, per CLAUDE.md rule 9.

Verify it is set (lists secret NAMES only, never values):

```bash
gh secret list --repo Dwarves77/dotfiles | grep EIA_API_KEY
```

## Step 2, dispatch the producer, mode=dry first

Actions tab → **Data producers** workflow → **Run workflow**, with inputs:

- `mode`: `dry`
- `producer`: `registry`
- `registry_producer`: `eia-v2-petroleum-spot`

Equivalent `gh` CLI dispatch (the exact staged command this runbook promises):

```bash
gh workflow run producers.yml \
  --repo Dwarves77/dotfiles \
  -f mode=dry \
  -f producer=registry \
  -f registry_producer=eia-v2-petroleum-spot
```

This step's own comment in `producers.yml` states the expectation plainly: a dry run with the secret
now present should fetch the live EIA API v2 response, parse it, and print a plan (`N to create, M to
update`), the live product/series check this lane's own "Tests" section asked for but could not
complete (egress to `api.eia.gov` IS reachable from this lane's own sandbox, confirmed by a live HTTP
403 `API_KEY_INVALID` response with no real key, see "What this lane did NOT do" below, but a 403
carries no `product`/`product-name` values to diff; only a real key, which this lane does not have and
must not request itself, completes the check).

**After the dry run completes**, read its job log for the parsed row count and warning lines. Per the
producer's own header: an unrecognised `product` code in the live response is a WARNING (row skipped),
never a fabricated series, if every one of the six documented product codes (WTI, Brent, diesel, jet
fuel, RBOB, propane, see `PRODUCTS` in the producer file) turned out stale, the honest result is 0 rows
parsed and 6+ warnings naming exactly what came back unmatched. Compare the dry run's `product`/
`product-name` values against `PRODUCTS` before arming `--apply` (the producer's own header asks for
this diff explicitly).

## Step 3, dispatch mode=apply, once the dry run's plan looks right

```bash
gh workflow run producers.yml \
  --repo Dwarves77/dotfiles \
  -f mode=apply \
  -f producer=registry \
  -f registry_producer=eia-v2-petroleum-spot
```

Two gates must both already be satisfied for this to write anything (see the producer's own header,
"THREE INDEPENDENT SAFETY GATES"): the producer's `ENABLED` const (already `true`, a reviewed-code
change landed 2026-09-03) and the workflow step's `MARKET_PRODUCER_EIA_V2_ENABLED: '1'` (already set in
the step's `env:` block). With the secret now present, this run should create/update `market_series`
rows under the `eia-v2:*` key prefix.

## Step 4, the harness_runs read-back (expected evidence)

`producers.yml`'s own trailer steps ("Record this run's own harness-run artifact (producers family)" →
"Land the producers harness-run artifact into harness_runs") run unconditionally (`if: always()`) after
every dispatch, folding every `--apply`-invoked producer step's own summary into ONE
`scripts/harness-runs/producers/producers-run-NNN.json` artifact and landing it into the `harness_runs`
table via `scripts/turns/deliver-artifact-branch.sh`. Read back:

```sql
select id, run_id, mode, created_at, summary
from public.harness_runs
where family = 'producers'
order by created_at desc
limit 1;
```

The expected summary names `eia-v2-petroleum-spot` among its per-producer entries with a non-zero
`rows_changed` count (or an honest zero, if the dry/apply run's live response carried nothing new), a
harness_runs row with no mention of this producer at all would mean the step did not fire, which this
runbook's own dispatch command (Step 3) is written to avoid.

## What this lane did NOT do, and why

- Did not request, generate, or guess an `EIA_API_KEY` value anywhere.
- Did not flip any gate already landed by lane SURF/the 2026-09-03 train (`ENABLED`, `WORKFLOW_SECRETS`,
  the workflow's `env:` block), all three were already correct before this lane started; this runbook
  only documents the one missing piece and the exact commands to close it.
- Did not edit `eia-v2-petroleum-spot-producer.mjs`. This lane's own sandbox CAN reach `api.eia.gov`
  (confirmed: `curl https://api.eia.gov/v2/petroleum/pri/spt/data/?frequency=weekly&api_key=invalid`
  returns a live HTTP 403 `API_KEY_INVALID` JSON body, not a network-level block, a DIFFERENT finding
  from the producer's own header, which recorded a `connect_rejected` proxy denial in an earlier
  session's sandbox; egress policy has evidently changed since). This confirms the endpoint is live and
  reachable from this session too, but a 403 with no real key carries no `product`/`product-name`
  values to diff against `PRODUCTS`, the live product-code check genuinely needs a real key, which
  this lane does not have and must not request itself (CLAUDE.md rule 9). Per the brief's own
  instruction ("no change unless your live product-code check finds a genuine drift"), no change was
  made; Step 2 above is where that check actually happens, once the secret exists.
