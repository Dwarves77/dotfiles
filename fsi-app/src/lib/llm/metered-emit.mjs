// @ts-check
// metered-emit.mjs — the EMISSION arm of the metered gate (MASTER DISPATCH C2, 2026-07-26).
//
// The structural fix for "19,898 paid rows, 54 markers": marker-writing lived in one runner, so authorized
// batch spend ran unmarked and the spend-watch alarmed on it. C2 moves emission to the gate: the ONLY sanctioned
// path to a metered batch run is openMeteredBatch(), which ASSERTS the metered gate AND writes the batch-level
// authorization marker BEFORE the batch runs. Spend cannot occur unmarked because the single grant+emit call is
// the thing that authorizes it — a runner that wants to spend metered must go through here, and going through
// here writes the marker. Fail-closed: if the gate refuses OR the marker write fails, it throws and no batch runs.
//
// A batch marker (agent_runs.fetch_method='batch-marker', cost 0) carries {task, model, capUsd, windowStart,
// windowEnd}; every subject-less paid row of that model inside the window traces to it via the spend-health
// two-arm predicate. Subject-bearing metered runs are a different class (per-subject priced lines from the
// funded-pass) and do not use this path.

import { assertMeteredCallAllowed } from "./metered-gate.mjs";

/**
 * Assert the metered gate AND emit the batch authorization marker, in sequence, before any spend. Throws
 * (fail-closed) if the gate refuses or the marker write fails — a batch can NEVER run metered without its marker.
 * @param {{ from: (t: string) => any }} sb  a supabase-like client (only .from().insert().select().single() used)
 * @param {{ callClass: string, model: string, capUsd: number, task: string, windowMs?: number, nowIso?: string, env?: Record<string,string|undefined> }} o
 * @returns {Promise<{ allowed: true, callClass: string, model: string, capUsd: number, token: string, amendment?: string, markerId: any, windowStart: string, windowEnd: string }>}
 */
export async function openMeteredBatch(sb, o) {
  // 1) GATE — throws MeteredCallForbiddenError unless the call is authorized (class/model/token/cap/amendment).
  const auth = assertMeteredCallAllowed({ callClass: o.callClass, model: o.model, capUsd: o.capUsd, task: o.task, env: o.env });
  // 2) WINDOW — the authorization's time bound. Caller-supplied windowMs (the batch's expected max duration),
  //    else a conservative default. windowEnd bounds which subject-less rows this marker traces (never open-ended).
  const start = o.nowIso || new Date().toISOString();
  const windowMs = Number.isFinite(o.windowMs) && Number(o.windowMs) > 0 ? Number(o.windowMs) : 6 * 60 * 60 * 1000;
  const end = new Date(Date.parse(start) + windowMs).toISOString();
  // 3) EMIT — write the batch marker BEFORE returning. If this fails, the batch is NOT authorized to run.
  const marker = {
    fetch_method: "batch-marker",
    cost_usd_estimated: 0,
    status: "skipped",
    started_at: start,
    created_at: start,
    model: o.model,
    intelligence_item_id: null,
    source_id: null,
    errors: [{ batchMarker: { task: o.task, model: o.model, capUsd: o.capUsd, windowStart: start, windowEnd: end } }],
  };
  const { data, error } = await sb.from("agent_runs").insert(marker).select("id").single();
  if (error) throw new Error(`metered batch marker write failed — batch NOT authorized to run unmarked: ${error.message}`);
  return { ...auth, markerId: data?.id, windowStart: start, windowEnd: end };
}
