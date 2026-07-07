/** FIX RUN — TEST ONE PER BUCKET (Jason condition 1). Research-or-erase resolver attempt on one item
 *  from each failure-mode bucket, capturing per-step results + the validate_item_provenance failures so
 *  we know what each SOURCING SCENARIO actually needs. EXCLUDES research_finding + technology (Q2 gate).
 *  Integrity bar: grounding keeps only verbatim-span FACTs from REAL fetched material; unsourceable ->
 *  stays quarantined (honest hold). Snapshots each prior row first (reversible). GOVERNING:
 *  remediation-discipline (research-or-erase) + analysis-construction-spec + env-policy integrity rule. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileSync, mkdirSync } from "node:fs";
import { createJiti } from "jiti";
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const sb = readClient();
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBrief, sectionBrief, groundBrief } = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");

const ALL_TESTS = [
  { bucket: "A never-sourced", key: "474ab4cd" },
  { bucket: "B access-blocked", key: "g7" },
  { bucket: "C rich/rolled-back", key: "007f42b1" },
];
// optional single-key argv (e.g. `node fix-test-bucket.mjs g7`) so each slow generate runs in its own
// process within the timeout; default = all three.
const onlyKey = process.argv[2];
const TESTS = onlyKey ? ALL_TESTS.filter((t) => t.key === onlyKey) : ALL_TESTS;
const items = await readAll("intelligence_items", "id,legacy_id,title,item_type");
const resolve1 = (k) => items.find((it) => it.legacy_id === k || it.id.startsWith(k));

const SNAPDIR = resolve(ROOT, "scripts/_snapshots");
mkdirSync(SNAPDIR, { recursive: true });
const SNAP = resolve(SNAPDIR, "fix-test-prior-2026-06-09.jsonl");

for (const t of TESTS) {
  const it = resolve1(t.key);
  if (!it) { console.log(`\n### ${t.bucket} ${t.key}: NOT FOUND`); continue; }
  console.log(`\n### ${t.bucket} — ${it.legacy_id || it.id.slice(0, 8)} [${it.item_type}] ${(it.title || "").slice(0, 50)}`);
  // snapshot prior full row (reversibility)
  try { const { data } = await sb.from("intelligence_items").select("*").eq("id", it.id).single(); if (data) appendFileSync(SNAP, JSON.stringify({ ts: "2026-06-09", prior: data }) + "\n"); } catch {}
  try {
    const g = await generateBrief(it.id);
    console.log(`  generate: ok=${g.ok} ${(g.detail || "").slice(0, 110)}`);
    if (!g.ok) { console.log(`  -> generate failed; honest HOLD (no real material sourced).`); continue; }
    const s = await sectionBrief(it.id);
    console.log(`  section:  ok=${s.ok} ${(s.detail || "").slice(0, 80)}`);
    if (!s.ok) { console.log(`  -> section failed.`); continue; }
    const gr = await groundBrief(it.id);
    console.log(`  ground:   ok=${gr.ok} ${(gr.detail || "").slice(0, 120)}`);
  } catch (e) { console.log(`  ERROR: ${(e.message || String(e)).slice(0, 120)}`); continue; }
  // final state + failures
  const { data: row } = await sb.from("intelligence_items").select("provenance_status").eq("id", it.id).single();
  const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const v = Array.isArray(vr) ? vr[0] : vr;
  const reasons = {};
  for (const f of (v?.failures || [])) reasons[f.reason] = (reasons[f.reason] || 0) + 1;
  console.log(`  => provenance_status=${row?.provenance_status}  valid=${v?.valid}  failures=${JSON.stringify(reasons)}`);
}
console.log(`\n(test-one-per-bucket complete; priors snapshotted to ${SNAP.split(/[\\/]/).pop()})`);
