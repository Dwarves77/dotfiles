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

**harness_version at write time:** `sha256:00a6517a684aa2f7`

**The planned run that supersedes this marker:** the first `source-sweep` dispatch run with
`--walker sitemap --mode dry` (against a verified-feed source, e.g. `--host aircargonews.net`, then a
verified-sitemap-only source, e.g. `--host aapa-ports.org`, once network access to those hosts is available
from the dispatch environment), followed by an `--mode apply` run once the dry output is reviewed. Per F28's
reverse-audit, this marker is deleted the moment that artifact lands and its `harness_version` matches the
hash above (or re-pinned to a new hash, per rule (c), if a governing file changes again before that run
lands).
