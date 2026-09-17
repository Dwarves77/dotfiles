#!/usr/bin/env node
// io-preflight.mjs - D32 (defect-fix-plan-2026-09-12.md, lane L21), part (c): a pre-flight IO check the
// brief-apply driver (apply-record-briefs.mjs) runs before the first item of an --execute run. Two
// independent refusal branches, either one enough to refuse:
//
//   1. COOLDOWN: the last brief_apply_runs row (read via readLastApplyRun) is too recent - either it
//      finished within --cooldown-min minutes of now, or it has no finished_at and started less than
//      IN_FLIGHT_STALE_MIN minutes ago (still running, or crashed without recording an outcome). An OLDER
//      null-finished_at row is ignored (informational only) rather than refusing forever on a row this
//      module has no way to know is stale vs. abandoned.
//   2. DISK SAMPLE: two Prometheus metrics samples SAMPLE_GAP_MS apart from the project's own metrics
//      endpoint (verified live by the coordinator on 2026-09-16 [CONFIRMED]: `GET
//      https://<project-ref>.supabase.co/customer/v1/privileged/metrics`, HTTP basic auth user
//      `service_role`, password the service role key, Prometheus text ~244 KB, per-device counters
//      `node_disk_read_bytes_total{...service_type="db",device="..."}` and
//      `node_disk_io_time_seconds_total{...}`). For the busiest db device (by io-time delta), a read
//      throughput over --io-read-mbps-max MB/s or a busy fraction (io-time delta / elapsed seconds) over
//      --io-busy-max refuses. A non-200, a timeout, or an unparseable body does NOT refuse - it logs
//      "pre-flight: metrics unavailable (<why>), continuing on cooldown alone" and the cooldown check
//      alone decides.
//
// PURE CORE (no I/O, fully unit-tested against fixtures/fakes): decidePreflight, parseDiskCounters.
// I/O-BEARING (fetch/sleep/DB injected, exercised against fakes): sampleDiskCounters, readLastApplyRun,
// recordApplyRunStart, recordApplyRunFinish, preflightOrRefuse (the driver's own single call site).
//
// Imported by scripts/turns/apply-record-briefs.mjs (module-liveness gate F25's production importer).

import { guardedUpdate } from "../lib/db.mjs";

// ── Tunable thresholds, every one a named constant ──────────────────────────────────────────────────────

export const DEFAULT_COOLDOWN_MIN = 30;
// A brief_apply_runs row with finished_at NULL that started less than this long ago is presumed still
// running (or crashed without recording an outcome) - refuse. Older null rows are ignored: this module has
// no positive evidence they are abandoned rather than a run whose finally-update itself failed, and
// refusing forever on that ambiguity would wedge every future dispatch.
export const IN_FLIGHT_STALE_MIN = 60;
// [HYPOTHESIS]: calibrate both from the first metered runs (docs/runbooks/MAINTENANCE-RUNBOOK.md
// section 57) - these are starting points, not measured limits of the small-tier burst budget.
export const DEFAULT_IO_BUSY_MAX = 0.5;
export const DEFAULT_IO_READ_MBPS_MAX = 40;

export const SAMPLE_GAP_MS = 30000;
export const REQUEST_TIMEOUT_MS = 10000;
export const METRICS_PATH = "/customer/v1/privileged/metrics";

export const PREFLIGHT_STOP_REASON = "preflight_refused";

// D32's one row-mutating write (discipline rule 015: an UPDATE of an existing row must route through the
// guarded path -- scripts/lib/db.mjs's guardedUpdate, reversible via a prior-value snapshot and
// skill-cited). recordApplyRunStart's own INSERT is exempt from rule 015 (additive, not a mutation of
// existing state), so it keeps its plain `sb.from(...).insert(...)` call below.
export const CITE = Object.freeze({
  skill: "defect-fix-plan-2026-09-12 D32 (lane L21, 2026-09-16)",
  reason:
    "brief_apply_runs is this driver's own durable run record (migration 322): the update at a run's " +
    "finish completes the SAME row this run inserted at its own start (recordApplyRunStart), later read " +
    "back by the next run's own pre-flight cooldown check (readLastApplyRun/decidePreflight).",
});

// ── Pure core ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Parses Prometheus text-exposition-format metrics into per-device disk counters, filtered to
 * `service_type="db"` rows only (a non-db row, e.g. `service_type="compute"`, is ignored). Pure - no I/O.
 * @param {string} text
 * @returns {Record<string, {readBytes: number, ioTimeSeconds: number}>}
 */
export function parseDiskCounters(text) {
  const result = {};
  const metricRe = /^(node_disk_read_bytes_total|node_disk_io_time_seconds_total)\{([^}]*)\}\s+([0-9.eE+-]+)\s*$/;
  for (const rawLine of String(text ?? "").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(metricRe);
    if (!m) continue;
    const [, metric, labelsRaw, valueRaw] = m;
    const labels = {};
    for (const pair of labelsRaw.split(",")) {
      const lm = pair.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"([^"]*)"$/);
      if (lm) labels[lm[1]] = lm[2];
    }
    if (labels.service_type !== "db") continue;
    const device = labels.device;
    if (!device) continue;
    const value = Number.parseFloat(valueRaw);
    if (!Number.isFinite(value)) continue;
    if (!result[device]) result[device] = { readBytes: 0, ioTimeSeconds: 0 };
    if (metric === "node_disk_read_bytes_total") result[device].readBytes = value;
    else result[device].ioTimeSeconds = value;
  }
  return result;
}

/**
 * Decides whether the apply driver may proceed. Pure - `now`/`lastRun`/`sample` are all caller-supplied,
 * so this is fully deterministic and unit-tested without a clock, a database, or a network call.
 * @param {{now: Date|string, lastRun: {run_id:string, started_at:string, finished_at:string|null}|null,
 *   cooldownMinutes?: number, sample: {device:string, readMbps:number, busyFraction:number}|null,
 *   busyMax?: number, readMbpsMax?: number}} args
 * @returns {{ok: boolean, reason: string|null}}
 */
export function decidePreflight({
  now,
  lastRun,
  cooldownMinutes = DEFAULT_COOLDOWN_MIN,
  sample,
  busyMax = DEFAULT_IO_BUSY_MAX,
  readMbpsMax = DEFAULT_IO_READ_MBPS_MAX,
}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

  if (lastRun) {
    if (lastRun.finished_at) {
      const finishedMs = new Date(lastRun.finished_at).getTime();
      const minutesSince = (nowMs - finishedMs) / 60000;
      if (minutesSince < cooldownMinutes) {
        return {
          ok: false,
          reason:
            `cooldown: the previous run (${lastRun.run_id}) finished ${minutesSince.toFixed(1)} minute(s) ago, ` +
            `under the ${cooldownMinutes}-minute cooldown.`,
        };
      }
    } else {
      const startedMs = new Date(lastRun.started_at).getTime();
      const minutesSinceStart = (nowMs - startedMs) / 60000;
      if (minutesSinceStart < IN_FLIGHT_STALE_MIN) {
        return {
          ok: false,
          reason:
            `in-flight: the previous run (${lastRun.run_id}) started ${minutesSinceStart.toFixed(1)} minute(s) ago ` +
            `and has no finished_at - it may still be running or may have crashed; refusing until ` +
            `${IN_FLIGHT_STALE_MIN} minute(s) have passed since it started.`,
        };
      }
      // A stale null-finished_at row (older than IN_FLIGHT_STALE_MIN) is ignored - informational only,
      // never a refusal on its own (see this module's own header on why).
    }
  }

  if (sample) {
    if (sample.busyFraction > busyMax) {
      return {
        ok: false,
        reason: `disk busy: device ${sample.device} busy fraction ${sample.busyFraction.toFixed(3)} exceeds --io-busy-max ${busyMax}.`,
      };
    }
    if (sample.readMbps > readMbpsMax) {
      return {
        ok: false,
        reason: `disk read throughput: device ${sample.device} ${sample.readMbps.toFixed(1)} MB/s exceeds --io-read-mbps-max ${readMbpsMax}.`,
      };
    }
  }

  return { ok: true, reason: null };
}

// ── I/O-bearing (fetch/sleep/db injected) ───────────────────────────────────────────────────────────────

/** Derives the project's metrics endpoint from NEXT_PUBLIC_SUPABASE_URL's own host. Pure string
 *  manipulation, but grouped here (not in the pure-core section above) since its only caller is the
 *  I/O-bearing sampleDiskCounters path. Returns null when supabaseUrl does not parse as a URL. */
export function deriveMetricsUrl(supabaseUrl) {
  try {
    const u = new URL(String(supabaseUrl));
    return `https://${u.hostname}${METRICS_PATH}`;
  } catch {
    return null;
  }
}

async function fetchMetricsOnce(fetchImpl, url, serviceRoleKey) {
  const auth = `Basic ${Buffer.from(`service_role:${serviceRoleKey}`).toString("base64")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers: { Authorization: auth }, signal: controller.signal });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const text = await res.text();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Takes two Prometheus metrics samples `gapMs` apart and computes the busiest db device's read throughput
 * (MB/s) and busy fraction (io-time delta / elapsed seconds) between them. A non-200, a timeout, or an
 * unparseable/empty body on EITHER request returns `{ok:false, reason}` - never throws; the caller (see
 * preflightOrRefuse, below) treats that as "metrics unavailable, continue on cooldown alone", never a
 * refusal on its own.
 * @param {{fetchImpl: typeof fetch, url: string, serviceRoleKey: string, gapMs?: number,
 *   sleep?: (ms:number) => Promise<void>}} args
 * @returns {Promise<{ok:true, device:string, readMbps:number, busyFraction:number, elapsedSeconds:number} | {ok:false, reason:string}>}
 */
export async function sampleDiskCounters({ fetchImpl, url, serviceRoleKey, gapMs = SAMPLE_GAP_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const first = await fetchMetricsOnce(fetchImpl, url, serviceRoleKey);
  if (!first.ok) return { ok: false, reason: first.reason };
  const firstCounters = parseDiskCounters(first.text);
  const t0 = Date.now();

  await sleep(gapMs);

  const second = await fetchMetricsOnce(fetchImpl, url, serviceRoleKey);
  if (!second.ok) return { ok: false, reason: second.reason };
  const secondCounters = parseDiskCounters(second.text);
  const elapsedSeconds = Math.max((Date.now() - t0) / 1000, 0.001);

  const devices = new Set([...Object.keys(firstCounters), ...Object.keys(secondCounters)]);
  if (devices.size === 0) return { ok: false, reason: "no db-service disk devices found in metrics" };

  let busiestDevice = null;
  let busiestIoTimeDelta = -Infinity;
  let busiestReadBytesDelta = 0;
  for (const device of devices) {
    const f = firstCounters[device] ?? { readBytes: 0, ioTimeSeconds: 0 };
    const s = secondCounters[device] ?? { readBytes: 0, ioTimeSeconds: 0 };
    const ioTimeDelta = Math.max(0, s.ioTimeSeconds - f.ioTimeSeconds);
    const readBytesDelta = Math.max(0, s.readBytes - f.readBytes);
    if (ioTimeDelta > busiestIoTimeDelta) {
      busiestIoTimeDelta = ioTimeDelta;
      busiestReadBytesDelta = readBytesDelta;
      busiestDevice = device;
    }
  }

  return {
    ok: true,
    device: busiestDevice,
    readMbps: busiestReadBytesDelta / (1024 * 1024) / elapsedSeconds,
    busyFraction: busiestIoTimeDelta / elapsedSeconds,
    elapsedSeconds,
  };
}

/** The latest brief_apply_runs row by started_at, or null when the table is empty. @param {object} sb */
export async function readLastApplyRun(sb) {
  const { data, error } = await sb
    .from("brief_apply_runs")
    .select("run_id, mode, started_at, finished_at, bytes_read, items_applied, stop_reason")
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`brief_apply_runs read failed: ${error.message}`);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

/** Inserts this run's own brief_apply_runs row at start. Best-effort: a failed write logs and never fails
 *  the run (the driver's own record of what happened is the harness-runs JSON artifact, written
 *  unconditionally by writeRunArtifact regardless of this table). @param {object} sb */
export async function recordApplyRunStart(sb, { runId, startedAt }, { log = () => {} } = {}) {
  try {
    const { error } = await sb.from("brief_apply_runs").insert({ run_id: runId, mode: "apply", started_at: startedAt });
    if (error) log(`brief_apply_runs insert failed (best-effort, run continues): ${error.message}`);
  } catch (e) {
    log(`brief_apply_runs insert failed (best-effort, run continues): ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Updates this run's own brief_apply_runs row when the run ends (main()'s own finally block calls this
 *  however far the run got). Best-effort, same posture as recordApplyRunStart. Routes through db.mjs's
 *  guardedUpdate (discipline rule 015: an UPDATE of an existing row must be reversible and skill-cited) -
 *  `updateFn` is test-only DI, defaulting to the real guarded call. */
export async function recordApplyRunFinish(
  { runId, finishedAt, bytesRead, itemsApplied, stopReason },
  { log = () => {}, updateFn = defaultUpdateFn } = {},
) {
  try {
    await updateFn({ runId, finishedAt, bytesRead, itemsApplied, stopReason });
  } catch (e) {
    log(`brief_apply_runs update failed (best-effort): ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function defaultUpdateFn({ runId, finishedAt, bytesRead, itemsApplied, stopReason }) {
  const patch = { finished_at: finishedAt, bytes_read: bytesRead, items_applied: itemsApplied, stop_reason: stopReason };
  await guardedUpdate("brief_apply_runs", (qb) => qb.eq("run_id", runId), patch, { cite: CITE, select: "run_id" });
}

/**
 * The driver's own single pre-flight call site (apply mode only, before the first item, after the plan is
 * built): reads the last apply run, samples the disk metrics endpoint when a URL/key are given (skips the
 * sample and logs when either is absent, e.g. no db creds available at all in this dispatch, or the
 * project ref could not be derived), and returns decidePreflight's own `{ok, reason}` shape.
 * @param {{sb:object, now?: Date, cooldownMinutes?: number, metricsUrl?: string|null,
 *   serviceRoleKey?: string|null, busyMax?: number, readMbpsMax?: number, gapMs?: number,
 *   fetchImpl?: typeof fetch, sleep?: (ms:number)=>Promise<void>, sampleFn?: typeof sampleDiskCounters,
 *   log?: (msg:string)=>void}} args
 */
export async function preflightOrRefuse({
  sb,
  now = new Date(),
  cooldownMinutes = DEFAULT_COOLDOWN_MIN,
  metricsUrl = null,
  serviceRoleKey = null,
  busyMax = DEFAULT_IO_BUSY_MAX,
  readMbpsMax = DEFAULT_IO_READ_MBPS_MAX,
  gapMs = SAMPLE_GAP_MS,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  sampleFn = sampleDiskCounters,
  log = () => {},
}) {
  const lastRun = await readLastApplyRun(sb);

  let sample = null;
  if (metricsUrl && serviceRoleKey) {
    const sampled = await sampleFn({ fetchImpl, url: metricsUrl, serviceRoleKey, gapMs, sleep });
    if (sampled.ok) {
      sample = sampled;
    } else {
      log(`pre-flight: metrics unavailable (${sampled.reason}), continuing on cooldown alone`);
    }
  } else {
    log("pre-flight: metrics unavailable (no metrics URL/service-role key given), continuing on cooldown alone");
  }

  const decision = decidePreflight({ now, lastRun, cooldownMinutes, sample, busyMax, readMbpsMax });
  // A PASS prints its numbers too (2026-09-16, first metered apply): the run 35174140834 log showed only a
  // 30 s gap between "selected" and "io budget" where the sample ran, so nothing could be calibrated from
  // it. The three thresholds are [HYPOTHESIS] constants until real passes have been read back.
  if (decision.ok) {
    const sinceLast =
      lastRun && lastRun.finished_at
        ? `last apply finished ${Math.round((now.getTime() - new Date(lastRun.finished_at).getTime()) / 60000)} min ago`
        : "no finished apply on record";
    const disk = sample
      ? `disk ${sample.device}: busy ${sample.busyFraction.toFixed(3)} (max ${busyMax}), read ${sample.readMbps.toFixed(1)} MB/s (max ${readMbpsMax}) over ${sample.elapsedSeconds.toFixed(0)} s`
      : "no disk sample";
    log(`pre-flight: pass; cooldown ${cooldownMinutes} min, ${sinceLast}; ${disk}`);
  }
  return decision;
}
