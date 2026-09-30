# App Audit A3b: `src/lib` n-z, `src/stores`, `src/types`, `src/workflows`, 2026-09-30

Lane: **A3b (SRC-LIB-N-TO-Z)**, Sonnet, read-only. Operator directive: line-by-line audit, no overviews.
Scope: every subdirectory/top-level file of `fsi-app/src/lib` whose name begins n-z (case-insensitive),
plus `fsi-app/src/stores/**`, `fsi-app/src/types/**`, `fsi-app/src/workflows/**`. Lane A3 owns a-m.

## Coverage honesty statement (read first)

**Superseded 2026-09-30 (same day, coordinator directive).** The first pass of this audit read 98 of 266
files (37%) start-to-finish and grep-swept the remaining 168 (28,297 lines), stating that gap openly
below the original version of this section. The coordinator ruled that a grep sweep does not satisfy the
operator's "every line read" directive: *"168 files grep-swept is not read."* This lane then read all 168
remaining files first line to last, in full, in this same session. **All 266 files (44,263 lines) are now
read in full.** The coverage appendix below reflects that: every row reads `full`, none read `grep-swept`.
The mechanical greps (`>800` lines, `any`/`@ts-ignore`, `TODO`/`FIXME`, empty `catch{}`,
`const { data } = await supabase...`) that covered the 168 files in the first pass are superseded by the
line-by-line read, not relied on for any finding below.

One new finding (A3B-07, `lib/sources/officialness.mjs`) was found and empirically verified during the
completion pass, see the Findings by class and Top 10 sections. A3B-SW-1 and A3B-SW-2 (previously the
grep-only entries for `verification.ts` and `supabase-server.ts`) are retired as separate rows: both
files are now fully read, `verification.ts` unchanged from its original (already-full) finding, and
`supabase-server.ts` (4,842 lines) read clean, no new finding beyond its already-noted size.

## What this pass found

The dominant finding of this audit is **not** a list of defects, it is that `src/lib/[n-z]` is, file for
file, among the most heavily self-documented and disciplined code read across this operator's build. The
convention is consistent across the great majority of independently-authored modules in scope: every
non-trivial function carries a header explaining *why* it exists, what defect class it closes, what it
deliberately does NOT do, and what a caller must never do with it. Refusal states (`missing()`,
`AcquireLockError`, `formatAccusationStatement()` throwing on purpose) are named and tested, not silently
degraded. Six findings were confirmed; five are P2/P3 hygiene items. One (A3B-07) is a real P1 moat defect
in `lib/sources/officialness.mjs` found during the full-coverage completion pass, see below. Nothing else
rises to P0/P1.

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
| A3B-SW-1 | `lib/sources/verification.ts` | File size (1,018 lines) | P3 (informational) | [CONFIRMED] |
| A3B-07 | `lib/sources/officialness.mjs` | Broken block-splitter: STEP 2 link/text-density drop is a structural no-op | P1 | [CONFIRMED, by repro] |

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
| A3B-SW-1 | `lib/sources/verification.ts` | 1,018 | One cohesive 8-step pipeline (`checkReachability` → ... → `writeAuditLog`), each step separately named and separated by banner comments; the file earns its length by staying a single auditable narrative rather than a bag of concerns. No CAP_REGISTRY exception comment either. | [CONFIRMED] | P3 (informational; a split would cost more clarity than it buys) | If ever split, split along the numbered steps (1-8), not arbitrarily. | none recommended |
| (info) | `lib/supabase-server.ts` | 4,842 | Read in full this session (the completion pass). The single largest file in the entire A3b scope, more than 4x the next-largest (`verification.ts`), and is imported by a large fraction of every other module in this directory tree. Read cohesively as roughly 20 independently-documented fetchers (dashboard/listings/category-routing/watchlist/market-series/operations-coverage/single-item-detail), each carrying its own defect-history header comment; no new defect found beyond its size. No CAP_REGISTRY exception comment. | [CONFIRMED, full read] | P3 (informational; size only, no correctness defect) | If ever split, split along the fetcher groups (dashboard-family / category-routing / watchlist / market / operations), not arbitrarily. | none recommended (would cost re-import churn across every calling route for a purely organizational gain) |

### Class: moat defect (broken block-level parser silently disables a documented anti-fabrication check)

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| A3B-07 | `lib/sources/officialness.mjs:` `splitBlocks()` | `splitBlocks(html)` is documented as splitting cleaned HTML into per-block units for `cleanBodyOf()`'s STEP 2 (section 2.2) link/text-density drop, the module's own second line of defense against link-list/menu chrome NOT already removed by the container-level `structuralStrip()`. Its final operation is `.split("")`, this splits the string into **individual characters**, not HTML blocks (`.replace(...).replace(...).split("")`, the closing-tag replace never inserts a delimiter before the character-split runs). Verified empirically: running the extracted function body under `node -e` against a sample `<ul class="link-list">...</ul>` block (124 chars) returned 124 one-character "blocks" (`["<","u","l"," ","c",...]`). STEP 2's own drop conditions (`linkDensity >= LINK_DENSITY_MAX` or `ink < 30 && anchorInk > 0 && tagCount >= 2`) require multi-character content (a real `<a>` tag, more than one tag) that cannot exist inside a single character, so STEP 2 can **never fire on any input**, it is a structural no-op, not a narrow miss. Reproduced the downstream consequence directly: feeding a `<ul class="link-list">` menu block (a class name that does NOT match `structuralStrip()`'s keyword regex `menu\|breadcrumb\|cookie\|banner\|sidebar\|footer\|skip-?link`) through a simplified `cleanBodyOf()` leaked the raw markup into `cleanBody` as literal, character-spaced text (`< u l  c l a s s = " l i n k - l i s t " > ...`). The module's own file header names its purpose as ensuring "the span-match (4b) and the primary-FACT decision run against the INSTRUMENT BODY, not the chrome" and states the moat guarantee "Never fabricate a floor stamp. A span absent from the CLEAN body keeps its honest attribution." For chrome outside a recognized container/class, that guarantee silently fails, a FACT span can match nav/menu chrome exactly the "RED-1" defect class the module exists to close. `officialness.test.mjs`'s RED-1/RED-2/GREEN fixtures all wrap chrome in `<nav>`/`<header>`/`<footer>` (caught by the still-working container-level strip), so no shipped test exercises a link-list/menu block outside those containers, the bug is invisible to the current test suite/CI. | [CONFIRMED, by repro, `node -e` execution of the extracted function body, and a simplified `cleanBodyOf()` reproduction of the downstream leak] | P1 | Insert a delimiter before the closing-tag replace runs (e.g. `.replace(/<\/(p\|li\|ul\|ol\|div\|section\|article\|main\|tr\|table\|h[1-6]\|blockquote\|dd\|dt\|figcaption)\s*>/gi, "\u0000")` then `.split("\u0000")`), or split on block-opening tags instead. Add a regression test fixture with an un-wrapped, non-keyword-classed link list (e.g. class `"quick-links"` or `"related-docs"`) so the fixed STEP 2 behavior has real coverage; the current RED-1/RED-2/GREEN fixtures would not have caught this. | S for the fix; M once a proper fixture + regression test are added (recommended in the same change) |

## "Top 10 a senior reviewer would call out first"

All 266 files (44,263 lines) are now read in full. Seven confirmed findings, one P1, six P2/P3:

1. **`lib/sources/officialness.mjs`'s STEP 2 link/text-density drop is a structural no-op**, its
   `splitBlocks()` ends in `.split("")`, splitting the string into individual characters rather than HTML
   blocks, so the density-drop conditions (which need multi-character content) can never fire. For
   chrome not already caught by the container-level strip, this reopens the exact "FACT span matches nav
   chrome" defect class the module was built to close. Verified by repro (`node -e`), not just read.
   (A3B-07, P1, the highest-severity finding of this audit)
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
7. **`lib/supabase-server.ts` (4,842 lines) read clean.** The single largest file in scope, now fully
   read: roughly 20 independently-documented fetchers, each carrying its own defect-history header
   comment (SF-1/SF-2, PERF-5/10/11/12/13, CAP-1000, D23, lane duenext/briefdata, and others already
   fixed in place, with the fix's own rationale left in the comment). No new defect found; size-only,
   informational.
8. `stores/settingsStore.ts`'s one truly-silent catch is a minor but real inconsistency in an otherwise
   uniformly "log every swallow" codebase. (A3B-04)
9. `lib/trust.ts` carries one dead section-header comment (`Conflict Resolution Impact`), trivial, but
   the kind of thing that compounds if left across a file this large. (A3B-06b)
10. No `TODO`/`FIXME`, no empty `catch{}` (besides #8), and no un-cited `@ts-ignore`/`any` were found
    anywhere else in the now-fully-read scope besides A3B-01/A3B-07, the codebase's own discipline is
    real, not performative, everywhere this pass looked, including the 168 files added by the completion
    pass.

## Decision-ready build items

**DR-1 (RETIRED, satisfied this session).** The original DR-1 ("full read of `lib/sources/**` remainder +
`lib/supabase-server.ts`") called for a follow-up lane (A3c) to read the 168 grep-swept files. The
coordinator instead directed this same lane to complete that read in-session (2026-09-30); it is done -
all 266 files are read in full, see the Coverage honesty statement above. No follow-up lane is needed for
coverage; A3B-07 (found during the completion pass) is tracked as its own fix, not folded into DR-2 below
since it is a different class (moat defect, not typing/error-swallow hygiene) and P1 severity warrants its
own review rather than bundling.

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

**DR-4, Fix A3B-07 (`lib/sources/officialness.mjs` STEP 2 no-op).** P1, moat-affecting, found and
confirmed-by-repro during the completion pass. Mechanism: fix `splitBlocks()` to insert a delimiter
before the closing-tag replace (or split on block-opening tags) so STEP 2's link/text-density drop can
actually see multi-character blocks; add a regression fixture with an un-wrapped, non-keyword-classed
link list (e.g. class `"quick-links"`) alongside the existing RED-1/RED-2/GREEN cases in
`officialness.test.mjs`, since none of the current fixtures would have caught this. Effort: S for the
fix, M once the new fixture + test are added (recommended in the same change, per the fix itself).
Recommend a dedicated review given the severity (P1, an anti-fabrication moat component) rather than
bundling with DR-2's lower-severity hygiene fixes.

## Coverage appendix

One row per file in the A3b scope. **266 files total** (matches the file count from this lane's own
`find`/`wc -l` inventory, verified: `find fsi-app/src/lib -iregex '.*/[n-z][^/]*' ...` plus
`stores/**`, `types/**`, `workflows/**`). **All 266 rows read `full`**, the original 98 read in the first
pass, plus the 168 read in this session's completion pass per the coordinator's directive (see the
Coverage honesty statement above). No row reads `grep-swept` any longer.

| File | Lines | Coverage |
|---|---|---|
| lib/nav/nav-counts.ts | 60 | full |
| lib/notifications/dispatch.ts | 69 | full |
| lib/notifications/seed-fallback-flag.ts | 167 | full |
| lib/notifications/seed-fallback-trigger.npmtest.mjs | 130 | full |
| lib/obligations/classify-binding-position.mjs | 145 | full |
| lib/obligations/classify-binding-position.test.mjs | 72 | full |
| lib/obligations/read-register.mjs | 663 | full |
| lib/obligations/read-register.test.mjs | 704 | full |
| lib/operations/automate-vs-hire.mjs | 224 | full |
| lib/operations/automate-vs-hire.test.mjs | 92 | full |
| lib/operations/region-crosswalk.mjs | 62 | full |
| lib/operations/region-crosswalk.test.mjs | 98 | full |
| lib/operations/region-grid.mjs | 285 | full |
| lib/operations/region-grid.test.mjs | 283 | full |
| lib/operations/state-roster.mjs | 44 | full |
| lib/operations/state-roster.test.mjs | 31 | full |
| lib/orgs/ban-check.mjs | 31 | full |
| lib/perf/perf-budget.mjs | 289 | full |
| lib/perf/server-timing-core.test.mjs | 182 | full |
| lib/perf/server-timing-core.ts | 173 | full |
| lib/perf/server-timing.npmtest.mjs | 76 | full |
| lib/perf/server-timing.ts | 125 | full |
| lib/perf/static-params-fallback.mjs | 58 | full |
| lib/perf/static-params-fallback.test.mjs | 158 | full |
| lib/propagation/admissible-for.test.mjs | 137 | full |
| lib/propagation/admissible-for.ts | 62 | full |
| lib/propagation/aggregate-safeguards.mjs | 198 | full |
| lib/propagation/aggregate-safeguards.test.mjs | 173 | full |
| lib/propagation/author-edges.mjs | 213 | full |
| lib/propagation/author-edges.test.mjs | 191 | full |
| lib/propagation/drain.test.mjs | 328 | full |
| lib/propagation/drain.ts | 306 | full |
| lib/propagation/effective-confidence.mjs | 66 | full |
| lib/propagation/effective-confidence.test.mjs | 83 | full |
| lib/propagation/methods/automate-vs-hire.test.mjs | 82 | full |
| lib/propagation/methods/automate-vs-hire.ts | 133 | full |
| lib/propagation/methods/carbon-intensity.test.mjs | 70 | full |
| lib/propagation/methods/carbon-intensity.ts | 87 | full |
| lib/propagation/methods/index.test.mjs | 67 | full |
| lib/propagation/methods/index.ts | 162 | full |
| lib/propagation/methods/market-series-delta.test.mjs | 108 | full |
| lib/propagation/methods/market-series-delta.ts | 141 | full |
| lib/propagation/methods/superseded-notices.test.mjs | 88 | full |
| lib/propagation/methods/superseded-notices.ts | 144 | full |
| lib/propagation/producer-edge-authorship.test.mjs | 110 | full |
| lib/propagation/register-derivation.test.mjs | 118 | full |
| lib/propagation/register-derivation.ts | 149 | full |
| lib/propagation/statutory-rows.ts | 307 | full |
| lib/propagation/types.ts | 126 | full |
| lib/regional/bls-oews-parser.mjs | 159 | full |
| lib/regional/bls-oews-parser.npmtest.mjs | 147 | full |
| lib/regional/eurostat-lc-lci-lev-parser.mjs | 184 | full |
| lib/regional/eurostat-lc-lci-lev-parser.npmtest.mjs | 95 | full |
| lib/regional/eurostat-nrg-pc-205-parser.mjs | 131 | full |
| lib/regional/eurostat-nrg-pc-205-parser.npmtest.mjs | 75 | full |
| lib/regional/fixtures/bls-oews-sample.json | 51 | full |
| lib/regional/fixtures/eurostat-lc-lci-lev-sample.json | 49 | full |
| lib/regional/fixtures/eurostat-nrg-pc-205-sample.json | 66 | full |
| lib/regional/regional-facts-envelope.mjs | 170 | full |
| lib/regional/regional-facts-envelope.npmtest.mjs | 112 | full |
| lib/regional/state-cost-facts-envelope.mjs | 147 | full |
| lib/regional/state-cost-facts-envelope.test.mjs | 149 | full |
| lib/regulation-item-types.ts | 19 | full |
| lib/relative-time.npmtest.mjs | 43 | full |
| lib/relative-time.ts | 83 | full |
| lib/render-clock.npmtest.mjs | 164 | full |
| lib/render-now.ts | 46 | full |
| lib/research/surface-candidate.mjs | 51 | full |
| lib/research/taxonomy.mjs | 221 | full |
| lib/research/taxonomy.npmtest.mjs | 174 | full |
| lib/research/theme-brief.mjs | 95 | full |
| lib/research/theme-brief.npmtest.mjs | 164 | full |
| lib/scoring.ts | 282 | full |
| lib/sources/access-wall.mjs | 191 | full |
| lib/sources/access-wall.test.mjs | 251 | full |
| lib/sources/acquire-lock.mjs | 47 | full |
| lib/sources/acquire-lock.test.mjs | 32 | full |
| lib/sources/amendment-diff.mjs | 155 | full |
| lib/sources/amendment-diff.test.mjs | 86 | full |
| lib/sources/api-transport.mjs | 123 | full |
| lib/sources/api-transport.test.mjs | 139 | full |
| lib/sources/bias-tag-pipeline.mjs | 189 | full |
| lib/sources/bias-tag-pipeline.test.mjs | 221 | full |
| lib/sources/browserless.ts | 69 | full |
| lib/sources/canonical-fetch-caller-thread.test.mjs | 57 | full |
| lib/sources/canonical-fetch.mjs | 130 | full |
| lib/sources/change-sweep-bridge.test.mjs | 145 | full |
| lib/sources/change-sweep.mjs | 191 | full |
| lib/sources/change-sweep.test.mjs | 86 | full |
| lib/sources/charset-decode.mjs | 84 | full |
| lib/sources/charset-decode.test.mjs | 87 | full |
| lib/sources/cheap-verify.mjs | 73 | full |
| lib/sources/cheap-verify.test.mjs | 58 | full |
| lib/sources/check-sources-decision.mjs | 32 | full |
| lib/sources/cited-host-gate.mjs | 44 | full |
| lib/sources/cited-host-gate.test.mjs | 66 | full |
| lib/sources/classify-source-role.identity-signals.test.mjs | 98 | full |
| lib/sources/classify-source-role.selftest.mjs | 30 | full |
| lib/sources/classify-source-role.ts | 125 | full |
| lib/sources/content-change.mjs | 48 | full |
| lib/sources/content-change.test.mjs | 40 | full |
| lib/sources/entity-gate.mjs | 108 | full |
| lib/sources/entity-gate.test.mjs | 51 | full |
| lib/sources/feed-discovery.mjs | 82 | full |
| lib/sources/feed-discovery.test.mjs | 94 | full |
| lib/sources/feed-walk.mjs | 83 | full |
| lib/sources/feed-walk.test.mjs | 69 | full |
| lib/sources/fetch-hold.mjs | 159 | full |
| lib/sources/fetch-hold.test.mjs | 120 | full |
| lib/sources/fetch-now-decision.mjs | 28 | full |
| lib/sources/fetch-quality.ts | 64 | full |
| lib/sources/fixtures/d14-residue-unclassified-hosts.json | 3818 | full |
| lib/sources/freshness-probe.mjs | 71 | full |
| lib/sources/freshness-probe.test.mjs | 49 | full |
| lib/sources/holdings-audit.mjs | 195 | full |
| lib/sources/holdings-audit.test.mjs | 102 | full |
| lib/sources/holdings-gate.mjs | 42 | full |
| lib/sources/holdings-gate.test.mjs | 36 | full |
| lib/sources/host-authority-d14-residue-ruling.npmtest.mjs | 236 | full |
| lib/sources/host-authority-gov-label-and-legal-publisher.npmtest.mjs | 127 | full |
| lib/sources/host-authority-ruling-conformance.test.mjs | 71 | full |
| lib/sources/host-authority.npmtest.mjs | 68 | full |
| lib/sources/host-authority.ts | 567 | full |
| lib/sources/identifier-variants.mjs | 288 | full |
| lib/sources/identifier-variants.test.mjs | 149 | full |
| lib/sources/institution.selftest.mjs | 38 | full |
| lib/sources/institution.test.mjs | 53 | full |
| lib/sources/institution.ts | 103 | full |
| lib/sources/instrument-identity.selftest.mjs | 44 | full |
| lib/sources/instrument-identity.ts | 78 | full |
| lib/sources/null-tier-host-worklist.mjs | 72 | full |
| lib/sources/null-tier-host-worklist.test.mjs | 76 | full |
| lib/sources/officialness.mjs | 188 | full |
| lib/sources/officialness.test.mjs | 135 | full |
| lib/sources/pdf-extract.mjs | 54 | full |
| lib/sources/pdf-extract.test.mjs | 40 | full |
| lib/sources/phase-r-cheap-fixes.test.mjs | 29 | full |
| lib/sources/portal-links.mjs | 63 | full |
| lib/sources/portal-links.test.mjs | 75 | full |
| lib/sources/primary-fallback.mjs | 198 | full |
| lib/sources/primary-fallback.test.mjs | 162 | full |
| lib/sources/promote-provisional.test.mjs | 96 | full |
| lib/sources/promote-provisional.ts | 127 | full |
| lib/sources/reachability.mjs | 75 | full |
| lib/sources/recommend-source-tier.ts | 135 | full |
| lib/sources/reconcile-pass.test.mjs | 170 | full |
| lib/sources/reconcile.npmtest.mjs | 22 | full |
| lib/sources/reconcile.ts | 237 | full |
| lib/sources/register-step.test.mjs | 169 | full |
| lib/sources/register-walk.mjs | 185 | full |
| lib/sources/register-walk.test.mjs | 187 | full |
| lib/sources/reground-ladder.golden.test.mjs | 70 | full |
| lib/sources/scrape-schedule.test.mjs | 30 | full |
| lib/sources/scrape-schedule.ts | 75 | full |
| lib/sources/sec-fair-access.ts | 26 | full |
| lib/sources/seek-more.mjs | 185 | full |
| lib/sources/seek-more.test.mjs | 90 | full |
| lib/sources/sitemap-walk.mjs | 737 | full |
| lib/sources/sitemap-walk.test.mjs | 655 | full |
| lib/sources/snapshot-store.mjs | 115 | full |
| lib/sources/snapshot-store.test.mjs | 96 | full |
| lib/sources/source-growth.selftest.mjs | 55 | full |
| lib/sources/source-growth.ts | 380 | full |
| lib/sources/source-type-taxonomy.mjs | 228 | full |
| lib/sources/source-type-taxonomy.test.mjs | 129 | full |
| lib/sources/standards-body-class.test.mjs | 73 | full |
| lib/sources/target-match-yearlike.test.mjs | 67 | full |
| lib/sources/target-match.mjs | 326 | full |
| lib/sources/tier-discipline-no-guess.test.mjs | 123 | full |
| lib/sources/tier-opinion-dedup.npmtest.mjs | 123 | full |
| lib/sources/tier-opinion-writer.test.mjs | 119 | full |
| lib/sources/tier-opinion-writer.ts | 109 | full |
| lib/sources/transport-escalation.mjs | 286 | full |
| lib/sources/transport-escalation.test.mjs | 263 | full |
| lib/sources/transport-hold-wiring.npmtest.mjs | 72 | full |
| lib/sources/transport-runtime.mjs | 113 | full |
| lib/sources/transport-runtime.test.mjs | 177 | full |
| lib/sources/url-canonicalize.ts | 166 | full |
| lib/sources/verification-decision.mjs | 24 | full |
| lib/sources/verification.ts | 1018 | full |
| lib/sources/verify-item.mjs | 163 | full |
| lib/sources/verify-item.test.mjs | 124 | full |
| lib/sources/vertical-fit-gate.ts | 70 | full |
| lib/sources/vertical-fit.ts | 155 | full |
| lib/sources/w2f-basetier.npmtest.mjs | 36 | full |
| lib/spec09/auxiliary-energy.mjs | 56 | full |
| lib/spec09/auxiliary-energy.test.mjs | 45 | full |
| lib/spec09/csv-upload-contract.mjs | 512 | full |
| lib/spec09/csv-upload-contract.test.mjs | 237 | full |
| lib/spec09/dqi.mjs | 66 | full |
| lib/spec09/dqi.test.mjs | 60 | full |
| lib/spec09/eudr-custody.mjs | 90 | full |
| lib/spec09/eudr-custody.test.mjs | 60 | full |
| lib/spec09/grid-queue.mjs | 40 | full |
| lib/spec09/grid-queue.test.mjs | 34 | full |
| lib/spec09/indexation.mjs | 65 | full |
| lib/spec09/indexation.test.mjs | 51 | full |
| lib/spec09/label.mjs | 68 | full |
| lib/spec09/label.test.mjs | 56 | full |
| lib/spec09/oem-payload.mjs | 73 | full |
| lib/spec09/oem-payload.test.mjs | 66 | full |
| lib/spec09/reroute.mjs | 39 | full |
| lib/spec09/reroute.test.mjs | 39 | full |
| lib/spec09/surcharge-audit.mjs | 98 | full |
| lib/spec09/surcharge-audit.test.mjs | 67 | full |
| lib/spec09/vocab-drift.test.mjs | 77 | full |
| lib/statutory/fueleu-annex-iv.mjs | 140 | full |
| lib/statutory/types.contractable-barrier.check.ts | 40 | full |
| lib/statutory/types.ts | 86 | full |
| lib/supabase-browser.ts | 8 | full |
| lib/supabase-env.ts | 16 | full |
| lib/supabase-server-brief-backfill.npmtest.mjs | 106 | full |
| lib/supabase-server-category-rpc-paging.test.mjs | 93 | full |
| lib/supabase-server-client.ts | 27 | full |
| lib/supabase-server-listings-order.npmtest.mjs | 143 | full |
| lib/supabase-server-recent-changes-319.test.mjs | 64 | full |
| lib/supabase-server-rpc-scope.test.mjs | 257 | full |
| lib/supabase-server-watchlist.npmtest.mjs | 92 | full |
| lib/supabase-server.ts | 4842 | full |
| lib/supabase-service.ts | 43 | full |
| lib/surface-of.mjs | 105 | full |
| lib/tags/client.ts | 134 | full |
| lib/tags/server.npmtest.mjs | 92 | full |
| lib/tags/server.ts | 75 | full |
| lib/tags/types.ts | 19 | full |
| lib/tags/useWorkspaceTagsFacet.ts | 82 | full |
| lib/telemetry/capture-error.ts | 149 | full |
| lib/telemetry/stack-hash.mjs | 79 | full |
| lib/telemetry/stack-hash.test.mjs | 75 | full |
| lib/telemetry/surface-health.mjs | 82 | full |
| lib/telemetry/surface-health.test.mjs | 84 | full |
| lib/text/html-to-text.mjs | 53 | full |
| lib/text/html-to-text.test.mjs | 67 | full |
| lib/tier-labels.test.mjs | 52 | full |
| lib/tier-labels.ts | 33 | full |
| lib/tier1-priority-jurisdictions.ts | 277 | full |
| lib/trust-evaluators.npmtest.mjs | 117 | full |
| lib/trust.selftest.mjs | 57 | full |
| lib/trust.ts | 908 | full |
| lib/urgency/bands.npmtest.mjs | 70 | full |
| lib/urgency/bands.ts | 158 | full |
| lib/url-params/regulations-region-link.test.mjs | 38 | full |
| lib/url-params/regulations-region-link.ts | 60 | full |
| lib/watchlist/membership.test.mjs | 138 | full |
| lib/watchlist/membership.ts | 243 | full |
| lib/watchlist-links.npmtest.mjs | 52 | full |
| lib/watchlist-links.ts | 80 | full |
| lib/watchlist-order.ts | 35 | full |
| lib/watchlist-scope.npmtest.mjs | 63 | full |
| lib/watchlist-scope.ts | 52 | full |
| lib/workspace/profile.npmtest.mjs | 84 | full |
| lib/workspace/profile.ts | 97 | full |
| lib/workspace/relevance.mjs | 87 | full |
| lib/workspace/relevance.test.mjs | 54 | full |
| lib/workspace/viewer-relevance.npmtest.mjs | 28 | full |
| lib/workspace/viewer-relevance.ts | 47 | full |
| stores/navigationStore.ts | 69 | full |
| stores/resourceStore.ts | 650 | full |
| stores/settingsStore.npmtest.mjs | 105 | full |
| stores/settingsStore.ts | 242 | full |
| stores/sourceStore.ts | 119 | full |
| stores/workspaceStore.ts | 60 | full |
| types/resource.ts | 347 | full |
| types/source.ts | 608 | full |
| workflows/erase-step-hygiene.npmtest.mjs | 32 | full |
| workflows/generate-brief.ts | 639 | full |

**Totals**: 266 files (266 full / 0 grep-swept), 44,263 lines (44,263 full-read / 0 grep-swept).
