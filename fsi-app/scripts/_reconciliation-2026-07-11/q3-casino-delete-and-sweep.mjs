/** Q-3 (site-gap register): value-delete the casino off-domain signal via the eligibility gate
 *  (Kansas/T5 precedent) + READ-ONLY sibling relevance sweep over the live signal band.
 *  Ruling authority: RECONCILIATION REMEDIATION dispatch 2026-07-10 Phase 4.5 (operator-ruled Q-3).
 *  guardedDelete (snapshot) -> read-back GONE -> append to deletion-reclassification-log.
 *  Sweep hits are REPORTED; only unambiguous casino-grade junk is auto-deletable under this ruling
 *  (none expected); borderline hits get integrity flags, not deletes. --apply to write.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileSync } from "node:fs";
import { readAll, readClient, guardedDelete } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const RULING = "Q-3 operator ruling, RECONCILIATION REMEDIATION dispatch 2026-07-10 (site-gap register Q-3, Kansas precedent)";
const LOG = resolve(ROOT, "..", "docs", "ops", "deletion-reclassification-log.md");
const cite = { skill: "remediation-discipline", reason: `Q-3 off-domain value-delete (${RULING})` };
const CASINO_ID = "646dda2d-f039-4a55-90e2-900dbca4b185";

const sb = readClient();
const { data: it } = await sb.from("intelligence_items")
  .select("id, legacy_id, title, item_type, provenance_status, is_archived, source_url").eq("id", CASINO_ID).maybeSingle();
if (!it) { console.log("casino item already gone"); } else {
  console.log(`target: "${it.title}" (${it.item_type}, ${it.provenance_status}, archived=${it.is_archived})`);
  if (!/casino|free spin|no-deposit/i.test(it.title)) { console.error("REFUSING: target row no longer matches the ruled description"); process.exit(2); }
  if (APPLY) {
    const del = await guardedDelete("intelligence_items", [it.id], { cite });
    const back = await sb.from("intelligence_items").select("id").eq("id", it.id).maybeSingle();
    if (back.data) { console.error("READ-BACK FAILED — row still present. HALT."); process.exit(1); }
    console.log(`deleted, read-back GONE ✓, snapshot ${del.snapshot}`);
    appendFileSync(LOG, `- ${new Date().toISOString()} · (no legacy key) · ${it.id} · "${it.title.replace(/·/g, "-").slice(0, 70)}" · DELETE · pre-intake-gate off-domain junk live in the monitoring band (casino promotions on a mintransporte.gov.co source URL) · ${RULING} · ${del.snapshot || "-"}\n`);
    console.log("deletion log appended");
  } else { console.log("DRY-RUN — would guardedDelete + log"); }
}

// ── sibling relevance sweep (READ-ONLY report) over the live signal band ──
const live = await readAll("intelligence_items", "id, legacy_id, title, item_type, provenance_status",
  { match: (q) => q.eq("is_archived", false) });
const JUNK = /casino|gambling|lottery|betting|free spin|no.deposit|viagra|payday loan|crypto (airdrop|giveaway)|adult dating|escort/i;
const hits = live.filter((x) => x.id !== CASINO_ID && JUNK.test(x.title || ""));
console.log(`\nSIBLING SWEEP (live items ${live.length}): ${hits.length} junk-pattern hit(s)`);
for (const h of hits) console.log(`  ${h.legacy_id || h.id.slice(0, 8)} [${h.item_type}/${h.provenance_status}] ${h.title}`);
if (!hits.length) console.log("  clean — the casino row was the only junk-pattern title in the live corpus");
