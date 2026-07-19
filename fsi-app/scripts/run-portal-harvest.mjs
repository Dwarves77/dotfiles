// run-portal-harvest.mjs — B1 runner (scrape-and-build plan, 2026-07-19): the manual entry point for
// the portal deep-link slice while the source-monitoring cron stays frozen (ADR-015 re-arm is a later
// step). Two steps, each opt-in:
//
//   --harvest   fetch the portal source's page DIRECT (free HTTP, hold-gated) → extractPortalLinks →
//               persistPortalCandidates (the ONE ledger write-site, shared with check-sources).
//   --consume   consumePortalCandidates: ledger 'candidate' rows → ladder fetch (direct-first; NO
//               Browserless unless --render) → firstFetchClassify → the intake chokepoint.
//
// MODES: --mode plan (DEFAULT — read-only dry verdicts, no writes, no grounding, ~$0.001/candidate
// Haiku) | --mode apply (stages + mints + grounds — the operator-priced path; requires EXECUTE=1).
//
// Usage:
//   node scripts/run-portal-harvest.mjs --source <uuid | url-substring> [--harvest] [--consume]
//        [--mode plan|apply] [--limit 25] [--render]
//        [--after "firstSeenAt|id"] [--census-exclude]
//
// PLAN-MODE PAGINATION (census walk, 2026-07-19): plan mode never marks a candidate consumed, so repeated
// calls with the same --source re-read the same oldest-N rows. --after resumes past a KEYSET cursor
// (first_seen_at, id) — never an offset, which is positional and drifts if the ledger grows mid-walk. Each
// run prints the next cursor to pass forward. --census-exclude additionally skips candidates already
// dispositioned in census_worklist for this source (feature-detected; fails closed to no-op if the table
// or its columns are absent). Read-only, plan-mode-only: touches no gate, mint, or grounding logic.
//
// Env (source .env.local first): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// ANTHROPIC_API_KEY (+ BROWSERLESS_API_KEY only with --render).
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : dflt;
};

const SOURCE = opt("source", null);
const MODE = opt("mode", "plan");
const LIMIT = Number(opt("limit", "25"));
const DO_HARVEST = flag("harvest");
const DO_CONSUME = flag("consume");
const ALLOW_RENDER = flag("render");

if (!SOURCE || (!DO_HARVEST && !DO_CONSUME)) {
  console.error("usage: run-portal-harvest.mjs --source <uuid|url-substring> [--harvest] [--consume] [--mode plan|apply] [--limit N] [--render]");
  process.exit(2);
}
if (!["plan", "apply"].includes(MODE)) { console.error(`bad --mode ${MODE}`); process.exit(2); }
if (MODE === "apply" && process.env.EXECUTE !== "1") {
  console.error("apply mode mints + grounds (operator-priced). Set EXECUTE=1 to confirm.");
  process.exit(2);
}
for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]) {
  if (!process.env[v]) { console.error(`missing env ${v} (source fsi-app/.env.local)`); process.exit(2); }
}

// ── load the live TS seams via jiti (the _loop-proof / _happy-path-proof pattern) ────────────────────
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { consumePortalCandidates, persistPortalCandidates } = await jiti.import("../src/lib/intake/portal-harvest.ts");
const { buildLiveTransports } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const { escalateToFetchResult } = await jiti.import("../src/lib/sources/transport-runtime.mjs");
const { extractPortalLinks } = await jiti.import("../src/lib/sources/portal-links.mjs");
const { assertFetchAllowed } = await jiti.import("../src/lib/sources/fetch-hold.mjs");
const { MANUAL_INTAKE_CALLER } = await jiti.import("../src/lib/intake/run-intake-cycle.ts");
const lib = { consumePortalCandidates, persistPortalCandidates, buildLiveTransports, escalateToFetchResult, extractPortalLinks, assertFetchAllowed, MANUAL_INTAKE_CALLER };

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── resolve the source (uuid or url substring; must be unique) ───────────────────────────────────────
const isUuid = /^[0-9a-f-]{36}$/i.test(SOURCE);
const { data: srcRows, error: srcErr } = isUuid
  ? await sb.from("sources").select("id,name,url").eq("id", SOURCE)
  : await sb.from("sources").select("id,name,url").ilike("url", `%${SOURCE}%`);
if (srcErr) { console.error(`source lookup failed: ${srcErr.message}`); process.exit(1); }
if (!srcRows?.length) { console.error(`no source matches '${SOURCE}'`); process.exit(1); }
if (srcRows.length > 1) {
  console.error(`'${SOURCE}' is ambiguous (${srcRows.length} sources):`);
  for (const s of srcRows.slice(0, 10)) console.error(`  ${s.id}  ${s.url}`);
  process.exit(1);
}
const source = srcRows[0];
console.log(`source: ${source.name ?? "(unnamed)"}  ${source.url}  [${source.id}]  mode=${MODE}`);

// ── HARVEST: free direct fetch of the portal page (raw HTML) → extract → persist ────────────────────
// --page <url> harvests a specific instrument-bearing page OF the registered source (a portal's listing
// section, e.g. the EUR-Lex OJ daily view) — SAME-HOST enforced, ledger rows still attach to source.id.
if (DO_HARVEST) {
  const pageUrl = opt("page", source.url);
  if (new URL(pageUrl).host !== new URL(source.url).host) {
    console.error(`--page host ${new URL(pageUrl).host} != source host ${new URL(source.url).host}`);
    process.exit(2);
  }
  lib.assertFetchAllowed(pageUrl, process.env, lib.MANUAL_INTAKE_CALLER);
  const resp = await fetch(pageUrl, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; CarosLedge/1.0)", accept: "text/html,application/xhtml+xml" },
    redirect: "follow", signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) { console.error(`harvest fetch ${resp.status} for ${pageUrl}`); process.exit(1); }
  const html = await resp.text();
  const links = lib.extractPortalLinks(html, pageUrl);
  console.log(`harvest: ${links.length} candidate deep link(s) extracted from ${html.length}ch HTML`);
  const persisted = await lib.persistPortalCandidates(sb, source.id, links);
  console.log(`harvest: ${persisted.upserted} upserted, ${persisted.failed} failed`);
}

// ── CONSUME: ladder fetch (direct-first; render only with --render) → classify → intake ─────────────
if (DO_CONSUME) {
  const MAX = 20_000; // classification excerpt fetch — the classifier slices to 6KB; NOT a grounding fetch
  const transports = lib.buildLiveTransports(MAX, lib.MANUAL_INTAKE_CALLER);
  if (!ALLOW_RENDER) delete transports.browserlessRender; // conserve Browserless units by default
  const fetchDoc = async (url) => {
    const v = await lib.escalateToFetchResult(url, MAX, transports);
    if (v.outcome !== "content") throw new Error(`no content (${v.reason ?? v.outcome})`);
    return { text: v.text, transport: v.transport };
  };
  // KEYSET PAGINATION (plan-mode only, 2026-07-19): --after "firstSeenAt|id" resumes strictly past that
  // ledger position; the run prints --after for the next chunk on stdout. Never an offset (positional,
  // drifts under a moving ledger) — a keyset cursor names a fixed point in (first_seen_at, id) order.
  const afterRaw = opt("after", null);
  const after = afterRaw ? (([firstSeenAt, id]) => ({ firstSeenAt, id }))(afterRaw.split("|")) : null;
  // --census-exclude turns on the census-worklist anti-join (candidates already dispositioned in
  // census_worklist for this source are skipped — resumable/re-runnable walk). The table keys on
  // (source_id, document_url), completion = non-null dryrun_disposition; no run-id column exists.
  const censusExclusion = flag("census-exclude") ? { table: "census_worklist" } : null;

  const result = await lib.consumePortalCandidates(sb, {
    mode: MODE, limit: LIMIT, sourceId: source.id, caller: lib.MANUAL_INTAKE_CALLER,
    newestFirst: flag("newest"), after, censusExclusion, fetchDoc, anthropicKey: process.env.ANTHROPIC_API_KEY,
  });
  console.log(`\nconsume [${result.mode}]: discovered=${result.discovered} fetched=${result.fetched} classified=${result.classified}`);
  const byDisp = {};
  for (const o of result.outcomes) byDisp[o.disposition] = (byDisp[o.disposition] ?? 0) + 1;
  console.log(`dispositions: ${JSON.stringify(byDisp)}`);
  for (const o of result.outcomes) {
    console.log(`  [${o.disposition}] ${o.itemType ?? "-"} ${o.title ? `"${o.title.slice(0, 70)}"` : ""}\n      ${o.url}\n      ${o.reason.slice(0, 220)}`);
  }
  if (result.cycle) {
    console.log(`\ncycle: staged=${result.cycle.staged} minted=${result.cycle.minted} rejected=${result.cycle.rejected} verified=${result.cycle.verified} groundFailed=${result.cycle.groundFailed}`);
  }
  if (result.nextCursor) {
    console.log(`\nnextCursor (source exhausted? NO — more candidates remain): --after "${result.nextCursor.firstSeenAt}|${result.nextCursor.id}"`);
  } else {
    console.log(`\nnextCursor: none — this source's ledger is exhausted at this chunk (fewer than --limit ${LIMIT} rows read).`);
  }
}
