/** E2: record a VALID 14-day Lane-#4 deferral on the 59 keep+reg items genuinely blocked on the
 *  network-stable Phase 3 grounding lane. Reconciles the LIVE undispositioned set against the expected
 *  57 keep + 2 regs and REFUSES to write on any mismatch (never blanket-defer an unexpected item).
 *  GOVERNING: remediation-discipline (deferral = dispositioning-as-blocked, never silencing). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { readClient, readAll } from "../lib/db.mjs";
import { assertValidDeferral } from "../lib/deferral.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const sb = readClient();

const KEEP_KEYS = [
  "007f42b1","g27","0f70a032","319f785d","3373d06e","45006684","496340f0","4c81cebd","50ccd5cc","54b1082b",
  "5511a87f","t7","5fc45237","5fec12c6","605a2d06","sustainable-aviation-fuel-saf-production-pricing","646dda2d",
  "652b39e1","67434312","67c6e313","6f1e6615","solar-battery-energy-storage-for-warehouses","7227b685","74a54415",
  "77b2b073","r25","7d5bd5a1","r30","85a7a629","878294c8","l9","g30","r6",
  "uk-streamlined-energy-and-carbon-reporting-secr-amendment","9118aab6","924731b1","974550f4","a7d9bc29","ab362011",
  "eu-battery-regulation-2023-1542","b040b08c","g25","b3b32236","g16","c0eab829","r3","a1","d012bc20",
  "industrial-electricity-tariff-benchmarks-by-jurisdiction","db8577c6","de368414","de7f09fc","g28","e5c17fac",
  "f3510df3","f41fd969","fc7cdcd7",
];
const REG_KEYS = ["india-s-national-logistics-policy-carbon-intensity-standards", "japan-green-transformation-gx-freight-transport-standards"];

const BOUND = 14 * 24 * 3600 * 1000;
const now = new globalThis.Date();
const nowMs = now.getTime();

// ── live undispositioned past-bound set (mirror the audit) ──
const items = await readAll("intelligence_items", "id,legacy_id,title,item_type", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined") });
const flags = await readAll("integrity_flags", "subject_ref,created_at,status,created_by", { match: (q) => q.eq("subject_type", "item").eq("status", "open") });
const earliest = new Map(); for (const f of flags) { const ex = earliest.get(f.subject_ref); if (!ex || f.created_at < ex) earliest.set(f.subject_ref, f.created_at); }
const alreadyDeferred = new Set(flags.filter((f) => f.created_by === "disposition_deferred").map((f) => f.subject_ref));
const undisp = items.filter((it) => { const t = earliest.get(it.id); return t && (nowMs - new globalThis.Date(t).getTime()) > BOUND && !alreadyDeferred.has(it.id); });

// ── expected set ──
const byKey = new Map(); for (const it of items) { byKey.set(it.legacy_id, it); byKey.set(it.id.slice(0, 8), it); }
const expected = [...KEEP_KEYS, ...REG_KEYS].map((k) => byKey.get(k)).filter(Boolean);
const expectedIds = new Set(expected.map((it) => it.id));
const undispIds = new Set(undisp.map((it) => it.id));

console.log(`\n===== E2 DEFER-59 RECONCILE (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`live undispositioned past-bound: ${undisp.length} | expected (57 keep + 2 regs): ${expected.length}`);
const missingFromExpected = [...undispIds].filter((id) => !expectedIds.has(id)).map((id) => items.find((x) => x.id === id));
const missingFromLive = [...expectedIds].filter((id) => !undispIds.has(id)).map((id) => expected.find((x) => x.id === id));
if (missingFromExpected.length) console.log(`\n!! IN LIVE-UNDISPOSITIONED BUT NOT EXPECTED (${missingFromExpected.length}): ${missingFromExpected.map((it) => it.legacy_id || it.id.slice(0, 8)).join(", ")}`);
if (missingFromLive.length) console.log(`\n!! EXPECTED BUT NOT IN LIVE-UNDISPOSITIONED (${missingFromLive.length}): ${missingFromLive.map((it) => it.legacy_id || it.id.slice(0, 8)).join(", ")}`);
if (missingFromExpected.length || missingFromLive.length) {
  console.log(`\nRECONCILE MISMATCH — refusing to write deferrals. Resolve the diff above first.`);
  process.exit(1);
}
console.log(`RECONCILE OK: live undispositioned == expected 59 (57 keep + 2 regs). Proceeding.`);

// ── the deferral payload (per item) ──
const deferredUntil = new globalThis.Date(nowMs + BOUND).toISOString();
function payloadFor(it) {
  const isReg = REG_KEYS.includes(it.legacy_id);
  const path = isReg
    ? "phase2-reground.mjs (re-source vs primary) then phase2-analysis-relabel.mjs (1A-relabel secondary residue; slot-bound facts -> counsel hold)"
    : "e2-phase3-ground.mjs --apply (ground from stored pool / generate)";
  return {
    reason: `Blocked on the network-stable generation lane: Anthropic/Browserless outbound is unavailable in the sandbox, so grounding cannot run here. Item is triaged keep-${isReg ? "ground/relabel" : "ground"}; awaits the ${isReg ? "reground+relabel" : "generate/reground"} pass on a network-stable lane.`,
    deferred_until: deferredUntil,
    owner: "operator (Jason)",
    resolution_event: `E2 Phase 3 grounding on the network-stable lane: ${path}`,
  };
}

// validate every payload BEFORE any write
for (const it of expected) assertValidDeferral(payloadFor(it), now);
console.log(`all ${expected.length} deferral payloads valid (assertValidDeferral passed).`);

if (!APPLY) { console.log(`\nDRY-RUN — wrote nothing. Pass --apply to record the 59 deferrals.`); process.exit(0); }

// ── write one disposition_deferred flag per item; record ids for reversibility ──
const insertedIds = [];
for (const it of expected) {
  const pl = payloadFor(it);
  const { data, error } = await sb.from("integrity_flags").insert({
    category: "data_quality", subject_type: "item", subject_ref: it.id, status: "open", created_by: "disposition_deferred",
    description: `Lane-#4 deferral (14d): blocked on the network-stable Phase 3 grounding lane. Resolves via the grounding pass; self-resurrects as undispositioned if not run by ${deferredUntil.slice(0, 10)}.`,
    recommended_actions: [{ deferral: pl }],
  }).select("id").single();
  if (error) { console.log(`  [${it.legacy_id || it.id.slice(0, 8)}] INSERT FAILED: ${error.message}`); continue; }
  insertedIds.push(data.id);
  console.log(`  [${(it.legacy_id || it.id.slice(0, 8)).padEnd(48)}] deferred -> ${deferredUntil.slice(0, 10)}`);
}
const snapDir = resolve(ROOT, "scripts/_snapshots"); mkdirSync(snapDir, { recursive: true });
const snapFile = resolve(snapDir, `e2-defer59-${nowMs}.json`);
writeFileSync(snapFile, JSON.stringify({ reversal: "delete integrity_flags where id in inserted_flag_ids", inserted_flag_ids: insertedIds }, null, 2));
console.log(`\nDONE: ${insertedIds.length} deferrals written. Reversal snapshot: ${snapFile}`);
console.log(`(delete the listed flag ids to undo; expired deferrals self-resurrect after ${deferredUntil.slice(0, 10)}.)`);
process.exit(0);
