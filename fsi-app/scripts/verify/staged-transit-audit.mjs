/** VERIFIER (read-only, 0 Browserless): STAGED-UPDATES TRANSIT-ONLY / MAX-AGE INVARIANT over live data.
 *  GOVERNING SKILLS: remediation-discipline (§2.1/§2.2 — no resting state; a transitional row resolves or
 *  ages out, never parks; the intake-side sibling of the quarantine-disposition invariant RD-4/RD-6) +
 *  environmental-policy-and-innovation (Format Mapping / mint chokepoint — the machine gates ARE the
 *  approval; no human-finish-of-intake).
 *
 *  DOCTRINE (ADR-012 rider, operator 2026-07-11): the intake path has NO human-approval gate. staged_updates
 *  is TRANSIT-ONLY — a row is in transit only briefly, then RESOLVES. A staged row that sits in a transit
 *  state past the max-age is the parked-row defect this invariant forbids (the intake-side of
 *  no-quarantine-as-resting-state).
 *
 *  RESOLVED (terminal — off the transit clock), defined against the REPAIRED lifecycle (P1#5 scar tissue:
 *  migration 034 materialization_error/materialized_at/materialized_item_id + the Wave-α approve-idempotency
 *  fix + reviewer_notes):
 *    - MATERIALIZED       : status='approved' AND materialized_at IS NOT NULL (the mint wrote the row).
 *    - REJECTED-W/-REASON : status='rejected' AND (reason OR reviewer_notes non-empty).
 *    - ROUTED-TO-FLAG     : a transit row that carries an OPEN integrity_flag (subject_ref = staged id) —
 *                           i.e. a materialization FAILURE that AGED INTO Unit 2's flag resolver rather than
 *                           becoming a new species of parked 'approved-unmaterialized' orphan.
 *  TRANSIT (on the clock): 'pending' (awaiting machine processing) OR approved-unmaterialized
 *    (status='approved' AND materialized_at IS NULL — the P1#5 species).
 *  TRIPWIRE (exit 1): a TRANSIT row older than MAX_AGE_H with NO routing flag = undispositioned transit.
 *    A rejected row with no reason is a soft lifecycle finding (reported, not a hard fail — it is terminal).
 *
 *  Exit 0 = invariant holds. Exit 1 = undispositioned-transit tripwire (gates in the CI-with-secrets / ops
 *  lane; pre-push has no DB secrets so it validates WIRING via the meta-gate, not this live run). Reads only.
 *  Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 *  NOTE (sequencing, honest): while the human-approval materialization path is still live (until the
 *  run-one-cycle orchestration removes it, Unit 0c), 'pending' rows may legitimately await review, so this
 *  live run can show a real transit backlog. That is the audit surfacing the backlog the transit-only model
 *  eliminates (flag-rate is not defect-rate) — U0c/U1 drive it to zero; it never blocks the required pre-push.
 *
 *  TUNABLE (operator policy): MAX_AGE_H — the staged-transit SLA, "like provisional" (72h). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may be pre-loaded in CI */ }

const MAX_AGE_H = 72;
const BOUND_MS = MAX_AGE_H * 60 * 60 * 1000;
const nowMs = () => new globalThis.Date().getTime();
const nonEmpty = (s) => typeof s === "string" && s.trim().length > 0;

let rows, flags;
try {
  rows = await readAll(
    "staged_updates",
    "id,status,update_type,reason,reviewer_notes,created_at,reviewed_at,materialized_at,materialization_error",
  );
  // OPEN flags whose subject_ref points at a staged row = the route into Unit 2's flag resolver.
  flags = await readAll("integrity_flags", "subject_ref,status", { match: (q) => q.eq("status", "open") });
} catch (e) { console.error(`staged-transit-audit: read failed: ${e.message}`); process.exit(2); }

const routedRefs = new Set((flags || []).map((f) => f.subject_ref).filter(Boolean));

const materialized = [];
const rejectedWithReason = [];
const rejectedNoReason = [];       // soft finding: terminal but reasonless
const routedToFlag = [];           // transit row that aged into the flag resolver (resolved-as-routed)
const transitWithinBound = [];
const undispositionedTransit = []; // the HARD tripwire

for (const r of rows || []) {
  const status = r.status;
  const isMaterialized = status === "approved" && r.materialized_at != null;
  const isRejected = status === "rejected";
  if (isMaterialized) { materialized.push(r); continue; }
  if (isRejected) {
    (nonEmpty(r.reason) || nonEmpty(r.reviewer_notes)) ? rejectedWithReason.push(r) : rejectedNoReason.push(r);
    continue;
  }
  // TRANSIT: pending, or approved-unmaterialized (P1#5 species).
  const approvedUnmaterialized = status === "approved" && r.materialized_at == null;
  const clockFrom = approvedUnmaterialized && r.reviewed_at ? r.reviewed_at : r.created_at;
  const ageH = Math.floor((nowMs() - new globalThis.Date(clockFrom).getTime()) / (60 * 60 * 1000));
  const row = { ...r, ageH, approvedUnmaterialized };
  if (routedRefs.has(r.id)) { routedToFlag.push(row); continue; }         // aged into Unit 2 = resolved-as-routed
  if (nowMs() - new globalThis.Date(clockFrom).getTime() > BOUND_MS) undispositionedTransit.push(row);
  else transitWithinBound.push(row);
}

console.log(`\n===== STAGED-UPDATES TRANSIT-ONLY / MAX-AGE INVARIANT (read-only) =====`);
console.log(`staged rows: ${(rows || []).length}  |  RESOLVED → materialized: ${materialized.length}  rejected-with-reason: ${rejectedWithReason.length}  routed-to-flag(Unit 2): ${routedToFlag.length}`);
console.log(`TRANSIT → within-bound (≤${MAX_AGE_H}h): ${transitWithinBound.length}  |  UNDISPOSITIONED-TRANSIT past-bound: ${undispositionedTransit.length} (HARD tripwire)`);
if (rejectedNoReason.length) console.log(`soft finding — rejected WITHOUT a reason (terminal but reasonless): ${rejectedNoReason.length}`);

const approvedOrphans = undispositionedTransit.filter((r) => r.approvedUnmaterialized);
if (approvedOrphans.length) console.log(`  of those, approved-unmaterialized orphans (P1#5 species) NOT yet routed to the flag resolver: ${approvedOrphans.length}`);

if (undispositionedTransit.length) {
  console.log(`\n── UNDISPOSITIONED-TRANSIT (staged > ${MAX_AGE_H}h, not resolved, not routed to a flag) ──`);
  for (const r of undispositionedTransit.slice(0, 40)) {
    const kind = r.approvedUnmaterialized ? "approved-unmaterialized" : r.status;
    console.log(`  ${String(r.id).slice(0, 8)}  ${String(r.ageH).padStart(5)}h  ${kind.padEnd(24)} ${String(r.update_type || "").slice(0, 20)}${r.materialization_error ? "  err=" + String(r.materialization_error).slice(0, 40) : ""}`);
  }
  if (undispositionedTransit.length > 40) console.log(`  … +${undispositionedTransit.length - 40} more`);
  console.log(`\nLANE-FAIL: ${undispositionedTransit.length} staged row(s) parked past the ${MAX_AGE_H}h transit bound.`);
  console.log(`DISPOSITION (transit-only, never park): materialize (mint), reject-with-reason, OR route a`);
  console.log(`materialization failure to the flag resolver (Unit 2 / integrity_flags) so it ages OUT of transit`);
  console.log(`rather than becoming a parked approved-unmaterialized orphan. Drive UNDISPOSITIONED-TRANSIT to 0.`);
  process.exit(1);
}
console.log(`invariant holds: every staged row is materialized, rejected-with-reason, routed to the flag resolver, or within the ${MAX_AGE_H}h transit bound.`);
process.exit(0);
