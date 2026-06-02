/** READ-ONLY: fuller detail on the 13 off-domain candidates — content excerpt,
 * source it entered through (name/category/tier), and origin signals
 * (created_at, legacy_id, item_type). Archives nothing. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..", "..");
const envText = readFileSync(resolve(APP_ROOT, ".env.local"), "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const IDS = [
  "5f1095c9", "6918e77f", "6961f625", "cd238eda", "nashville-building-energy-programs",
  "14ff3453", "24cf9264", "445a06b2", "653f174b", "10f3d5b0", "2473ece6", "2c45cae1", "46914062",
];

// Resolve legacy_id-or-uuid-prefix to full rows.
const { data: all } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, item_type, priority, provenance_status, source_id, source_url, full_brief, created_at, domain")
  .eq("is_archived", false)
  .limit(2000);
const pick = (key) => (all || []).find((r) => r.legacy_id === key || r.id.startsWith(key));

for (const key of IDS) {
  const it = pick(key);
  if (!it) { console.log(`\n[${key}] NOT FOUND`); continue; }
  let srcName = "(none)", srcCat = "-", srcTier = "-", srcStatus = "-";
  if (it.source_id) {
    const { data: s } = await supabase
      .from("sources").select("name, category, base_tier, effective_tier, status, source_role")
      .eq("id", it.source_id).single();
    if (s) { srcName = s.name; srcCat = `${s.category}/${s.source_role || "-"}`; srcTier = `${s.base_tier ?? "?"}/${s.effective_tier ?? "?"}`; srcStatus = s.status; }
  }
  const brief = (it.full_brief || "").replace(/\s+/g, " ").trim();
  console.log("\n" + "─".repeat(68));
  console.log(`[${it.legacy_id || it.id.slice(0, 8)}]  ${it.title}`);
  console.log(`  type=${it.item_type}  pri=${it.priority}  domain=${it.domain || "-"}  status=${it.provenance_status}  created=${(it.created_at || "").slice(0, 10)}`);
  console.log(`  source: "${srcName}"  cat/role=${srcCat}  tier=${srcTier}  status=${srcStatus}`);
  console.log(`  url: ${it.source_url || "(none)"}`);
  console.log(`  brief[0:280]: ${brief.slice(0, 280) || "(empty)"}`);
}
console.log("\nDONE (read-only).");
