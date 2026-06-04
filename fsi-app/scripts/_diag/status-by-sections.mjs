/** READ-ONLY: cross-tab provenance_status × has-sections for active items. */
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

// All active items.
const { data: items } = await supabase
  .from("intelligence_items")
  .select("id, provenance_status")
  .eq("is_archived", false);

// All non-empty section item_ids -> set.
const { data: secs } = await supabase
  .from("intelligence_item_sections")
  .select("item_id")
  .not("content_md", "is", null)
  .limit(100000);
const withSections = new Set((secs || []).map((s) => s.item_id));

const tab = {};
for (const it of items || []) {
  const hasSec = withSections.has(it.id) ? "has_sections" : "no_sections";
  const st = it.provenance_status || "null";
  tab[st] = tab[st] || { has_sections: 0, no_sections: 0 };
  tab[st][hasSec]++;
}
console.log("provenance_status × has_sections (active items):");
console.table(tab);

// Under fail-close (0-section -> quarantined; sectioned items unchanged since
// nothing passes 2-5), compute the projected distribution.
let projVerified = 0, projPending = 0, projQuar = 0;
for (const [st, row] of Object.entries(tab)) {
  // sectioned items keep their current status; 0-section items all quarantine.
  projQuar += row.no_sections;
  if (st === "verified") projVerified += row.has_sections;
  else if (st === "pending_human_verify") projPending += row.has_sections;
  else projQuar += row.has_sections;
}
console.log(`\nProjected under FAIL-CLOSE (0-section -> quarantined):`);
console.log(`  verified (sectioned & already passing): ${projVerified}`);
console.log(`  pending_human_verify (sectioned)      : ${projPending}`);
console.log(`  quarantined                            : ${projQuar}`);
