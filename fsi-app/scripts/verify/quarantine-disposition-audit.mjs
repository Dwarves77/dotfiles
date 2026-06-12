/** VERIFIER (read-only, 0 Browserless): RESEARCH-OR-ERASE / QUARANTINE-DISPOSITION INVARIANT over
 *  live data.
 *  GOVERNING SKILLS: remediation-discipline (§2/§4 — research-or-erase; quarantine is an OPEN
 *  INVESTIGATION, never a terminal state; classify-before-discard) + environmental-policy-and-innovation
 *  (The Integrity Rule — no ungrounded/fabricated brief persisted; omit-with-note / honest archive).
 *
 *  INVARIANT (the mechanical form of "a quarantined item has to be investigated"):
 *    (a) ENQUEUE — every live-quarantined item carries an OPEN investigation record (the
 *        set_provenance_status trigger's data_quality integrity_flag). No flag = it was quarantined
 *        without being enqueued for research-or-erase = violation.
 *    (b) DWELL  — no live-quarantined item may sit past DWELL_BOUND_DAYS without a recorded disposition.
 *        A disposition REMOVES the item from the live-quarantined set: recovered (-> provenance verified),
 *        archived / registered / erased (-> is_archived). So "sitting" == still (provenance='quarantined'
 *        AND is_archived=false) past the bound. That is the forbidden permanent-quarantine.
 *
 *  This is the live-data enforcement of audit #1 (research-or-erase) — the half that was documented but
 *  never wired (docs/FULL-CODEBASE-AUDIT-2026-06-06.md §2). The resolver is scripts/regen-quarantined.mjs
 *  (research -> re-ground -> recover, else honest archive/register). This audit is the truth-teller that
 *  the resolver must drive to zero; it CANNOT be skipped because it is a registered invariant
 *  (governance/invariants.mjs) the meta-gate requires to stay wired.
 *
 *  Exit 0 = invariant holds (no item enqueued-missing or past-bound). Exit 1 = violations (gates in
 *  CI-with-secrets / ops run; pre-push has no DB secrets so it validates wiring via the meta-gate, not
 *  this live run). Reads only. Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 *  TUNABLE (operator policy): DWELL_BOUND_DAYS — the research-or-erase SLA. Tighten/loosen as the
 *  disposition throughput is known. Default 14 (two weeks to research-or-dispose an item). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may be pre-loaded in CI */ }

const DWELL_BOUND_DAYS = 14;
const BOUND_MS = DWELL_BOUND_DAYS * 24 * 60 * 60 * 1000;
const nowMs = () => new globalThis.Date().getTime();

let items, flags;
try {
  // currently-quarantined, live (not archived). PAGINATED (capped .in/.limit silently truncates >1000).
  items = await readAll("intelligence_items", "id,legacy_id,title,item_type,provenance_status,updated_at", {
    match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined"),
  });
  // the open investigation records (the enqueue + dwell clock).
  flags = await readAll("integrity_flags", "subject_ref,created_at,status,created_by,category", {
    match: (q) => q.eq("subject_type", "item").eq("status", "open"),
  });
} catch (e) { console.error(`quarantine-disposition-audit: read failed: ${e.message}`); process.exit(2); }

// earliest open flag per item = dwell clock
const enqueuedAt = new Map();
for (const f of flags || []) {
  const t = new globalThis.Date(f.created_at).getTime();
  const ex = enqueuedAt.get(f.subject_ref);
  if (ex === undefined || t < ex) enqueuedAt.set(f.subject_ref, t);
}

const enqueueMissing = [];
const pastBound = [];
const withinBound = [];
for (const it of items || []) {
  const at = enqueuedAt.get(it.id);
  if (at === undefined) { enqueueMissing.push(it); continue; }
  const ageDays = Math.floor((nowMs() - at) / (24 * 60 * 60 * 1000));
  if (nowMs() - at > BOUND_MS) pastBound.push({ ...it, ageDays });
  else withinBound.push({ ...it, ageDays });
}

console.log(`\n===== RESEARCH-OR-ERASE / QUARANTINE-DISPOSITION INVARIANT (read-only) =====`);
console.log(`live-quarantined: ${(items || []).length}  |  within-bound (≤${DWELL_BOUND_DAYS}d, being worked): ${withinBound.length}  |  PAST-BOUND: ${pastBound.length}  |  ENQUEUE-MISSING: ${enqueueMissing.length}`);

const byType = {};
for (const it of pastBound) byType[it.item_type] = (byType[it.item_type] || 0) + 1;
if (pastBound.length) console.log(`past-bound by item_type: ${JSON.stringify(byType)}`);

if (enqueueMissing.length) {
  console.log(`\n── ENQUEUE-MISSING (quarantined but no open investigation record) ──`);
  for (const it of enqueueMissing.slice(0, 40)) console.log(`  ${(it.legacy_id || it.id.slice(0, 8)).padEnd(14)} ${it.item_type.padEnd(15)} ${(it.title || "").slice(0, 46)}`);
  if (enqueueMissing.length > 40) console.log(`  … +${enqueueMissing.length - 40} more`);
}
if (pastBound.length) {
  console.log(`\n── PAST-BOUND (sitting > ${DWELL_BOUND_DAYS}d with no disposition — the permanent-quarantine class) ──`);
  for (const it of pastBound.slice(0, 40)) console.log(`  ${(it.legacy_id || it.id.slice(0, 8)).padEnd(14)} ${String(it.ageDays).padStart(4)}d ${it.item_type.padEnd(15)} ${(it.title || "").slice(0, 42)}`);
  if (pastBound.length > 40) console.log(`  … +${pastBound.length - 40} more`);
}

if (enqueueMissing.length || pastBound.length) {
  console.log(`\nDISPOSITION (research-or-erase, never leave sitting): run scripts/regen-quarantined.mjs to`);
  console.log(`research -> re-ground (RECOVER), else honest ARCHIVE / REGISTER-as-source. Drive this audit to 0.`);
  process.exit(1);
}
console.log(`invariant holds: every quarantined item is enqueued and within the disposition bound.`);
process.exit(0);
