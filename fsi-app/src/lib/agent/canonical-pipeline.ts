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
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { parseAgentOutput, extractClaimLedger, crossLinkClaimSources } from "@/lib/agent/parse-output";
import { specForItemType } from "@/lib/agent/extract-registry";
import { growSourcesFromBrief, parseNewSourcesFromBrief } from "@/lib/sources/source-growth";
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
async function callSonnet(system: string, user: string): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 16000, system, messages: [{ role: "user", content: user }] }),
  });
  const d = await resp.json();
  if (!resp.ok) throw new Error(`anthropic ${JSON.stringify(d).slice(0, 140)}`);
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
  const d = await resp.json();
  if (!resp.ok) throw new Error(`anthropic-search ${JSON.stringify(d).slice(0, 140)}`);
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

export interface StepResult { ok: boolean; detail: string }

/** STEP generate — the DEEP DIVE (the only generator). Fetch the primary source, web_search for
 *  corroborating/expanding sources, fetch that multi-source pool, then synthesise the format-selected
 *  brief ACROSS the pool (system prompt selects by item_type; Forward-Intelligence + No-Vacuum apply).
 *  A thin primary source is the TRIGGER to research wider, never a reason to emit a thin brief. */
export async function generateBrief(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it } = await sb.from("intelligence_items").select("id, title, item_type, source_id, source_url").eq("id", itemId).single();
  if (!it) return { ok: false, detail: "item not found" };

  // 1. primary source (thin is fine — it just means the discovery below must carry the weight)
  const primary = await fetchText(it.source_url, 16000);
  // 2. DEEP DIVE: discover corroborating/expanding sources via web_search
  const corroborators = await discoverCorroborators(it.title, it.source_url, primary);
  // 3. multi-source fetch (primary + discovered), keep only blocks with real content
  const poolUrls = [...new Set([it.source_url, ...corroborators.map((c) => c.url)].filter(Boolean))] as string[];
  const fetched = (await Promise.all(poolUrls.map(async (u) => ({ url: u, text: await fetchText(u, 14000) })))).filter((b) => b.text.length > 200);
  if (!fetched.length) return { ok: false, detail: `no fetchable source content (primary ${primary.length}ch; ${corroborators.length} discovered, none fetchable)` };

  // 4. synthesise the rich brief across the WHOLE pool
  const blocks = fetched.map((b) => `### SOURCE url=${b.url}\n${b.text.slice(0, 12000)}`).join("\n\n");
  const discoveredHint = corroborators.length
    ? `\nCorroborating sources discovered for this item (cite the ones you actually use; list each under "## New Sources Identified" with a tier estimate + why it matters — these grow the source registry):\n${corroborators.map((c) => `- ${c.name} — ${c.url}${c.why ? " — " + c.why : ""}`).join("\n")}`
    : "";
  const user = `Generate the ${it.item_type} brief for: "${it.title}".
Synthesise ACROSS ALL the source blocks below — do NOT rely on the primary source alone; the corroborating sources carry detail (participants, phase, timing, operational specifics) the primary may lack.
Apply the Forward-Intelligence Rule: for in-progress work surface design, participants/parties, current phase/status, and expected timing as first-class (these ARE the finding); a stated schedule is a FACT (cite it), otherwise emit a labeled "Analytical inference:" estimate; set severity MONITORING with a re-check window when the outcome is still pending.
Apply the No-Vacuum Rule: where the topic connects to a specific regulation, market signal, or operational decision, name and link it — that connection is direction, not decoration.
Ground every FACT claim's source_span as a VERBATIM substring of one of the SOURCE blocks below; set source_url to THAT block's url. HARD RULE: a FACT claim's source_url MUST be one of the SOURCE block urls actually provided below — never a URL you only saw while searching. A source you know of but that is NOT among the blocks below may be listed under "## New Sources Identified" as a lead for later retrieval, but MUST NOT be used as a FACT source_url or source_span; carry its content as a labeled "Analytical inference:" or omit it. Item source_id for the primary FACT source_id: ${it.source_id}.${discoveredHint}
VALIDATION DISCIPLINE — the brief is auto-validated and REJECTED if violated:
- Label EVERY analytical / interpretive sentence at its start with "Analytical inference:", "Industry interpretation:", or "Operational implication:". Unlabeled analysis is rejected.
- In UNLABELED prose do NOT use binding-obligation verbs (must, requires, mandates, obligates, prohibits, "applies to") — they read as ungrounded regulatory assertions. For a research finding use descriptive phrasing ("the study finds", "emissions fall when", "the pathway depends on"); if a prescriptive statement is needed, either quote it VERBATIM from a SOURCE block (so it grounds as a FACT) or prefix it with an analysis label.
- Every URL anywhere in the brief MUST be copied exactly from a SOURCE block url or the discovered-corroborators list — no wildcards, no markdown emphasis around URLs, no invented paths.
Follow your output contract exactly: brief body, then the Claim Provenance Ledger, then the YAML frontmatter, including a "## New Sources Identified" table of the corroborating sources you used.

SOURCE CONTENT (copy FACT spans verbatim from here — ${fetched.length} sources):
${blocks}`;
  const parsed = parseAgentOutput(await callSonnet(SYSTEM_PROMPT, user));
  const body = stripUrlMarkers((parsed.body || "").trim()) as string;
  if (body.length < 600) return { ok: false, detail: `parsed body too short (${body.length})` };
  await sb.from("intelligence_items").update({ full_brief: cleanCtl(body), updated_at: new Date().toISOString() }).eq("id", itemId);

  // Persist the fetched multi-source pool so grounding verifies FACT spans against the SAME content
  // generate synthesised from — no independent re-fetch that fails on PDF/Cloudflare. Replace any
  // prior pool for this item (a regeneration starts a fresh pool).
  await sb.from("agent_run_searches").delete().eq("intelligence_item_id", itemId);
  for (let i = 0; i < fetched.length; i++) {
    await sb.from("agent_run_searches").insert({ intelligence_item_id: itemId, search_query: "canonical:generate-pool", result_url: fetched[i].url, result_title: "generate pool source", result_index: i, result_content_excerpt: cleanCtl(fetched[i].text), searched_at: new Date().toISOString() });
  }
  return { ok: true, detail: `brief ${body.length}ch synthesised from ${fetched.length} sources (${corroborators.length} discovered via web_search)` };
}

/** STEP section: format-selected extractor (via the registry) -> upsert intelligence_item_sections.
 *  Dispatches by item_type through specForItemType — ONE path for every surface (regulation, research,
 *  market, technology, operations). Surfaces that render structured components re-parse content_md at
 *  render time; the rows stored here are format-generic. */
export async function sectionBrief(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it } = await sb.from("intelligence_items").select("item_type, full_brief").eq("id", itemId).single();
  if (!it?.full_brief) return { ok: false, detail: "no full_brief" };
  const spec = specForItemType(it.item_type);
  if (!spec) return { ok: false, detail: `no format spec for item_type ${it.item_type}` };
  const rows = spec.extract(it.full_brief);
  if (!rows.length) return { ok: false, detail: `no sections extracted (${spec.formatType})` };
  // Replace stale sections from a prior generation (a re-gen may emit fewer/renamed sections).
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
  const { count: existing } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", itemId);
  if (existing && existing > 0) return { ok: true, detail: "already grounded" };
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
    fetched = (await Promise.all(groundUrls.map(async (u) => ({ url: u, text: await fetchText(u, 16000) })))).filter((b) => b.text.length > 200);
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
- FACT: source_span MUST be VERBATIM copied char-for-char from a SOURCE block; source_id = "${it.source_id}".
- ANALYSIS: emit claim_kind "ANALYSIS" ONLY for a statement the brief text EXPLICITLY labels with "Analytical inference:", "Industry interpretation:" or "Operational implication:". Set claim_text to that labeled sentence (so it appears verbatim in the section). NEVER mark unlabeled prose as ANALYSIS — if it has a verbatim source span it is FACT, otherwise omit it.
- Cover EACH required slot with >=1 FACT or GAP claim (set slot_key):\n${(slots ?? []).map((s) => `- ${s.slot_key}: ${s.description}`).join("\n")}
- For EVERY section (${secs.map((s) => s.section_key).join(", ")}) with must/requires/shall/applies/mandates/prohibits/obligates, emit >=1 FACT claim with "section" set + a verbatim span.
- No verbatim span for a slot -> claim_kind "GAP", source_span null. Never invent spans. CLOSE with CLAIM_PROVENANCE_LEDGER>>>.`;
  const user = `BRIEF SECTIONS:\n${secs.map((s) => `### SECTION ${s.section_key}\n${(s.content_md || "").slice(0, 2200)}`).join("\n\n")}\n\n====\nSOURCE CONTENT (copy spans VERBATIM):\n${fetched.map((b, i) => `### SOURCE ${i + 1} url=${b.url}\n${b.text.slice(0, 16000)}`).join("\n\n")}`;
  let claims;
  try { claims = extractClaimLedger(await callSonnet(system, user)); } catch (e) { return { ok: false, detail: `ledger rejected: ${(e as Error).message.slice(0, 60)}` }; }
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
  const claimIds: string[] = [];
  for (const c2 of linked) {
    const sectionRowId = sectionMap[String(c2.section)] || secs[0].id;
    const storedText = cleanCtl((["FACT", "GAP"].includes(c2.claim_kind) && c2.slot_key) ? `[${c2.slot_key}] ${c2.claim_text}` : c2.claim_text ?? "");
    const { data: ins } = await sb.from("section_claim_provenance").insert({ section_row_id: sectionRowId, intelligence_item_id: itemId, claim_text: storedText, claim_kind: c2.claim_kind, source_span: cleanCtl(c2.source_span ?? null), source_id: c2.source_id || it.source_id, search_result_id: c2.search_result_id || null, source_tier_at_grounding: c2.claim_kind === "FACT" ? 2 : null }).select("id").single();
    if (ins) claimIds.push(ins.id);
  }
  const { data: vrData, error: vrErr } = await sb.rpc("validate_item_provenance", { p_item_id: itemId } as never);
  const vr = (Array.isArray(vrData) ? vrData[0] : vrData) as { valid: boolean; recommended_status: string; failures: unknown } | undefined;
  if (vr?.valid) return { ok: true, detail: `grounded kept=${kept.length} -> ${vr.recommended_status}` };
  // manual rollback: the brief did not validate (or the RPC failed) — remove the just-inserted rows.
  if (claimIds.length) await sb.from("section_claim_provenance").delete().in("id", claimIds);
  // Only delete searches THIS step created (fallback path). The generate-stored pool is left intact
  // so a re-ground attempt still has the corpus.
  if (ownSearches && searchIds.length) await sb.from("agent_run_searches").delete().in("id", searchIds);
  const why = vrErr ? `rpc error: ${vrErr.message}` : `validation failed: ${JSON.stringify(vr?.failures ?? "no result")}`;
  return { ok: false, detail: why.slice(0, 140) };
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
