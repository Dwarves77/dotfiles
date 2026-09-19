# Pending run — source-sweep

F28's staleness-coupling rule (rule (c)) fires because this family's governing files
(`scripts/turns/run-source-sweep.mjs`) moved bytes after `source-sweep-run-018.json` was recorded, with
no new run artifact yet landed under the changed code — the exact "the harness changed without a run
recording why" gap this marker exists to acknowledge honestly rather than silently.

**What changed, and why (lane INCLAUSE-CLASS, 2026-09-06, the IN-CHUNK id-list class fix — see
`docs/audits/in-filter-audit-2026-09-06.md`).** `recordSitemapChange()`'s change-detection lookup called
`sb.from("intelligence_items").select(...).eq("source_id", targetSourceId).eq("is_archived", false)
.in("source_url", locs)` with `locs` built directly from a sitemap walk's discovered URL list — unbounded
in principle (a sitemap can carry up to `DEFAULT_MAX_SITEMAP_ENTRIES` = 100,000 entries per
`sitemap-walk.mjs`), the same PostgREST URL-length defect confirmed twice this lane (review-apply wrappers,
run 34045479342; `census-off-vertical.mjs`, Maintenance run 34046850770). Fixed by routing the lookup
through `readAllByIds("intelligence_items", "id", locs, {idColumn: "source_url", client: sb, match: q =>
q.eq("source_id", targetSourceId).eq("is_archived", false)})`, which chunks the id list (default 50 per
chunk, via `fetchAllByIdChunks` in `src/lib/db/paginate.mjs`) instead of emitting one oversized `.in()`
request. No change to which URLs are matched, how the diff is computed, or what gets written to
`monitoring_queue` — only how the lookup's request is shaped.

**No behavior change to the walk itself, the candidate URLs discovered, or the diff/write logic** — only
the internal request shape of one read inside `recordSitemapChange()`. `run-source-sweep.mjs`'s selection,
persistence, and metrics are computed exactly as before; a run against a sitemap under ~50 discovered URLs
(every run to date, per `source-sweep-run-001` through `-018`'s own `metrics`) produces byte-identical
output to the un-chunked call it replaces, since chunking a list of 50 into one chunk of 50 is a no-op.

**Re-stamped (lane L35, 2026-09-17, F46 external-host-home).** The governing files moved bytes again:
`scripts/turns/run-source-sweep.mjs` now imports `EUR_LEX_PORTAL_URL` from
`src/lib/sources/identifier-variants.mjs` instead of the literal `"https://eur-lex.europa.eu"` in
`portalFor`, and `src/lib/sources/register-walk.mjs` now imports (and re-exports) `ojDailyViewUrl` from
the same module instead of defining it locally. Both are the one-host-one-home consolidation lane L35
drives (F46); no change to the URL VALUES either function returns, the walk logic, or persistence, and
the sweep test in `src/lib/sources/identifier-variants.test.mjs` proves the EUR-Lex URL shapes are unchanged.

**Re-stamped again (lane L35, same session, F46 continued): www.federalregister.gov + www.ecfr.gov.**
`scripts/turns/run-source-sweep.mjs`'s `portalFor` now imports `FEDERAL_REGISTER_PORTAL_URL` from
`src/lib/sources/transport-escalation.mjs` instead of the literal `"https://www.federalregister.gov"`,
and `src/lib/sources/register-walk.mjs`'s `frDocumentsUrl` now composes its endpoint from the imported
`FEDERAL_REGISTER_API_BASE` instead of the literal `"https://www.federalregister.gov/api/v1"`. Again no
change to the URL VALUES, the walk logic, or persistence; proven by the sweep test in
`src/lib/sources/transport-escalation.test.mjs`.

**harness_version at write time (superseded below, see Re-pin):** `sha256:32161a97c0405906`

**The planned run that would have superseded THAT marker:** the next real
`node scripts/turns/run-source-sweep.mjs` dispatch (dry or apply) would have landed
`source-sweep-run-019.json` with `harness_version: sha256:32161a97c0405906`. No such run landed before
lane M8's own edit moved the hash again (see the re-pin below).

---

## Re-pin (lane M8, 2026-09-18, S1 collect completeness)

**What changed.** `scripts/turns/run-source-sweep.mjs` (this family's own governing file) gained the
`--slice`/`--after` sizing-and-cursor mechanism for `--walker sitemap --all-hosts` (closing S1's own
finding -- `docs/audits/stage-audit-2026-09-18/s1-collect.md` -- that 18 real dispatches over 13 days left
the never-walked bucket completely unmoved): `DEFAULT_SLICE_HOSTS`/`MAX_SLICE_HOSTS` constants,
`selectAllHostsTargets` extended with an `afterHost` parameter and two additive return fields
(`selectedHostGroups`, `hostsRemainingAfterSlice`), two new pure functions (`lastFullyWalkedHost`,
`latestSitemapAllHostsCursor`), the `--slice`/`--after` CLI args, and the `--all-hosts` branch of `main()`
wired to read/write a `config.cursor` field on every sitemap `--all-hosts` artifact. No change to
`register-walk.mjs` or `feed-walk.mjs` (this family's other two governing files); no change to any
non-`--all-hosts` sitemap dispatch (`--source-id`/`--host`/`--check-coverage`), the register-eurlex/
register-federal-register/feed walkers, or any pre-existing field's meaning -- every one of the 65
pre-existing tests in `run-source-sweep.test.mjs` still passes unchanged (12 new tests added for the
slice/cursor logic itself).

**harness_version at the previous pin's write time (superseded below, see Re-pin 2):** `sha256:62033d6829cd830f` (recomputed via `hashHarnessVersion` against
`GOVERNING_FILES['source-sweep']`, the same 3 files, unreordered; supersedes `sha256:32161a97c0405906`
outright).

**The planned run that supersedes this marker:** unchanged in kind, the next real
`node scripts/turns/run-source-sweep.mjs` dispatch (dry or apply), landing `source-sweep-run-019.json`
under this hash -- this lane's own brief scopes the actual dispatch to the coordinator, after M1 lands
(section 6.1 row M8's "Depends on: M1"), so it is not run from here.

## Re-pin 2 (coordinator, 2026-09-19, at push after rebase: lane M1 rebased onto a master that carries lanes M8, M9b, M9a and L36)

**What changed.** The recorded hash `sha256:62033d6829cd830f` no longer matched the live governing files of this family (`scripts/turns/run-source-sweep.mjs`, `src/lib/sources/register-walk.mjs`, `src/lib/sources/feed-walk.mjs`) on the tree this push carries. Governing files changed on this branch: `scripts/turns/run-source-sweep.mjs`. No run of this family landed in between; the marker is re-pinned so F28 measures the tree the run will actually execute on.

**harness_version at write time:** `sha256:92cde8a1de0287ca` (recomputed via `hashHarnessVersion` against `GOVERNING_FILES['source-sweep']`, unreordered).

**The planned run that supersedes this marker.** Unchanged in kind from the previous pin; that run's artifact records whatever the tree is when it lands, and this file is deleted or re-pinned per F28's reverse-audit.
