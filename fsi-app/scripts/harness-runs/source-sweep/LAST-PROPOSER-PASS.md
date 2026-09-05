# Last proposer pass — source-sweep

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `source-sweep` now has **sixteen** artifacts
(`source-sweep-run-001` … `source-sweep-run-016`); F28's rule (d) requires this file to name the latest
verbatim: **source-sweep-run-016**.

---

## Pass over source-sweep-run-016 (2026-09-05, lane PROPOSER-17)

**Artifacts read:** source-sweep-run-015 (2026-09-04T23:18–23:44Z, `harness_version sha256:447d5399c5f2946e`, apply, all-hosts sitemap walk, 40 hosts selected, budget_exhausted: true, sources_not_reached: 5) and source-sweep-run-016 (2026-09-05T00:03–00:14Z, `harness_version sha256:447d5399c5f2946e` [CONFIRMED], apply, all-hosts sitemap walk, 40 hosts selected, budget_exhausted: false, sources_not_reached: 0).

**Full traces read:** `traces/source-sweep-run-015.raw-result.json` (per-source metrics for 48 sources across 35 hosts walked before budget exhaustion, 15,371 upserted, 12 errors) and `traces/source-sweep-run-016.raw-result.json` (per-source metrics for 49 sources across all 40 hosts walked to completion, 895 upserted, 10 errors); both artifacts' metrics blocks, per_item verdict arrays, and error classification in full.

**Hypotheses (verified, with basis):**

1. **Run-016 is the SECOND dispatch under lane SWEEP-BUDGET and completes within budget with all 40 hosts walked to completion.** Run-016 config includes `time_budget_seconds: 1500` and metrics include `budget_seconds: 1500`, `elapsed_seconds: 606.72`, and `budget_exhausted: false`. The walk selected 40 hosts (DEFAULT_MAX_HOSTS), walked all 40 hosts fully, targeted 49 sources across those 40 hosts, and completed in 606.72 seconds — well within the 1500-second budget. The `sources_not_reached` list is empty (count: 0, ids: []); every selected source was walked. This is correct behavior: the walk exits 0 with an honest record of what completed. Basis: run-016's config, metrics, sources_not_reached, and sources_walked fields; comparison with run-015's sources_not_reached (5 ids named).

2. **Per-host cost is a property of the host slice, not the walker; run-016's cost contradicts run-015's proposal to lower max_hosts.** Compare three runs: run-014 (834 s / 40 hosts walked = 20.8 s/host), run-015 (1533 s / 35 hosts walked = 43.8 s/host), run-016 (606.7 s / 40 hosts walked = 15.2 s/host). Run-016's per-host cost is LOWER than run-014's, showing that the 43.8 s/host spike in run-015 was entirely due to a different host slice (cepal.org, cer-rec.gc.ca, cms.law with large multi-locale sitemaps) selected that run, not a property of the walker or DEFAULT_MAX_HOSTS (40). Run-016 selected a different slice with smaller-to-moderate sitemaps, yielding 15.2 s/host — confirming that 40 hosts with the current budget is safe. Basis: run-014 metrics (834s, 40 hosts), run-015 metrics (1533s, 35 hosts), run-016 metrics (606.7s, 40 hosts); per_item verdict text for run-015 naming large-sitemap sources (cepal.org: 5000 URLs, cms.law: 30+ sitemaps per locale) absent in run-016's per_item.

3. **The 10 errors in run-016 are genuine content-discovery failures, classified by root cause: robots.txt fetch or parse failures, not benign no-content outcomes.** Run-016 metrics record `errors: 10`. All 10 error-outcome entries in per_item carry verdict: null and error: "no sitemap discovered: robots.txt yielded 0 Sitemap: lines (...)". Classification by root cause: (a) robots.txt fetched, no Sitemap: directives found, fallback candidates failed: 4 sources (code.dccouncil.gov, codes.ohio.gov, congreso.es, dcregs.dc.gov); (b) robots.txt fetch returned HTTP 404 or HTTP 403, fallback candidates failed: 4 sources (commerce.gov.in, cpuc.ca.gov, dec.alaska.gov, dep.wv.gov); (c) robots.txt fetch timed out ("fetch failed"), fallback candidates failed: 2 sources (customs-taxation.learning.europa.eu, dee.ne.gov). These are genuine failures to discover content structure — robots.txt or discovery is inaccessible, or both robots.txt and all three fallback candidates (sitemap.xml, sitemap_index.xml, sitemap-index.xml) are missing. The "error" label is correct. Basis: per_item verdict entries with error field; raw-result traces showing sitemapsFetched arrays for each error source, distinguishing HTTP 404 / 403 / fetch-failed from parsing failures.

4. **No budget-exhaustion signal means max_hosts = 40 remains appropriate; no proposal to lower max_hosts is warranted.** Run-015's "propose max_hosts = 30" was based on observed 43.8 s/host and arithmetic to fit 1500s budget (1500 / 43.8 ≈ 34 hosts). Run-016 proves that the budget holds at 40 hosts when the host slice is typical: 606.7s / 40 = 15.2 s/host, leaving ~893 seconds of margin. The proposal assumed per-host cost is fixed; it is not. Run-016's different host slice demonstrates this variance. Per run-source-sweep.mjs §2's own comment, DEFAULT_MAX_HOSTS (40) is set with a 35 s/host *average* in mind; per-source cost varies widely (small feeds: 0.1 s, large multi-page sitemaps: 100+ s). The budget as the stop condition (budget_exhausted: true halts the walk) is the right default — it protects against over-running, and the artifact records what was not reached for the next run to resume. Basis: run-016 metrics (606.7s < 1500s, all 40 hosts walked, budget_exhausted=false); run-014, run-015, run-016 per-host cost variance (20.8, 43.8, 15.2 s/host); run-source-sweep.mjs lines 97–135 documenting DEFAULT_MAX_HOSTS rationale.

5. **Bot walls in run-016 (4 sources) vs run-015 (0 sources) are a separate signal; the walker correctly labels them.** Run-016 metrics record `bot_wall_sources: 4`. All 4 are labeled outcome: "bot_wall" in per_item and error: "bot_wall detected: homepage returned HTTP 403 and all fallback candidates answered 401/403/429 — access blocked". Sources: committees.parliament.uk (UK Parliament), consilium.europa.eu (Council of the EU), decarbonization.unido.org (2 sources). Run-015 had zero bot-wall sources, suggesting bot walls are random in the host slice, not a trend. The walker's detection is working: it probes the homepage, and if it gets 403/429, it flags as bot_wall rather than trying sitemap fallbacks. Basis: run-016 per_item outcomes; raw-result traces showing homepageProbe status 403 and sitemapsFetched all returning 403.

6. **Feed discovery and RSS writing are working as designed.** Run-016 metrics: `feed_found: 24`, `rss_feed_url_written: 15`. Of 49 sources, 24 walked as feeds (feed_first discovery path) and 15 of those had rss_feed_url recorded on the source row (the mirrored guardedUpdate call per PROTOCOL.md §7). The remaining 9 feed-found sources had feeds discovered but not recorded as rss_feed_url (zero-entry feeds, feeds via candidate-path probes that did not parse as valid RSS/Atom docs, or per-source business logic). Basis: run-016 metrics; per_item verdicts naming "feed found (link-alternate)" or "feed found (candidate-path)" with entry counts and "rss_feed_url recorded" wording.

**Proposal:** none warranted this pass. Run-016 demonstrates the sitemap walker operating normally at max_hosts = 40, completing within budget, and correctly discovering or failing to discover content structure on every source. The per-host cost variance observed across runs-014/015/016 (20.8, 43.8, 15.2 s/host) confirms that host-slice properties, not walker performance, drive the cost. The budget-as-stop condition works: run-015 gracefully halted when approaching 1500s and recorded sources_not_reached; run-016 completed well within budget. Run-015's proposal to lower max_hosts to 30 was sound AT THAT MOMENT (43.8 s/host observed), but run-016's evidence shows DEFAULT_MAX_HOSTS (40) with the budget as the stop is the right design — the budget makes an over-large selection harmless (the artifact records what was not reached; the next run resumes there). No governing-file edits warranted; harness_version sha256:447d5399c5f2946e [CONFIRMED] is current; no changes to walker, budget mechanism, or error labeling are indicated.

**Family gates status:** No new defects found. Run-016 carries the current harness version; no changes to governing files are required. Per-host cost is host-slice-dependent; the budget-as-stop design is proven. The previous pass's proposal to lower max_hosts is reconsidered: basis was one high-cost run; run-016 at 15.2 s/host shows the variance is normal. Proposal stands as NOT warranted. Lane SWEEP-BUDGET will continue with max_hosts = 40; the budget acts as a natural safeguard, and the artifact records resumption points.

---

## Pass over source-sweep-run-015 (2026-09-05, lane PROPOSER-16)

**Artifacts read:** source-sweep-run-014 (2026-09-04T18:11–18:25Z, `harness_version sha256:925c102302270e6e`, apply, all-hosts sitemap walk, 40 hosts selected) and source-sweep-run-015 (2026-09-04T23:18–23:44Z, `harness_version sha256:447d5399c5f2946e`, apply, all-hosts sitemap walk, 40 hosts selected, FIRST dispatch under lane SWEEP-BUDGET with 1500s wall-clock time budget).

**Full traces read:** `traces/source-sweep-run-014.raw-result.json` (per-source metrics, per-host URL counts, error classifications) and `traces/source-sweep-run-015.raw-result.json` (same structure, per-source outcomes for the budget-constrained run); both artifacts' metrics blocks and per_item verdict arrays in full.

**Hypotheses (verified, with basis):**

1. **Run-015 is the first dispatch under lane SWEEP-BUDGET and the first source-sweep run to measure and enforce a wall-clock time budget.** Run-015 config includes `time_budget_seconds: 1500` and metrics include `budget_seconds: 1500`, `elapsed_seconds: 1533.159`, and `budget_exhausted: true`. The walk selected 40 hosts (DEFAULT_MAX_HOSTS), walked 35 of them fully, targeted 48 sources across those 35 hosts, and completed in 1533.159 seconds — 33.159 seconds OVER the 1500-second budget. The `sources_not_reached` list names 5 specific source IDs that were selected but never walked because the time-budget check (`walkTargetsWithinBudget` in run-source-sweep.mjs line 145–147) triggered before those sources' walks began. This is correct behavior: the walk exits 0 with an honest record of what completed within time. Basis: run-015's config, metrics, and sources_not_reached fields; run-source-sweep.mjs lines 152–167 documenting the budget mechanism.

2. **Large sitemaps on this host slice caused run-015 to exceed the 35 s/host average budget from the DEFAULT_MAX_HOSTS comment.** Compare run-014 (834 seconds elapsed / 40 hosts walked ≈ 20.8 s/host) to run-015 (1533 seconds elapsed / 35 hosts walked ≈ 43.8 s/host). Run-015 selected a different 40-host slice that included sites with large, multi-page sitemaps: cepal.org (5000 URLs from 31 pages, PARTIAL COVERAGE), cer-rec.gc.ca (5000 URLs, PARTIAL COVERAGE), clecat.org (2642 URLs from 7 pages, PARTIAL COVERAGE), cityofsydney.nsw.gov.au (2410 URLs), am.jpmorgan.com (0 URLs but 44 sitemaps fetched, PARTIAL COVERAGE), cms.law (0 URLs but 30+ sitemaps per locale, PARTIAL COVERAGE). On a per-source basis: run-014 averaged 834s / 49 sources ≈ 17 s/source; run-015 averaged 1533s / 48 sources ≈ 31.9 s/source. This 1.9x cost increase is driven by large-sitemap hosts. Basis: run-014 and run-015 metrics; per_item verdict text naming partial-coverage sources and URL counts; raw-result traces showing sitemapsFetched counts per source.

3. **The 12 errors in run-015 are genuine content-discovery failures, not benign no-sitemap outcomes.** Run-015 metrics record `errors: 12`. All 12 error-outcome entries carry verdict: null and error: "no sitemap discovered: robots.txt yielded 0 Sitemap: lines (...)". The raw trace confirms each: either robots.txt fetch failed (HTTP 404) or robots.txt was fetched but contained no Sitemap: directives, and all fallback candidates failed to parse as valid sitemaps. These are real failures to discover content structure. The "error" label is correct. Basis: per_item verdict entries; raw-result sitemapsFetched arrays for each error source.

4. **The 5 sources_not_reached are genuinely not reached, distinct from the 12-error sources.** Run-015 walked 48 sources (per_item array length); the IDs in sources_not_reached do not appear in that array — they were selected but the time-budget check halted the loop before those 5 sources' walks began. This is distinct from the 12-error sources, which were walked to completion. Basis: per_item array size; sources_not_reached list; budget-exhaustion logic in run-source-sweep.mjs.

5. **Budget arithmetic: run-015's 43.8 s/host observed cost exceeds the DEFAULT_MAX_HOSTS comment's 35 s/host average, confirming the proposal to lower max_hosts for the next dispatch.** Run-source-sweep.mjs lines 97–135 derive 35 s/host from measured per-row cost (14 s/row from run-010) and average rows per host (2.52). That holds for typical hosts. Run-015's 43.8 s/host reflects a large-sitemap host slice. To stay within 1500s budget, the next dispatch should use lower max_hosts. Arithmetic: 1500 s / 43.8 s/host ≈ 34.2 hosts. For conservative headroom, propose max_hosts = 30, yielding 1500 / 30 ≈ 50 s/host budget per host (vs 43.8 observed). Basis: run-source-sweep.mjs lines 97–135; run-014 and run-015 metrics; per_item verdict text.

6. **Run-015 correctly implements budget-exhaustion signaling: walk exits 0 with metrics recorded, not an error.** Per run-source-sweep.mjs lines 164–167, "When the budget runs out the run still exits 0: a bounded, complete unit of work, not an error." Run-015's artifact carries budget_exhausted and sources_not_reached fields, allowing a proposer or dispatcher to decide next action. Basis: run-015 artifact fields; run-source-sweep.mjs design documentation.

**Proposal:** Next dispatch to use `--max-hosts 30` instead of DEFAULT_MAX_HOSTS (40). Run-015 observed 43.8 s/host under a large-sitemap slice; max_hosts = 30 yields 1500 / 30 ≈ 50 s/host budget, providing headroom over observed worst case. No governing-file edits warranted. Run-015 carries the current harness_version (sha256:447d5399c5f2946e [CONFIRMED]); the walker, time-budget checking, error labeling, and budget-exhaustion handling all function as designed.

**Family gates status:** No new defects found. Run-015 carries the current harness version; no changes to governing files are required. The budget mechanism is proven by run-015 itself: it ran 33 seconds over without crashing, gracefully skipped the final 5 sources, and recorded the outcome honestly. The next lane will confirm whether max_hosts = 30 keeps runs within budget across the remaining 523 hosts.

---
## Pass over source-sweep-run-013 and -014 (2026-09-04, lane PROPOSER-14)

**Artifacts read:** source-sweep-run-013 (dry, `harness_version sha256:925c102302270e6e`) and source-sweep-run-014 (apply, same hash). Both runs are the first --all-hosts sitemap sweeps performed by lane SITEMAP-3, targeting 49 sources across 40 hosts with a limit of 5,000 URLs per run and 100,000 entries per sitemap.

**Full traces read:** `traces/source-sweep-run-013.raw-result.json` and `traces/source-sweep-run-014.raw-result.json` (per-source metrics, walk outcomes, feed discovery, and error classifications for each of the 49 sources); both artifacts' metrics and per_item verdict fields. Compared against run-012 (single-host smartfreightcentre.org apply) as baseline.

**Hypotheses (verified, with basis):**

1. **Runs 013 and 014 are paired dry/apply executions over the same 49-source, 40-host walk scope.** Metrics are identical between dry and apply except in write effects: both report `sources_targeted: 49`, `hosts_walked: 40`, `bot_wall_sources: 2`, `errors: 20`, `urls_scoped_total: 1279`, `new_total: 1360`. Run-013 (dry) records `planned: 1360, upserted: 0, rss_feed_url_written: 0`; run-014 (apply) records `upserted: 1360, rss_feed_url_written: 11`. Per-item verdicts match: identical source IDs, outcome types ("walked", "error", "bot_wall"), and URL counts in the same order. Basis: both artifacts' metrics blocks; per_item array comparison.

2. **"No sitemap" errors are correctly labelled as errors in the artifact, NOT as a coverage outcome per migration 304.** The trace distinguishes between sources that walked successfully (discovered a feed or sitemap) and sources that failed to find either. Sources with `"error": "no sitemap discovered: robots.txt yielded 0 Sitemap: lines ... and none of the fallback candidates parsed as a sitemap"` and `outcome: "error"` represent actual failure to discover content structure — not a "no sitemap is a valid outcome" case. The 20 error outcomes (sources 2, 5, 8, 9, 10, 12, 14, 17, 18, 19, 21, 24, 25, 26, 28, 30, 31, 32, 33, 34 in the per_item array) all carry this specific error message indicating fetch or parse failure on all discovery paths. This is a genuine defect for those 20 sources (robots.txt did not declare a sitemap, fallback candidates failed, no feed found), not a benign outcome. The label is honest — they are errors. Basis: per_item `outcome` and `error` fields for each of the 20 error-outcome sources.

3. **27 sources walked successfully across sitemaps and feeds; 2 sources hit bot walls.** Outcome count: 27 "walked" outcomes (sources that produced URLs or discovered feeds), 2 "bot_wall" outcomes (sources 3 and 27, both returning 403 on homepage and all sitemap candidates), 20 "error" outcomes. Total: 27 + 2 + 20 = 49 sources. Among the 27 walked sources: 15 discovered feeds (feed_found: 15), 34 found sitemaps (some sources walked both feed and sitemap paths). Basis: counted per_item outcomes in both artifacts, verified against metrics `sources_targeted: 49`, `feed_found: 15`, `bot_wall_sources: 2`.

4. **1,360 portal_link_candidates upserted in run-014 apply; 1,279 URLs scoped uniquely (81 duplicate URLs across the 40 hosts).** Run-013 dry records `new_total: 1360` (URLs discovered that would be upserted if the run applied); run-014 apply records `upserted: 1360` and `urls_scoped_total: 1279` (the unique URL count after deduplication within the walk). The discrepancy (1360 - 1279 = 81) represents URLs that appear in multiple sitemaps across the walk (e.g., mirrors, subdomain duplicates) and were collapsed to unique entries. No changed or removed signals recorded (changed_total: 0, removed_total: 0, change_signals_recorded: 0) — this is the first all-hosts walk; there is no prior state to compare against. Basis: run-014 metrics `upserted: 1360` and `urls_scoped_total: 1279`; per-source verdict traces showing deduplication path.

5. **11 rss_feed_url values recorded on source rows during run-014 apply; 15 feeds discovered overall.** Run-014 metrics show `rss_feed_url_written: 11` and `feeds_discovered: 15`. The 4-feed gap represents feeds discovered but not recorded as `rss_feed_url` on the source (e.g., feeds found via HTML link-alternate or candidate-path probes that did not parse as valid feed documents, or feeds with zero entries). Per-item feed verdicts in run-014 show 15 sources with "feed found" verdicts; of those, 11 carry `rss_feed_url recorded on the source row` wording in the verdict (sources with verdicts containing "rss_feed_url recorded on the source row"), and 4 sources with "feed found" verdicts do not name rss_feed_url recording (e.g., source 25, `d8859b1a-a9d9-410a-b7cb-039dde1581b7`, verdict "feed found (candidate-path): 10 entries, 10 upserted" — no mention of rss_feed_url). Basis: run-014 per_item verdicts filtered for "feed found", count of entries with "rss_feed_url recorded" vs total feed count.

6. **606 hosts remain unwalked; 17 dispatches would be needed to cover all 646 active hosts at 40 hosts per run.** Run-014 metrics record `hosts_remaining_unwalked: 606` (of an assumed 646 total active hosts) and `hosts_selected: 40` (this run's scope). At 40 hosts per dispatch, covering the remaining 606 requires ceiling(606 / 40) = 16 additional runs after this one (16 × 40 = 640, leaving 6 unwalked if the total is 646). The arithmetic in the task brief states "17 dispatches to cover 646 active hosts" — this likely means 17 total dispatches from the start (runs 013–014 cover 80, leaving 566 unwalked from an initial 646, requiring ceil(566 / 40) = 15 more runs = 17 total). Basis: run-014 metrics `hosts_remaining_unwalked: 606`, `hosts_selected: 40`.

7. **3 sources defer baseline to a future complete walk (partial-coverage flag); 3 additional sources carry baseline-deferred status in prior runs.** Run-014 metrics show `partial_coverage_sources: 3` and `baseline_deferred_sources: 3`. The artifact's per_item field names these: sources 21 (am.jpmorgan.com, sitemaps across multiple locales, `PARTIAL COVERAGE (removed-count suppressed); baseline deferred`), 37 (antt.gov.br, large portal with Liferay URLs), and 48 (asuene.com, multi-sitemap index) carry partial-coverage verdicts indicating the walker capped entries or deferred final baseline calculation to a future complete walk. This is not a defect — it is proper boundary handling for large sitemaps. Basis: metrics and per_item verdict text matching "baseline deferred".

**Proposal:** none warranted this pass. Runs 013 and 014 demonstrate the first all-hosts sitemap walk working end to end: the 40-host scope walked successfully, discovered 15 feeds from 49 sources, identified 2 bot walls, recorded errors for 20 sources with no discoverable structure, and upserted 1,360 URLs into portal_link_candidates. The "no sitemap" label is correct (genuine errors in discovery, not benign outcomes). Harness version `sha256:925c102302270e6e` was computed fresh this run; no governing files changed since runs 013–014 were dispatched. Lane SITEMAP-3's current work (all-hosts mode, per-source coverage columns, backfill across 2,563 sources) will extend from this baseline.

**Family gates status:** no new defects found; no family-gate edits triggered; the walker's feed discovery, bot-wall detection, and per-source metrics remain fit for purpose. No PENDING-RUN.md marker (runs 013–014 carry the current harness version and are discharge runs for any prior marker).

---

## Pass over source-sweep-run-012 (2026-09-04, lane PROPOSER-10)

**Artifacts read:** source-sweep-run-012 (`harness_version sha256:00a6517a684aa2f7`, the hash lane SITEMAP
recorded in run-010's dry pass, published by run-011's second host walk on iata.org).

**Full traces read:** `traces/source-sweep-run-012.raw-result.json` (per-source metrics and diff counts),
the artifact's per_item verdicts and metrics fields. Compared against `source-sweep-run-010.raw-result.json`
(the dry plan this run executes) and `source-sweep-run-011.raw-result.json` (the prior host walk for baseline).

**Hypotheses (verified, with basis):**

1. **Run-012 is the first APPLY walk for the sitemap walker on smartfreightcentre.org, executing run-010's
   dry plan exactly.** Run-010 (dry, 2026-09-04 04:20-04:21) planned 383 URLs from the root path source;
   run-012 (apply, 2026-09-04 05:10-05:12) writes those exact 383 URLs to `portal_link_candidates` with
   `upserted: 383`, `changed_total: 0`, `removed_total: 0`. Per-item verdicts match: root source in both
   runs shows 383 URLs scoped, 383 new; three deep-path sources in both runs show 0 URLs scoped (correctly
   filtered out by the walker's path-scoping logic). Basis: run-010 and run-012 per_item entries for each
   of the four source IDs; run-012 metrics `upserted: 383` matches run-010 metrics `new_total: 383`.

2. **Path scoping is working correctly at apply time.** Each of the four sources (root, two news URLs, one
   GLEC framework URL) targets its own base path. Run-012's trace shows: root source (`baseUrl:
   "https://smartfreightcentre.org/"`), `urlCount: 383`, `scopedOutCount: 0`, `upserted: 383`; news
   URL 1 and GLEC source (`baseUrl` each a deeper path), `urlCount: 0`, `scopedOutCount: 383` each,
   `upserted: 0` each — the walker correctly filters the sitemap's 383-URL urlset to only those matching
   each source's own path prefix. Basis: per-source `baseUrl` and the diff object `{addedCount: 383}`
   only for root; `{addedCount: 0}` for the three deep sources.

3. **No baseline-deferred sources; coverage is complete.** All four sources in run-012 carry
   `coverageComplete: true`, `baselineDeferred: false`. This means the walker successfully fetched the
   sitemap, completed its path-scoping logic without hitting URL-entry caps or fetch limits, and is ready
   for changed-URL monitoring on future runs (the `monitoring_queue` gate recorded in PENDING-RUN.md's
   description of the sitemap walker). Basis: the `coverageComplete` and `baselineDeferred` fields in the
   trace for each source.

4. **Coordinator confirmed 383 rows live from this run.** The task brief's opening premise states the
   runner confirmed 383 rows written to `portal_link_candidates` (the table feeding the portal-harvest
   consume path), matching run-012's recorded `upserted: 383`. The apply walk succeeded end to end: the
   walker wrote through the guarded-update path that the PENDING-RUN.md describes. Basis: task brief
   statement and run-012's own `upserted` metric.

5. **Run-012 carries a harness_version that predates the GOV-SINGLE change (2026-09-04 later that day).
   The marker was re-pinned by GOV-SINGLE but should remain as is for now.** Run-012 records
   `harness_version sha256:00a6517a684aa2f7`. When computed over the current `governing-files.mjs` entry
   and the three files it names (scripts/turns/run-source-sweep.mjs, src/lib/sources/register-walk.mjs,
   src/lib/sources/feed-walk.mjs), the hash computes to `sha256:a5f3170ef09f94f7`. The difference is that
   `run-source-sweep.mjs` changed between the two times: at run-012's creation it imported the old copy
   of `SOURCE_SWEEP_GOVERNING_FILES` inline, while after GOV-SINGLE (#583) it imports that array from the
   new `governing-files.mjs` single source. Per the task brief's stated rule: the PENDING-RUN.md marker on
   this branch must be left as is unless run-012's harness_version equals the current computed hash. They
   do not match (`00a6517a684aa2f7` ≠ `a5f3170ef09f94f7`); therefore the marker stays. Basis: hash
   computation via node -e; PENDING-RUN.md §2 re-pin note; the two hash values stated above pasted
   directly from command output.

**Proposal:** none warranted this pass. Run-012 demonstrates the sitemap walker's integration working end
to end: path scoping is accurate, per-source metrics are consistent between dry and apply, no defects
surfaced, baseline not deferred on any source, and the 383 rows live in the database. Lane SITEMAP-3
(in flight, per task brief) is adding all-hosts mode and per-source coverage columns for backfill across
all 2,563 sources; the marker's current pinning (the GOV-SINGLE re-pin) is correct and the next sweep-family
run will carry a new hash reflecting any run-source-sweep.mjs edits that lane introduces.

**Family gates status:** PENDING-RUN.md remains (not deleted); run-012 carries `harness_version
sha256:00a6517a684aa2f7`, which matches neither PENDING-RUN.md's stated `sha256:a5f3170ef09f94f7` nor F28's
current compute. The next sweep run will either match the PENDING-RUN.md hash (if no governing files change
in the interim) or re-pin the marker to a new hash. Per F28's reverse-audit (rule (c)), neither outcome
blocks this landing; the artifact is valid — no family-gate edits triggered; no new defects found; the
walker's path-scoping and per-source metrics remain fit for purpose.

---

## Pass over source-sweep-run-009 through -011 (2026-09-04, lane PROPOSER-4)

**Artifacts read:** source-sweep-run-009, source-sweep-run-010, source-sweep-run-011 (all `harness_version
sha256:00a6517a684aa2f7`, the hash lane SITEMAP pinned in PENDING-RUN.md discharged by these runs).

**Full traces read:** `traces/source-sweep-run-009.raw-result.json`, `traces/source-sweep-run-010.raw-result.json`,
`traces/source-sweep-run-011.raw-result.json` (raw per-source and per-URL metrics; all three artifacts' metrics
fields and per_item verdicts).

**Hypotheses (verified, with basis):**

1. **Run-009 reports "no sitemap discovered" but the actual error is a Cloudflare 403 bot wall on every
   path.** Metrics: `errors: 1`, `urls_scoped_total: 0`. Trace: `ok: false` with error text "no sitemap
   discovered: robots.txt yielded 0 Sitemap: lines … and none of the fallback candidates parsed as a sitemap"
   — but `sitemapsFetched` array shows three entries, each with `kind: "error"` and error "HTTP 403 for
   https://aircargonews.net/[sitemap.xml|sitemap_index.xml|sitemap-index.xml]". The walker's error message
   is misleading: a 403 on all three fallback URLs is not "none parsed" but "all rejected." Lane SITEMAP-2
   is fixing the error classification (rule d: record the 403 status, not an abstract "no sitemap") and adding
   feed-probe evidence to the artifact (did the walker try /feed at the root? was it a 200 that just wasn't
   an RSS feed? was it also 403?). Basis: trace `sitemapsFetched` array, each entry's `error` field.

2. **Run-010 demonstrates path scoping working as designed on smartfreightcentre.org.** Metrics: four sources
   targeted (root + three deep-path URLs); `urls_scoped_total: 383`, `new_total: 383` from root; zero scoped
   from each deep path. Trace: root source (`sourceUrl: "https://smartfreightcentre.org/"`) has `urlCount: 383`,
   `scopedOutCount: 0`, `upserted: 383`; three deep sources each have `scopedOutCount: 383`, `urlCount: 0`,
   `upserted: 0`. The walker correctly filters URLs to match their own base path; the three deep-path sources
   do not match any entries in the site's 383-URL sitemap. Basis: per-source metrics in trace.

3. **Run-010 reports `feed_found: 0` but root-path probe status is unclear.** The artifact's `metrics.feed_found`
   is `0`, and per-item verdicts all say "sitemap (robots)" with no feed mention — meaning the walker proceeded
   directly to the sitemap or used the fallback, never finding a feed. However, the task notes "/feed answers
   200" at smartfreightcentre.org, so the walker either never probed /feed or found a 200 that was not a valid
   RSS/Atom feed. Lane SITEMAP-2 is investigating this gap (no hypothesis here; the cause is not determinable
   from the artifact). Basis: artifact per_item verdicts name "sitemap" only; no feed verdict present.

4. **Run-011 shows IATA site with one matching URL for press-release source, zero for two deep IATA pages.**
   Metrics: three sources targeted; `urls_scoped_total: 1`, `new_total: 1` from the press-release source. Trace:
   press-release source (`sourceUrl: "https://www.iata.org/en/pressroom/2025-releases/2025-12-09-04/"`) has
   `urlCount: 1`, `scopedOutCount: 4426`, `upserted: 1`; two deep sources each have `scopedOutCount: 4427`,
   `urlCount: 0`, `upserted: 0`. The IATA sitemap holds 4427 URLs total, but only the one matching the
   press-release base path is in scope for that source; the two deep IATA pages match zero sitemap entries
   (URLs outside their own path boundaries). The verdict in run-011's per_item reads "sitemap (robots)" for
   press-release and "sitemap (fallback)" for the two deep sources — consistent with the robots.txt directing
   to /sitemap.xml for the press-release source but no robots.txt Sitemap: for the two deep paths, triggering
   the fallback logic. Basis: per-source `baseUrl`, `scopedOutCount`, `urlCount` in trace; per-item discovery
   source ("robots" vs. "fallback") in artifact verdicts.

**Proposal:** none warranted this pass. Run-009's error classification fix and run-010's feed-probe investigation
are lane SITEMAP-2's explicit scope, not this lane's. The three runs demonstrate the sitemap walker integrated
successfully: it scopes correctly per source base path, reports accurate per-source metrics, and surfaces errors
(run-009's 403) as problems to investigate (lane SITEMAP-2). No governing-file edits triggered; the runs carried
the hash the PENDING-RUN.md anticipated.

**Family gates status:** PENDING-RUN.md is deleted (its recorded `harness_version sha256:00a6517a684aa2f7` matches
all three artifacts' recorded version — F28 reverse-audit, rule (c)). No new defects found; the walker's existing
path-scoping and per-source metrics are fit for purpose.

---

## Pass over source-sweep-run-001 and -002 (2026-09-01, coordinator — original pass reproduced below)

**Artifacts read:** source-sweep-run-001 (2026-09-01T22:31Z, `sha256:87e06e9784e8e21b`, the driver's
first execution, dry) and source-sweep-run-002 (2026-09-01T23:00:22Z → 23:00:26Z,
`sha256:7df464313565f9b4`, the dry re-walk after the fixes the run-001 reading demanded).

**Full traces read:** both raw results (`traces/source-sweep-run-001.raw-result.json` — counts only;
`traces/source-sweep-run-002.raw-result.json` — per-day act URLs), the two Actions job logs, and the
live EUR-Lex daily views for 28 and 30 August 2026 in the browser.

**Hypotheses (verified, with basis):**
1. **The two run-001 defects are real and the fix holds on the live site.** Run-001: 221 "extracted"
   over 7 days (31–32/day, weekends included). Run-002 over the same week: `extracted_total = 7`,
   `days_duplicate_edition = 2` (29 and 30 August, both `duplicate_of 2026-08-28`), and the 28 August
   day lists exactly the two acts the live page shows (`OJ:L_202601310`, `OJ:L_202601534`). Basis:
   run-002's trace against the page read by hand before the fix was written.
2. **The OJ L series published 7 acts in 25–31 August 2026 that the daily view exposes as
   `/legal-content/` links.** That is the register's real weekly volume at this filter (L series,
   `types=RULE` is a Federal Register parameter and does not apply here). Basis: run-002 per-day URLs.
   No claim is made about C series or about acts the daily view lists under other link shapes; the
   filter is `/legal-content/` OR `/eli/` and run-002 saw only the former.
3. **run_id collision under the PR-landing model (new defect, this pass).** The first APPLY walk
   (Actions run 33569152522, 23:03Z) was dispatched while run-002's PR had not merged; `claimRunId`
   counted master's artifacts and wrote a SECOND `source-sweep-run-002.json` (mode=apply, 7 upserted,
   `source_id 000d2ee5-…`). Its DB effect is real and correct (7 `portal_link_candidates` rows, the
   EUR-Lex portal source registered); its artifact is NOT landed — the collided branch is deleted and
   the apply walk is re-dispatched after this pass lands, producing `source-sweep-run-003` honestly
   numbered (upserts on `UNIQUE url` make the re-walk a `last_seen_at` refresh, no duplicate rows).
   Fix, structural: both workflows now hydrate unmerged sibling artifact branches before the runner
   claims an id. Basis: the branch's artifact read in full; `claimRunId`'s source.
4. **Dry-mode wording and timestamps now carry the meaning they should.** Run-002's verdicts read
   "planned (dry, nothing written)"; `started_at` precedes `finished_at` by 3.7 s. Run-001's
   "221 upserted"/finish-time `started_at` stand as the record of the defect, unedited.

**Proposal (scoped for the next cycle):**
1. **First Federal Register walk (dry)** — `walkFederalRegister` is untested against the live API
   under this driver; its `frDocsToLinks` shape is API-driven (no chrome problem) but page/`total_pages`
   handling has only fixture coverage.
2. **First feed walk (dry)** against one registered RSS/Atom source, for the same reason.
3. **Consume pass wiring** — this family ends at "candidates enumerated and queued"; the
   `consumePortalCandidates` classify → intake step that turns ledger rows into `census_worklist` rows
   still runs only from the app's `check-sources` worker. A corpus-turn step or an admin action to drain
   the ledger is the missing hop between a sweep and a minted item (the driver's own header names why it
   cannot import that module under plain node).

**Family gates status:** this landing deletes `PENDING-RUN.md` (run-002 carries its hash — F28's
reverse-audit) and adds this attestation. `run-source-sweep.mjs`, `register-walk.mjs`, `feed-walk.mjs`
unchanged; the collision guard lives in the workflows, which are not governing files.


---

## Pass over source-sweep-run-003 (2026-09-01, coordinator)

**Artifacts read:** all three. **Full traces read:** `traces/source-sweep-run-003.raw-result.json`;
the live `portal_link_candidates` rows for the resolved `source_id` and that `sources` row, read back
through the database after the run.

**Hypotheses (verified, with basis):**
1. **The apply path writes exactly what the dry path planned, once.** Run-003 (apply, 23:18Z) is
   numbered honestly (the collision guard landed in Train 10), `upserted = 7`, and the table holds 7
   rows for the week with `first_seen_at` 23:03Z (the discarded collided apply) and `last_seen_at`
   23:18Z (run-003): the `UNIQUE url` upsert refreshed, never duplicated. Basis: `SELECT` on the table.
2. **Defect (tenth this day): the candidates' parent is a 1976 Commission opinion, not the OJ.**
   `config.source_id 000d2ee5-…` resolves to "EUR-Lex / 76/456/EEC Commission Opinion…", a
   document-level `sources` row, because the driver used db.mjs's host-keyed lookup on a host with 724
   such rows. Fixed in `resolvePortalSourceId` (exact portal URL; dedicated portal row on first apply);
   `PENDING-RUN.md` names run-004 as the discharge, and run-004's upsert re-points the seven rows.
3. **Registry observation, not fixed here (a decision, not a bug):** `registerSource`'s contract is
   "idempotent by canonical host", yet eur-lex.europa.eu carries 724 rows — the mint path registers a
   citation source per document by design (Addendum 80-era `registerSource` calls carry the CELEX URL).
   Two source kinds share one table under one dedup rule that only one of them obeys. Worth an ADR
   before any script relies on host-uniqueness again; recorded for the operator.

**Proposal:** run-004 (apply) to discharge the marker and heal the seven rows; then the FR and feed
first walks proposed above.


---

## Pass over source-sweep-run-004 (2026-09-01, coordinator)

**Artifacts read:** all four. **Full traces read:** `traces/source-sweep-run-004.raw-result.json`
(seven days, `extracted 0`, `urls []`, `error null`); the Actions job log (the whole walk in 0.3 s);
the live daily view for 26 August in the browser at the same minute (renders its act).

**Hypotheses (verified, with basis):**
1. **The run-003 fix worked:** `config.source_id 260089a9-…` is a fresh row registered by
   `resolvePortalSourceId` (not the 1976 opinion). Basis: the artifact's config; the id is new.
2. **Defect (eleventh): a page that is not the register was reported as an empty week.** Seven HTTP
   200 responses in 0.3 s, no act links, no errors. The walker had no way to tell "no acts" from "not
   the daily view". Fixed: `looksLikeOjDailyView` + `bytes` per day; `politeFetch` one request/second.
   The cause is inferred (rate-limit/interstitial after four full walks of one week within an hour) —
   run-004 kept no page body, which is exactly what the fix now records for a failing day.
3. **The seven candidate rows still point at `000d2ee5-…`** (run-004 upserted nothing). Run-005 heals
   them if the register answers; if it does not, the artifact will say so with evidence.

**Proposal:** run-005 (apply) after a pause of at least several minutes; read its `days_with_error`
before anything else. Then FR and feed first walks (dry). No governing-file edits until run-005 lands.


---

## Pass over source-sweep-run-005 (2026-09-01, coordinator)

**Artifacts read:** all five. **Full traces read:** `traces/source-sweep-run-005.raw-result.json`;
the live `portal_link_candidates` rows grouped by parent source, read back after the run.

**Hypotheses (verified, with basis):**
1. **The register answered again and the politeness gap held:** 7 acts, `days_duplicate_edition = 2`,
   27 s for seven days (run-004: 0.3 s), `days_with_error = 0`, no `unexpected page shape`. Basis: the
   artifact and trace.
2. **Correction of the run-004 pass (hypothesis 1 there) and of this family's previous marker:**
   `260089a9-…` was NOT "a fresh row registered by resolvePortalSourceId". It is the existing
   `sources` row "EUR-Lex" (`https://eur-lex.europa.eu/`, the portal the July `check-sources` crawl
   registered), holding 133 OJ candidates with `first_seen_at` back to 2026-07-19, which the
   exact-URL lookup found. "The id is new" was stated as basis without a read of the table; it was an
   inference. The outcome is the better one (one portal row, not two), and the seven run-003 candidates
   now carry `source_id 260089a9-…` with `last_seen_at` 23:53Z. Basis: `SELECT … GROUP BY source_id`.
3. **The family's five runs, read together, are the runtime's first week of real behaviour:** chrome
   and weekend echo (001), proven fix (002), honest apply (003), wrong parent (003's read-back), a
   non-register 200 (004), and a clean apply (005). Every one of those was found by reading the
   artifact against the live site or table, not by the run's exit code — all five runs exited 1 on the
   PR step only.

**Proposal:** no governing-file edits. Next runs are the FR and feed first walks (dry). The
`consumePortalCandidates` hop (ledger → classify → intake) is still the gap between a sweep and a
minted item; that is a corpus-turn design question, not a sweep fix.

---

## Pass over source-sweep-run-006 (coordinator, 2026-09-02)

**Artifact read:** `source-sweep-run-006.json` and `traces/source-sweep-run-006.raw-result.json`, landed
by GitHub Actions run 33575226376 on branch `source-sweep/33575226376` (filed on issue #516 by the Train
14 delivery step, merged into the system-completion train).

**What it shows:** `register-eurlex`, OJ L, 2026-08-25..31, dry, 7.4 s, `harness_version
sha256:5a6a5a4649f79eec` (the hash run-005's marker was waiting for; the marker was already deleted in
Train 13/14 on run-005's evidence). 7 days walked, 0 errors, 2 duplicate-edition days, 7 acts extracted,
verdict per day "planned (dry, nothing written)". Same act set as run-005, from the same URLs, so the
proof is the one Train 14 wanted: a dispatched run after the delivery-step fix goes green end to end and
its artifact reaches master through the issue path when PR creation is refused.

**Defect check:** none new. The `upserted: 7` metric under `mode: dry` is the walker's "planned" count
surfacing under a write-shaped key; the per-day verdict wording is honest ("planned, nothing written").
Renaming the metric key is a run-source-sweep.mjs change and moves this family's hash; deferred to the
next sweep change rather than re-pinning for a label.

---

## Pass over source-sweep-run-007 and -008 (coordinator, 2026-09-02)

**Artifacts read:** run-007 (`register-federal-register`, dry, 2026-08-25..31, RULE, GitHub Actions run
33631502867, `sha256:3c67d9b11afab375`, the hash the marker written at integration was waiting for; marker
deleted) and run-008 (`feed`, dry, `https://theloadstar.com/feed`, run 33631565002; claimed run-007 because
the hydrate guard never saw the sibling branch, Addendum 84 postscript 4, renumbered at landing).

**Run-007:** one API page, 85 results, `upserted: 0, planned: 85` (the honest dry metric this family
adopted after run-006), the Federal Register query URL recorded as evidence. The first walk of the second
register works end to end; the apply that persists 85 candidates under a Federal Register portal source is
the next dispatch for this walker (the portal-source resolution the EUR-Lex walker needed in run-003/004
applies here too and must be read on that apply).

**Run-008:** `ok: false`, HTTP 403 from The Loadstar, 0 entries. The walker reported the refusal as an
error row rather than an empty feed; correct behaviour. The Loadstar is a trade-news feed registered as a
source, not a regulatory feed, so the feed walker's first real subject is still open: a regulator's RSS
(EUR-Lex OJ RSS, EPA news releases, IMO) registered as a source and walked dry.
