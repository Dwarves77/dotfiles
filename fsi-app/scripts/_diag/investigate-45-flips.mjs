/** READ-ONLY recoverability investigation for the redo's verified->quarantined flips.
 *  Loads the redo-prior snapshots (prior full intelligence_items rows incl. provenance_status),
 *  dedups by id keeping the EARLIEST prior (true pre-redo original), then for each item reads the
 *  CURRENT live state: provenance_status, section count, FACT/GAP/total claim counts, and whether the
 *  brief content + regeneration stamp were overwritten by the redo. Classifies each flip so the
 *  recovery strategy (restore-only vs restore+re-ground) is chosen on DATA, not assumption.
 *  Pure reads. Writes a flip-set id list to _diag for the recovery step (a file, not the DB). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { readAll, readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

// ── load snapshots, dedup by id keeping earliest prior (by ts) ──────────────
const snapDir = resolve(ROOT, "scripts/_snapshots");
const files = readdirSync(snapDir).filter((f) => f.startsWith("redo-prior-") && f.endsWith(".jsonl")).sort();
const priorById = new Map();
for (const f of files) {
  for (const line of readFileSync(resolve(snapDir, f), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const { ts, prior } = JSON.parse(line);
    if (!prior?.id) continue;
    const ex = priorById.get(prior.id);
    if (!ex || ts < ex.ts) priorById.set(prior.id, { ts, prior });
  }
}
const ids = [...priorById.keys()];
console.log(`Snapshots: ${files.length} files, ${ids.length} distinct items.`);

// ── current live rows ───────────────────────────────────────────────────────
const sb = readClient();
const curRows = [];
for (let i = 0; i < ids.length; i += 100) {
  const { data, error } = await sb.from("intelligence_items")
    .select("id,legacy_id,item_type,provenance_status,full_brief,regeneration_skill_version,last_regenerated_at")
    .in("id", ids.slice(i, i + 100));
  if (error) throw new Error(error.message);
  curRows.push(...(data || []));
}
const curById = new Map(curRows.map((r) => [r.id, r]));

// ── section + claim counts (batch) ──────────────────────────────────────────
const secCount = new Map(), factCount = new Map(), gapCount = new Map(), otherClaim = new Map();
for (let i = 0; i < ids.length; i += 100) {
  const slice = ids.slice(i, i + 100);
  const { data: secs } = await sb.from("intelligence_item_sections").select("item_id,content_md").in("item_id", slice);
  for (const s of secs || []) if ((s.content_md || "").trim()) secCount.set(s.item_id, (secCount.get(s.item_id) || 0) + 1);
  const { data: claims } = await sb.from("section_claim_provenance").select("intelligence_item_id,claim_kind").in("intelligence_item_id", slice);
  for (const c of claims || []) {
    const m = c.claim_kind === "FACT" ? factCount : c.claim_kind === "GAP" ? gapCount : otherClaim;
    m.set(c.intelligence_item_id, (m.get(c.intelligence_item_id) || 0) + 1);
  }
}

// ── classify ────────────────────────────────────────────────────────────────
const rows = [];
for (const id of ids) {
  const { prior } = priorById.get(id);
  const cur = curById.get(id);
  if (!cur) { rows.push({ id, key: prior.legacy_id || id.slice(0, 8), type: prior.item_type, note: "MISSING_LIVE_ROW" }); continue; }
  const briefOverwritten = (prior.full_brief || "") !== (cur.full_brief || "");
  rows.push({
    id, key: prior.legacy_id || id.slice(0, 8), type: cur.item_type,
    prior_prov: prior.provenance_status, cur_prov: cur.provenance_status,
    sec: secCount.get(id) || 0, fact: factCount.get(id) || 0, gap: gapCount.get(id) || 0, oth: otherClaim.get(id) || 0,
    briefOverwritten, prior_brief_len: (prior.full_brief || "").length, cur_brief_len: (cur.full_brief || "").length,
    prior_ver: prior.regeneration_skill_version, cur_ver: cur.regeneration_skill_version,
  });
}

const flips = rows.filter((r) => r.prior_prov === "verified" && r.cur_prov === "quarantined");
const recovered = rows.filter((r) => r.prior_prov === "quarantined" && r.cur_prov === "verified");
const heldV = rows.filter((r) => r.prior_prov === "verified" && r.cur_prov === "verified");
const heldQ = rows.filter((r) => r.prior_prov === "quarantined" && r.cur_prov === "quarantined");

console.log(`\n=== TRANSITION MATRIX (prior -> current) ===`);
console.log(`  verified  -> quarantined : ${flips.length}   (THE REGRESSION)`);
console.log(`  quarantined -> verified  : ${recovered.length}`);
console.log(`  verified  -> verified    : ${heldV.length}`);
console.log(`  quarantined -> quarantined: ${heldQ.length}`);
const otherT = rows.length - flips.length - recovered.length - heldV.length - heldQ.length;
console.log(`  other/missing            : ${otherT}`);

console.log(`\n=== THE ${flips.length} FLIPS — recoverability detail ===`);
console.log(`key              type          sec fact gap oth  briefOverwritten  prior_ver -> cur_ver`);
for (const r of flips.sort((a, b) => a.type.localeCompare(b.type))) {
  console.log(`${r.key.padEnd(16)} ${String(r.type).padEnd(13)} ${String(r.sec).padStart(3)} ${String(r.fact).padStart(4)} ${String(r.gap).padStart(3)} ${String(r.oth).padStart(3)}   ${r.briefOverwritten ? "YES" : "no "}              ${String(r.prior_ver||"").slice(0,10)} -> ${String(r.cur_ver||"").slice(0,10)}`);
}

// flip breakdown by type + by current-ledger shape
const byType = {}; for (const r of flips) byType[r.type] = (byType[r.type] || 0) + 1;
console.log(`\nflips by item_type: ${JSON.stringify(byType)}`);
const emptyLedger = flips.filter((r) => r.fact === 0 && r.gap === 0).length;
const briefOW = flips.filter((r) => r.briefOverwritten).length;
console.log(`flips with EMPTY current ledger (0 FACT + 0 GAP): ${emptyLedger}/${flips.length}`);
console.log(`flips whose brief was OVERWRITTEN by the redo:     ${briefOW}/${flips.length}`);

writeFileSync(resolve(ROOT, "scripts/_diag/_flip-ids.json"),
  JSON.stringify(flips.map((r) => ({ id: r.id, key: r.key, type: r.type })), null, 1));
console.log(`\nWrote ${flips.length} flip ids -> scripts/_diag/_flip-ids.json (READ ONLY; no DB writes).`);
