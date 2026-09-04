#!/usr/bin/env node
// run-source-sweep.mjs — the source-sweep family's canonical entry point (RT lane, 2026-09-01,
// harness+flywheel completion train). A thin driver over TWO EXISTING, UNMODIFIED, pure/dep-injected
// modules that had a runtime nowhere in this repo before this file: `src/lib/sources/register-walk.mjs`
// (the date-paged EUR-Lex OJ / Federal Register index walk) and `src/lib/sources/feed-walk.mjs` (the
// RSS/Atom feed walk). Both were built "PURE + DEP-INJECTED: no network here" (see each module's own
// header) — this script is the live binding: real `fetch`-based deps, a real persist sink, and a real
// harness-run artifact, the same shape `scripts/connections/discover-for-items.mjs` and
// `scripts/forward-events/run-extraction.mjs` already give their own families.
//
// WHY NOT IMPORT `persistPortalCandidates` DIRECTLY (the "ONE ledger write-site" both walkers' own
// headers name as the thing their injected `persist` should be). VERIFIED by attempting exactly that
// import under plain `node` (no bundler): `src/lib/intake/portal-harvest.ts` transitively imports
// `apply-staged-update.ts` and `run-intake-cycle.ts`, both of which import via the `@/lib/...` TS path
// alias (`tsconfig.json`'s `"paths": {"@/*": ["./src/*"]}`, a `moduleResolution: "bundler"` construct)
// — an alias only Next.js's own bundler resolves. Node's native loader throws
// `Cannot find package '@/lib'...` the instant that module graph is imported with no bundler present.
// `register-walk.mjs` / `feed-walk.mjs` themselves have no such alias (traced: `portal-links.mjs` and
// `entity-gate.mjs`, their only imports, import nothing at all), which is exactly why THEY are safe to
// import directly here and `portal-harvest.ts` is not. `upsertPortalLinkCandidates` below therefore
// MIRRORS `persistPortalCandidates`'s exact contract (same table, same `onConflict: "url"`, same
// last_seen_at/anchor_text-only refresh — verified against migration 162's schema and that function's
// own source) rather than importing it — this is a duplication of eight lines, not of any decision.
//
// PIPELINE THIS FEEDS: a walker's `persist` writes to `portal_link_candidates` (migration 162) — the
// SAME discovery ledger the scheduled `check-sources` crawl's `persistPortalCandidates` call writes to
// (register-walk.mjs's own header: "Both walkers FEED THE SAME LEDGER B1 consumes"). That ledger is
// classified and dispositioned downstream by `consumePortalCandidates`
// (`src/lib/intake/portal-harvest.ts`), which is what actually reaches
// `src/lib/intake/census-writer.mjs`'s `census_worklist` rows — a separate, existing, `@/`-alias-bearing
// consume pass this driver does not re-invoke (out of scope for an enumeration-only sweep; see the
// module header above for why it cannot be imported from a plain script). This driver's job ends at
// "candidates enumerated and queued," matching its brief ("ingestion at scale").
//
// MODES: --mode dry fetches + parses for real (both walkers' own real HTTP calls) and prints the plan —
// candidates discovered, per-day/per-page breakdown — but the `persist` injection counts instead of
// writing. --mode apply does the same walk AND writes through `upsertPortalLinkCandidates` (guarded
// client — the same NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY pair every other guarded script
// in this repo requires). This mirrors `.github/workflows/producers.yml`'s own mode-input wording
// verbatim: "dry = fetch, parse, print the plan, write nothing. apply = write through the guarded path."
//
// ALWAYS records a harness-run artifact (`scripts/lib/run-artifact.mjs`), in both modes, from a `finally`
// block — so a walker that throws mid-run (network flake, HTTP error) still leaves a record, the same
// crash-safety `run-extraction.mjs` and `run-mint-batch.mjs` already apply to their own families.
//
// Usage:
//   node scripts/turns/run-source-sweep.mjs --walker register-eurlex --from 2026-08-25 --to 2026-08-31 --mode dry
//   node scripts/turns/run-source-sweep.mjs --walker register-federal-register --from 2026-08-25 --to 2026-08-31 --mode apply [--types RULE,PRORULE] [--term ...] [--max-pages 5]
//   node scripts/turns/run-source-sweep.mjs --walker feed --feed-url https://example.gov/feed.xml --mode dry
// Exit 0 done · 1 bad args · 2 no DB creds (cannot run here).

import { parseArgs as nodeParseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { walkEurlexOj, walkFederalRegister } from "../../src/lib/sources/register-walk.mjs";
import { walkFeed } from "../../src/lib/sources/feed-walk.mjs";
// walkSource (lane SITEMAP, 2026-09-04): the third walker, added by CALLING an unmodified module —
// same "driver calls, never edits, the walker modules" posture register-walk.mjs/feed-walk.mjs already
// have (see SOURCE_SWEEP_GOVERNING_FILES's own note below on why this new pair is NOT added to that
// array/F28's hash yet). DEFAULT_MAX_SITEMAP_FETCHES/DEFAULT_MAX_SITEMAP_ENTRIES are this driver's own
// --max-sitemap-fetches/--max-sitemap-entries defaults, mirroring the module's own.
import { walkSource, DEFAULT_MAX_SITEMAP_FETCHES, DEFAULT_MAX_SITEMAP_ENTRIES } from "../../src/lib/sources/sitemap-walk.mjs";
import { writeRunArtifact, hashHarnessVersion, claimRunId } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const DEFAULT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "source-sweep");
const ROOT = FSI_ROOT;

// This family's governing files — the driver plus the two dormant walker modules it gives a runtime to.
// IMPORTED from scripts/harness-runs/governing-files.mjs (Wave GOV-SINGLE, 2026-09-04), re-exported under
// this historical name so existing importers (including run-source-sweep.test.mjs's own 3-entry assertion
// below) keep working unchanged — F28's own copy and this runner's self-hash are now the same array by
// construction, not three hand-synced ones.
//
// DELIBERATELY NOT EXTENDED to src/lib/sources/sitemap-walk.mjs / feed-discovery.mjs (lane SITEMAP,
// 2026-09-04, added the "sitemap" walker below that CALLS both — same "driver calls, never edits, the
// walker modules" relationship this array already documents for the other two). Adding them here would
// move this family's `harness_version` hash, which F28's rule (c) (staleness coupling,
// `.discipline/fitness/functions/F28-harness-run-integrity.mjs`) requires EITHER a fresh valid artifact
// carrying the new hash, OR a `scripts/harness-runs/source-sweep/PENDING-RUN.md` acknowledging it — a
// lane extending this family's coverage should edit governing-files.mjs (the single source, since this
// change) and land the acknowledging marker (or the run) in the same commit; that edit now propagates to
// F28 and this runner together, by construction, so there is no longer a second or third copy to remember.
export const SOURCE_SWEEP_GOVERNING_FILES = GOVERNING_FILES['source-sweep'];

const WALKERS = Object.freeze(["register-eurlex", "register-federal-register", "feed", "sitemap"]);

// --limit's default for --walker sitemap: how many SCOPED, CURRENT sitemap url entries one dispatch will
// diff/persist per source (sitemap-walk.mjs's own `limit` opt) — a safety valve distinct from the walk-
// time --max-sitemap-fetches/--max-sitemap-entries budgets. 5,000 is generous for one regulator source's
// sitemap while still bounding a single dispatch against a source whose sitemap lists far more.
export const DEFAULT_SITEMAP_LIMIT = 5000;

// --max-hosts's default for --walker sitemap --all-hosts (lane SITEMAP-3, 2026-09-04). THE ARITHMETIC
// (the operator's own framing was "a backfill of 2,563 sources is 2,563 dispatches today" — this default
// is what turns that into ~17):
//
//   workflow timeout ............... 1800 s  (.github/workflows/source-sweep.yml `timeout-minutes: 30`)
//   non-walk overhead reserved ....... 300 s  (checkout + setup-node + `npm ci` + the sibling-artifact
//                                              hydrate step + the final commit/PR step — none of this is
//                                              the walk loop; 5 min is a generous, not measured, reserve)
//   walk budget ..................... 1500 s  (1800 - 300)
//   measured per-ROW cost .............14 s   [CONFIRMED, source-sweep-run-010, a real dispatch,
//                                              2026-09-04T04:20:24–04:21:20Z: 4 `sources` rows on ONE
//                                              host (smartfreightcentre.org), 56 s wall time / 4 rows.
//                                              --all-hosts still walks every row on a selected host (the
//                                              existing --host behavior, unchanged — see
//                                              selectAllHostsTargets's own doc for why: two rows on the
//                                              same host can be scoped to different paths via
//                                              sourceContentPath/isUrlWithinSourcePath, so collapsing to
//                                              one walk per host would silently drop path-scoped
//                                              candidates for every row but the one walked), so the
//                                              budget is spent per ROW, grouped by host for SELECTION and
//                                              ORDERING only.]
//   active sources ................... 1630   [CONFIRMED SQL, 2026-09-04: `select count(*) from sources
//                                              where status='active'`]
//   distinct active hosts .............. 646   [CONFIRMED SQL, 2026-09-04: distinct lower(host), www-
//                                              stripped, over status='active' rows]
//   avg rows per active host .......... 2.52   (1630 / 646)
//   avg cost per host ................ ~35 s   (14 s/row * 2.52 rows/host)
//   DEFAULT_MAX_HOSTS = floor(1500 / 35) ....... 42, rounded DOWN to a flatter number for headroom
//                                              against hosts whose sitemap needs index fan-out (more than
//                                              one document fetch) or whose feed-candidate probing runs
//                                              the full, unscoped 6-candidate list before falling through
//                                              to the sitemap path (this repo has no live measurement of
//                                              THAT worse case yet — 42 already has ~17% headroom built
//                                              in over the observed-case arithmetic above, so 40 keeps a
//                                              round number without spending real headroom on rounding).
//   -> 646 hosts / 40 per run ≈ 16.15, i.e. ceil(16.15) = 17 dispatches (not 2,563) sweep every active
//   host once (16 full 40-host dispatches cover only 640 of 646 — a 17th, partial, dispatch is still
//   needed for the remaining 6; matches CORPUS-TURN-RUNBOOK.md's "The sitemap walker" section, which
//   states the same ⌈646/40⌉ = 17 independently).
//
// SUPERSEDED AS THE HARD STOP (lane SWEEP-BUDGET, 2026-09-04) [CONFIRMED, GitHub Actions 2026-09-04]:
// this 35 s/host figure is an AVERAGE — the tail (sitemap-index fan-out, a slow host, unscoped feed-
// candidate probing) is unbounded, and nothing here ever checked wall-clock time. Sweep #14 (40 hosts)
// ran 13m24s and #15 (40 hosts) 14m57s; #16 (70 hosts, i.e. `--max-hosts` raised past this constant's own
// documented ceiling) ran past `.github/workflows/source-sweep.yml`'s `timeout-minutes: 30` and was
// KILLED with NO artifact — the workflow's own crash-safety (`finally` block, this file's header) cannot
// save a run GitHub Actions kills outright. `--max-hosts` is now a CEILING on how many hosts one
// dispatch is willing to ATTEMPT, never a floor and never what stops a run in time — DEFAULT_TIME_BUDGET_
// SECONDS below is the hard stop: `main()`'s sitemap loop checks elapsed wall-clock time before every
// source and returns whatever it completed as an honest, bounded, exit-0 unit of work, the same posture
// register-walk.mjs's `walkFederalRegister` already applies to its own page cap.
//
// Always overridable per dispatch via --max-hosts.
export const DEFAULT_MAX_HOSTS = 40;

// --time-budget-seconds's default (lane SWEEP-BUDGET, 2026-09-04): the sitemap walker's WALL-CLOCK hard
// stop for `--all-hosts`/`--host`/`--source-id` alike (the SAME `for (const src of targets)` loop serves
// all three selectors) — SAME arithmetic DEFAULT_MAX_HOSTS's own comment already computed, just no longer
// left unenforced:
//   workflow timeout ............... 1800 s  (.github/workflows/source-sweep.yml `timeout-minutes: 30`)
//   non-walk overhead reserved ....... 300 s  (checkout + setup-node + `npm ci` + the sibling-artifact
//                                              hydrate step + the final commit/PR step — none of this is
//                                              the walk loop; 5 min is a generous, not measured, reserve)
//   walk budget ..................... 1500 s  (1800 - 300)  -> DEFAULT_TIME_BUDGET_SECONDS
// Checked BEFORE each source (`checkTimeBudget`/`walkTargetsWithinBudget` below), never mid-source — a
// single source's own walk is bounded separately (`--max-sitemap-fetches`, `--max-sitemap-entries`, and
// now each individual fetch's own timeout — see `SOURCE_SWEEP_FETCH_TIMEOUT_MS` in `main()`). When the
// budget runs out the run still exits 0: a bounded, complete unit of work, not an error — see
// `shapeRunOutput`'s `budget_exhausted`/`sources_not_reached` fields for what a proposer or the
// coordinator reads back. Always overridable per dispatch via --time-budget-seconds (blank = this
// default).
export const DEFAULT_TIME_BUDGET_SECONDS = 1500;

function usage() {
  return (
    "Usage: node scripts/turns/run-source-sweep.mjs\n" +
    "         --walker <register-eurlex|register-federal-register|feed|sitemap>\n" +
    "         --mode <dry|apply> [--from ISO-date] [--to ISO-date] [--feed-url url] [--series L|C]\n" +
    "         [--types RULE,PRORULE] [--term text] [--max-pages N] [--per-page N] [--source-name name]\n" +
    "         [--source-id uuid | --host hostname | --all-hosts] [--max-hosts N] [--time-budget-seconds N] [--limit N]\n" +
    "         [--max-sitemap-fetches N] [--max-sitemap-entries N] [--check-coverage]\n" +
    "         [--harness-runs-dir dir] [--out-dir dir]"
  );
}

/** Pure CLI arg parse/validate. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: Array.isArray(argv) ? argv : [],
      options: {
        walker: { type: "string" },
        mode: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        "feed-url": { type: "string" },
        series: { type: "string", default: "L" },
        types: { type: "string", default: "RULE" },
        term: { type: "string" },
        "max-pages": { type: "string", default: "5" },
        "per-page": { type: "string", default: "100" },
        "source-name": { type: "string" },
        "source-id": { type: "string" },
        host: { type: "string" },
        "all-hosts": { type: "boolean", default: false },
        "max-hosts": { type: "string", default: String(DEFAULT_MAX_HOSTS) },
        "time-budget-seconds": { type: "string", default: String(DEFAULT_TIME_BUDGET_SECONDS) },
        "check-coverage": { type: "boolean", default: false },
        limit: { type: "string" },
        "max-sitemap-fetches": { type: "string", default: String(DEFAULT_MAX_SITEMAP_FETCHES) },
        "max-sitemap-entries": { type: "string", default: String(DEFAULT_MAX_SITEMAP_ENTRIES) },
        "harness-runs-dir": { type: "string" },
        "out-dir": { type: "string" },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }

  if (!values.walker || !WALKERS.includes(values.walker)) {
    return { ok: false, error: `--walker must be one of ${WALKERS.join(", ")} (got ${JSON.stringify(values.walker)}).` };
  }
  if (values.mode !== "dry" && values.mode !== "apply") {
    return { ok: false, error: `--mode must be "dry" or "apply" (got ${JSON.stringify(values.mode)}).` };
  }
  if (values.walker === "feed") {
    if (!values["feed-url"]) return { ok: false, error: "--feed-url is required for --walker feed." };
  } else if (values.walker === "sitemap") {
    if (values["check-coverage"]) {
      // --check-coverage (lane SITEMAP-3, 2026-09-04): a read-only report over `sources`' sitemap-coverage
      // columns (migration 304) — it selects no walk targets at all, so --source-id/--host/--all-hosts are
      // refused alongside it (naming a selector for a mode that never walks anything is a caller mistake,
      // not a valid combination), and it never writes, so --mode must say so honestly.
      if (values["source-id"] || values.host || values["all-hosts"]) {
        return { ok: false, error: "--check-coverage is read-only and takes no selector — --source-id/--host/--all-hosts are refused alongside it." };
      }
      if (values.mode !== "dry") {
        return { ok: false, error: "--check-coverage never writes — pass --mode dry (there is nothing for --mode apply to do)." };
      }
    } else {
      const selectors = ["source-id", "host", "all-hosts"].filter((k) => values[k]);
      if (selectors.length !== 1) {
        return { ok: false, error: "--source-id, --host, or --all-hosts is required for --walker sitemap (exactly one)." };
      }
    }
  } else {
    if (!values.from || Number.isNaN(Date.parse(values.from))) {
      return { ok: false, error: `--from must be a parseable ISO date for a register walker (got ${JSON.stringify(values.from)}).` };
    }
    if (!values.to || Number.isNaN(Date.parse(values.to))) {
      return { ok: false, error: `--to must be a parseable ISO date for a register walker (got ${JSON.stringify(values.to)}).` };
    }
  }
  const maxPages = Number(values["max-pages"]);
  const perPage = Number(values["per-page"]);
  if (!Number.isFinite(maxPages) || maxPages <= 0) return { ok: false, error: "--max-pages must be a positive number." };
  if (!Number.isFinite(perPage) || perPage <= 0) return { ok: false, error: "--per-page must be a positive number." };

  let limit = DEFAULT_SITEMAP_LIMIT;
  if (values.limit !== undefined) {
    const n = Number(values.limit);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: `--limit must be a positive number (got ${JSON.stringify(values.limit)}).` };
    limit = n;
  }
  const maxSitemapFetches = Number(values["max-sitemap-fetches"]);
  const maxSitemapEntries = Number(values["max-sitemap-entries"]);
  if (!Number.isFinite(maxSitemapFetches) || maxSitemapFetches <= 0) {
    return { ok: false, error: "--max-sitemap-fetches must be a positive number." };
  }
  if (!Number.isFinite(maxSitemapEntries) || maxSitemapEntries <= 0) {
    return { ok: false, error: "--max-sitemap-entries must be a positive number." };
  }
  const maxHosts = Number(values["max-hosts"]);
  if (!Number.isFinite(maxHosts) || maxHosts <= 0) {
    return { ok: false, error: "--max-hosts must be a positive number." };
  }
  const timeBudgetSeconds = Number(values["time-budget-seconds"]);
  if (!Number.isFinite(timeBudgetSeconds) || timeBudgetSeconds <= 0) {
    return { ok: false, error: "--time-budget-seconds must be a positive number." };
  }

  return {
    ok: true,
    walker: values.walker,
    mode: values.mode,
    from: values.from || null,
    to: values.to || null,
    feedUrl: values["feed-url"] || null,
    series: values.series,
    types: values.types.split(",").map((t) => t.trim()).filter(Boolean),
    term: values.term || undefined,
    maxPages,
    perPage,
    sourceName: values["source-name"] || null,
    sourceId: values["source-id"] || null,
    host: values.host || null,
    allHosts: Boolean(values["all-hosts"]),
    maxHosts,
    timeBudgetSeconds,
    checkCoverage: Boolean(values["check-coverage"]),
    limit,
    maxSitemapFetches,
    maxSitemapEntries,
    harnessRunsDir: values["harness-runs-dir"] || null,
    outDir: values["out-dir"] || null,
  };
}

/** The canonical portal `{url, name}` this walker's discovered links should be attached to as their
 *  parent source. PURE. `feed`'s url/name are per-invocation (the feed itself); the two register walkers
 *  have one fixed home each. */
export function portalFor({ walker, feedUrl, sourceName }) {
  if (walker === "register-eurlex") {
    return { url: "https://eur-lex.europa.eu", name: sourceName || "EUR-Lex Official Journal" };
  }
  if (walker === "register-federal-register") {
    return { url: "https://www.federalregister.gov", name: sourceName || "Federal Register" };
  }
  return { url: feedUrl, name: sourceName || new URL(feedUrl).host };
}

/** Mirrors `persistPortalCandidates` (`src/lib/intake/portal-harvest.ts`) EXACTLY: upsert on the ledger's
 *  UNIQUE `url`, refreshing only `last_seen_at`/`anchor_text` — `status`/`first_seen_at`/disposition
 *  columns are never touched by a re-crawl. See this file's header for why it is mirrored, not imported.
 *  Non-fatal per link (a failed upsert is counted, never thrown), matching that function's own contract. */
export async function upsertPortalLinkCandidates(sb, sourceId, links) {
  let upserted = 0, failed = 0;
  for (const l of links) {
    const { error } = await sb.from("portal_link_candidates").upsert(
      { source_id: sourceId, url: l.url, anchor_text: l.anchorText ?? null, last_seen_at: new Date().toISOString() },
      { onConflict: "url" }
    );
    if (error) { failed++; continue; }
    upserted++;
  }
  return { upserted, failed };
}

/** Select which `sources` rows a --walker sitemap run targets (lane SITEMAP, 2026-09-04): exactly the
 *  one row named by `sourceId`, or every ACTIVE row whose host matches `host` (case-insensitive,
 *  www-stripped) — unlike register-eurlex/register-federal-register/feed, which each attach to ONE fixed
 *  or caller-named endpoint, `sitemap` sweeps a slice of the existing `sources` table directly (the
 *  regulator-website rows neither register-walk.mjs nor feed-walk.mjs can reach), so its scope flags name
 *  ROWS, not a portal to newly register. `--source-id` intentionally does NOT filter by status (an
 *  explicit single target may be a probe against a currently-inaccessible row); `--host` does, so a bulk
 *  sweep never spends a fetch on a source already marked dead. PURE.
 *  @param {Array<{id:string,url:string,name?:string,status?:string}>} rows
 *  @param {{sourceId:string|null, host:string|null}} opts @returns {Array<object>} */
export function selectSitemapSources(rows, { sourceId, host }) {
  if (sourceId) return rows.filter((r) => r.id === sourceId);
  const wantHost = String(host || "").toLowerCase().replace(/^www\./, "");
  return rows.filter((r) => r.status === "active" && hostKeyOf(r.url) === wantHost);
}

/** Lowercase, www-stripped hostname of a URL, or `null` when it does not parse. PURE. Shared by
 *  `selectSitemapSources`'s `--host` filter and every `--all-hosts` grouping/ordering function below —
 *  one definition of "what host does this source belong to," not two independently hand-written ones.
 *  @param {string} url @returns {string|null} */
export function hostKeyOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

/** Group every ACTIVE `sources` row with a parseable `url` by `hostKeyOf` (lane SITEMAP-3, 2026-09-04:
 *  `--walker sitemap --all-hosts`'s selection step). A row whose `url` does not parse is silently
 *  excluded (it could never be walked anyway — `selectSitemapSources`'s own `--host` path has the same
 *  failure mode via its try/catch). PURE.
 *  @param {Array<{id:string,url:string,status?:string}>} rows
 *  @returns {Array<{host:string, rows:object[]}>} insertion-ordered by first sighting of each host */
export function groupActiveSourcesByHost(rows) {
  const order = [];
  const byHost = new Map();
  for (const r of rows) {
    if (r.status !== "active") continue;
    const host = hostKeyOf(r.url);
    if (!host) continue;
    if (!byHost.has(host)) { byHost.set(host, []); order.push(host); }
    byHost.get(host).push(r);
  }
  return order.map((host) => ({ host, rows: byHost.get(host) }));
}

/** One host-group's sitemap-coverage state, read from `sources.sitemap_last_walked_at` (migration 304 —
 *  present on every row once that migration is applied; `undefined`/`null` on a row from before it, or a
 *  row this host's own sitemap walk has never reached). `neverWalked` is true only when EVERY row in the
 *  group has never been walked — a host with one walked row and one never-walked row is NOT "never
 *  walked" (it has SOME coverage; a fresh dispatch should treat it as "walked, oldest-first," not jump it
 *  to the front of the never-walked queue ahead of a host with zero coverage at all). PURE.
 *  @param {Array<{sitemap_last_walked_at?:string|null}>} rows
 *  @returns {{neverWalked:boolean, oldestWalkedAt:string|null}} */
export function hostSitemapCoverage(rows) {
  const stamps = rows.map((r) => r.sitemap_last_walked_at).filter(Boolean).sort();
  return { neverWalked: stamps.length === 0, oldestWalkedAt: stamps.length ? stamps[0] : null };
}

/** Order host groups for a sweep: hosts with NO walked row first (this run's whole point — cover
 *  ground never touched before it re-touches ground it already has), then hosts that HAVE been walked
 *  before, oldest-coverage-first (a host whose sitemap was last checked longest ago is the thinnest/
 *  staleest coverage among the ones already covered once). Each bucket is a stable sort (ties broken by
 *  host name, ascending) so two runs given an identical snapshot of `sources` produce an identical order
 *  — this IS the resumability property (build plan brief: "resumable because the next run's ordering
 *  starts where coverage is thinnest"). PURE.
 *  @param {Array<{host:string, rows:object[]}>} hostGroups
 *  @returns {Array<{host:string, rows:object[], coverage:{neverWalked:boolean, oldestWalkedAt:string|null}}>} */
export function orderHostGroupsForSweep(hostGroups) {
  const withCoverage = hostGroups.map((g) => ({ ...g, coverage: hostSitemapCoverage(g.rows) }));
  const byHostAsc = (a, b) => (a.host < b.host ? -1 : a.host > b.host ? 1 : 0);
  const neverWalked = withCoverage.filter((g) => g.coverage.neverWalked).sort(byHostAsc);
  const walked = withCoverage
    .filter((g) => !g.coverage.neverWalked)
    .sort((a, b) => {
      const ao = a.coverage.oldestWalkedAt, bo = b.coverage.oldestWalkedAt;
      if (ao < bo) return -1;
      if (ao > bo) return 1;
      return byHostAsc(a, b);
    });
  return [...neverWalked, ...walked];
}

/** `--all-hosts`'s full selection: group ACTIVE sources by host, order by coverage thinness
 *  (`orderHostGroupsForSweep`), take the first `maxHosts` host groups, flatten back to the SOURCE ROWS
 *  those hosts contain (every row on a selected host is targeted — see `DEFAULT_MAX_HOSTS`'s own comment
 *  for why a host is not collapsed to one representative row: distinct rows on one host can be scoped to
 *  distinct content paths). PURE.
 *  @param {Array<{id:string,url:string,status?:string,sitemap_last_walked_at?:string|null}>} rows
 *  @param {{maxHosts:number}} opts
 *  @returns {{
 *    targets: object[],
 *    hostsSelected: string[],
 *    hostsTotalActive: number,
 *    hostsNeverWalkedBefore: number,
 *    hostsRemainingUnwalkedAfter: number,
 *  }} */
export function selectAllHostsTargets(rows, { maxHosts }) {
  const ordered = orderHostGroupsForSweep(groupActiveSourcesByHost(rows));
  const selected = ordered.slice(0, Math.max(0, maxHosts));
  const hostsNeverWalkedBefore = ordered.filter((g) => g.coverage.neverWalked).length;
  const neverWalkedSelected = selected.filter((g) => g.coverage.neverWalked).length;
  return {
    targets: selected.flatMap((g) => g.rows),
    hostsSelected: selected.map((g) => g.host),
    hostsTotalActive: ordered.length,
    hostsNeverWalkedBefore,
    hostsRemainingUnwalkedAfter: hostsNeverWalkedBefore - neverWalkedSelected,
  };
}

/** The five coverage columns migration 304 adds to `sources`, computed from one targeted row's walk
 *  `outcome` (as built in `main()`'s sitemap branch — `{kind:'feed'|'sitemap'|'error', ok?, ...}`), for a
 *  guarded write through `db.mjs`'s existing path. PURE (no I/O, no `Date.now()` — `nowIso` is injected so
 *  this is independently testable against a fixed clock).
 *
 *  WHICH KEYS APPEAR, AND WHY. `walkSource` (sitemap-walk.mjs) always tries feed discovery BEFORE ever
 *  reaching a sitemap fetch, so by the time `kind` is known to be `'feed'` or `'sitemap'`, a feed probe
 *  DEFINITELY ran — `feed_last_probed_at` is stamped for both. `kind:'error'` is the one case this driver
 *  cannot make that claim for (an uncaught exception from `walkSource` — main()'s own per-source try/catch
 *  — could have thrown before `discoverFeed` even started), so `feed_last_probed_at` is left OUT of an
 *  error patch rather than asserted on a guess. `sitemap_url`/`sitemap_url_count` are the walk's OWN
 *  findings about the sitemap itself, so they appear ONLY when a sitemap was actually, successfully
 *  walked (`kind:'sitemap' && ok:true`) — a `'feed'` outcome (sitemap never reached this walk) or an
 *  error/`no_sitemap`/`bot_wall` outcome (no reliable sitemap URL to record) leaves them OUT of the patch
 *  entirely, so a PRIOR walk's still-valid `sitemap_url`/`sitemap_url_count` on that row is never
 *  overwritten with a null this walk did not actually determine. `sitemap_last_walked_at` and
 *  `sitemap_walk_outcome`, by contrast, ALWAYS appear (even on `'error'`) — an attempt was made regardless
 *  of what it found, and stamping the timestamp on every outcome (not only success) is what lets
 *  `orderHostGroupsForSweep` make forward progress past a host that keeps failing the same way, rather
 *  than re-selecting it at the front of the "never walked" bucket on every future run forever.
 *  @param {{kind:'feed'|'sitemap'|'error', ok?:boolean, discoverySource?:string,
 *           sitemapsFetched?:Array<{url:string}>, urlCount?:number}} outcome
 *  @param {string} nowIso
 *  @returns {{sitemap_last_walked_at:string, sitemap_walk_outcome:string, feed_last_probed_at?:string,
 *             sitemap_url?:string|null, sitemap_url_count?:number}} */
export function buildSitemapCoveragePatch(outcome, nowIso) {
  const patch = { sitemap_last_walked_at: nowIso };
  if (outcome.kind === "feed") {
    patch.sitemap_walk_outcome = "feed_only";
    patch.feed_last_probed_at = nowIso;
  } else if (outcome.kind === "sitemap") {
    patch.feed_last_probed_at = nowIso; // walkSource always probes feed first, even on the sitemap path
    if (outcome.ok) {
      patch.sitemap_walk_outcome = "walked";
      patch.sitemap_url = outcome.sitemapsFetched?.[0]?.url ?? null;
      patch.sitemap_url_count = outcome.urlCount ?? 0;
    } else if (outcome.discoverySource === "bot_wall") {
      patch.sitemap_walk_outcome = "bot_wall";
    } else {
      patch.sitemap_walk_outcome = "no_sitemap";
    }
  } else {
    // kind === "error": an uncaught exception — no reliable claim about which phase failed.
    patch.sitemap_walk_outcome = "unfetchable";
  }
  return patch;
}

/** `--check-coverage`'s read-only report (lane SITEMAP-3, 2026-09-04): sources total (every status),
 *  active total, how many of the ACTIVE rows have ever been sitemap-walked vs never, a breakdown by
 *  `sitemap_walk_outcome` (a never-walked active row counts under the synthetic key `'never_walked'`,
 *  never silently omitted), and how many rows (any status — matches the operator's own framing, "did you
 *  do mapping of rss feeds," which was never scoped to active-only) carry a populated `rss_feed_url`. PURE
 *  — reads exactly the columns `main()`'s sitemap branch already selects, no extra query.
 *  @param {Array<{status?:string, sitemap_last_walked_at?:string|null, sitemap_walk_outcome?:string|null,
 *                 rss_feed_url?:string|null}>} rows
 *  @returns {{sourcesTotalAll:number, sourcesActiveTotal:number, sitemapWalkedActive:number,
 *             sitemapUnwalkedActive:number, walkOutcomeCounts:Record<string,number>,
 *             feedUrlPopulated:number}} */
export function buildCoverageReport(rows) {
  const active = rows.filter((r) => r.status === "active");
  const walkOutcomeCounts = {};
  let walked = 0;
  for (const r of active) {
    if (r.sitemap_last_walked_at) walked++;
    const key = r.sitemap_walk_outcome || "never_walked";
    walkOutcomeCounts[key] = (walkOutcomeCounts[key] || 0) + 1;
  }
  return {
    sourcesTotalAll: rows.length,
    sourcesActiveTotal: active.length,
    sitemapWalkedActive: walked,
    sitemapUnwalkedActive: active.length - walked,
    walkOutcomeCounts,
    feedUrlPopulated: rows.filter((r) => r.rss_feed_url).length,
  };
}

/** Build this run's per_item / metrics / inputs_ref / full_trace_refs from one walker's raw result.
 *  PURE (no I/O) so the shaping is independently testable. `reportPath` is where the raw result was
 *  written on disk (the artifact's full_trace_refs pointer). */
export function shapeRunOutput(walker, result, reportPath, mode = "apply") {
  // In dry mode the injected persist() COUNTS the plan and writes nothing, so a count labelled
  // "upserted" would assert a write that never happened (source-sweep-run-001 read "221 upserted"
  // for a run that wrote 0 rows). The metric key `upserted` (the per-family standing metric in
  // CONVENTION.md reads it) therefore carries 0 in dry mode and the plan size moves to `planned`;
  // `mode` is carried alongside and every verdict names what the number is. (source-sweep-run-006,
  // dry, still read `upserted: 7` under the previous shaping; fixed at the system-completion train's
  // integration, 2026-09-02, rather than deferred.)
  const wrote = mode === "apply";
  const verb = wrote ? "upserted" : "planned (dry, nothing written)";
  const writeMetrics = (n) => (wrote ? { upserted: n } : { upserted: 0, planned: n });
  if (walker === "register-eurlex") {
    const perItem = result.days.map((d) => ({
      id: d.day,
      outcome: d.error ? "error" : d.duplicate_of ? "duplicate_edition" : "walked",
      verdict: d.duplicate_of
        ? `EUR-Lex served the ${d.duplicate_of} edition again (no publication this date) — 0 extracted, nothing re-persisted`
        : `${d.extracted} act link(s) extracted, ${d.upserted} ${verb}`,
      evidence_refs: [d.url],
      error: d.error ?? null,
    }));
    const metrics = {
      register: result.register, series: result.series, from: result.from, to: result.to, mode,
      days_walked: result.days.length,
      days_with_error: result.days.filter((d) => d.error).length,
      days_duplicate_edition: result.days.filter((d) => d.duplicate_of).length,
      extracted_total: result.days.reduce((s, d) => s + d.extracted, 0),
      ...writeMetrics(result.upserted), failed: result.failed,
    };
    return { perItem, metrics, inputsRef: result.days.map((d) => d.url), fullTraceRefs: [reportPath] };
  }
  if (walker === "register-federal-register") {
    const perItem = result.pages.map((p) => ({
      id: `page-${p.page}`,
      outcome: "walked",
      verdict: `${p.results} result(s), ${p.upserted} ${verb}`,
      evidence_refs: [p.url],
      error: null,
    }));
    const metrics = {
      register: result.register, from: result.from, to: result.to, types: result.types, term: result.term, mode,
      pages_walked: result.pages.length,
      ...writeMetrics(result.upserted), failed: result.failed,
      total_count: result.totalCount, total_pages: result.totalPages, dropped_pages: result.droppedPages,
    };
    return { perItem, metrics, inputsRef: result.pages.map((p) => p.url), fullTraceRefs: [reportPath] };
  }
  if (walker === "sitemap" && result.coverageReport) {
    // --check-coverage (lane SITEMAP-3, 2026-09-04): a read-only report, no sources walked this run.
    const c = result.coverageReport;
    return {
      perItem: [],
      metrics: {
        mode, check_coverage: true,
        sources_total_all: c.sourcesTotalAll,
        sources_active_total: c.sourcesActiveTotal,
        sitemap_walked_active: c.sitemapWalkedActive,
        sitemap_unwalked_active: c.sitemapUnwalkedActive,
        walk_outcome_counts: c.walkOutcomeCounts,
        feed_url_populated: c.feedUrlPopulated,
      },
      inputsRef: ["walker=sitemap", "check-coverage=true"],
      fullTraceRefs: [reportPath],
    };
  }
  if (walker === "sitemap") {
    // result.sources: one entry per targeted `sources` row (lane SITEMAP, 2026-09-04) — discovery order
    // per source (feed first, sitemap only when none found), so a run's per_item carries a MIX of feed-
    // outcome rows and sitemap-outcome rows, distinguished by `s.kind`.
    const sources = result.sources ?? [];
    const perItem = sources.map((s) => {
      if (s.kind === "error") {
        return { id: s.sourceId, outcome: "error", verdict: null, evidence_refs: [s.sourceUrl], error: s.error };
      }
      if (s.kind === "feed") {
        const fr = s.feedResult;
        const feedUpserted = fr?.ok ? fr.upserted : 0;
        const verdict = fr?.ok
          ? `feed found (${s.discoverySource}): ${fr.entries} entries, ${wrote ? feedUpserted : fr.entries} ${verb}` +
            (s.rssFeedUrlWritten ? "; rss_feed_url recorded on the source row" : "")
          : `feed found (${s.discoverySource}) at ${s.feedUrl} but the feed walk failed: ${fr?.error ?? "unknown error"}`;
        return {
          id: s.sourceId, outcome: fr?.ok ? "walked" : "error", verdict,
          evidence_refs: [s.feedUrl], error: fr?.ok ? null : (fr?.error ?? "feed walk did not run"),
        };
      }
      // kind === "sitemap"
      if (!s.ok) {
        // Distinguish bot_wall from other errors for clarity
        if (s.discoverySource === "bot_wall") {
          return {
            id: s.sourceId,
            outcome: "bot_wall",
            verdict: `bot_wall: homepage and all sitemap candidates returned 401/403/429 — access blocked`,
            evidence_refs: [s.sourceUrl],
            error: s.error,
          };
        }
        return { id: s.sourceId, outcome: "error", verdict: null, evidence_refs: [s.sourceUrl], error: s.error };
      }
      const coverageNote = s.coverageComplete ? "" : "; PARTIAL COVERAGE (removed-count suppressed)";
      const baselineNote = s.baselineDeferred ? "; baseline deferred to a future complete walk" : "";
      const verdict =
        `sitemap (${s.discoverySource}): ${s.urlCount} url(s) scoped, ` +
        `${s.diff.addedCount} new (${wrote ? s.upserted : s.diff.addedCount} ${verb}), ` +
        `${s.diff.changedCount} changed, ${s.diff.removedCount} removed${coverageNote}${baselineNote}`;
      return {
        id: s.sourceId, outcome: "walked", verdict,
        evidence_refs: (s.sitemapsFetched ?? []).map((f) => f.url).slice(0, 20).concat(s.sitemapsFetched?.length > 20 ? [`… +${s.sitemapsFetched.length - 20} more`] : []),
        error: null,
      };
    });
    const feedSources = sources.filter((s) => s.kind === "feed");
    const sitemapSources = sources.filter((s) => s.kind === "sitemap");
    const botWallSources = sitemapSources.filter((s) => !s.ok && s.discoverySource === "bot_wall");
    const errorSources = sources.filter((s) => s.kind === "error" || (s.kind === "sitemap" && !s.ok && s.discoverySource !== "bot_wall"));
    const okSitemapSources = sitemapSources.filter((s) => s.ok);
    const sitemapUpsertedTotal = okSitemapSources.reduce((a, s) => a + (s.upserted ?? 0), 0);
    const feedUpsertedTotal = feedSources.reduce((a, s) => a + (s.feedResult?.ok ? s.feedResult.upserted : 0), 0);
    const newTotal = okSitemapSources.reduce((a, s) => a + s.diff.addedCount, 0) + feedSources.reduce((a, s) => a + (s.feedResult?.ok ? s.feedResult.entries : 0), 0);
    const changedTotal = okSitemapSources.reduce((a, s) => a + s.diff.changedCount, 0);
    // hosts_* (lane SITEMAP-3, 2026-09-04): the --all-hosts build plan's own per-run artifact fields —
    // computed generally (not only under --all-hosts) since "how many distinct hosts did this run touch"
    // is honest, useful information for a --host/--source-id dispatch too (it is just 1, or 0/1).
    const hostsOf = (list) => new Set(list.map((s) => hostKeyOf(s.sourceUrl)).filter(Boolean));
    const hostsWalked = hostsOf(sources);
    const botWallHostSet = new Set(botWallSources.map((s) => hostKeyOf(s.sourceUrl)).filter(Boolean));
    // A host counts as "skipped for bot_wall" only when EVERY sitemap-kind row targeted for it this run
    // hit the wall — one row bot-walled and a sibling row on the same host actually walked is not a
    // skipped host, it is a partially-successful one.
    const hostsSkippedBotWall = [...botWallHostSet].filter((h) =>
      sitemapSources.filter((s) => hostKeyOf(s.sourceUrl) === h).every((s) => !s.ok && s.discoverySource === "bot_wall")
    );
    // hosts_remaining_unwalked, RECOMPUTED from what this run actually stamped (lane SWEEP-BUDGET,
    // 2026-09-04) — `selectAllHostsTargets`'s own `hostsRemainingUnwalkedAfter` assumes every SELECTED
    // host got walked, which the time budget (above) can now make false. `hostsWalked` (this file's own
    // `hostsOf(sources)`, a few lines up) is the ACTUAL set of hosts this run reached, in the same
    // never-walked-first order `orderHostGroupsForSweep` selected them in, so the never-walked hosts this
    // run actually covered is `min(neverWalkedSelected, hostsWalked.size)` — see the module-level doc on
    // `checkTimeBudget` for why this recomputation is honest rather than the assume-all-walked original.
    const allHostsInfo = result.allHosts;
    const neverWalkedSelected = allHostsInfo
      ? allHostsInfo.hostsNeverWalkedBefore - allHostsInfo.hostsRemainingUnwalkedAfter
      : null;
    const hostsRemainingUnwalkedRecomputed = allHostsInfo
      ? allHostsInfo.hostsNeverWalkedBefore - Math.min(neverWalkedSelected, hostsWalked.size)
      : null;
    const budget = result.budget ?? null;
    const metrics = {
      mode,
      sources_targeted: sources.length,
      feed_found: feedSources.length,
      sitemap_only: sitemapSources.length,
      bot_wall_sources: botWallSources.length,
      errors: errorSources.length,
      urls_scoped_total: okSitemapSources.reduce((a, s) => a + (s.urlCount ?? 0), 0),
      new_total: newTotal,
      changed_total: changedTotal,
      removed_total: okSitemapSources.reduce((a, s) => a + s.diff.removedCount, 0),
      partial_coverage_sources: okSitemapSources.filter((s) => !s.coverageComplete).length,
      baseline_deferred_sources: okSitemapSources.filter((s) => s.baselineDeferred).length,
      rss_feed_url_written: feedSources.filter((s) => s.rssFeedUrlWritten).length,
      change_signals_recorded: okSitemapSources.filter((s) => s.changeRecorded).length,
      // build-plan-named fields (docs/dispatches/ lane brief, 2026-09-04): hosts_walked, hosts_skipped_
      // bot_wall, feeds_discovered, new_locs, lastmod_changes, hosts_remaining_unwalked — kept ALONGSIDE
      // the pre-existing names above (feed_found/new_total/changed_total), never replacing them, so
      // nothing already reading this artifact's metrics loses a field.
      hosts_walked: hostsWalked.size,
      hosts_skipped_bot_wall: hostsSkippedBotWall.length,
      feeds_discovered: feedSources.length,
      new_locs: newTotal,
      lastmod_changes: changedTotal,
      hosts_remaining_unwalked: hostsRemainingUnwalkedRecomputed,
      hosts_selected: result.allHosts ? result.allHosts.hostsSelected.length : null,
      ...writeMetrics(sitemapUpsertedTotal + feedUpsertedTotal),
      failed: okSitemapSources.reduce((a, s) => a + (s.failed ?? 0), 0) + feedSources.reduce((a, s) => a + (s.feedResult?.ok ? s.feedResult.failed : 0), 0),
      no_targets_reason: result.note ?? null,
      // WALL-CLOCK TIME BUDGET (lane SWEEP-BUDGET, 2026-09-04) — the sitemap loop's own hard stop; see
      // DEFAULT_TIME_BUDGET_SECONDS / walkTargetsWithinBudget's doc above. Always present (not only on
      // exhaustion) so a proposer reading this family's history sees budget spend even on a run that
      // finished comfortably inside it.
      budget_seconds: budget?.budgetSeconds ?? null,
      elapsed_seconds: budget?.elapsedSeconds ?? null,
      sources_walked: budget?.sourcesWalked ?? sources.length,
      sources_not_reached: budget?.sourcesNotReached ?? { count: 0, ids: [] },
      budget_exhausted: budget?.exhausted ?? false,
    };
    return { perItem, metrics, inputsRef: sources.map((s) => s.sourceUrl), fullTraceRefs: [reportPath] };
  }
  // feed
  const perItem = [{
    id: result.feedUrl,
    outcome: result.ok ? "walked" : "error",
    verdict: result.ok ? `${result.entries} entries, ${result.upserted} ${verb}` : null,
    evidence_refs: [result.feedUrl],
    error: result.ok ? null : result.error,
  }];
  const metrics = {
    feed_url: result.feedUrl, ok: result.ok, mode,
    entries: result.ok ? result.entries : 0,
    ...writeMetrics(result.ok ? result.upserted : 0),
    failed: result.ok ? result.failed : 0,
  };
  return { perItem, metrics, inputsRef: [result.feedUrl], fullTraceRefs: [reportPath] };
}

/** Where a run's raw walker result (its full trace) is written when --out-dir is not given: one level
 *  below the family directory, so F28's family-level `*.json` artifact glob never sees it. PURE.
 *  @param {string} harnessRunsDir */
export function defaultTraceDir(harnessRunsDir) {
  return join(harnessRunsDir, "traces");
}

/** Normalise a URL for exact-portal comparison: lowercase scheme+host, no trailing slash, no hash. PURE. */
export function portalUrlKey(url) {
  try {
    const u = new URL(String(url));
    u.hash = "";
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return String(url).replace(/\/+$/, "");
  }
}

/**
 * The parent `sources` row a walk's candidates attach to, resolved by EXACT portal URL.
 *
 * WHY NOT db.mjs's host key. `registerSource` is "idempotent by canonical host": it returns the FIRST
 * existing row whose `institutionKey(url)` matches. On eur-lex.europa.eu that registry already holds
 * 724 document-level rows (every EUR-Lex citation source minted since August), so the host key resolved
 * to `000d2ee5-…`, "EUR-Lex / 76/456/EEC Commission Opinion (road vehicle type-approval Regulation)" — a
 * 1976 opinion — and source-sweep-run-003's seven OJ candidates were attached to it (read back from the
 * live table, 2026-09-01). The candidates' parent is the classify context downstream
 * (`consumePortalCandidates`), so the parent must be the portal itself.
 *
 * CONTRACT. (1) Look for a row whose url equals the portal url exactly (portalUrlKey on both sides) —
 * both modes, read-only. (2) Absent and mode=apply: register a dedicated portal row through
 * `registerSource` with an `institutionKey` override that no existing row can compute to
 * (`<hostKey>#portal`), so the host-dedup cannot swallow it into a document row; the exact-url lookup on
 * the next run finds that row, so the override never creates a second one. (3) Absent and mode=dry: null
 * (the first apply run registers it; the walk still runs and counts).
 * @param {{readAll:Function, registerSource:Function, institutionKey:Function}} db
 * @param {{url:string, name:string}} portal @param {"dry"|"apply"} mode @param {object} cite
 * @returns {Promise<string|null>} */
export async function resolvePortalSourceId(db, portal, mode, cite) {
  const want = portalUrlKey(portal.url);
  const existing = await db.readAll("sources", "id,url,status");
  const exact = existing.find((s) => portalUrlKey(s.url) === want);
  if (exact) return exact.id;
  if (mode !== "apply") return null;
  const reg = await db.registerSource(
    { url: portal.url, name: portal.name, institutionKey: `${db.institutionKey(portal.url)}#portal` },
    { cite }
  );
  return reg.source_id;
}

/** PURE time-budget predicate (lane SWEEP-BUDGET, 2026-09-04) — the one thing that stops the sitemap
 *  walk's `for (const src of targets)` loop (`main()`, --walker sitemap branch) before GitHub Actions'
 *  own `timeout-minutes: 30` kills the job outright with no artifact at all (source-sweep #16, 70 hosts,
 *  [CONFIRMED] killed with zero artifact 2026-09-04). Injected clock: this function reads no clock
 *  itself — `nowMs` is a VALUE the caller already read (`Date.now()` in the live binding, a fixed number
 *  in a test) — so it is testable without sleeping.
 *  @param {number} startedAtMs @param {number} nowMs @param {number} budgetSeconds
 *  @returns {{exhausted:boolean, elapsedSeconds:number}} */
export function checkTimeBudget(startedAtMs, nowMs, budgetSeconds) {
  const elapsedSeconds = (nowMs - startedAtMs) / 1000;
  return { exhausted: elapsedSeconds >= budgetSeconds, elapsedSeconds };
}

/**
 * Drive `targets` through `walkOne(target, index)` (the real per-source walk, including its real network
 * calls), checking `checkTimeBudget` BEFORE every target — never mid-target, so one source's own walk is
 * bounded separately (--max-sitemap-fetches/--max-sitemap-entries, and each individual fetch's own
 * timeout — see `withFetchTimeout`/`SOURCE_SWEEP_FETCH_TIMEOUT_MS` below) and is never aborted partway by
 * this budget. This IS the loop `main()`'s sitemap branch runs (not a parallel simulation of it) —
 * `nowMs` defaults to `Date.now` in that live call and is overridden with a fake, advancing sequence in
 * tests, which is what makes the loop's early-exit behavior provable without sleeping or faking `fetch`.
 * @param {object[]} targets
 * @param {(target:object, index:number) => Promise<object>} walkOne
 * @param {{startedAtMs:number, budgetSeconds:number, nowMs?: () => number}} opts
 * @returns {Promise<{results:object[], notReached:object[], exhausted:boolean, elapsedSeconds:number}>}
 */
export async function walkTargetsWithinBudget(targets, walkOne, { startedAtMs, budgetSeconds, nowMs = Date.now }) {
  const results = [];
  let exhausted = false;
  let elapsedSeconds = 0;
  for (let i = 0; i < targets.length; i++) {
    const check = checkTimeBudget(startedAtMs, nowMs(), budgetSeconds);
    elapsedSeconds = check.elapsedSeconds;
    if (check.exhausted) { exhausted = true; break; }
    results.push(await walkOne(targets[i], i));
  }
  const notReached = targets.slice(results.length);
  return { results, notReached, exhausted, elapsedSeconds };
}

/** Wrap `fetchImpl(url, opts)` so every call carries a per-request `AbortSignal.timeout(timeoutMs)` and a
 *  timeout is reported as a plain, greppable Error naming the url — not a raw DOMException a caller's
 *  `error.message`-matching catch blocks (register-walk.mjs/feed-walk.mjs/sitemap-walk.mjs all report
 *  errors by string message) would otherwise have to special-case. ONE wrapper, applied to the ONE
 *  `fetch` call site every one of `main()`'s fetchHtml/fetchJson/fetchText/fetchBytes helpers already
 *  shares (`politeFetch`) — not three copies, and it protects every walker (register-eurlex,
 *  register-federal-register, feed, sitemap) alike, since all four route through the same helper.
 *  [CONFIRMED, read in full 2026-09-04]: before this change, neither this file's fetch helpers nor
 *  sitemap-walk.mjs (which never calls `fetch` itself — PURE + DEP-INJECTED by design, see its own
 *  header; every network call is the caller's injected `deps.fetchBytes`) carried an AbortSignal, a
 *  timeout, or any bound on how LONG one fetch may hang — only on how BIG the eventual response may be
 *  (`checkResponseBytes`, checked AFTER a full response arrives) and how MANY documents a sitemap walk
 *  may fetch (`maxSitemapFetches`/`maxSitemapEntries`). A single hung host could not be interrupted by
 *  anything in this family before this change.
 *  @param {(url:string, opts:object) => Promise<Response>} fetchImpl @param {number} timeoutMs
 *  @returns {(url:string, opts:object) => Promise<Response>} */
export function withFetchTimeout(fetchImpl, timeoutMs) {
  return async function timedFetch(url, opts) {
    try {
      return await fetchImpl(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      if (e && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new Error(`fetch timed out after ${timeoutMs}ms for ${url}`);
      }
      throw e;
    }
  };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

async function main() {
  try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`run-source-sweep: ${parsed.error}\n${usage()}`);
    process.exit(1);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("run-source-sweep: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }

  const { readAll, registerSource, institutionKey, guardedUpdate } = await import("../lib/db.mjs");
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const {
    walker, mode, from, to, feedUrl, series, types, term, maxPages, perPage, sourceName,
    sourceId: cliSourceId, host, allHosts, maxHosts, timeBudgetSeconds, checkCoverage, limit,
    maxSitemapFetches, maxSitemapEntries,
  } = parsed;
  const harnessRunsDir = resolve(parsed.harnessRunsDir || DEFAULT_HARNESS_RUNS_DIR);
  // The raw walker result (the run's FULL TRACE — per-day act URLs in the EUR-Lex case) is kept in the
  // repo, one level BELOW the family directory. F28 treats every family-level *.json under
  // scripts/harness-runs/<family>/ as a run artifact and validates it against CONVENTION.md's schema;
  // run-001's trace was written beside its artifact and F28 correctly rejected it as an INVALID
  // ARTIFACT (2026-09-01). traces/ is where full_trace_refs point from now on.
  const outDir = resolve(parsed.outDir || defaultTraceDir(harnessRunsDir));

  // `sitemap` sweeps EXISTING `sources` rows directly (selectSitemapSources, by --source-id/--host) —
  // it never registers a NEW portal row the way register-eurlex/register-federal-register/feed do, so
  // portal resolution is skipped entirely for it (portal/sourceId stay null; per-source ids are resolved
  // inside the sitemap branch below, one per targeted row).
  const portal = walker === "sitemap" ? null : portalFor({ walker, feedUrl, sourceName });

  // Resolve the parent source id — by EXACT portal URL, never by db.mjs's host key. See
  // resolvePortalSourceId's own doc for why (source-sweep-run-003's finding). DRY mode is READ-ONLY end
  // to end (a lookup, never a write); APPLY mode registers the portal row only when absent.
  const CITE = {
    skill: "corpus-turn-runbook",
    reason: `source-sweep register/feed walk: attach discovered ${walker} candidates to their parent portal source.`,
  };
  const sourceId = walker === "sitemap"
    ? null
    : await resolvePortalSourceId({ readAll, registerSource, institutionKey }, portal, mode, CITE);
  if (walker !== "sitemap") {
    console.log(
      `run-source-sweep: walker=${walker} mode=${mode} portal=${portal.url} source_id=${sourceId ?? "(none yet — first apply run will register it)"}`
    );
  } else {
    console.log(`run-source-sweep: walker=sitemap mode=${mode} source-id=${cliSourceId ?? "(n/a)"} host=${host ?? "(n/a)"}`);
  }

  const fetchOpts = {
    headers: {
      "user-agent": "FSI-source-sweep/1.0 (+corpus-turn)",
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "accept-language": "en",
    },
  };
  // POLITENESS. One register day per second, never a burst: source-sweep-run-004 fired seven daily-view
  // requests in 0.3 s (the fourth full walk of the same week within an hour) and got seven HTTP 200
  // pages that were not the register (see register-walk.mjs's looksLikeOjDailyView). A register walk is
  // a bounded enumeration, not a scrape; a one-second gap costs a week-walk seven seconds.
  const FETCH_GAP_MS = Number(process.env.SOURCE_SWEEP_FETCH_GAP_MS ?? 1000);
  // FETCH TIMEOUT (lane SWEEP-BUDGET, 2026-09-04). [CONFIRMED, read in full]: before this change, no
  // fetch in this family (register-eurlex, register-federal-register, feed, or sitemap — all four route
  // through `politeFetch`) carried an AbortSignal or any per-request timeout at all; a single hung host
  // could hang indefinitely and, for `--walker sitemap --all-hosts`, silently eat the whole time budget
  // through one source. ONE constant, ONE call site (`withFetchTimeout`, wrapping the bare `fetch` below)
  // — every walker gets the same protection, not three hand-copied timeouts.
  const SOURCE_SWEEP_FETCH_TIMEOUT_MS = Number(process.env.SOURCE_SWEEP_FETCH_TIMEOUT_MS ?? 20_000);
  const timedFetch = withFetchTimeout(fetch, SOURCE_SWEEP_FETCH_TIMEOUT_MS);
  let lastFetchAt = 0;
  async function politeFetch(url) {
    const wait = lastFetchAt + FETCH_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastFetchAt = Date.now();
    return timedFetch(url, fetchOpts);
  }
  async function fetchHtmlImpl(url) {
    const res = await politeFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  }
  async function fetchJsonImpl(url) {
    const res = await politeFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }
  async function fetchTextImpl(url) {
    const res = await politeFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  }
  // sitemap-walk.mjs's deps.fetchBytes contract (gzip .xml.gz decode needs the raw bytes, not text).
  async function fetchBytesImpl(url) {
    const res = await politeFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return Buffer.from(await res.arrayBuffer());
  }

  const persist = async (links) => {
    if (mode !== "apply") return { upserted: links.length, failed: 0 }; // dry: count the plan, write nothing
    if (!sourceId) throw new Error("run-source-sweep: apply mode reached persist() with no source_id — registerSource must have failed silently; refusing to write orphaned candidates.");
    return upsertPortalLinkCandidates(sb, sourceId, links);
  };

  // ── sitemap-only plumbing (lane SITEMAP, 2026-09-04) ──────────────────────────────────────────────
  // Per-source persist — `sitemap` sweeps MULTIPLE existing `sources` rows in one dispatch, so it cannot
  // reuse the single `persist` closure above (bound to ONE portal-resolved `sourceId`); this binds to
  // whichever row a given walk targets, through the SAME mirrored writer (upsertPortalLinkCandidates —
  // the ONE ledger write-site every walker in this family shares).
  async function persistFor(targetSourceId, links) {
    if (mode !== "apply") return { upserted: links.length, failed: 0 };
    return upsertPortalLinkCandidates(sb, targetSourceId, links);
  }

  // Sitemap URL-SET snapshot storage. Deliberately NOT the `raw_fetches` DB TABLE (`snapshot-store.mjs`'s
  // own `getSnapshot`/`writeSnapshot`) — that table is the paid-acquire path's HTML capture record, and
  // change-sweep.mjs's `bridgeChangedSourceToStagedUpdates` reads a source's two most recent `raw_fetches`
  // rows and diffs them AS HTML (`diffDocuments`); a JSON url-set row landing in that same table for the
  // same source_id would corrupt that diff (rule B1 — read the consumer before writing to a shared
  // resource). Reuses `raw_fetches`'s STORAGE BUCKET only (never its DB row), under a path prefix
  // (`sitemap-snapshots/`) no other reader queries, applying `snapshot-store.mjs`'s own CONVENTION
  // (gzip via `promisify(node:zlib)`, house style) to a JSON payload instead of an HTML one. A fixed
  // filename per source (not content-hash-keyed) — this IS the "previous snapshot," there is exactly one.
  function sitemapSnapshotPath(targetSourceId) {
    return `sitemap-snapshots/${targetSourceId}/current.json.gz`;
  }
  async function getSitemapSnapshot(targetSourceId) {
    const { data, error } = await sb.storage.from("raw_fetches").download(sitemapSnapshotPath(targetSourceId));
    if (error || !data) return null; // no snapshot yet (or a transient read error) — reads as "first walk"
    try {
      const { gunzip } = await import("node:zlib");
      const { promisify } = await import("node:util");
      const buf = Buffer.from(await data.arrayBuffer());
      const out = await promisify(gunzip)(buf);
      return JSON.parse(out.toString("utf8"));
    } catch {
      return null; // an unreadable stored snapshot is treated as "no snapshot" — never fatal to the walk
    }
  }
  async function saveSitemapSnapshot(targetSourceId, entries) {
    if (mode !== "apply") return; // dry: sitemap-walk.mjs's own contract — counts, writes nothing
    const { gzip } = await import("node:zlib");
    const { promisify } = await import("node:util");
    const gz = await promisify(gzip)(Buffer.from(JSON.stringify(entries), "utf8"));
    const up = await sb.storage.from("raw_fetches").upload(sitemapSnapshotPath(targetSourceId), gz, {
      contentType: "application/gzip", upsert: true,
    });
    if (up.error) throw new Error(`sitemap snapshot upload failed for ${targetSourceId}: ${up.error.message}`);
  }

  // A changed lastmod becomes a `monitoring_queue` row through the SAME insert shape
  // `assessAndUpdateSource` (`src/app/api/worker/check-sources/logic.ts`) already writes — MIRRORED, not
  // imported, for the identical reason `upsertPortalLinkCandidates` above mirrors `persistPortalCandidates`
  // (that file transitively imports the `@/`-path-alias module graph, unresolvable under plain `node`; see
  // this file's own header). PRECISION GATE (operator brief: "a loc matching an existing item's canonical
  // URL"): only queues a signal when at least one changed loc matches a LIVE `intelligence_items.source_url`
  // on this exact source_id — a lastmod change on a URL nothing has ever minted is real evidence for the
  // NEXT population sweep (it already reached the census ledger via `persist`) but is not evidence that
  // any EXISTING item needs re-verification, which is the only thing a monitoring_queue row triggers
  // (reconcile.ts's runReconcilePass reads every LIVE item on the row's source_id). Also skips when a
  // pending (change_detected=true, reconciled_at IS NULL) row already exists for this source — reconcile
  // has not drained it yet, so a second row would only pile up redundant work, not new signal.
  async function recordSitemapChange(targetSourceId, changed) {
    if (mode !== "apply") return; // dry: sitemap-walk.mjs already counted this via changeRecorded
    const locs = changed.map((c) => c.loc);
    const { data: matched, error: matchErr } = await sb
      .from("intelligence_items")
      .select("id")
      .eq("source_id", targetSourceId)
      .eq("is_archived", false)
      .in("source_url", locs);
    if (matchErr) throw new Error(`sitemap change: intelligence_items lookup failed for ${targetSourceId}: ${matchErr.message}`);
    if (!matched || !matched.length) return; // no live item's canonical URL matches a changed loc — no signal
    const { data: pending, error: pendErr } = await sb
      .from("monitoring_queue")
      .select("id")
      .eq("source_id", targetSourceId)
      .eq("change_detected", true)
      .is("reconciled_at", null)
      .limit(1);
    if (pendErr) throw new Error(`sitemap change: monitoring_queue pending-check failed for ${targetSourceId}: ${pendErr.message}`);
    if (pending && pending.length) return; // already queued, not yet reconciled — avoid piling up duplicates
    const nowIso = new Date().toISOString();
    const { error: insErr } = await sb.from("monitoring_queue").insert({
      source_id: targetSourceId,
      scheduled_check: nowIso,
      priority: "normal",
      last_result: "change_detected",
      change_detected: true,
      checked_at: nowIso,
      error_message: null,
    });
    if (insErr) throw new Error(`sitemap change: monitoring_queue insert failed for ${targetSourceId}: ${insErr.message}`);
  }

  let runId = null;
  let result = null;
  let runError = null;
  let reportPath = null;
  // Stamped BEFORE the walk, not inside `finally` — source-sweep-run-001 recorded its started_at at the
  // moment the artifact was assembled (i.e. its finish time) and carried no finished_at at all.
  const startedAt = new Date().toISOString();

  try {
    runId = claimRunId(harnessRunsDir, "source-sweep");

    if (walker === "register-eurlex") {
      result = await walkEurlexOj({ fetchHtml: fetchHtmlImpl, persist }, { from, to, series });
    } else if (walker === "register-federal-register") {
      result = await walkFederalRegister({ fetchJson: fetchJsonImpl, persist }, { from, to, types, term, perPage, maxPages });
    } else if (walker === "sitemap") {
      // Every column main()'s own coverage-write patch or the coverage-check report reads — migration
      // 304's five new columns plus the pre-existing status/rss_feed_url this branch already needed.
      const rows = await readAll(
        "sources",
        "id,url,name,status,access_method,rss_feed_url,sitemap_url,sitemap_last_walked_at,sitemap_url_count,sitemap_walk_outcome,feed_last_probed_at"
      );

      if (checkCoverage) {
        // Read-only — no walk, no write. See buildCoverageReport's own doc for the shape.
        result = { coverageReport: buildCoverageReport(rows) };
      } else {
        const allHostsSelection = allHosts ? selectAllHostsTargets(rows, { maxHosts }) : null;
        const targets = allHosts ? allHostsSelection.targets : selectSitemapSources(rows, { sourceId: cliSourceId, host });
        if (!targets.length) {
          result = {
            sources: [],
            allHosts: allHostsSelection,
            budget: { budgetSeconds: timeBudgetSeconds, elapsedSeconds: 0, exhausted: false, sourcesWalked: 0, sourcesNotReached: { count: 0, ids: [] } },
            note: allHosts
              ? "no active source rows found (--all-hosts, empty sources table or nothing active)"
              : cliSourceId
                ? `no source row found for --source-id ${cliSourceId}`
                : `no active source rows found for --host ${host}`,
          };
        } else {
          // WALL-CLOCK BUDGET (lane SWEEP-BUDGET, 2026-09-04): checked BEFORE every target
          // (`walkTargetsWithinBudget`/`checkTimeBudget` — exported, pure, injected-clock — see their own
          // doc above), never mid-target, so the workflow's own `timeout-minutes: 30` can never kill this
          // run with zero artifact the way it killed source-sweep #16 (70 hosts, [CONFIRMED] no artifact).
          // A budget-exhausted run still returns normally and exits 0 (see `main()`'s finally block) — a
          // bounded, complete unit of work, never an error.
          const walkStartedAtMs = Date.now();
          const { results: sourceResults, notReached, exhausted, elapsedSeconds } = await walkTargetsWithinBudget(
            targets,
            async (src) => {
              const walkDeps = {
                fetchBytes: fetchBytesImpl,
                getPreviousSnapshot: () => getSitemapSnapshot(src.id),
                saveSnapshot: (entries) => saveSitemapSnapshot(src.id, entries),
                persist: (links) => persistFor(src.id, links),
                recordChange: (changed) => recordSitemapChange(src.id, changed),
              };
              let outcome;
              try {
                const r = await walkSource(walkDeps, { sourceUrl: src.url, maxSitemapFetches, maxSitemapEntries, limit });
                outcome = { sourceId: src.id, sourceName: src.name, sourceUrl: src.url, ...r };
                if (r.kind === "feed") {
                  const feedResult = await walkFeed(
                    { fetchText: fetchTextImpl, persist: (links) => persistFor(src.id, links) },
                    { feedUrl: r.feedUrl }
                  );
                  outcome.feedResult = feedResult;
                  // Record the discovered feed_url through the SAME guarded writer every script-side mutation
                  // in this repo goes through (db.mjs's rule-015 path — cite + prior-value snapshot), never a
                  // new one. Only when it actually changed (idempotent re-walks write nothing).
                  if (mode === "apply" && src.rss_feed_url !== r.feedUrl) {
                    const upd = await guardedUpdate(
                      "sources",
                      (qb) => qb.eq("id", src.id),
                      { rss_feed_url: r.feedUrl },
                      { cite: { skill: "corpus-turn-runbook", reason: `source-sweep sitemap walk: recorded discovered feed_url for ${src.url} (${r.discoverySource}).` } }
                    );
                    outcome.rssFeedUrlWritten = (upd.updated ?? 0) > 0;
                  } else {
                    outcome.rssFeedUrlWritten = false;
                  }
                }
              } catch (e) {
                outcome = {
                  sourceId: src.id, sourceName: src.name, sourceUrl: src.url,
                  kind: "error", error: e instanceof Error ? e.message : String(e),
                };
              }
              // Sitemap-coverage columns (migration 304) — written on EVERY walked row, every discovery
              // outcome, through the SAME guarded path the rss_feed_url write above uses; dry mode writes
              // nothing (buildSitemapCoveragePatch's own doc explains which keys appear for which outcome).
              const coveragePatch = buildSitemapCoveragePatch(outcome, new Date().toISOString());
              outcome.coveragePatch = coveragePatch;
              if (mode === "apply") {
                const cov = await guardedUpdate(
                  "sources", (qb) => qb.eq("id", src.id), coveragePatch,
                  { cite: { skill: "corpus-turn-runbook", reason: `source-sweep sitemap walk: recorded sitemap-coverage state for ${src.url} (outcome=${coveragePatch.sitemap_walk_outcome}).` } }
                );
                outcome.coverageWritten = (cov.updated ?? 0) > 0;
              } else {
                outcome.coverageWritten = false;
              }
              return outcome;
            },
            { startedAtMs: walkStartedAtMs, budgetSeconds: timeBudgetSeconds }
          );
          if (exhausted) {
            console.log(
              `run-source-sweep: time budget (${timeBudgetSeconds}s) exhausted after ${elapsedSeconds.toFixed(1)}s — ` +
              `walked ${sourceResults.length}/${targets.length} targeted sources, ${notReached.length} not reached this run.`
            );
          }
          result = {
            sources: sourceResults,
            allHosts: allHostsSelection,
            budget: {
              budgetSeconds: timeBudgetSeconds,
              elapsedSeconds,
              exhausted,
              sourcesWalked: sourceResults.length,
              sourcesNotReached: { count: notReached.length, ids: notReached.map((t) => t.id) },
            },
          };
        }
      }
    } else {
      result = await walkFeed({ fetchText: fetchTextImpl, persist }, { feedUrl });
    }

    mkdirSync(outDir, { recursive: true });
    reportPath = join(outDir, `${runId}.raw-result.json`);
    writeFileSync(reportPath, JSON.stringify(result, null, 2) + "\n", "utf8");
    console.log(`Wrote ${reportPath}`);
    console.log(`${mode === "dry" ? "[dry-run] " : ""}${JSON.stringify(result, null, 2)}`);
  } catch (err) {
    runError = err;
  } finally {
    if (runId) {
      const harnessVersion = hashHarnessVersion(SOURCE_SWEEP_GOVERNING_FILES, FSI_ROOT);
      const shaped = result && reportPath ? shapeRunOutput(walker, result, reportPath, mode) : null;
      const defectsFound = [];
      if (runError) {
        defectsFound.push({
          description: `run-source-sweep.mjs threw during a ${mode} run: ${runError.message}`,
          root_cause: runError.stack ?? "",
          fix_ref: null,
        });
      }
      const artifact = {
        harness_family: "source-sweep",
        harness_version: harnessVersion,
        run_id: runId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        config: {
          walker, mode, from, to, feed_url: feedUrl, series, types, term: term ?? null,
          max_pages: maxPages, per_page: perPage, source_id: sourceId, portal_url: portal?.url ?? null,
          cli_source_id: cliSourceId, host, all_hosts: allHosts, max_hosts: maxHosts,
          time_budget_seconds: timeBudgetSeconds, check_coverage: checkCoverage,
          limit, max_sitemap_fetches: maxSitemapFetches, max_sitemap_entries: maxSitemapEntries,
        },
        inputs_ref: shaped?.inputsRef ?? [`walker=${walker}`, `from=${from ?? "n/a"}`, `to=${to ?? "n/a"}`],
        per_item: shaped?.perItem ?? [],
        metrics: shaped?.metrics ?? {},
        defects_found: defectsFound,
        full_trace_refs: shaped?.fullTraceRefs ?? [harnessRunsDir],
        proposer_notes: runError
          ? "This run threw before completing — see defects_found for the error. Re-run after fixing the root cause."
          : "Auto-emitted by run-source-sweep.mjs, the source-sweep family's canonical entry point (RT lane, 2026-09-01) — the runtime scripts/connections/*.mjs and scripts/mint|forward-events/run-*.mjs already had for their own families, extended to the register-walk.mjs/feed-walk.mjs enumeration modules.",
      };
      const artifactPath = writeRunArtifact(harnessRunsDir, artifact);
      console.log(`Wrote ${artifactPath}`);
    }
  }

  if (runError) {
    console.error(`run-source-sweep: FAILED — ${runError.message}`);
    process.exit(1);
  }
  process.exit(0);
}
