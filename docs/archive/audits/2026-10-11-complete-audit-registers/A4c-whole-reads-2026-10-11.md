# A4c register: whole-file reads of src/lib/{llm,research,api,coverage,learning,operations,hooks,regional,portfolio}, 2026-10-11

Lane audit2-a4c-whole-reads (FACT lane, read-only, Sonnet), disposition lane for lane A4 (`A4-src-lib-2-2026-10-11.md`), which read 22 of 293 non-test files whole. Tree: master `0d0766347`. One file created under `fsi-app/scripts/tmp/audit2/` (this one); scratch scripts live in the session scratchpad; no commit, push, PR, CI, database, or sub-agent. Charter `audit2-charter.md` read whole first.

## READ DEPTH (charter method 1)

- **75 of 75 in-scope non-test files read WHOLE** (every line, one Read call each, none truncated): 9 `api/`, 8 `coverage/`, 6 `hooks/`, 16 `learning/` (4 `.mjs` + 12 emitting-table `.json`), 11 `llm/`, 5 `operations/`, 5 `portfolio/`, 5 `regional/` + 3 fixtures, 7 `research/`. Scope total 10,185 non-test lines by `wc -l`. Files in this scope that A4 had read only as a "digest" (now whole): llm/first-fetch-classify.ts, llm/haiku-classify.ts, llm/skill-loader.ts, llm/spend-client.ts, learning/prediction-scoring.mjs, coverage/index-data.ts, research/assess.mjs. The 43 test files in scope were not read; they were executed (below).
- Files NOT read in full: none in scope. Files read outside scope only to settle a claim, by named line range: `app/api/coverage/entries/route.ts` (1-60), `app/api/workspace/portfolios/**` (grep for `requireOrgWriter`), `.discipline/fitness/functions/F15-spend-chokepoint.mjs` (40-75), `lib/llm/spend-guard.test.mjs` (133-170), `lib/db/paginate.mjs` (grep `cap`), `lib/connections/flag-namespaces.mjs` (grep `buildSubjectRef`).

## EXECUTION EVIDENCE HANDLES (cited in rows; tail of each at most 6 lines)

- **E1** `FSI_NO_ENV_FILE=1 node --test` over the 23 `*.test.mjs` in scope -> `tests 352 / pass 352 / fail 0 / skipped 0`.
- **E2** same over the 20 `*.npmtest.mjs` in scope -> `tests 221 / pass 221 / fail 0 / skipped 0`.
- **E3** export-reference scan (word-boundary reference count of every `export` in each file across `git ls-files src scripts .discipline`, own file and tests counted separately): output retained in scratchpad `exports.mjs`; quoted per row.
- **E4** targeted `git grep -n` (named per row).
- **E5** `node --input-type=module -e` executions of the pure functions (outputs quoted per row).
- **E6** `node --test src/lib/llm/spend-guard.test.mjs` -> `tests 17 / pass 17`, lines include the three `REGIME:` tests.

## SUMMARY

### A4 rows changed (full list; C = A4 stated something false, A = A4 row was incomplete and the omission matters)

1. **C** `llm/spend-regime.mjs`: A4 STATUS UNPROVEN ("no test file imports it"). REFUTED: `spend-guard.test.mjs:152,164` import it by cache-busting specifier (`./spend-regime.mjs?regime=steady-state`, `?regime=typo`), which A4's import-graph resolver does not follow; the three `REGIME:` tests pass. Correct STATUS: LIVE, proven by spend-guard.test.mjs. [CONFIRMED: E6 -> 17/17 pass incl. 3 REGIME tests]
2. **C** `research/assess.mjs`: A4 CALLED BY "(2 total)" includes `lib/research/assess.mjs:128`, which is the file's own JSDoc `import("./assess.mjs").AssessmentInput` type reference. Real importers: 1 (`scripts/producers/research/research-assessment-producer.mjs:54`). [CONFIRMED: E3 -> assess exports referenced prod only by the producer; E4 `sed -n 128p` is a JSDoc line]
3. **C** `api/rate-limit.ts`: A4 WHAT "sliding-window limiter" repeats the file's comment. The code is a FIXED window per user (count resets when `resetAt` passes, lines 44-47). [CONFIRMED: Read lines 38-80]
4. **C** `api/pause.ts`: A4 WHAT lists "source pause" among live gates. `isSourcePaused` and `pauseReason` have ZERO callers anywhere (only each other, inside the file); the per-source pause is not consulted by any route or script. [CONFIRMED: E4 `git grep -nE "pauseReason|isSourcePaused" -- src scripts .discipline` minus pause.ts -> no output]
5. **A** `api/org.ts`: A4 WHAT Note says "unchecked-error destructure at lines 109/203"; the sites are lines 150 and 244 (A4's own Prior-findings table has the right numbers). [CONFIRMED: E4 `grep -nE "const \{ data(: *[A-Za-z_]+)? \} = await" -> org.ts:150, org.ts:244`]
6. **A** `llm/spend-guard.mjs`: A4 WHAT "program-total accumulator (seedSpend)". `seedSpend` has NO caller anywhere (its doc says the runner MUST call it before the first paid call); the accumulator therefore always starts at $0 in every process. [CONFIRMED: E4 `git grep -n seedSpend -- src scripts .discipline` minus spend-guard.mjs -> no output]
7. **A** `llm/spend-client.ts`: A4 omits (a) two raw `fetch(ANTHROPIC_MESSAGES_URL ...)` calls at lines 121 and 153 inside the chokepoint (outside the sanctioned transport `agent/anthropic-stream.mjs`), (b) `logSpendRun` (line 211) has zero callers though its comment says funded-pass and proof-sample call it, (c) `MONTHLY_TOTAL_DISPLAY_USD` zero references, (d) `currentTicket` is a process-global mutable. [CONFIRMED: E4 `git grep -n logSpendRun -- src scripts .discipline` -> only the definition and one invariant description; E3 MONTHLY_TOTAL_DISPLAY_USD:prod0/test0]
8. **A** `llm/haiku-classify.ts`: A4 "sole caller sources/verification.ts:28" is true for the function but the file has a second importer, `app/api/admin/spot-check/recurring/route.ts` (imports `VERIFICATION_HAIKU_SYSTEM_PROMPT`). The "direct SDK call outside the chokepoint" finding is confirmed AND is not unique: 4 more call sites (list below). Most of the file is dead (below). [CONFIRMED: E4 `git grep -n VERIFICATION_HAIKU_SYSTEM_PROMPT -- src` -> haiku-classify.ts, sources/verification.ts, spot-check/recurring/route.ts]
9. **A** `llm/metered-gate.mjs`: UNWIRED confirmed. A4 omits that both scoped amendments are past their own stated expiry/removal condition and still present, and that the gate's FREE_ONLY_CLASSES lists `verification` while the live source-verification classifier (haiku-classify.ts) is a metered Haiku call that never consults the gate. [CONFIRMED: Read lines 22-61]
10. **A** `llm/spend-gauge.mjs`: A4 STATUS LIVE stands; added [HYPOTHESIS] that `tracedPaidRuns` is structurally 0 for production rows (marker is only matched on the paid row itself; no production writer was found that puts the marker on a cost>0 row).
11. **A** `coverage/index-data.ts`: A4 WHAT (digest) omits: dropped error on the verified-brief count (line 177), a header comment ("authenticated + read-only", lines 12-13 / route comment) that predates the 2026-07-29 admin-only ruling, and that `loadCoverage` paginates the whole `would_mint` census once per call, so the matrix build runs it twice (see matrix-data/load-matrix).
12. **A** `coverage/matrix-data.ts` + `coverage/load-matrix.mjs`: A4 rows silent on the doubled census read (`getEntries()` and `getIndex()` each run `loadCoverage`, in parallel, per matrix build).
13. **A** `learning/trigger-questions.mjs`: A4 silent on (a) mint-time and change-time questions share one `subject_ref` per (item, surface, question) so a change question is skipped while a mint-time one is open and the `change` text is lost, (b) `eventType` is passed to all four builders and read by none.
14. **A** `learning/questions-on-change.mjs`: `readEntityLinks` failure is caught with a bare `catch {` (line 198): counted as `read_errors`, the error message is discarded.
15. **A** `operations/labour-chain.ts`: A4 LIVE with no defect recorded. `computeLabourChain` sums `valueNumeric` of the five numerator terms with no unit or currency check. [CONFIRMED: E5 -> baseWage 20 EUR/hour + employerContributions 32 "percent" + 3 more at 1 -> `{"numeratorTotal":55,"finalValue":68.75,"finalUnit":"EUR per productive hour","suppressed":false}`]
16. **A** `research/assess.mjs`: two logic defects not in A4 (R1 anchors to any dated forward event; TRL ladder shadowing), see row. [CONFIRMED: E5]
17. **A** `research/taxonomy.mjs`: `/zero[- ]?emission/i` in the `last-mile` list is unreachable (the earlier `emissions` list matches first). [CONFIRMED: E5 -> `assignTheme("zero-emission cargo bays for urban delivery")` = `emissions`]
18. **A** `research/theme-brief-text.mjs`: the "scores" strip removes ANY bare `0.ddd`/`1.ddd` number, not just scores. [CONFIRMED: E5 -> `"Tariff is 0.215 EUR/kWh in 2024 and 1.050 USD per unit; scores 0.986."` becomes `"Tariff is EUR/kWh in 2024 and USD per unit;."`]
19. **A** `hooks/useWorkspaceBootstrap.ts`: the `/api/workspace/bootstrap` payload computes and ships `adminAttention` (`app/api/workspace/bootstrap/route.ts:63,84`) and no client reads it (type only, line 80); `useAdminAttention` polls its own endpoint with an identical 9-field interface. Also the singleton is never cleared on sign-out. [CONFIRMED: E4 `grep -rn adminAttention src` -> no reader besides Sidebar's own local variable]

A4 rows CONFIRMED unchanged on WHAT / CALLED BY / CONSUMED BY / STATUS / CLASS: the other 56 files.

### Counts (STATUS, after corrections; A4 values in brackets)

| STATUS | rows | note |
|---|---|---|
| LIVE | 66 [65] | spend-regime.mjs moved UNPROVEN -> LIVE |
| UNPROVEN | 7 [8] | coverage/client.ts, coverage/matrix-data.ts, llm/haiku-classify.ts, llm/skill-loader.ts, portfolio/client.ts, portfolio/read.ts, portfolio/route-support.ts (each: `git grep` of the name in every test file and `.discipline` -> only path-string mentions or nothing) |
| UNWIRED | 1 [1] | llm/metered-gate.mjs |
| HALF-SLICE | 1 | hooks/useWorkspaceBootstrap.ts is LIVE but its `adminAttention` field is a writer with no reader; counted in LIVE, listed here as a half-slice FIELD, not a half-slice file |
| DEAD / STALE | 0 / 0 | |

CLASS: unchanged from A4 (CAPABILITY / LEARNING / SELF-MAINTENANCE / NONE as the A4 rows state; I changed none).

### Direct model / SDK calls outside the spend chokepoint (charter ask: confirm haiku-classify and list every other)

All found by `git grep`/`grep -rnE "@anthropic-ai/sdk|new Anthropic\(|api\.anthropic\.com|messages\.create|ANTHROPIC_MESSAGES_URL|x-api-key" src` (non-test). The chokepoint is `lib/llm/spend-client.ts`; the sanctioned transport is `lib/agent/anthropic-stream.mjs` (F15, spend-client.ts header lines 14-17).

| Site | What | Ticket / ledger row? | F15 LEGACY_ALLOWLIST |
|---|---|---|---|
| `lib/llm/haiku-classify.ts:156-158` | `new Anthropic({apiKey})` then `client.messages.create` (haikuVerifyCandidate) | none, no agent_runs row | yes (`chokepoint-classifier-migration`) CONFIRMED |
| `app/api/admin/spot-check/recurring/route.ts:139-141` | SDK `messages.create` | none | yes (`chokepoint-route-migration`) |
| `app/api/admin/canonical-sources/bulk-classify/route.ts:131,219` | SDK `messages.create` | none | yes |
| `app/api/admin/canonical-sources/recommend-classification/route.ts:211-214` | SDK `messages.create` | none | yes |
| `app/api/admin/sources/recommend-classification/route.ts:192-195` | SDK `messages.create` | none | yes |
| `lib/llm/spend-client.ts:121` (spendMessage) and `:153` (spendSearch) | raw `fetch(ANTHROPIC_MESSAGES_URL, ...)` INSIDE the chokepoint, not through anthropic-stream.mjs | yes (ticket, budget, recordSpendCall) | n/a (is the chokepoint) |
| `lib/agent/anthropic-stream.mjs:23,102` | the sanctioned transport (URL constant, `x-api-key` header) | via spend-client | n/a |

[CONFIRMED: grep above; F15 lines 47-60 name the four route files and haiku-classify.ts as allowlisted]. `first-fetch-classify.ts` is NOT a direct call (routes through `spendMessage` with a `first-fetch-classify` standing ticket; read whole). The only live in-repo invocation of `firstFetchClassify(` is `intake/portal-harvest.ts:441` (via `opts.classify ?? firstFetchClassify`, awaited sequentially) [CONFIRMED: E4 `git grep -n "classify(" -- src/lib/intake/portal-harvest.ts`].

### Raw `fetch(` outside a transport module (in scope)

- Anthropic: `llm/spend-client.ts:121,153` (above).
- Browser to own API: `hooks/useAdminAttention.ts:108` and `hooks/useWorkspaceBootstrap.ts:150` call bare `fetch` with headers from `authHeaders()` (authed-fetch.ts) instead of `authedFetch`; `hooks/useUnreadNotificationsCount.ts:33` calls bare `fetch` with NO bearer (route is cookie-session community auth). `coverage/client.ts`, `portfolio/client.ts` use `authedFetch` only. [CONFIRMED: E4 `grep -nE "(^|[^A-Za-z_.])fetch\(" ...` over scope -> the 5 lines above plus comment lines]
- No other `fetch(` in scope.

### Dropped-error reads / swallowed errors (in scope)

- `api/org.ts:150,244` `const { data: membership }` (no `error`): a failed read returns `null` org / `orgId: null` as if "no membership". STILL-OPEN (A4/a3 F2-1a). [CONFIRMED: E4]
- `coverage/index-data.ts:177` `const { count: verifiedBriefs }` (no `error`): a failed count reads as 0 verified briefs on the headline. [CONFIRMED: Read line 177]
- `learning/questions-on-change.mjs:196-201` bare `catch {`: error message discarded. [CONFIRMED: Read]
- `research/read-signposts.mjs:93-101,157-166`: both fetchers soft-fail to `[]` / a shorter chain on any error (documented in the header as by design).
- `api/pause.ts:110-125` `isSourcePaused` fails OPEN (returns false on error) while every other gate in the file fails CLOSED; moot because it has no callers.
- `portfolio/read.ts:97,103` `fetchWorkspaceOverrideRowsRaw` / `enrichRowSourceChips` results consumed with no error visibility at this call site (their internals are outside scope). [HYPOTHESIS: not read]
- Fire-and-forget writes: none in scope (every write is awaited). `llm/spend-client.ts:195-204` `recordSpendCall` logs and deliberately leaves the call "unlogged" on failure, which refuses the NEXT spend (documented, works as designed).
- TODO/FIXME/HACK: none in scope. Disabled code: one `eslint-disable-next-line react-hooks/exhaustive-deps` (`hooks/useNearestScrollParent.ts:90`).

### Duplicated logic with another file

- `ClaimsVerifier` interface: `api/auth.ts:40` and `api/community-auth.ts:65` (two exported interfaces of the same name; the second widened to optional jwt); `resolveUserIdFromToken` (auth.ts:60) vs `resolveCommunityUserId` (community-auth.ts:85) are the same 3-line core.
- Oldest-membership query: `api/org.ts` lines 25-31, 66-72, 150-156, 244-250 (four copies).
- `AdminAttentionCounts` (useAdminAttention.ts:8) vs `BootstrapAdminAttention` (useWorkspaceBootstrap.ts:46): identical 9 fields. Singleton-poller pattern copied between the two hooks (header says "mirrors").
- `extractJsonObject` + `CONTENT_MAX_CHARS = 6000`: first-fetch-classify.ts:54,178 and haiku-classify.ts:34,113.
- Anthropic text-block join: `llm/anthropic-text.ts:23` (joins with `""`), `spend-client.ts:138,164` (joins with `"\n"`), `haiku-classify.ts:164-167` (joins with `""`): three inline copies with two different separators; the helper's own header says it left them.
- `planUpsert`: `regional/regional-facts-envelope.mjs:146` and `regional/state-cost-facts-envelope.mjs:126` (same insert/update/unchanged algorithm; the first compares by `String()`, the second by strict `!==`); also `scripts/producers/operations/ukpn-capacity-heatmap-producer.mjs:240`. [CONFIRMED: E4 grep of `function planUpsert`]
- Surface lists: `COVERAGE_SURFACES` (index-data.ts:148), `DATA_CLASSES` (coverage-matrix.mjs:36), `ALLOWED_SURFACES` (first-fetch-classify.ts:335), `SURFACES` (learning/constants.mjs:53, five incl. community), `SURFACE_KEYS` (portfolio-core.mjs:42, `market` not `market_intel`): five hand-copied lists, two spellings.
- `BRIEF_CHUNK = 40` (portfolio/read.ts:37) copies the unexported `BRIEF_READ_CAP` (supabase-server.ts:1246).
- `SIGNPOST_COLUMNS` (research/read-signposts.mjs:29) vs `SIGNPOST_BASE_COLUMNS` (learning/prediction-scoring.mjs:97): same six columns.
- "User has no organization membership" 403: org.ts:101, portfolio/route-support.ts:24 (and others outside scope).
- `src` importing from `scripts/`: `research/assess.mjs:77` (`scripts/research/authority-score.mjs`), `research/theme-brief.mjs:38` (`scripts/turns/theme-briefs/schema.mjs`); `learning/prediction-scoring.mjs:70` imports `propagation/methods/signpost-watch.ts` through `.ts` extension (Node type stripping).

### Hard-coded values that belong in config / data (selection)

`api/rate-limit.ts` WINDOW_MS 60000, MAX_REQUESTS 60; `llm/spend-client.ts` MONTHLY_TOTAL_DISPLAY_USD 130, max_tokens 32000/4000, web-search beta/tool names; `llm/first-fetch-classify.ts` maxTokens 800, domain-routing table inside the prompt (triplicate with migration 101 and domains.ts per its own comment); `llm/haiku-classify.ts` price constants 1.0/5.0; `llm/metered-gate.mjs` model literals and caps ($25, $6); `llm/skill-loader.ts` a 210-line hand copy of the skill (including a real client name "Dietl" at lines 113-115 as the "wrong" example); `coverage/index-data.ts` INITIAL_CAP 60, `dryrun_disposition = 'would_mint'`; `operations/state-roster.mjs` 14 state labels; `operations/region-grid.mjs` FIGURE_MAX_CHARS 24; `regional/eurostat-lc-lci-lev-parser.mjs` EU_MEMBER_GEO_CODES copy of `regions.iso_codes`; `regional/bls-oews-parser.mjs` 3 occupations; `research/assess.mjs` keyword ladders, STATUTORY_RE naming specific instruments, citation thresholds 0/5; `research/taxonomy.mjs` keyword lists; `portfolio/portfolio-core.mjs` caps 100/500/1000 (mirror migration 362) and a literal "100 portfolios" in the 409 message (line 190) while the member cap message interpolates.

### Unverified (rows carrying [HYPOTHESIS])

1. spend-gauge `tracedPaidRuns` structurally 0 in production (no writer found; not executed against data).
2. useWorkspaceBootstrap singleton retains data across sign-out/in in one page session (mechanism read; not exercised in a browser).
3. first-fetch-classify ticket restore race under concurrent callers (only sequential caller found).
4. regional parsers ignore Eurostat `status` flags (provisional/estimated); fixture has `"status": {}` only.
5. state-cost-facts `rowsDiffer` strict `!==` on numeric columns may report spurious updates if PostgREST returns numerics as strings (regional version defends against it).
6. portfolio/read.ts internals of `fetchWorkspaceOverrideRowsRaw`/`enrichRowSourceChips` error handling (outside scope).
7. request-coverage dedup is read-then-insert (race window); whether the table has a partial unique index was not read (C3 lane scope).
8. labour-chain matcher `baseWage` takes the first label containing wage|salary|earnings, which can be an annual (`USD/year`) BLS fact or any occupation; display consequence not exercised (no other chain terms exist live per the file's own note).

### The ten rows that matter most (no adjectives)

1. `llm/haiku-classify.ts`: metered Haiku source-verification via the raw SDK, no ticket, no agent_runs row; plus 4 admin routes doing the same; F15-allowlisted.
2. `llm/metered-gate.mjs`: the standing-financial-law wall has zero importers; two amendments past expiry; it forbids `verification` while verification runs metered.
3. `llm/spend-guard.mjs` + `llm/spend-client.ts`: `seedSpend` and `logSpendRun` have no callers; two raw `fetch`es sit inside the chokepoint.
4. `operations/labour-chain.ts`: sums terms of mixed units into one "EUR per productive hour" figure (executed).
5. `research/assess.mjs`: R1 horizon anchors to any dated forward event; TRL ladder 6-7 "demonstration plant" unreachable; statute list is named instruments.
6. `research/theme-brief-text.mjs`: strips real three-decimal numbers (0.215 EUR/kWh) from customer-facing brief text (executed).
7. `api/pause.ts`: the per-source pause helpers have no callers; header describes a fail-open behaviour the code no longer has.
8. `api/org.ts`: two membership reads drop `error` (lines 150, 244).
9. `coverage/index-data.ts` + `coverage/load-matrix.mjs`: the full census is read twice per matrix build; verified-brief count drops its error.
10. `hooks/useWorkspaceBootstrap.ts` + `api/workspace/bootstrap`: `adminAttention` is computed and shipped with no reader.

## REGISTER

Columns: ID (path under src/, line count) | A4 VERDICT (AGREE, or the correction from the changed-rows list) | FROM THE BODY (what the whole read shows that the header or A4 does not) | token.

### api/

| ID | A4 VERDICT | FROM THE BODY | token |
|---|---|---|---|
| `lib/api/auth.ts` (123) | AGREE (requireAuth Bearer->userId via getClaims; LIVE; SELF-MAINTENANCE; 1 caller route-guard.ts:26) | Anon-key client built per call with the caller's token in the global header (lines 94-96) although only `getClaims(token)` is used (JWKS local verify). `catch {}` returns a generic 401 (line 108). `ClaimsVerifier` interface duplicated in community-auth.ts. No TODO, no dead branch. | [CONFIRMED: Read 123 lines; E2 auth.npmtest.mjs pass] |
| `lib/api/authed-fetch.ts` (136) | AGREE (40 importers, LIVE) | Defines `authedFetch`; the module is the "transport" for browser to own-API calls. `fetchImpl ?? fetch` is the only bare `fetch` token and is the injection default. Two sibling hooks bypass `authedFetch` and call `fetch` with `authHeaders()` (see summary). `withBearer` converts Headers to a plain object (drops multi-value headers). | [CONFIRMED: Read; E2 authed-fetch.npmtest.mjs pass] |
| `lib/api/community-auth.ts` (147) | AGREE | Cookie session first, Bearer fallback; both branches swallow their exceptions with a commented empty `catch` (lines 116, 132) and fall through to 401, so an infrastructure failure reads as "not signed in". Header comment (lines 6-12) says community UI uses plain `fetch` with no Authorization header; `useUnreadNotificationsCount.ts:33` is such a caller. `ClaimsVerifier` duplicate (line 65). | [CONFIRMED: Read; E2 community-auth.npmtest.mjs pass] |
| `lib/api/org.ts` (269) | AMENDED (row 5): dropped-error sites are lines 150, 244, not 109/203 | Four copies of the oldest-membership query (25-31, 66-72, 150-156, 244-250). `resolveOrgIdFromAuthenticatedClient` (150) and `resolveViewerIdentityFromAuthenticatedClient` (244) drop `error`; `resolveOrgIdFromCookies`/`...IdentityFromCookies` wrap in `cache()` and a bare `catch { return null }` (194, 266). `requireOrgWriter` does log a failed read and fails closed (110-113). | [CONFIRMED: E4 grep -> org.ts:150, org.ts:244; E2 org.npmtest.mjs + org-writer.npmtest.mjs pass] |
| `lib/api/pause.ts` (208) | AMENDED (row 4): source pause unwired | `readScrapeState` throws, `getScrapeState` fails closed, `getJudgementDrain`/`isFleetBudgetHalted` fail closed, `isSourcePaused` fails OPEN (line 120, 122-124). `isSourcePaused` and `pauseReason` have zero callers. Header lines 10-11 still say a missing migration 016 is treated as UNPAUSED ("the safer default"); the code now fails closed (47-52). Callers live: pausedResponse (scan, bulk-import, fetch-now, spot-check), isGloballyPaused/getScrapeState (recompute-trust, check-sources, reconcile), readScrapeState (supabase-server.ts:31). | [CONFIRMED: E4 `git grep -nE "pauseReason|isSourcePaused"` minus pause.ts -> none; E3 pause.ts] |
| `lib/api/rate-limit.ts` (104) | AMENDED (row 3): fixed window, not sliding | Per-instance `Map`, cleanup only runs inside `checkRateLimit` (every 5 min). `rateLimitHeaders` reads the same Map. Header (line 7) says "sliding window counter"; code resets the count at `resetAt` (fixed window, bursts of up to 2x at a boundary). `clientKey` shared bucket `anon:unknown` on a missing header (fail closed). | [CONFIRMED: Read lines 38-80; E2 rate-limit.npmtest.mjs pass] |
| `lib/api/route-guard.ts` (121) | AGREE | `isRefusal` tests `instanceof Response` (not NextResponse). Admin guard spends a rate-limit slot before the admin check, so a non-admin burns the quota then gets 403 (by its own stated order). Injected deps are test-only. | [CONFIRMED: Read; E2 route-guard.npmtest.mjs pass] |
| `lib/api/server-bootstrap.ts` (228) | AGREE | Reads `error` on all three parallel reads and throws `IdentityLookupError` (good). Heal failure is caught and `console.warn`ed (191-193). Outer `catch` returns EMPTY for any non-IdentityLookupError, which includes a thrown error from `createSupabaseServerClient` outside a request scope. | [CONFIRMED: Read; E2 server-bootstrap.npmtest.mjs + server-bootstrap-heal.npmtest.mjs pass] |
| `lib/api/worker-auth.ts` (73) | AGREE | Constant-time compare with a length pre-check (length difference leaks length, as the comment accepts). `allowBearer` option has no remaining caller (header lines 36-40 say so). | [CONFIRMED: Read; E4 workerAuthGuard 8 callers per A4] |

### coverage/

| ID | A4 VERDICT | FROM THE BODY | token |
|---|---|---|---|
| `lib/coverage/client.ts` (85) | AGREE (UNPROVEN: no test) | All three calls via `authedFetch`; bare `catch {}` returns a generic network error for any failure including a JSON parse error on a 2xx (lines 41-45). `downloadCoverageCsv` uses `coverageHref(query, "")` to reuse the query encoder. | [CONFIRMED: Read; E4 no test references `coverage/client`] |
| `lib/coverage/coverage-matrix.mjs` (351) | AGREE | `DATA_CLASSES` hard-copies COVERAGE_SURFACES (test asserts agreement). `cellKey` joins with `|` and `buildCoverageMatrix` splits it back (line 158): a geography containing `|` would corrupt a cell. Module is pure, clock injected. CSV formula-injection guard present. | [CONFIRMED: Read; E1 coverage-matrix.test.mjs pass] |
| `lib/coverage/coverage-state.mjs` (142) | AGREE | One `default: return null` branch is unreachable behind `isCoverageState`. Honest-absence rules hold; no dash glyphs. | [CONFIRMED: Read; E1 coverage-state.test.mjs pass] |
| `lib/coverage/identity.mjs` (83) | AGREE (3 callers) | Pure. `deterministicIdentity` has only test references (E3 prod0/test1); `parseInstrumentUrl` and `classifyIdentifier` are the used exports. | [CONFIRMED: Read; E3] |
| `lib/coverage/index-data.ts` (266) | AMENDED (row 11) | Dropped error at line 177. Reads the whole `would_mint` set for every call (1000-row pages), once for `getCoverageIndex` and again for `getCoverageEntries`. Header says the entry list is "authenticated + read-only" (line 12-13); the only entries route is admin-only (route.ts lines 1-6, `isPlatformAdmin` at line 16). `EMPTY.cap`/`INITIAL_CAP` 60 hard-coded. `getCoverageIndex` fails soft to EMPTY + `_error`; `getCoverageEntries` throws. | [CONFIRMED: Read; E2 index-data.npmtest.mjs pass; Read route.ts 1-60] |
| `lib/coverage/load-matrix.mjs` (62) | AMENDED (row 12) | `Promise.all([getEntries(), getIndex()])` runs `loadCoverage` twice per build (both resolve to the same census paginate). Failure is a state (`COVERAGE_UNAVAILABLE`), not a zero. | [CONFIRMED: Read load-matrix.mjs:32 + matrix-data.ts:32-36 + index-data.ts:243-266] |
| `lib/coverage/matrix-data.ts` (71) | AMENDED (row 12); UNPROVEN stands | `unstable_cache` 600 s, key strings `coverage-matrix-v1` / `coverage-denominator-v1`; throws inside the cached function so an outage is not frozen; outer `catch {}` drops the cause (no log) at lines 59 and 68. | [CONFIRMED: Read; E4 no test references `matrix-data`] |
| `lib/coverage/request-coverage.mjs` (93) | AGREE | Dedup is select-then-insert (lines 79-90), no atomic guard in this module. Free text cannot reach the row (description composed here). Both DB errors are replaced by a generic string. | [CONFIRMED: Read; E1 request-coverage test files pass; race = HYPOTHESIS 7] |

### hooks/

| ID | A4 VERDICT | FROM THE BODY | token |
|---|---|---|---|
| `lib/hooks/useAdminAttention.ts` (278) | AGREE, annotated | Raw `fetch` at 108 with `authHeaders()`. 401/403 are mapped to ZERO counts and no error (118-129). `AdminAttentionCounts` duplicates `BootstrapAdminAttention`. Header comment names UserMenu/IssuesQueue/AtAGlanceBlock as mounters; actual importers per A4 are Sidebar, AdminDashboard, AdminIssuesRail, FlagsRejectionsQueue. | [CONFIRMED: Read; E3 hook export used by 4 components] |
| `lib/hooks/useNearestScrollParent.ts` (94) | AGREE | `isScrollable` is evaluated once in an effect keyed on `ref.current`; if the ancestor has not yet overflowed at that instant the result is `window` and is never re-resolved (no resize/content observer). `eslint-disable` at 90. | [CONFIRMED: Read] |
| `lib/hooks/usePersonalState.ts` (62) | AGREE | `data.personalState.map(...)` has no guard for an absent `personalState` (typed required). Applied once per hook instance via `appliedRef`; skipped when `rows.length === 0`. | [CONFIRMED: Read] |
| `lib/hooks/useUnreadNotificationsCount.ts` (79) | AGREE | Raw `fetch` with `cache: no-store`, no bearer (cookie-session route). Non-OK and network errors silently ignored (documented). | [CONFIRMED: Read] |
| `lib/hooks/useWorkspaceBootstrap.ts` (233) | AMENDED (row 19) | Raw `fetch` at 150. `singleton.attempted` and `state` are never reset on sign-out (compare useAdminAttention's teardown); `error !== null` is terminal for the session except via `refresh()`. `BootstrapOverrideRow` is hand-duplicated from supabase-server.ts (header 58-65 says so). `adminAttention` field has no reader. | [CONFIRMED: Read; E4 grep adminAttention; persistence across sign-out = HYPOTHESIS 2] |
| `lib/hooks/useWorkspaceOverridesHydration.ts` (74) | AGREE | Parallel hook to usePersonalState (header says kept on purpose). `data.overrides ?? []`; applies at most once. | [CONFIRMED: Read] |

### learning/

| ID | A4 VERDICT | FROM THE BODY | token |
|---|---|---|---|
| `lib/learning/constants.mjs` (73) | AGREE | `SURFACES` (5, includes community) is a different set from trigger-questions' reachable surfaces (4); `TRIGGER_EVENT_TYPES` carries two reserved values with no emitter (`confidence_decayed`, `source_frozen`), stated in the comment. | [CONFIRMED: Read; E3 all referenced] |
| `lib/learning/emitting-tables/derived_values.json` (6) | AGREE | one descriptor, `value_revised`, no overrides | [CONFIRMED: cat; E1 questions-on-change.test.mjs parses the directory] |
| `lib/learning/emitting-tables/emission_factors.json` (8) | AGREE | `byKind.supersede = factor_superseded` | [CONFIRMED: cat] |
| `lib/learning/emitting-tables/entity_aliases.json` (7) | AGREE | `identity_revised`, `describe: "identity"` | [CONFIRMED: cat] |
| `lib/learning/emitting-tables/entity_relations.json` (7) | AGREE | `identity_revised`, `describe: "identity"` | [CONFIRMED: cat] |
| `lib/learning/emitting-tables/estimated_values.json` (6) | AGREE | `value_revised` | [CONFIRMED: cat] |
| `lib/learning/emitting-tables/grid_connection_queues.json` (6) | AGREE | `value_revised` | [CONFIRMED: cat] |
| `lib/learning/emitting-tables/market_series.json` (6) | AGREE | `value_revised`; outbox rows carry a NULL entity today so they reach no item (per questions-on-change header) | [CONFIRMED: cat] |
| `lib/learning/emitting-tables/obligation_objects.json` (6) | AGREE | `obligation_amended` | [CONFIRMED: cat] |
| `lib/learning/emitting-tables/oem_tech_roadmaps.json` (6) | AGREE | `value_revised` | [CONFIRMED: cat] |
| `lib/learning/emitting-tables/regional_data_facts.json` (6) | AGREE | `value_revised`; NULL entity today | [CONFIRMED: cat] |
| `lib/learning/emitting-tables/signposts.json` (6) | AGREE | `signpost_fired` | [CONFIRMED: cat] |
| `lib/learning/emitting-tables/statutory_computations.json` (6) | AGREE | `obligation_amended` | [CONFIRMED: cat] |
| `lib/learning/prediction-scoring.mjs` (557) | AGREE (now whole) | Lifecycle stamp failure after a successful `fire()` is counted in `errors` but not `failedEventIds` (lines 298-301), so the repair pass can apply the lifecycle transition a second time on the next run; the header (lines 53-65) accepts a one-round-trip window but not this retry path. State-based reads cap at `STATE_READ_CAP = 5000` and `fetchAllRows` THROWS above the cap (paginate.mjs line 33), so >5000 unscored signposts would abort the drain step loudly. `readDeadlineCandidates` reads every unfired, unscored signpost each run and filters client-side. Dry mode still reads. `hydrateEventRows` has its only caller in run-propagation-drain.mjs. No dead branch. | [CONFIRMED: Read 557 lines; E1 prediction-scoring.test.mjs pass; E3 all exports referenced] |
| `lib/learning/questions-on-change.mjs` (252) | AMENDED (row 14) | Module-load `readdirSync` of the descriptor directory (not importable from a bundled client; only scripts import it). `MAX_ITEMS_PER_EVENT = 25` cap reported not silent. Entity-to-item link ignores `entity_refs.role`. | [CONFIRMED: Read; E1 questions-on-change.test.mjs pass] |
| `lib/learning/trigger-questions.mjs` (227) | AMENDED (row 13) | `subjectRef = buildSubjectRef(item.id, surface, pq)` carries no event identity, so `mainForQuestions`' dedup key (`subjectRef + createdBy`) makes a change-time question collide with an open mint-time question for the same item/surface/question. `QUESTION_BUILDERS` receive `eventType` and none reads it. `DOMAIN_TO_SURFACE` has no community and no domain 5 (stated). Question text templates are in code (English literals). | [CONFIRMED: Read lines 99-119, 183-196; E4 flag-namespaces.mjs buildSubjectRef doc lines 52-54] |

### llm/

| ID | A4 VERDICT | FROM THE BODY | token |
|---|---|---|---|
| `lib/llm/anthropic-text.ts` (28) | AGREE | 3 route callers; the helper is not used by spend-client or haiku-classify (own header, lines 5-8). | [CONFIRMED: Read] |
| `lib/llm/first-fetch-classify.ts` (386) | AGREE (now whole); refinement | Routes through `spendMessage` with a standing ticket and restores the previous ticket in `finally` (the ticket store is a process-global, so concurrent callers would race; only sequential caller found). `isErrorBody` short-circuit returns severity `"monitoring"` (lowercase, 235) and priority `"LOW"`; the normal path defaults to `"MONITORING"`/`"MODERATE"` (342-344): inconsistent casing between the two result shapes. severity/priority/urgency_tier are accepted as any string from the model (no vocabulary check here). `ALLOWED_SURFACES` hard-coded in the function. `__test` export has no reference anywhere. | [CONFIRMED: Read 386 lines; E1 none; E2 first-fetch-classify.npmtest.mjs pass; E3 `__test:prod0/test0`] |
| `lib/llm/haiku-classify.ts` (214) | AMENDED (row 8) | The one live function makes a direct SDK call (`new Anthropic` 156, `messages.create` 158): no ticket, no budget check, no agent_runs row. Everything else is dead: `HAIKU_INPUT_PER_MTOK_USD`/`OUTPUT`, `estimateCostUsd`, `sha256Hex`, `htmlToText` import, `CONTENT_MAX_CHARS` are reachable only through `__internals` (no test file, E3 `__internals:prod0/test0`); the "Content classification prompt" and `haikuClassify` comment blocks (82-85, 194-199) describe a removed function. `HAIKU_MODEL` is re-exported. | [CONFIRMED: Read; E4 `git grep` importers; F15 lines 47-48] |
| `lib/llm/metered-gate.mjs` (108) | AMENDED (row 9); UNWIRED stands | `SCOPED_CLASS_AMENDMENTS` entry "P2 proof batch" states "EXPIRES 48h from authorization 2026-07-29 ... REMOVE this entry then" (line 59-60) and is still present on 2026-10-11; `SCOPED_MODEL_AMENDMENTS` entry `index-relevance-second-pass` states "REMOVE this entry once that pass is done" (line 43) and is still present. `FREE_ONLY_CLASSES` includes `verification`. Imported by its own test only (E3: test1, prod0). | [CONFIRMED: Read; E3 `assertMeteredCallAllowed:prod0/test1`; E1 metered-gate.test.mjs pass] |
| `lib/llm/model-ids.mjs` (33) | AGREE | Two constants. metered-gate keeps its own literal copies on purpose (header 25-27). | [CONFIRMED: Read] |
| `lib/llm/priced-line.mjs` (77) | AGREE | Pure; imported by spend-guard only. | [CONFIRMED: Read; E1 priced-line.test.mjs pass] |
| `lib/llm/skill-loader.ts` (267) | AGREE (UNPROVEN stands) | One template-literal constant: a hand copy of ~12 skill sections; no drift test (`git grep` of the name in tests -> none). Contains the real client name "Dietl" as a "wrong" example inside the production system prompt (113-115). Lists "8 jurisdictions" and 7 topic categories inline. | [CONFIRMED: Read; E4 no test references `skill-loader`] |
| `lib/llm/spend-client.ts` (222) | AMENDED (row 7) | Raw `fetch(ANTHROPIC_MESSAGES_URL` at 121 (spendMessage) and 153 (spendSearch). `SPEND_CEILING_USD` is passed to `assertBudget` at four call sites and ignored by it (informational). `svc()` builds a new service client per telemetry write with `!` env assertions. `recordSpendCall` row hard-codes `status: "success"`, `source_url: null`, `fetch_method: "spend-call"` and never writes `pricedLine` to the row. Dead: `logSpendRun` (no callers), `MONTHLY_TOTAL_DISPLAY_USD`. `spendStream`/`spendSearch`/`spendMessage` join text blocks with `"\n"` while anthropic-text.ts joins with `""`. | [CONFIRMED: Read 222 lines; E2 spend-client.npmtest.mjs pass; E4/E3 as row 7] |
| `lib/llm/spend-gauge.mjs` (113) | AMENDED (row 10) | `readSpendGauge` pages every agent_runs row of the month including the `errors` jsonb. `hasPricedLineMarker` requires `fetch_method === 'priced-line'` or `errors[].pricedLine` on the PAID row itself; spend-health.mjs (lines 14-36, 123) documents marker rows as separate cost-0 rows matched to paid rows by item and window, and recordSpendCall does not write the marker, so `tracedPaidRuns` would be 0 whenever paid rows exist. | [HYPOTHESIS: reading of spend-gauge.mjs:98-101,108-112 against spend-health.mjs:14-36 and spend-client.ts:195-201; not run against production rows]; E1 spend-gauge.test.mjs pass |
| `lib/llm/spend-guard.mjs` (186) | AMENDED (row 6) | Process-global counters (`runningSpentUsd`, `itemLedger`, `unloggedCalls`): in a warm serverless instance one failed telemetry write blocks all later spend in that instance until restart (by design). Test hooks `__resetSpendForTest`, `__addSpendForTest` are exported from the production module. `standingCeilingUsd` param accepted and voided. `seedSpend` never called. | [CONFIRMED: Read; E1 spend-guard.test.mjs pass; E4 seedSpend] |
| `lib/llm/spend-regime.mjs` (74) | CORRECTED (row 1): LIVE, proven | `SPEND_REGIME` read from env at import; any value other than `build-phase` throws in `assertBudget` before every spend. Three `REGIME:` tests in spend-guard.test.mjs import it via `?regime=` query specifiers. | [CONFIRMED: E6 -> 3 REGIME tests, 17/17 pass] |

### operations/

| ID | A4 VERDICT | FROM THE BODY | token |
|---|---|---|---|
| `lib/operations/labour-chain.ts` (275) | AMENDED (row 15) | No unit or currency check across the six terms; `currencyFromHourlyUnit` strips only `/hour` or `/hr` so a `USD/year` base wage yields `"USD/year per productive hour"`. `TERM_MATCHERS` match label substrings only; the BLS producer's labels (`"... annual median wage (OEWS)"`, `"... hourly median wage (OEWS)"`) both match `baseWage`, and the first fact in caller order wins (region-grid sorts facts by label), so the annual USD/year fact for the alphabetically first occupation can supply "Base wage". The Eurostat label (`"Labour cost, business economy ..."`) matches no term. | [CONFIRMED: E5 labour-chain run -> 55 / 68.75 / "EUR per productive hour"; Read matchers lines 233-240 vs bls-oews-parser.mjs:142 and eurostat-lc-lci-lev-parser.mjs:164] |
| `lib/operations/region-crosswalk.mjs` (62) | AGREE | Intentional parallel to `operations-matrix.ts resolveItemRegionCodes` (header 22). First matching region wins. | [CONFIRMED: Read] |
| `lib/operations/region-grid.mjs` (292) | AGREE | Header "LIVE STATE 2026-08-30 ... all 75 rows legacy free text" is a dated snapshot, not current state. `FIGURE_MAX_CHARS = 24`. `lastUpdated` compared as strings. All exports referenced. | [CONFIRMED: Read; E3 all referenced; E1 region-grid test files pass] |
| `lib/operations/state-roster.mjs` (44) | AGREE | 14 hard-coded state labels (13 live codes at 2026-08-30 plus US-NC); header 17-25 explains why not read from `state_cost_facts.state_label`. | [CONFIRMED: Read] |
| `lib/operations/statements.mjs` (248) | AGREE | A group whose label carries a verdict word is dropped silently (no count, line 225). Header rule list skips "5". Mutates `components[].index` in `indexGroup`. | [CONFIRMED: Read; E1 statements test files pass] |

### portfolio/

| ID | A4 VERDICT | FROM THE BODY | token |
|---|---|---|---|
| `lib/portfolio/client.ts` (56) | AGREE (UNPROVEN) | `authedFetch` only; `call()` swallows JSON parse failure (24-28). | [CONFIRMED: Read; E4 no test references] |
| `lib/portfolio/portfolio-core.mjs` (415) | AGREE | `createPortfolio` duplicate-name fallback uses `.ilike("name", clean)` with the raw name (line 185): `%` and `_` in a name act as wildcards. `listPortfolios` counts members from one org-wide read capped at 1000 rows (flag `countsTruncated`). Write handlers in the three routes call `requireOrgWriter` (routes: portfolios/route.ts:28, [id]/route.ts:36,48, [id]/members/route.ts:36,54); GET handlers do not. | [CONFIRMED: Read; E4 grep requireOrgWriter; E1 portfolio-core test files pass] |
| `lib/portfolio/read.ts` (189) | AGREE (UNPROVEN) | `BRIEF_CHUNK = 40` copies an unexported cap. Item reads skip a `fetchWorkspaceOverrideRowsRaw` error check at this site. `fitness-allow: F39` annotations at 111, 138. | [CONFIRMED: Read; E4 no test references `portfolio/read`] |
| `lib/portfolio/route-support.ts` (51) | AGREE (UNPROVEN) | 403 literal duplicates org.ts:101; `readJsonBody` swallows parse errors to `null`. | [CONFIRMED: Read; E4] |
| `lib/portfolio/types.ts` (54) | AGREE | Types only. `PortfolioRollupView` duplicates the `Rollup` typedef in portfolio-core.mjs. | [CONFIRMED: Read] |

### regional/

| ID | A4 VERDICT | FROM THE BODY | token |
|---|---|---|---|
| `lib/regional/bls-oews-parser.mjs` (157) | AGREE | Header admits series IDs are an "INFERENCE ... not verified against a live call" (16-18); fixture is "illustrative placeholders", not a capture. Fact labels contain a literal em dash (`${regionCode} - ...`, line 142) that `statements.humaniseFactLabel` depends on. `as_at_date` = May 1 by convention. | [CONFIRMED: Read; E2 bls-oews-parser.npmtest.mjs pass] |
| `lib/regional/eurostat-lc-lci-lev-parser.mjs` (184) | AGREE | `EU_MEMBER_GEO_CODES` is a hand copy of migration 106's `regions.iso_codes`. Unit/currency taken from the first category of the payload's unit dimension; `"EUR/hour"` assumed. Simple mean across states; stamped `derived`/`calculated` with `n_observations`. | [CONFIRMED: Read; E2 eurostat-lc-lci-lev-parser.npmtest.mjs pass] |
| `lib/regional/eurostat-nrg-pc-205-parser.mjs` (131) | AGREE | Label hard-codes "(all taxes and levies)" and does not read the payload's `tax` dimension; `js.status` flags are not read. Two callers (producer, lc-lci-lev parser re-exports `decodeJsonStat`). | [CONFIRMED: Read; E2 eurostat-nrg-pc-205-parser.npmtest.mjs pass; flags = HYPOTHESIS 4] |
| `lib/regional/regional-facts-envelope.mjs` (170) | AGREE | Natural key includes `fact_label`, so a relabel inserts a new row and leaves the old (no retire path). Header "re-read this session 2026-08-30" is a dated snapshot. | [CONFIRMED: Read; E2 regional-facts-envelope.npmtest.mjs pass] |
| `lib/regional/state-cost-facts-envelope.mjs` (147) | AGREE | `rowsDiffer` compares with strict `!==`; the sibling `planUpsert` compares via `String()` for the stated numeric-string reason. Re-exports the shared verbatim-grounding functions. | [CONFIRMED: Read; HYPOTHESIS 5] |
| `lib/regional/fixtures/bls-oews-sample.json` (51) | AGREE (fixture) | Its note says it is NOT a live capture; values are placeholders; one series ID (`...99999913`) is deliberately uncatalogued. | [CONFIRMED: cat] |
| `lib/regional/fixtures/eurostat-lc-lci-lev-sample.json` (49) | AGREE (fixture) | Same posture; DE has 2022 missing by design. | [CONFIRMED: cat] |
| `lib/regional/fixtures/eurostat-nrg-pc-205-sample.json` (66) | AGREE (fixture) | `"status": {}` only (no provisional flags exercised). | [CONFIRMED: cat] |

### research/

| ID | A4 VERDICT | FROM THE BODY | token |
|---|---|---|---|
| `lib/research/assess.mjs` (475) | AMENDED (rows 2, 16) | (a) R1: the outer gate `STATUTORY_RE.test(input.text)` (236) makes the inner test `STATUTORY_RE.test(`${ev.obligation_text} ${input.text}`)` (237) always true, so R1 anchors on the FIRST dated forward event whether or not it is the statutory one. (b) `TRL_PATTERNS` row 8-9 matches `demonstrat(ed|ion)` and precedes the 6-7 row, so "demonstration plant" resolves to TRL 8-9 and that 6-7 alternative is unreachable. (c) `STATUTORY_RE` names ReFuelEU/FuelEU/EU ETS/CountEmissions/CBAM/CSRD: instruments outside that list never take R1. (d) imports `scripts/research/authority-score.mjs` from `src`. Real importer count 1. | [CONFIRMED: E5 -> `TRL for demonstration plant: {"low":8,"high":9}`; `R1 anchored to unrelated event: {"rule":"R1","anchor":{"eventId":"e1",...},"note":"binds on you at 2030-01-01 because Unrelated plant opening"}`; E1 assess test files pass] |
| `lib/research/read-assessments.mjs` (122) | AGREE | Pure view model; no I/O; all exports referenced. | [CONFIRMED: Read; E3] |
| `lib/research/read-signposts.mjs` (178) | AGREE | Both fetchers soft-fail to empty (documented). `daysSince` has no caller ("not currently rendered", line 171). `summarizePredicate` summarises `date_passed` as "fires once <field> has passed" and has no case for the `basis: movement_by_date` predicate that `assessSignposts` writes. | [CONFIRMED: Read; E3 `daysSince:prod0/test0`] |
| `lib/research/surface-candidate.mjs` (51) | AGREE | Hard-codes domain 7 and `research_finding`; drift is test-guarded (header 20-25). | [CONFIRMED: Read] |
| `lib/research/taxonomy.mjs` (263) | AMENDED (row 17) | `deriveSeverity` reads `Date.now()` in a module headed "pure". `THEME_KEYWORDS.last-mile` `/zero[- ]?emission/i` cannot be reached because `emissions` is checked first and `/emission/i` matches. `SEVERITY_COLUMN_TO_KEY.high -> "cost"` is a stated judgement call. | [CONFIRMED: E5 `assignTheme("zero-emission cargo bays for urban delivery")` -> `emissions`; E1 taxonomy.npmtest.mjs pass in E2] |
| `lib/research/theme-brief-text.mjs` (72) | AMENDED (row 18) | `BARE_SCORE_RE` removes every bare three-decimal number in [0,1]/[1,2) on any customer-facing brief, including real figures. Slug replacement limited to hyphenated keys of the tag label tables. | [CONFIRMED: E5 output quoted in row 18; E1 theme-brief test files pass] |
| `lib/research/theme-brief.mjs` (334) | AGREE | `scripts/turns/theme-briefs/schema.mjs` import from `src`. `selectThemeBriefForItem`'s typedef (`ThemeBriefView`) omits the `sections` field it returns. Constants 6, 3, 56 inline. Header counts ("34 of 38") are dated. | [CONFIRMED: Read; E2 theme-brief.npmtest.mjs pass] |

## Prior findings still open (this scope) with file:line from this tree

Only findings from A4's own "Prior findings" table that fall in this scope, re-checked against the whole read:

| Finding | Check | Status |
|---|---|---|
| F2-1a (a3): api/org.ts unchecked-error destructure | `grep` -> org.ts:150, org.ts:244 | STILL-OPEN |
| F13-1 / F-LLM-1: llm/haiku-classify.ts direct SDK call | `messages.create` at haiku-classify.ts:158; F15-spend-chokepoint.mjs:47-48 allowlist entry | STILL-OPEN (and four more allowlisted route call sites) |
| F-LLM-2: skill-loader.ts hand-maintained subset, no drift test | no test references `skill-loader` | STILL-OPEN |
| F25-3: llm/metered-gate.mjs built, never wired | prod importers 0 | STILL-OPEN |
| L12: market series deliberately empty, export/download etc. | not in this scope | n/a |

New open items from this lane are in the AMENDED list above (rows 3-19); none were recorded by an earlier audit in this scope.
