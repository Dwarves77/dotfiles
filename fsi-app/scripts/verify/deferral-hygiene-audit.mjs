/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: remediation-discipline (§2.2 — a deferral is
 *  dispositioning-as-blocked, never silencing; an expired deferral re-opens as undispositioned).
 *
 *  DEFERRAL FLAG-SIDE EXPIRY / HYGIENE. RD-6 polices the ITEM side (a quarantined item's deferral must be
 *  valid + future). This is the complementary FLAG side: the integrity_flags rows that CARRY the deferral
 *  payload (created_by='disposition_deferred'). Two rot classes silently accumulate:
 *    (1) EXPIRED-OPEN  — status='open' but the payload's deferred_until has already passed. The deferral
 *        outlived its own clock; it must re-open as undispositioned, not sit forever green.
 *    (2) DELETED-SUBJECT — subject_ref points at an intelligence_items row that no longer exists (hard-
 *        deleted). The flag is orphaned; it defers a subject that is gone.
 *
 *  READ-ONLY, REPORT-ONLY: it NEVER writes (does not resolve/re-open — that is a later disposition
 *  dispatch's job). It NAMES the rot so the resolver can act. Exit 0 = clean; exit 1 = rot found; exit 2 =
 *  read error. Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
import { sameBlockerReason } from "../lib/deferral.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may be pre-loaded in CI */ }

// The deferral payload lives in recommended_actions; historical shapes: [{ deferral: {...} }] or [{...}] or
// an object with deferred_until. Pull the first deferred_until we can find, defensively.
function deferredUntilOf(recommended_actions) {
  const arr = Array.isArray(recommended_actions) ? recommended_actions : recommended_actions ? [recommended_actions] : [];
  for (const a of arr) {
    if (!a || typeof a !== "object") continue;
    const cand = a.deferred_until || (a.deferral && a.deferral.deferred_until) || (a.until);
    if (cand) return cand;
  }
  return null;
}
// Pull the deferral REASON from the payload (same defensive shape handling as deferredUntilOf) — for the
// renewal-repackage check (item 3): an open deferral whose reason matches a SIBLING deferral's reason on the
// same subject is a clock-re-set without a new blocker finding (the RD-6 silencing).
function reasonOf(recommended_actions) {
  const arr = Array.isArray(recommended_actions) ? recommended_actions : recommended_actions ? [recommended_actions] : [];
  for (const a of arr) {
    if (!a || typeof a !== "object") continue;
    const cand = a.reason || (a.deferral && a.deferral.reason);
    if (cand) return cand;
  }
  return null;
}

let flags, itemIds;
try {
  flags = await readAll(
    "integrity_flags",
    "id,subject_ref,subject_type,status,created_by,recommended_actions,created_at",
    { match: (q) => q.eq("created_by", "disposition_deferred") },
  );
  const items = await readAll("intelligence_items", "id");
  itemIds = new Set(items.map((r) => r.id));
} catch (e) {
  console.error(`deferral-hygiene-audit: read failed — ${e.message}`);
  process.exit(2);
}

const nowMs = Date.now();
const expiredOpen = [];
const deletedSubject = [];
const undated = [];

for (const f of flags) {
  const open = f.status === "open";
  if (open) {
    const du = deferredUntilOf(f.recommended_actions);
    const t = du ? Date.parse(du) : NaN;
    if (Number.isNaN(t)) undated.push(f);
    else if (t < nowMs) expiredOpen.push({ id: f.id, subject_ref: f.subject_ref, deferred_until: du });
  }
  // deleted-subject applies to item-scoped flags whose subject no longer exists (any status worth naming
  // while still open, since an open deferral for a gone item is the orphan the register cites).
  if (f.subject_type === "item" && f.subject_ref && !itemIds.has(f.subject_ref)) {
    deletedSubject.push({ id: f.id, subject_ref: f.subject_ref, status: f.status });
  }
}

// (3) RENEWAL-REPACKAGE (item 3): an OPEN deferral whose reason matches a SIBLING deferral's reason on the
// same subject (open or resolved) — a clock re-set that recycled the prior blocker instead of naming a new
// one. RD-6: a renewal MUST carry a new blocker finding; repackaging the same reason is the silencing.
const bySubject = new Map();
for (const f of flags) {
  if (!f.subject_ref) continue;
  if (!bySubject.has(f.subject_ref)) bySubject.set(f.subject_ref, []);
  bySubject.get(f.subject_ref).push(f);
}
const renewalRepackage = [];
for (const f of flags) {
  if (f.status !== "open") continue;
  const r = reasonOf(f.recommended_actions);
  if (!r) continue;
  const sib = (bySubject.get(f.subject_ref) || []).find((s) => s.id !== f.id && sameBlockerReason(r, reasonOf(s.recommended_actions)));
  if (sib) renewalRepackage.push({ id: f.id, subject_ref: f.subject_ref, sibling: sib.id, sibling_status: sib.status });
}

console.log(`deferral-hygiene-audit: ${flags.length} disposition_deferred flag(s) scanned.`);
console.log(`  expired-open      : ${expiredOpen.length}`);
console.log(`  deleted-subject   : ${deletedSubject.length}`);
console.log(`  renewal-repackage : ${renewalRepackage.length}`);
if (undated.length) console.log(`  open-without-parseable-deferred_until: ${undated.length} (informational)`);

for (const r of expiredOpen.slice(0, 50)) console.error(`  [EXPIRED-OPEN] flag ${r.id} subject=${r.subject_ref} deferred_until=${r.deferred_until}`);
for (const r of deletedSubject.slice(0, 50)) console.error(`  [DELETED-SUBJECT] flag ${r.id} subject=${r.subject_ref} status=${r.status}`);
for (const r of renewalRepackage.slice(0, 50)) console.error(`  [RENEWAL-REPACKAGE] flag ${r.id} subject=${r.subject_ref} recycles reason of sibling ${r.sibling} (${r.sibling_status}) — RD-6: a renewal must name a NEW blocker`);

// All three classes FAIL the lane (exit 1). "Report-only" means the audit NAMES the rot and never blind-
// writes a resolution — it does NOT mean non-failing: expired-open, deleted-subject, and renewal-repackage
// are hard gate conditions (operator ruling 2026-07-13, item 3: expired-open is a failing condition).
const rot = expiredOpen.length + deletedSubject.length + renewalRepackage.length;
if (rot === 0) { console.log("deferral-hygiene-audit: OK — no expired-open, deleted-subject, or renewal-repackage deferral flags."); process.exit(0); }
console.error(`\ndeferral-hygiene-audit: ${rot} flag(s) FAIL (names the rot; resolve via a disposition dispatch, never a blind write).`);
process.exit(1);
