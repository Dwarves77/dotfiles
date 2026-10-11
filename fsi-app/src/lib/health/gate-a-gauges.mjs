// @ts-check

export const ALARM_GAUGES = Object.freeze([
  "invariant_violations",
  "briefless_verified",
  "no_gatestate_verified",
  "verified_failing_revalidation",
]);
const INFO_GAUGES = Object.freeze(["verified_gen_ver_null_info"]);
export const GAUGE_NAMES = Object.freeze([...ALARM_GAUGES, ...INFO_GAUGES]);

const EMPTY_PREFIX = "gate_a_health cache empty";
const STALE_RE = /^gate_a_health cache stale since (.+)$/;

/** @param {string} state @param {string} reason @param {string|null} computed_at */
function allGauges(state, reason, computed_at) {
  /** @type {Record<string, any>} */
  const g = {};
  for (const n of GAUGE_NAMES) g[n] = { value: null, state, computed_at, reason };
  return g;
}

/** Human age between an ISO-ish timestamp and now, or null when unparseable. @param {string} since @param {Date} now */
function ageText(since, now) {
  const t = Date.parse(since);
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.round((now.getTime() - t) / 60000));
  return mins >= 120 ? `${Math.round(mins / 60)} hours` : `${mins} minutes`;
}

/**
 * Pure shaper for one gate_a_health() result.
 * @param {{ data?: any, error?: { message: string } | null, thrown?: string | null, now?: Date }} r
 */
export function shapeGateAHealth({ data = null, error = null, thrown = null, now = new Date() }) {
  if (thrown) return allGauges("unreadable", `gate_a_health threw: ${thrown}`, null);
  if (error) return allGauges("unreadable", `gate_a_health rpc error: ${error.message}`, null);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return allGauges("unreadable", "gate_a_health returned no object", null);
  }
  if (typeof data.error === "string") {
    if (data.error.startsWith(EMPTY_PREFIX)) {
      return allGauges("not_computed", "cache empty: the refresh has never run (it is deliberately unscheduled)", null);
    }
    const m = STALE_RE.exec(data.error);
    if (m) {
      const age = ageText(m[1], now);
      return allGauges(
        "not_computed",
        `cache stale since ${m[1]}${age ? ` (age ${age}, TTL 30 minutes)` : ""}: the refresh is deliberately unscheduled`,
        m[1],
      );
    }
    return allGauges("unreadable", `gate_a_health reported an unrecognised error: ${data.error}`, null);
  }
  const computed_at = typeof data.computed_at === "string" ? data.computed_at : null;
  /** @type {Record<string, any>} */
  const g = {};
  for (const n of GAUGE_NAMES) {
    const v = data[n];
    g[n] = Number.isInteger(v) && v >= 0
      ? { value: v, state: "computed", computed_at, reason: null }
      : { value: null, state: "unreadable", computed_at, reason: `gauge ${n} is missing or not a non-negative integer in the cache payload` };
  }
  return g;
}

/**
 * Calls the RPC through an injected client and shapes the result. Never throws.
 * @param {{ rpc: (name: string) => PromiseLike<{ data: any, error: { message: string } | null }> }} supabase
 * @param {Date} [now]
 */
export async function readGateAHealth(supabase, now = new Date()) {
  try {
    const { data, error } = await supabase.rpc("gate_a_health");
    return shapeGateAHealth({ data, error, now });
  } catch (e) {
    return shapeGateAHealth({ thrown: e instanceof Error ? e.message : "threw", now });
  }
}

/**
 * Probe verdict over the endpoint's `gate_a` object.
 * @param {any} gate_a
 * @returns {{ fail: boolean, lines: string[] }}
 */
export function decideGateAProbe(gate_a) {
  /** @type {string[]} */
  const lines = [];
  let fail = false;
  let notComputed = 0;
  for (const n of ALARM_GAUGES) {
    const g = gate_a && typeof gate_a === "object" ? gate_a[n] : undefined;
    if (!g || typeof g !== "object" || typeof g.state !== "string") {
      lines.push(`ERROR gate_a.${n} state=unreadable (gauge absent or old shape: a bare value where {value,state} is expected), fail-closed`);
      fail = true;
      continue;
    }
    if (g.state === "computed") {
      if (!Number.isInteger(g.value) || g.value < 0) {
        lines.push(`ERROR gate_a.${n} state=unreadable (computed with value ${JSON.stringify(g.value)}), fail-closed`);
        fail = true;
      } else if (g.value > 0) {
        lines.push(`ERROR gate_a.${n} state=computed ALARM value=${g.value} (must be 0)`);
        fail = true;
      } else {
        lines.push(`ok gate_a.${n} state=computed value=0 computed_at=${g.computed_at}`);
      }
    } else if (g.state === "not_computed") {
      notComputed++;
      lines.push(`WARNING gate_a.${n} state=not_computed: ${g.reason}`);
    } else {
      lines.push(`ERROR gate_a.${n} state=${g.state}: ${g.reason ?? "no reason given"}, fail-closed`);
      fail = true;
    }
  }
  if (!fail && notComputed > 0) {
    lines.push(`WARNING ${notComputed} of ${ALARM_GAUGES.length} Gate A alarms are not_computed, not zero: the assertion did not run on live counts`);
  }
  return { fail, lines };
}
