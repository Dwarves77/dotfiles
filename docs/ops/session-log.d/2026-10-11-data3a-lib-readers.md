# 2026-10-11, lane DATA-3a (data3a-lib-readers): dropped-error reads in supabase-server.ts and the small lib readers

PR 1123. Backlog B-0048, B-0051 to B-0055, B-0064 closed; B-0063 refuted (flips listed under NOT done, not written to the BACKLOG file). The defect class is a Supabase result read without its error: a failed read rendered or computed as "nothing there". Each site is fixed in its file's own idiom (no new helper).

## Accomplished

Sites fixed, by shape:

- THROW (the function's contract is throw-on-failure, or the caller already catches and returns its empty plus `_error` payload): supabase-server.ts fetchChangelog (was :155), fetchDisputes (:185), fetchSupersessions (:223), fetchSources (:458), fetchWatchlist's five lookups (title lookup :4758 via the `.error` on each response, source tier :4804, source name :4820, market_series :4848, profiles :4869); coverage/index-data.ts verified-brief count (:177); community/shell-context.ts six reads (four in the Promise.all at :57, profile :146, employer :154); tags/server.ts resolveItemUuid (:71, contract silent so throw; the routes answer 500 instead of a misleading 404).
- LOG AND DEGRADE (documented fail-soft contract): api/org.ts resolveOrgIdFromAuthenticatedClient and resolveViewerIdentityFromAuthenticatedClient (warn, null / `{ userId, orgId: null }`); connections/resource-lookup.ts resolveItemUuid (:33), buildResourceLookup per-query error (:69) and the empty catch (:74); detail/inference-view.mjs readCustomerInferences (:171 now logs; the supersedes lookup :172 now returns null on error rather than showing a replaced inference as current); supabase-server.ts fetchCrossPageForItem (:4275, :4288), fetchFreshInferencesForItem (:4323), readCitedSourcesForItem bias read (:2044, whole grid reads unavailable), fetchIntelligenceItemSections legacy resolve (:3787, same warn-and-[] as the sibling read at :3802).
- LOGGED BEST-EFFORT WRITE: stores/settingsStore.ts debouncedSave (:72) now binds the error and warns, and the empty catch warns.
- STORE LOAD: settingsStore.loadFromWorkspace (:206): a failed read (anything but PGRST116, the no-row case) warns and leaves `orgId` null so no later save can overwrite the stored row with the defaults; the thrown path does the same.
- COMMUNITY AUTH: both empty catches (:116, :132) log the exception with the site before falling through.
- Sites the shapes do not match but the same "renders as nothing" failure: six unread `result.data` reads in fetchIntelligenceItem's Promise.all (timelines, changelog, dispute, xrefs, supersessions, bias) now log per table and render that block empty (throwing would cache a not-found for the whole item for 300 s); silent error-bound returns now log: fetchWorkspaceAggregates, fetchCoverageGaps, readVerifiedItemsByIds, readThemeLineage, readThemeBriefs fallback.
- Allow-marked: api/org.ts requireOrgWriter read (`// fitness-allow: F72`, fact: a failed membership read leaves data null so the next check returns the not-a-member 403 and no write proceeds). One line.
- B-0063 REFUTED, no edit: spend-client.ts:195-204 does not mark the call logged on a failed ledger write, and spend-guard.mjs:143-144 assertBudget throws SPEND_LEDGER_UNLOGGED on the next spend while unloggedCalls > 0.

## Read and reused

Reused: the files' own idioms (describeSupabaseError in supabase-server.ts; the `[module] what failed (what the caller sees): message` warn shape of org.ts; the throw-on-error line of loadCoverage's census read); no new helper. Test fixtures reuse the existing fake-client conventions of each test file and the global-fetch router pattern for a real supabase-js client.

Coverage (file | lines | read calls | consumers read):

| File | Lines | Reads | Consumers named |
|---|---|---|---|
| src/lib/supabase-server.ts | 4982 | 7 (1-700, 700-1499, 1500-2299, 2300-3099, 3100-3899, 3900-4599, 4600-4982) | fetchChangelog/Disputes/Supersessions: fetchDashboardData (/), loadMapDataPayload (/map), fetchSettingsData (/settings); fetchSources: fetchSourceData (src/app/admin/page.tsx:145); fetchWatchlist: lib/data.ts cachedWatchlist / cachedWatchlistFull; fetchCrossPageForItem / fetchFreshInferencesForItem / fetchIntelligenceItem / fetchIntelligenceItemSections: lib/detail/load-detail.ts and the four detail pages |
| src/lib/api/org.ts | 269 | 1 | resolveOrgIdFromCookies / resolveViewerIdentityFromCookies callers (public view on null orgId, ruled not a degradation: fetchDashboardData null_orgId) |
| src/lib/api/community-auth.ts | 147 | 1 | requireCommunityAuth (all /api/community, /api/orgs, /api/invitations handlers) |
| src/lib/community/shell-context.ts | 177 | 1 | /community browse, directory, discover, moderation, profile, [slug] pages |
| src/lib/connections/resource-lookup.ts | 79 | 1 | regulations/market/operations/research [slug] pages, lib/detail/load-detail.ts |
| src/lib/coverage/index-data.ts | 266 | 1 | coverage/matrix-data.ts, app/api/coverage/entries/route.ts |
| src/lib/detail/inference-view.mjs | 185 | 1 | supabase-server.ts fetchFreshInferencesForItem |
| src/lib/tags/server.ts | 136 | 1 | api/workspace/tags routes, tags/[id]/items, portfolios/[id]/members |
| src/stores/settingsStore.ts | 248 | 1 | components/settings/BriefingScheduleSection.tsx (orgId); loadFromWorkspace has no caller |
| src/lib/llm/spend-client.ts | 222 | 1 | spend functions; spend-guard.mjs read at the assertBudget and markCallLogged lines only |
| tests beside: org.npmtest 202, community-auth.npmtest 115, tags/server.npmtest 92, settingsStore.npmtest 105, shell-context.npmtest 83, index-data.npmtest 115 | | 1 each | |
| inference-view.test.mjs | 224 | 2 (1-40, 120-224) | |

Also read, for the F72 shape definition only: data2's `F72-db-result-checked.mjs` (257 lines, 1 read). F72 does not exist on master yet.

## Red then green

- Red: the nine source files checked out from origin/master against the final tests: 28 tests fail, 66 pass (the 66 are the pre-existing tests). Green: same tests on the branch: 94 pass, 0 fail. Representative sites: THROW fetchWatchlist (rejects), THROW fetchDashboardData with item_changelog / item_disputes / item_supersessions failing (`_error` and `_fallbackTrigger: "exception"`), fetchSourceData (site log), shell-context (six rejects), tags/server resolveItemUuid (rejects), index-data (rejects and `_error`); LOG AND DEGRADE org.ts (two warns), resource-lookup (warns), inference-view (warn, null), fetchCrossPageForItem and fetchFreshInferencesForItem (log); settingsStore (load hold and save warn); community-auth cookie branch (warn).
- New test files: supabase-server-dropped-errors.npmtest.mjs (real supabase-js client over an in-process fetch router, no network), resource-lookup.npmtest.mjs. Appended: org, community-auth, shell-context, index-data, inference-view, tags/server, settingsStore tests.
- The three sites inside unstable_cache readers (sections legacy resolve, cited-sources bias read, the six detail reads) cannot run under node (confirmed: `Invariant: incrementalCache missing`), so they carry source-text pins in supabase-server-dropped-errors.npmtest.mjs.
- Sibling test files in the touched directories (api, community, connections, coverage, detail, tags, stores, supabase-server-*) and the other files that import supabase-server: 921 and 206 tests, 0 fail. eslint on the changed files clean; tsc clean.

## Decisions

- shell-context.ts: all six reads throw, including profile and employer (the contract is silent, so throw per the brief); the six pages let it reach Next's error boundary.
- fetchWatchlist: every lookup throws, not only the title lookup, because the function re-raises by design so unstable_cache never stores a partial answer (documented at its catch).
- resolveItemUuid in resource-lookup.ts keeps its documented fail-soft contract (null); in tags/server.ts the contract is silent, so it throws.
- settingsStore: on a genuine read failure `orgId` stays null (saves held) instead of being set; chosen because a save after a failed load would write the defaults over the stored row. This changes the thrown path too, which previously set `orgId`.
- org.ts viewer identity: the membership error branch computes `orgId` first and logs after, so its eight-line window does not duplicate the sibling resolver's (F45 +8 on the first version).
- Incident note: a duplicate DATA-3a run committed my first edits and two log stubs on this branch (db9019188, 061030725) during the run; the content was mine and was kept. While writing tests I overwrote two existing master test files (shell-context.npmtest.mjs, index-data.npmtest.mjs) with new files, noticed from `git status` showing them modified, restored both from HEAD and appended my tests; their original tests pass unchanged.

## NOT done

- lib/detail/load-detail.ts:129 redactDetail treats a null from resolveItemUuid as "nothing to redact", so a failed uuid read (now logged, still null by the documented contract) shows admin-suppressed claims unredacted. Fix needs load-detail.ts in a write set: have redactDetail distinguish a read failure from no match (or make it fail closed). [WORK: owed]
- stores/settingsStore.ts loadFromWorkspace has no caller anywhere in src or scripts (grep), so the store's orgId is never set, debouncedSave returns early and BriefingScheduleSection never loads. Needs a mount site in the settings page. [WORK: owed]
- community-auth.ts ClaimsVerifier (:65) left as is: auth.ts:40 declares `getClaims: (jwt: string)` and the cookie branch calls it with no argument, so importing would narrow the contract. [NOT-WORK: the two interfaces differ in the optional jwt, not a duplicate]
- community-auth bearer-branch log has no test: a throwing getClaims on a well-formed token needs the network. The line is the same shape as the cookie-branch line, which is tested. [NOT-WORK: needs network, which a lane never uses]
- org.ts null from a failed membership read is indistinguishable by consumers from "no membership"; the empty value was already `null`, not `[]`, and fetchDashboardData's null_orgId branch is ruled not a degradation. A distinct unavailable state needs every one of the cookie-resolver callers in a write set. [NOT-WORK: scope statement, the log line now separates the two]
- B-0052 also names forward-events/read-upcoming.mjs; that file is lane DATA-3c's under B-0058. [NOT-WORK: covered by lane DATA-3c under B-0058, outside this write set]
- docs/ops/session-log.d/2026-10-10-drift1-schema-oracle.md lines 53 and 55 were named in a coordinator message as `[CLOSED: PR 1100]` and `[WORK: drift2-chain-proof-green]`; that file is not in this lane's write set and was not edited. [NOT-WORK: another lane's file, ungranted]
- Backlog flips NOT written in the tracked BACKLOG file: F51 (no-shared-append) fails the branch on any edit under docs/audits/ ("A lane never edits a file under docs/audits/"), which contradicts COMMON rule 22; I reverted my flips to the master copy and list them here for the executor to apply (both tables carry each row). [NOT-WORK: F51 forbids the lane edit, the executor flips from these lines]
- BACKLOG B-0048 -> CLOSED: PR 1123 [CLOSED: PR 1123]
- BACKLOG B-0051 -> CLOSED: PR 1123 [CLOSED: PR 1123]
- BACKLOG B-0052 -> CLOSED: PR 1123 [CLOSED: PR 1123]
- BACKLOG B-0053 -> CLOSED: PR 1123 [CLOSED: PR 1123]
- BACKLOG B-0054 -> CLOSED: PR 1123 [CLOSED: PR 1123]
- BACKLOG B-0055 -> CLOSED: PR 1123 [CLOSED: PR 1123]
- BACKLOG B-0064 -> CLOSED: PR 1123 [CLOSED: PR 1123]
- BACKLOG B-0063 -> REFUTED: works as designed, spend-client.ts:195-204 leaves the call unlogged and spend-guard.mjs:143-144 assertBudget throws SPEND_LEDGER_UNLOGGED on the next spend [NOT-WORK: refuted on evidence, no action]
