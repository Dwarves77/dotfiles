// T5 OPERATOR-RULED value-delete + reclassify applier (dispatch 2026-07-06, Jason's ruled list).
// Pure-node, guarded: live re-verify each item → operator-ruled value-delete gate → guardedDelete
// (snapshot) → READ-BACK the row is GONE (the byte-compare analog for a delete) → append to the
// persistent deletion/reclassification log. g22 = reclassify-to-source (register read-back-active,
// then archive). ZERO spend, ZERO fetch, ZERO mint. --apply to write; dry-run default.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { readAll, readClient, guardedDelete, reclassifyToSource } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { isOperatorValueDeletable } = await import("./lib/funded-release-plan.mjs");
const APPLY = process.argv.includes("--apply");
const RULING = "T5 operator ruling, dispatch 2026-07-06 (decision-package-2026-07-06.md)";
const LOG = resolve(ROOT, "..", "docs", "ops", "deletion-reclassification-log.md");
const cite = { skill: "remediation-discipline", reason: `T5 operator-ruled value-delete/reclassify (${RULING})` };

// Jason's ruled list (T5): g26/t6/l8 DELETE; g22 RECLASSIFY-to-source.
const DELETES = [
  { key: "g26", why: "2012 IRENA press release mis-typed as regulation (shell)" },
  { key: "t6", why: "ICAP ETS Map is a tool, not a regulation; ICAP research lives at abd29144" },
  { key: "l8", why: "thin US-DOT program page; re-mintable via the gated intake if a genuine primary surfaces" },
];
const RECLASSIFY = { key: "g22", tier: 4, why: "China CCICED advisory-council page mis-typed as regulation → source" };

const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,provenance_status,is_archived,source_url");
const byKey = new Map(items.map((i) => [i.legacy_id, i]));
const sb = readClient();
const ruledIds = new Set(DELETES.map((d) => d.key));

function logInit() {
  if (!existsSync(dirname(LOG))) mkdirSync(dirname(LOG), { recursive: true });
  if (!existsSync(LOG)) writeFileSync(LOG, `# Deletion / reclassification log\n\nEvery value-ruled or dedup delete + every reclassify-to-source, appended at execution. Columns: when · key · id · title · action · reason · ruling · snapshot.\n\n`);
}
function logRow(cols) { appendFileSync(LOG, `- ${cols.join(" · ")}\n`); }

console.log(`\n=== T5 VALUE-RULINGS (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
if (APPLY) logInit();
const results = [];

// ── DELETES (g26/t6/l8) ──
for (const d of DELETES) {
  const it = byKey.get(d.key);
  if (!it) { console.log(`  ${d.key}: NOT FOUND — skip`); results.push({ key: d.key, ok: false, note: "not found" }); continue; }
  const gate = isOperatorValueDeletable({ item: it, ruledIds, ruling: RULING });
  if (!gate.ok) { console.log(`  ${d.key}: GATE REFUSED — ${gate.reason}`); results.push({ key: d.key, ok: false, note: gate.reason }); continue; }
  console.log(`  ${d.key} (${it.id.slice(0, 8)}) "${it.title.slice(0, 40)}" — gate OK (${gate.reason})`);
  if (!APPLY) { results.push({ key: d.key, ok: true, note: "would delete (dry-run)" }); continue; }
  const del = await guardedDelete("intelligence_items", [it.id], { cite });
  // READ-BACK: confirm the row is GONE.
  const back = await sb.from("intelligence_items").select("id").eq("id", it.id).maybeSingle();
  const gone = !back.data;
  if (!gone) { console.log(`  ${d.key}: !!! READ-BACK FAILED — row still present after delete. HALT.`); process.exit(1); }
  console.log(`     deleted ${del.deleted}, read-back GONE ✓, snapshot ${del.snapshot}`);
  logRow([new Date().toISOString?.() || "2026-07-06", d.key, it.id, `"${it.title.replace(/·/g, "-").slice(0, 60)}"`, "DELETE", d.why, RULING, del.snapshot || "-"]);
  results.push({ key: d.key, ok: true, note: `deleted, read-back gone` });
}

// ── RECLASSIFY (g22 → source) ──
{
  const it = byKey.get(RECLASSIFY.key);
  if (!it) { console.log(`  ${RECLASSIFY.key}: NOT FOUND — skip`); }
  else {
    console.log(`  ${RECLASSIFY.key} (${it.id.slice(0, 8)}) "${it.title.slice(0, 40)}" — reclassify-to-source (host already registered; see divergence note)`);
    if (APPLY) {
      const rc = await reclassifyToSource(it.id, { url: it.source_url, name: "China CCICED (advisory council)", base_tier: RECLASSIFY.tier }, { cite });
      // READ-BACK: item archived + source active.
      const back = await sb.from("intelligence_items").select("is_archived,archive_reason").eq("id", it.id).maybeSingle();
      const src = await sb.from("sources").select("base_tier,status").eq("id", rc.source_id).maybeSingle();
      const okBack = back.data?.is_archived && back.data?.archive_reason === "reclassified_to_source" && src.data?.status === "active";
      if (!okBack) { console.log(`  ${RECLASSIFY.key}: !!! READ-BACK FAILED (archived=${back.data?.is_archived}, src=${src.data?.status}). HALT.`); process.exit(1); }
      console.log(`     reclassified → source ${rc.source_id.slice(0, 8)} (created=${rc.created}, tier=${src.data?.base_tier}, active), item archived ✓`);
      logRow([new Date().toISOString?.() || "2026-07-06", RECLASSIFY.key, it.id, `"${it.title.slice(0, 60)}"`, `RECLASSIFY→source(tier ${src.data?.base_tier})`, RECLASSIFY.why, RULING, rc.snapshot || "-"]);
      results.push({ key: RECLASSIFY.key, ok: true, note: `reclassified to source tier ${src.data?.base_tier} (ruled T4; host canonical differs)` });
    } else results.push({ key: RECLASSIFY.key, ok: true, note: "would reclassify (dry-run)" });
  }
}

console.log(`\n=== RESULT ===`);
for (const r of results) console.log(`  ${r.key}: ${r.ok ? "OK" : "SKIP"} — ${r.note}`);
if (APPLY) console.log(`\nlog: ${LOG}`);
process.exit(0);
