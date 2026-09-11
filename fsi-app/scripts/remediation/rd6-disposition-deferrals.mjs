#!/usr/bin/env node
// RD-6 DISPOSITION PASS — write VALID time-bounded deferrals for the past-bound quarantined items that
// carry NO disposition (the 127 undispositioned crossings the Data-audit lane has failed on since 07-27).
//
// These are the Gate-A quarantine wave's missing PAPERWORK, not new breakage: the wave correctly quarantined
// them, but a disposition was never recorded, so RD-6's hard tripwire fired. A deferral is dispositioning-as-
// BLOCKED — it must name the SPECIFIC blocker AND the disposition path, with a named future resolution event
// and a real owner (scripts/lib/deferral.mjs enforces this; a vague deferral is the silent-backlog shape the
// invariant exists to kill). So the reason is DERIVED PER ITEM from live campaign state, never blanket text.
//
// $0 — DB reads + integrity_flags inserts only. No model calls, no fetches.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { readAll } from "../lib/db.mjs";
import { isValidDeferral } from "../lib/deferral.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* pre-loaded */ }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EXECUTE = process.argv.includes("--execute");
const DWELL_BOUND_DAYS = 14, BOUND_MS = DWELL_BOUND_DAYS * 864e5;
const DEFERRED_UNTIL = "2026-10-31";          // matches the 36 standing deferrals already on record
const OWNER = "operator (Jason)";

// ── Recompute the audit's undispositioned set (same logic, same helpers) ────────────────────────────
const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,provenance_status,updated_at", {
  match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined"),
});
const flags = await readAll("integrity_flags", "subject_ref,created_at,status,created_by,category,recommended_actions", {
  match: (q) => q.eq("subject_type", "item").eq("status", "open"),
});
const enqueuedAt = new Map();
for (const f of flags) {
  const t = Date.parse(f.created_at);
  if (!enqueuedAt.has(f.subject_ref) || t < enqueuedAt.get(f.subject_ref)) enqueuedAt.set(f.subject_ref, t);
}
const now = Date.now();
const hasValidDeferral = new Set();
for (const f of flags) {
  if (f.created_by !== "disposition_deferred") continue;
  const ra = f.recommended_actions;
  let payload = null;
  if (Array.isArray(ra)) { for (const e of ra) if (e && typeof e === "object" && e.deferral) { payload = e.deferral; break; } }
  else if (ra && typeof ra === "object") payload = ra.deferral || ("reason" in ra ? ra : null);
  if (payload && isValidDeferral(payload).ok) hasValidDeferral.add(f.subject_ref);
}
const pastBound = items.filter((it) => {
  const enq = enqueuedAt.get(it.id); if (enq === undefined) return false;
  return now - enq > BOUND_MS && !hasValidDeferral.has(it.id);
});
console.log(`live-quarantined ${items.length} | past-bound undispositioned: ${pastBound.length}`);

// ── PER-ITEM route derivation from LIVE state (never a blanket reason) ──────────────────────────────
const gate = new Map((await readAll("item_gate_a_state", "intelligence_item_id,orphan_count,orphans", { orderBy: "intelligence_item_id" })).map((g) => [g.intelligence_item_id, g]));

async function routeFor(it) {
  const g = gate.get(it.id);
  const orphans = g?.orphan_count ?? 0;
  const { data } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const r = Array.isArray(data) ? data[0] : data;
  const reasons = [...new Set((r?.failures || []).map((f) => f.reason))];
  const nonGateA = reasons.filter((x) => x !== "gate_a_orphan_tokens" && !/gate[_ ]?a/i.test(x));
  // Which blocker dominates decides the disposition PATH the item is waiting on.
  if (orphans > 0) {
    const toks = (g?.orphans || []).map((o) => o?.class).filter(Boolean);
    const derived = toks.filter((c) => c === "deadline").length;
    const path = derived > toks.length / 2
      ? "Gate-B DERIVED basis mint (re-synthesise the recurring-rule basis, then link the derived date)"
      : "A3 re-capture of the primary source, then re-ground the orphan tokens against a floor-qualifying capture";
    return {
      route: derived > toks.length / 2 ? "gate-b" : "a3-recapture",
      reason: `Gate-A quarantine wave: ${orphans} factual token(s) unbacked by any FACT claim at gate version 2026-07-29.3`
        + `${nonGateA.length ? `, plus ${nonGateA.length} non-GateA criterion failure(s) (${nonGateA.join("; ")})` : ""}.`
        + ` Blocked awaiting ${path}; the tokens are not present in any stored capture, so no $0 lever clears them.`,
    };
  }
  return {
    route: "revision",
    reason: `Quarantined on non-Gate-A criteria (${nonGateA.join("; ") || "provenance validation"}) with zero Gate-A orphans.`
      + ` Blocked awaiting per-item prose revision / relabel of the unlabeled assertion, then re-ground to restore verified status.`,
  };
}

const plan = [];
for (const it of pastBound) {
  const { route, reason } = await routeFor(it);
  const deferral = { reason, deferred_until: DEFERRED_UNTIL, owner: OWNER,
    resolution_event: route === "gate-b" ? "Gate-B DERIVED-mint scale pass completes for this item"
      : route === "a3-recapture" ? "A3 ranked re-capture batch reaches this item's primary source"
      : "publication-quality revision pass reaches this item" };
  const v = isValidDeferral(deferral);
  if (!v.ok) { console.error(`INVALID deferral for ${it.id}: ${v.error}`); process.exit(3); }  // fail-closed
  plan.push({ it, route, deferral });
}
const byRoute = plan.reduce((a, p) => ((a[p.route] = (a[p.route] || 0) + 1), a), {});
console.log(`route split:`, JSON.stringify(byRoute));
console.log(`sample reason: ${plan[0]?.deferral.reason.slice(0, 190)}…`);
if (!EXECUTE) { console.log(`\nDRY — ${plan.length} deferrals validated, nothing written. Re-run with --execute.`); process.exit(0); }

// ── WRITE (count-asserted, per case-file instance 8) ────────────────────────────────────────────────
let written = 0;
for (const p of plan) {
  const { error } = await sb.from("integrity_flags").insert({
    category: "data_integrity", subject_type: "item", subject_ref: p.it.id,
    description: `RD-6 disposition (deferred-as-blocked): ${p.it.title?.slice(0, 120) ?? p.it.id} — route ${p.route}.`,
    recommended_actions: [{ deferral: p.deferral }, { action: `route:${p.route}`, rationale: "Gate-A wave disposition, derived from live gate + criteria state." }],
    status: "open", created_by: "disposition_deferred",
  });
  if (error) { console.error(`HALT: insert failed for ${p.it.id}: ${error.message}`); process.exit(4); }
  written++;
}
if (written !== plan.length) { console.error(`HALT: wrote ${written} != planned ${plan.length}`); process.exit(5); }
console.log(`WROTE ${written} deferrals (count-asserted == planned).`);
