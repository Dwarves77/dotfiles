#!/usr/bin/env node
// research-sweep.mjs — the Research surface's $0 data path (Lane RSRCH, 2026-09-02, wave 2 lanes).
//
// WHY THIS EXISTS. docs/plans/wave2-lanes-2026-09-02.md: "Research has no $0 data path: its items say
// `NO KEY FIGURE YET`." Every other surface (Regulations, Market Intel, Operations) has a runtime that
// discovers new documents at $0; Research did not. This is that runtime, built AS A SUBJECT OF THE
// EXISTING `source-sweep` HARNESS FAMILY (scripts/harness-runs/CONVENTION.md; run artifacts land in the
// SAME `scripts/harness-runs/source-sweep/` directory `run-source-sweep.mjs` already writes to, sharing
// its `harness_family: "source-sweep"` and its run_id sequence via the same `claimRunId` collision guard
// — this is deliberately NOT a new registered family: `scripts/lib/run-artifact.mjs`'s `ALLOWED_FAMILIES`
// and `CONVENTION.md`'s governing-file table are both outside this lane's write set, so a brand-new family
// is not this lane's to register; "one more subject the existing family covers" is).
//
// WHAT IT DOES, IN ORDER (mirrors run-source-sweep.mjs's own shape: pure functions + a thin real-I/O
// driver): (1) SELECT research-role sources from the live `sources` registry — the filter is
// `category === "research"` (migration 084's canonical-category routing: `source_role IN
// ('academic_research','intergovernmental_body')` by default, PLUS name-excepted analytical press
// (`trade_press`, migration 086 — Loadstar, FreightWaves, GreenBiz, Splash247, Supply Chain Digital,
// Reuters Sustainable Business, Edie, Environmental Finance) and name-excepted `statistical_data_agency`
// (Carbon Trust, Project Drawdown). This is the EXACT SAME rule `get_research_items` RPC uses to route
// items onto the live /research surface (migration 084 §7) — membership in the category is therefore
// definitionally on-vertical for Research; the source's own registry role (not the query prose) is what
// this sweep's `screen.basis` carries per payload (see RESEARCH_SOURCE_SELECTION_QUERY and
// screenForSource, below). (2) FETCH each source's own listing/feed page (politely — the
// same one-request-per-second gap run-source-sweep.mjs's own header explains) and DISCOVER candidate
// document links (RSS/Atom via feed-walk.mjs's `parseFeedEntries` when the body looks like a feed, else
// `extractPortalLinks` from portal-links.mjs — the SAME two extraction primitives register-walk.mjs and
// feed-walk.mjs already use; imported, never re-implemented). (3) FILTER to NEW documents only, against a
// git-committed seen-URL manifest (this family has no `portal_link_candidates` DB ledger write available
// to it — see "$0 / no network writes" below — so "new" is tracked locally, the same posture a
// harness-run artifact's own committed history already gives every other family). (4) For each new
// document, apply `congruence("research_finding", url)` (src/lib/entities/source-role.mjs, UNMODIFIED,
// read-only) — a document whose URL reads as `news` (a press release, not the study itself) is SKIPPED
// from record-building (docs/specs/03-research.md §1: "a press release ABOUT the study is a lead/
// corroborator, not the primary" — source-role.mjs's own 1b rule for STUDY_BACKED_TYPES). (5) BUILD a
// research-grade record payload via `buildResearchRecordPayload`
// (src/lib/intake/record-facts-research.mjs, new — finding/methodology_limits/decision_relevance/
// does_not_resolve/key_figure/evidence_agreement_signal/source_authority_signal slot extraction) and
// VALIDATE it with the family's own unmodified gate, `validate-mint-payload.mjs` (imported read-only,
// exactly as run-mint-batch.mjs already does). (6) WRITE two outputs — see "TWO OUTPUT SHAPES" below.
//
// $0 / NO LLM / NO NETWORK WRITES. Every fetch in this file is a plain `GET` (politely rate-limited) —
// no POST, no DB write, ever. The ONLY DB touch this script makes is a READ of the `sources` registry
// (readAll, the same unguarded/routine read every other sweep-family script already does — see db.mjs's
// own header: "Reads are routine/unguarded — only WRITES are gated"). Discovery state ("have I already
// turned this URL into a row") lives in a git-committed JSON file, updated only in --mode apply, exactly
// mirroring how the source-sweep GitHub Action commits `scripts/harness-runs/source-sweep/**` back to a
// branch — never a live database write.
//
// TWO OUTPUT SHAPES, AND WHY BOTH (docs/plans/wave2-lanes-2026-09-02.md: "your script writes a
// census-rows.json-shaped file the population runtime can consume, or documents why a new path is
// needed"):
//   1. `<run_id>.census-rows.json` — rows in EXACTLY the shape `run-mint-batch.mjs`'s documented
//      `--census-rows` contract expects (see that script's own header comment above `loadCensusRows`),
//      so the population runtime CAN consume this file today with zero changes to any coordinator-only
//      file. LIMITATION, STATED HONESTLY: `--census-rows` rebuilds every row through the GENERIC
//      `buildRecordPayload` (src/lib/intake/record-facts.mjs), which has no research-language triggers
//      (that file's own header: "research_finding ... has no entry below and always resolve[s] to an
//      honest GAP claim") — so a row consumed via `--census-rows` gets four honest GAP claims, not this
//      lane's finding/methodology/key-figure extraction. This path is a floor, not the enhancement.
//   2. `<run_id>.payloads.json` — the FULLY BUILT, ALREADY-VALIDATED research-grade payloads (via
//      `buildResearchRecordPayload`), in `run-mint-batch.mjs`'s OTHER, also-unmodified, input shape:
//      `--batch-file` (`loadBatch`'s own contract: "a JSON array of payloads"). THIS is the path that
//      preserves the research-profile extraction — `node scripts/mint/run-mint-batch.mjs --batch-file
//      <run_id>.payloads.json` runs these payloads through the SAME unmodified validator + apply chain,
//      no new code, no coordinator-only file touched. RESEARCH-SWEEP.md states this recommendation.
//
// Usage:
//   node scripts/turns/research-sweep.mjs --mode dry
//   node scripts/turns/research-sweep.mjs --mode apply [--max-sources 25] [--max-docs-per-source 10]
//     [--seen-urls-file path] [--out-dir dir] [--harness-runs-dir dir]
// Exit 0 done · 1 bad args · 2 no DB creds (cannot run here).

import { parseArgs as nodeParseArgs } from "node:util";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPortalLinks } from "../../src/lib/sources/portal-links.mjs";
import { parseFeedEntries } from "../../src/lib/sources/feed-walk.mjs";
import { isErrorBody } from "../../src/lib/sources/entity-gate.mjs";
import { sourceRole, congruence } from "../../src/lib/entities/source-role.mjs";
import { buildResearchRecordPayload } from "../../src/lib/intake/record-facts-research.mjs";
import { validateMintPayload } from "../mint/validate-mint-payload.mjs";
import { writeRunArtifact, hashHarnessVersion, claimRunId } from "../lib/run-artifact.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
// Deliberately the SAME directory run-source-sweep.mjs writes into — see this file's header.
const DEFAULT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "source-sweep");
const DEFAULT_SEEN_URLS_FILE = resolve(DEFAULT_HARNESS_RUNS_DIR, "research-sweep-seen-urls.json");
const ITEM_TYPE_REQUIRED_SLOTS_PATH = resolve(HERE, "..", "mint", "item-type-required-slots.json");

// This family's governing files, for THIS subject's own harness_version — see hashHarnessVersion's own
// doc. Intentionally DIFFERENT from CONVENTION.md's `source-sweep` row (run-source-sweep.mjs +
// register-walk.mjs + feed-walk.mjs): that table is a coordinator-owned file this lane does not touch,
// and F28 rule (c) only requires that AT LEAST ONE artifact in the family directory match the CURRENT
// hash of CONVENTION.md's own governing-file list — an unrelated artifact recording a different subject's
// own hash never trips that rule (verified against F28-harness-run-integrity.mjs's `auditStalenessCoupling`:
// it checks `validArtifacts.some(a => a.harness_version === currentHash)`, not "every artifact").
export const RESEARCH_SWEEP_GOVERNING_FILES = Object.freeze([
  "scripts/turns/research-sweep.mjs",
  "src/lib/intake/record-facts-research.mjs",
]);

// THE QUERY that identifies the registry subset this sweep selects from (docs/plans/wave2-lanes-2026-09-02.md:
// "Identify the registry subset by role/category (state the query)"): `sources.category = 'research'`
// (verified against migration 084 §7's live `get_research_items` RPC body — the exact WHERE clause that
// routes items onto the live /research surface, so a source in this subset is definitionally on-vertical
// for Research, not a lane-invented rule). Migration 084 §2's backfill CASE, read in full, resolves that
// column to 'research' for: source_role IN ('academic_research','intergovernmental_body') BY DEFAULT
// (name-excepted first: IMO/ICAO route to 'regulatory' instead, so they are correctly EXCLUDED here), PLUS
// name-excepted analytical press (`trade_press`, migration 084's own name list — Loadstar, FreightWaves,
// GreenBiz, Splash247, Supply Chain Digital, Reuters Sustainable Business, Edie, Environmental Finance;
// migration 086 codifies `source_role='trade_press'` + tier on these same 8 rows at the data layer but is
// NOT what routes their `category` to 'research' — that is 084's own name-LIKE backfill CASE (its lines
// 47-57), traced directly rather than taken from an earlier comment here that cited 086 for the routing)
// and name-excepted `statistical_data_agency`
// (Carbon Trust, Project Drawdown). `selectResearchSources` below runs the read-side twin of this query
// (`s.category === "research" && s.status === "active"`) against a `sources` registry dump; it does NOT
// additionally pull get_research_items' two ITEM-LEVEL status conditionals (a standards_body/
// primary_legal_authority source's items reclassify to Research by an EXISTING item's status, not by
// source membership) — those apply to items already minted from regulatory-category sources, not to a
// document a fresh sweep is discovering, so they are out of scope for a source-selection query and not
// modeled here.
export const RESEARCH_SOURCE_SELECTION_QUERY = "sources.category = 'research' AND sources.status = 'active'";

// This sweep's `screen.basis` per payload — deliberately just the source's OWN registry role field
// (docs/plans/wave2-lanes-2026-09-02.md's exact contract: "screen: { verdict: on_vertical, provenance:
// registry, basis: <the source's registry role> }"), not the whole selection-query prose above (that
// lives in RESEARCH_SOURCE_SELECTION_QUERY and in this run's harness-run artifact `config`, where a
// reader can audit the query once rather than repeat it on every payload). A source's own `source_role`
// is the registry role in the ordinary case (e.g. "academic_research"); the small set of NAME-EXCEPTED
// sources (Loadstar et al., Carbon Trust, Project Drawdown) still carry their own true source_role
// (e.g. "trade_press") even though their CATEGORY was exception-routed to 'research' — that role value is
// still an honest, non-fabricated "registry role" for this source, so no special-casing is needed here.
function registryRoleOf(source) {
  return String(source?.source_role || source?.category || "unspecified");
}

function usage() {
  return (
    "Usage: node scripts/turns/research-sweep.mjs --mode <dry|apply>\n" +
    "         [--max-sources N] [--max-docs-per-source N] [--seen-urls-file path]\n" +
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
        mode: { type: "string" },
        "max-sources": { type: "string", default: "25" },
        "max-docs-per-source": { type: "string", default: "10" },
        "seen-urls-file": { type: "string" },
        "harness-runs-dir": { type: "string" },
        "out-dir": { type: "string" },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (values.mode !== "dry" && values.mode !== "apply") {
    return { ok: false, error: `--mode must be "dry" or "apply" (got ${JSON.stringify(values.mode)}).` };
  }
  const maxSources = Number(values["max-sources"]);
  const maxDocsPerSource = Number(values["max-docs-per-source"]);
  if (!Number.isFinite(maxSources) || maxSources <= 0) return { ok: false, error: "--max-sources must be a positive number." };
  if (!Number.isFinite(maxDocsPerSource) || maxDocsPerSource <= 0) return { ok: false, error: "--max-docs-per-source must be a positive number." };
  return {
    ok: true,
    mode: values.mode,
    maxSources,
    maxDocsPerSource,
    seenUrlsFile: values["seen-urls-file"] || null,
    harnessRunsDir: values["harness-runs-dir"] || null,
    outDir: values["out-dir"] || null,
  };
}

/**
 * SELECT research-role sources from a `sources` registry dump. PURE — the exact filter this file's
 * header documents: category === "research" AND status === "active". Sorted by url (deterministic
 * ordering across runs), optionally bounded to `maxSources` (a safety/politeness cap; never silent —
 * callers that need the overflow see `rows.length` vs the unbounded count via the caller's own reporting).
 * @param {object[]} sourcesRows @param {{maxSources?: number}} [opts]
 */
export function selectResearchSources(sourcesRows, { maxSources } = {}) {
  const rows = (Array.isArray(sourcesRows) ? sourcesRows : [])
    .filter((s) => s && s.category === "research" && s.status === "active" && typeof s.url === "string" && s.url)
    .slice()
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  return typeof maxSources === "number" ? rows.slice(0, maxSources) : rows;
}

/** Does this fetched body look like an RSS/Atom feed? PURE (mirrors feed-walk.mjs's own inline check). */
export function looksLikeFeedXml(body) {
  return /(<rss[\s>]|<feed[\s>])/i.test(String(body ?? ""));
}

/**
 * Discover candidate document links from one source's fetched listing/feed body. PURE. Feed body →
 * feed-walk.mjs's `parseFeedEntries`; anything else → portal-links.mjs's `extractPortalLinks` (the same
 * two primitives register-walk.mjs / feed-walk.mjs already use — never re-implemented here).
 * @param {string} body @param {string} portalUrl @returns {Array<{url:string, anchorText:string|null}>}
 */
export function discoverCandidateLinks(body, portalUrl) {
  if (looksLikeFeedXml(body)) return parseFeedEntries(body);
  return extractPortalLinks(body, portalUrl);
}

/** Normalize a URL for exact dedup against the seen-urls manifest: lowercase scheme+host, no trailing
 *  slash, no hash. PURE. A small, deliberate duplication of run-source-sweep.mjs's own `portalUrlKey`
 *  (that file's own header: "a duplication of eight lines, not of any decision" — the same reasoning
 *  applies here, keeping this script importable standalone). */
export function normalizeUrlKey(url) {
  try {
    const u = new URL(String(url));
    u.hash = "";
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return String(url).replace(/\/+$/, "");
  }
}

/** Links not already present (by normalizeUrlKey) in `seenUrlKeys`. PURE. */
export function filterNewLinks(links, seenUrlKeys) {
  const seen = seenUrlKeys instanceof Set ? seenUrlKeys : new Set(seenUrlKeys ?? []);
  return (links ?? []).filter((l) => l && l.url && !seen.has(normalizeUrlKey(l.url)));
}

/** Strip HTML to plain, whitespace-normalized text: script/style content removed, tags removed (inner
 *  text KEPT — including a <title>'s own text), common entities decoded, whitespace collapsed. PURE.
 *  Mirrors feed-walk.mjs's own inline `strip` helper, extended to whole documents rather than one tag's
 *  inner text. Used both as buildResearchRecordPayload's `capturedText` AND (via extractHtmlTitle below)
 *  to derive the title, so the two stay on the SAME normalized representation — the reason a document's
 *  own <title> is reliably found verbatim inside its own stripped body by extractIdentityFact. */
export function stripHtmlToText(html) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*\n+/g, "\n\n")
    .trim();
}

/** The document's own <title> text, normalized the SAME way stripHtmlToText normalizes the body (see
 *  above), or null. PURE. */
export function extractHtmlTitle(html) {
  const m = String(html ?? "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const t = stripHtmlToText(m[1]);
  return t || null;
}

/** A short, honest fallback title derived from a URL's last path segment when neither <title> nor an
 *  anchor's own text is available. PURE. Never a fabricated claim about content — it is a label, not a
 *  FACT (buildRecordPayload's identity FACT only fires when this string is ALSO found verbatim in the
 *  captured text, which a humanized slug usually will not be — an honest, absent identity section then,
 *  never a mismatched one). */
export function titleFromUrl(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || u.host;
    return decodeURIComponent(last).replace(/[-_]+/g, " ").replace(/\.\w{2,5}$/, "").trim() || u.host;
  } catch {
    return String(url);
  }
}

/** The screen verdict this sweep stamps on every payload, per docs/plans/wave2-lanes-2026-09-02.md's exact
 *  contract for research sources: `provenance: "registry"` (this verdict is never a content-based rule
 *  match against the fetched document — it is membership in the on-vertical registry SUBSET
 *  RESEARCH_SOURCE_SELECTION_QUERY names, decided before any document is even fetched) and
 *  `basis: <the source's registry role>` (registryRoleOf, above — just the role, not the full query prose;
 *  the query itself is auditable once per run via this run's harness-run artifact `config`, not repeated
 *  on every payload). PURE.
 *
 *  validate-mint-payload.mjs's screen check accepts `provenance` "rule", "reviewed" and (since the
 *  coordinator's allowlist change of 2026-09-03) "registry"; a research-sweep payload validates end to
 *  end (research-sweep.test.mjs "built_valid"). */
export function screenForSource(source) {
  return {
    verdict: "on_vertical",
    provenance: "registry",
    basis: registryRoleOf(source),
  };
}

/** One census-rows.json row, in run-mint-batch.mjs's documented --census-rows contract shape. PURE. */
export function censusRowFor({ source, docUrl, title, capturedText, fetchedLength, screen, priority = "MODERATE" }) {
  return {
    row_id: `${source.id}:${docUrl}`,
    source_url: docUrl,
    item_type: "research_finding",
    title,
    instrument_identifier: null,
    canonical_instrument_key: null,
    jurisdiction_iso: null,
    priority,
    source: {
      id: source.id, url: source.url,
      base_tier: source.base_tier ?? null, tier_override: source.tier_override ?? null,
      status: source.status,
    },
    captured_text: capturedText,
    fetched_length: typeof fetchedLength === "number" ? fetchedLength : capturedText.length,
    screen,
  };
}

/**
 * Sweep ONE research source: fetch its listing/feed (deps.fetchText), discover candidates, filter to new
 * (against `seenUrlKeys`), skip source-incongruent research_finding candidates (congruence 1b — a
 * press/news page, not the study), fetch + build + validate the rest. Bounded by `maxDocsPerSource`.
 * Never throws on a single document's failure (a bad fetch is recorded per-doc, the sweep continues).
 * @param {{fetchText:(url:string)=>Promise<string>}} deps
 * @param {{source:object, seenUrlKeys:Set<string>, maxDocsPerSource:number, requiredSlots:string[]}} opts
 */
export async function sweepOneSource(deps, { source, seenUrlKeys, maxDocsPerSource, requiredSlots }) {
  const perDoc = [];
  const rows = [];
  const payloads = [];
  const newlySeenUrls = [];

  let listingBody;
  try {
    listingBody = await deps.fetchText(source.url);
  } catch (e) {
    return {
      source_url: source.url, ok: false, error: `listing fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      candidates: 0, newCandidates: 0, perDoc: [], rows: [], payloads: [], newlySeenUrls: [],
    };
  }
  if (isErrorBody(listingBody)) {
    return {
      source_url: source.url, ok: false,
      error: "error-body gate: bot-block / error response on the listing page -- inconclusive, not an empty listing",
      candidates: 0, newCandidates: 0, perDoc: [], rows: [], payloads: [], newlySeenUrls: [],
    };
  }

  const candidates = discoverCandidateLinks(listingBody, source.url);
  const newLinks = filterNewLinks(candidates, seenUrlKeys).slice(0, maxDocsPerSource);

  for (const link of newLinks) {
    const congr = congruence("research_finding", link.url);
    if (congr.incongruentSource) {
      perDoc.push({
        id: link.url, outcome: "skipped_incongruent_source",
        verdict: `sourceRole=${sourceRole(link.url)}: ${congr.reason}`,
        evidence_refs: [link.url], error: null,
      });
      newlySeenUrls.push(link.url); // a stable, deterministic judgment -- never re-checked forever
      continue;
    }

    let docBody;
    try {
      docBody = await deps.fetchText(link.url);
    } catch (e) {
      perDoc.push({ id: link.url, outcome: "fetch_failed", verdict: null, evidence_refs: [link.url], error: e instanceof Error ? e.message : String(e) });
      continue; // NOT marked seen -- eligible for retry on the next run
    }
    if (isErrorBody(docBody)) {
      perDoc.push({ id: link.url, outcome: "error_body", verdict: null, evidence_refs: [link.url], error: "bot-block / error response" });
      continue; // NOT marked seen
    }

    const capturedText = stripHtmlToText(docBody);
    const title = extractHtmlTitle(docBody) || link.anchorText || titleFromUrl(link.url);
    const screen = screenForSource(source);

    let payload;
    try {
      payload = buildResearchRecordPayload({
        sourceUrl: link.url, title, source, capturedText, requiredSlots, screen,
      });
    } catch (e) {
      perDoc.push({ id: link.url, outcome: "build_failed", verdict: null, evidence_refs: [link.url], error: e instanceof Error ? e.message : String(e) });
      newlySeenUrls.push(link.url); // a build failure on this text will not resolve itself by re-fetching
      continue;
    }

    const validation = validateMintPayload(payload);
    const row = censusRowFor({ source, docUrl: link.url, title, capturedText, screen });
    rows.push(row);
    payloads.push(payload);
    newlySeenUrls.push(link.url);
    perDoc.push({
      id: link.url,
      outcome: validation.valid ? "built_valid" : "built_invalid",
      verdict: validation.valid
        ? "valid, 0 failures"
        : `invalid, ${validation.failures.length} failure(s): ${[...new Set(validation.failures.map((f) => f.reason))].join(", ")}`,
      evidence_refs: [link.url],
      error: validation.valid ? null : JSON.stringify(validation.failures),
    });
  }

  return {
    source_url: source.url, ok: true, error: null,
    candidates: candidates.length, newCandidates: newLinks.length,
    perDoc, rows, payloads, newlySeenUrls,
  };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

async function main() {
  try { process.loadEnvFile(resolve(FSI_ROOT, ".env.local")); } catch { /* CI: env injected */ }

  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`research-sweep: ${parsed.error}\n${usage()}`);
    process.exit(1);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("research-sweep: no DB creds -- cannot run here (exit 2). A READ of the `sources` registry is required to select research sources; this script never WRITES to the DB.");
    process.exit(2);
  }

  const { mode, maxSources, maxDocsPerSource } = parsed;
  const harnessRunsDir = resolve(parsed.harnessRunsDir || DEFAULT_HARNESS_RUNS_DIR);
  const outDir = resolve(parsed.outDir || join(harnessRunsDir, "traces"));
  const seenUrlsFile = resolve(parsed.seenUrlsFile || DEFAULT_SEEN_URLS_FILE);
  const requiredSlots = JSON.parse(readFileSync(ITEM_TYPE_REQUIRED_SLOTS_PATH, "utf8")).research_finding || [];

  const { readAll } = await import("../lib/db.mjs");
  const sourcesRows = await readAll("sources", "id,url,name,base_tier,tier_override,status,institution_id,source_role,category");
  const sources = selectResearchSources(sourcesRows, { maxSources });
  console.log(`research-sweep: mode=${mode} ${sources.length} research-category source(s) selected (of ${sourcesRows.length} registry rows), cap=${maxSources}`);

  let seenUrls = [];
  if (existsSync(seenUrlsFile)) {
    try { seenUrls = JSON.parse(readFileSync(seenUrlsFile, "utf8")); } catch { seenUrls = []; }
  }
  const seenUrlKeys = new Set((Array.isArray(seenUrls) ? seenUrls : []).map(normalizeUrlKey));

  const fetchOpts = {
    headers: {
      "user-agent": "FSI-research-sweep/1.0 (+corpus-turn)",
      accept: "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml;q=0.9,*/*;q=0.8",
      "accept-language": "en",
    },
  };
  const FETCH_GAP_MS = Number(process.env.RESEARCH_SWEEP_FETCH_GAP_MS ?? 1000);
  let lastFetchAt = 0;
  async function fetchText(url) {
    const wait = lastFetchAt + FETCH_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastFetchAt = Date.now();
    const res = await fetch(url, fetchOpts);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  }

  let runId = null;
  let runError = null;
  const startedAt = new Date().toISOString();
  const perSource = [];
  const allRows = [];
  const allPayloads = [];
  const newlySeenAll = [];
  const metrics = {
    mode, sources_selected: sources.length, sources_ok: 0, sources_errored: 0,
    candidates_discovered: 0, new_candidates: 0, skipped_incongruent_source: 0,
    fetch_failed: 0, error_body: 0, build_failed: 0, built_valid: 0, built_invalid: 0,
  };

  try {
    runId = claimRunId(harnessRunsDir, "source-sweep");

    for (const source of sources) {
      const result = await sweepOneSource(
        { fetchText },
        { source, seenUrlKeys, maxDocsPerSource, requiredSlots },
      );
      if (result.ok) metrics.sources_ok += 1; else metrics.sources_errored += 1;
      metrics.candidates_discovered += result.candidates;
      metrics.new_candidates += result.newCandidates;
      for (const d of result.perDoc) {
        if (d.outcome === "skipped_incongruent_source") metrics.skipped_incongruent_source += 1;
        else if (d.outcome === "fetch_failed") metrics.fetch_failed += 1;
        else if (d.outcome === "error_body") metrics.error_body += 1;
        else if (d.outcome === "build_failed") metrics.build_failed += 1;
        else if (d.outcome === "built_valid") metrics.built_valid += 1;
        else if (d.outcome === "built_invalid") metrics.built_invalid += 1;
      }
      allRows.push(...result.rows);
      allPayloads.push(...result.payloads);
      newlySeenAll.push(...result.newlySeenUrls);
      perSource.push({
        id: source.url,
        outcome: result.ok ? "swept" : "listing_error",
        verdict: result.ok
          ? `${result.candidates} candidate(s), ${result.newCandidates} new, ${result.rows.length} built`
          : result.error,
        evidence_refs: [source.url],
        error: result.ok ? null : result.error,
      });
    }

    mkdirSync(outDir, { recursive: true });
    const rawTracePath = join(outDir, `${runId}.raw-per-source.json`);
    writeFileSync(rawTracePath, JSON.stringify({ sources: sources.map((s) => s.url), perSource, metrics }, null, 2) + "\n", "utf8");
    console.log(`Wrote ${rawTracePath}`);

    const fullTraceRefs = [rawTracePath];

    if (mode === "apply") {
      const censusRowsPath = join(outDir, `${runId}.census-rows.json`);
      writeFileSync(censusRowsPath, JSON.stringify(allRows, null, 2) + "\n", "utf8");
      console.log(`Wrote ${censusRowsPath} (${allRows.length} row(s))`);
      fullTraceRefs.push(censusRowsPath);

      const payloadsPath = join(outDir, `${runId}.payloads.json`);
      writeFileSync(payloadsPath, JSON.stringify(allPayloads, null, 2) + "\n", "utf8");
      console.log(`Wrote ${payloadsPath} (${allPayloads.length} payload(s)) -- prefer this file with ` +
        `run-mint-batch.mjs's --batch-file to keep the research-profile extraction (see RESEARCH-SWEEP.md).`);
      fullTraceRefs.push(payloadsPath);

      const mergedSeen = [...new Set([...seenUrls, ...newlySeenAll])].sort();
      mkdirSync(dirname(seenUrlsFile), { recursive: true });
      writeFileSync(seenUrlsFile, JSON.stringify(mergedSeen, null, 2) + "\n", "utf8");
      console.log(`Updated ${seenUrlsFile} (${mergedSeen.length} URL(s) tracked, ${newlySeenAll.length} newly added)`);
    } else {
      console.log(`[dry-run] would write ${allRows.length} census row(s) and ${allPayloads.length} payload(s); seen-urls manifest left untouched.`);
    }

    console.log(JSON.stringify(metrics, null, 2));
  } catch (err) {
    runError = err;
  } finally {
    if (runId) {
      const harnessVersion = hashHarnessVersion(RESEARCH_SWEEP_GOVERNING_FILES, FSI_ROOT);
      const defectsFound = [];
      if (runError) {
        defectsFound.push({
          description: `research-sweep.mjs threw during a ${mode} run: ${runError.message}`,
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
          subject: "research", mode, max_sources: maxSources, max_docs_per_source: maxDocsPerSource,
          seen_urls_file: seenUrlsFile, out_dir: outDir,
          // The registry-subset query this run selected sources with — auditable here once per run
          // rather than repeated in every payload's `screen.basis` (see RESEARCH_SOURCE_SELECTION_QUERY's
          // own doc, and docs/plans/wave2-lanes-2026-09-02.md's "Identify the registry subset by
          // role/category (state the query)").
          source_selection_query: RESEARCH_SOURCE_SELECTION_QUERY,
        },
        inputs_ref: sources.map((s) => s.url),
        per_item: perSource,
        metrics,
        defects_found: defectsFound,
        full_trace_refs: runError ? [harnessRunsDir] : (
          typeof outDir === "string" ? [join(outDir, `${runId}.raw-per-source.json`)] : [harnessRunsDir]
        ),
        proposer_notes: runError
          ? "This run threw before completing -- see defects_found for the error. Re-run after fixing the root cause."
          : "Auto-emitted by research-sweep.mjs (Lane RSRCH, 2026-09-02) -- the Research surface's $0 data path, a new SUBJECT of the existing source-sweep harness family (see this file's own header for why it shares that family rather than registering a new one).",
      };
      const artifactPath = writeRunArtifact(harnessRunsDir, artifact);
      console.log(`Wrote ${artifactPath}`);
    }
  }

  if (runError) {
    console.error(`research-sweep: FAILED -- ${runError.message}`);
    process.exit(1);
  }
  process.exit(0);
}
