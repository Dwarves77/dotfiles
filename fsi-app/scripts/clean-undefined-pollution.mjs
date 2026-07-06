/** CLEAN "undefined " POLLUTION (PURE NODE — standing dispatch step 6 + self-inflicted-damage repair,
 *  2026-07-04). ROOT CAUSE (now named): run-4c-relabel.mjs had a `v.v` bug — the write loop passed an
 *  undefined verdict to decideRelabel, so applyLabelToContent prepended the LITERAL string "undefined " (label
 *  was undefined) instead of the analysis label, to each judged binding sentence. ~4 buggy runs each prepended
 *  one "undefined " (hence "undefined undefined undefined undefined X"). This was NOT a persistence anomaly —
 *  the writes committed fine; my cross-reads searched for the label (never written) and misread persisted
 *  garbage as not-persisted. The v.v bug is fixed; this repairs the corpus.
 *
 *  SAFE STRIP: analysis proved the ONLY lowercase word ever following "undefined " is "undefined" (no
 *  legitimate "undefined <noun>" occurs), so /(?:undefined )+/g hits exactly the prepend-pollution and restores
 *  the original text. Pure-node guarded writes with read-back. Scope: any section with the pattern (covers the
 *  pre-existing polluted rows too — same bug class). DRY-RUN default; --apply writes. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll, guardedUpdate } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const POLLUTION = /(?:undefined )+/g;                 // for .replace() (global)
const HAS_POLLUTION = /(?:undefined )+/;              // for .test() (NON-global — avoids the lastIndex footgun
//                                                       that made the first pass skip g34 §7 on alternating calls)

const secs = await readAll("intelligence_item_sections", "id,item_id,section_key,content_md", {});
const polluted = secs.filter((s) => HAS_POLLUTION.test(s.content_md || ""));
console.log(`\n=== CLEAN "undefined " POLLUTION (${APPLY ? "APPLY" : "DRY-RUN"}) === polluted sections: ${polluted.length}`);

// preview a few before/after
for (const s of polluted.slice(0, 3)) {
  const cleaned = s.content_md.replace(POLLUTION, "");
  const idx = s.content_md.search(/undefined /);
  console.log(`\n  ${s.id.slice(0, 8)} §${s.section_key}:`);
  console.log(`    BEFORE: ...${s.content_md.slice(Math.max(0, idx - 15), idx + 70).replace(/\n/g, " ")}...`);
  const cidx = Math.max(0, idx - 15);
  console.log(`    AFTER:  ...${cleaned.slice(cidx, cidx + 70).replace(/\n/g, " ")}...`);
}

if (!APPLY) { console.log(`\nDRY-RUN — pass --apply to strip pollution from ${polluted.length} sections.`); process.exit(0); }

let done = 0;
for (const s of polluted) {
  const cleaned = s.content_md.replace(POLLUTION, "");
  const upd = await guardedUpdate("intelligence_item_sections", (qb) => qb.eq("id", s.id), { content_md: cleaned }, { cite: { skill: "remediation-discipline", reason: `strip "undefined " prepend-pollution (v.v bug artifact) from ${s.id.slice(0, 8)} §${s.section_key}` } });
  const fresh = readClient();
  const { data: back } = await fresh.from("intelligence_item_sections").select("content_md").eq("id", s.id).single();
  if (upd.updated !== 1 || /undefined /.test(back?.content_md || "") || back?.content_md !== cleaned) {
    console.log(`  ${s.id.slice(0, 8)} §${s.section_key}: CLEAN FAILED (updated=${upd.updated}) — HALT`); process.exit(3);
  }
  done += 1;
}
console.log(`\ncleaned ${done}/${polluted.length} sections [read-back verified, no 'undefined ' remains]`);
// corpus re-scan
const re = await readAll("intelligence_item_sections", "id,content_md", {});
const still = re.filter((s) => /undefined /.test(s.content_md || "")).length;
console.log(`corpus re-scan: sections still containing 'undefined ': ${still}`);
process.exit(0);
