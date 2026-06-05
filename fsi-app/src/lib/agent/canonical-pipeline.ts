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
import { extractResearchSections } from "@/lib/agent/extract-research-sections";
import { growSourcesFromBrief } from "@/lib/sources/source-growth";

const REG_FORMATS = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const cleanCtl = (s: string | null | undefined) => (s == null ? s : String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " "));
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
Follow your output contract exactly: brief body, then the Claim Provenance Ledger, then the YAML frontmatter, including a "## New Sources Identified" table of the corroborating sources you used.

SOURCE CONTENT (copy FACT spans verbatim from here — ${fetched.length} sources):
${blocks}`;
  const parsed = parseAgentOutput(await callSonnet(SYSTEM_PROMPT, user));
  const body = (parsed.body || "").trim();
  if (body.length < 600) return { ok: false, detail: `parsed body too short (${body.length})` };
  await sb.from("intelligence_items").update({ full_brief: cleanCtl(body), updated_at: new Date().toISOString() }).eq("id", itemId);
  return { ok: true, detail: `brief ${body.length}ch synthesised from ${fetched.length} sources (${corroborators.length} discovered via web_search)` };
}

/** STEP section: format-selected extractor -> upsert intelligence_item_sections. Research wired;
 *  regulatory continues via the existing extract-regulation-sections path (different output shape). */
export async function sectionBrief(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it } = await sb.from("intelligence_items").select("item_type, full_brief").eq("id", itemId).single();
  if (!it?.full_brief) return { ok: false, detail: "no full_brief" };
  if (it.item_type !== "research_finding") {
    if (REG_FORMATS.has(it.item_type)) return { ok: false, detail: `regulatory sectioning not wired into canonical pipeline yet (${it.item_type})` };
    return { ok: false, detail: `no extractor for ${it.item_type}` };
  }
  const rows = extractResearchSections(it.full_brief);
  if (!rows.length) return { ok: false, detail: "no sections extracted" };
  for (const s of rows) {
    await sb.from("intelligence_item_sections").upsert(
      { item_id: itemId, section_key: s.section_key, section_order: s.section_order, content_md: s.content_md, is_conditional: s.is_conditional },
      { onConflict: "item_id,section_key" }
    );
  }
  return { ok: true, detail: `${rows.length} sections` };
}

/** STEP ground: claim-ledger + verbatim span-check + validate_item_provenance; keep claims only if
 *  valid (else delete them — manual rollback). The set_provenance_status trigger flips on the writes. */
export async function groundBrief(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it } = await sb.from("intelligence_items").select("id, item_type, source_id, source_url").eq("id", itemId).single();
  if (!it?.source_id) return { ok: false, detail: "no source_id" };
  const { count: existing } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", itemId);
  if (existing && existing > 0) return { ok: true, detail: "already grounded" };
  const { data: secs } = await sb.from("intelligence_item_sections").select("id, section_key, content_md").eq("item_id", itemId).order("section_order");
  if (!secs?.length) return { ok: false, detail: "no sections" };
  const { data: slots } = await sb.from("item_type_required_slots").select("slot_key, description").eq("item_type", it.item_type);
  const sectionMap = Object.fromEntries(secs.map((s) => [String(s.section_key), s.id]));
  const groundUrls = [...new Set([it.source_url, ...secs.flatMap((s) => urlsIn(s.content_md || ""))].filter(Boolean))] as string[];
  const fetched = (await Promise.all(groundUrls.map(async (u) => ({ url: u, text: await fetchText(u, 16000) })))).filter((b) => b.text.length > 200);
  if (!fetched.length) return { ok: false, detail: "no fetchable grounding content" };
  const excByUrl = Object.fromEntries(fetched.map((b) => [b.url, b.text]));
  const allText = fetched.map((b) => b.text).join(" ").toLowerCase();
  const system = `You extract a Claim Provenance Ledger for a brief. Output ONLY the ledger.
- Emit one block: a line "<<<CLAIM_PROVENANCE_LEDGER", a JSON array, a line "CLAIM_PROVENANCE_LEDGER>>>".
- Record: {"section","claim_text","claim_kind","source_span","source_id","source_url","slot_key"}.
- FACT: source_span MUST be VERBATIM copied char-for-char from a SOURCE block; source_id = "${it.source_id}".
- Cover EACH required slot with >=1 FACT or GAP claim (set slot_key):\n${(slots ?? []).map((s) => `- ${s.slot_key}: ${s.description}`).join("\n")}
- For EVERY section (${secs.map((s) => s.section_key).join(", ")}) with must/requires/shall/applies/mandates/prohibits/obligates, emit >=1 FACT claim with "section" set + a verbatim span.
- No verbatim span for a slot -> claim_kind "GAP", source_span null. Never invent spans. CLOSE with CLAIM_PROVENANCE_LEDGER>>>.`;
  const user = `BRIEF SECTIONS:\n${secs.map((s) => `### SECTION ${s.section_key}\n${(s.content_md || "").slice(0, 2200)}`).join("\n\n")}\n\n====\nSOURCE CONTENT (copy spans VERBATIM):\n${fetched.map((b, i) => `### SOURCE ${i + 1} url=${b.url}\n${b.text.slice(0, 16000)}`).join("\n\n")}`;
  let claims;
  try { claims = extractClaimLedger(await callSonnet(system, user)); } catch (e) { return { ok: false, detail: `ledger rejected: ${(e as Error).message.slice(0, 60)}` }; }
  const kept = claims.filter((cl) => cl.claim_kind !== "FACT" ? true : cl.source_span ? (excByUrl[cl.source_url ?? ""] || allText).toLowerCase().includes(String(cl.source_span).toLowerCase().trim()) : false);

  const searchIds: string[] = [];
  const searchRows: Array<{ id: string; result_url: string }> = [];
  for (let i = 0; i < fetched.length; i++) {
    const { data: r } = await sb.from("agent_run_searches").insert({ intelligence_item_id: itemId, search_query: "canonical ground", result_url: fetched[i].url, result_title: "source", result_index: i, result_content_excerpt: fetched[i].text, searched_at: new Date().toISOString() }).select("id, result_url").single();
    if (r) { searchIds.push(r.id); searchRows.push({ id: r.id, result_url: r.result_url }); }
  }
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
  if (searchIds.length) await sb.from("agent_run_searches").delete().in("id", searchIds);
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
