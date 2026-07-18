#!/usr/bin/env node
// restore-overclear.mjs — RESTORE claims over-cleared by the batch drain-clear (2026-07-16 incident: auto
// version-out ran on span-absence alone, INFERRING cross-instrument, which over-applied the ruling's AND
// condition for items whose DECLARED primary is wrong/incomplete — 4ff5cf56 docket, ad4cc6c6). Per operator
// ruling: restore all such versioned-out claims to the live ledger through the guarded path, logged with the
// incident cite; the archive rows are the erroneous erase and are removed (undo). Status recomputes via the
// migration-209 DELETE / the INSERT triggers. Usage: node restore-overclear.mjs <key...> [--apply]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const keys = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!keys.length) { console.error("usage: restore-overclear.mjs <key...> [--apply]"); process.exit(1); }
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll, guardedInsert, guardedDelete } = await jiti.import("../lib/db.mjs");
const sb = readClient();
const items = await readAll("intelligence_items", "id,legacy_id", {});

const cite = { skill: "remediation-discipline", reason: "restore-of-overclear (2026-07-16 incident): batch drain-clear versioned out claims on span-absence alone, inferring cross-instrument — over-applied the ruling's AND condition for wrong-primary items; restore to live ledger per operator ruling" };

for (const key of keys) {
  const it = items.find((x) => x.id.startsWith(key) || (x.legacy_id || "").startsWith(key));
  if (!it) { console.log(`${key}: not found`); continue; }
  // Precisely this session's over-clear: proven_inaccurate + span_absent proof, for THIS item.
  const { data: versions } = await sb.from("claim_versions").select("*")
    .eq("intelligence_item_id", it.id).eq("supersede_reason", "proven_inaccurate");
  const overcleared = (versions || []).filter((v) => v?.inaccuracy_proof?.reason === "span_absent_from_verified_primary");
  console.log(`\n${it.legacy_id || it.id.slice(0, 8)}: ${overcleared.length} over-cleared claim(s) to restore${APPLY ? "" : " (dry-run)"}`);
  if (!APPLY) { for (const v of overcleared) console.log(`  [${v.claim_kind}] ${String(v.claim_text).slice(0, 90)}`); continue; }
  let restored = 0;
  for (const v of overcleared) {
    const row = {
      intelligence_item_id: it.id, section_row_id: v.section_row_id ?? null,
      claim_text: v.claim_text ?? null, claim_kind: v.claim_kind ?? null, source_span: v.source_span ?? null,
      source_id: v.source_id ?? null, search_result_id: v.search_result_id ?? null,
      source_tier_at_grounding: v.source_tier_at_grounding ?? null, mint_hold_reason: v.mint_hold_reason ?? null,
    };
    try {
      await guardedInsert("section_claim_provenance", row, { cite });
      await guardedDelete("claim_versions", [v.id], { cite }); // undo the erroneous archive
      restored++;
    } catch (e) { console.log(`  FAILED restore ${v.id.slice(0, 8)}: ${e.message}`); }
  }
  const { data: fin } = await sb.from("intelligence_items").select("provenance_status").eq("id", it.id).single();
  console.log(`  restored ${restored}/${overcleared.length}; status=${fin?.provenance_status}`);
}
process.exit(0);
