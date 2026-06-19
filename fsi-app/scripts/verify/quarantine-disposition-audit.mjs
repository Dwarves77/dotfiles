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
import { isValidDeferral } from "../lib/deferral.mjs";

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
  // the open investigation records (the enqueue + dwell clock) AND the open disposition_deferred
  // records (the deferral payloads). Both are open item flags; recommended_actions carries the
  // deferral payload { reason, deferred_until, owner, resolution_event }.
  flags = await readAll("integrity_flags", "subject_ref,created_at,status,created_by,category,recommended_actions", {
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

// VALID-deferral map: item id -> { reason, deferred_until, owner, resolution_event } when the item has an
// OPEN disposition_deferred flag whose payload passes isValidDeferral AND whose deferred_until is in the
// FUTURE. Expired deferrals do NOT count (self-resurrection: the item falls back to undispositioned).
const now = new globalThis.Date();
const validDeferral = new Map();
for (const f of flags || []) {
  if (f.created_by !== "disposition_deferred") continue;
  // recommended_actions holds the payload as [{ deferral: {...} }] (jsonb). Tolerate either that wrapper
  // shape or a bare payload object/array element.
  let payload = null;
  const ra = f.recommended_actions;
  if (Array.isArray(ra)) {
    for (const entry of ra) {
      if (entry && typeof entry === "object" && entry.deferral) { payload = entry.deferral; break; }
    }
    if (!payload && ra.length && ra[0] && typeof ra[0] === "object" && ("reason" in ra[0])) payload = ra[0];
  } else if (ra && typeof ra === "object") {
    payload = ra.deferral || (("reason" in ra) ? ra : null);
  }
  const verdict = isValidDeferral(payload, now); // also re-checks deferred_until is in the FUTURE
  if (verdict.ok) {
    const existing = validDeferral.get(f.subject_ref);
    // keep the latest deferred_until if multiple valid deferrals exist for one item
    if (!existing || new globalThis.Date(payload.deferred_until).getTime() > new globalThis.Date(existing.deferred_until).getTime()) {
      validDeferral.set(f.subject_ref, payload);
    }
  }
}

// Items that EVER carried a disposition_deferred flag — for RESURRECTION detection. An undispositioned
// item that previously had a deferral = its clock fired and it self-resurrected (the anti-silence
// property), which reads DIFFERENTLY from a never-deferred FRESH crossing. Naming the two apart is the
// Lane-#4 legibility contract: a re-fired deferral is not a new break.
const everDeferred = new Set((flags || []).filter((f) => f.created_by === "disposition_deferred").map((f) => f.subject_ref));

const SOON_MS = 7 * 24 * 60 * 60 * 1000; // deferrals re-firing within ~7 days = heads-up

const enqueueMissing = [];
const undispositioned = []; // past-bound with NO valid deferral — the HARD tripwire
const deferred = [];        // past-bound WITH a valid deferral — standing, does NOT hard-fail
const withinBound = [];
for (const it of items || []) {
  const at = enqueuedAt.get(it.id);
  if (at === undefined) { enqueueMissing.push(it); continue; }
  const ageDays = Math.floor((nowMs() - at) / (24 * 60 * 60 * 1000));
  if (nowMs() - at > BOUND_MS) {
    const d = validDeferral.get(it.id);
    if (d) deferred.push({ ...it, ageDays, deferral: d });
    else undispositioned.push({ ...it, ageDays, resurrected: everDeferred.has(it.id) });
  } else withinBound.push({ ...it, ageDays });
}

console.log(`\n===== RESEARCH-OR-ERASE / QUARANTINE-DISPOSITION INVARIANT (read-only) =====`);
console.log(`live-quarantined: ${(items || []).length}  |  within-bound (≤${DWELL_BOUND_DAYS}d, being worked): ${withinBound.length}  |  ENQUEUE-MISSING: ${enqueueMissing.length}`);
const resurrected = undispositioned.filter((it) => it.resurrected);
const freshCrossings = undispositioned.filter((it) => !it.resurrected);
console.log(`past-bound split → undispositioned past-bound: ${undispositioned.length} (HARD tripwire) [${freshCrossings.length} fresh crossing, ${resurrected.length} resurrected — deferral expired, clock re-fired]  |  deferred past-bound: ${deferred.length} (standing, reason+window recorded)`);

const byType = {};
for (const it of undispositioned) byType[it.item_type] = (byType[it.item_type] || 0) + 1;
if (undispositioned.length) console.log(`undispositioned past-bound by item_type: ${JSON.stringify(byType)}`);

if (enqueueMissing.length) {
  console.log(`\n── ENQUEUE-MISSING (quarantined but no open investigation record) ──`);
  for (const it of enqueueMissing.slice(0, 40)) console.log(`  ${(it.legacy_id || it.id.slice(0, 8)).padEnd(14)} ${it.item_type.padEnd(15)} ${(it.title || "").slice(0, 46)}`);
  if (enqueueMissing.length > 40) console.log(`  … +${enqueueMissing.length - 40} more`);
}
if (undispositioned.length) {
  console.log(`\n── UNDISPOSITIONED PAST-BOUND (sitting > ${DWELL_BOUND_DAYS}d, NO valid deferral — the permanent-quarantine class) ──`);
  for (const it of undispositioned.slice(0, 40)) console.log(`  ${(it.legacy_id || it.id.slice(0, 8)).padEnd(14)} ${String(it.ageDays).padStart(4)}d ${it.item_type.padEnd(15)} ${(it.title || "").slice(0, 42)}`);
  if (undispositioned.length > 40) console.log(`  … +${undispositioned.length - 40} more`);
}
if (deferred.length) {
  console.log(`\n── DEFERRED PAST-BOUND (valid time-bounded deferral — standing, does NOT fail the lane) ──`);
  for (const it of deferred.slice(0, 40)) console.log(`  ${(it.legacy_id || it.id.slice(0, 8)).padEnd(14)} until ${String(it.deferral.deferred_until).slice(0, 10)} owner=${String(it.deferral.owner).slice(0, 16).padEnd(16)} ${(it.title || "").slice(0, 30)}`);
  if (deferred.length > 40) console.log(`  … +${deferred.length - 40} more`);
  const soon = deferred.filter((it) => {
    const t = new globalThis.Date(it.deferral.deferred_until).getTime();
    return t - nowMs() <= SOON_MS;
  });
  if (soon.length) {
    console.log(`\n  HEADS-UP: ${soon.length} deferral(s) re-fire within ~7d (will re-open as undispositioned if not worked):`);
    for (const it of soon.slice(0, 20)) console.log(`    ${(it.legacy_id || it.id.slice(0, 8)).padEnd(14)} until ${String(it.deferral.deferred_until).slice(0, 10)}`);
  }
}

// Exit 1 ONLY if undispositioned past-bound > 0 (the HARD tripwire) OR ENQUEUE-MISSING > 0.
// Deferred-count does NOT fail the lane (dispositioned-as-blocked, reason+window recorded).
if (enqueueMissing.length || undispositioned.length) {
  // Self-explaining FAIL reason (Lane-#4 legibility): name the THREE distinct populations so a re-fire
  // reads differently from a fresh break at a glance — never an ambiguous red.
  const kinds = [];
  if (freshCrossings.length) kinds.push(`${freshCrossings.length} NEW undispositioned crossing(s) [${freshCrossings.slice(0, 5).map((x) => x.legacy_id || x.id.slice(0, 8)).join(", ")}${freshCrossings.length > 5 ? ", …" : ""}]`);
  if (resurrected.length) kinds.push(`${resurrected.length} RESURRECTED (deferral expired, clock re-fired, disposition still pending)`);
  if (enqueueMissing.length) kinds.push(`${enqueueMissing.length} enqueue-missing`);
  console.log(`\nLANE-FAIL REASON: ${kinds.join("; ")}.  Deferred standing (NOT a failure): ${deferred.length}.`);
  console.log(`\nDISPOSITION (research-or-erase, never leave sitting): run scripts/regen-quarantined.mjs to`);
  console.log(`research -> re-ground (RECOVER), else honest ARCHIVE / REGISTER-as-source, OR record a VALID`);
  console.log(`time-bounded deferral (reason names blocker + disposition path, future resolution event, owner).`);
  console.log(`Drive the UNDISPOSITIONED count to 0.`);
  process.exit(1);
}
console.log(`invariant holds: every quarantined item is enqueued and either within the bound or carries a valid deferral.`);
process.exit(0);
