/**
 * Lane-#4 disposition execution — STEP 2 (resolve-now: 2 register-as-source + 1 delete) + STEP 3
 * (5 fresh valid deferrals for the Q2-held research_finding items). GOVERNING SKILL: remediation-discipline
 * (Section 2.1 research-or-erase; Section 2.2 deferred-vs-undispositioned). Per Jason's per-class rulings
 * 2026-07-03. All writes go through the guarded path (snapshot + cite; reversible). READ-ONLY dry-run
 * unless --apply. Step 1 dedup deletes are HELD (survivor must primary-ground first); step 4 re-grounds
 * are quote-gated and NOT here.
 */
import { readAll, reclassifyToSource, guardedDelete, guardedInsert, readClient } from "./lib/db.mjs";
import { assertValidDeferral } from "./lib/deferral.mjs";

process.loadEnvFile(".env.local");
const APPLY = process.argv.includes("--apply");

const CITE = { skill: "remediation-discipline", reason: "Lane-#4 per-class disposition (Jason ruling 2026-07-03): register-as-source portals, delete off-vertical, fresh valid deferral for Q2-held research_finding" };

// resolve short prefixes -> full ids
const idRows = await readAll("intelligence_items", "id");
const idOf = (p) => { const r = idRows.find((x) => x.id.startsWith(p)); if (!r) throw new Error(`no item id for ${p}`); return r.id; };

const REGISTER = [
  { p: "496340f0", url: "https://iowadot.gov/transportation-development/systems-planning/areas-planning/freight", name: "Iowa DOT — Freight Planning & Transportation Systems", base_tier: 4 },
  { p: "67434312", url: "https://codot.gov/programs/environmental/greenhousegas", name: "Colorado DOT — Environmental Programs", base_tier: 4 },
];
const DELETE_OFF_VERTICAL = ["f41fd969"]; // Kansas police-memorial event, off-vertical mis-ingest
const Q2_HELD = ["388b2ce8", "85a7a629", "abd29144", "b2193d25", "b6fd00bf"];

// Deferral clock: a bounded FUTURE horizon so it does not create a near-term second cohort; the real
// blocker is the named resolution_event (calibration merge), and expiry self-resurrects (anti-silence).
const until = new Date();
until.setUTCDate(until.getUTCDate() + 120);
const DEFERRED_UNTIL = until.toISOString();
const deferralPayload = {
  reason: "Blocked on the Q2 research/tech slot-calibration spec: the quarantine resolver (regen-quarantined.mjs HOLD_TYPES) excludes research_finding until the calibrated slots land; awaits re-ground once that calibration merges.",
  deferred_until: DEFERRED_UNTIL,
  owner: "Jason",
  resolution_event: "Q2 research/tech slot-calibration spec merged",
};
assertValidDeferral(deferralPayload); // fail loud if the payload would not pass the read-side check

console.log(`MODE: ${APPLY ? "APPLY" : "DRY-RUN"}  | deferred_until=${DEFERRED_UNTIL}`);
console.log(`register=${REGISTER.length} delete=${DELETE_OFF_VERTICAL.length} deferrals=${Q2_HELD.length}`);
if (!APPLY) { console.log("\nDRY-RUN — pass --apply to execute."); process.exit(0); }

const results = { registered: [], deleted: [], deferred: [], errors: [] };

for (const r of REGISTER) {
  try {
    const id = idOf(r.p);
    const out = await reclassifyToSource(id, { url: r.url, name: r.name, base_tier: r.base_tier }, { cite: CITE });
    results.registered.push({ p: r.p, source_id: out.source_id, created: out.created, host: out.host, archived: out.archived });
    console.log(`  ✔ register ${r.p} → source ${out.source_id} (${out.host}, created=${out.created}); item archived=${out.archived}`);
  } catch (e) { results.errors.push(`register ${r.p}: ${e.message}`); console.error(`  ✗ register ${r.p}: ${e.message}`); }
}

for (const p of DELETE_OFF_VERTICAL) {
  try {
    const id = idOf(p);
    const out = await guardedDelete("intelligence_items", [id], { cite: { ...CITE, reason: "Lane-#4 delete off-vertical mis-ingest (Kansas police-memorial event); no-archive-during-build → keep-or-delete" } });
    results.deleted.push({ p, deleted: out.deleted, snapshot: out.snapshot });
    console.log(`  ✔ delete ${p} → deleted=${out.deleted} (snapshot ${out.snapshot})`);
  } catch (e) { results.errors.push(`delete ${p}: ${e.message}`); console.error(`  ✗ delete ${p}: ${e.message}`); }
}

for (const p of Q2_HELD) {
  try {
    const id = idOf(p);
    const row = {
      subject_type: "item",
      subject_ref: id,
      category: "data_quality",
      created_by: "disposition_deferred",
      status: "open",
      description: "Lane-#4 fresh valid deferral: research_finding held by the Q2 research/tech slot-calibration gate (resolver HOLD_TYPES). Standing until the calibration lands; self-resurrects on expiry.",
      recommended_actions: [{ deferral: deferralPayload }],
    };
    const out = await guardedInsert("integrity_flags", row, { cite: CITE });
    results.deferred.push({ p, flag_id: out.inserted?.id });
    console.log(`  ✔ deferral ${p} → flag ${out.inserted?.id}`);
  } catch (e) { results.errors.push(`deferral ${p}: ${e.message}`); console.error(`  ✗ deferral ${p}: ${e.message}`); }
}

// READ-BACK VERIFICATION
console.log("\n=== READ-BACK ===");
const sb = readClient();
for (const r of REGISTER) {
  const { data } = await sb.from("intelligence_items").select("is_archived, archive_reason").eq("id", idOf(r.p)).single();
  console.log(`  ${r.p}: is_archived=${data?.is_archived} archive_reason=${data?.archive_reason} (expect true / reclassified_to_source)`);
}
for (const p of DELETE_OFF_VERTICAL) {
  const { data } = await sb.from("intelligence_items").select("id").eq("id", idOf(p)).maybeSingle();
  console.log(`  ${p}: row ${data ? "STILL PRESENT (unexpected)" : "gone (deleted)"}`);
}
for (const p of Q2_HELD) {
  const { data } = await sb.from("integrity_flags").select("id,status,created_by").eq("subject_ref", idOf(p)).eq("created_by", "disposition_deferred").eq("status", "open");
  console.log(`  ${p}: open disposition_deferred flags = ${data?.length ?? 0}`);
}
console.log(`\nDONE. registered=${results.registered.length} deleted=${results.deleted.length} deferred=${results.deferred.length} errors=${results.errors.length}`);
if (results.errors.length) { for (const e of results.errors) console.error(`  ! ${e}`); process.exit(1); }
