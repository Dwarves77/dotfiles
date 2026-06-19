// src/lib/agent/canonical-pipeline.ts
//
// THE single canonical generation pipeline as plain, directly-executable lib functions the workflow
// steps call (no blind bodies). There is ONE generator and it is a DEEP DIVE — the thin single-source
// generate (the retired scripts/content-generate.mjs) does not exist anymore. generateBrief:
//   1. fetches the primary source,
//   2. uses web_search to DISCOVER corroborating/expanding sources (official, academic, named
//      participants, trade press) — the system's whole reason for being: a thin source triggers
//      deeper research, it is never accepted as-is,
//   3. fetches that multi-source pool, and
//   4. synthesises a rich brief ACROSS the pool under the Forward-Intelligence + No-Vacuum rules,
//      documenting the discovered sources (which then feed source-growth).
// This is the auto-discovery generalisation of the (now retired) jolt-exemplar-regen prototype,
// which hand-listed the corroborators; web_search discovery replaces that hand-list so it works for
// any item at scale. ground re-verifies FACT spans against the same pool; grow registers + credits
// the discovered sources.
// Uses the Supabase SERVICE client throughout (env-based -> works in the Vercel workflow runtime).
// The grounding "transaction" is emulated with a manual cleanup-on-invalid (delete the just-inserted
// claims/searches) since the REST client has no multi-statement transaction — atomic enough: an item
// is only ever flipped by validate_item_provenance. Browserless is the only content-fetch path.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { browserlessFetch } from "@/lib/sources/canonical-fetch.mjs";
import { fetchPrimaryWithFallback } from "@/lib/sources/primary-fallback.mjs";
import { anthropicError, isFatalAnthropic } from "@/lib/agent/anthropic-error.mjs";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { parseAgentOutput, extractClaimLedgerLenient, crossLinkClaimSources } from "@/lib/agent/parse-output";
import { specForItemType } from "@/lib/agent/extract-registry";
import { growSourcesFromBrief, parseNewSourcesFromBrief, registerCitedSources } from "@/lib/sources/source-growth";
import { buildResolver } from "@/lib/sources/institution";
import { BROWSERLESS_FETCH_CONCURRENCY } from "@/lib/agent/generation-config";
import { checkBriefContent } from "@/lib/sources/fetch-quality";
import {
  toDbSeverity, toDbTheme, toThemeCandidate, assertDbValue,
  DB_PRIORITY_VALUES, DB_URGENCY_TIER_VALUES, DB_FORMAT_TYPE_VALUES, DB_SIGNAL_BAND_VALUES,
} from "@/lib/agent/metadata-vocab";
const cleanCtl = (s: string | null | undefined) => (s == null ? s : String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " "));
// Strip markdown markers glued to the END of a URL — the synthesis wraps URLs in emphasis/code
// (*https://x/*, `https://x/`), and the URL-grounding regex (validate_item_provenance criterion 2)
// would otherwise capture the trailing marker and fail to match the grounded url. ONLY '*' and the
// backtick are stripped — '_' and '~' are VALID URL characters (e.g. .../landmark-...-04-11_en) and
// stripping them would corrupt real URLs.
const stripUrlMarkers = (s: string | null | undefined) => (s == null ? s : String(s).replace(/(https?:\/\/[^\s)\]}"'<>*`]+)[*`]+/g, "$1"));
const urlsIn = (md: string) => [...new Set((String(md || "").match(/https?:\/\/[^\s)\]}"'<>]+/g) || []).map((u) => u.replace(/[.,;:]+$/, "")))];

function svc(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
async function fetchText(url: string, max = 40000): Promise<string> {
  try { const r = await browserlessFetch(url, { maxTextLength: max }); return (cleanCtl(r.text) || "").replace(/\s+/g, " ").trim(); } catch { return ""; }
}
// Browserless enforces a hard concurrency cap (5 on the current plan). The pool fetch fired ~7
// sessions per item via Promise.all, and N concurrent batch shards multiplied that — exceeding the cap
// so Browserless REJECTED most fetches (counted as "no fetchable content", not actually unfetchable).
// Bound concurrent fetches so (shards x FETCH_CONCURRENCY) stays under the cap. Tune via the
// generation-config knob (rule 017: tuning knobs are named constants, not inline process.env).
const FETCH_CONCURRENCY = BROWSERLESS_FETCH_CONCURRENCY;
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  async function worker() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); } }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
async function callSonnet(system: string, user: string): Promise<string> {
  // max_tokens 24000 (was 16000): a rich brief + Claim Provenance Ledger + trailing YAML overran the 16k
  // cap on large-pool items (the singapore-maritime regen truncated before the YAML -> parse failure ->
  // a billed call wasted). 24000 is the proven prior value (b2-runner). The trailing ledger+YAML are the
  // first casualties of truncation, so the headroom directly protects metadata persistence.
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 24000, system, messages: [{ role: "user", content: user }] }),
  });
  const d = await resp.json().catch(() => ({}));
  if (!resp.ok) throw anthropicError(resp.status, d);
  return ((d.content as Array<{ type: string; text?: string }>) || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

// Sonnet WITH the server-side web_search tool (Anthropic runs the searches; one round-trip returns
// the final text). Same tool/beta wiring as src/lib/sources/discovery.ts. Used for source discovery.
const WEB_SEARCH_BETA = "web-search-2025-03-05";
const WEB_SEARCH_TOOL = "web_search_20250305";
async function callSonnetSearch(system: string, user: string, maxUses = 6): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "anthropic-beta": WEB_SEARCH_BETA },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 4000, tools: [{ type: WEB_SEARCH_TOOL, name: "web_search", max_uses: maxUses }], system, messages: [{ role: "user", content: user }] }),
  });
  const d = await resp.json().catch(() => ({}));
  if (!resp.ok) throw anthropicError(resp.status, d);
  return ((d.content as Array<{ type: string; text?: string }>) || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

export interface Corroborator { name: string; url: string; type?: string; why: string }

/** DEEP DIVE step 1: web_search for authoritative corroborating/expanding sources for THIS item —
 *  official pages, academic institutions, named participants/partners, reputable trade press. Returns
 *  real reachable URLs only (from the search results). This is the auto-discovery that replaces the
 *  hand-listed source set in jolt-exemplar-regen.mjs. Never invents URLs; on any failure returns []. */
export async function discoverCorroborators(title: string, primaryUrl: string, primaryText: string): Promise<Corroborator[]> {
  const system = `You research corroborating and expanding sources for a freight-sustainability intelligence brief.
Use web_search to find AUTHORITATIVE sources that corroborate, expand, or add current status/detail to the topic:
official / regulator pages, academic institutions, named participants or consortium partners, and reputable trade press.
Return STRICT JSON ONLY (no prose, no code fences):
{"sources":[{"name":"...","url":"https://...","type":"official|academic|trade_press|participant|standards|aggregator","why":"<=160 chars"}]}
Rules: up to 6 sources; REAL reachable URLs only, taken from your search results — NEVER invent a URL; prefer
primary/authoritative over blogs; a deeper page on the primary's own domain is allowed when it adds material.`;
  const user = `Topic / item title: "${title}"
Primary source: ${primaryUrl}
Primary source extract (may be thin — that is exactly why you must search):
${(primaryText || "").slice(0, 3000)}

Search the web and return the JSON list of corroborating / expanding sources.`;
  let txt: string;
  try { txt = await callSonnetSearch(system, user, 6); } catch { return []; }
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const o = JSON.parse(m[0]) as { sources?: Array<Record<string, unknown>> };
    const out: Corroborator[] = [];
    const seen = new Set<string>();
    for (const s of o.sources ?? []) {
      const url = typeof s.url === "string" ? s.url.trim() : "";
      const name = typeof s.name === "string" ? s.name.trim() : "";
      if (!name || !/^https?:\/\//i.test(url) || seen.has(url.toLowerCase())) continue;
      seen.add(url.toLowerCase());
      out.push({ name, url, type: typeof s.type === "string" ? s.type : undefined, why: typeof s.why === "string" ? s.why.slice(0, 160) : "" });
      if (out.length >= 6) break;
    }
    return out;
  } catch { return []; }
}

// web_search for the OFFICIAL alternative when a declared primary roadblocks. Aims at the issuer's OWN
// English page / authoritative text (EUR-Lex EN, a regulator's .gov/.go.jp/.gov.in English page, an
// official press release) — NEVER a summary, explainer, news, or commentary (a summary resolves
// sub-floor anyway; the per-type floor enforces qualification regardless of what this returns).
async function webSearchAlternatives(title: string, itemType: string, reason: string): Promise<string[]> {
  const system = `You locate the OFFICIAL PRIMARY source for a ${itemType}. You return only the issuer's OWN authoritative pages (the regulator / ministry / official body), in English where an official English version exists. You NEVER return summaries, law-firm explainers, news articles, blogs, or third-party commentary.`;
  const user = `The declared primary source for "${title}" is unreachable (roadblock: ${reason}). Find the OFFICIAL issuer's own English-language page(s) carrying the authoritative text or official announcement (e.g. EUR-Lex EN, an official government English page, a regulator press release). Search the web and return the JSON list { "urls": ["..."] } of up to 5 official-source URLs, most authoritative first. Official issuer pages ONLY — no summaries or commentary.`;
  let txt: string;
  try { txt = await callSonnetSearch(system, user, 4); } catch { return []; }
  return [...new Set((txt.match(/https?:\/\/[^\s)\]}"'<>]+/g) || []).map((u) => u.replace(/[.,;:]+$/, "")))];
}

// Browserless fetch returning EXTRACTED+cleaned text, the same normalisation fetchText applies — the
// roadblock detector runs on this extracted text. No catch here: fetchPrimaryWithFallback's boundedFetch
// owns the timeout race + error→reason mapping.
const blFetchClean = async (url: string): Promise<{ text: string }> => {
  const r = await browserlessFetch(url, { maxTextLength: 30000 });
  return { text: (cleanCtl(r.text) || "").replace(/\s+/g, " ").trim() };
};

/** Canonical primary fetch with the roadblock→bounded-alternative-search capability bound to the real
 *  deps (Browserless + official-alternative web_search). BOTH generateBrief and phase2-reground call this
 *  so they inherit the fallback uniformly. Returns usable content + the full audit trail (discovery only —
 *  tier/floor qualification is unchanged downstream). */
export async function fetchPrimaryDeep(item: { title: string; primaryUrl: string; itemType: string }) {
  return fetchPrimaryWithFallback(item, { browserlessFetch: blFetchClean, webSearchAlternatives, perFetchMs: 20000, maxAlts: 3 });
}

export interface StepResult { ok: boolean; detail: string }

// Sentinel returned by generateBriefFromStored when no reusable pool exists. The cache-checked retry
// (Edit B) falls back to a fresh fetch ONLY on this exact signal — a synthesis failure on the cached
// path is retryable FROM CACHE (re-scraping it would defeat the persist-before-process protection), so
// the fallback must key on "no pool", not on any ok:false.
export const NO_STORED_POOL = "no usable stored pool (needs a fresh scrape)";

/** Synthesise the format-selected brief ACROSS a source pool and persist full_brief. SHARED by
 *  generateBrief (fresh-fetched pool) and generateBriefFromStored (saved pool) so the skill-bearing
 *  synthesis prompt lives in ONE place (no drift). Does NOT touch agent_run_searches — the caller owns
 *  the pool (fresh-fetch overwrites it; from-stored reuses it). */
async function synthesiseAndWriteBrief(
  sb: SupabaseClient,
  it: { id: string; title: string; item_type: string; source_id: string | null; source_url: string },
  fetched: { url: string; text: string }[],
  corroborators: Corroborator[],
): Promise<StepResult> {
  const blocks = fetched.map((b) => `### SOURCE url=${b.url}\n${b.text.slice(0, 12000)}`).join("\n\n");
  const discoveredHint = corroborators.length
    ? `\nCorroborating sources discovered for this item (cite the ones you actually use; list each under "## New Sources Identified" with a tier estimate + why it matters — these grow the source registry):\n${corroborators.map((c) => `- ${c.name} — ${c.url}${c.why ? " — " + c.why : ""}`).join("\n")}`
    : "";
  // FORMAT DETERMINISM (2026-06-09): the brief format is f(item_type) by contract (CLAUDE.md format
  // mapping), NOT an agent free-choice. The agent was emitting the wrong format (e.g. market_signal_brief
  // for a regulation/framework) → a market brief structurally has no reg slots → criterion-5
  // missing_required_slot fails every time → quarantine. Pin the format + its section set into the prompt
  // so the STRUCTURE is right (and override format_type post-parse so metadata cannot drift).
  const fmtSpec = specForItemType(it.item_type);
  const formatDirective = fmtSpec
    ? `\nFORMAT — MANDATORY, do NOT pick another: item_type "${it.item_type}" is a ${fmtSpec.formatType}. Emit exactly "format_type: ${fmtSpec.formatType}" in the YAML and structure the brief with ONLY this format's sections (omit-with-note any you cannot honestly ground; NEVER substitute another format's sections): ${fmtSpec.sections.map((s) => s.heading).join("; ")}.`
    : "";
  const user = `Generate the ${it.item_type} brief for: "${it.title}".${formatDirective}
Synthesise ACROSS ALL the source blocks below — do NOT rely on the primary source alone; the corroborating sources carry detail (participants, phase, timing, operational specifics) the primary may lack.
Apply the Forward-Intelligence Rule: for in-progress work surface design, participants/parties, current phase/status, and expected timing as first-class (these ARE the finding); a stated schedule is a FACT (cite it), otherwise emit a labeled "Analytical inference:" estimate; set severity MONITORING with a re-check window when the outcome is still pending.
Apply the No-Vacuum Rule: where the topic connects to a specific regulation, market signal, or operational decision, name and link it — that connection is direction, not decoration.
Ground every FACT claim's source_span as a VERBATIM substring of one of the SOURCE blocks below; set source_url to THAT block's url. HARD RULE: a FACT claim's source_url MUST be one of the SOURCE block urls actually provided below — never a URL you only saw while searching. A source you know of but that is NOT among the blocks below may be listed under "## New Sources Identified" as a lead for later retrieval, but MUST NOT be used as a FACT source_url or source_span; carry its content as a labeled "Analytical inference:" or omit it. Item source_id for the primary FACT source_id: ${it.source_id}.${discoveredHint}
VALIDATION DISCIPLINE — the brief is auto-validated and REJECTED (rolled back to quarantine) if violated. Before you finish, RE-READ the WHOLE brief and fix every instance — these two are the dominant rejection causes on long briefs:
- LABELING / binding verbs: every analytical, interpretive or forward-looking sentence MUST start with "Analytical inference:", "Industry interpretation:", or "Operational implication:". In particular ANY sentence using a binding-obligation verb (must, requires, mandates, obligates, prohibits, "applies to", shall) MUST EITHER (a) be a VERBATIM quote from a SOURCE block (so it grounds as a FACT) OR (b) begin with one of those labels. No unlabeled, unsourced "X must/requires Y" is allowed ANYWHERE — sweep every section, not just the first; this is the single most common long-brief rejection.
- URL discipline: every URL anywhere in the brief body MUST be EITHER (a) copied exactly from a SOURCE block url, OR (b) listed in your "## New Sources Identified" table. A URL that appears in prose but is in NEITHER place WILL REJECT the brief — grounding only recognises SOURCE-block urls and New-Sources-table urls. To reference a source you did not fetch, put it in the New Sources table; never drop a bare/known URL into prose, never invent a path, no markdown emphasis around URLs.
Follow your output contract exactly: brief body, then the Claim Provenance Ledger, then the YAML frontmatter, including a "## New Sources Identified" table of the corroborating sources you used.

SOURCE CONTENT (copy FACT spans verbatim from here — ${fetched.length} sources):
${blocks}`;
  const parsed = parseAgentOutput(await callSonnet(SYSTEM_PROMPT, user));
  const body = stripUrlMarkers((parsed.body || "").trim()) as string;
  if (body.length < 600) return { ok: false, detail: `parsed body too short (${body.length})` };
  // research-or-erase gate: a brief that reads as a fetch-failure explanation must NOT persist.
  const cc = checkBriefContent(body);
  if (!cc.ok) return { ok: false, detail: `brief_failure_gate: ${cc.reason}` };
  // Persist the FULL 13-field contract, not just the body. The agent emits the validated YAML metadata
  // (parseAgentOutput validates severity/format_type/topic_tags vocab); writing only full_brief left
  // format_type/severity/topic_tags/intersection fields stale — items re-grounded but stayed
  // non-conformant. (env-policy "every regeneration writes 13 fields".) last_regenerated_at is overridden
  // with REAL now (the agent's emitted timestamp is unreliable); UUID arrays are filtered to valid UUIDs.
  const md = parsed.metadata;
  // FORMAT DETERMINISM (cont.): force format_type to the canonical f(item_type) value regardless of what
  // the agent emitted — metadata must never drift from item_type (sectionBrief extracts by item_type, so a
  // mismatched format_type guaranteed criterion-5 failure). The prompt directive above makes the structure
  // comply; this makes the stored label match.
  if (fmtSpec) md.format_type = fmtSpec.formatType as typeof md.format_type;
  const nowIso = new Date().toISOString();
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cleanUuids = (a: unknown) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && UUID.test(x)) : []);
  // Map/validate every CHECK-constrained field to its LIVE DB vocabulary BEFORE the write (metadata-vocab
  // is the single source of truth). severity: skill DISPLAY form ("MONITORING") -> db lowercase_underscore
  // ("monitoring") — this mismatch silently rejected the WHOLE update before. theme: gate to the live
  // /research vocab, else null (no force-fit; the dropped value is logged pending the Emergence-Capture
  // residual store). priority/urgency_tier/format_type/signal_band: defensive assert (the parser already
  // guarantees these against sets identical to the DB, so a throw here means parser/DB drift — fail LOUD,
  // named, not a silent whole-row reject).
  const dbSeverity = toDbSeverity(md.severity);
  const dbTheme = toDbTheme(md.theme);
  // capture-not-null (INV-1, migration 136): bank an out-of-vocab theme instead of dropping it.
  const themeCandidate = toThemeCandidate(md.theme);
  if (themeCandidate) console.warn(`[canonical-pipeline] theme "${themeCandidate}" out-of-vocab on item ${it.id} -> theme=null, banked in theme_candidate (Emergence-Capture residual)`);
  assertDbValue("priority", md.priority, DB_PRIORITY_VALUES, /*nullable*/ false);
  assertDbValue("urgency_tier", md.urgency_tier, DB_URGENCY_TIER_VALUES);
  assertDbValue("format_type", md.format_type, DB_FORMAT_TYPE_VALUES);
  assertDbValue("signal_band", md.signal_band, DB_SIGNAL_BAND_VALUES);
  const { error: writeErr } = await sb.from("intelligence_items").update({
    full_brief: cleanCtl(body),
    severity: dbSeverity, priority: md.priority, urgency_tier: md.urgency_tier,
    format_type: md.format_type, topic_tags: md.topic_tags,
    signal_band: md.signal_band, theme: dbTheme, theme_candidate: themeCandidate, trajectory_points: md.trajectory_points,
    what_it_changes: md.what_it_changes, does_not_resolve: md.does_not_resolve,
    conversion_trigger: md.conversion_trigger, cross_references: md.cross_references,
    operational_scenario_tags: md.operational_scenario_tags, compliance_object_tags: md.compliance_object_tags,
    related_items: cleanUuids(md.related_items), intersection_summary: md.intersection_summary,
    sources_used: cleanUuids(md.sources_used), regeneration_skill_version: md.regeneration_skill_version,
    last_regenerated_at: nowIso, updated_at: nowIso,
  }).eq("id", it.id);
  // FAIL LOUD: the prior code dropped `error` here, so a CHECK violation rejected the ENTIRE update
  // (full_brief + all metadata) while the function still reported ok:true. Surface it with field context
  // so any future constraint mismatch self-identifies (CLAUDE.md error-swallow post-mortem; Emergence INV-3).
  if (writeErr) {
    return { ok: false, detail: `metadata_write_rejected: ${writeErr.message} (sev=${dbSeverity}, fmt=${md.format_type}, theme=${dbTheme ?? "null"}, prio=${md.priority})` };
  }
  return { ok: true, detail: `brief ${body.length}ch + 19-field metadata (fmt=${md.format_type}, sev=${dbSeverity}) from ${fetched.length} sources` };
}

/** STEP generate — the DEEP DIVE (the only generator). Fetch the primary source, web_search for
 *  corroborating/expanding sources, fetch that multi-source pool, then synthesise the format-selected
 *  brief ACROSS the pool (system prompt selects by item_type; Forward-Intelligence + No-Vacuum apply).
 *  A thin primary source is the TRIGGER to research wider, never a reason to emit a thin brief. */
export async function generateBrief(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it } = await sb.from("intelligence_items").select("id, title, item_type, source_id, source_url").eq("id", itemId).single();
  if (!it) return { ok: false, detail: "item not found" };

  // 1. primary source — with the roadblock→bounded-alternative-search capability: a hanging / blocked /
  //    wrong-language declared primary is replaced by an OFFICIAL alternative (discovery only — the
  //    resolver + per-type floor still qualify whatever it returns). A thin REAL primary is kept as-is;
  //    discovery below carries the weight. Fetched ONCE here (never re-fetched in the pool below).
  const pf = await fetchPrimaryDeep({ title: it.title, primaryUrl: it.source_url, itemType: it.item_type });
  const primaryUrl = pf.url, primary = pf.text;
  // 2. DEEP DIVE: discover corroborating/expanding sources via web_search
  const corroborators = await discoverCorroborators(it.title, primaryUrl, primary);
  // 3. multi-source fetch (the discovered corroborators), then prepend the already-fetched primary
  const poolUrls = ([...new Set(corroborators.map((c) => c.url).filter(Boolean))] as string[]).filter((u) => u !== primaryUrl);
  const fetchedCorr = (await mapLimit(poolUrls, FETCH_CONCURRENCY, async (u) => ({ url: u, text: await fetchText(u, 14000) }))).filter((b) => b.text.length > 200);
  const fetched = [...(primary.length > 200 ? [{ url: primaryUrl, text: primary }] : []), ...fetchedCorr];
  if (!fetched.length) return { ok: false, detail: `no fetchable source content (primary ${primary.length}ch ${pf.fellBack ? `via fallback after ${pf.primaryReason}` : "declared"}; ${corroborators.length} discovered, none fetchable)` };

  // PERSIST-BEFORE-PROCESS (Edit A — failure-path protection): write the fetched pool to
  // agent_run_searches BEFORE the synthesis call below, so a synthesis hang/throw (the network-failing
  // step) never discards the already-paid-for Browserless + web_search bytes. A retry then re-synthesises
  // from this stored pool (generateBriefFromStored) with zero re-fetch. `fetched` is final here — the
  // L241 mapLimit has fully resolved — so the reorder is safe.
  //
  // GUARD 1 — ALL-OR-NOTHING: the persist is a SINGLE batched INSERT (one Postgres statement, atomic), so
  // a mid-insert link drop can never leave a PARTIAL pool that the stored-reader later treats as complete
  // (its >200ch filter is a usability check, not an integrity guarantee against partial writes). A
  // regeneration replaces the prior pool: DELETE then the one batched INSERT. If the INSERT fails the run
  // returns generate_failed with no brief written and no partial pool — a clean retry, never a fragment.
  //
  // The generate-pool rows carry the fetched source CONTENT. The discovered-ref rows register EVERY
  // discovered corroborator URL (even those not fetched) as a known, web_search-sourced reference:
  // criterion-2 URL grounding accepts a URL only if it is the item source, in the fetched pool, in
  // agent_run_searches, or in the sources registry. A brief that legitimately cites an authoritative
  // source it FOUND via web_search but could NOT fetch (World Bank / EEA dashboards that block server
  // fetch) would otherwise quarantine on an "ungrounded_url" — a real URL, not an invented one. The
  // discovered-ref stubs are <200ch so the >200 grounding-corpus filter excludes them: a discovered-but-
  // unfetched URL can be CITED but can never source a FACT span (the "discovered real URL is not an
  // invented URL" distinction, bounded to the web_search-discovered set; arbitrary URLs still fail).
  const ts = new Date().toISOString();
  const fetchedUrlSet = new Set(fetched.map((b) => b.url));
  const poolRows = fetched.map((b, i) => ({
    intelligence_item_id: itemId, search_query: "canonical:generate-pool", result_url: b.url,
    result_title: "generate pool source", result_index: i, result_content_excerpt: cleanCtl(b.text), searched_at: ts,
  }));
  const refRows = corroborators
    .filter((c) => c.url && !fetchedUrlSet.has(c.url))
    .map((c) => ({
      intelligence_item_id: itemId, search_query: "canonical:discovered-ref", result_url: c.url,
      result_title: c.name || "discovered reference", result_index: 80,
      result_content_excerpt: (c.name || c.why || "discovered reference").slice(0, 180), searched_at: ts,
    }));
  await sb.from("agent_run_searches").delete().eq("intelligence_item_id", itemId);
  const { error: poolErr } = await sb.from("agent_run_searches").insert([...poolRows, ...refRows]);
  if (poolErr) return { ok: false, detail: `pool persist failed (pre-synthesis): ${poolErr.message}` };

  // 4. synthesise across the WHOLE pool (shared with generateBriefFromStored — same skill-bearing prompt).
  // The pool is already durable above; a failure here is resumable from the stored pool, not a re-scrape.
  const r = await synthesiseAndWriteBrief(sb, it, fetched, corroborators);
  if (!r.ok) return r;
  return { ok: true, detail: `${r.detail} (${corroborators.length} discovered via web_search)` };
}

/** REBUILD-FROM-STORED: re-synthesise the brief from the SAVED agent_run_searches pool — NO Browserless,
 *  NO web_search. For the first-build conformance redo: reformat the corpus to the current skills using
 *  content ALREADY pulled, instead of re-scraping. (Re-scrape stays a SEPARATE future capability for
 *  freshness/change-detection + new-item discovery.) Returns ok:false (caller falls back to a fresh
 *  generateBrief) when no usable stored pool exists. Reuses the saved pool as-is — does NOT overwrite it. */
export async function generateBriefFromStored(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it } = await sb.from("intelligence_items").select("id, title, item_type, source_id, source_url").eq("id", itemId).single();
  if (!it) return { ok: false, detail: "item not found" };
  const { data: pool } = await sb.from("agent_run_searches").select("result_url, result_title, result_content_excerpt, search_query, searched_at").eq("intelligence_item_id", itemId);
  const rows = pool ?? [];
  // generate-pool rows carry the fetched source CONTENT (>200ch); discovered-ref stubs (<200ch) are leads only.
  const usable = rows.filter((r) => typeof r.result_url === "string" && (r.result_content_excerpt || "").length > 200);
  const fetched = usable.map((r) => ({ url: r.result_url as string, text: r.result_content_excerpt as string }));
  if (!fetched.length) return { ok: false, detail: NO_STORED_POOL };
  // GUARD 3 — staleness visible: the pool's OLDEST fetch date is the age of the grounding bytes being
  // reused, and fetch date is part of regulatory provenance. Surface it in the detail (-> agent_runs)
  // so reused-stale-content is a DETECTABLE condition, never invisible. --refresh is the deliberate
  // force-rescrape lever (Edit B); change-detection is intentionally NOT built here.
  const stamps = usable.map((r) => r.searched_at).filter((s): s is string => typeof s === "string");
  const oldest = stamps.length ? stamps.reduce((a, b) => (a < b ? a : b)) : null;
  const ageNote = oldest ? `, pool fetched ${oldest.slice(0, 10)}` : "";
  const corroborators: Corroborator[] = rows
    .filter((r) => r.search_query === "canonical:discovered-ref" && typeof r.result_url === "string")
    .map((r) => ({ name: typeof r.result_title === "string" ? r.result_title : "discovered reference", url: r.result_url as string, why: "" }));
  const r = await synthesiseAndWriteBrief(sb, it, fetched, corroborators);
  if (!r.ok) return r;
  return { ok: true, detail: `${r.detail} (FROM STORED pool — 0 fetches, ${corroborators.length} stored refs${ageNote})` };
}

/** STEP section: format-selected extractor (via the registry) -> upsert intelligence_item_sections.
 *  Dispatches by item_type through specForItemType — ONE path for every surface (regulation, research,
 *  market, technology, operations). Surfaces that render structured components re-parse content_md at
 *  render time; the rows stored here are format-generic. */
export async function sectionBrief(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it } = await sb.from("intelligence_items").select("item_type, full_brief, provenance_status").eq("id", itemId).single();
  if (!it?.full_brief) return { ok: false, detail: "no full_brief" };
  // F2 SKIP-IF-VERIFIED GUARD (mirrors groundBrief): section_claim_provenance.section_row_id FKs into
  // intelligence_item_sections ON DELETE CASCADE, so the blanket section delete below would
  // CASCADE-destroy a verified item's entire claim ledger — and since the set_provenance_status trigger
  // is AFTER INSERT/UPDATE (not DELETE), the item would stay labeled 'verified' with no claims
  // (stale-verified = fabricated certification). A verified item is already sectioned + grounded; never
  // re-section it. Re-sectioning is for fresh/quarantined items only (which carry no certification to lose).
  if (it.provenance_status === "verified") return { ok: true, detail: "already verified — skip re-section (ledger-preserving)" };
  const spec = specForItemType(it.item_type);
  if (!spec) return { ok: false, detail: `no format spec for item_type ${it.item_type}` };
  const rows = spec.extract(it.full_brief);
  if (!rows.length) return { ok: false, detail: `no sections extracted (${spec.formatType})` };
  // Replace stale sections from a prior generation (a re-gen may emit fewer/renamed sections). Safe here:
  // the item is NOT verified (guarded above), so the CASCADE clears only an in-progress/quarantined ledger.
  await sb.from("intelligence_item_sections").delete().eq("item_id", itemId);
  for (const s of rows) {
    await sb.from("intelligence_item_sections").insert(
      { item_id: itemId, section_key: s.section_key, section_order: s.section_order, content_md: s.content_md, is_conditional: s.is_conditional }
    );
  }
  return { ok: true, detail: `${rows.length} sections` };
}

/** STEP ground: claim-ledger + verbatim span-check + validate_item_provenance; keep claims only if
 *  valid (else delete them — manual rollback). The set_provenance_status trigger flips on the writes. */
export async function groundBrief(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it } = await sb.from("intelligence_items").select("id, item_type, source_id, source_url, full_brief").eq("id", itemId).single();
  if (!it?.source_id) return { ok: false, detail: "no source_id" };
  // Idempotency scoped to VERIFIED (not "any claims exist"). A quarantined/ungrounded item is
  // re-groundable — the prior guard ("any claims -> already grounded") silently blocked re-grounding a
  // quarantined item against a new/expanded section set (e.g. after a section backfill) if a partial run
  // had left claims. Skip only verified; for everything else clear stray claims so the re-ground starts
  // clean (no duplicate rows), then proceed.
  const { data: prov } = await sb.from("intelligence_items").select("provenance_status").eq("id", itemId).single();
  if (prov?.provenance_status === "verified") return { ok: true, detail: "already verified" };
  await sb.from("section_claim_provenance").delete().eq("intelligence_item_id", itemId);
  const { data: secs } = await sb.from("intelligence_item_sections").select("id, section_key, content_md").eq("item_id", itemId).order("section_order");
  if (!secs?.length) return { ok: false, detail: "no sections" };
  // Record the brief's surfaced sources as cited-URL searches so criterion-2 URL grounding (EXACT-URL
  // match) accepts the corroborator URLs the brief cites — they are real, web_search-discovered URLs in
  // the brief's New Sources table. registerCitedSources (in grow) is host-deduped and would NOT make an
  // exact path on a known host (iea.org/reports/...) grounded; an exact-URL agent_run_searches row does.
  // FACT-span grounding (criterion 3) still uses only the FETCHED pool's real content — these stubs are
  // <200ch so groundBrief's >200 filter excludes them from the span corpus — so a cited-only URL can
  // never ground a FACT. grow still registers + compounds these sources afterwards.
  try {
    for (const cs of parseNewSourcesFromBrief(it.full_brief || "")) {
      const u = stripUrlMarkers(cs.url) as string;
      const { data: ex } = await sb.from("agent_run_searches").select("id").eq("intelligence_item_id", itemId).eq("result_url", u).limit(1);
      if (!ex?.length) await sb.from("agent_run_searches").insert({ intelligence_item_id: itemId, search_query: "canonical:cited-source", result_url: u, result_title: cs.name, result_index: 90, result_content_excerpt: cs.name.slice(0, 280), searched_at: new Date().toISOString() });
    }
  } catch { /* non-fatal */ }
  const { data: slots } = await sb.from("item_type_required_slots").select("slot_key, description").eq("item_type", it.item_type);
  const sectionMap = Object.fromEntries(secs.map((s) => [String(s.section_key), s.id]));
  // Grounding corpus = the pool generate already fetched + stored (the SAME content the brief was
  // synthesised from), so a source that is unfetchable on re-check (PDF/Cloudflare) does not break
  // grounding. Fall back to fetching the section/source URLs only when no stored pool exists.
  const { data: pool } = await sb.from("agent_run_searches").select("id, result_url, result_content_excerpt").eq("intelligence_item_id", itemId);
  let fetched: Array<{ url: string; text: string }>;
  let searchRows: Array<{ id: string; result_url: string }>;
  const searchIds: string[] = [];
  let ownSearches = false;
  if (pool && pool.length) {
    fetched = pool.map((r) => ({ url: r.result_url as string, text: (r.result_content_excerpt as string) || "" })).filter((b) => b.text.length > 200);
    searchRows = pool.map((r) => ({ id: r.id as string, result_url: r.result_url as string }));
  } else {
    const groundUrls = [...new Set([it.source_url, ...secs.flatMap((s) => urlsIn(s.content_md || ""))].filter(Boolean))] as string[];
    fetched = (await mapLimit(groundUrls, FETCH_CONCURRENCY, async (u) => ({ url: u, text: await fetchText(u, 16000) }))).filter((b) => b.text.length > 200);
    searchRows = [];
    ownSearches = true;
    for (let i = 0; i < fetched.length; i++) {
      const { data: r } = await sb.from("agent_run_searches").insert({ intelligence_item_id: itemId, search_query: "canonical ground", result_url: fetched[i].url, result_title: "source", result_index: i, result_content_excerpt: fetched[i].text, searched_at: new Date().toISOString() }).select("id, result_url").single();
      if (r) { searchIds.push(r.id); searchRows.push({ id: r.id, result_url: r.result_url }); }
    }
  }
  if (!fetched.length) return { ok: false, detail: "no grounding content (no generate pool; nothing fetchable)" };
  const excByUrl = Object.fromEntries(fetched.map((b) => [b.url, b.text]));
  const allText = fetched.map((b) => b.text).join(" ").toLowerCase();
  const system = `You extract a Claim Provenance Ledger for a brief. Output ONLY the ledger.
- Emit one block: a line "<<<CLAIM_PROVENANCE_LEDGER", a JSON array, a line "CLAIM_PROVENANCE_LEDGER>>>".
- Record: {"section","claim_text","claim_kind","source_span","source_id","source_url","slot_key"}.
- FACT: source_span MUST be VERBATIM copied char-for-char from a SOURCE block. (source_id is resolved automatically from the SOURCE block that contains the span — do not hardcode it.)
- ANALYSIS: emit claim_kind "ANALYSIS" ONLY for a statement the brief text EXPLICITLY labels with "Analytical inference:", "Industry interpretation:" or "Operational implication:". Set claim_text to that labeled sentence (so it appears verbatim in the section). NEVER mark unlabeled prose as ANALYSIS — if it has a verbatim source span it is FACT, otherwise omit it.
- Cover EACH required slot with >=1 FACT or GAP claim (set slot_key):\n${(slots ?? []).map((s) => `- ${s.slot_key}: ${s.description}`).join("\n")}
- For EVERY section (${secs.map((s) => s.section_key).join(", ")}) with must/requires/shall/applies/mandates/prohibits/obligates, emit >=1 FACT claim with "section" set + a verbatim span.
- No verbatim span for a slot -> claim_kind "GAP", source_span null. Never invent spans. CLOSE with CLAIM_PROVENANCE_LEDGER>>>.`;
  const user = `BRIEF SECTIONS:\n${secs.map((s) => `### SECTION ${s.section_key}\n${(s.content_md || "").slice(0, 2200)}`).join("\n\n")}\n\n====\nSOURCE CONTENT (copy spans VERBATIM):\n${fetched.map((b, i) => `### SOURCE ${i + 1} url=${b.url}\n${b.text.slice(0, 16000)}`).join("\n\n")}`;
  let claims;
  // Lenient extraction: a single malformed claim is skipped, not fatal — one bad FACT must not reject
  // the whole ledger (the 0-FACT quarantine on rich synthesised briefs). The kept-filter + the gate
  // below still enforce verbatim-span/label discipline, so nothing ungrounded slips through.
  // A FATAL anthropic error (out-of-credits / auth / bad-request) is NOT a per-item content failure — it
  // re-throws so the batch runner HALTS with the actionable cause, instead of mislabeling every remaining
  // item as "still-quarantined". Only a transient/parse failure degrades to a per-item ok:false (full
  // message, never truncated — the diagnostic must survive).
  try { claims = extractClaimLedgerLenient(await callSonnet(system, user)); }
  catch (e) { if (isFatalAnthropic(e)) throw e; return { ok: false, detail: `ledger call failed: ${(e as Error).message}` }; }
  for (const cl of claims) { if (cl.source_url) cl.source_url = stripUrlMarkers(cl.source_url) as string; }
  // Mirror validate_item_provenance criteria so every INSERTED claim already passes the gate:
  //  - FACT: source_span must be a verbatim substring of fetched content (criterion 3).
  //  - ANALYSIS: claim_text must appear verbatim in a section that ALSO carries an analysis label
  //    (criterion 4) — drop a paraphrased/unlabeled ANALYSIS claim rather than fail the whole item.
  const ANALYSIS_LABELS = ["analytical inference", "industry interpretation", "operational implication"];
  const sectionTextsLc = secs.map((s) => (s.content_md || "").toLowerCase());
  const analysisGrounded = (claimText: string | null | undefined) => {
    const ct = String(claimText || "").toLowerCase().trim();
    return ct.length > 0 && sectionTextsLc.some((t) => ANALYSIS_LABELS.some((l) => t.includes(l)) && t.includes(ct));
  };
  const kept = claims.filter((cl) => {
    if (cl.claim_kind === "FACT") return cl.source_span ? (excByUrl[cl.source_url ?? ""] || allText).toLowerCase().includes(String(cl.source_span).toLowerCase().trim()) : false;
    if (cl.claim_kind === "ANALYSIS") return analysisGrounded(cl.claim_text);
    return true; // GAP / other kinds carry no span/label obligation
  });

  const linked = crossLinkClaimSources(kept, searchRows);
  // CANONICAL TIER STAMP + HONEST ATTRIBUTION (F1 fix, Phase 0'/Phase 1). No constants, no primary
  // hardcode. A FACT claim is attributed to the source that CONTAINS ITS SPAN: resolve the span's pool
  // row (search_result_id -> result_url) to its institution's canonical registered source + tier via the
  // SINGLE resolver module (src/lib/sources/institution.ts — same code the claims-tier audit certifies).
  // source_id = the resolved registered source (NULL when the span host is unregistered); the tier stamp
  // = the resolved canonical institutional tier (NULL when unregistered). Register-before-ground (the
  // register step in the canonical order) means corroborator hosts are registered by now, so a
  // corroborator-grounded claim resolves instead of NULL-stamping spuriously. Sources are paginated
  // (the registry exceeds the 1000-row PostgREST cap).
  const allSources: Array<{ id: string; url: string; base_tier: number | null; effective_tier: number | null; tier_override: number | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("sources").select("id,url,base_tier,effective_tier,tier_override").order("id").range(from, from + 999);
    if (!data?.length) break; allSources.push(...(data as typeof allSources)); if (data.length < 1000) break;
  }
  const resolver = buildResolver(allSources);
  const urlBySearchId = new Map(searchRows.map((r) => [r.id, r.result_url]));
  const claimIds: string[] = [];
  for (const c2 of linked) {
    const sectionRowId = sectionMap[String(c2.section)] || secs[0].id;
    const storedText = cleanCtl((["FACT", "GAP"].includes(c2.claim_kind) && c2.slot_key) ? `[${c2.slot_key}] ${c2.claim_text}` : c2.claim_text ?? "");
    const isFact = c2.claim_kind === "FACT";
    const spanUrl = c2.search_result_id ? urlBySearchId.get(c2.search_result_id) : undefined;
    const res = isFact && spanUrl ? resolver.resolveSpan(spanUrl) : { tier: null, sourceId: null };
    // FACT: honest per-span attribution (NULL when unregistered). Non-FACT carry no span -> keep the
    // ledger's source_id (or item primary) and a NULL tier stamp.
    const sourceId = isFact ? res.sourceId : (c2.source_id || it.source_id);
    const { data: ins } = await sb.from("section_claim_provenance").insert({ section_row_id: sectionRowId, intelligence_item_id: itemId, claim_text: storedText, claim_kind: c2.claim_kind, source_span: cleanCtl(c2.source_span ?? null), source_id: sourceId, search_result_id: c2.search_result_id || null, source_tier_at_grounding: isFact ? res.tier : null }).select("id").single();
    if (ins) claimIds.push(ins.id);
  }
  const { data: vrData, error: vrErr } = await sb.rpc("validate_item_provenance", { p_item_id: itemId } as never);
  const vr = (Array.isArray(vrData) ? vrData[0] : vrData) as { valid: boolean; recommended_status: string; failures: unknown } | undefined;
  if (vr?.valid) return { ok: true, detail: `grounded kept=${kept.length} -> ${vr.recommended_status}` };
  // B2 RETAIN-ON-FAILURE: do NOT delete the just-inserted claims on a validation failure. Deleting the
  // ledger erased the evidence of WHY grounding failed (it cost the 45-flip forensics once). The item is
  // already 'quarantined' (the per-insert set_provenance_status trigger ran validate on each claim and
  // set the status), so the failed ledger persists as a diagnosable artifact. The NEXT re-ground clears
  // these stray claims at its start (groundBrief deletes section_claim_provenance for any non-verified
  // item before re-extracting), so retention never duplicates. claimIds retained intentionally.
  void claimIds;
  // Still clean up ONLY the fallback searches THIS step created (no stored pool) so the agent_run_searches
  // corpus does not accumulate across failed attempts; the generate-stored pool is left intact for re-ground.
  if (ownSearches && searchIds.length) await sb.from("agent_run_searches").delete().in("id", searchIds);
  const why = vrErr ? `rpc error: ${vrErr.message}` : `validation failed: ${JSON.stringify(vr?.failures ?? "no result")}`;
  return { ok: false, detail: why.slice(0, 140) };
}

/** STEP register (canonical order: generate -> REGISTER -> section -> ground -> credit). Registers the
 *  brief's "New Sources Identified" corroborators into the sources registry BEFORE grounding, so a
 *  corroborator-grounded FACT claim's host is registered at stamp time and resolves to a real
 *  institutional tier instead of NULL-stamping spuriously (the F1 register-before-ground ordering).
 *  BEST-EFFORT + IDEMPOTENT (registerCitedSources host-dedups; a failure must NOT abort generation) and
 *  NO crediting here — recordCitations + compoundSourceCredibility stay in growSources (no double-credit). */
export async function registerBriefSources(itemId: string): Promise<StepResult> {
  const sb = svc();
  try {
    const { data: it } = await sb.from("intelligence_items").select("full_brief").eq("id", itemId).single();
    if (!it?.full_brief) return { ok: true, detail: "no full_brief (skip register)" };
    const cited = parseNewSourcesFromBrief(it.full_brief);
    if (!cited.length) return { ok: true, detail: "no new sources to register" };
    const reg = await registerCitedSources(sb, cited);
    const newOrExisting = reg.filter((r) => r.source_id).length;
    return { ok: true, detail: `registered ${newOrExisting}/${cited.length} corroborators (pre-ground)` };
  } catch (e) {
    // best-effort: never block generation on a registration failure
    return { ok: true, detail: `register skipped (non-fatal): ${(e as Error).message.slice(0, 60)}` };
  }
}

/** STEP grow: register the brief's surfaced sources, record citations, compound credibility
 *  (the proven growSourcesFromBrief). */
export async function growSources(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it } = await sb.from("intelligence_items").select("source_id, full_brief").eq("id", itemId).single();
  if (!it?.source_id || !it.full_brief) return { ok: false, detail: "no source_id/full_brief" };
  const res = await growSourcesFromBrief(sb, it.source_id, it.full_brief);
  return { ok: true, detail: `registered=${res.registered.length} citations+${res.citationsRecorded} trust_citation=${res.compound.after.trust_score_citation.toFixed(2)}` };
}
