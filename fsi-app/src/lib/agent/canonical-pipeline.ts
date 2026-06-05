// src/lib/agent/canonical-pipeline.ts
//
// THE single canonical generation pipeline as plain, directly-executable lib functions the workflow
// steps call (no blind bodies). Ports the logic proven in scripts/content-generate.mjs (generate) +
// scripts/block4-retroground-runner.mjs (ground), reusing the proven growSourcesFromBrief (grow).
// Uses the Supabase SERVICE client throughout (env-based -> works in the Vercel workflow runtime,
// unlike the local-only pooler the scripts used). The grounding "transaction" is emulated with a
// manual cleanup-on-invalid (delete the just-inserted claims/searches) since the REST client has no
// multi-statement transaction — atomic enough: an item is only ever flipped by validate_item_provenance.
// Browserless is the only fetch path. Once wired into generate-brief.ts + /api/agent/run, the scripts
// are retired: ONE path that generates -> sections -> grounds -> grows.

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

export interface StepResult { ok: boolean; detail: string }

/** STEP generate: fetch the item's source via Browserless, generate the format-selected brief
 *  (system prompt selects by item_type), write full_brief. */
export async function generateBrief(itemId: string): Promise<StepResult> {
  const sb = svc();
  const { data: it } = await sb.from("intelligence_items").select("id, title, item_type, source_id, source_url").eq("id", itemId).single();
  if (!it) return { ok: false, detail: "item not found" };
  const src = await fetchText(it.source_url, 28000);
  if (src.length < 300) return { ok: false, detail: `source thin (${src.length}ch)` };
  const user = `Generate the ${it.item_type} brief for: "${it.title}".
Source URL: ${it.source_url}  (item source_id for FACT source_id: ${it.source_id})
Ground every FACT claim's source_span as a VERBATIM substring of the SOURCE CONTENT below; set source_url to ${it.source_url}.
Follow your output contract exactly: brief body, then the Claim Provenance Ledger, then the YAML frontmatter.

SOURCE CONTENT (copy FACT spans verbatim from here):
${src.slice(0, 28000)}`;
  const parsed = parseAgentOutput(await callSonnet(SYSTEM_PROMPT, user));
  const body = (parsed.body || "").trim();
  if (body.length < 600) return { ok: false, detail: `parsed body too short (${body.length})` };
  await sb.from("intelligence_items").update({ full_brief: cleanCtl(body), updated_at: new Date().toISOString() }).eq("id", itemId);
  return { ok: true, detail: `brief ${body.length}ch` };
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
