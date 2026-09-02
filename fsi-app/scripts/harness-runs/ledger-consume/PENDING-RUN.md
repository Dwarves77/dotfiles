# Pending run — ledger-consume

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
only fires for a family that already has ≥1 valid artifact (see `auditStalenessCoupling`'s own guard
clause — a family with zero valid artifacts is entirely rule (b)'s to report, not rule (c)'s). This marker
is the FIRST-RUN ACKNOWLEDGMENT rule (b) itself now accepts (2026-09-01, source-sweep registration): a
zero-artifact family whose `PENDING-RUN.md` pins the CURRENT governing hash is registered-and-pending,
not historyless — see F28's own header. It is written in the exact format `parsePendingRunHash` reads
(`harness_version at write time: `sha256:...``), the same shape `source-sweep/PENDING-RUN.md` and
`forward-events/PENDING-RUN.md` established for their own families' first runs.

**What this acknowledges:** `scripts/turns/run-ledger-consume.mjs` (this family's driver, Lane CONSUME,
system-completion plan, 2026-09-02) and the two library modules it gives a production runtime to for the
first time — `src/lib/intake/portal-harvest.ts`'s `consumePortalCandidates` (the ledger candidate ->
classify -> chokepoint -> intake consume pass) and `src/lib/llm/first-fetch-classify.ts` (the Haiku
content-gate classifier it calls, routed through the spend chokepoint's `spendMessage` — see
`spend-client.ts` — which is what leaves this family's per-call `agent_runs` row, not this driver) — were
authored and registered
(`ALLOWED_FAMILIES`, `GOVERNING_FILES`, `CONVENTION.md`'s prose) in an environment with **neither live
network access** to `api.anthropic.com` or an arbitrary candidate URL, **nor Supabase credentials**
(`.env.local` does not exist in this environment) — the same ADR-023-class gap `source-sweep/PENDING-
RUN.md` recorded for its own family, closed for THIS family by `.github/workflows/ledger-consume.yml`.
No consume run could be executed here to produce a genuine first artifact, and a placeholder one was
deliberately not fabricated.

What WAS verified in this environment, and is not itself the pending run: `jiti` (the loader
`run-ledger-consume.mjs` uses to reach `consumePortalCandidates` across the `@/lib/...` alias chain a
plain `node` import cannot follow) resolves the module's FULL transitive import graph — proven both by a
one-off probe and by `run-ledger-consume.test.mjs`'s own standing jiti-load test, which runs
`consumePortalCandidates` end-to-end against a stub Supabase client returning zero candidates (no
network, no DB) and gets back `{discovered: 0, fetched: 0, classified: 0, outcomes: []}`. That proves the
runtime WIRING; it is not a run over real ledger rows, so it is not `ledger-consume-run-001`.

**harness_version at write time:** `sha256:e8506362c5e2c2c5`

**The planned run that supersedes this marker:** the first `ledger-consume-run-001.json` produced by
`node scripts/turns/run-ledger-consume.mjs` (dispatched via `.github/workflows/ledger-consume.yml`, which
carries `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ANTHROPIC_API_KEY` — real GitHub-
Actions network egress this environment lacks). That first dispatch runs `mode: plan` by default (a
`mode: apply` dispatch would ALSO land as `ledger-consume-run-001` but with `config.apply_disarmed: true`
and plan semantics — see the workflow's own header for why apply is structurally disarmed until an
operator reviews `LEDGER_CONSUME_APPLY_ENABLED`). Per F28's reverse-audit (an artifact matching this
marker's recorded hash means "the planned run happened — delete the marker"), this file is deleted the
moment that first artifact lands and its `harness_version` matches the value above (or updated to a new
hash, per rule (c), if the driver or either governing library module changes again before that first run
lands).

**A registration gap discovered while wiring this family's workflow, NOT resolved by this marker or this
lane (write-set boundary):** `.github/workflows/ledger-consume.yml` references `secrets.ANTHROPIC_API_KEY`
(required in every mode — even `plan` spends on classify), and `.discipline/governance/secrets-reference-
audit.mjs` currently fails that reference because `ANTHROPIC_API_KEY` is not yet in `WORKFLOW_SECRETS`
(`.discipline/governance/secrets-registry.mjs`, outside this lane's write set). The first `ledger-consume`
dispatch cannot succeed until that registration lands — see `docs/runbooks/CORPUS-TURN-RUNBOOK.md`'s
"Ledger consume" section for the full account.

**Re-pin note (coordinator, 2026-09-02, integration of the system-completion train):** the hash above was `sha256:d7f537714f9975aa` when the lane wrote this marker. Lane SPEND (same train) routed `src/lib/llm/first-fetch-classify.ts`, one of this family's three governing files, through the spend chokepoint (`spendMessage`), so the hash pinned by Lane CONSUME moved before any run landed. Re-pinned by the coordinator at integration (2026-09-02) to `sha256:db591d024e90fc22`; the planned first run is unchanged.

**Re-pin note 2 (coordinator, 2026-09-02, follow-up integration):** the hash above moved again to `sha256:e8506362c5e2c2c5`, this pass over `scripts/turns/run-ledger-consume.mjs` itself — `buildLoggingClassify`, its own `agent_runs` insert, was removed (it would have written a SECOND row per classify now that `spendMessage`/`recordSpendCall` in `spend-client.ts` writes the first one) and replaced with a read-only `collectClassifyTelemetry` that reads `input_tokens`/`output_tokens` back off `FirstFetchClassifyResult` for the artifact; no library governing file changed in this pass. Re-pinned by the coordinator at integration (2026-09-02); the planned first run is unchanged.
