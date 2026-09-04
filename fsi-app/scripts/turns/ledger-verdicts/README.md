# Session-verdict files — `ledger-consume`'s $0 default

Operator ruling, 2026-09-04, verbatim: **"stop offering API when you have a free option with
Haiku"**; **"why is this costing me anything when it can be done for free?"**. This directory is the
answer: a file contract `run-ledger-consume.mjs --verdicts <path>` reads so a session lane can classify
`portal_link_candidates` rows for $0 (via the interactive session's own model access, not the metered
Anthropic API) and hand the driver the result, instead of the driver calling Haiku itself.

Before this contract, **every** `ledger-consume.yml` dispatch — `plan` or `apply` — called Haiku
(`firstFetchClassify`, ~$0.001/candidate) for every candidate whose fetch cleared the 200-char floor.
`plan` mode's "read-only" promise was about writes, never about spend. That is the gap this closes.

## The mechanism, in one sentence

A candidate with a matching verdict in the file uses it (classify bypassed entirely, $0); a candidate
without one is **skipped** — left untouched, `status='candidate'`, for a later batch — and is **never**
sent to the metered API, unless the driver is run with the explicit, CLI-only `--allow-api` flag (default
`false`, **not** exposed by `ledger-consume.yml`).

```
                                    ┌─────────────────────────┐
   portal_link_candidates  ──────▶ │  run-ledger-consume.mjs  │
   (status='candidate')            │  --verdicts <path>        │
                                    └────────────┬─────────────┘
                                                  │  per candidate URL:
                          verdict for this URL?  │
                     ┌────────────────yes────────┴───────no─────────────┐
                     ▼                                                   ▼
        classify_source: "session-verdict"                    --allow-api set?
        $0, classify bypassed entirely                    ┌───────yes────┴────no────────┐
                     │                                    ▼                              ▼
                     │                        classify_source: "api"          classify_source:
                     │                        real, metered Haiku call        "skipped-no-verdict"
                     │                        (CLI-only; ledger-consume.yml    row left untouched,
                     │                         never sets this)                $0, never sent to the API
                     └───────────────────────┬────────────────────────────────────────┘
                                              ▼
                                  entity gate → dry/apply mint pass (unchanged, portal-harvest.ts)
```

## How a session lane produces a batch

1. **List candidates, WITH their already-fetched page text** (read-only — no classify, no DB write; the
   fetch below is the only I/O this step does):
   ```
   node scripts/turns/run-ledger-consume.mjs --export-candidates scripts/turns/ledger-verdicts/candidates-001.json --with-text --limit 200
   ```
   **`--with-text` (Lane LEDGER-EXPORT, 2026-09-04) is now the sanctioned way to run this step.** Earlier
   guidance here said "a session lane must fetch each URL itself (e.g. via the browser)" — the
   coordinator tried exactly that over 1,837 candidates: Haiku classification lanes fetching through
   WebFetch hit rate limits within minutes, and one lane started guessing a classification from the URL
   string instead of the fetched page (refused — see `docs/runbooks/CORPUS-TURN-RUNBOOK.md`'s "Ledger
   consume" section for the full account). **The browser is no longer the fetch path.**

   `--with-text` fetches each listed candidate's URL through `run-ledger-consume.mjs`'s OWN `buildFetchDoc`
   — the SAME polite fetcher (politeness gap + timeout) `consumePortalCandidates` itself uses in `plan`/
   `apply` mode — never a second, hand-rolled fetcher. This step is meant to run in
   `.github/workflows/ledger-consume.yml` (dispatch with `export_candidates: true`; see that file's header
   for `export_limit`/`export_after` and the job-timeout arithmetic), which has real network egress this
   session environment typically does not. It writes, per row: `{candidate_id, url, source_id,
   anchor_text, first_seen_at, source_name, source_category, source_tier, text, fetched_chars, fetch_ok,
   fetch_error, fetched_at, transport}` — `text` sliced to `content_max_chars` (the payload's own top-level
   field, sourced from `first-fetch-classify.ts`'s `CONTENT_MAX_CHARS`).

   **`text` is extracted TEXT, not markup (Lane LEDGER-TEXT, 2026-09-04 [CONFIRMED]).** `buildFetchDoc`
   decodes the fetched bytes charset-aware and, for an HTML body, strips it through the shared `htmlToText`
   (`src/lib/text/html-to-text.mjs`) before this step ever sees it — a PDF body (content-type or `%PDF-`
   magic bytes) is routed through `pdfToText` instead of being stripped as HTML. `content_max_chars` /
   `fetched_chars` describe TEXT length, not raw-markup length. **Every export produced before this fix
   (first `--with-text` run, 33902755838, 2026-09-04 17:51, and any `ledger-verdicts-NNN.json` classified
   from it) carried ~6,000 chars of raw, unstripped HTML in `text` instead — re-fetch/re-export and
   re-classify rather than trusting a pre-fix batch.** See `fsi-app/scripts/harness-runs/ledger-consume/
   PENDING-RUN.md`'s Re-pin note 7 for the full account. `fetch_ok: false` marks a row that
   either failed to fetch (`fetch_error` names why) or fell under `portal-harvest.ts`'s own 200-char floor
   (`fetch_error: "below_floor_200"` — that file's `consumePortalCandidates`, the "1 — FETCH" step,
   `if (text.trim().length < 200)`); its short text is still carried, but should not be treated as
   classify-ready. **A classification lane consuming this file must NOT fetch these URLs itself** — use
   the `text` field carried here.

   Without `--with-text`, this mode is UNCHANGED from before: read-only, no fetch, no classify, no DB
   write, and the payload's `note_on_fetched_text` explains that `portal_link_candidates` itself has no
   content column (migrations 162/220 only ever added url/anchor_text/status/disposition columns) and
   suggests re-dispatching with `--with-text` instead of fetching by hand.

2. **Build the identical prompt.** `src/lib/llm/first-fetch-classify.ts` exports everything needed so a
   session lane's Haiku call and the live spend-chokepoint call are provably the same prompt — ONE BODY,
   never a second hand-typed copy that can drift:
   - `FIRST_FETCH_HAIKU_SYSTEM_PROMPT` — the exact system prompt string.
   - `buildFirstFetchClassifyUserMessage({source_url, source_id, source_tier, source_category, text})`
     — the exact user-message template (same `CONTENT_MAX_CHARS` truncation, same `"unknown"`
     fallbacks the live call uses).
   - `FIRST_FETCH_CLASSIFY_PROMPT_VERSION` — `"sha256:" + <16 hex chars>` of the system prompt's
     content. Stamp this into every verdict entry's `prompt_version` field.

3. **Classify each candidate** with Haiku (via the session's own model access), producing one entry per
   candidate — see `schema.json` for the exact shape. `entity_verdict`/`item_type`/`domain`/
   `surface_tags`/`relevance`/`severity`/`priority`/`urgency_tier`/`topic_tags`/`jurisdictions`/
   `title_candidate`/`summary`/`rationale` are the SAME fields `FirstFetchClassifyOutput` (the live
   classifier's own return shape) carries — a session lane's Haiku call should return the same JSON
   object the live prompt asks for, then this contract's own metadata
   (`candidate_id`/`url`/`confidence`/`classified_by`/`classified_at`/`prompt_version`) wraps it.

4. **Write the batch** to a **committed repo path** — `scripts/turns/ledger-verdicts/<batch>.json` (e.g.
   `ledger-verdicts-001.json`), naming convention: `ledger-verdicts-NNN.json`, zero-padded, incrementing.
   **Why a committed path, not `scripts/_snapshots/`:** `scripts/_snapshots/` is gitignored (`.gitignore`
   line 64) — a file written there never reaches `origin`, so a `workflow_dispatch` (which checks out
   `origin`) could never see it. `ledger-consume.yml`'s `verdicts_file` input is a **repo path**
   precisely so a dispatch can read a batch that already landed on `master` — the committed path is the
   only shape that makes that work. (The workflow's `Upload scripts/_snapshots as a workflow artifact`
   step still runs for anything a lane drops there mid-run; it is just not this contract's home.)

5. **Validate before landing.** `run-ledger-consume.mjs`'s own `validateVerdictsFile` (pure JS, no
   schema-engine dependency — see below) is the actual enforcement the driver runs; `schema.json` is the
   same contract expressed as JSON Schema for a human or an external tool to read/validate against. Keep
   them in agreement: `run-ledger-consume.test.mjs`'s `validateVerdictEntry`/`validateVerdictsFile` tests
   are the executable spec — a schema change without a matching validator change (or vice versa) is a
   defect, not a style choice.

## Why a hand-written validator, not a JSON-Schema library

`run-ledger-consume.mjs` runs under plain `node`, not `jiti` — `.discipline/glob-portability.test.mjs`
forbids a bare npm import (a JSON-Schema engine included) in any file matched by
`.discipline/run-test-suite.sh`'s no-`npm-ci` glob, which `scripts/turns/*.test.mjs` is (see
`run-ledger-consume.test.mjs`'s own header for the identical reason `jiti` itself cannot be imported
there). `validateVerdictsFile`/`validateVerdictEntry` are the SAME pattern `scripts/lib/run-artifact.mjs`'s
`validateRunArtifact` already uses for the harness-run-artifact contract: a pure, dependency-free function
that returns an array of human-readable error strings (empty = valid), fail-closed at the caller.

## What the driver does with a verdict file

- **Schema violation → the WHOLE file is rejected** (`process.exit(4)`). A structurally malformed entry
  (missing a required field, wrong type) is a producer bug — the driver refuses to guess around it.
- **`prompt_version` drift → per-entry, non-fatal.** An entry whose `prompt_version` does not match the
  driver's own live `FIRST_FETCH_CLASSIFY_PROMPT_VERSION` is excluded from use (treated as "no verdict"
  for that URL — skipped, never silently accepted as current) and counted
  (`stale_prompt_version_entries` in the run's own `config.verdicts_file`). A large batch dispatched
  incrementally should not be thrown away over one edited prompt line.
- **Match key is URL, not `candidate_id`.** The `classify()` injection point
  (`ConsumeOpts.classify`, `portal-harvest.ts`) receives `input.source_url` — never the ledger row's own
  `id` — so that is what the driver actually matches on. Each verdict's own `candidate_id` is still
  carried through and cross-checked against the ledger row the URL match actually resolved to; a
  mismatch is flagged (`per_item[].verdict_candidate_id_mismatch: true` in the run's own harness-run
  artifact), never silently dropped.
- **Telemetry, not a second bookkeeping structure.** A verdict-driven outcome's `classify_source` is
  `"session-verdict"`, its `est_usd`/`input_tokens`/`output_tokens` are `0`, and it flows through the
  SAME `shapeConsumeResult` shaping pass as an API-classified outcome (`classify_source: "api"`) or a
  skipped one (`classify_source: "skipped-no-verdict"`) — one telemetry map, one shaping function, no
  parallel accounting path to drift out of sync.

## `classified_by`

Only `"session-haiku"` is accepted today (`ALLOWED_CLASSIFIED_BY` in `run-ledger-consume.mjs`,
`classified_by`'s `const` in `schema.json`) — a real Haiku model call a session lane ran, per the
operator's ruling, never a human guess or a different model standing in. Extending the sanctioned set is
a one-line, reviewed change in both files, not a silent broadening.
