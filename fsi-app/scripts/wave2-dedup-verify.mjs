/** WAVE 2 dedup STEP 1 — field-identity verification ($0, READ-ONLY, no deletes).
 *  Before any dedup delete, verify that duplicate rows within each (item, claim_text) group match on ALL
 *  substantive fields: source_id, source_tier_at_grounding, claim_kind, and the span + section reference.
 *  Fully-identical groups -> cleared for dedup. Divergent groups -> findings (named divergent fields), HELD.
 *  Affected items are identified by ACTUAL duplicate claim_text rows (race signal) unioned with the wave-2
 *  priced-line markers, NOT a stale time window. Prints one section_claim_provenance row's keys first (schema
 *  audit) so the identity fields are verified against the real columns.
 *  Usage: node scripts/wave2-dedup-verify.mjs
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// substantive identity fields (subset resolved against the real columns after the schema audit below)
const IDENTITY_CANDIDATES = ["source_id", "search_result_id", "source_tier_at_grounding", "claim_kind", "section_id", "section_row_id", "span", "source_span", "quote", "excerpt", "char_start", "char_end"];

async function main() {
  // --- schema audit: one row's keys ---
  const { data: sample } = await sb.from("section_claim_provenance").select("*").limit(1);
  const cols = sample && sample[0] ? Object.keys(sample[0]) : [];
  const idFields = IDENTITY_CANDIDATES.filter((c) => cols.includes(c));
  console.log(`\n=== schema audit: section_claim_provenance columns ===\n${cols.join(", ")}`);
  console.log(`\nidentity fields checked (present in table): ${idFields.join(", ")}`);

  // --- affected item set: priced-line markers (any time) UNION items with duplicate claim_text ---
  const { data: markers } = await sb.from("agent_runs").select("intelligence_item_id")
    .eq("fetch_method", "priced-line").not("intelligence_item_id", "is", null);
  const markerIds = new Set((markers || []).map((m) => m.intelligence_item_id));

  // find items with duplicate (item, claim_text): pull all provenance rows in pages, tally
  const dupItems = new Set();
  {
    const seenPerItem = new Map(); // itemId -> Map(claim_text -> count)
    let from = 0; const page = 1000;
    for (;;) {
      const { data, error } = await sb.from("section_claim_provenance")
        .select("intelligence_item_id, claim_text").range(from, from + page - 1);
      if (error) { console.error("scan error", error.message); break; }
      if (!data || !data.length) break;
      for (const r of data) {
        if (!seenPerItem.has(r.intelligence_item_id)) seenPerItem.set(r.intelligence_item_id, new Map());
        const m = seenPerItem.get(r.intelligence_item_id);
        const k = r.claim_text ?? "";
        m.set(k, (m.get(k) || 0) + 1);
      }
      if (data.length < page) break;
      from += page;
    }
    for (const [itemId, m] of seenPerItem) {
      for (const [, n] of m) { if (n > 1) { dupItems.add(itemId); break; } }
    }
  }

  const itemIds = [...new Set([...markerIds, ...dupItems])].filter(Boolean);
  console.log(`\n=== affected items: ${markerIds.size} priced-line-marker, ${dupItems.size} with dup claim_text, ${itemIds.length} union ===`);

  let identicalGroups = 0, divergentGroups = 0, itemsWithDupes = 0;
  const divergentReport = [];
  for (const id of itemIds) {
    const { data: claims } = await sb.from("section_claim_provenance")
      .select(["id", "claim_text", "extracted_at", ...idFields].join(",")).eq("intelligence_item_id", id);
    const { data: it } = await sb.from("intelligence_items").select("title, provenance_status").eq("id", id).single();
    const title = String(it?.title || id).slice(0, 42);

    const groups = new Map();
    for (const c of claims || []) {
      const k = c.claim_text ?? "";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    let itemIdentical = 0, itemDivergent = 0;
    const itemDivergentFields = new Map(); // field -> count
    for (const [ctext, rows] of groups) {
      if (rows.length <= 1) continue;
      const divergent = [];
      for (const f of idFields) {
        const vals = new Set(rows.map((r) => JSON.stringify(r[f] ?? null)));
        if (vals.size > 1) divergent.push(f);
      }
      if (divergent.length === 0) { identicalGroups += 1; itemIdentical += 1; }
      else {
        divergentGroups += 1; itemDivergent += 1;
        for (const f of divergent) itemDivergentFields.set(f, (itemDivergentFields.get(f) || 0) + 1);
        divergentReport.push({ id, title, claim: ctext.slice(0, 60), fields: divergent, rows: rows.length });
      }
    }
    if (itemIdentical + itemDivergent > 0) {
      itemsWithDupes += 1;
      const divStr = itemDivergent ? ` | DIVERGENT ${itemDivergent} (${[...itemDivergentFields.entries()].map(([f, n]) => `${f}x${n}`).join(",")})` : "";
      console.log(`  ${title.padEnd(42)} [${it?.provenance_status}] identical-groups=${itemIdentical}${divStr}`);
    }
  }

  console.log(`\n=== STEP 1 RESULT ===`);
  console.log(`items with duplicate groups: ${itemsWithDupes}`);
  console.log(`fully-identical groups (CLEARED for dedup): ${identicalGroups}`);
  console.log(`divergent groups (HELD, findings): ${divergentGroups}`);
  if (divergentReport.length) {
    console.log(`\n--- DIVERGENT GROUP DETAIL (delete nothing here) ---`);
    for (const d of divergentReport.slice(0, 40)) {
      console.log(`  [${d.title}] rows=${d.rows} diverge on {${d.fields.join(", ")}} :: "${d.claim}"`);
    }
    if (divergentReport.length > 40) console.log(`  ... +${divergentReport.length - 40} more`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
