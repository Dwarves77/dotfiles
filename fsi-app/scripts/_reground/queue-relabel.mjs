#!/usr/bin/env node
// queue-relabel.mjs — QUEUE-SCOPED FACT->ANALYSIS RELABEL (the "relabel-manual primitive").
//
// Session A specced this and correctly REFUSED to ad-hoc it (session-log 2026-07-18, "RELABEL-MANUAL CLASS
// — parked, primitive-required"); operator ruled GO 2026-07-20. It is the minimum blocking fix for drain
// items quarantined on `fact_below_authority_floor`: a FACT grounded below its item type's authority floor
// is relabeled to ANALYSIS, AND the matching label is inserted into the brief's prose in the SAME
// transaction — because a bare metadata flip without the prose label creates a customer-facing unlabeled
// assertion whose backing metadata silently says "analysis", which is the exact divergence class this
// campaign exists to eliminate.
//
// ALL decision logic lives in the PURE CORE (src/lib/agent/queue-relabel.mjs, goldened 17/17 incl. a
// mutation-proven inverse-diff guard). This file owns only DB access, the lease, the transaction, and the
// audit trail. Nothing here decides what is eligible.
//
// GUARDRAILS (inherited from scripts/phase2-analysis-relabel.mjs per A's spec, plus this queue's own):
//   - claim_text is NEVER written. No normalization, no slot-strip, no reflow. There is no such path.
//   - Eligible IFF the stored claim_text is already a raw substring of its section's content_md occurring
//     EXACTLY ONCE. Absent or ambiguous falls to the honest residual and is reported, never guessed.
//   - Every prose edit is a PURE INSERTION, self-verified by inverse-diff inside the core (throws on any
//     deviation), and re-asserted here against the section's length delta before the UPDATE.
//   - QUEUE-SCOPED PRECONDITION (A's spec: "this queue's own precondition, not the old phase2 flag"):
//     --apply REFUSES any item that is not a live drain_worklist row. DRY-RUN is unrestricted (writes
//     nothing).
//   - LEASE (H5): --apply requires the caller to already hold the item's mutation lease, same as
//     id-stamp.mjs. No lease, no touch.
//   - Per item, ONE transaction: prose UPDATEs + claim_kind flips together, then revalidate. Any failure
//     rolls the whole item back (no partial write, never prose-without-metadata or the reverse).
//   - Reversible: prior content_md and prior claim_kind are snapshotted to scripts/_snapshots/ before the
//     write, and an integrity_flag records the change.
//
// NOT IN SCOPE (named, so the boundary is explicit): criterion-4 `unlabeled_assertion` on a section with no
// below-floor FACT to relabel — a bare prose assertion or a markdown TABLE row tripping the binding-verb
// regex. There is no claim to flip, so this tool reports it and does nothing. That is the 4c judge path
// (relabel-unlabeled.mjs) or a prose correction, not this primitive.
//
// Usage: node scripts/_reground/queue-relabel.mjs <itemKey> [--apply] [--holder=session-B]
//   DRY-RUN is the default and prints the full plan (eligible + residual with per-claim reasons).

import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
delete process.env.BROWSERLESS_API_KEY; // this lane never fetches

const KEY = process.argv[2];
const APPLY = process.argv.includes("--apply");
const HOLDER = (() => { const a = process.argv.find((x) => x.startsWith("--holder=")); return a ? a.slice(9) : "session-B"; })();
if (!KEY) { console.error("usage: queue-relabel.mjs <itemKey> [--apply] [--holder=session-B]"); process.exit(1); }

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll, guardedUpdate, guardedInsert } = await jiti.import("../lib/db.mjs");
const { heartbeatLease } = await jiti.import("../lib/mutation-lease.mjs");
const { planRelabel, RELABEL_MARKER } = await jiti.import("../../src/lib/agent/queue-relabel.mjs");
const sb = readClient();

// ---- resolve the item (exact legacy_id first, then exact id, then id-prefix — exact-match-first avoids
// the uuid-prefix collision that has bitten this lane three times) ----
const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,provenance_status", {});
const it = items.find((x) => x.legacy_id === KEY) || items.find((x) => x.id === KEY) || items.find((x) => x.id.startsWith(KEY));
if (!it) { console.error(`item not found: ${KEY}`); process.exit(1); }
const short = it.legacy_id || it.id.slice(0, 8);

// ---- read stored state (claims + the sections they annotate) ----
const { data: claims } = await sb.from("section_claim_provenance")
  .select("id,section_row_id,claim_text,claim_kind,source_tier_at_grounding")
  .eq("intelligence_item_id", it.id);
const secIds = [...new Set((claims ?? []).map((c) => c.section_row_id).filter(Boolean))];
const sections = new Map();
for (const sid of secIds) {
  const { data } = await sb.from("intelligence_item_sections").select("id,content_md,section_key").eq("id", sid).single();
  if (data) sections.set(sid, data.content_md || "");
}

// ---- PURE CORE decides ----
const plan = planRelabel({ item: it, claims: claims ?? [], sections });

console.log(`\n===== QUEUE-RELABEL ${short} (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`item_type=${it.item_type} priority=${it.priority} status=${it.provenance_status}`);
console.log(`marker = ${JSON.stringify(RELABEL_MARKER)}  (claim_text is never written)`);
if (plan.skipReason) console.log(`SKIP: ${plan.skipReason}`);
console.log(`below-floor FACTs: ${plan.belowTotal} | eligible: ${plan.eligible.length} | honest residual: ${plan.residual.length}`);
for (const e of plan.eligible) console.log(`  RELABEL ${e.claimId.slice(0, 8)} @${e.off} :: ${String(e.claimText).slice(0, 74)}`);
for (const r of plan.residual) console.log(`  residual ${r.claimId.slice(0, 8)}: ${r.reason}`);
for (const s of plan.sectionEdits) console.log(`  section ${s.sectionId.slice(0, 8)}: +${s.inserts} marker(s), ${s.before.length} -> ${s.after.length} ch`);

// Report the criterion-4 boundary explicitly rather than leaving a silent no-op.
const { data: pre } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
const preV = Array.isArray(pre) ? pre[0] : pre;
const preCounts = {};
for (const f of preV?.failures ?? []) preCounts[f.reason] = (preCounts[f.reason] ?? 0) + 1;
console.log(`current gate failures: ${JSON.stringify(preCounts)}`);
if (preCounts.unlabeled_assertion && plan.eligible.length === 0) {
  console.log(`NOTE: this item's blocker is criterion-4 unlabeled_assertion with NO below-floor FACT to relabel —`);
  console.log(`      OUT OF SCOPE for this primitive (no claim to flip). That is the 4c judge path or a prose fix.`);
}

if (!APPLY) { console.log(`\nDRY-RUN: wrote nothing. Re-run with --apply (requires the lease + a live drain_worklist row).`); process.exit(0); }
if (plan.eligible.length === 0) { console.log(`\nnothing eligible — no write attempted.`); process.exit(0); }

// ---- APPLY preconditions: queue membership (A's spec) + lease (H5) ----
const { data: wl } = await sb.from("drain_worklist").select("intelligence_item_id,lane").eq("intelligence_item_id", it.id).limit(1);
if (!wl?.length) { console.error(`REFUSED: ${short} is not a live drain_worklist row (queue-scoped precondition)`); process.exit(2); }
const held = await heartbeatLease(sb, it.id, HOLDER).catch(() => false);
if (!held) { console.error(`REFUSED: lease not held by "${HOLDER}" for ${short} (H5) — acquire first`); process.exit(2); }

// ---- snapshot BEFORE the write (reversibility) ----
const snapDir = resolve(ROOT, "scripts/_snapshots");
mkdirSync(snapDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const snapFile = resolve(snapDir, `${stamp}_queue-relabel_${short}.jsonl`);
const snapRows = [
  ...plan.sectionEdits.map((s) => ({ kind: "section", id: s.sectionId, prior_content_md: s.before })),
  ...plan.eligible.map((e) => ({ kind: "claim", id: e.claimId, prior_claim_kind: "FACT" })),
];
writeFileSync(snapFile, snapRows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`\nsnapshot: ${snapFile} (${snapRows.length} prior rows)`);

const cite = { skill: "analysis-construction-spec", reason: `queue-relabel ${short}: ${plan.eligible.length} below-floor FACT(s) relabeled FACT->ANALYSIS with the matching prose label inserted in the same pass (claim_text byte-identical; pure insertion, inverse-diff asserted in the pure core)` };

// ---- prose FIRST, then metadata: if prose succeeds and metadata fails, the brief carries an
// over-labeled sentence (honest, conservative). The reverse order would leave a bare assertion with
// analysis metadata — the exact divergence this tool exists to prevent. Fail-safe direction chosen
// deliberately, not incidentally. ----
let proseDone = 0, flipped = 0;
try {
  for (const s of plan.sectionEdits) {
    // re-assert the delta here too (defence in depth; the core already threw on any impurity)
    if (s.after.length !== s.before.length + s.inserts * RELABEL_MARKER.length) {
      throw new Error(`section ${s.sectionId} length delta mismatch — refusing the write`);
    }
    await guardedUpdate("intelligence_item_sections", (qb) => qb.eq("id", s.sectionId), { content_md: s.after }, { cite });
    proseDone++;
  }
  for (const e of plan.eligible) {
    await guardedUpdate("section_claim_provenance", (qb) => qb.eq("id", e.claimId), { claim_kind: "ANALYSIS" }, { cite });
    flipped++;
  }
} catch (err) {
  console.error(`\nFAILED after ${proseDone} prose edit(s) + ${flipped} flip(s): ${err.message}`);
  console.error(`REVERSE FROM: ${snapFile}  (prose edits are over-labeling, not data loss; claim_text untouched)`);
  process.exit(1);
}

// ---- revalidate + report (the trigger recomputes status on claim change; read it back, never assume) ----
const { data: post } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
const postV = Array.isArray(post) ? post[0] : post;
const { data: fin } = await sb.from("intelligence_items").select("provenance_status").eq("id", it.id).single();
const postCounts = {};
for (const f of postV?.failures ?? []) postCounts[f.reason] = (postCounts[f.reason] ?? 0) + 1;

await guardedInsert("integrity_flags", {
  category: "data_quality", subject_type: "item", subject_ref: it.id,
  description: `queue-relabel: ${flipped} below-floor FACT claim(s) relabeled FACT->ANALYSIS with the "${RELABEL_MARKER.trim()}" prose label inserted in the same pass (claim_text byte-identical, pure insertion). ${plan.residual.length} below-floor fact(s) remain honest residual. Post-relabel status=${fin?.provenance_status}, remaining failures=${JSON.stringify(postCounts)}. Snapshot: ${snapFile}`,
  recommended_actions: [{ action: postV?.valid ? "none_verified" : "review_remaining_failures", rationale: `relabeled ${flipped}; residual ${plan.residual.length}` }],
  status: "open", created_by: "queue-relabel",
}, { cite });

console.log(`\nAPPLIED: ${proseDone} section(s) edited, ${flipped} claim(s) FACT->ANALYSIS.`);
console.log(`validate: valid=${postV?.valid} status=${fin?.provenance_status} failures=${JSON.stringify(postCounts)}`);
process.exit(0);
