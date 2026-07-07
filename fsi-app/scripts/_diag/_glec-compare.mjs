// READ-ONLY: full side-by-side of the two GLEC items so the operator can decide keep-vs-archive.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient } = await import("../lib/db.mjs");
const sb = readClient();

const IDS = { "50ccd5cc": null, "3581c084": null };
const { data: all } = await sb.from("intelligence_items").select("id").or("provenance_status.eq.verified,provenance_status.eq.quarantined");
// just fetch by prefix from a broad pull
const { data: items } = await sb.from("intelligence_items").select(
  "id,title,source_url,item_type,format_type,provenance_status,created_at,updated_at,last_regenerated_at,regeneration_skill_version,summary,full_brief,instrument_identifier,jurisdiction_iso,topic_tags,severity,is_archived");
const pick = (p) => items.find((i) => i.id.startsWith(p));

for (const p of ["50ccd5cc", "3581c084"]) {
  const it = pick(p);
  if (!it) { console.log(`${p}: NOT FOUND`); continue; }
  console.log(`\n══════════ ${p} ══════════`);
  console.log(`title:      ${it.title}`);
  console.log(`type:       item_type=${it.item_type}  format=${it.format_type}  status=${it.provenance_status}  archived=${it.is_archived}`);
  console.log(`source_url: ${it.source_url}`);
  console.log(`instrument: ${it.instrument_identifier || "(none)"}  juris=${JSON.stringify(it.jurisdiction_iso)}  topics=${JSON.stringify(it.topic_tags)}`);
  console.log(`dates:      created=${String(it.created_at).slice(0, 10)}  updated=${String(it.updated_at).slice(0, 10)}  regen=${String(it.last_regenerated_at || "").slice(0, 10)}  skill=${it.regeneration_skill_version}`);
  console.log(`brief_len:  ${(it.full_brief || "").length}  summary: ${(it.summary || "").slice(0, 160)}`);
  // claims
  const { data: claims } = await sb.from("section_claim_provenance").select("claim_kind,source_id,source_tier_at_grounding").eq("intelligence_item_id", it.id);
  const kinds = {}; for (const c of claims || []) kinds[c.claim_kind] = (kinds[c.claim_kind] || 0) + 1;
  console.log(`claims:     ${claims?.length || 0} ${JSON.stringify(kinds)}`);
  // section headings from the brief
  const heads = [...(it.full_brief || "").matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1].trim()).slice(0, 16);
  console.log(`sections:   ${heads.join(" | ")}`);
  console.log(`brief head: ${(it.full_brief || "").replace(/\s+/g, " ").slice(0, 420)}`);
}
process.exit(0);
