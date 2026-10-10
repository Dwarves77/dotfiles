# 2026-10-10, lane SMOKE-4 (smoke4-list-side-chooser): the Live smoke picks LIST pages that contain a candidate row

Defect (SMOKE-3 open item): the record-grade list chip and the bias chips on list rows were still judged over the list pages the smoke visits (the first page of each list), so a corpus whose record-grade or bias-tagged items sit past that first page would fail the grade chip or bias chip invariant although every candidate was fine. [CONFIRMED: reading `live-content.mjs` judgeContentRun before this change, a list requirement filtered nothing by candidate; `src/app/regulations/page.tsx` renders a fixed first page of `LIST_FIRST_PAGE_SIZE` rows ordered by priority]

## Accomplished

1. `live-candidates.mjs`: the item read also selects `title`; new `listPathOfItemRow` builds the candidate's list URL (the surface its detail path names, filtered by `?q=` set to its title cut to 60 characters and trimmed, a substring the list's own `filterRows` matches); `summariseRows` returns `listVisit` (distinct list URLs, at most `VISIT_PER_CLASS`, an untitled item skipped); `candidateLines` prints `list <urls>` in the diagnostic.
2. `live-content.mjs`: a conditional LIST requirement is judged only on the candidate list pages the runner visited (matched on path and query, ignoring percent-encoding), FAIL once per viewport when a candidate list renders no element, FAIL when a candidate list page was never checked; candidates exist but no list could be chosen is a named HOLD carrying the count; a candidate file without a `listVisit` key is judged over every list page as before; `checkContentSnapshot` does not hold a snapshot flagged `candidateList` to the `each` requirements (a page filtered to one row); `LIST_CANDIDATE_CLASSES` exported.
3. `live-smoke.mjs`: the plan visits each `listVisit` of the list-conditional classes (record, bias) as a `list` page flagged `candidateList`, at both viewports; every other invariant (overflow, console, empty list, leaks) applies to it as to any list page.
4. Tests: `live-candidates.test.mjs`, `live-content.test.mjs`, `live-smoke-content.test.mjs` extended (11 new or changed tests).

## Read and reused

Read: root `CLAUDE.md`, COMMON and batch2 (SMOKE-4), the SMOKE-3 log, `live-candidates.mjs`, `live-content.mjs`, `live-smoke.mjs`, the three test files, `src/app/regulations/page.tsx`, `src/components/list-surface/list-surface-helpers.ts` (`filterRows`, `QUERY_FACET_PARAM`, `filterFromSearchParams`), `src/lib/list-pagination.ts`, migration 306's public listing predicate (verified, non-archived: the same predicate as the candidate reads), `smoke/live-smoke-fixture-smoke.mjs`. Reused instead of building: the list surfaces' own `?q=` facet (no new URL contract), `itemDetailHref` through `pathOfItemRow` for the surface, the existing hold and report plumbing, `samePath`.

## Red then green

- Red: 11 tests failed against the unchanged sources (`node --test live-content.test.mjs live-candidates.test.mjs live-smoke-content.test.mjs`: pass 46, fail 11) before any source edit; tests were committed first (WIP commit 9209a60ca).
- Green: `node --test fsi-app/.discipline/rendering/live/*.test.mjs` 91 pass, 0 fail; `node --test fsi-app/.discipline/rendering/smoke/*.test.mjs` 19 pass, 0 fail. Attacks covered: a candidate list that renders no grade chip fails once per viewport while a plain list carries one; a candidate list never visited fails; a plain list cannot rescue the requirement; a candidate list is not failed for a missing tier square.

## Decisions

- The list is identified by the item's title in `?q=` because the lists carry no grade or bias facet and `q` is the existing URL contract (`QUERY_FACET_PARAM`); the filter runs client side over the loaded rows, which the page's after-paint remainder fetch completes before the network-idle settle.
- Candidates with no title cannot be searched for; if none of a class has one the list requirement HOLDS with the count rather than judging the unfiltered lists.

## NOT done

- The rendering guard's `live-smoke-fixture` leg (`.discipline/rendering/smoke/live-smoke-fixture-smoke.mjs`, outside the write set) still passes candidates without `listVisit`, so it exercises the legacy path only; a fixture leg for the list chooser needs that file in a write set. [WORK: owed]
- The first production run after this merges shows whether titles chosen by the chooser find their row on the live lists (a row the public listing excludes would fail the chip invariant); nothing in the repo can show it before. [NOT-WORK: needs a production run of live-smoke.yml, which a lane never fires]
