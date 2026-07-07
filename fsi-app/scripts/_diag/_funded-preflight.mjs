// READ-ONLY funded-pass preflight probe (item 8 investigation-first). Establishes LIVE ground truth for:
//  1. the dedup pair keys (d5ee6ab8, 9c5d1d17) + survivor f0833999 — status/archived/title + any durable
//     dedup-loser marker (integrity_flags) — because a stale snapshot shows 9c5d1d17 = VERIFIED (NOT a loser).
//  2. the batch-1 items (782878c0, f0833999, c8, l1, 7a0ead55) — resolve keys, status, type, failure classes.
//  3. program total (paginated agent_runs sum) — the real seeded-ceiling base.
//  4. quarantined census. ZERO writes.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();

const KEYS = ["d5ee6ab8", "9c5d1d17", "f0833999", "782878c0", "c8", "l1", "7a0ead55", "03b5f234"];
const items = await readAll("intelligence_items",
  "id,legacy_id,title,item_type,priority,provenance_status,is_archived,replaced_by,source_url");
const resolveKey = (k) => items.find((x) => x.legacy_id === k || x.id.slice(0, 8) === k);

console.log("\n===== KEY ITEMS (live) =====");
const resolvedIds = {};
for (const k of KEYS) {
  const it = resolveKey(k);
  if (!it) { console.log(`  ${k.padEnd(12)} — NOT FOUND (no legacy_id or id-prefix match among non-... )`); continue; }
  resolvedIds[k] = it.id;
  console.log(`  ${k.padEnd(12)} id=${it.id.slice(0, 8)} arch=${it.is_archived} status=${(it.provenance_status || "null").padEnd(11)} type=${(it.item_type || "?").padEnd(13)} pri=${it.priority || "?"} replaced_by=${it.replaced_by ? it.replaced_by.slice(0, 8) : "-"}`);
  console.log(`               title="${(it.title || "").slice(0, 78)}"`);
  console.log(`               url=${(it.source_url || "").slice(0, 90)}`);
}

// failure classes for each resolved key
console.log("\n===== FAILURE CLASSES (validate_item_provenance) =====");
for (const [k, id] of Object.entries(resolvedIds)) {
  const { data } = await sb.rpc("validate_item_provenance", { p_item_id: id });
  const r = Array.isArray(data) ? data[0] : data;
  const reasons = [...new Set((r?.failures || []).map((f) => f.reason))];
  console.log(`  ${k.padEnd(12)} valid=${!!r?.valid} [${reasons.join(", ") || "CLEAR"}]`);
}

// any durable dedup-loser / disposition markers on the pair keys?
console.log("\n===== INTEGRITY FLAGS on d5ee6ab8 / 9c5d1d17 / f0833999 (open + resolved) =====");
for (const k of ["d5ee6ab8", "9c5d1d17", "f0833999"]) {
  const id = resolvedIds[k];
  if (!id) continue;
  const { data: flags } = await sb.from("integrity_flags").select("id,category,status,created_by,description,recommended_actions,created_at").eq("subject_type", "item").eq("subject_ref", id);
  console.log(`  --- ${k} (${(flags || []).length} flags) ---`);
  for (const f of flags || []) {
    console.log(`     [${f.status}] by=${f.created_by} cat=${f.category} @${String(f.created_at).slice(0, 10)}: ${(f.description || "").slice(0, 90)}`);
    if (f.recommended_actions) console.log(`         RA=${JSON.stringify(f.recommended_actions).slice(0, 160)}`);
  }
}

// program total (paginated) + quarantine census
let total = 0, rows = 0, offset = 0;
for (;;) {
  const { data } = await sb.from("agent_runs").select("cost_usd_estimated").order("id").range(offset, offset + 999);
  if (!data || !data.length) break;
  for (const r of data) total += Number(r.cost_usd_estimated) || 0;
  rows += data.length;
  if (data.length < 1000) break;
  offset += 1000;
}
console.log(`\n===== PROGRAM TOTAL (paginated) =====\n  agent_runs rows=${rows} sum=$${total.toFixed(4)}`);

const cens = {};
for (const it of items) if (!it.is_archived) cens[it.provenance_status || "null"] = (cens[it.provenance_status || "null"] || 0) + 1;
console.log(`\n===== NON-ARCHIVED CENSUS =====\n  ${JSON.stringify(cens)}`);
process.exit(0);
