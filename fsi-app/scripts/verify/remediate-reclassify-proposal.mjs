/** PROPOSAL ONLY (read-only) — RECLASSIFY+RE-HOME the format-drift items. Cross-surface item_type
 *  moves are AUTHORIZATION-GATED (operator directive) — this WRITES NO item rows; it emits a per-item
 *  proposal doc for sign-off. Proposed type is derived from the brief's ACTUAL generated format
 *  (the generator already produced market/research/ops content under a reg-family type label).
 *  GOVERNING: caros-ledge-platform-intent (five-surface routing) + env-policy Format Mapping. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { specForItemType } = await jiti.import("../../src/lib/agent/extract-registry.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const REG = new Set(["regulation", "directive", "standard", "guidance", "framework", "law"]);
const FMT_TOKENS = ["Regulatory Fact", "Market Signal", "Research Summary", "Operations Profile", "Technology Profile"];
const FMT_OF_TYPE = { regulatory_fact_document: "Regulatory Fact", market_signal_brief: "Market Signal", research_summary: "Research Summary", operations_profile: "Operations Profile", technology_profile: "Technology Profile" };
const PROPOSE = { "Market Signal": ["market_signal", "Market Intel"], "Research Summary": ["research_finding", "Research"], "Operations Profile": ["regional_data", "Operations"], "Technology Profile": ["technology", "Research/Market (HOLD — substance)"] };
const ERR = /\b(access (unavailable|verification|blocked|denied)|content unavailable|cookie policy|service (status|availability))\b/i;
const PORTAL = /\b(data (and statistics )?(explorer|portal|viewer)|open data|database\b|dashboard|landing page|official website|legislation register)\b/i;
const detectFmt = (b) => { const h = (b || "").split(/\r?\n/).slice(0, 12).join("\n"); return FMT_TOKENS.find((f) => h.includes(f)) || null; };

const { data: items } = await sb.from("intelligence_items")
  .select("id,legacy_id,title,item_type,source_url,full_brief").eq("provenance_status", "verified").eq("is_archived", false).limit(2000);
const rows = [];
for (const it of items || []) {
  if (!REG.has(it.item_type)) continue;                        // only reg-family-typed
  const t = it.title || "";
  if (ERR.test(t) || PORTAL.test(t)) continue;                 // those are RE-TITLE/ARCHIVE, handled elsewhere
  const exp = FMT_OF_TYPE[specForItemType(it.item_type)?.formatType];
  const det = detectFmt(it.full_brief);
  if (!det || det === exp) continue;                            // no drift
  const [pt, surf] = PROPOSE[det] || ["?", "?"];
  rows.push({ id: it.legacy_id || it.id.slice(0, 8), cur: it.item_type, det, pt, surf, title: t.slice(0, 60), host: (() => { try { return new URL(it.source_url).host.replace(/^www\./, ""); } catch { return ""; } })() });
}
rows.sort((a, b) => a.pt.localeCompare(b.pt));

let md = `# RECLASSIFY + RE-HOME proposal (AUTH-GATED — operator sign-off required)\n\n`;
md += `Generated ${new Date().toISOString().slice(0, 10)} by scripts/verify/remediate-reclassify-proposal.mjs (read-only).\n`;
md += `These ${rows.length} items are typed reg-family (so they surface on /regulations) but the GENERATED brief is a\n`;
md += `non-reg format — i.e. the generator already produced Market/Research/Operations content. Proposed item_type is\n`;
md += `derived from the brief's actual format; this moves each off /regulations to its true surface ("regulations only\n`;
md += `on Regulations"). Cross-surface item_type changes => YOUR authorization. Execution (when approved) = a single\n`;
md += `committed migration capturing prior item_type per row.\n\n`;
md += `| item | current type | brief format | → proposed type | target surface | source host | title |\n|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.id} | ${r.cur} | ${r.det} | **${r.pt}** | ${r.surf} | ${r.host} | ${r.title} |\n`;
md += `\nNotes: Technology-Profile drifts (→ technology) join the HOLD set pending the 4-vs-5-page decision. Items whose\n`;
md += `brief is ALSO thin/portal should be archived instead (see source-vs-item) — excluded here.\n`;
const out = resolve(ROOT, "docs", "RECLASSIFY-PROPOSAL.md");
writeFileSync(out, md);
console.log(`proposal: ${rows.length} items -> docs/RECLASSIFY-PROPOSAL.md`);
const byType = {}; for (const r of rows) byType[r.pt] = (byType[r.pt] || 0) + 1;
for (const [k, v] of Object.entries(byType)) console.log(`  → ${k}: ${v}`);
