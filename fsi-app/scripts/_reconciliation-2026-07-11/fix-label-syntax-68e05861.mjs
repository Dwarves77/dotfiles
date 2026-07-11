/** Phase 1.2 — deterministic label-syntax repair for 68e05861 (Japan MLIT), zero spend.
 *  Criterion-4 failure: ANALYSIS claim's paragraph lacks a recognized label. Fix per the
 *  env-policy labeling discipline: KEEP the judgement, LABEL it (*Analytical inference:*).
 *  Guarded: snapshot -> targeted string replace in section 2 content_md + full_brief ->
 *  validator read-back must return valid=true. No status write here (reconciler touch follows).
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ITEM = "68e05861-c953-485d-b081-cb6777dcfd99";
const SECTION_ROW = "0a1de4ff-f961-4620-a69c-994317c804f3";
const BEFORE = "Second, Japan's stated alignment with IMO's";
const AFTER = "Second, *Analytical inference:* Japan's stated alignment with IMO's";
const APPLY = process.argv.includes("--apply");

const { data: sec, error: e1 } = await db.from("intelligence_item_sections")
  .select("id, section_key, content_md").eq("id", SECTION_ROW).single();
if (e1) throw e1;
const { data: item, error: e2 } = await db.from("intelligence_items")
  .select("id, title, provenance_status, full_brief").eq("id", ITEM).single();
if (e2) throw e2;

const secHits = sec.content_md.split(BEFORE).length - 1;
const briefHits = item.full_brief.split(BEFORE).length - 1;
console.log(`target hits: section=${secHits} full_brief=${briefHits} (need exactly 1 each)`);
if (secHits !== 1 || briefHits !== 1) { console.error("REFUSING: target string not unique"); process.exit(2); }

if (!APPLY) { console.log("DRY-RUN OK — targets unique, would insert '*Analytical inference:*'"); process.exit(0); }

// snapshot
const snapDir = resolve(ROOT, "scripts/_snapshots");
mkdirSync(snapDir, { recursive: true });
const snap = resolve(snapDir, `${new Date().toISOString().replace(/[:.]/g, "-")}_label-fix-68e05861.jsonl`);
writeFileSync(snap, JSON.stringify({ table: "intelligence_item_sections", row: sec }) + "\n" +
  JSON.stringify({ table: "intelligence_items", row: { id: item.id, title: item.title, provenance_status: item.provenance_status, full_brief: item.full_brief } }) + "\n");
console.log(`snapshot: ${snap}`);

// apply both homes
const { error: e3 } = await db.from("intelligence_item_sections")
  .update({ content_md: sec.content_md.replace(BEFORE, AFTER) }).eq("id", SECTION_ROW);
if (e3) throw e3;
const { error: e4 } = await db.from("intelligence_items")
  .update({ full_brief: item.full_brief.replace(BEFORE, AFTER) }).eq("id", ITEM);
if (e4) throw e4;

// read-back: validator must now pass
const { data: v, error: e5 } = await db.rpc("validate_item_provenance", { p_item_id: ITEM });
if (e5) throw e5;
console.log(`validator after fix: valid=${v.valid} recommended=${v.recommended_status} failures=${JSON.stringify(v.failures)}`);
const { data: after } = await db.from("intelligence_items").select("provenance_status").eq("id", ITEM).single();
console.log(`stored status now: ${after.provenance_status}`);
process.exit(v.valid ? 0 : 1);
