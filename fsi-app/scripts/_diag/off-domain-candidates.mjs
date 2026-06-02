/** READ-ONLY: surface likely OFF-DOMAIN items (off the freight-sustainability
 * vertical) for operator review. Flags by title heuristics + source linkage.
 * Archives NOTHING — produces a candidate list to authorize. */
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

const { data: items } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, item_type, priority, provenance_status, source_id, source_url")
  .eq("is_archived", false)
  .limit(2000);

// Off-domain heuristics: US municipal/county/state sustainability or DOT
// programs with no freight/logistics/trade nexus, generic city climate offices,
// etc. These are CANDIDATES for review, not auto-decisions.
const OFF_PATTERNS = [
  /\bcity council\b/i, /\bcity of\b/i, /\bcounty\b/i, /\bmunicipal/i,
  /office of sustainability/i, /metro \w+ (energy|sustainab)/i,
  /\b(nashville|philadelphia|denver|austin|seattle|portland|atlanta|houston|phoenix|dallas)\b/i,
  /department of environment and conservation/i,
  /state energy (office|program)/i, /climate action plan/i,
];
const FREIGHT_NEXUS = /\b(freight|logistic|cargo|shipping|maritime|port|aviation|air cargo|customs|trade|vessel|carrier|fuel|emission|CBAM|ETS|SAF|supply chain|transport)\b/i;

const candidates = [];
for (const it of items || []) {
  const t = it.title || "";
  const offHit = OFF_PATTERNS.find((re) => re.test(t));
  if (offHit && !FREIGHT_NEXUS.test(t)) {
    candidates.push(it);
  }
}

console.log("=".repeat(70));
console.log(`OFF-DOMAIN CANDIDATES (review only) — ${candidates.length} flagged`);
console.log("=".repeat(70));
for (const c of candidates) {
  console.log(`[${c.legacy_id || c.id.slice(0, 8)}] type=${c.item_type} pri=${c.priority} status=${c.provenance_status} src=${c.source_id ? "set" : "NULL"}`);
  console.log(`    "${c.title}"`);
  console.log(`    ${c.source_url || "(no url)"}`);
}
console.log(`\nTotal candidates: ${candidates.length}. NOTHING archived — operator authorizes the id set.`);
