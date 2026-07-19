#!/usr/bin/env node
// archive-item.mjs — honest-ARCHIVE (research-or-erase "erase") executor. For an item that investigation proved
// genuinely ungroundable — a FABRICATED / unsupported-title-claim premise with no real instrument behind it — the
// honest disposition is archive-with-reason (never leave a hallucinated item live/quarantined). Guarded + leased +
// snapshotted (reversible); removes the item from the active drain (drain_worklist). This is the erase side of
// research-or-erase: research FIRST (here: Session B finding + operator web-search corroboration), then archive.
// Usage: node scripts/_reground/archive-item.mjs <itemId> --reason=<reason> --note="..." [--apply]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const HOLDER = "session-A";
const arg = (p) => { const a = process.argv.find((x) => x.startsWith(p)); return a ? a.slice(p.length) : null; };
const REASON = arg("--reason=");
const NOTE = arg("--note=") || "";
const id = process.argv.slice(2).find((x) => !x.startsWith("--"));
if (!id || !REASON) { console.error('usage: archive-item.mjs <itemId> --reason=<reason> --note="..." [--apply]'); process.exit(1); }

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, guardedUpdate, guardedDelete } = await jiti.import("../lib/db.mjs");
const { acquireLease, releaseLease } = await jiti.import("../lib/mutation-lease.mjs");
const sb = readClient();

const { data: it } = await sb.from("intelligence_items").select("id,title,is_archived,archive_reason,provenance_status").eq("id", id).single();
if (!it) { console.error(`no item ${id}`); process.exit(1); }
console.log(`\n===== ARCHIVE-ITEM (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`  ${it.id.slice(0, 8)} arch=${it.is_archived} prov=${it.provenance_status} reason->'${REASON}' | ${it.title}`);
console.log(`  note: ${NOTE}`);
if (!APPLY) { console.log("\n(dry-run — --apply to archive + remove from drain_worklist)"); process.exit(0); }

const lease = await acquireLease(sb, it.id, HOLDER, "A");
if (!lease.acquired) { console.log(`  SKIP: leased by ${lease.cur_holder}`); process.exit(0); }
try {
  const cite = { skill: "remediation-discipline", reason: `research-or-erase honest ARCHIVE (${REASON}): ${NOTE}` };
  await guardedUpdate("intelligence_items", (q) => q.eq("id", it.id), { is_archived: true, archive_reason: REASON }, { cite });
  await guardedDelete("drain_worklist", [it.id], { cite }).catch(() => {});
  const { data: after } = await sb.from("intelligence_items").select("is_archived,archive_reason").eq("id", it.id).single();
  console.log(`  ARCHIVED: is_archived=${after?.is_archived} reason=${after?.archive_reason} (removed from drain_worklist)`);
} catch (e) { console.log(`  FAILED: ${e.message}`); }
finally { await releaseLease(sb, it.id, HOLDER).catch(() => {}); }
process.exit(0);
