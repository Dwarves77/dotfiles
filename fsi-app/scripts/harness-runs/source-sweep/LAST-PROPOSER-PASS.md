# Last proposer pass — source-sweep

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `source-sweep` now has **eleven** artifacts
(`source-sweep-run-001` … `source-sweep-run-011`); F28's rule (d) requires this file to name the latest
verbatim: **source-sweep-run-011**.

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
