// One-off cleanup: delete the STALE synthesis-budget coverage_gap flags the PRE-refinement recordTruncation
// wrote on efdb3390 during the PPWR prove-on-one. The refinement (2026-06-23: budget-trim → warn-only, only
// a real DOWNLOAD truncation flags) resolves the condition that produced them, so its artifacts are cleared
// (clear-flags-when-resolved). KEEPS the legitimate download-truncation flag (the 455K ELI corroborator
// capped at 60K). Guarded delete (snapshots the rows as the reinsert record).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, guardedDelete } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(ROOT + "/.env.local");
const sb = readClient();

const items = await sb.from("intelligence_items").select("id").or("legacy_id.eq.g2,title.ilike.%packaging%");
const it = (items.data || []).find((r) => r.id.startsWith("efdb3390"));
if (!it) { console.error("PPWR item not found"); process.exit(1); }

const { data: flags } = await sb.from("integrity_flags").select("id,description,created_by")
  .eq("subject_ref", it.id).eq("created_by", "truncation-guard").eq("status", "open");
const stale = (flags || []).filter((f) => /synthesis-budget/.test(f.description || ""));
console.log(`truncation-guard flags on efdb3390: ${flags?.length || 0} (stale synthesis-budget: ${stale.length}, keeping ${(flags?.length || 0) - stale.length} download flag(s))`);
for (const f of stale) console.log(`  DELETE ${f.id.slice(0, 8)} — ${(f.description || "").slice(0, 90)}`);
if (!stale.length) { console.log("nothing to clean"); process.exit(0); }

const res = await guardedDelete("integrity_flags", stale.map((f) => f.id), {
  cite: { skill: "remediation-discipline", reason: "delete stale synthesis-budget coverage_gap flags from the pre-refinement recordTruncation run; refinement (budget-trim→warn-only) resolves the condition" },
});
console.log(`deleted=${res.deleted}  snapshot=${res.snapshot}`);
process.exit(0);
