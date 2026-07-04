/** FORK-B DEFERRAL PASS ($0, guarded, ZERO mints — standing funded-pass dispatch item 2, ruling 2026-07-04).
 *
 *  The 64 undispositioned past-bound quarantined items are ALL "resurrected" — each previously carried a
 *  disposition_deferred flag whose deferred_until has now passed (today 2026-07-04), so the audit re-opened
 *  them as undispositioned (the anti-silence self-resurrection). This pass RE-DISPOSITIONS them as BLOCKED on
 *  the funded ground-only re-ground pass (item 3): it REFRESHES each item's EXISTING open disposition_deferred
 *  flag in place (guardedUpdate) with a per-CLASS valid event-bound payload. Refresh (not insert) because the
 *  probe found each item has exactly ONE open def flag + a separate enqueue flag — so refreshing avoids both
 *  stale-flag accumulation AND any enqueue-missing risk. Drives undispositioned -> 0 -> lane GREEN.
 *
 *  A deferral is dispositioning-as-BLOCKED, never silencing (remediation-discipline §2.2): the reason names
 *  the class-specific blocker + the disposition path (re-ground), a named resolution_event (the funded pass),
 *  a FUTURE deferred_until, a real owner. The funded pass RELEASES each item (deferral resolves) on verified.
 *
 *  SAFETY: refuses to touch any item that (a) is not genuinely past-bound + undispositioned, or (b) lacks an
 *  existing open disposition_deferred flag (never blanket-defer a fresh/unexpected item). Updates ONLY
 *  integrity_flags — NEVER inserts an intelligence_items row (zero mint by construction). Reversible via the
 *  guardedUpdate snapshots. DRY-RUN default; --apply writes. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedUpdate } from "./lib/db.mjs";
import { isValidDeferral, assertValidDeferral } from "./lib/deferral.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const BOUND = 14 * 24 * 3600 * 1000;
const now = new globalThis.Date();
const nowMs = now.getTime();
const DEFERRED_UNTIL = "2026-10-31T00:00:00.000Z"; // outer re-open bound; the funded pass releases sooner
const OWNER = "operator (Jason)";
const RESOLUTION_EVENT =
  "Funded ground-only re-ground pass (standing dispatch item 3): the 5c nomination fix (pool-source floor-first spans, PR #184) grounds this item; RELEASE — deferral resolves — on provenance_status=verified.";

// Per-CLASS blocker. Every reason names the disposition path ("re-ground") + the class-specific floor reality.
const REG_FAMILY = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const SIGNAL_FAMILY = new Set(["market_signal", "initiative"]);
function reasonFor(itemType) {
  if (REG_FAMILY.has(itemType))
    return "Blocked on the funded ground-only re-ground pass. The 5c nomination fix (pool-source floor-first " +
      "spans) landed; this reg-family item awaits re-ground to clear missing_required_slot / unlabeled_assertion " +
      "/ fact_below_authority_floor at the T<=2 authority floor. Ground-only ~$1/item; gated by the $85 ceiling " +
      "+ $80 batch buffer + $3 per-item breaker.";
  if (SIGNAL_FAMILY.has(itemType))
    return "Blocked on the funded ground-only re-ground pass. Floor-EXEMPT type (market_signal/initiative — " +
      "strength is corroboration-count, SC-8 gate not yet built); awaits re-ground to attach a registered " +
      "source and the corroboration model. Ground-only ~$1/item; gated by the $85 ceiling + $80 batch buffer.";
  // regional_data + any other
  return "Blocked on the funded ground-only re-ground pass. Per-SECTION floor (feasibility facts <=T3; cost-data " +
    "any registered source); awaits re-ground to ground each section's facts. Gated by the $85 ceiling + batch buffer.";
}
function payloadFor(itemType) {
  return { reason: reasonFor(itemType), deferred_until: DEFERRED_UNTIL, owner: OWNER, resolution_event: RESOLUTION_EVENT };
}

// ── live undispositioned past-bound set (mirror the audit) ──
const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,provenance_status", {
  match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined"),
});
const flags = await readAll("integrity_flags", "id,subject_ref,created_at,status,created_by,recommended_actions", {
  match: (q) => q.eq("subject_type", "item").eq("status", "open"),
});
const byItem = new Map();
for (const f of flags) { if (!byItem.has(f.subject_ref)) byItem.set(f.subject_ref, []); byItem.get(f.subject_ref).push(f); }
const earliest = new Map();
for (const f of flags) { const ex = earliest.get(f.subject_ref); if (!ex || f.created_at < ex) earliest.set(f.subject_ref, f.created_at); }
function hasValidDeferral(fl) {
  if (fl.created_by !== "disposition_deferred") return false;
  const ra = fl.recommended_actions; let p = null;
  if (Array.isArray(ra)) { for (const e of ra) { if (e && e.deferral) { p = e.deferral; break; } } if (!p && ra[0] && "reason" in ra[0]) p = ra[0]; }
  else if (ra && typeof ra === "object") p = ra.deferral || ("reason" in ra ? ra : null);
  return isValidDeferral(p, now).ok;
}

const targets = []; const skips = [];
for (const it of items) {
  const t = earliest.get(it.id);
  if (!t || nowMs - new globalThis.Date(t).getTime() <= BOUND) continue; // within bound — not our concern
  const fl = byItem.get(it.id) || [];
  if (fl.some(hasValidDeferral)) continue;                                // already validly deferred
  // UNDISPOSITIONED past-bound. SAFETY: it must already carry an open disposition_deferred flag to REFRESH.
  const defFlag = fl.find((f) => f.created_by === "disposition_deferred");
  const enqueueFlag = fl.find((f) => f.created_by !== "disposition_deferred");
  if (!defFlag) { skips.push({ it, why: "no existing disposition_deferred flag — refusing to blanket-defer a fresh item" }); continue; }
  if (!enqueueFlag) { skips.push({ it, why: "no separate enqueue flag — refreshing would risk enqueue-missing" }); continue; }
  targets.push({ it, defFlagId: defFlag.id });
}

console.log(`\n===== FORK-B DEFERRAL PASS (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`undispositioned past-bound targeted: ${targets.length} | skipped (safety): ${skips.length}`);
const byType = {}; for (const t of targets) byType[t.it.item_type] = (byType[t.it.item_type] || 0) + 1;
console.log(`by item_type: ${JSON.stringify(byType)}`);
for (const s of skips) console.log(`  SKIP ${(s.it.legacy_id || s.it.id.slice(0, 8)).padEnd(16)} — ${s.why}`);

// validate EVERY payload before any write
for (const t of targets) assertValidDeferral(payloadFor(t.it.item_type), now);
console.log(`all ${targets.length} deferral payloads valid (assertValidDeferral passed).`);

if (!APPLY) { console.log(`\nDRY-RUN — wrote nothing. Pass --apply to refresh the ${targets.length} deferrals.`); process.exit(0); }

let updated = 0;
for (const t of targets) {
  const pl = payloadFor(t.it.item_type);
  const key = t.it.legacy_id || t.it.id.slice(0, 8);
  try {
    await guardedUpdate("integrity_flags", (qb) => qb.eq("id", t.defFlagId), {
      recommended_actions: [{ deferral: pl }],
      description: `Fork-B deferral (until ${DEFERRED_UNTIL.slice(0, 10)}): blocked on the funded re-ground pass; ` +
        `self-resurrects as undispositioned if not grounded by then.`,
    }, { cite: { skill: "remediation-discipline", reason: `Fork-B: re-disposition ${key} as blocked-on-funded-re-ground (event-bound deferral)` } });
    updated += 1;
    console.log(`  [${key.padEnd(48)}] ${t.it.item_type.padEnd(13)} deferred -> ${DEFERRED_UNTIL.slice(0, 10)}`);
  } catch (e) { console.log(`  [${key}] UPDATE FAILED: ${e.message}`); }
}
console.log(`\nDONE: ${updated}/${targets.length} deferrals refreshed. Snapshots under scripts/_snapshots/.`);
process.exit(updated === targets.length ? 0 : 1);
