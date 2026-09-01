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
import { writeRunArtifact, hashHarnessVersion, claimRunId } from "../lib/run-artifact.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const DEFAULT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "source-sweep");
const ROOT = FSI_ROOT;

// This family's governing files — the driver plus the two dormant walker modules it gives a runtime to.
// Mirrors CONVENTION.md's harness_version table + F28's GOVERNING_FILES.'source-sweep' (kept in sync by
// the CONVENTION-TABLE-PARITY test, the same discipline every other family's list already carries).
export const SOURCE_SWEEP_GOVERNING_FILES = Object.freeze([
  "scripts/turns/run-source-sweep.mjs",
  "src/lib/sources/register-walk.mjs",
  "src/lib/sources/feed-walk.mjs",
]);

const WALKERS = Object.freeze(["register-eurlex", "register-federal-register", "feed"]);

function usage() {
  return (
    "Usage: node scripts/turns/run-source-sweep.mjs --walker <register-eurlex|register-federal-register|feed>\n" +
    "         --mode <dry|apply> [--from ISO-date] [--to ISO-date] [--feed-url url] [--series L|C]\n" +
    "         [--types RULE,PRORULE] [--term text] [--max-pages N] [--per-page N] [--source-name name]\n" +
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

/** Build this run's per_item / metrics / inputs_ref / full_trace_refs from one walker's raw result.
 *  PURE (no I/O) so the shaping is independently testable. `reportPath` is where the raw result was
 *  written on disk (the artifact's full_trace_refs pointer). */
export function shapeRunOutput(walker, result, reportPath, mode = "apply") {
  // In dry mode the injected persist() COUNTS the plan and writes nothing, so a count labelled
  // "upserted" would assert a write that never happened (source-sweep-run-001 read "221 upserted"
  // for a run that wrote 0 rows). The metric key stays `upserted` (the per-family standing metric in
  // CONVENTION.md reads it); `mode` is carried alongside and every verdict names what the number is.
  const wrote = mode === "apply";
  const verb = wrote ? "upserted" : "planned (dry, nothing written)";
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
      upserted: result.upserted, failed: result.failed,
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
      upserted: result.upserted, failed: result.failed,
      total_count: result.totalCount, total_pages: result.totalPages, dropped_pages: result.droppedPages,
    };
    return { perItem, metrics, inputsRef: result.pages.map((p) => p.url), fullTraceRefs: [reportPath] };
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
    upserted: result.ok ? result.upserted : 0,
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

  const { readAll, registerSource, institutionKey } = await import("../lib/db.mjs");
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { walker, mode, from, to, feedUrl, series, types, term, maxPages, perPage, sourceName } = parsed;
  const harnessRunsDir = resolve(parsed.harnessRunsDir || DEFAULT_HARNESS_RUNS_DIR);
  // The raw walker result (the run's FULL TRACE — per-day act URLs in the EUR-Lex case) is kept in the
  // repo, one level BELOW the family directory. F28 treats every family-level *.json under
  // scripts/harness-runs/<family>/ as a run artifact and validates it against CONVENTION.md's schema;
  // run-001's trace was written beside its artifact and F28 correctly rejected it as an INVALID
  // ARTIFACT (2026-09-01). traces/ is where full_trace_refs point from now on.
  const outDir = resolve(parsed.outDir || defaultTraceDir(harnessRunsDir));

  const portal = portalFor({ walker, feedUrl, sourceName });

  // Resolve the parent source id. DRY mode is READ-ONLY end to end — it looks up an existing source by
  // institutionKey (db.mjs's own dedup key) but never calls registerSource (a write). APPLY mode
  // registers for real (idempotent — registerSource returns the existing row if the host is already
  // known, per db.mjs's own contract).
  let sourceId = null;
  if (mode === "apply") {
    const CITE = {
      skill: "corpus-turn-runbook",
      reason: `source-sweep register/feed walk: attach discovered ${walker} candidates to their parent portal source.`,
    };
    const reg = await registerSource(portal, { cite: CITE });
    sourceId = reg.source_id;
  } else {
    const existing = await readAll("sources", "id,url,status");
    const key = institutionKey(portal.url);
    const match = existing.find((s) => institutionKey(s.url) === key);
    sourceId = match ? match.id : null;
  }
  console.log(
    `run-source-sweep: walker=${walker} mode=${mode} portal=${portal.url} source_id=${sourceId ?? "(none yet — first apply run will register it)"}`
  );

  const fetchOpts = { headers: { "user-agent": "FSI-source-sweep/1.0 (+corpus-turn)" } };
  async function fetchHtmlImpl(url) {
    const res = await fetch(url, fetchOpts);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  }
  async function fetchJsonImpl(url) {
    const res = await fetch(url, fetchOpts);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }
  async function fetchTextImpl(url) {
    const res = await fetch(url, fetchOpts);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  }

  const persist = async (links) => {
    if (mode !== "apply") return { upserted: links.length, failed: 0 }; // dry: count the plan, write nothing
    if (!sourceId) throw new Error("run-source-sweep: apply mode reached persist() with no source_id — registerSource must have failed silently; refusing to write orphaned candidates.");
    return upsertPortalLinkCandidates(sb, sourceId, links);
  };

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
          max_pages: maxPages, per_page: perPage, source_id: sourceId, portal_url: portal.url,
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
