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
import { fetchPrimaryWithFallback, detectRoadblock } from "@/lib/sources/primary-fallback.mjs";
import { looksLikePdfUrl, classifyBody, pdfToText } from "@/lib/sources/pdf-extract.mjs";
import { anthropicError, isFatalAnthropic } from "@/lib/agent/anthropic-error.mjs";
import { streamMessagesText } from "@/lib/agent/anthropic-stream.mjs";
import { twoPassGenerate } from "@/lib/agent/two-pass-generate.mjs";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { parseAgentOutput, extractClaimLedgerLenient, crossLinkClaimSources, findYamlBlock } from "@/lib/agent/parse-output";
import { specForItemType } from "@/lib/agent/extract-registry";
import { growSourcesFromBrief, parseNewSourcesFromBrief, registerCitedSources, registerPoolHostsForGrounding } from "@/lib/sources/source-growth";
import { buildResolver, hostOf, type SourceRow, type Resolver } from "@/lib/sources/institution";
import { buildSourceBlocks, authorityFloorFor } from "@/lib/agent/source-blocks.mjs";
import { floorSources, reattributeToFloor } from "@/lib/agent/floor-attribution.mjs";
import { mergeNullTierAggregate, summarizeNullTierAggregate } from "@/lib/agent/null-tier-flag.mjs";
import { BROWSERLESS_FETCH_CONCURRENCY, PRIMARY_MAX_CHARS, CORROBORATOR_MAX_CHARS, SYNTH_INPUT_BUDGET_CHARS, SYNTH_PRIMARY_HARD_CEILING_CHARS, GROUND_SECTION_MAX_CHARS, sonnetCostUsd } from "@/lib/agent/generation-config";
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
// ── FETCH TRANSPORTS (Part A — full download + no-silent-truncation) ──
interface FetchResult { text: string; truncated: boolean; fullLength: number; cap: number; transport: string }

// Static-HTML official/legal hosts that serve the ENACTED TEXT to a plain server fetch (no JS render, no
// bot wall). For these we pull the FULL document DIRECTLY — free, no Browserless units (PROVEN: EUR-Lex
// returns the full 458KB PPWR text this way). Browserless is the fallback. The URL is already EUR-Lex-
// normalised before the primary path calls this, and detectRoadblock still runs on the RESULT
// (fetchPrimaryWithFallback) — the new transport INHERITS every existing safety check, never skips them.
const DIRECT_FETCH_HOSTS = /(^|\.)(eur-lex\.europa\.eu|europa\.eu|federalregister\.gov|ecfr\.gov|govinfo\.gov|legislation\.gov\.uk|gov\.uk)$/i;
function directFetchEligible(url: string): boolean {
  try { return DIRECT_FETCH_HOSTS.test(new URL(url).hostname); } catch { return false; }
}
function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
// DIRECT-HTTP transport. Pulls the full document (no Browserless) for an eligible host; reports truncation
// against `max` exactly as the Browserless path does. Throws on a non-OK status so the caller's fallback fires.
async function directFetchClean(url: string, max: number): Promise<FetchResult> {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; CarosLedge/1.0)" }, redirect: "follow", signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`direct fetch ${res.status}`);
  const u8 = new Uint8Array(await res.arrayBuffer());
  // PDF-or-HTML by header-or-magic-bytes (codec choice lives in pdf-extract.mjs, pure + unit-tested): a
  // reachable PDF (the GLEC S3 whitepaper; many wave sources) extracts to text via unpdf; everything else
  // strips as HTML. truncated/fullLength reported identically for both so the no-silent-truncation guard
  // fires the same on a capped PDF as on a capped page.
  if (classifyBody(res.headers.get("content-type"), u8) === "pdf") {
    const { text: pdfText, fullLength } = await pdfToText(u8, max);
    const text = (cleanCtl(pdfText) || "").replace(/\s+/g, " ").trim();
    return { text, truncated: fullLength > max, fullLength, cap: max, transport: "direct-pdf" };
  }
  const full = htmlToText(new TextDecoder("utf-8", { fatal: false }).decode(u8));
  const text = (cleanCtl(full.slice(0, max)) || "").replace(/\s+/g, " ").trim();
  return { text, truncated: full.length > max, fullLength: full.length, cap: max, transport: "direct" };
}
// THE ONE transport primitive — the SSOT for direct-vs-Browserless selection + the TRY-BOTH fallback.
// Both the corroborator fetcher (fetchMeta) and the primary fetcher (blFetchClean) delegate here, so the
// transport rule lives in ONE place (this removes the fetchMeta-vs-blFetchClean duplication the fetch-path
// audit flagged — a fix could previously be made in one copy and not the other).
//   1. direct-HTTP first for eligible legal hosts (full, free) — accept ONLY real, non-roadblocked content.
//   2. Browserless (escalating plain -> stealth -> unblock).
//   3. TRY-BOTH (the WAF fix): if Browserless returned a block / roadblock (datacenter-IP WAF refusal, CDN
//      block page), retry the SAME url via plain direct HTTP for ANY host — plain HTTP reaches datacenter-
//      IP-WAF'd sites Browserless cannot (and the eligible-host step covers the reverse). Accept the plain
//      result only if it is real, non-roadblocked content.
//   4. dropIfBlocked: a corroborator DROPS a still-blocked result (never pollute the pool with a 553ch
//      block page); the primary KEEPS it so fetchPrimaryWithFallback's detectRoadblock sees the reason
//      (cdn_block / soft_404 / ...) and runs the official-alternative web search.
async function fetchWithTransport(url: string, max: number, { dropIfBlocked = false }: { dropIfBlocked?: boolean } = {}): Promise<FetchResult> {
  // PDF fast-path: Browserless renders a PDF as an empty viewer shell (a wasted unit + a false roadblock),
  // so a .pdf URL goes straight to byte-fetch + extract for ANY host. directFetchClean also detects
  // PDF-by-content-type/magic-bytes, so a PDF served from a non-.pdf URL is still caught on the fallback.
  if (looksLikePdfUrl(url)) {
    try { const d = await directFetchClean(url, max); if (d.text.length > 200 && !detectRoadblock(d.text).roadblocked) return d; } catch { /* not a usable PDF — fall through to the normal path */ }
  }
  if (directFetchEligible(url)) {
    try { const d = await directFetchClean(url, max); if (d.text.length > 200 && !detectRoadblock(d.text).roadblocked) return d; } catch { /* fall through */ }
  }
  let bl: FetchResult | null = null;
  try {
    const r = await browserlessFetch(url, { maxTextLength: max });
    const text = (cleanCtl(r.text) || "").replace(/\s+/g, " ").trim();
    bl = { text, truncated: !!r.truncated, fullLength: r.fullTextLength ?? text.length, cap: max, transport: r.tier ?? "browserless" };
  } catch { /* Browserless hard-errored across all tiers */ }
  if (!bl || detectRoadblock(bl.text).roadblocked) {
    try { const d = await directFetchClean(url, max); if (d.text.length > 200 && !detectRoadblock(d.text).roadblocked) return { ...d, transport: "direct-fallback" }; } catch { /* plain also failed */ }
    if (dropIfBlocked) return { text: "", truncated: false, fullLength: 0, cap: max, transport: "none" };
  }
  return bl ?? { text: "", truncated: false, fullLength: 0, cap: max, transport: "none" };
}
// Corroborator / ground fetcher: drop a still-blocked result (a failed corroborator is dropped, not fatal,
// and a block page must never enter the pool).
async function fetchMeta(url: string, max: number): Promise<FetchResult> {
  return fetchWithTransport(url, max, { dropIfBlocked: true });
}
async function fetchText(url: string, max = 40000): Promise<string> {
  return (await fetchMeta(url, max)).text;
}

// NO SILENT TRUNCATION (the must): when a fetch/read hit its cap and did NOT collect the whole document,
// surface it — one integrity_flags coverage_gap row naming each capped source (url, collected vs full
// length, cap, transport) PLUS a stderr warn. The operator is told WHAT was not collected and WHY; a
// partial collect can never again be invisible. Best-effort — the warn is the floor if the insert fails.
interface TruncEvent { url: string; collected: number; fullLength: number; cap: number; transport: string }
async function recordTruncation(sb: SupabaseClient, itemId: string, events: TruncEvent[]): Promise<void> {
  if (!events.length) return;
  // Announce EVERYTHING (no silent truncation) via warn — the floor, always.
  for (const e of events) console.warn(`[truncation-guard] item ${itemId}: ${e.url} — collected ${e.collected}/${e.fullLength} chars (cap ${e.cap}; ${e.transport})`);
  // integrity_flags (the operator queue) ONLY for a genuine coverage gap: a DOWNLOAD that exceeded its cap
  // ("notify on download" — operator's literal must), or the PRIMARY itself trimmed for synthesis (the law
  // did not fully fit → chunking case). A CORROBORATOR trimmed by the synthesis budget is EXPECTED operation
  // (corroborators share the remainder after the full primary) — warned above, never flagged, so the queue
  // carries real gaps, not a flag on every multi-source brief.
  const flagEvents = events.filter((e) => !e.transport.startsWith("synthesis-budget") || e.transport === "synthesis-budget(primary)");
  if (!flagEvents.length) return;
  const lines = flagEvents.map((e) => `${e.url} — collected ${e.collected}/${e.fullLength} chars (cap ${e.cap}; ${e.transport})`);
  try {
    await sb.from("integrity_flags").insert({
      category: "coverage_gap", subject_type: "item", subject_ref: itemId,
      description: `Source NOT fully collected for ${flagEvents.length} source(s) — the download exceeded its cap: ${lines.join("; ")}`.slice(0, 480),
      recommended_actions: flagEvents.map((e) => ({ action: "raise_cap_or_chunk", rationale: `${e.url}: collected ${e.collected}/${e.fullLength} chars (cap ${e.cap}, ${e.transport})` })),
      status: "open", created_by: "truncation-guard",
    });
  } catch { /* best-effort; the warn above is the floor */ }
}

// Ruling-5 (span-attribution unit, 2026-07-03): surface FACT spans that ground to an UNREGISTERED host
// (null tier even after floor-first re-attribution) as ONE host-aggregated integrity_flag per host. Read-
// modify-write: merge THIS item's contribution into the open flag for the host (idempotent per item), so
// the flag accumulates item/fact counts across grounding runs — the self-surfacing signal that names the
// next host to register (how lovdata.no would have been found mechanically). Best-effort: never fails
// grounding. subject_ref = host is the aggregation key; verifyCandidate consumes these at hold-lift.
async function surfaceNullTierHosts(
  sb: SupabaseClient,
  itemId: string,
  hosts: Map<string, { factCount: number; samples: string[] }>,
): Promise<void> {
  for (const [host, contribution] of hosts) {
    try {
      const { data: existing } = await sb.from("integrity_flags")
        .select("id, recommended_actions")
        .eq("created_by", "null-tier-host").eq("subject_ref", host).eq("status", "open")
        .limit(1).maybeSingle();
      const prior = (existing?.recommended_actions as { aggregate?: { perItemFacts: Record<string, number>; sampleSpans: string[] } }[] | null)?.[0]?.aggregate ?? null;
      const agg = mergeNullTierAggregate(prior, itemId, contribution);
      const { itemCount, factCount, description } = summarizeNullTierAggregate(host, agg);
      const row = {
        category: "source_issue", subject_type: "source", subject_ref: host,
        description: description.slice(0, 480),
        recommended_actions: [{
          action: "register_source",
          rationale: `Register ${host} at its canonical institutional tier; ${factCount} FACT span(s) across ${itemCount} item(s) currently wall on fact_below_authority_floor because the host is unregistered.`,
          aggregate: agg, sample_spans: agg.sampleSpans,
        }],
        status: "open", created_by: "null-tier-host",
      };
      if (existing?.id) await sb.from("integrity_flags").update(row).eq("id", existing.id);
      else await sb.from("integrity_flags").insert(row);
    } catch { /* best-effort; the null-tier stamp on the claim is the durable floor */ }
  }
}

// PAGINATED registry read → resolver. The registry EXCEEDS the 1000-row PostgREST cap, so a single
// unpaginated read silently drops sources past row 1000 — a floor source in the dropped page would resolve
// to NULL tier and be mis-seen as sub-floor (mis-ordered by the truncation moat AND missed by the
// floor-first re-attribution). Read ALL pages. Returns null on a page-read error so the caller can decide
// fail-open (synthesis ordering) vs fail-closed (grounding stamp).
async function readAllSourcesForResolver(sb: SupabaseClient): Promise<SourceRow[] | null> {
  const all: SourceRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("sources").select("id, url, base_tier, tier_override").order("id").range(from, from + 999);
    if (error) return null;
    if (!data?.length) break;
    all.push(...(data as SourceRow[]));
    if (data.length < 1000) break;
  }
  return all;
}

// Attach each fetched source's canonical institutional tier (base_tier via buildResolver — the moat
// resolver, base_tier ONLY). Reuses a caller-supplied resolver when given (grounding shares the SAME
// paginated fail-closed resolver it stamps with, so the truncation window, the floor-first re-attribution,
// and the stamp all agree); otherwise builds one from a best-effort paginated read (synthesis path —
// unresolved → tier null degrades ordering, never a false stamp).
async function attachTiers(
  sb: SupabaseClient,
  fetched: { url: string; text: string }[],
  resolver?: Resolver,
): Promise<{ url: string; text: string; tier: number | null }[]> {
  const r = resolver ?? buildResolver((await readAllSourcesForResolver(sb)) ?? []);
  return fetched.map((f) => ({ ...f, tier: r.resolveSpan(f.url).tier }));
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
// TELEMETRY LEDGER (span-attribution unit 4f). Module-scoped token accumulator: every Sonnet call on this
// path (grounding callSonnet + synthesis generateBriefText's streamMessagesText) adds its usage here. The
// stored-path entry points RESET it at start and read it at end (takeUsageLedger) to attach real spend to
// their StepResult, which the runner logs to agent_runs.cost_usd_estimated — no DDL, no more $0 stored path.
// SEQUENTIAL-ONLY: the ledger is per-process; correct for the stored-path runner (one item at a time). The
// route path (generate-brief workflow) writes its own agent_runs row and does NOT call takeUsageLedger, so
// this never double-counts there.
let usageLedger = { inputTokens: 0, outputTokens: 0, calls: 0 };
function addUsage(u: { input_tokens?: number; output_tokens?: number } | undefined): void {
  if (!u) return;
  usageLedger.inputTokens += u.input_tokens || 0;
  usageLedger.outputTokens += u.output_tokens || 0;
  usageLedger.calls += 1;
}
function resetUsageLedger(): void { usageLedger = { inputTokens: 0, outputTokens: 0, calls: 0 }; }
export interface UsageTelemetry { inputTokens: number; outputTokens: number; calls: number; costUsd: number }
function takeUsageLedger(): UsageTelemetry {
  const l = usageLedger;
  return { inputTokens: l.inputTokens, outputTokens: l.outputTokens, calls: l.calls, costUsd: sonnetCostUsd(l.inputTokens, l.outputTokens) };
}
// Reset the ledger, run a stored-path step, attach the step's real usage to its StepResult (every return
// path). The caller sums usage across the steps it invokes to write ONE agent_runs cost row per item.
async function withTelemetry(fn: () => Promise<StepResult>): Promise<StepResult> {
  resetUsageLedger();
  const r = await fn();
  return { ...r, usage: takeUsageLedger() };
}

// TELEMETRY SINK (span-attribution unit 4f): write ONE stored-path agent_runs row per item from the SUMMED
// usage across the steps the runner invoked (generateBriefFromStored + groundBrief, each returns its own
// UsageTelemetry). fetch_method='stored-pool' marks it as the fetch-free path; cost_usd_estimated carries
// the real spend the MTD tile reads (no more $0 stored path). Service-role via svc(). Called ONLY by the
// stored-path runner — the /api/agent/run route writes its own agent_runs row, so this never double-counts.
// Best-effort: a telemetry-write failure must not fail the recovery; it returns ok:false for the caller to log.
export async function logStoredPathRun(
  itemId: string,
  usage: { inputTokens: number; outputTokens: number; calls: number; costUsd: number },
  status: "success" | "error",
  sourceUrl?: string | null,
): Promise<{ ok: boolean; detail: string }> {
  const sb = svc();
  try {
    const nowIso = new Date().toISOString();
    const { error } = await sb.from("agent_runs").insert({
      intelligence_item_id: itemId, source_url: sourceUrl ?? null, fetch_method: "stored-pool",
      started_at: nowIso, ended_at: nowIso, status,
      cost_usd_estimated: Number(usage.costUsd.toFixed(6)),
      errors: [{ telemetry: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, sonnet_calls: usage.calls } }],
    });
    if (error) return { ok: false, detail: `agent_runs insert failed: ${error.message}` };
    return { ok: true, detail: `logged $${usage.costUsd.toFixed(4)} (${usage.inputTokens}in/${usage.outputTokens}out, ${usage.calls} calls)` };
  } catch (e) { return { ok: false, detail: `agent_runs insert threw: ${(e as Error).message}` }; }
}

async function callSonnet(system: string, user: string): Promise<string> {
  // max_tokens 32000 (was 24000): the largest regs (CSRD, EU-ETS-maritime-class) overran 24000 — the
  // trailing Claim Provenance Ledger + YAML (and thus the 18-field metadata) are the FIRST casualties of
  // truncation, so a too-tight cap surfaced as an obscure "YAML frontmatter not found" parse failure that
  // quarantined the item. The cap is a CEILING not a target (the model stops at end_turn when done), so
  // normal-size briefs are unaffected; only the genuinely huge regs use the headroom.
  // STREAMING (not a buffered POST): a non-streaming large completion HANGS on some network paths — the
  // socket idles for the full multi-minute generation and never resolves (proven 2026-06-19; the identical
  // stream:true call completed). Streaming keeps the socket alive (so the larger cap is viable), bounds on
  // NO-PROGRESS, and preserves anthropicError classification end-to-end (out-of-credits HALT unchanged).
  const { text, stopReason, usage } = await streamMessagesText({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    body: { model: "claude-sonnet-4-6", max_tokens: 32000, system, messages: [{ role: "user", content: user }] },
  });
  addUsage(usage);
  // DETERMINISTIC truncation signal (content-class, fatal=false → per-item failure, not a batch halt). This
  // path is now the GROUNDING ledger-extraction call only (generation uses generateBriefText's 2-pass); a
  // truncated ledger means too many claims for one call — a per-item failure, not an obscure parse crash.
  if (stopReason === "max_tokens") {
    const e = new Error("ANTHROPIC output truncated at max_tokens (32000).") as Error & { fatal?: boolean };
    e.fatal = false;
    throw e;
  }
  return text;
}

/** Reactive 2-pass brief generation — orchestration in two-pass-generate.mjs (unit-tested via DI). Binds
 *  the real deps (streaming + YAML-locate). DEFAULT one call (body + New Sources + YAML, NO ledger); splits
 *  to body-then-YAML ONLY on stop_reason truncation, so the body comes out whole and normal briefs stay 1
 *  call. */
async function generateBriefText(system: string, user: string): Promise<string> {
  // Meter every stream call twoPassGenerate makes (1 normal, 2 on truncation split) into the usage ledger.
  const meteredStream: typeof streamMessagesText = async (opts) => {
    const r = await streamMessagesText(opts);
    addUsage(r.usage);
    return r;
  };
  return twoPassGenerate({ system, user, stream: meteredStream, findYaml: findYamlBlock, apiKey: process.env.ANTHROPIC_API_KEY! });
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

// PRIMARY fetcher (injected into fetchPrimaryWithFallback). Delegates to the ONE transport primitive
// (direct-eligible-first -> Browserless -> try-both plain fallback). KEEPS a still-blocked result (does NOT
// drop) so fetchPrimaryWithFallback's detectRoadblock sees the reason (cdn_block / soft_404 / ...) and runs
// the official-alternative web search. Reports truncation up via the FetchResult.
const blFetchClean = async (url: string): Promise<FetchResult> => fetchWithTransport(url, PRIMARY_MAX_CHARS);

/** Canonical primary fetch with the roadblock→bounded-alternative-search capability bound to the real
 *  deps (Browserless + official-alternative web_search). BOTH generateBrief and phase2-reground call this
 *  so they inherit the fallback uniformly. Returns usable content + the full audit trail (discovery only —
 *  tier/floor qualification is unchanged downstream). */
export async function fetchPrimaryDeep(item: { title: string; primaryUrl: string; itemType: string }) {
  return fetchPrimaryWithFallback(item, { browserlessFetch: blFetchClean, webSearchAlternatives, perFetchMs: 20000, maxAlts: 3 });
}

// item 5b (unreadable-source flag): map the transport's primary-fetch outcome to a sources.fetch_status
// value. A blocked primary (fell back to an alternative because the declared source was a cdn_block /
// soft_404 / challenge) marks the SOURCE unreadable so customer surfaces can gate its link; a readable
// primary marks it 'ok' (clearing a stale block). Ambiguous → leave unchanged.
function fetchStatusFromPf(pf: { fellBack?: boolean; primaryReason?: string | null; text?: string }): string | null {
  const reason = pf.primaryReason || null;
  if (pf.fellBack && reason) {
    if (reason === "cdn_block") return "cdn_block";
    if (reason === "soft_404") return "soft_404";
    return "blocked"; // challenge_stub / empty_stub / access-denied / etc.
  }
  if (!pf.fellBack && typeof pf.text === "string" && pf.text.length > 200) return "ok";
  return null;
}

// Write the source-level fetch outcome. Guarded + non-fatal, and BEHIND migration 147: until the
// fetch_status column exists the update errors and is swallowed (zero behaviour change pre-apply).
async function recordSourceFetchStatus(
  sb: SupabaseClient,
  sourceId: string | null | undefined,
  pf: { fellBack?: boolean; primaryReason?: string | null; text?: string }
): Promise<void> {
  if (!sourceId) return;
  const status = fetchStatusFromPf(pf);
  if (!status) return;
  await sb
    .from("sources")
    .update({ fetch_status: status, fetch_status_at: new Date().toISOString() })
    .eq("id", sourceId)
    .then(() => {}, () => {});
}

export interface StepResult { ok: boolean; detail: string; usage?: UsageTelemetry }

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
  // Part C: build synthesis blocks TIER-ORDERED under the input budget — the floor-qualifying source(s)
  // for this item_type reach the model in FULL (the moat), corroborators share the remainder lowest-tier-
  // first, and every trim/ceiling-wall is ANNOUNCED (no silent truncation). The SAME builder + tiers + budget
  // grounding uses → spans stay matchable.
  const withTier = await attachTiers(sb, fetched);
  const { blocks, trims, ceilingWalls } = buildSourceBlocks(withTier, SYNTH_INPUT_BUDGET_CHARS, {
    floorTier: authorityFloorFor(it.item_type),
    hardCeiling: SYNTH_PRIMARY_HARD_CEILING_CHARS,
  });
  await recordTruncation(sb, it.id, [...trims, ...ceilingWalls]);
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
  // Part D — coverage-forcing for the REGULATORY format only (qualification capture / per-year trajectory /
  // defined terms verbatim / legal line). Mirrors the env-policy SKILL.md + system-prompt contract; lands in
  // the same change as those (doctrine-with-mechanism). The pipeline now feeds the FULL enacted text, so the
  // instruction to READ ALL OF IT and capture qualifications is enforceable, not aspirational.
  const regCoverage = fmtSpec?.formatType === "regulatory_fact_document"
    ? `\nREGULATORY COMPLETENESS — you have the FULL enacted text below; READ ALL OF IT, not the opening. For EVERY requirement you state, capture its QUALIFICATIONS, not just the headline number/date:
- Exceptions / carve-outs / exemptions ("except …", "shall not apply to …") — each a verbatim FACT span.
- The CALCULATION BASIS and conditions (e.g. "calculated as an average per manufacturing plant and year" — a per-plant-per-year basis is NOT per-unit; state it as written).
- The DEFINED TERMS the requirement turns on — quote the regulation's OWN definitions article verbatim; never swap in a loose synonym.
- The PER-YEAR TRAJECTORY — when a threshold changes by date, state the WHOLE time series (e.g. a 2030 floor → a 2035 added requirement → a 2038 restriction/ban), not just the entry-year value; a date-conditioned trigger ("or N years from the implementing act, whichever is later") is part of the requirement.
A requirement stated with ZERO qualifications is a FLAG that you have not read far enough — return to the source text before asserting it.
LEGAL LINE — state what the text REQUIRES and whom it falls on AS DEFINED. Do NOT assert that the workspace (or any entity) IS a producer / importer / distributor / manufacturer, or that an obligation attaches: matching an entity to a defined role is a legal determination → route it to a "*Legal Confirmation Required:*" callout.`
    : "";
  const user = `Generate the ${it.item_type} brief for: "${it.title}".${formatDirective}${regCoverage}
Synthesise ACROSS ALL the source blocks below — do NOT rely on the primary source alone; the corroborating sources carry detail (participants, phase, timing, operational specifics) the primary may lack.
Apply the Forward-Intelligence Rule: for in-progress work surface design, participants/parties, current phase/status, and expected timing as first-class (these ARE the finding); a stated schedule is a FACT (cite it), otherwise emit a labeled "Analytical inference:" estimate; set severity MONITORING with a re-check window when the outcome is still pending.
Apply the No-Vacuum Rule: where the topic connects to a specific regulation, market signal, or operational decision, name and link it — that connection is direction, not decoration.
Ground every FACT claim's source_span as a VERBATIM substring of one of the SOURCE blocks below; set source_url to THAT block's url. HARD RULE: a FACT claim's source_url MUST be one of the SOURCE block urls actually provided below — never a URL you only saw while searching. A source you know of but that is NOT among the blocks below may be listed under "## New Sources Identified" as a lead for later retrieval, but MUST NOT be used as a FACT source_url or source_span; carry its content as a labeled "Analytical inference:" or omit it. Item source_id for the primary FACT source_id: ${it.source_id}.${discoveredHint}
VALIDATION DISCIPLINE — the brief is auto-validated and REJECTED (rolled back to quarantine) if violated. Before you finish, RE-READ the WHOLE brief and fix every instance — these two are the dominant rejection causes on long briefs:
- LABELING / binding verbs: every analytical, interpretive or forward-looking sentence MUST start with "Analytical inference:", "Industry interpretation:", or "Operational implication:". In particular ANY sentence using a binding-obligation verb (must, requires, mandates, obligates, prohibits, "applies to", shall) MUST EITHER (a) be a VERBATIM quote from a SOURCE block (so it grounds as a FACT) OR (b) begin with one of those labels. No unlabeled, unsourced "X must/requires Y" is allowed ANYWHERE — sweep every section, not just the first; this is the single most common long-brief rejection.
- URL discipline: every URL anywhere in the brief body MUST be EITHER (a) copied exactly from a SOURCE block url, OR (b) listed in your "## New Sources Identified" table. A URL that appears in prose but is in NEITHER place WILL REJECT the brief — grounding only recognises SOURCE-block urls and New-Sources-table urls. To reference a source you did not fetch, put it in the New Sources table; never drop a bare/known URL into prose, never invent a path, no markdown emphasis around URLs.
Follow your output contract exactly: brief body, then a "## New Sources Identified" table of the corroborating sources you used (if any), then the YAML frontmatter as the FINAL block. Do NOT emit a Claim Provenance Ledger — provenance is carried inline in the prose (labels + GAP statements); grounding extracts it downstream.

SOURCE CONTENT (copy FACT spans verbatim from here — ${fetched.length} sources):
${blocks}`;
  const parsed = parseAgentOutput(await generateBriefText(SYSTEM_PROMPT, user));
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
  const { data: it, error: itErr } = await sb.from("intelligence_items").select("id, title, item_type, source_id, source_url").eq("id", itemId).single();
  if (itErr || !it) return { ok: false, detail: `item not found${itErr ? `: ${itErr.message}` : ""}` };

  // 1. primary source — with the roadblock→bounded-alternative-search capability: a hanging / blocked /
  //    wrong-language declared primary is replaced by an OFFICIAL alternative (discovery only — the
  //    resolver + per-type floor still qualify whatever it returns). A thin REAL primary is kept as-is;
  //    discovery below carries the weight. Fetched ONCE here (never re-fetched in the pool below).
  const pf = await fetchPrimaryDeep({ title: it.title, primaryUrl: it.source_url, itemType: it.item_type });
  await recordSourceFetchStatus(sb, it.source_id, pf); // item 5b: source-level unreadable flag (guarded, behind mig 147)
  const primaryUrl = pf.url, primary = pf.text;
  // NO SILENT TRUNCATION: collect a truncation event if the primary (or, below, any corroborator) hit its cap.
  const truncEvents: TruncEvent[] = [];
  if (pf.truncated) truncEvents.push({ url: primaryUrl, collected: primary.length, fullLength: pf.fullLength ?? primary.length, cap: pf.cap ?? PRIMARY_MAX_CHARS, transport: "primary" });
  // 2. DEEP DIVE: discover corroborating/expanding sources via web_search
  const corroborators = await discoverCorroborators(it.title, primaryUrl, primary);
  // 3. multi-source fetch (the discovered corroborators), then prepend the already-fetched primary
  const poolUrls = ([...new Set(corroborators.map((c) => c.url).filter(Boolean))] as string[]).filter((u) => u !== primaryUrl);
  const fetchedCorrMeta = await mapLimit(poolUrls, FETCH_CONCURRENCY, async (u) => ({ url: u, ...(await fetchMeta(u, CORROBORATOR_MAX_CHARS)) }));
  for (const m of fetchedCorrMeta) if (m.truncated) truncEvents.push({ url: m.url, collected: m.text.length, fullLength: m.fullLength, cap: m.cap, transport: m.transport });
  const fetchedCorr = fetchedCorrMeta.filter((b) => b.text.length > 200).map((b) => ({ url: b.url, text: b.text }));
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
  // NO SILENT TRUNCATION: announce any source the FETCH could not fully collect, now that the pool (and its
  // stored excerpts) is durable — the operator sees the partial collect on the item via integrity_flags.
  await recordTruncation(sb, itemId, truncEvents);

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
  return withTelemetry(() => generateBriefFromStoredImpl(itemId));
}
async function generateBriefFromStoredImpl(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it, error: itErr } = await sb.from("intelligence_items").select("id, title, item_type, source_id, source_url").eq("id", itemId).single();
  if (itErr || !it) return { ok: false, detail: `item not found${itErr ? `: ${itErr.message}` : ""}` };
  const { data: pool, error: poolErr } = await sb.from("agent_run_searches").select("result_url, result_title, result_content_excerpt, search_query, searched_at, result_index").eq("intelligence_item_id", itemId).order("result_index");
  if (poolErr) console.warn(`[canonical] stored-pool read failed for ${itemId}: ${poolErr.message}`);
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

/** REFRESH-PRIMARY-INTO-POOL — re-fetch ONLY the full enacted text (the #155 direct-HTTP transport, FREE
 *  for legal hosts), replace the truncated primary row in the pool, REUSE the existing pool corroborators
 *  (NO web_search — corroborators were never the gap), then re-synthesise. This is the cheap correct fix
 *  for the STALE-TRUNCATED-POOL class: items fetched before the #155 truncation fix (2026-06-23) carry a
 *  primary truncated at ~30k, so the back of the law (penalties, annexes, per-year trajectory) is NOT in
 *  the pool — and `generateBriefFromStored` can only re-ground what the pool holds, so required-slot facts
 *  ground to commentary. This refreshes the primary to full text WITHOUT re-running discoverCorroborators
 *  (the web_search demoted across this work). = generateBrief minus discovery. */
export async function generateBriefRefreshPrimary(itemId: string): Promise<StepResult> {
  return withTelemetry(() => generateBriefRefreshPrimaryImpl(itemId));
}
async function generateBriefRefreshPrimaryImpl(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it, error: itErr } = await sb.from("intelligence_items").select("id, title, item_type, source_id, source_url").eq("id", itemId).single();
  if (itErr || !it) return { ok: false, detail: `item not found${itErr ? `: ${itErr.message}` : ""}` };
  // 1. full primary via the #155 direct-first transport (free for eligible legal hosts; no truncation).
  const pf = await fetchPrimaryDeep({ title: it.title, primaryUrl: it.source_url, itemType: it.item_type });
  await recordSourceFetchStatus(sb, it.source_id, pf); // item 5b: source-level unreadable flag (guarded, behind mig 147)
  const primaryUrl = pf.url, primary = pf.text;
  if (primary.length < 200) return { ok: false, detail: `refresh-primary: primary too thin (${primary.length}ch${pf.fellBack ? ` via fallback after ${pf.primaryReason}` : ""})` };
  const truncEvents: TruncEvent[] = [];
  if (pf.truncated) truncEvents.push({ url: primaryUrl, collected: primary.length, fullLength: pf.fullLength ?? primary.length, cap: pf.cap ?? PRIMARY_MAX_CHARS, transport: "primary" });
  // 2. REUSE existing pool corroborators (NO web_search) — content rows >200ch (excluding the primary).
  const { data: priorPool, error: priorPoolErr } = await sb.from("agent_run_searches").select("result_url, result_title, result_content_excerpt").eq("intelligence_item_id", itemId);
  if (priorPoolErr) console.warn(`[canonical] refresh-primary prior-pool read failed for ${itemId}: ${priorPoolErr.message}`);
  const priorCorr = (priorPool ?? []).filter((r) => typeof r.result_url === "string" && r.result_url !== primaryUrl && (r.result_content_excerpt ?? "").length > 200);
  const fetchedCorr = priorCorr.map((r) => ({ url: r.result_url as string, text: r.result_content_excerpt as string }));
  const fetched = [{ url: primaryUrl, text: primary }, ...fetchedCorr];
  const corroborators: Corroborator[] = (priorPool ?? [])
    .filter((r) => typeof r.result_url === "string" && r.result_url !== primaryUrl)
    .map((r) => ({ name: (typeof r.result_title === "string" ? r.result_title : "discovered reference"), url: r.result_url as string, why: "" }));
  // 3. re-persist the pool (full primary + reused corroborators) — mirror generateBrief GUARD 1 (delete +
  //    one batched insert; replaces the prior truncated pool). Discovered-ref stubs preserved for URL grounding.
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
      result_content_excerpt: (c.name || "discovered reference").slice(0, 180), searched_at: ts,
    }));
  await sb.from("agent_run_searches").delete().eq("intelligence_item_id", itemId);
  const { error: poolErr } = await sb.from("agent_run_searches").insert([...poolRows, ...refRows]);
  if (poolErr) return { ok: false, detail: `refresh-primary pool persist failed: ${poolErr.message}` };
  await recordTruncation(sb, itemId, truncEvents);
  // 4. synthesise across the refreshed pool (full primary anchors; corroborators carry context). NO web_search.
  const r = await synthesiseAndWriteBrief(sb, it, fetched, corroborators);
  if (!r.ok) return r;
  return { ok: true, detail: `${r.detail} (REFRESH-PRIMARY: full re-fetch ${primary.length}ch${pf.truncated ? " [still truncated!]" : ""}, ${fetchedCorr.length} pool corroborators reused, 0 web_search)` };
}

/** STEP section: format-selected extractor (via the registry) -> upsert intelligence_item_sections.
 *  Dispatches by item_type through specForItemType — ONE path for every surface (regulation, research,
 *  market, technology, operations). Surfaces that render structured components re-parse content_md at
 *  render time; the rows stored here are format-generic. */
export async function sectionBrief(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it, error: itErr } = await sb.from("intelligence_items").select("item_type, full_brief, provenance_status").eq("id", itemId).single();
  if (itErr || !it?.full_brief) return { ok: false, detail: `no full_brief${itErr ? `: ${itErr.message}` : ""}` };
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
    // URL-NORMALIZATION write-site fix (ruling 2026-07-04): synthesis wraps some URLs in markdown emphasis
    // (*https://…*), which the section extraction carries verbatim into content_md. validate_item_provenance
    // criterion-2 does an EXACT-string compare, so a trailing `*` reads as an ungrounded_url even against an
    // active registered source — AND the trailing `*` breaks the link a customer clicks. Strip the markers at
    // the write site (same stripUrlMarkers used for the claim ledger) so new sections carry clean URLs.
    await sb.from("intelligence_item_sections").insert(
      { item_id: itemId, section_key: s.section_key, section_order: s.section_order, content_md: stripUrlMarkers(s.content_md) ?? s.content_md, is_conditional: s.is_conditional }
    );
  }
  return { ok: true, detail: `${rows.length} sections` };
}

/** STEP ground: claim-ledger + verbatim span-check + validate_item_provenance; keep claims only if
 *  valid (else delete them — manual rollback). The set_provenance_status trigger flips on the writes. */
export async function groundBrief(itemId: string): Promise<StepResult> {
  return withTelemetry(() => groundBriefImpl(itemId));
}
async function groundBriefImpl(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it, error: itErr } = await sb.from("intelligence_items").select("id, item_type, source_id, source_url, full_brief").eq("id", itemId).single();
  if (itErr || !it?.source_id) return { ok: false, detail: `no source_id${itErr ? `: ${itErr.message}` : ""}` };
  // Idempotency scoped to VERIFIED (not "any claims exist"). A quarantined/ungrounded item is
  // re-groundable — the prior guard ("any claims -> already grounded") silently blocked re-grounding a
  // quarantined item against a new/expanded section set (e.g. after a section backfill) if a partial run
  // had left claims. Skip only verified; for everything else clear stray claims so the re-ground starts
  // clean (no duplicate rows), then proceed.
  const { data: prov, error: provErr } = await sb.from("intelligence_items").select("provenance_status").eq("id", itemId).single();
  if (provErr) console.warn(`[canonical] ground provenance-status read failed for ${itemId}: ${provErr.message}`);
  if (prov?.provenance_status === "verified") return { ok: true, detail: "already verified" };
  await sb.from("section_claim_provenance").delete().eq("intelligence_item_id", itemId);
  const { data: secs, error: secsErr } = await sb.from("intelligence_item_sections").select("id, section_key, content_md").eq("item_id", itemId).order("section_order");
  if (secsErr || !secs?.length) return { ok: false, detail: `no sections${secsErr ? `: ${secsErr.message}` : ""}` };
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
  // CITED-URL completeness (criterion 2): the model cites real sources it found INLINE in the prose
  // without always ALSO listing them in the New Sources table — an unlisted cited URL failed criterion 2
  // and ERASED the whole brief over a single trade-press citation (the EU-ETS-maritime safety4sea.com
  // case, 2026-06-21). Record EVERY URL the brief sections cite (the exact set criterion 2 scans) as a
  // cited-URL search so the gate accepts it, with an EMPTY excerpt so the >200ch FACT-span corpus EXCLUDES
  // it — a cited URL can NEVER ground a FACT (criterion 3 still requires a verbatim span in real FETCHED
  // content). Consistent with how the New-Sources flow above already trusts model-cited URLs; integrity
  // stays with criterion 3, not URL hygiene. These surface for source-registry review via grow/audits.
  try {
    const citedUrls = new Set<string>();
    for (const s of secs) for (const m of (s.content_md || "").matchAll(/https?:\/\/[^\s)\]}"'<>]+/g)) citedUrls.add(m[0].replace(/[.,;:]+$/, ""));
    for (const u of citedUrls) {
      const { data: ex } = await sb.from("agent_run_searches").select("id").eq("intelligence_item_id", itemId).eq("result_url", u).limit(1);
      if (!ex?.length) await sb.from("agent_run_searches").insert({ intelligence_item_id: itemId, search_query: "canonical:cited-url", result_url: u, result_title: "cited in brief", result_index: 91, result_content_excerpt: "", searched_at: new Date().toISOString() });
    }
  } catch { /* non-fatal */ }
  const { data: slots } = await sb.from("item_type_required_slots").select("slot_key, description").eq("item_type", it.item_type);
  const sectionMap = Object.fromEntries(secs.map((s) => [String(s.section_key), s.id]));
  // Grounding corpus = the pool generate already fetched + stored (the SAME content the brief was
  // synthesised from), so a source that is unfetchable on re-check (PDF/Cloudflare) does not break
  // grounding. Fall back to fetching the section/source URLs only when no stored pool exists.
  const { data: pool, error: poolErr } = await sb.from("agent_run_searches").select("id, result_url, result_content_excerpt, result_index").eq("intelligence_item_id", itemId).order("result_index");
  if (poolErr) console.warn(`[canonical] ground pool read failed for ${itemId}; falling back to section/source URL fetch: ${poolErr.message}`);
  let fetched: Array<{ url: string; text: string }>;
  let searchRows: Array<{ id: string; result_url: string }>;
  const searchIds: string[] = [];
  let ownSearches = false;
  if (pool && pool.length) {
    fetched = pool.map((r) => ({ url: r.result_url as string, text: (r.result_content_excerpt as string) || "" })).filter((b) => b.text.length > 200);
    searchRows = pool.map((r) => ({ id: r.id as string, result_url: r.result_url as string }));
  } else {
    const groundUrls = [...new Set([it.source_url, ...secs.flatMap((s) => urlsIn(s.content_md || ""))].filter(Boolean))] as string[];
    fetched = (await mapLimit(groundUrls, FETCH_CONCURRENCY, async (u) => ({ url: u, text: await fetchText(u, CORROBORATOR_MAX_CHARS) }))).filter((b) => b.text.length > 200);
    searchRows = [];
    ownSearches = true;
    for (let i = 0; i < fetched.length; i++) {
      const { data: r, error: rErr } = await sb.from("agent_run_searches").insert({ intelligence_item_id: itemId, search_query: "canonical ground", result_url: fetched[i].url, result_title: "source", result_index: i, result_content_excerpt: fetched[i].text, searched_at: new Date().toISOString() }).select("id, result_url").single();
      if (rErr) console.warn(`[canonical] ground fallback search insert failed for ${itemId} (${fetched[i].url}): ${rErr.message}`);
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
- FACT SOURCE PREFERENCE: when the SAME binding requirement appears in MORE THAN ONE SOURCE block, copy the span from the block that is the PRIMARY ENACTED TEXT / highest-authority source (the official law or regulator), NOT from a commentary/analysis/news block that merely echoes it. Grounding the fact at the primary is the goal; a corroborator echo is a fallback only.
- WRONG-LANGUAGE PRIMARY (4d): if the brief states a binding FACT in English but the ONLY primary/enacted SOURCE block carrying it is in another language (e.g. a national law in its original language), copy source_span VERBATIM in the ORIGINAL LANGUAGE from that primary block and set source_url to it. The original-language span is the checkable provenance; the surface labels it "translated from [language] original". Do NOT invent an English span that is not present in any source, and do NOT downgrade the fact to a lower-tier English commentary source when the primary carries it in its own language.
- ANALYSIS: a statement the brief text EXPLICITLY labels with "Analytical inference:", "Industry interpretation:", "Operational implication:" or "Per the workspace's reading:". Set claim_text to that labeled sentence (so it appears verbatim in the section). TWO kinds: (a) GROUNDED ANALYSIS — a credible-but-NOT-binding or forthcoming claim that cites a non-primary source (an intergovernmental / research / analysis body or factual news, NOT the binding legal text): set source_span to its VERBATIM supporting span and source_url to that source, EXACTLY like a FACT, so it carries that source's provenance and tier; (b) PURE INFERENCE — the workspace's own reasoning across the brief's facts, citing no single source: leave source_span and source_url null. A sourced-but-NON-BINDING claim is GROUNDED ANALYSIS, NOT FACT — do not force sourced content to FACT. A present-tense BINDING regulatory requirement (the enacted law "requires/must/mandates/prohibits/applies to") is FACT (primary span) or a LEGAL callout, NEVER ANALYSIS.
- Cover EACH required slot with >=1 FACT or GAP claim (set slot_key):\n${(slots ?? []).map((s) => `- ${s.slot_key}: ${s.description}`).join("\n")}
- For EVERY section (${secs.map((s) => s.section_key).join(", ")}) with must/requires/shall/applies/mandates/prohibits/obligates, emit >=1 FACT claim with "section" set + a verbatim span.
- No verbatim span for a slot -> claim_kind "GAP", source_span null. Never invent spans. CLOSE with CLAIM_PROVENANCE_LEDGER>>>.`;
  // CANONICAL RESOLVER (built ONCE, PAGINATED, FAIL-CLOSED — the registry exceeds the 1000-row PostgREST
  // cap). Shared by: the truncation window (groundWithTier tiers), the floor-first re-attribution, and the
  // FACT stamp — so all three agree on every source's tier. A page-read error ABORTS grounding (ok:false is
  // retryable) rather than building an INCOMPLETE resolver that mis-stamps hosts in the dropped page.
  // A1 MOAT (2026-06-28): effective_tier is NOT selected — the stamp is base_tier/tier_override ONLY
  // (institution.ts tierOfSource); not fetching effective_tier keeps reputation out of arm's reach of the
  // stamp (a reintroduced `?? effective_tier` fallback stays inert; guarded by fitness F12 / invariant SC-9).
  const allSources = await readAllSourcesForResolver(sb);
  if (allSources == null) return { ok: false, detail: "grounding aborted: sources registry page read failed; resolver would be incomplete -> spurious NULL-stamps" };
  const resolver = buildResolver(allSources);
  const itemFloor = authorityFloorFor(it.item_type);
  // Part C / R2: show the grounding extractor the FULL source window (SAME budget builder as synthesis, so a
  // span written from the primary in synthesis is present here too — the atomic span-grounding coupling), and
  // raise the per-section cap so spans match from the back of a long section. Trims announced (no silent cap).
  const groundWithTier = await attachTiers(sb, fetched, resolver);
  // Floor-first re-attribution pool: the fetched floor-qualifying sources, best-tier-first (span-attribution
  // unit, ruling 2026-07-03). A FACT whose extractor-chosen span host is sub-floor but whose verbatim clause
  // ALSO sits in one of these grounds AT the floor instead of walling. Empty for floor-exempt item types.
  const floorPool = floorSources(groundWithTier, itemFloor);
  const groundSrc = buildSourceBlocks(groundWithTier, SYNTH_INPUT_BUDGET_CHARS, {
    floorTier: itemFloor,
    hardCeiling: SYNTH_PRIMARY_HARD_CEILING_CHARS,
  });
  await recordTruncation(sb, itemId, [...groundSrc.trims, ...groundSrc.ceilingWalls]);
  const user = `BRIEF SECTIONS:\n${secs.map((s) => `### SECTION ${s.section_key}\n${(s.content_md || "").slice(0, GROUND_SECTION_MAX_CHARS)}`).join("\n\n")}\n\n====\nSOURCE CONTENT (copy spans VERBATIM):\n${groundSrc.blocks}`;
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
  // SINGLE `resolver` (built above, paginated + fail-closed) — same code the claims-tier audit certifies.
  // source_id = the resolved registered source (NULL when the span host is unregistered); the tier stamp
  // = the resolved canonical institutional tier (NULL when unregistered). Register-before-ground means
  // corroborator hosts are registered by now, so a corroborator-grounded claim resolves instead of
  // NULL-stamping spuriously.
  const urlBySearchId = new Map(searchRows.map((r) => [r.id, r.result_url]));
  // Reverse map for floor-first re-attribution: a floor source's fetched URL -> its pool-row id, so a
  // re-homed FACT re-points search_result_id to the floor source's row (first row wins on dup URLs).
  const searchIdByUrl = new Map<string, string>();
  for (const r of searchRows) if (r.result_url && !searchIdByUrl.has(r.result_url)) searchIdByUrl.set(r.result_url, r.id);
  const claimIds: string[] = [];
  const citedSourceIds = new Set<string>(); // B#2: the sources this brief grounds against (item->source edges)
  // Ruling-5 self-surfacing: FACT spans that resolve to an UNREGISTERED host (null tier) aggregated per host,
  // upserted as ONE integrity_flag/host after the loop (the next lovdata.no is found mechanically, not by hand).
  const nullTierHosts = new Map<string, { factCount: number; samples: string[] }>();
  for (const c2 of linked) {
    const sectionRowId = sectionMap[String(c2.section)] || secs[0].id;
    const storedText = cleanCtl((["FACT", "GAP"].includes(c2.claim_kind) && c2.slot_key) ? `[${c2.slot_key}] ${c2.claim_text}` : c2.claim_text ?? "");
    const isFact = c2.claim_kind === "FACT";
    const spanUrl = c2.search_result_id ? urlBySearchId.get(c2.search_result_id) : undefined;
    // R1 (two-kinds-of-ANALYSIS): resolve + stamp the canonical institutional tier whenever the claim
    // carries a RESOLVABLE SPAN — a FACT (per-span attribution) OR a GROUNDED ANALYSIS (analysis OF a
    // credible non-binding source, e.g. WRI/ICAP/IEA at T3; span + tier so the surface renders the
    // "Credible analysis — [source]" register). PURE-INFERENCE ANALYSIS (the workspace's own reasoning
    // across in-brief facts, no single source) carries no span -> NULL tier -> renders as workspace
    // analysis with no source-tier label. Tier drives the LABEL only; the SECTION is the orthogonal
    // temporal axis (forthcoming -> forward section), enforced by the contract, NOT here (R2).
    let res = spanUrl ? resolver.resolveSpan(spanUrl) : { tier: null, sourceId: null };
    let effectiveSpanUrl = spanUrl;
    let effectiveSearchResultId: string | null = c2.search_result_id || null;
    // 4b FLOOR-FIRST RE-ATTRIBUTION (span-attribution unit, ruling 2026-07-03). A FACT whose
    // extractor-chosen source is sub-floor (or unregistered) but whose VERBATIM span ALSO sits in a
    // floor-qualifying source grounds AT the floor instead of walling on fact_below_authority_floor. The
    // span is re-homed to that floor source (source_id, tier stamp, and search_result_id all re-point).
    // NEVER FORCED (4c): reattributeToFloor fires ONLY on genuine verbatim presence — a span absent from
    // every floor source keeps its honest attribution (walls / relabels), never a fabricated floor stamp.
    // No-op for floor-exempt item types (floorPool empty) and for spans already at/above the floor.
    if (isFact) {
      const home = reattributeToFloor(c2.source_span, res.tier, floorPool, itemFloor);
      if (home) {
        effectiveSpanUrl = home.url;
        res = resolver.resolveSpan(home.url);
        const reSid = searchIdByUrl.get(home.url);
        if (reSid) effectiveSearchResultId = reSid;
      }
    }
    // FACT path (res.sourceId, NULL when unregistered/no-span). Grounded ANALYSIS attributes per-span like
    // FACT; pure-inference / GAP keep the ledger source_id (or item primary).
    const sourceId = isFact ? res.sourceId : (spanUrl ? (res.sourceId ?? c2.source_id ?? it.source_id) : (c2.source_id || it.source_id));
    // Ruling-5: a FACT that STILL resolves to a null tier (host not in the registry even after floor-first
    // re-attribution) is exactly the "unregistered authoritative host" signal — aggregate it per host.
    if (isFact && res.tier == null && effectiveSpanUrl) {
      const host = hostOf(effectiveSpanUrl);
      if (host) {
        const agg = nullTierHosts.get(host) ?? { factCount: 0, samples: [] };
        agg.factCount += 1;
        if (agg.samples.length < 3 && c2.source_span) agg.samples.push(String(c2.source_span).slice(0, 160));
        nullTierHosts.set(host, agg);
      }
    }
    // Phase 4.1 (SC-7 + the "label = render-derived, no stored field" principle): ONLY a FACT carries a
    // stored grounding-tier stamp (= the render-derived resolver.resolveSpan tier the claims-tier audit
    // compares stored-against). A non-FACT (grounded ANALYSIS / GAP) stores NULL — its tier LABEL is
    // render-derived at display from source_id, never a stored field. edit-1 wrongly stamped res.tier on
    // non-FACT here (the 41-row claims-tier drift, all ANALYSIS); `isFact ? res.tier : null` cures it.
    const { data: ins, error: insErr } = await sb.from("section_claim_provenance").insert({ section_row_id: sectionRowId, intelligence_item_id: itemId, claim_text: storedText, claim_kind: c2.claim_kind, source_span: cleanCtl(c2.source_span ?? null), source_id: sourceId, search_result_id: effectiveSearchResultId, source_tier_at_grounding: isFact ? res.tier : null }).select("id").single();
    if (insErr) console.warn(`[canonical] claim insert failed for ${itemId} (${c2.claim_kind}/${String(c2.section)}): ${insErr.message}`);
    if (ins) claimIds.push(ins.id);
    if (sourceId) citedSourceIds.add(sourceId);
  }
  // B#2 (Phase 1): write the item->source citation edges this brief grounds against into
  // intelligence_item_citations (origin='agent_extraction') — the table get_source_citation_stats (mig 098)
  // READS but generation never WROTE, so per-source citation counts were frozen at the mig-089 backfill.
  // Idempotent (UNIQUE(item,source,origin) -> ignore duplicates on re-ground). Best-effort: an edge-write
  // failure must NOT fail grounding (claims + validate are the integrity path; this is a credibility signal).
  if (citedSourceIds.size) {
    const iicTs = new Date().toISOString();
    const edges = [...citedSourceIds].map((sid) => ({ intelligence_item_id: itemId, source_id: sid, detected_at: iicTs, origin: "agent_extraction" as const }));
    const { error: iicErr } = await sb.from("intelligence_item_citations").upsert(edges, { onConflict: "intelligence_item_id,source_id,origin", ignoreDuplicates: true });
    if (iicErr) console.warn(`[canonical] intelligence_item_citations write failed for ${itemId} (${edges.length} edges): ${iicErr.message}`);
  }
  if (nullTierHosts.size) await surfaceNullTierHosts(sb, itemId, nullTierHosts);
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
  // Lead with the DISTINCT failure reasons (not the URL/claim payload), so the workflow's reason-aware
  // retry can reliably detect a deterministic content class even after truncation (the earlier 140-char
  // slice put "url" before "reason" and cut "ungrounded_url" off — the reground-skip never fired).
  const fails = Array.isArray(vr?.failures) ? (vr!.failures as Array<{ reason?: string }>) : [];
  const reasons = [...new Set(fails.map((f) => f?.reason).filter(Boolean))];
  const why = vrErr ? `rpc error: ${vrErr.message}` : `validation failed [${reasons.join(",")}]: ${JSON.stringify(vr?.failures ?? "no result").slice(0, 120)}`;
  return { ok: false, detail: why.slice(0, 220) };
}

/** STEP register (canonical order: generate -> REGISTER -> section -> ground -> credit). Registers the
 *  brief's "New Sources Identified" corroborators into the sources registry BEFORE grounding, so a
 *  corroborator-grounded FACT claim's host is registered at stamp time and resolves to a real
 *  institutional tier instead of NULL-stamping spuriously (the F1 register-before-ground ordering).
 *  BEST-EFFORT + IDEMPOTENT (registerCitedSources host-dedups; a failure must NOT abort generation) and
 *  NO crediting here — recordCitations + compoundSourceCredibility stay in growSources (no double-credit). */
export async function registerBriefSources(itemId: string): Promise<StepResult> {
  const sb = svc();
  const parts: string[] = [];
  // (1) ALWAYS register the GROUNDING-POOL corroborator hosts so a FACT span stamped against a pool
  //     corroborator resolves to a real tier the floor can EVALUATE — not NULL (which escapes the floor
  //     entirely, the sub-floor-masking defect). Independent of the brief's New-Sources table, which is
  //     why it runs even when that table is empty. Best-effort: a failure must NOT abort generation.
  try {
    const ph = await registerPoolHostsForGrounding(sb, itemId);
    parts.push(`pool-hosts +${ph.registered}/${ph.institutions} new`);
  } catch (e) { parts.push(`pool-hosts skipped: ${(e as Error).message.slice(0, 50)}`); }
  // (2) Register the brief-CITED corroborators (New-Sources table) for citation/credibility growth.
  try {
    const { data: it, error: itErr } = await sb.from("intelligence_items").select("full_brief").eq("id", itemId).single();
    if (itErr) console.warn(`[canonical] registerBriefSources full_brief read failed for ${itemId}: ${itErr.message}`);
    const cited = it?.full_brief ? parseNewSourcesFromBrief(it.full_brief) : [];
    if (cited.length) {
      const reg = await registerCitedSources(sb, cited);
      parts.push(`cited ${reg.filter((r) => r.source_id).length}/${cited.length}`);
    } else parts.push("cited 0");
  } catch (e) { parts.push(`cited skipped: ${(e as Error).message.slice(0, 50)}`); }
  return { ok: true, detail: parts.join("; ") };
}

/** STEP grow: register the brief's surfaced sources, record citations, compound credibility
 *  (the proven growSourcesFromBrief). */
export async function growSources(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it, error: itErr } = await sb.from("intelligence_items").select("source_id, full_brief").eq("id", itemId).single();
  if (itErr || !it?.source_id || !it.full_brief) return { ok: false, detail: `no source_id/full_brief${itErr ? `: ${itErr.message}` : ""}` };
  const res = await growSourcesFromBrief(sb, it.source_id, it.full_brief);
  const rep = res.reputation ? `${res.reputation.before}->${res.reputation.after}${res.reputation.changed ? "*" : ""}` : "n/a";
  return { ok: true, detail: `registered=${res.registered.length} citations+${res.citationsRecorded} trust_citation=${res.compound.after.trust_score_citation.toFixed(2)} reputation=${rep}` };
}
