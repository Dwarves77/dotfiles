#!/usr/bin/env node
// id-stamp.mjs — PROMOTE a subject-matched item to id-confirmed (Lane B-grade) by STAMPING its canonical
// instrument_identifier, which is already verbatim in its staged primary, then RE-VERIFYING target-match.
// This is the 4ff5cf56 promotion pattern factored as a tool for the B-CANDIDATE lane. Verify-before-write:
// with --apply it stamps ONLY if the proposed id makes target-match MATCH via instrument-id or raw-id
// (clearance-grade). If it does not confirm, it REFUSES the stamp and prints REASSIGN-TO-A (the capture is
// suspect or the id is not this instrument, a judgment item, not mechanical). Runs under the item's mutation
// lease, which THIS holder must already hold (heartbeat check; no lease, no touch). Guarded write, no spend.
// Usage: node id-stamp.mjs <itemKey> <proposedId> <holder> [--apply]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
delete process.env.BROWSERLESS_API_KEY;
const [, , KEY, PROPOSED_ID, HOLDER] = process.argv;
const APPLY = process.argv.includes("--apply");
if (!KEY || !PROPOSED_ID || !HOLDER) { console.error("usage: id-stamp.mjs <itemKey> <proposedId> <holder> [--apply]"); process.exit(1); }
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll, guardedUpdate } = await jiti.import("../lib/db.mjs");
const { getSnapshot } = await jiti.import("../../src/lib/sources/snapshot-store.mjs");
const { verifyTargetMatch } = await jiti.import("../../src/lib/sources/target-match.mjs");
const { heartbeatLease } = await jiti.import("../lib/mutation-lease.mjs");
const sb = readClient();

const it = (await readAll("intelligence_items", "id,legacy_id,title,item_type,instrument_type,instrument_identifier,canonical_instrument_key,jurisdiction_iso,source_id,provenance_status", {}))
  .find((x) => x.id.startsWith(KEY) || (x.legacy_id || "") === KEY || (x.legacy_id || "").startsWith(KEY));
if (!it) { console.error(`item not found: ${KEY}`); process.exit(1); }

// Lease guard: this holder must already own the lease (acquired by the caller). No lease, no touch.
const held = await heartbeatLease(sb, it.id, HOLDER).catch(() => false);
if (!held) { console.error(`LEASE NOT HELD by "${HOLDER}" for ${it.id} — refusing to touch (mutation-lease H5)`); process.exit(2); }

// Assemble the item's staged primary capture: the raw_fetches snapshot first (what lane-split/probe used), then
// fall back to the >200ch pool rows so a pool-only staged item is still verifiable.
let capture = "";
try { const snap = await getSnapshot(sb, { sourceId: it.source_id }); if (snap.found && snap.content) capture = snap.content; } catch { /* no snapshot */ }
if (!capture) {
  const { data: pool } = await sb.from("agent_run_searches").select("result_content_excerpt").eq("intelligence_item_id", it.id);
  capture = (pool ?? []).map((r) => r.result_content_excerpt || "").filter((t) => t.length > 200).join("\n\n");
}
if (!capture) { console.error(`no staged capture for ${it.legacy_id || it.id.slice(0, 8)} — cannot verify; REASSIGN-TO-A`); process.exit(3); }

const base = { title: it.title, item_type: it.item_type, instrument_type: it.instrument_type, canonical_instrument_key: it.canonical_instrument_key, jurisdiction: it.jurisdiction_iso };
const before = verifyTargetMatch({ ...base, identifier: it.instrument_identifier }, capture);
const proposed = verifyTargetMatch({ ...base, identifier: PROPOSED_ID }, capture);
const idConfirmed = proposed.verdict === "match" && (proposed.via === "instrument-id" || proposed.via === "raw-id");

console.log(`\n===== ID-STAMP ${it.legacy_id || it.id.slice(0, 8)} (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`current id:   ${it.instrument_identifier ?? "(null)"}   verdict now: ${before.verdict}/${before.via} score=${before.score}`);
console.log(`proposed id:  ${PROPOSED_ID}   verdict with it: ${proposed.verdict}/${proposed.via} score=${proposed.score}${proposed.conflicting?.length ? ` conflicting=${proposed.conflicting.join(",")}` : ""}`);
console.log(`id-confirmed with proposed id: ${idConfirmed ? "YES (clearance-grade)" : "NO"}`);

if (!idConfirmed) {
  console.log(`REFUSE STAMP — proposed id does not id-confirm the staged capture. REASSIGN-TO-A (capture suspect or wrong instrument).`);
  process.exit(4);
}
if (!APPLY) { console.log(`DRY-RUN: would stamp instrument_identifier=${PROPOSED_ID} and promote to Lane B-grade. Re-run with --apply.`); process.exit(0); }

await guardedUpdate("intelligence_items", (qb) => qb.eq("id", it.id), { instrument_identifier: PROPOSED_ID },
  { cite: { skill: "source-credibility-model", reason: `id-stamp promotion (4ff5cf56 pattern): canonical instrument identifier ${PROPOSED_ID} verbatim-present in the item's staged primary → target-match id-confirmed (${proposed.via}); promotes subject-overlap to clearance-grade for the mechanical drain` } });

// Re-verify against the live row (read-back).
const after = (await readAll("intelligence_items", "id,instrument_identifier", {})).find((x) => x.id === it.id);
const post = verifyTargetMatch({ ...base, identifier: after.instrument_identifier }, capture);
console.log(`STAMPED. live instrument_identifier=${after.instrument_identifier}; re-verify: ${post.verdict}/${post.via} score=${post.score}`);
console.log(post.verdict === "match" && (post.via === "instrument-id" || post.via === "raw-id")
  ? `ID-CONFIRMED (read-back) — Lane B-grade. Next: drain-clear dry-run + slot injects.`
  : `WARN: read-back not id-confirmed — investigate before drain.`);
process.exit(0);
