## 56. `capture-static-primaries`

**New this runbook, D25, defect-fix-plan-2026-09-12.md (lane L16, 2026-09-13).**

**Purpose**: 131 live verified brief-grade regulation-family items (`regulation`/`directive`/`standard`/
`guidance`/`framework`) have a `source_url` but no stored source capture (no `agent_run_searches` row over
200 chars) -- 130 on `eur-lex.europa.eu`, 1 on `www.legislation.gov.uk`. They were written by the old paid
generator before snapshot-first storage, so the free record-briefs path cannot regenerate them. Operator
rulings verbatim, 2026-09-13: "You do NOT need browserless. Use the browser to look for free." and "We are
NOT spending money on populating the site." This step captures each selected item's full text through the
free direct-HTTP transport ONLY -- no paid Browserless call anywhere in its reach.

**THE COORDINATOR CORRECTION (2026-09-13), binding over the original D25 plan's part (a)**: the plan
originally asked for a brand-new `plainFetch`/`fetchCanonical` chooser inside
`src/lib/sources/canonical-fetch.mjs`. That was superseded before any code for it was written -- a free
direct-HTTP transport already exists and is already first in line: `src/lib/sources/transport-runtime.mjs`
(`escalateToFetchResult`) wires the per-failure-class escalation ladder
(`src/lib/sources/transport-escalation.mjs`, invariant RD-14), and `selectTransportOrder` already returns
`["direct","render"]` for `eur-lex.europa.eu` and every host outside its small render-first list. Building a
second, parallel transport chooser would have been the exact duplicated-and-diverged defect class (D1/D3)
`canonical-fetch.mjs`'s own header exists to kill. `transport-runtime.mjs` instead gained ONE option,
`renderAllowed` (default `true`, so every existing caller is byte-for-byte unaffected) -- `false` REMOVES
"render" from the ladder structurally (escalateFetch is simply never handed a `browserlessRender`
closure), so a JS-shell or block verdict on the direct transport falls straight to the ladder's own
exhaustion path (`NO_REACHABLE_SOURCE`) instead of escalating to Browserless. This step is the first (and,
as of this lane, only) caller of `renderAllowed:false` -- see `src/lib/sources/transport-runtime.test.mjs`
for the red-then-green proof that `browserlessRender` is never invoked with it set.

**Why the ladder, not a hand-rolled fetch**: `classifyTransportResult` (`transport-escalation.mjs`) already
enforces the exact roadblock contract this step needs -- `detectRoadblock`'s `STUB_MIN_CHARS` is 200, the
SAME floor the pool's own >200-char usability gate uses (`src/lib/sources/primary-fallback.mjs`), so a
response under 200 chars, a non-2xx status, or a Cloudflare/CAPTCHA/"Just a moment"/CDN-block/soft-404
interstitial is already classified as a non-"content" outcome by the same tested classifier the live
generation pipeline runs. This step does not re-implement roadblock detection.

**GROUNDING_ACQUIRE_ENABLED (D25 part (b), the spend-lock scoping)**: `src/lib/sources/acquire-lock.mjs`'s
`ACQUIRE_FLAG` (env var `GROUNDING_ACQUIRE_ENABLED`) is the only lock gating paid acquisition today. Its
`assertAcquireAllowed` has exactly two call sites in this repo, both unrelated to this step:
`canonical-pipeline.ts`'s `groundBrief` (the paid Sonnet ledger-extraction grounding call) and
`src/lib/sources/verify-item.mjs`'s `act()` paid-acquire branch. Neither `capture-static-primaries.mjs` nor
`transport-runtime.mjs`/`transport-escalation.mjs` imports `acquire-lock.mjs` or calls
`assertAcquireAllowed` -- confirmed by grep over the step's full import graph, not by inspection alone.
This step's direct transport is therefore gated by `SCRAPE_HOLD` alone, never by
`GROUNDING_ACQUIRE_ENABLED`.

**Selection**: `ids:<uuid,uuid,...>` (an explicit id list, still filtered to a `STATIC_TEXT_HOSTS` host --
an id whose `source_url` is on a different host is reported skipped, never force-fetched through a
direct-only transport a bot-walled host would refuse), or unscoped -- every live (`is_archived=false`)
regulation-family item whose `source_url` host is in `STATIC_TEXT_HOSTS`
(`eur-lex.europa.eu`, `legislation.gov.uk`, `federalregister.gov`, `ecfr.gov`, `govinfo.gov` -- `hostOf`
strips a leading `www.`, so both spellings of a host match one entry). An item already carrying a pool row
over 200 chars is excluded from selection every run (idempotent by construction, not a separate flag).

**Capture**: `escalateToFetchResult(url, max, { directFetch, renderAllowed: false })` -- one attempt at the
item's own `source_url`. On `eur-lex.europa.eu`, when that attempt is not usable content, derives the CELEX
clean-text form (`https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:<id>`) via
`scripts/lib/canonical-key.mjs`'s `deriveKey` (the same CELEX extractor migration 255 and
`heal-provenance.mjs` both use) and retries once. A usable result writes ONE `agent_run_searches` row (the
pool row shape the export and the driver read: `intelligence_item_id, search_query: 'canonical ground',
result_url, result_title: 'source', result_index: 0, result_content, searched_at`) through `guardedInsert`
(rule 015). A roadblock writes NO row; the run writes AT MOST ONE `integrity_flags` row
(`category: source_issue`, `subject_type: system`, `created_by: capture-static-primaries`) summarising every
roadblocked item in the run, never one flag per item.

**Rate limit**: one request per second per HOST (`paceHost`) -- EUR-Lex carries ~130 of the 131 target
items, so this alone keeps the run polite to that one host regardless of selection size.

**SCRAPE_HOLD**: checked once per run, before any per-item work -- while engaged, nothing is fetched (dry
or apply) and the summary reports the hold, mirroring `resolve-error-body-gate.mjs`'s own posture exactly.
The `directFetch` closure also gates itself with `assertFetchAllowed` (defense in depth).

**Upstream**: `src/lib/sources/transport-runtime.mjs`, `src/lib/sources/fetch-hold.mjs`,
`scripts/lib/canonical-key.mjs`, `scripts/lib/institution-key.mjs`, `scripts/lib/db.mjs` (`readAll`,
`readAllByIds`, `guardedInsert`).

**Ruling**: D25 (defect-fix-plan-2026-09-12.md), operator rulings 2026-09-13 quoted above; coordinator
correction 2026-09-13 (transport-runtime `renderAllowed`, superseding the plan's original part (a)).

**EUR-Lex through Cellar (lanes L28 and L28b, 2026-09-17).** eur-lex.europa.eu answers every plain GET of
the legal-content pages (the landing page and the TXT/HTML clean-text form alike) with HTTP 202 and an
empty body, its anti-bot holding response, from a workstation and from the runner alike; the first live
apply (run 35202933168) roadblocked 130 of 131 items on that host and captured the one legislation.gov.uk
item. The step now makes a third attempt for eur-lex items through the Publications Office Cellar
resource, `https://publications.europa.eu/resource/celex/<CELEX>` with the combined Accept
`text/html,application/xhtml+xml` and `Accept-Language: en`, one request, content negotiated (acts since
about 2004 come back as XHTML, older acts such as 31992L0106 as HTML). A CELEX with an OJ sequence suffix
is served only with the parentheses percent-encoded (`celex/32000Y0229(01)` 404,
`celex/32000Y0229%2801%29` 200). All of this lives in ONE module, `scripts/lib/eurlex-cellar.mjs`
(`cellarEndpointForCelex`, `CELLAR_ACCEPT`, `isEurlexRobotGate`), which the census exporter had carried
since 2026-09-02 and which this step and the exporter now both import. The pool row keeps the item's own EUR-Lex URL as `result_url` (tier resolution and the own-URL
target match depend on it) and records the Cellar URL in `result_title`; `summary.json`'s
`per_item[].fetched_from` names it too. A capture cut at the 400,000-char cap is reported per item
(`truncated`, `full_length`, `cap`) and counted in `counts.truncated` and the note. Second apply with the
XHTML-only cut (run 35207120876): 103 captured, 27 left (20 older acts, 7 suffixed keys), which the
combined Accept and the encoding recover. Re-dispatch recipe: `mode=dry` (expect the current uncaptured count), then
`mode=apply`, then read back `counts.captured`, `counts.truncated` and the roadblock flag.

**Dispatch**: `arg` optionally `ids:<uuid,uuid,...>`; blank runs the unscoped selection. `mode=dry` lists
every selected item with its host and the action it would take, fetching and writing nothing. `mode=apply`
fetches and writes as described above.

**Artifact / read back**: `summary.json`'s `counts.candidates_scanned` / `skipped_host_not_static` /
`already_captured_skipped` / `would_capture` / (apply only) `captured` / `roadblocked` /
`roadblock_flag_written`, `per_item` (one row per selected item: `action` = `would_fetch` / `captured` /
`roadblocked`, with `reason` on a roadblock), and `read_back.pool_now_present` / `still_missing` (a
post-apply re-read of the same selection's pool state). Confirm against `SELECT count(*) FROM
intelligence_items i WHERE i.is_archived = false AND i.item_type IN
('regulation','directive','standard','guidance','framework') AND NOT EXISTS (SELECT 1 FROM
agent_run_searches s WHERE s.intelligence_item_id = i.id AND s.result_chars > 200) AND
i.source_url ~* '(eur-lex\.europa\.eu|legislation\.gov\.uk|federalregister\.gov|ecfr\.gov|govinfo\.gov)'`
(expect it to fall by `counts.captured` after an apply run; `result_chars` is the trigger-maintained,
untrimmed length -- section 57 below -- so a capture that is ONLY whitespace past 200 raw characters reads
differently than the old `length(trim(...))` form did, an edge case no live capture exhibits [HYPOTHESIS]).

**Idempotency**: a second run selects only items still missing a >200-char pool row -- an item this run
captured drops out of the next run's own candidate read via the same query above, never re-fetched or
duplicated.

**After merge (D25 part (e), not this lane's own deliverable)**: dry over the 131, apply, read back the
pool count, then export those ids under the existing-briefs stream so the authors regenerate them.

---

