// LOOP PROOF: take a real, currently-untracked regulation through the FULL generateBriefWorkflow
// orchestrator (the function the /api/agent/run route invokes) end-to-end — intake -> generate -> ground
// -> verify -> surface — and report every stage, the final customer-visible state, agent_runs telemetry,
// and the source tiers the system autonomously assigns. Exercises the real engine + telemetry; the only
// layers NOT hit are the Vercel Workflow DevKit durability wrapper and the HTTP/auth wrapper (infra).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBriefWorkflow } = await jiti.import(resolve(ROOT, "src/workflows/generate-brief.ts"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SRC = "260089a9-e334-4104-843c-cdfc28a94dcc"; // EUR-Lex (tier 1, active)
const URL = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52023PC0445";
const TITLE = "Revision of the Weights and Dimensions Directive (96/53/EC) — zero-emission HGV weight allowances";

// ── INTAKE (the human-approved step: create the new item) ──
let { data: ex } = await sb.from("intelligence_items").select("id,provenance_status").eq("source_url", URL).maybeSingle();
let itemId;
if (ex?.id) { itemId = ex.id; console.log(`INTAKE: item already exists ${itemId} (prov=${ex.provenance_status}) — reusing`); }
else {
  const { data, error } = await sb.from("intelligence_items").insert({
    source_id: SRC, source_url: URL, title: TITLE, item_type: "regulation", domain: 1, status: "monitoring", pipeline_stage: "draft",
  }).select("id").single();
  if (error) { console.log("INTAKE FAILED:", error.message); process.exit(1); }
  itemId = data.id; console.log(`INTAKE: created NEW item ${itemId} — "${TITLE.slice(0, 50)}"`);
}
const before = (await sb.from("agent_runs").select("id", { count: "exact", head: true }).eq("intelligence_item_id", itemId)).count || 0;

// ── RUN the real orchestrator ──
console.log("\n=== generateBriefWorkflow (preflight -> generate -> register -> section -> ground -> grow) ===");
const t = Date.now();
let result;
try { result = await generateBriefWorkflow(itemId, false); }
catch (e) { console.log(`WORKFLOW THREW (${((Date.now() - t) / 1000).toFixed(0)}s): fatal=${e?.fatal} ${(e?.message || "").slice(0, 180)}`); process.exit(0); }
console.log(`WORKFLOW status=${result.status}  (${((Date.now() - t) / 1000).toFixed(0)}s)`);
for (const [k, v] of Object.entries(result.steps || {})) console.log(`  step ${k.padEnd(10)} ${typeof v === "object" ? JSON.stringify(v).slice(0, 100) : v}`);

// ── final customer-visible state ──
const { data: it } = await sb.from("intelligence_items").select("provenance_status,is_archived,full_brief,severity,priority,format_type,item_type,domain").eq("id", itemId).single();
const visible = it.provenance_status === "verified" && it.is_archived === false;
console.log(`\nFINAL STATE: provenance=${it.provenance_status} archived=${it.is_archived} briefLen=${(it.full_brief || "").length} severity=${it.severity} priority=${it.priority} format=${it.format_type} item_type=${it.item_type} domain=${it.domain}`);
console.log(`CUSTOMER-VISIBLE (verified AND not archived; surfaces on Regulations via item_type+domain=1): ${visible ? "YES ✓" : "NO ✗"}`);

// ── agent_runs telemetry (the gap: direct calls bypass this; the workflow writes it) ──
const { data: runs } = await sb.from("agent_runs").select("label,ok,cost_usd_estimated,detail").eq("intelligence_item_id", itemId).order("started_at");
console.log(`\nAGENT_RUNS telemetry: ${runs?.length || 0} rows written (was ${before} before) — the workflow path records spend, direct calls did not:`);
for (const r of runs || []) console.log(`  ${String(r.label).padEnd(11)} ok=${r.ok} ~$${r.cost_usd_estimated} ${(r.detail || "").slice(0, 70)}`);

// ── source tiers the system autonomously assigned to FACT spans ──
const { data: claims } = await sb.from("section_claim_provenance").select("source_tier_at_grounding,claim_kind").eq("intelligence_item_id", itemId);
const tierHist = {}; let facts = 0;
for (const c of claims || []) { if (c.claim_kind === "FACT") { facts++; const k = c.source_tier_at_grounding ?? "null"; tierHist[k] = (tierHist[k] || 0) + 1; } }
console.log(`\nSOURCE TIERS auto-assigned to ${facts} FACT claims: ${JSON.stringify(tierHist)}  (T1=binding-law … the classifier on real new sources, observed not assumed)`);
process.exit(0);
