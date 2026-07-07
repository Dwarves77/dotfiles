// Ground-only re-run (no regenerate) + claim inspection, for the WS1 prove-on-one. The brief is already
// regenerated under the new contract; this re-extracts the claim ledger (groundBrief reads the STORED pool,
// near-free) and prints the FACT/ANALYSIS x tier x section distribution so we can verify grounded-ANALYSIS
// (credible T3 kept) vs pure-inference (NULL) and which SECTION each lands in. Usage: node _ground-only.mjs <id-prefix>
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pfx = process.argv[2];
const items = []; for (let f = 0; ; f += 1000) { const { data } = await sb.from("intelligence_items").select("id,title,provenance_status").order("id").range(f, f + 999); if (!data?.length) break; items.push(...data); if (data.length < 1000) break; }
const it = items.find((r) => r.id.startsWith(pfx));
if (!it) { console.error("not found"); process.exit(1); }

const r = await P.groundBrief(it.id);
console.log(`ground: ${r.ok ? "OK" : "FAIL"} — ${(r.detail || "").slice(0, 120)}`);

const { data: secs } = await sb.from("intelligence_item_sections").select("id,section_key").eq("item_id", it.id);
const secKey = new Map((secs || []).map((s) => [s.id, s.section_key]));
const { data: claims } = await sb.from("section_claim_provenance").select("claim_kind,source_tier_at_grounding,section_row_id,claim_text").eq("intelligence_item_id", it.id);
const { data: itNow } = await sb.from("intelligence_items").select("provenance_status").eq("id", it.id).single();

const byKind = {}; for (const c of claims || []) { const k = `${c.claim_kind}/T${c.source_tier_at_grounding ?? "null"}`; byKind[k] = (byKind[k] || 0) + 1; }
console.log(`\n=== ${pfx} ${it.title.slice(0,38)} | status=${itNow.provenance_status} | claims=${(claims||[]).length} ===`);
console.log(`distribution: ${JSON.stringify(byKind)}`);

// grounded ANALYSIS (tier!=null) and where it sits
const gAnalysis = (claims || []).filter((c) => c.claim_kind === "ANALYSIS" && c.source_tier_at_grounding != null);
const pInf = (claims || []).filter((c) => c.claim_kind === "ANALYSIS" && c.source_tier_at_grounding == null);
console.log(`\ngrounded ANALYSIS (credible, carries tier): ${gAnalysis.length}   pure-inference ANALYSIS (NULL): ${pInf.length}`);
for (const c of gAnalysis.slice(0, 14)) console.log(`  [ANALYSIS T${c.source_tier_at_grounding} @section ${secKey.get(c.section_row_id) ?? "?"}] ${String(c.claim_text).slice(0, 96)}`);
// any sub-floor FACT left (would quarantine)?
const subFloorFact = (claims || []).filter((c) => c.claim_kind === "FACT" && (c.source_tier_at_grounding == null || c.source_tier_at_grounding > 2));
console.log(`\nsub-floor FACT remaining (>T2 or NULL — these quarantine a reg item): ${subFloorFact.length}`);
for (const c of subFloorFact.slice(0, 8)) console.log(`  [FACT T${c.source_tier_at_grounding ?? "null"} @${secKey.get(c.section_row_id) ?? "?"}] ${String(c.claim_text).slice(0, 96)}`);
process.exit(0);
