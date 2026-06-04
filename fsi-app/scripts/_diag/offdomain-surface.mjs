/** offdomain-surface.mjs — READ-ONLY: surface active off-domain/off-vertical archive candidates + reason. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const __dirname = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(__dirname, "..", "..", ".env.local"));
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Operative portal/off-domain detector (from content-generate.mjs) + off-vertical content cues.
const OFF = /city council|municipal|department directory|departments & bureaus|member directory|navigation error|portal$|agency portal|repository|congressional library|public health|legislative reference|statutes database|services directory|official portal|government structure|government service/i;
const OFFVERT = /\bAI Act\b|artificial intelligence|data protection|gdpr|privacy|cyber|defense|defence|immigration|elections?|taxation of individuals|personal income tax|healthcare\b|pension/i;

const { data, error } = await s
  .from("intelligence_items")
  .select("id, legacy_id, title, item_type, priority, provenance_status, source_id")
  .eq("is_archived", false)
  .order("title");
if (error) { console.error(error.message); process.exit(1); }

const hit = [];
for (const r of data) {
  const t = r.title || "";
  const mPortal = t.match(OFF);
  const mVert = t.match(OFFVERT);
  if (mPortal || mVert) hit.push({ ...r, reason: mPortal ? `portal/off-domain title: "${mPortal[0]}"` : `off-vertical cue: "${mVert[0]}"` });
}
console.log(`active items: ${data.length}  |  off-domain/off-vertical candidates: ${hit.length}\n`);
for (const r of hit) {
  console.log(`  ${r.legacy_id || r.id.slice(0, 8)}  [${r.item_type}/${r.priority}/${r.provenance_status}]  ${r.source_id ? "src✓" : "NO-SRC"}`);
  console.log(`     "${r.title}"`);
  console.log(`     reason: ${r.reason}`);
}
console.log(`\nREAD-ONLY. ${hit.length} candidates. (verdicts: portal-title via content-generate OFF regex; off-vertical via title cue — adjudicate each.)`);
