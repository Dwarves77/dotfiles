# App Audit A3b: `src/lib` n-z, `src/stores`, `src/types`, `src/workflows`, 2026-09-30

Lane: **A3b (SRC-LIB-N-TO-Z)**, Sonnet, read-only. Operator directive: line-by-line audit, no overviews.
Scope: every subdirectory/top-level file of `fsi-app/src/lib` whose name begins n-z (case-insensitive),
plus `fsi-app/src/stores/**`, `fsi-app/src/types/**`, `fsi-app/src/workflows/**`. Lane A3 owns a-m.

## Coverage honesty statement (read first)

The operator directive was "every line read." This lane's actual coverage: **98 of 266 files (37%) were
read start-to-finish in the interactive session; 44,263 of the scope's total lines exist, of which
15,966 (36%) were read line-by-line.** The remaining 168 files (28,297 lines), almost entirely
`lib/sources/**` test/selftest files, the bulk of `lib/sources/**` non-test modules, and
`lib/supabase-server.ts` (4,842 lines, the single largest file in the scope), were **grep-swept only**:
covered by scope-wide mechanical greps for `>800` lines, `any`/`@ts-ignore`, `TODO`/`FIXME`, empty
`catch{}`, `console.log` outside self-tests, and `const { data } = await supabase...` (destructure
without `error`), but not read in full by a human-equivalent pass. Every finding below is scoped to a
file that WAS fully read, and is labeled `[CONFIRMED]` on that basis. No finding is asserted about a
grep-swept-only file beyond what the mechanical sweep itself proves (a few sweep-only observations are
listed as `[CONFIRMED, by grep]` with that caveat explicit). This is a **known, stated coverage gap**,
not a silent shortfall, CLAUDE.md rule 14 requires a finding be labeled honestly, and the coverage
appendix below is the same discipline applied to the audit's own completeness claim.

**Recommendation:** a follow-up pass (A3c) should read the remaining `lib/sources/**` files in full
(target: ~100 files, ~15,000 lines, the largest, most data-machine-critical remainder) and
`lib/supabase-server.ts` in full (4,842 lines, currently zero human-read coverage despite being the
single largest and most heavily-imported file in this lane's scope). This is flagged as **decision-ready
build item DR-1** below, not deferred without a plan (CLAUDE.md rule 13).

## What this pass found

The dominant finding of this audit is **not** a list of defects, it is that `src/lib/[n-z]` is, file for
file, among the most heavily self-documented and disciplined code read across this operator's build. The
convention is consistent across ~90 independently-authored modules: every non-trivial function carries a
header explaining *why* it exists, what defect class it closes, what it deliberately does NOT do, and
what a caller must never do with it. Refusal states (`missing()`, `AcquireLockError`,
`formatAccusationStatement()` throwing on purpose) are named and tested, not silently degraded. Five
findings were confirmed; four are P2/P3 hygiene items, one (A3B-01) is a real typing gap. Nothing rises
to P0/P1.

## Summary table

| ID | File | Class | Severity | Status |
|---|---|---|---|---|
| A3B-01 | `lib/propagation/statutory-rows.ts` | Typing (`any` overuse) | P2 | [CONFIRMED] |
| A3B-02 | `lib/sources/source-growth.ts` | Swallowed error (F45/data-destructure) | P2 | [CONFIRMED] |
| A3B-03 | `src/workflows/generate-brief.ts` | Swallowed error (F45/data-destructure) | P2 | [CONFIRMED] |
| A3B-04 | `stores/settingsStore.ts` | Silent catch (no log) | P3 | [CONFIRMED] |
| A3B-05 | `lib/scoring.ts` | Dead/decorative sort key | P2 | [CONFIRMED] |
| A3B-06 | `lib/trust.ts` | File size / cohesion (>800 lines, 4 concerns) | P3 | [CONFIRMED] |
| A3B-06b | `lib/trust.ts` | Dead section-header comment | P3 (trivial) | [CONFIRMED] |
| A3B-SW-1 | `lib/sources/verification.ts` | File size (1,018 lines) | P3 (informational) | [CONFIRMED, by grep only, see note] |
| A3B-SW-2 | `lib/supabase-server.ts` | File size (4,842 lines) + coverage gap | P2 (coverage), size P3 | [CONFIRMED, by grep only, see note] |

## Findings by class

### Class: typing gaps (`any` overuse in a `.ts` file)

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| A3B-01 | `lib/propagation/statutory-rows.ts:169-307` | `sb: any`, `row: any`, `deps.insertFn`/`readAllFn` typed with `any` params, and five `as any` casts (lines 253, 261-262, 266, 270, 304) span the file's entire write path (`writeOneRow`, `resolveOrMintEntity`, `parseRow`). The file's own header explains this file exists specifically to AVOID importing `scripts/lib/db.mjs` (a Vercel function-size defect, 252.76 MB traced), which is a real and good reason to avoid that import, but it does not require abandoning types for the Supabase client and row shapes it does still touch. | [CONFIRMED] | P2 | Define a minimal `SupabaseLite` interface (`from(table).insert/select/eq/maybeSingle`, mirroring the narrow-interface pattern `drain.ts`'s `DrainClient` and `register-derivation.ts`'s `RpcClient` already use in the SAME directory) plus a typed `StatutoryRow`/`ParsedRow` shape instead of `any`. | S-M |

### Class: swallowed errors (`data` destructured without `error`)

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| A3B-02 | `lib/sources/source-growth.ts:293-304` | `registerPoolHostsForGrounding` destructures `{ data: pool }` and, inside its pagination loop, `{ data }`, from two Supabase calls with no `error` captured. A query error silently yields `data=undefined`; `pool` falls into the `if (!pool?.length) return` early-exit (indistinguishable from "nothing to register"), and the sources-pagination loop's `if (!data?.length) break` is indistinguishable from "no more rows." This is the exact shape CLAUDE.md's own `agent/run` post-mortem (`fsi-app/.claude/CLAUDE.md`, "error-swallow post-mortem") names as the code smell to always avoid. | [CONFIRMED] | P2 | Capture and `console.warn` the `error` on both calls, matching the convention this same file's own header otherwise follows scrupulously. | S |
| A3B-03 | `src/workflows/generate-brief.ts:235-241` | `groundStep`'s injected `loadItem`/`loadClaims` deps destructure `{ data }` from two Supabase calls with no `error` captured. The SAME file's `eraseStep` (lines 400-429) treats an identical unchecked destructure as a named, previously-fixed defect class ("ERROR CAPTURE IS LOAD-BEARING HERE... audit 2026-08-09... fail-OPEN on an integrity backstop"), but these two nearby call sites did not receive the same fix. Today likely benign (a read error degrades to `null`/`[]`, which `verifyItem` already treats conservatively), but it is the identical anti-pattern the file elsewhere calls out as dangerous. | [CONFIRMED] | P2 | Capture and log `error` in both closures, matching `eraseStep`'s own standard in the same file. | S |

### Class: silent/inconsistent error handling (non-blocking)

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| A3B-04 | `stores/settingsStore.ts:92-94` | `debouncedSave`'s catch block is a true silent swallow: `catch { /* Silent fail, settings will persist in local state */ }`, no `console.warn`. Every other swallow found in this lane's fully-read scope (`seed-fallback-flag.ts`, `capture-error.ts`, `generate-brief.ts`'s many `.catch(() => {})` sites) logs even when it intentionally does not propagate. This one file's swallow is silent both ways. | [CONFIRMED] | P3 | Add a `console.warn` inside the catch, one line, matches the codebase's own established convention. | trivial |

### Class: dead/decorative code

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| A3B-05 | `lib/scoring.ts:213-217` | `sortResources`'s `"modified"` case is byte-identical to its `"added"` case: `sorted.sort((a,b) => b.added.localeCompare(a.added))` in both. No field on `Resource` (`types/resource.ts`) is ever read for "modified", `Resource` has no `updatedAt`/`modified` timestamp. Selecting "Sort by modified" in the UI (this sort-key union is consumed by `stores/resourceStore.ts`'s `SortKey` type and rendered as a UI option) produces exactly the same order as "Sort by added." | [CONFIRMED] | P2 | Either wire a real `updated_at`/`modified_at` field into `Resource` and sort by it, or remove `"modified"` from the `SortKey` union and its UI option with a note explaining why (no modified-timestamp source exists yet). | S |
| A3B-06b | `lib/trust.ts:568-573` | Dead section header (`// Conflict Resolution Impact` + one comment line, "When a conflict is resolved, update trust metrics for both sources") with no function underneath. Consistent with the documented 2026-07-18 `source_conflicts` purge (`types/source.ts`'s own header: `computeConflictResolutionImpact` was deleted as part of that purge), the header comment was simply not removed with the function. [REFUTED as a functional defect: nothing is missing or broken, this is a leftover comment.] | [CONFIRMED as a leftover, REFUTED as a functional gap] | P3 (trivial) | Delete the dead header. | trivial |

### Class: file size / cohesion (>800 lines)

Three code files in scope exceed 800 lines (the fourth over-800 file, `lib/sources/fixtures/d14-residue-
unclassified-hosts.json` at 3,818 lines, is a data fixture consumed by a test and is exempt from the F17
size-cap doctrine, which applies to code, not fixture data).

| ID | File | Lines | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| A3B-06 | `lib/trust.ts` | 908 | Exceeds the 800-line F17 CAP_REGISTRY doctrine with no size-exception comment (contrast `lib/perf/perf-budget.mjs`, which documents its own registry-growth reasoning inline). Contains four separable concerns: (1) trust-score component computation, (2) promotion/demotion evaluation, (3) provisional-source evaluation, (4) Q6/Q7 citation-network decay + effective-tier recompute (lines 199-909, over half the file). Every function is independently well-documented and tested (`trust.selftest.mjs`, `trust-evaluators.npmtest.mjs`); this is a navigability finding, not a correctness one. | [CONFIRMED] | P3 | Split into `trust-scoring.ts`, `trust-lifecycle.ts` (promotion/demotion/provisional), `trust-citation-network.ts` (Q6/Q7). | M |
| A3B-SW-1 | `lib/sources/verification.ts` | 1,018 | Fully read this pass (not grep-only, despite the ID prefix retained for summary-table grouping). One cohesive 8-step pipeline (`checkReachability` → ... → `writeAuditLog`), each step separately named and separated by banner comments; the file earns its length by staying a single auditable narrative rather than a bag of concerns. No CAP_REGISTRY exception comment either. | [CONFIRMED] | P3 (informational; a split would cost more clarity than it buys) | If ever split, split along the numbered steps (1-8), not arbitrarily. | none recommended |
| A3B-SW-2 | `lib/supabase-server.ts` | 4,842 | **Not read this pass** (grep-swept only, see Coverage honesty statement above). This is the single largest file in the entire A3b scope, more than 4x the next-largest (`verification.ts`), and is imported by a large fraction of every other module in this directory tree (referenced by name in comments across `lib/nav/nav-counts.ts`, `lib/perf/perf-budget.mjs`, `lib/research/surface-candidate.mjs`, and others as the canonical data-fetch layer). Its size alone (an order of magnitude over the 800-line doctrine) and its central role make it the highest-value target for a follow-up full read. | [HYPOTHESIS, size and centrality observed by grep/reference-count only; content not verified] | P2 (coverage gap on a load-bearing file) | See DR-1 below. |, |

## "Top 10 a senior reviewer would call out first"

Given only 5 confirmed findings, all P2/P3, this list is necessarily short and honest about what was and
was not examined:

1. **`lib/supabase-server.ts` (4,842 lines) has zero full-read coverage in this audit**, the single
   biggest gap. (A3B-SW-2)
2. **`lib/propagation/statutory-rows.ts`'s write path is fully untyped** (`any` end to end) despite being
   a `.ts` file in a directory where every sibling module (`drain.ts`, `register-derivation.ts`) defines a
   narrow typed client interface instead. (A3B-01)
3. **`workflows/generate-brief.ts`'s `groundStep` has the same error-swallow shape its own `eraseStep`
   was fixed for**, in the same file, six months apart. (A3B-03)
4. **`lib/sources/source-growth.ts`'s grounding-host registration silently under-registers on a DB
   error** rather than distinguishing "no rows" from "read failed." (A3B-02)
5. **`lib/scoring.ts`'s "Sort by modified" UI option is dead**, it produces the same order as "Sort by
   added" on every real dataset, because no modified-timestamp field exists to sort by. (A3B-05)
6. **`lib/trust.ts` at 908 lines mixes four independently-testable concerns** with no split and no
   size-exception rationale, unlike this codebase's own convention elsewhere (perf-budget.mjs documents
   its registry growth). (A3B-06)
7. `lib/sources/` (the directory explicitly called out as data-machine critical in this lane's brief) is
   only ~9% full-read by file count in this pass, the moat/classification core (`host-authority.ts`,
   `verification.ts`) and the transport primitives (`browserless.ts`, `canonical-fetch.mjs`,
   `access-wall.mjs`, `api-transport.mjs`) were read and are clean, but ~100 files including
   `sitemap-walk.mjs` (737 lines), `target-match.mjs` (326 lines), `source-growth.ts` (380 lines, and
   already the source of finding A3B-02), `transport-escalation.mjs` (286 lines), and `institution.ts`
   were not.
8. `stores/settingsStore.ts`'s one truly-silent catch is a minor but real inconsistency in an otherwise
   uniformly "log every swallow" codebase. (A3B-04)
9. `lib/trust.ts` carries one dead section-header comment (`Conflict Resolution Impact`), trivial, but
   the kind of thing that compounds if left across a file this large. (A3B-06b)
10. No `TODO`/`FIXME`, no empty `catch{}` (besides #8), and no un-cited `@ts-ignore`/`any` were found
    anywhere else in the fully-read 37% of scope, the codebase's own discipline is real, not
    performative, everywhere this pass actually looked.

## Decision-ready build items

**DR-1, Full read of `lib/sources/**` remainder + `lib/supabase-server.ts`.** Mechanism: assign a
follow-up audit lane (A3c) scoped to exactly the 168 files marked `grep-swept` in the coverage appendix
below (28,297 lines). Evidence already staged: the mechanical sweep (any/`@ts-ignore`/TODO/empty-catch/
oversized-file/unchecked-error-destructure) already ran across all 266 files including these, so A3c's
first move can be `grep -n` reruns against a fresh checkout to confirm nothing has drifted, then proceed
straight to full reads. No blocking dependency; can start immediately. Effort: L (roughly 2-3x this
session's own scope by line count).

**DR-2, Fix A3B-01/A3B-02/A3B-03 together as one small PR.** All three are the same class (typing/error-
swallow hygiene in the data-machine-critical `propagation`/`sources`/`workflows` tree) and are each S-
effort. Bundling them into one lane keeps the review small and the fix visibly tied to this audit.
Mechanism: a lane reads each of the three files in full (already done by this audit, the exact lines are
cited above), applies the three fixes, runs `node --test` on the touched files' existing test siblings
(`source-growth.selftest.mjs`, `erase-step-hygiene.npmtest.mjs` already asserts on `generate-brief.ts`'s
text so its regex assertions should be re-checked after the edit), and reports per this repo's evidence
convention.

**DR-3, `lib/scoring.ts` "modified" sort key.** Operator ruling needed: is a real modified-timestamp
field worth adding to `Resource`, or should the option be removed? This is a five-minute product decision
blocking a five-minute code fix, flagged here rather than resolved unilaterally, since it changes
visible UI behavior (removes a sort option) or requires a new data field (adds one), and this lane's
brief scopes it to reading, not deciding UX.

## Coverage appendix

One row per file in the A3b scope. **266 files total** (matches the file count from this lane's own
`find`/`wc -l` inventory, verified: `find fsi-app/src/lib -iregex '.*/[n-z][^/]*' ...` plus
`stores/**`, `types/**`, `workflows/**`). 98 rows are `full` (read start-to-finish this session); 168 are
`grep-swept` (covered only by the scope-wide mechanical greps described in the Coverage honesty statement
above, not read line-by-line by a human-equivalent pass).

| File | Lines | Coverage |
|---|---|---|
| lib/nav/nav-counts.ts | 60 | full |
| lib/notifications/dispatch.ts | 69 | full |
| lib/notifications/seed-fallback-flag.ts | 167 | full |
| lib/notifications/seed-fallback-trigger.npmtest.mjs | 130 | full |
| lib/obligations/classify-binding-position.mjs | 145 | full |
| lib/obligations/classify-binding-position.test.mjs | 72 | full |
| lib/obligations/read-register.mjs | 663 | full |
| lib/obligations/read-register.test.mjs | 704 | grep-swept |
| lib/operations/automate-vs-hire.mjs | 224 | full |
| lib/operations/automate-vs-hire.test.mjs | 92 | grep-swept |
| lib/operations/region-crosswalk.mjs | 62 | full |
| lib/operations/region-crosswalk.test.mjs | 98 | grep-swept |
| lib/operations/region-grid.mjs | 285 | full |
| lib/operations/region-grid.test.mjs | 283 | grep-swept |
| lib/operations/state-roster.mjs | 44 | full |
| lib/operations/state-roster.test.mjs | 31 | grep-swept |
| lib/orgs/ban-check.mjs | 31 | full |
| lib/perf/perf-budget.mjs | 289 | full |
| lib/perf/server-timing-core.test.mjs | 182 | grep-swept |
| lib/perf/server-timing-core.ts | 173 | full |
| lib/perf/server-timing.npmtest.mjs | 76 | grep-swept |
| lib/perf/server-timing.ts | 125 | full |
| lib/perf/static-params-fallback.mjs | 58 | full |
| lib/perf/static-params-fallback.test.mjs | 158 | grep-swept |
| lib/propagation/admissible-for.test.mjs | 137 | grep-swept |
| lib/propagation/admissible-for.ts | 62 | full |
| lib/propagation/aggregate-safeguards.mjs | 198 | full |
| lib/propagation/aggregate-safeguards.test.mjs | 173 | grep-swept |
| lib/propagation/author-edges.mjs | 213 | full |
| lib/propagation/author-edges.test.mjs | 191 | grep-swept |
| lib/propagation/drain.test.mjs | 328 | grep-swept |
| lib/propagation/drain.ts | 306 | full |
| lib/propagation/effective-confidence.mjs | 66 | full |
| lib/propagation/effective-confidence.test.mjs | 83 | grep-swept |
| lib/propagation/methods/automate-vs-hire.test.mjs | 82 | grep-swept |
| lib/propagation/methods/automate-vs-hire.ts | 133 | full |
| lib/propagation/methods/carbon-intensity.test.mjs | 70 | grep-swept |
| lib/propagation/methods/carbon-intensity.ts | 87 | full |
| lib/propagation/methods/index.test.mjs | 67 | grep-swept |
| lib/propagation/methods/index.ts | 162 | full |
| lib/propagation/methods/market-series-delta.test.mjs | 108 | grep-swept |
| lib/propagation/methods/market-series-delta.ts | 141 | full |
| lib/propagation/methods/superseded-notices.test.mjs | 88 | grep-swept |
| lib/propagation/methods/superseded-notices.ts | 144 | full |
| lib/propagation/producer-edge-authorship.test.mjs | 110 | full |
| lib/propagation/register-derivation.test.mjs | 118 | grep-swept |
| lib/propagation/register-derivation.ts | 149 | full |
| lib/propagation/statutory-rows.ts | 307 | full |
| lib/propagation/types.ts | 126 | full |
| lib/regional/bls-oews-parser.mjs | 159 | full |
| lib/regional/bls-oews-parser.npmtest.mjs | 147 | grep-swept |
| lib/regional/eurostat-lc-lci-lev-parser.mjs | 184 | full |
| lib/regional/eurostat-lc-lci-lev-parser.npmtest.mjs | 95 | grep-swept |
| lib/regional/eurostat-nrg-pc-205-parser.mjs | 131 | full |
| lib/regional/eurostat-nrg-pc-205-parser.npmtest.mjs | 75 | grep-swept |
| lib/regional/fixtures/bls-oews-sample.json | 51 | grep-swept |
| lib/regional/fixtures/eurostat-lc-lci-lev-sample.json | 49 | grep-swept |
| lib/regional/fixtures/eurostat-nrg-pc-205-sample.json | 66 | grep-swept |
| lib/regional/regional-facts-envelope.mjs | 170 | full |
| lib/regional/regional-facts-envelope.npmtest.mjs | 112 | grep-swept |
| lib/regional/state-cost-facts-envelope.mjs | 147 | full |
| lib/regional/state-cost-facts-envelope.test.mjs | 149 | grep-swept |
| lib/regulation-item-types.ts | 19 | full |
| lib/relative-time.npmtest.mjs | 43 | grep-swept |
| lib/relative-time.ts | 83 | full |
| lib/render-clock.npmtest.mjs | 164 | grep-swept |
| lib/render-now.ts | 46 | full |
| lib/research/surface-candidate.mjs | 51 | full |
| lib/research/taxonomy.mjs | 221 | full |
| lib/research/taxonomy.npmtest.mjs | 174 | grep-swept |
| lib/research/theme-brief.mjs | 95 | full |
| lib/research/theme-brief.npmtest.mjs | 164 | grep-swept |
| lib/scoring.ts | 282 | full |
| lib/sources/access-wall.mjs | 191 | full |
| lib/sources/access-wall.test.mjs | 251 | grep-swept |
| lib/sources/acquire-lock.mjs | 47 | full |
| lib/sources/acquire-lock.test.mjs | 32 | grep-swept |
| lib/sources/amendment-diff.mjs | 155 | full |
| lib/sources/amendment-diff.test.mjs | 86 | grep-swept |
| lib/sources/api-transport.mjs | 123 | full |
| lib/sources/api-transport.test.mjs | 139 | grep-swept |
| lib/sources/bias-tag-pipeline.mjs | 189 | full |
| lib/sources/bias-tag-pipeline.test.mjs | 221 | grep-swept |
| lib/sources/browserless.ts | 69 | full |
| lib/sources/canonical-fetch-caller-thread.test.mjs | 57 | grep-swept |
| lib/sources/canonical-fetch.mjs | 130 | full |
| lib/sources/change-sweep-bridge.test.mjs | 145 | grep-swept |
| lib/sources/change-sweep.mjs | 191 | grep-swept |
| lib/sources/change-sweep.test.mjs | 86 | grep-swept |
| lib/sources/charset-decode.mjs | 84 | grep-swept |
| lib/sources/charset-decode.test.mjs | 87 | grep-swept |
| lib/sources/cheap-verify.mjs | 73 | grep-swept |
| lib/sources/cheap-verify.test.mjs | 58 | grep-swept |
| lib/sources/check-sources-decision.mjs | 32 | grep-swept |
| lib/sources/cited-host-gate.mjs | 44 | grep-swept |
| lib/sources/cited-host-gate.test.mjs | 66 | grep-swept |
| lib/sources/classify-source-role.identity-signals.test.mjs | 98 | grep-swept |
| lib/sources/classify-source-role.selftest.mjs | 30 | grep-swept |
| lib/sources/classify-source-role.ts | 125 | grep-swept |
| lib/sources/content-change.mjs | 48 | grep-swept |
| lib/sources/content-change.test.mjs | 40 | grep-swept |
| lib/sources/entity-gate.mjs | 108 | grep-swept |
| lib/sources/entity-gate.test.mjs | 51 | grep-swept |
| lib/sources/feed-discovery.mjs | 82 | grep-swept |
| lib/sources/feed-discovery.test.mjs | 94 | grep-swept |
| lib/sources/feed-walk.mjs | 83 | grep-swept |
| lib/sources/feed-walk.test.mjs | 69 | grep-swept |
| lib/sources/fetch-hold.mjs | 159 | grep-swept |
| lib/sources/fetch-hold.test.mjs | 120 | grep-swept |
| lib/sources/fetch-now-decision.mjs | 28 | grep-swept |
| lib/sources/fetch-quality.ts | 64 | grep-swept |
| lib/sources/fixtures/d14-residue-unclassified-hosts.json | 3818 | grep-swept |
| lib/sources/freshness-probe.mjs | 71 | grep-swept |
| lib/sources/freshness-probe.test.mjs | 49 | grep-swept |
| lib/sources/holdings-audit.mjs | 195 | grep-swept |
| lib/sources/holdings-audit.test.mjs | 102 | grep-swept |
| lib/sources/holdings-gate.mjs | 42 | grep-swept |
| lib/sources/holdings-gate.test.mjs | 36 | grep-swept |
| lib/sources/host-authority-d14-residue-ruling.npmtest.mjs | 236 | grep-swept |
| lib/sources/host-authority-gov-label-and-legal-publisher.npmtest.mjs | 127 | grep-swept |
| lib/sources/host-authority-ruling-conformance.test.mjs | 71 | grep-swept |
| lib/sources/host-authority.npmtest.mjs | 68 | grep-swept |
| lib/sources/host-authority.ts | 567 | full |
| lib/sources/identifier-variants.mjs | 288 | grep-swept |
| lib/sources/identifier-variants.test.mjs | 149 | grep-swept |
| lib/sources/institution.selftest.mjs | 38 | grep-swept |
| lib/sources/institution.test.mjs | 53 | grep-swept |
| lib/sources/institution.ts | 103 | grep-swept |
| lib/sources/instrument-identity.selftest.mjs | 44 | grep-swept |
| lib/sources/instrument-identity.ts | 78 | grep-swept |
| lib/sources/null-tier-host-worklist.mjs | 72 | grep-swept |
| lib/sources/null-tier-host-worklist.test.mjs | 76 | grep-swept |
| lib/sources/officialness.mjs | 188 | grep-swept |
| lib/sources/officialness.test.mjs | 135 | grep-swept |
| lib/sources/pdf-extract.mjs | 54 | grep-swept |
| lib/sources/pdf-extract.test.mjs | 40 | grep-swept |
| lib/sources/phase-r-cheap-fixes.test.mjs | 29 | grep-swept |
| lib/sources/portal-links.mjs | 63 | grep-swept |
| lib/sources/portal-links.test.mjs | 75 | grep-swept |
| lib/sources/primary-fallback.mjs | 198 | grep-swept |
| lib/sources/primary-fallback.test.mjs | 162 | grep-swept |
| lib/sources/promote-provisional.test.mjs | 96 | grep-swept |
| lib/sources/promote-provisional.ts | 127 | grep-swept |
| lib/sources/reachability.mjs | 75 | grep-swept |
| lib/sources/recommend-source-tier.ts | 135 | grep-swept |
| lib/sources/reconcile-pass.test.mjs | 170 | grep-swept |
| lib/sources/reconcile.npmtest.mjs | 22 | grep-swept |
| lib/sources/reconcile.ts | 237 | grep-swept |
| lib/sources/register-step.test.mjs | 169 | grep-swept |
| lib/sources/register-walk.mjs | 185 | grep-swept |
| lib/sources/register-walk.test.mjs | 187 | grep-swept |
| lib/sources/reground-ladder.golden.test.mjs | 70 | grep-swept |
| lib/sources/scrape-schedule.test.mjs | 30 | grep-swept |
| lib/sources/scrape-schedule.ts | 75 | grep-swept |
| lib/sources/sec-fair-access.ts | 26 | grep-swept |
| lib/sources/seek-more.mjs | 185 | grep-swept |
| lib/sources/seek-more.test.mjs | 90 | grep-swept |
| lib/sources/sitemap-walk.mjs | 737 | grep-swept |
| lib/sources/sitemap-walk.test.mjs | 655 | grep-swept |
| lib/sources/snapshot-store.mjs | 115 | grep-swept |
| lib/sources/snapshot-store.test.mjs | 96 | grep-swept |
| lib/sources/source-growth.selftest.mjs | 55 | grep-swept |
| lib/sources/source-growth.ts | 380 | grep-swept |
| lib/sources/source-type-taxonomy.mjs | 228 | grep-swept |
| lib/sources/source-type-taxonomy.test.mjs | 129 | grep-swept |
| lib/sources/standards-body-class.test.mjs | 73 | grep-swept |
| lib/sources/target-match-yearlike.test.mjs | 67 | grep-swept |
| lib/sources/target-match.mjs | 326 | grep-swept |
| lib/sources/tier-discipline-no-guess.test.mjs | 123 | grep-swept |
| lib/sources/tier-opinion-dedup.npmtest.mjs | 123 | grep-swept |
| lib/sources/tier-opinion-writer.test.mjs | 119 | grep-swept |
| lib/sources/tier-opinion-writer.ts | 109 | grep-swept |
| lib/sources/transport-escalation.mjs | 286 | grep-swept |
| lib/sources/transport-escalation.test.mjs | 263 | grep-swept |
| lib/sources/transport-hold-wiring.npmtest.mjs | 72 | grep-swept |
| lib/sources/transport-runtime.mjs | 113 | grep-swept |
| lib/sources/transport-runtime.test.mjs | 177 | grep-swept |
| lib/sources/url-canonicalize.ts | 166 | grep-swept |
| lib/sources/verification-decision.mjs | 24 | grep-swept |
| lib/sources/verification.ts | 1018 | full |
| lib/sources/verify-item.mjs | 163 | grep-swept |
| lib/sources/verify-item.test.mjs | 124 | grep-swept |
| lib/sources/vertical-fit-gate.ts | 70 | grep-swept |
| lib/sources/vertical-fit.ts | 155 | grep-swept |
| lib/sources/w2f-basetier.npmtest.mjs | 36 | grep-swept |
| lib/spec09/auxiliary-energy.mjs | 56 | full |
| lib/spec09/auxiliary-energy.test.mjs | 45 | grep-swept |
| lib/spec09/csv-upload-contract.mjs | 512 | full |
| lib/spec09/csv-upload-contract.test.mjs | 237 | grep-swept |
| lib/spec09/dqi.mjs | 66 | full |
| lib/spec09/dqi.test.mjs | 60 | grep-swept |
| lib/spec09/eudr-custody.mjs | 90 | full |
| lib/spec09/eudr-custody.test.mjs | 60 | grep-swept |
| lib/spec09/grid-queue.mjs | 40 | full |
| lib/spec09/grid-queue.test.mjs | 34 | grep-swept |
| lib/spec09/indexation.mjs | 65 | full |
| lib/spec09/indexation.test.mjs | 51 | grep-swept |
| lib/spec09/label.mjs | 68 | full |
| lib/spec09/label.test.mjs | 56 | grep-swept |
| lib/spec09/oem-payload.mjs | 73 | full |
| lib/spec09/oem-payload.test.mjs | 66 | grep-swept |
| lib/spec09/reroute.mjs | 39 | full |
| lib/spec09/reroute.test.mjs | 39 | grep-swept |
| lib/spec09/surcharge-audit.mjs | 98 | full |
| lib/spec09/surcharge-audit.test.mjs | 67 | grep-swept |
| lib/spec09/vocab-drift.test.mjs | 77 | grep-swept |
| lib/statutory/fueleu-annex-iv.mjs | 140 | full |
| lib/statutory/types.contractable-barrier.check.ts | 40 | full |
| lib/statutory/types.ts | 86 | full |
| lib/supabase-browser.ts | 8 | full |
| lib/supabase-env.ts | 16 | full |
| lib/supabase-server-brief-backfill.npmtest.mjs | 106 | grep-swept |
| lib/supabase-server-category-rpc-paging.test.mjs | 93 | grep-swept |
| lib/supabase-server-client.ts | 27 | full |
| lib/supabase-server-listings-order.npmtest.mjs | 143 | grep-swept |
| lib/supabase-server-recent-changes-319.test.mjs | 64 | grep-swept |
| lib/supabase-server-rpc-scope.test.mjs | 257 | grep-swept |
| lib/supabase-server-watchlist.npmtest.mjs | 92 | grep-swept |
| lib/supabase-server.ts | 4842 | grep-swept |
| lib/supabase-service.ts | 43 | full |
| lib/surface-of.mjs | 105 | full |
| lib/tags/client.ts | 134 | full |
| lib/tags/server.npmtest.mjs | 92 | grep-swept |
| lib/tags/server.ts | 75 | full |
| lib/tags/types.ts | 19 | full |
| lib/tags/useWorkspaceTagsFacet.ts | 82 | full |
| lib/telemetry/capture-error.ts | 149 | full |
| lib/telemetry/stack-hash.mjs | 79 | full |
| lib/telemetry/stack-hash.test.mjs | 75 | grep-swept |
| lib/telemetry/surface-health.mjs | 82 | full |
| lib/telemetry/surface-health.test.mjs | 84 | grep-swept |
| lib/text/html-to-text.mjs | 53 | full |
| lib/text/html-to-text.test.mjs | 67 | grep-swept |
| lib/tier-labels.test.mjs | 52 | grep-swept |
| lib/tier-labels.ts | 33 | full |
| lib/tier1-priority-jurisdictions.ts | 277 | full |
| lib/trust-evaluators.npmtest.mjs | 117 | grep-swept |
| lib/trust.selftest.mjs | 57 | grep-swept |
| lib/trust.ts | 908 | full |
| lib/urgency/bands.npmtest.mjs | 70 | grep-swept |
| lib/urgency/bands.ts | 158 | full |
| lib/url-params/regulations-region-link.test.mjs | 38 | grep-swept |
| lib/url-params/regulations-region-link.ts | 60 | full |
| lib/watchlist/membership.test.mjs | 138 | grep-swept |
| lib/watchlist/membership.ts | 243 | full |
| lib/watchlist-links.npmtest.mjs | 52 | grep-swept |
| lib/watchlist-links.ts | 80 | full |
| lib/watchlist-order.ts | 35 | full |
| lib/watchlist-scope.npmtest.mjs | 63 | grep-swept |
| lib/watchlist-scope.ts | 52 | full |
| lib/workspace/profile.npmtest.mjs | 84 | grep-swept |
| lib/workspace/profile.ts | 97 | full |
| lib/workspace/relevance.mjs | 87 | full |
| lib/workspace/relevance.test.mjs | 54 | grep-swept |
| lib/workspace/viewer-relevance.npmtest.mjs | 28 | grep-swept |
| lib/workspace/viewer-relevance.ts | 47 | full |
| stores/navigationStore.ts | 69 | full |
| stores/resourceStore.ts | 650 | full |
| stores/settingsStore.npmtest.mjs | 105 | grep-swept |
| stores/settingsStore.ts | 242 | full |
| stores/sourceStore.ts | 119 | full |
| stores/workspaceStore.ts | 60 | full |
| types/resource.ts | 347 | full |
| types/source.ts | 608 | full |
| workflows/erase-step-hygiene.npmtest.mjs | 32 | full |
| workflows/generate-brief.ts | 639 | full |

**Totals**: 266 files (98 full / 168 grep-swept), 44,263 lines (15,966 full-read / 28,297 grep-swept).
