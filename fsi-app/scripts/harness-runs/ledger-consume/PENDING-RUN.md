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

**harness_version at write time:** `sha256:3650d9f46a0c23e2` (see Re-pin note 7 below; `sha256:2f3138ea51a193ac` and `sha256:80d15aac9240060d` are superseded)

**The planned run that supersedes this marker:** the first `ledger-consume-run-001.json` produced by
`node scripts/turns/run-ledger-consume.mjs` (dispatched via `.github/workflows/ledger-consume.yml`, which
carries `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — real GitHub-Actions network/DB
access this environment lacks; `ANTHROPIC_API_KEY` is NO LONGER required for this dispatch — see Re-pin
note 5). The named first dispatch is **`mode: plan`, `verdicts_file: <the first
scripts/turns/ledger-verdicts/ledger-verdicts-NNN.json batch>`, `limit: 50`** (or a smaller/larger
`limit`) — see `docs/runbooks/CORPUS-TURN-RUNBOOK.md`'s "Ledger consume" section for the exact dispatch
and what it proves. `LEDGER_CONSUME_APPLY_ENABLED` is now `true` (operator ruling 2026-09-04, Re-pin note
5) — a `mode: apply` dispatch WILL write when it has a verdicts file; the first proving dispatch is
deliberately `plan` so a human reads the plan before any apply. Per F28's reverse-audit (an artifact
matching this marker's recorded hash means "the planned run happened — delete the marker"), this file is
deleted the moment that first artifact lands and its `harness_version` matches the value above (or updated
to a new hash, per rule (c), if the driver or either governing library module changes again before that
first run lands).

**The registration gap this marker previously flagged is CLOSED, from BOTH directions.** Lane SPEND
registered `ANTHROPIC_API_KEY` in `WORKFLOW_SECRETS`
(`.discipline/governance/secrets-registry.mjs`) at the 2026-09-02 integration — confirmed still present,
live, in this tree. Separately, Re-pin note 5 below REMOVES the workflow's `ANTHROPIC_API_KEY` precondition
from the plan path entirely (the session-verdict $0 default no longer calls Haiku by default, so the
secret it used to require unconditionally is now optional, read only when a human explicitly passes
`--allow-api`, which `ledger-consume.yml` does not expose as a workflow input). Both facts are recorded
here so a future reader does not re-open a gap that closed twice, from two different directions, for two
different reasons. See `docs/runbooks/CORPUS-TURN-RUNBOOK.md`'s "Ledger consume" section for the full
account.

**Re-pin note (coordinator, 2026-09-02, integration of the system-completion train):** the hash above was `sha256:d7f537714f9975aa` when the lane wrote this marker. Lane SPEND (same train) routed `src/lib/llm/first-fetch-classify.ts`, one of this family's three governing files, through the spend chokepoint (`spendMessage`), so the hash pinned by Lane CONSUME moved before any run landed. Re-pinned by the coordinator at integration (2026-09-02) to `sha256:db591d024e90fc22`; the planned first run is unchanged.

**Re-pin note 2 (coordinator, 2026-09-02, follow-up integration):** the hash above moved again to `sha256:2798bdb08c8e8552`, this pass over `scripts/turns/run-ledger-consume.mjs` itself — `buildLoggingClassify`, its own `agent_runs` insert, was removed (it would have written a SECOND row per classify now that `spendMessage`/`recordSpendCall` in `spend-client.ts` writes the first one) and replaced with a read-only `collectClassifyTelemetry` that reads `input_tokens`/`output_tokens` back off `FirstFetchClassifyResult` for the artifact; no library governing file changed in this pass. Re-pinned by the coordinator at integration (2026-09-02); the planned first run is unchanged.

**Re-pin note 3 (coordinator, 2026-09-02):** `sha256:e8506362c5e2c2c5` → `sha256:2798bdb08c8e8552`. The rule-016 prose false-positive fix reworded one header comment in `run-ledger-consume.mjs` after the previous pin; PR #517's first CI run caught the drift (NO ARTIFACTS on this family) because the coordinator re-ran the engine and consistency gates after that edit but not F28. The planned first run is unchanged.

**Re-pin note 4 (lane GOV-SINGLE, 2026-09-04):** `sha256:2798bdb08c8e8552` → `sha256:b12b73cfc8a273af`. `LEDGER_CONSUME_GOVERNING_FILES` moved from a hand-copied literal array inside `run-ledger-consume.mjs` to `export const LEDGER_CONSUME_GOVERNING_FILES = GOVERNING_FILES['ledger-consume'];`, importing its entry from the new single source `scripts/harness-runs/governing-files.mjs` (see that module's own header — this closes the "two hand-synced copies of the same fact" defect proven live for `mint`'s own pair). The FILE LIST this family's `harness_version` hashes is byte-identical (`scripts/turns/run-ledger-consume.mjs`, `src/lib/intake/portal-harvest.ts`, `src/lib/llm/first-fetch-classify.ts` — unchanged); only `run-ledger-consume.mjs` itself — one of its own three governing files — changed BYTES (the import line and the declaration), which is what moved the hash. Neither library governing file changed. The planned first run is unchanged.

**Re-pin note 5 (lane LEDGER-ZERO, 2026-09-04, operator ruling "stop offering API when you have a free
option with Haiku" / "why is this costing me anything when it can be done for free?"):** `sha256:
b12b73cfc8a273af` → `sha256:80d15aac9240060d`. All THREE governing files moved bytes in the same diff:
(1) `run-ledger-consume.mjs` gained `--verdicts`/`--allow-api`/`--export-candidates`, the session-verdict
validation + classify-bypass machinery (`validateVerdictsFile`, `partitionVerdictsByPromptVersion`,
`buildVerdictClassify`, `verdictEntryToClassifyOutput`, `runExportCandidates`), the new `classify_source`/
`with_verdict`/`without_verdict_skipped`/`uncertain`/`candidates`/`est_usd` artifact fields, and flipped
`LEDGER_CONSUME_APPLY_ENABLED` to `true`; (2) `src/lib/intake/portal-harvest.ts` gained
`selectCandidateLedgerPage` (the query-select half of `consumePortalCandidates` extracted for reuse by
`--export-candidates` — REUSE-ONLY, no behavior change to `consumePortalCandidates` itself); (3)
`src/lib/llm/first-fetch-classify.ts` exported `FIRST_FETCH_HAIKU_SYSTEM_PROMPT`,
`FIRST_FETCH_CLASSIFY_PROMPT_VERSION`, and `buildFirstFetchClassifyUserMessage` so a session lane can
build the IDENTICAL Haiku call offline (ONE BODY). The planned first run moves WITH this note: **`node
scripts/turns/run-ledger-consume.mjs --mode plan --verdicts scripts/turns/ledger-verdicts/ledger-verdicts-
001.json --limit 50`** (or the equivalent `ledger-consume.yml` dispatch with `mode=plan`,
`verdicts_file=scripts/turns/ledger-verdicts/ledger-verdicts-001.json`, `limit=50`) — see
`docs/runbooks/CORPUS-TURN-RUNBOOK.md`'s "Ledger consume" section. `ledger-verdicts-001.json` itself is
NOT produced by this lane (outside its write set — a session-Haiku classification batch over live
candidates is the coordinator's Haiku lanes' job, per the build plan's own §W1.1); this lane ships the
contract (`scripts/turns/ledger-verdicts/schema.json` + `README.md`) and the `--export-candidates` mode
that produces the candidate list those lanes classify from.

**Re-pin note 6 (lane LEDGER-EXPORT, 2026-09-04, coordinator [CONFIRMED] 16:55 — the fetch-rate-limit
defect in Re-pin note 5's own `--export-candidates`):** `sha256:80d15aac9240060d` → `sha256:2f3138ea51a193ac`.

**What changed.** LEDGER-ZERO's `--export-candidates` listed candidate rows WITHOUT page text (its own
`note_on_fetched_text` said "a session lane must fetch each URL itself"). The coordinator tried exactly
that over 1,837 candidates: Haiku classification lanes fetching through WebFetch hit rate limits within
minutes, and one lane started guessing a classification from the URL string instead of the fetched page —
refused. TWO of this family's THREE governing files moved bytes in this diff: (1)
`scripts/turns/run-ledger-consume.mjs` gained `--with-text` (only meaningful with `--export-candidates`;
refused otherwise, per this file's own never-silently-defaulted discipline) — for each listed candidate it
calls the SAME `buildFetchDoc` `plan`/`apply` mode already uses (no second fetcher, same politeness gap,
same 20s timeout) and writes per row `text` (sliced to `CONTENT_MAX_CHARS`, imported from
`first-fetch-classify.ts`, never retyped), `fetched_chars`, `fetch_ok`, `fetch_error` (null when ok),
`fetched_at`, `transport`; a row under `portal-harvest.ts`'s own 200-char floor
(`consumePortalCandidates`, "1 — FETCH" step, `if (text.trim().length < 200)`) keeps its text but
`fetch_ok:false` / `fetch_error:"below_floor_200"`. New pure helper `shapeCandidateTextFields` (the
per-row shaping) and the extended `buildCandidateExportPayload`/`runExportCandidates` are exported and
unit-tested (injected `fetchImpl`: ok / failure / below-floor). `--after` keyset paging was already present
(Re-pin note 5) and is unchanged. Still no classify, no DB write, no harness-run artifact for this mode —
only `run-ledger-consume.mjs` itself changed bytes here. (2) `src/lib/llm/first-fetch-classify.ts` exported
its previously-internal `CONTENT_MAX_CHARS` constant so the driver imports it (via jiti) rather than
retyping the literal `6000` a second time. (3) `src/lib/intake/portal-harvest.ts` — UNCHANGED in this diff
(the 200-char floor and `selectCandidateLedgerPage`'s `--after` support this lane depends on were both
already in place from Re-pin note 5 / LEDGER-ZERO).

`.github/workflows/ledger-consume.yml` (not a governing file, does not move this hash) gained
`export_candidates` (boolean, default `false`), `export_limit` (default `400`), `export_after` (default
`''`) workflow-dispatch inputs — when `export_candidates=true` the job runs ONLY `--export-candidates
scripts/_snapshots/ledger-candidates/candidates-<run_id>.json --with-text --limit <export_limit>
[--after <export_after>]`, then delivers that file the SAME way this family's harness-run artifacts
already are: a `ledger-consume/<run_id>` branch + `deliver-artifact-branch.sh` (the candidates file is
force-added despite `scripts/_snapshots/` being gitignored — see that step's own comment), also uploaded
as a `ledger-consume-snapshots-<run_id>` workflow artifact via the pre-existing upload step. The job
timeout moved `30` → `150` minutes: worst case is `export_limit=400` candidates each waiting out
`buildFetchDoc`'s politeness gap (1000ms default) plus its fetch timeout (20000ms) if every fetch times
out — `400 * 21000ms = 8,400,000ms = 8400s = 140 minutes`, plus a 10-minute margin.

**The planned first run moves WITH this note, and now has a step in front of it.** The FIRST dispatch is
now the export, not the plan: `ledger-consume.yml` `workflow_dispatch` with `export_candidates=true`,
`export_limit=400`, `export_after=''` — this session environment has no network egress to fetch ~1,837
candidate URLs; the Actions runner does. Its `next_cursor` feeds the next dispatch's `export_after`, and so
on (~5 dispatches at 400/batch) until every candidate has been exported with text. Each resulting
`scripts/_snapshots/ledger-candidates/candidates-<run_id>.json` (delivered on its own
`ledger-consume/<run_id>` branch) is then classified by a session-Haiku lane directly from its carried
`text` — no browser fetch — into a `ledger-verdicts-NNN.json` batch. The consume-side planned first run is
otherwise UNCHANGED from Re-pin note 5: **`node scripts/turns/run-ledger-consume.mjs --mode plan
--verdicts scripts/turns/ledger-verdicts/ledger-verdicts-001.json --limit 50`** (or the equivalent
`ledger-consume.yml` dispatch with `mode=plan`,
`verdicts_file=scripts/turns/ledger-verdicts/ledger-verdicts-001.json`, `limit=50`) — see
`docs/runbooks/CORPUS-TURN-RUNBOOK.md`'s "Ledger consume" section, "First dispatch", for the full account
of both. Neither the export batches nor `ledger-verdicts-001.json` are produced by this lane (outside its
write set — the coordinator's Haiku lanes' job, per the build plan's own §W1.1); this lane ships the
`--with-text` mechanism and the exact first dispatch.

**Re-pin note 7 (lane LEDGER-TEXT, 2026-09-04, coordinator [CONFIRMED] the raw-HTML defect from the first
`--with-text` export, run 33902755838, 2026-09-04 17:51 — every one of the 400 exported candidates carried
~6,000 chars of raw markup in `text`, not text):** `sha256:2f3138ea51a193ac` → `sha256:3650d9f46a0c23e2`.

**What changed.** `buildFetchDoc` in `run-ledger-consume.mjs` — the ONLY one of this family's three
governing files that moved bytes in this diff — used to do `const text = await res.text(); return { text,
transport: "direct-fetch" };`, handing Re-pin note 6's `--with-text` (and, unnoticed until now, the
`plan`/`apply` classify path) raw HTML/PDF bytes decoded as UTF-8 string, unstripped, as if it were plain
content. It is rewritten to match the exact codec `src/lib/agent/canonical-pipeline.ts`'s `directFetchClean`
already used for the DEEP DIVE pipeline: read the response as bytes, run `classifyBody(contentType, bytes)`
(`src/lib/sources/pdf-extract.mjs`, pre-existing, unchanged) to tell a PDF body (content-type OR `%PDF-`
magic bytes) from HTML; a PDF body goes through `pdfToText` (injectable as `pdfToTextImpl` for tests) then
`cleanCtl`+whitespace-collapse; an HTML body is decoded charset-aware via `decodeHtmlBytes` (header >
`<meta>` > utf-8 default, `src/lib/sources/charset-decode.mjs`, pre-existing, unchanged) and then stripped
via the new shared `htmlToText` (`src/lib/text/html-to-text.mjs`) — script/style content removed, all other
tags unwrapped keeping visible text, whitespace collapsed, trimmed. `fetchDoc`'s return shape is unchanged
(`{text, transport}`); only what `text` now IS changed — stripped/extracted text, not markup — so
`--with-text`'s `fetched_chars` and the `plan`/`apply` classify path's own `firstFetchClassify` input both
describe text from here on.

`htmlToText` itself is now ONE exported body (`src/lib/text/html-to-text.mjs`, new, plain ESM, pure, with
its own test file) consolidating what were three independently hand-typed private copies:
`canonical-pipeline.ts`'s own `htmlToText` (the reference implementation lifted verbatim — that file's
behavior is unchanged, only the definition moved to the shared module and is now imported) and
`haiku-classify.ts`'s `htmlToText` (dead code — its only caller `haikuClassify` was removed 2026-05-11 per
that file's own comment; replaced with the shared import anyway so a future reviver gets canonical behavior,
not a second hand-typed copy). The third named copy, `officialness.mjs`'s `stripTags`, is INTENTIONALLY LEFT
AS ITS OWN BODY — it is a lower-level flatten primitive feeding `cleanBodyOf`'s per-block link-density
algorithm (the 4d officialness gate), not a caller-facing text extractor: it does not need script/style
removal (upstream `structuralStrip` already removes those blocks before `stripTags` runs per-block) and it
DOES blank HTML entities (`&(?:[a-z]+|#\d+);` → space, so an anchor's un-blanked entity text can't skew the
link-density ratio it's computing) — `htmlToText` deliberately does NOT decode/blank entities. Different
contract, not a duplicate; a comment in `officialness.mjs` above `stripTags` records this reasoning in full.
Also consolidated to one home: `cleanCtl` (control-character stripping, previously a private helper sitting
next to `canonical-pipeline.ts`'s own `htmlToText`) is now exported from `src/lib/sources/charset-decode.mjs`
alongside `decodeHtmlBytes` — the two operate on the same raw-bytes-to-clean-text step, and `buildFetchDoc`
now needs `cleanCtl` too (for its PDF-text branch), so it has one home instead of a second copy.

Neither `html-to-text.mjs` nor the newly-exported `cleanCtl` is added to `GOVERNING_FILES['ledger-consume']`
— following the `source-sweep/PENDING-RUN.md` precedent that a family's governing-file set names its
dispatch surface and the pre-existing modules that predate that convention, not every shared pure helper the
family's driver comes to depend on; the driver's own byte-change (`run-ledger-consume.mjs`, above) is what
moved this family's hash, and `LEDGER_CONSUME_GOVERNING_FILES`'s exact-equality test is unchanged. The
planned first run is otherwise unchanged from Re-pin note 6 — this note only documents that any export or
plan/apply classify run taken BEFORE this fix landed carried raw markup in `text`, not text, and should be
re-run.
