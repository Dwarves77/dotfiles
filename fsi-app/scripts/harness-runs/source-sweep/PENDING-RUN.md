# Pending run — source-sweep

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates — written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: `sha256:...``).

**What changed:** lane SITEMAP (2026-09-04) added a fourth walker, `sitemap`, to the source-sweep family
— a generic sitemap.xml/sitemap_index.xml enumerator for regulator/news sources that lack a feed, with
feed-discovery tried first per the operator's explicit ruling (major sources with an RSS/Atom feed should
be walked as a feed, never re-derived from their sitemap). The new walker's logic lives in two NEW,
non-governing pure modules — `src/lib/sources/sitemap-walk.mjs` and `src/lib/sources/feed-discovery.mjs`
(dependency-injected, ported from the vendored `mreflow/control-center` reference implementation per
`fsi-app/THIRD-PARTY-NOTICES.md`; neither file is in F28's `GOVERNING_FILES.source-sweep` list, same as
`register-walk.mjs`/`feed-walk.mjs` were not added when they landed) — but the ONE file that IS a governing
file for this family, `scripts/turns/run-source-sweep.mjs`, changed content to wire the new walker in:
`WALKERS` gained `"sitemap"`, `parseArgs()` gained `--source-id`/`--host`/`--limit`/`--max-sitemap-fetches`/
`--max-sitemap-entries`, a new pure `selectSitemapSources()` export, a new `shapeRunOutput()` branch for
the walker's artifact shape, and `main()` gained the `sitemap` dispatch branch (calls `walkSource`, writes
`sources.rss_feed_url` through the existing `guardedUpdate` path when a feed is discovered, hands feed
sources to the existing `walkFeed` path, and records a precision-gated `monitoring_queue` INSERT on a
changed `lastmod` matching a live item's canonical URL — see `docs/inventories/shared-dataset-ownership.md`'s
`monitoring_queue` section for that write's full shape and gate).

`SOURCE_SWEEP_GOVERNING_FILES` inside `run-source-sweep.mjs` (the array pinned by this same file's own
`run-source-sweep.test.mjs` `assert.deepEqual`, by F28's `GOVERNING_FILES.source-sweep`, and by
`scripts/harness-runs/CONVENTION.md`'s table) is DELIBERATELY left unchanged at its existing three entries
(`scripts/turns/run-source-sweep.mjs`, `src/lib/sources/register-walk.mjs`, `src/lib/sources/feed-walk.mjs`)
— none of those three other files were touched by this lane, and neither `sitemap-walk.mjs` nor
`feed-discovery.mjs` is added to the list, for the same reason the existing `register-walk.mjs`/
`feed-walk.mjs` walkers' own modules are not separately listed there either: the governing-file set names
the dispatch surface and the two pre-existing walker modules that predate this convention, not every walker
module the family will ever grow. This decision, and the reasoning, is recorded in
`scripts/harness-runs/source-sweep/PROTOCOL.md` §7.

Because `run-source-sweep.mjs` — one of the three files F28 actually hashes for this family — changed
content, the family's `harness_version` moved even though no new run artifact has been recorded yet (the
egress proxy in this build environment refuses connections to the two candidate hosts a first dry run would
target, `aircargonews.net` and `aapa-ports.org` — see PROTOCOL.md §7 for the exact refusal text). This
marker is that honest acknowledgment, not a live-run substitute.

**Re-pin note (lane GOV-SINGLE, 2026-09-04, governing-files.mjs single-source refactor):**
`SOURCE_SWEEP_GOVERNING_FILES` moved from a hand-copied literal array inside `run-source-sweep.mjs` to
`export const SOURCE_SWEEP_GOVERNING_FILES = GOVERNING_FILES['source-sweep'];`, importing its entry from
the new single source `scripts/harness-runs/governing-files.mjs` (see that module's own header — this
closes the "two hand-synced copies of the same fact" defect proven live for `mint`'s own pair; the
`sitemap-walk.mjs`/`feed-discovery.mjs` non-extension decision this file already documents above is
unaffected — the FILE LIST hashed is still the same three entries, byte-identical). Only
`run-source-sweep.mjs` itself — one of its own three governing files — changed BYTES (the import line and
the declaration), which is what moved the hash again; `register-walk.mjs`/`feed-walk.mjs` are untouched.

**(superseded below) harness_version at that write time was:** `sha256:a5f3170ef09f94f7` (supersedes `sha256:cd5bced124897333` above)

**What changed (lane SITEMAP-3, 2026-09-04):** the operator's own build brief ("do you do mapping of the
sites and store them in supabase … you will have to backfill sources with sitemap info in supabase" — see
`docs/runbooks/CORPUS-TURN-RUNBOOK.md`'s "The sitemap walker" section for the full user-facing account).
`scripts/turns/run-source-sweep.mjs` — the same one of the three governing files every prior entry above
also moved — changed content again: `parseArgs()` gained `--all-hosts`/`--max-hosts`/`--check-coverage`
(and the selector-validation rewrite that requires exactly one of `--source-id`/`--host`/`--all-hosts`, or
`--check-coverage` alone); five new pure exports (`hostKeyOf`, `groupActiveSourcesByHost`,
`hostSitemapCoverage`, `orderHostGroupsForSweep`, `selectAllHostsTargets`, `buildSitemapCoveragePatch`,
`buildCoverageReport` — `selectSitemapSources` itself is unchanged in behavior, only refactored to share
`hostKeyOf`); `DEFAULT_MAX_HOSTS` (= 40, arithmetic in its own comment); `main()`'s sitemap branch gained
the `--all-hosts` selection path, the `--check-coverage` read-only branch, and a per-row
`buildSitemapCoveragePatch` → `guardedUpdate("sources", ...)` write (migration 304's five new coverage
columns) on every walked row, apply mode only; `shapeRunOutput`'s sitemap branch gained
`hosts_walked`/`hosts_skipped_bot_wall`/`feeds_discovered`/`new_locs`/`lastmod_changes`/
`hosts_remaining_unwalked` metrics and a `--check-coverage` result shape. `src/lib/sources/sitemap-walk.mjs`
also changed — NOT a governing file (per the note above, unaffected by this lane) — fixing a real bug found
while reading it in full: the bot-wall-detection branch called `sitemapsFallbackCandidates` (undefined; the
exported function is `sitemapFallbackCandidates`, no "s"), a `ReferenceError` that fired exactly when a
site bot-walls its own `robots.txt` — the one case that branch exists to detect. Fixed, with a regression
test (`sitemap-walk.test.mjs`). `.github/workflows/source-sweep.yml` gained the matching
`all_hosts`/`max_hosts`/`check_coverage` inputs and validation/arg-building steps.

**(superseded below) harness_version at that write time was:** `sha256:861ec589ce12b9ce` (supersedes `sha256:a5f3170ef09f94f7` above)

**What changed (lane SITEMAP-3, 2026-09-04, same lane, arithmetic correction):** re-reading this same
lane's own `DEFAULT_MAX_HOSTS` comment against `CORPUS-TURN-RUNBOOK.md`'s independently-written "The
sitemap walker" section (rule "no small follow-up fix, fix it now") surfaced a real disagreement: the
runbook correctly computed `⌈646/40⌉ = 17` dispatches to sweep all 646 active hosts once, but
`run-source-sweep.mjs`'s own comment rounded `646/40 ≈ 16.15` DOWN to "16 dispatches" — 16 full 40-host
dispatches cover only 640 of 646 hosts, leaving 6 uncovered, so a 17th (partial) dispatch is required; "16"
was arithmetically wrong, not a rounding-convention choice. Fixed the comment in `run-source-sweep.mjs`
(now explains the ceiling explicitly and cross-references the runbook), the matching `~16` in
`.github/workflows/source-sweep.yml`'s `max_hosts` input description, and `docs/inventories/migrations.md`'s
row 304 (also said `~16`) — all three now agree with the runbook's `17`. `run-source-sweep.mjs` is again
the one governing file among the three that changed BYTES (comment text only — no behavior, no exported
symbol, no test assertion touched); `register-walk.mjs`/`feed-walk.mjs` are untouched.

**harness_version at write time:** `sha256:925c102302270e6e` (supersedes `sha256:861ec589ce12b9ce` above —
confirmed by running `node .discipline/fitness/runner.mjs` after this edit: F28 prints exactly this hash as
"current hash" in its STALE PENDING-RUN.md violation)

**The planned run that supersedes this marker:** the first `source-sweep` dispatch run with
`--walker sitemap --mode dry` (against a verified-feed source, e.g. `--host aircargonews.net`, then a
verified-sitemap-only source, e.g. `--host aapa-ports.org`, once network access to those hosts is available
from the dispatch environment — OR, now that this lane lands, a `--check-coverage` dry run, which needs no
outbound network access at all and would discharge this marker just as validly), followed by an `--mode
apply` run once the dry output is reviewed. Per F28's reverse-audit, this marker is deleted the moment that
artifact lands and its `harness_version` matches the hash above (or re-pinned to a new hash, per rule (c),
if a governing file changes again before that run lands).
