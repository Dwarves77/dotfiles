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

**harness_version at write time:** `sha256:4ec177b09e05e669` (see Re-pin note 9 below; `sha256:5fd3da9d3bd44758`, `sha256:3650d9f46a0c23e2`, `sha256:2f3138ea51a193ac` and `sha256:80d15aac9240060d` are superseded)

**The planned run that supersedes this marker (see Re-pin note 9 for the current, exact form):** the first
`ledger-consume-run-NNN.json` produced by `node scripts/turns/run-ledger-consume.mjs` (dispatched via
`.github/workflows/ledger-consume.yml`, which carries `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` — real GitHub-Actions network/DB access this environment lacks;
`ANTHROPIC_API_KEY` is NO LONGER required for this dispatch — see Re-pin note 5). As of Re-pin note 9 the
named first dispatch is **`mode: plan`, `verdicts_file: ` (blank — auto-discovers every committed batch),
`limit: 400`** — see `docs/runbooks/CORPUS-TURN-RUNBOOK.md`'s "Ledger consume" section for the exact
dispatch and what it proves. `LEDGER_CONSUME_APPLY_ENABLED` is now `true` (operator ruling 2026-09-04,
Re-pin note 5) — a `mode: apply` dispatch WILL write when it has a usable verdict; the first proving
dispatch is deliberately `plan` so a human reads the plan before any apply. Per F28's reverse-audit (an
artifact matching this marker's recorded hash means "the planned run happened — delete the marker"), this
file is deleted the moment that first artifact lands and its `harness_version` matches the value above (or
updated to a new hash, per rule (c), if the driver or either governing library module changes again before
that first run lands).

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

**Re-pin note 8 (lane LEDGER-WALLS, 2026-09-04, coordinator [CONFIRMED] from ledger-consume export #5, run
33908401816, 2026-09-04 19:20 — 308 of 338 fetch_ok rows in the first real-text export were a bot/interface
shell, not document text, and 230+ of them were sent to classify anyway):** `sha256:3650d9f46a0c23e2` →
`sha256:5fd3da9d3bd44758`.

**What changed.** TWO of this family's THREE governing files moved bytes in this diff: (1)
`scripts/turns/run-ledger-consume.mjs` — `buildFetchDoc` now (a) routes federalregister.gov/ecfr.gov
document URLs through the official API (`fetchDocumentApi`, new `src/lib/sources/api-transport.mjs`,
`transport:"federalregister-api"`/`"ecfr-api"`) instead of the CAPTCHA-fronted HTML page, falling through
to the plain HTML fetch when the URL carries no document-specific identifier; (b) rewrites a bare
eur-lex.europa.eu `/legal-content/<LANG>/TXT/?uri=...` URL to its `/TXT/HTML/` rendering form before
fetching (`renderingUrlForPrimary`, reused verbatim from `primary-fallback.mjs`, no-op for every other
host); (c) runs every fetch's extracted text — regardless of transport — through the new
`detectAccessWall` (`src/lib/sources/access-wall.mjs`) and folds a detected wall into the return shape as
`wall: {kind, evidence}`. `shapeCandidateTextFields` now checks `fetchOutcome.wall` BEFORE the 200-char
floor (a wall body routinely clears 200ch on raw length alone) and reports `fetch_ok:false,
fetch_error:"access_wall:<kind>"`, text still carried. (2) `src/lib/intake/portal-harvest.ts` —
`FetchDocFn`'s return type gained an optional `wall` field; `consumePortalCandidates`'s "1 — FETCH" step
now checks it BEFORE the 200-char floor too, pushing `disposition:"skipped",
reason:"access_wall:<kind>"` — the SAME inconclusive-not-reject treatment a below-floor or failed fetch
already gets, row stays `status='candidate'` for retry. (3) `src/lib/llm/first-fetch-classify.ts` —
UNCHANGED in this diff.

Two NEW non-governing modules this family now depends on (not added to `GOVERNING_FILES['ledger-consume']`,
same precedent as `html-to-text.mjs`/`cleanCtl` in Re-pin note 7 — shared pure helpers, not this family's
own dispatch surface): `src/lib/sources/access-wall.mjs` (the ONE content-based bot-wall/access-wall
detector — reuses `transport-escalation.mjs`'s `REQUEST_ACCESS_RE`/`JS_SHELL_RE` and
`primary-fallback.mjs`'s `CDN_BLOCK_RE`/`CHALLENGE_RE`/`SOFT_404_RE`, both now exported for this reuse with
zero behavior change to either file's own detector; adds a cookie-consent, login-wall, browser-not-supported
pattern and the EUR-Lex structural chrome-only check) and `src/lib/sources/api-transport.mjs`
(`fetchDocumentApi` — factored OUT of `src/lib/agent/canonical-pipeline.ts`'s `apiFetchForHost`, which now
delegates here too, so the grounding pipeline and this family call the identical body, never a second
hand-typed copy). `src/lib/sources/sitemap-walk.mjs` (a different harness family, `source-sweep`, not
`ledger-consume` — its own governing-file set is unaffected by this note) also now imports
`detectAccessWall` for its own homepage/fallback-candidate content-wall check, per this lane's dispatch
("wherever the sitemap walker lives... a new access-wall.mjs the walker imports too").

**Measured over the 400-row export #5** (re-run against the actual production `detectAccessWall`, not by
hand): `request_access: 231, eurlex_interface_shell: 76, browser_not_supported: 1` — 308 of 338 fetch_ok
rows (91.1%) were a wall, not document text. See `docs/runbooks/CORPUS-TURN-RUNBOOK.md`'s "Ledger consume"
section, "Access-wall detection + API/rendering transports", for the full account, and
`scripts/turns/ledger-verdicts/README.md` for what this means for a session-Haiku classification lane
consuming a `--with-text` export (never spend a verdict on a `fetch_error:"access_wall:*"` row). The
planned first run is otherwise unchanged from Re-pin note 7.

**Re-pin note 9 (lane LEDGER-CHAIN-2, 2026-09-05, build plan W1.4 "event chaining, the ledger link" —
`LAST-PROPOSER-PASS.md`'s CONFIRMED defect: the `workflow_run`-triggered dispatch always ran `mode=plan,
limit 50, after=null`, so runs 001 and 002 fetched the identical 50 rows twice and classified neither):**
`sha256:5fd3da9d3bd44758` → `sha256:4ec177b09e05e669`.

**What changed.** Both of this family's driver-side governing files moved bytes in this diff (the third,
`src/lib/llm/first-fetch-classify.ts`, is UNCHANGED):

(1) `scripts/turns/run-ledger-consume.mjs` — three fixes, matching this build item's three requirements.
**Auto-discovery of every committed verdict batch:** `discoverVerdictsFiles`/`isVerdictsBatchFilename`/
`sortVerdictsBatchFilenames` (new, pure) list every `scripts/turns/ledger-verdicts/ledger-verdicts-NNN.json`
under that directory, ascending by batch number; when `--verdicts` is omitted, `main()` now loads and
merges ALL of them (`allCurrentEntries`, later batch wins a duplicate URL — `indexVerdictsByUrl`'s existing
rule, now applied across files) instead of the workflow picking one "newest" file — the exact defect
`LAST-PROPOSER-PASS.md` named (runs 001/002 saw a `verdicts_file` the workflow resolved to the newest batch,
but a candidate whose verdict lived in an OLDER batch could never match). **The pre-fetch gate:**
`buildClassifyGate` (new, pure) is the ONE lookup — a verdict hit needs no fetch at all
(`{willClassify:true, needsFetch:false}`, since a verdict classifies from the verdict object alone), a miss
with `--allow-api` needs one (`needsFetch:true`), a miss with neither is skipped before anything else
(`{willClassify:false}`) — read by `consumePortalCandidates` (below) BEFORE its own fetch step, and by
`buildVerdictClassify` (refactored to call it internally) at classify time, so the two decisions can never
disagree; `shapeConsumeResult` gained a second `without_verdict_skipped` counting path (from `outcomes`,
not just `telemetryByUrl`) because a gate-skipped row now leaves no telemetry entry at all. **Export cursor
persistence:** `resolveExportAfter`/`findLatestExportArtifact`/`buildExportRunArtifact` (new, pure/injectable)
give an `--export-candidates` dispatch its OWN `config.action:"export"` harness-run artifact recording
`metrics.next_cursor`, so the NEXT export dispatch with no explicit `--after` auto-resumes past it instead of
re-exporting the same window (the same defect, closed by the same mechanism, on the export side) — an
explicit `--after` still always wins. New metrics fields: `matched` (alias of `with_verdict`, build brief's
own vocabulary) and `verdict_batches_read`.

(2) `src/lib/intake/portal-harvest.ts` — `ConsumeOpts` gained the optional `classifyGate` field
`consumePortalCandidates`'s "1 — FETCH" step now calls BEFORE fetching: `willClassify:false` skips the row
entirely (recorded `skipped-no-verdict`, `fetched:0`, never reaching `fetchDoc` or `classify`);
`needsFetch:false` skips ONLY the fetch, still runs classify; omitted (no `classifyGate` at all) preserves
the exact pre-existing unconditional fetch-then-classify behavior for any other caller.

`.github/workflows/ledger-consume.yml` (not a governing file, does not move this hash) restructured so a
`workflow_run` (Source-sweep completion) firing now runs BOTH halves of the family in one job — consume
(forced `mode=plan`, blank `verdicts_file`, `limit=2000`, cheap because this path never fetches) THEN
export (`--with-text`, blank `export_after`, auto-resuming) — where a `workflow_dispatch` still runs
exactly one, per its `export_candidates` input, unchanged. The two artifact-commit steps were unified into
one (a second `git checkout -b` on the identical branch name would have collided when both halves run in
the same job) and the sibling-hydration guard now runs unconditionally (both halves self-emit an artifact
via `claimRunId`, needing the same run_id collision guard).

**Tests.** `run-ledger-consume.test.mjs` gained coverage for `buildClassifyGate` (all three branches, verdict
wins over `--allow-api`), `isVerdictsBatchFilename`/`sortVerdictsBatchFilenames`/`discoverVerdictsFiles`
(pure + injected `readdirSyncImpl`, missing-dir → `[]`), `resolveExportAfter` (explicit wins; auto-resolves
only from a `config.action==="export"` artifact; null on nothing/exhausted), `findLatestExportArtifact`
(injected `readRunHistoryImpl`), `buildExportRunArtifact` (F28 shape, live `validateRunArtifact` import),
`shapeConsumeResult`'s new `matched`/`verdict_batches_read` fields and the fixed `without_verdict_skipped`
(no double-count when both paths would tag the same URL), and — build item 5's named test — "two consecutive
chained `--export-candidates` runs cover DISJOINT windows", a real `claimRunId`/`writeRunArtifact` round
trip proving run 2's effective `--after` equals run 1's own `next_cursor` and the two exported id sets never
overlap. `src/lib/intake/portal-harvest.npmtest.mjs` gained the other half of build item 5 — "a verdict
lookup precedes any fetch" — asserting the injected `fetchDoc` is called for NEITHER a gate-skipped row NOR
a verdict-matched row (only for the `needsFetch:true` case), and that omitting `classifyGate` entirely
reproduces the old unconditional-fetch behavior byte-for-byte.

**The planned first run moves WITH this note.** The coordinator's own live read (Supabase MCP,
`portal_link_candidates`, 2026-09-05) confirms all 386 URLs across `ledger-verdicts-001.json` (30) and
`ledger-verdicts-002.json` (356, zero overlap) are still `status='candidate'`, and that all 386 fall within
the FIRST 400 rows in ascending `(first_seen_at, id)` order — row 400 of that order is candidate
`68b9b28a-6cba-4e18-abe7-2dc92c9b7557` (`first_seen_at: 2026-07-19T21:01:06.240630+00:00`; exactly 400 rows
`<=` it, 57,069 rows `>` it, 57,469 total `status='candidate'` rows at that read). **The first hand dispatch
proving this component is `ledger-consume.yml` `workflow_dispatch` with `mode=plan`, `verdicts_file=`
(blank — auto-discovers both committed batches), `limit=400`** (NOT the workflow's own default of 50 —
`limit` must be raised by hand for this one dispatch to reach all 386 rows; a `workflow_run` firing already
carries the raised `RESOLVE_CONSUME_LIMIT=2000` default and needs no override). Expected:
`ledger-consume-run-003.json` with `metrics.matched: 386`, `metrics.fetched: 0` for those 386 (the pre-fetch
gate), `metrics.verdict_batches_read: 2`. The follow-up export dispatch — `export_candidates=true`,
`export_limit=400`, `export_after={"firstSeenAt":"2026-07-19T21:01:06.240630+00:00","id":"68b9b28a-6cba-4e18-abe7-2dc92c9b7557"}`
— exports the NEXT 400 (rows 401-800), past every already-verdicted candidate, and records its own
`next_cursor` for the export after that to auto-resume from with no `export_after` at all. See
`docs/runbooks/CORPUS-TURN-RUNBOOK.md`'s "Ledger consume" section, "Event chaining" and "First dispatch",
for the full account.
