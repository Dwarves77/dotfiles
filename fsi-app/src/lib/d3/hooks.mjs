// D3 ingestion-layer hooks. Imported by Next route handlers + runners so D3 runs on
// DATA events, not only on code changes — closing the half of the disease that lives
// in data flow (the 420 wrongly-excluded sources, the cron degrading trust). These are
// the buildable-now triggers (app code); PR/periodic triggers wait on a deploy target.
//
// GOVERNING RULE (makes sync guards safe to wire into live ingestion):
//   - a FINDING biases the OUTCOME to the conservative, reversible choice (admit ->
//     provisional, evict -> quarantine) + flags. Fail-closed-to-safe.
//   - a D3 ERROR is passthrough (returns the route's default outcome) and NEVER throws.
//     The guard can never wedge ingestion. Fail-open on its own failure.
//   - ALWAYS heartbeat (a run happened), so self-liveness can see data-scope runs.
//
// The guards bias the outcome; they do not block. The async audit only observes.

// Methods proven untrustworthy this session (mirror of the exclusion-audit registry).
export const UNRELIABLE_METHODS = new Set(["plain-fetch-reachability", "dead-jq-hook"]);

// PURE decisions (unit-testable without a client): outcome from method reliability.
export function admissionOutcome(method) { return UNRELIABLE_METHODS.has(method) ? "provisional" : "active"; }
export function rejectionOutcome(method) { return UNRELIABLE_METHODS.has(method) ? "quarantine" : "evict"; }

// Heartbeat: leave a FACT in d3_runs if the table exists; else skip-with-log (the
// table is DEFINED-not-applied until deploy). Never throws.
async function heartbeat(supabase, { scope, event, checksRun = [], nLoud = 0 }) {
  try {
    const { error } = await supabase.from("d3_runs").insert({ scope, trigger_event: event, checks_run: checksRun, n_loud: nLoud, created_by: "d3-hook" });
    if (error) {
      if (/does not exist|d3_runs|relation/i.test(error.message)) console.warn(`[d3] heartbeat skipped (d3_runs not applied): ${event}`);
      else console.warn(`[d3] heartbeat error (swallowed): ${error.message}`);
      return false;
    }
    return true;
  } catch (e) { console.warn(`[d3] heartbeat threw (swallowed): ${e?.message}`); return false; }
}

// Route a finding to integrity_flags (deployed durable queue). Never throws.
async function flag(supabase, { subjectRef, description }) {
  try {
    const { error } = await supabase.from("integrity_flags").insert({ category: "data_integrity", subject_type: "system", subject_ref: subjectRef, description, recommended_actions: [], status: "open", created_by: "d3-hook" });
    if (error) console.warn(`[d3] flag error (swallowed): ${error.message}`);
    return !error;
  } catch (e) { console.warn(`[d3] flag threw (swallowed): ${e?.message}`); return false; }
}

// SYNC admission guard. unreliable method -> 'provisional'+flag (conservative); clean
// -> 'active'; D3 error -> 'active' passthrough + audited:false. Never throws.
export async function d3GuardAdmission(supabase, { candidateUrl, method, event = "ingest:source-admit" }) {
  try {
    const unreliable = UNRELIABLE_METHODS.has(method);
    if (unreliable) await flag(supabase, { subjectRef: `admit:${candidateUrl}`, description: `Source admitted via unreliable method '${method}' -> downgraded to provisional + flagged (D3 admission guard).` });
    await heartbeat(supabase, { scope: "data", event, nLoud: unreliable ? 1 : 0, checksRun: ["d3GuardAdmission"] });
    return { outcome: admissionOutcome(method), audited: true, flagged: unreliable };
  } catch (e) {
    console.warn(`[d3] admission guard error (fail-open passthrough): ${e?.message}`);
    try { await heartbeat(supabase, { scope: "data", event, checksRun: ["d3GuardAdmission:errored"] }); } catch {}
    return { outcome: "active", audited: false, flagged: false }; // passthrough = route default
  }
}

// SYNC rejection guard (the 420-class, at the check-sources eviction point). unreliable
// method -> 'quarantine'+flag (not evict); clean -> 'evict'; D3 error -> 'evict'
// passthrough + audited:false. Never throws.
export async function d3GuardRejection(supabase, { candidateUrl, method, event = "ingest:reachability-reject" }) {
  try {
    const unreliable = UNRELIABLE_METHODS.has(method);
    if (unreliable) await flag(supabase, { subjectRef: `reject:${candidateUrl}`, description: `Reachability rejection via unreliable method '${method}' -> quarantined (not evicted) + flagged (D3 rejection guard; prevents the 420-class at the decision point).` });
    await heartbeat(supabase, { scope: "data", event, nLoud: unreliable ? 1 : 0, checksRun: ["d3GuardRejection"] });
    return { outcome: rejectionOutcome(method), audited: true, flagged: unreliable };
  } catch (e) {
    console.warn(`[d3] rejection guard error (fail-open passthrough): ${e?.message}`);
    try { await heartbeat(supabase, { scope: "data", event, checksRun: ["d3GuardRejection:errored"] }); } catch {}
    return { outcome: "evict", audited: false, flagged: false };
  }
}

// ASYNC audit hook — observe a data event, run quick checks, flag what trips, heartbeat.
// Pure observation: never throws, can't affect the completed ingestion. `checks` are
// async () => (null | {subjectRef, description}). Shallow-but-present at all 7 classes
// beats deep-at-3-and-nothing-at-4 (the not-walked-invisible gap at the data layer).
export async function d3AuditEvent(supabase, { scope = "data", event, checks = [] }) {
  try {
    let nLoud = 0;
    for (const ch of checks) {
      try { const f = await ch(); if (f) { nLoud++; await flag(supabase, f); } }
      catch (e) { console.warn(`[d3] audit check threw (${event}, swallowed): ${e?.message}`); }
    }
    await heartbeat(supabase, { scope, event, nLoud, checksRun: checks.map((_, i) => `audit#${i}`) });
    return { audited: true, nLoud };
  } catch (e) { console.warn(`[d3] audit event error (swallowed): ${e?.message}`); return { audited: false, nLoud: 0 }; }
}
