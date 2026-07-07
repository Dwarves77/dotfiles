/** E2: archive the 8 operator-confirmed destructive archives (4 dup-of-verified + 4 off-vertical), one at a
 *  time, each snapshotted via the guarded helper. Reasons are NON-source-y (migration-135 guard only blocks
 *  source-y reasons that require registration). GOVERNING: remediation-discipline (RD-4 research-or-erase). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll, guardedUpdate } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const sb = readClient();

const cite = { skill: "remediation-discipline", reason: "E2 research-or-erase: operator-confirmed item-by-item archive (dup-of-verified / off-vertical sweep artifact)" };
const nowIso = new globalThis.Date().toISOString();

const DUP = [ // [key, verified-twin]
  ["31b18416", "c54cd5f2"], ["6627ef8b", "88a2918c"],
  ["mit-climatemachine-live-music-freight-emissions-research", "88c3a053"], ["g10", "r29"],
];
const OFFVERT = ["2c45cae1", "6662ebeb", "eb08d16c", "edb9b138"];

const items = await readAll("intelligence_items", "id,legacy_id,title,provenance_status,is_archived");
const byKey = new Map(); for (const it of items) { byKey.set(it.legacy_id, it); byKey.set(it.id.slice(0, 8), it); }

async function archiveOne(key, reason, note) {
  const it = byKey.get(key);
  if (!it) { console.log(`  [${key}] NOT FOUND — skipped`); return false; }
  if (it.is_archived) { console.log(`  [${key}] already archived — skipped`); return false; }
  const res = await guardedUpdate("intelligence_items", (qb) => qb.eq("id", it.id),
    { is_archived: true, archive_reason: reason, archived_date: nowIso, archive_note: note },
    { cite });
  console.log(`  [${key}] ARCHIVED (${reason}) "${(it.title || "").slice(0, 50)}"`);
  console.log(`     note: ${note}`);
  console.log(`     snapshot: ${res.snapshot}`);
  return res.updated === 1;
}

console.log(`\n===== E2 — 8 CONFIRMED ARCHIVES (one at a time, snapshotted) =====`);
let n = 0;
console.log(`\n── DUP-ARCHIVE (4) — verified twin stays ──`);
for (const [key, twin] of DUP) if (await archiveOne(key, "duplicate_of_verified", `duplicate of verified item ${twin}; twin retained as canonical copy`)) n++;
console.log(`\n── OFF-VERTICAL ARCHIVE (4) ──`);
for (const key of OFFVERT) if (await archiveOne(key, "off_vertical", `off the freight-sustainability vertical; fail-close sweep artifact (priority stamp not a keep-signal)`)) n++;

console.log(`\nDONE: ${n}/8 archived. Reconcile target: 8 archives + 2 source-reclass (r17/r24) = 10 items exited quarantine; 57 keep + 2 regs remain for Phase 3.`);
process.exit(0);
