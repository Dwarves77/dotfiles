// io-preflight.test.mjs - D32 (defect-fix-plan-2026-09-12.md, lane L21), part (c). Covers the pure core
// (decidePreflight, parseDiskCounters) directly, and the I/O-bearing pieces (sampleDiskCounters,
// readLastApplyRun, preflightOrRefuse) against fake fetch/sleep/db, the same injected-fake discipline
// apply-record-briefs.test.mjs already uses for its own fakeSb.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidePreflight,
  parseDiskCounters,
  sampleDiskCounters,
  readLastApplyRun,
  recordApplyRunStart,
  recordApplyRunFinish,
  preflightOrRefuse,
  deriveMetricsUrl,
  DEFAULT_COOLDOWN_MIN,
  IN_FLIGHT_STALE_MIN,
  DEFAULT_IO_BUSY_MAX,
  DEFAULT_IO_READ_MBPS_MAX,
  METRICS_PATH,
} from "./io-preflight.mjs";

// ── decidePreflight ──────────────────────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-09-16T12:00:00.000Z");

test("decidePreflight: refuses on cooldown (previous run finished within cooldownMinutes)", () => {
  const lastRun = { run_id: "brief-apply-run-010", started_at: "2026-09-16T11:00:00.000Z", finished_at: "2026-09-16T11:50:00.000Z" };
  const r = decidePreflight({ now: NOW, lastRun, cooldownMinutes: 30, sample: null });
  assert.equal(r.ok, false);
  assert.match(r.reason, /cooldown/);
  assert.match(r.reason, /brief-apply-run-010/);
});

test("decidePreflight: passes once the cooldown has elapsed", () => {
  const lastRun = { run_id: "brief-apply-run-010", started_at: "2026-09-16T11:00:00.000Z", finished_at: "2026-09-16T11:29:00.000Z" };
  const r = decidePreflight({ now: NOW, lastRun, cooldownMinutes: 30, sample: null });
  assert.equal(r.ok, true);
  assert.equal(r.reason, null);
});

test("decidePreflight: refuses on an in-flight row (finished_at null, started less than IN_FLIGHT_STALE_MIN ago)", () => {
  const lastRun = { run_id: "brief-apply-run-011", started_at: "2026-09-16T11:30:00.000Z", finished_at: null };
  const r = decidePreflight({ now: NOW, lastRun, sample: null });
  assert.equal(r.ok, false);
  assert.match(r.reason, /in-flight/);
  assert.match(r.reason, /brief-apply-run-011/);
});

test("decidePreflight: ignores a STALE null row (started more than IN_FLIGHT_STALE_MIN ago) - passes", () => {
  const lastRun = { run_id: "brief-apply-run-009", started_at: "2026-09-16T10:00:00.000Z", finished_at: null };
  assert.ok((NOW - new Date(lastRun.started_at)) / 60000 > IN_FLIGHT_STALE_MIN, "fixture must exceed the stale threshold");
  const r = decidePreflight({ now: NOW, lastRun, sample: null });
  assert.equal(r.ok, true);
});

test("decidePreflight: no lastRun at all (first-ever apply) never refuses on the cooldown branch", () => {
  const r = decidePreflight({ now: NOW, lastRun: null, sample: null });
  assert.equal(r.ok, true);
});

test("decidePreflight: refuses on busy fraction over the threshold", () => {
  const r = decidePreflight({ now: NOW, lastRun: null, sample: { device: "nvme0n1", readMbps: 1, busyFraction: 0.9 }, busyMax: 0.5 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /disk busy/);
  assert.match(r.reason, /nvme0n1/);
});

test("decidePreflight: refuses on read throughput over the threshold", () => {
  const r = decidePreflight({ now: NOW, lastRun: null, sample: { device: "nvme0n1", readMbps: 80, busyFraction: 0.1 }, readMbpsMax: 40 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /disk read throughput/);
});

test("decidePreflight: passes when all clear (no lastRun, sample under both thresholds)", () => {
  const r = decidePreflight({ now: NOW, lastRun: null, sample: { device: "nvme0n1", readMbps: 5, busyFraction: 0.05 } });
  assert.equal(r.ok, true);
  assert.equal(r.reason, null);
});

test("decidePreflight: passes when sample is null (metrics unavailable) - cooldown alone decides", () => {
  const lastRun = { run_id: "r1", started_at: "2026-09-16T09:00:00.000Z", finished_at: "2026-09-16T09:05:00.000Z" };
  const r = decidePreflight({ now: NOW, lastRun, cooldownMinutes: 30, sample: null });
  assert.equal(r.ok, true);
});

test("decidePreflight: default constants are the documented values", () => {
  assert.equal(DEFAULT_COOLDOWN_MIN, 30);
  assert.equal(IN_FLIGHT_STALE_MIN, 60);
  assert.equal(DEFAULT_IO_BUSY_MAX, 0.5);
  assert.equal(DEFAULT_IO_READ_MBPS_MAX, 40);
});

// ── parseDiskCounters ────────────────────────────────────────────────────────────────────────────────────

// A 12-line fixture cut from the real endpoint shape (coordinator-verified live 2026-09-16 [CONFIRMED]):
// two db devices, two counters each, plus one non-db service_type row per metric that must be ignored.
const METRICS_FIXTURE = [
  "# HELP node_disk_read_bytes_total Total number of bytes read from the block device.",
  "# TYPE node_disk_read_bytes_total counter",
  'node_disk_read_bytes_total{service_type="db",device="nvme0n1"} 100000',
  'node_disk_read_bytes_total{service_type="db",device="nvme1n1"} 50000',
  'node_disk_read_bytes_total{service_type="compute",device="nvme0n1"} 999999',
  "# HELP node_disk_io_time_seconds_total Total seconds spent doing I/Os.",
  "# TYPE node_disk_io_time_seconds_total counter",
  'node_disk_io_time_seconds_total{service_type="db",device="nvme0n1"} 10.5',
  'node_disk_io_time_seconds_total{service_type="db",device="nvme1n1"} 2.25',
  'node_disk_io_time_seconds_total{service_type="compute",device="nvme0n1"} 500.0',
  "",
  "",
].join("\n");

test("parseDiskCounters: reads both db devices' read_bytes and io_time counters", () => {
  const parsed = parseDiskCounters(METRICS_FIXTURE);
  assert.deepEqual(parsed.nvme0n1, { readBytes: 100000, ioTimeSeconds: 10.5 });
  assert.deepEqual(parsed.nvme1n1, { readBytes: 50000, ioTimeSeconds: 2.25 });
});

test("parseDiskCounters: a non-db service_type row is ignored entirely (never leaks into a device key)", () => {
  const parsed = parseDiskCounters(METRICS_FIXTURE);
  assert.equal(Object.keys(parsed).length, 2, "only the two db devices, never a compute-tagged row");
});

test("parseDiskCounters: empty/garbage text yields an empty object, never throws", () => {
  assert.deepEqual(parseDiskCounters(""), {});
  assert.deepEqual(parseDiskCounters("not prometheus at all\n{}{}garbage"), {});
  assert.deepEqual(parseDiskCounters(undefined), {});
});

// ── sampleDiskCounters ───────────────────────────────────────────────────────────────────────────────────

function fixtureWithDeltas(readDelta, ioTimeDelta) {
  return [
    `node_disk_read_bytes_total{service_type="db",device="nvme0n1"} ${100000 + readDelta}`,
    `node_disk_io_time_seconds_total{service_type="db",device="nvme0n1"} ${10 + ioTimeDelta}`,
  ].join("\n");
}

test("sampleDiskCounters: with a fake fetch and fake sleep, computes the read MB/s and busy-fraction deltas for the busiest device", async () => {
  const responses = [fixtureWithDeltas(0, 0), fixtureWithDeltas(10 * 1024 * 1024, 15)];
  let call = 0;
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => responses[call++] });
  const sleepCalls = [];
  const sleep = async (ms) => {
    sleepCalls.push(ms);
  };

  const r = await sampleDiskCounters({ fetchImpl, url: "https://x.supabase.co/customer/v1/privileged/metrics", serviceRoleKey: "k", gapMs: 30000, sleep });
  assert.equal(r.ok, true);
  assert.equal(r.device, "nvme0n1");
  assert.deepEqual(sleepCalls, [30000], "the gap is awaited via the injected sleep, never a real timer");
  // elapsedSeconds is measured off Date.now(), not the injected gapMs, so assert on the DERIVED ratios
  // (readMbps == readBytesDelta/1MiB/elapsedSeconds, busyFraction == ioTimeDelta/elapsedSeconds) rather
  // than a hardcoded number.
  assert.ok(r.elapsedSeconds > 0);
  assert.ok(Math.abs(r.readMbps - 10 / r.elapsedSeconds) < 1e-6);
  assert.ok(Math.abs(r.busyFraction - 15 / r.elapsedSeconds) < 1e-6);
});

test("sampleDiskCounters: a 500 on the FIRST request yields ok:false with the reason, never throws", async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => "" });
  const r = await sampleDiskCounters({ fetchImpl, url: "https://x.supabase.co/x", serviceRoleKey: "k", sleep: async () => {} });
  assert.equal(r.ok, false);
  assert.match(r.reason, /500/);
});

test("sampleDiskCounters: a 500 on the SECOND request (after a good first sample) also yields ok:false with the reason", async () => {
  let call = 0;
  const fetchImpl = async () => {
    call += 1;
    if (call === 1) return { ok: true, status: 200, text: async () => fixtureWithDeltas(0, 0) };
    return { ok: false, status: 500, text: async () => "" };
  };
  const r = await sampleDiskCounters({ fetchImpl, url: "https://x.supabase.co/x", serviceRoleKey: "k", sleep: async () => {} });
  assert.equal(r.ok, false);
  assert.match(r.reason, /500/);
});

test("sampleDiskCounters: a thrown/rejected fetch (network error, or an aborted timeout) yields ok:false with the error message, never throws", async () => {
  const fetchImpl = async () => {
    throw new Error("ECONNRESET");
  };
  const r = await sampleDiskCounters({ fetchImpl, url: "https://x.supabase.co/x", serviceRoleKey: "k", sleep: async () => {} });
  assert.equal(r.ok, false);
  assert.match(r.reason, /ECONNRESET/);
});

test("sampleDiskCounters: no db-service devices in either sample yields ok:false, named", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => 'node_disk_read_bytes_total{service_type="compute",device="nvme0n1"} 1' });
  const r = await sampleDiskCounters({ fetchImpl, url: "https://x.supabase.co/x", serviceRoleKey: "k", sleep: async () => {} });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no db-service disk devices/);
});

// ── deriveMetricsUrl ─────────────────────────────────────────────────────────────────────────────────────

test("deriveMetricsUrl: derives the metrics endpoint from the project's own Supabase URL host", () => {
  assert.equal(
    deriveMetricsUrl("https://kwrsbpiseruzbfwjpvsp.supabase.co"),
    `https://kwrsbpiseruzbfwjpvsp.supabase.co${METRICS_PATH}`,
  );
});

test("deriveMetricsUrl: an unparseable URL yields null, never throws", () => {
  assert.equal(deriveMetricsUrl("not a url"), null);
  assert.equal(deriveMetricsUrl(undefined), null);
});

// ── readLastApplyRun / recordApplyRunStart / recordApplyRunFinish (fake sb) ─────────────────────────────

function fakeApplyRunsClient({ selectResult = { data: [], error: null }, insertError = null, updateError = null } = {}) {
  const calls = [];
  const chain = {
    select(cols) {
      calls.push(["select", cols]);
      return chain;
    },
    order(col, opts) {
      calls.push(["order", col, opts]);
      return chain;
    },
    async limit(n) {
      calls.push(["limit", n]);
      return selectResult;
    },
    async insert(row) {
      calls.push(["insert", row]);
      return { error: insertError };
    },
    update(row) {
      calls.push(["update", row]);
      return chain;
    },
    async eq(col, val) {
      calls.push(["eq", col, val]);
      return { error: updateError };
    },
  };
  return {
    calls,
    sb: {
      from(table) {
        calls.push(["from", table]);
        return chain;
      },
    },
  };
}

test("readLastApplyRun: reads the latest row ordered by started_at desc, limit 1", async () => {
  const row = { run_id: "r1", mode: "apply", started_at: "2026-09-16T09:00:00.000Z", finished_at: null, bytes_read: 0, items_applied: 0, stop_reason: null };
  const { sb, calls } = fakeApplyRunsClient({ selectResult: { data: [row], error: null } });
  const r = await readLastApplyRun(sb);
  assert.deepEqual(r, row);
  assert.deepEqual(calls.find((c) => c[0] === "from"), ["from", "brief_apply_runs"]);
  assert.deepEqual(calls.find((c) => c[0] === "order"), ["order", "started_at", { ascending: false }]);
  assert.deepEqual(calls.find((c) => c[0] === "limit"), ["limit", 1]);
});

test("readLastApplyRun: an empty table returns null", async () => {
  const { sb } = fakeApplyRunsClient({ selectResult: { data: [], error: null } });
  assert.equal(await readLastApplyRun(sb), null);
});

test("readLastApplyRun: a read error throws (the driver's own try/catch around preflight is the failure boundary)", async () => {
  const { sb } = fakeApplyRunsClient({ selectResult: { data: null, error: { message: "connection refused" } } });
  await assert.rejects(() => readLastApplyRun(sb), /connection refused/);
});

test("recordApplyRunStart: inserts run_id/mode/started_at", async () => {
  const { sb, calls } = fakeApplyRunsClient();
  await recordApplyRunStart(sb, { runId: "brief-apply-run-020", startedAt: "2026-09-16T12:00:00.000Z" });
  const insertCall = calls.find((c) => c[0] === "insert");
  assert.deepEqual(insertCall[1], { run_id: "brief-apply-run-020", mode: "apply", started_at: "2026-09-16T12:00:00.000Z" });
});

test("recordApplyRunStart: a failed insert is logged, never thrown (best-effort)", async () => {
  const { sb } = fakeApplyRunsClient({ insertError: { message: "relation does not exist" } });
  const logs = [];
  await recordApplyRunStart(sb, { runId: "r1", startedAt: "now" }, { log: (m) => logs.push(m) });
  assert.ok(logs.some((l) => l.includes("relation does not exist")));
});

test("recordApplyRunStart: a thrown insert (network error) is caught and logged, never thrown", async () => {
  const sb = { from: () => ({ insert: async () => { throw new Error("ECONNRESET"); } }) };
  const logs = [];
  await recordApplyRunStart(sb, { runId: "r1", startedAt: "now" }, { log: (m) => logs.push(m) });
  assert.ok(logs.some((l) => l.includes("ECONNRESET")));
});

// recordApplyRunFinish routes its UPDATE through db.mjs's guardedUpdate (discipline rule 015 - an
// existing-row mutation must be reversible/skill-cited, never a raw .update()). `updateFn` is the
// test-only DI seam (defaults to the real guarded call in production, never exercised here - db.mjs's own
// test suite proves guardedUpdate itself).

test("recordApplyRunFinish: the injected updateFn receives runId/finishedAt/bytesRead/itemsApplied/stopReason", async () => {
  let captured = null;
  const updateFn = async (args) => {
    captured = args;
  };
  await recordApplyRunFinish(
    { runId: "brief-apply-run-020", finishedAt: "2026-09-16T12:10:00.000Z", bytesRead: 12345, itemsApplied: 3, stopReason: null },
    { updateFn },
  );
  assert.deepEqual(captured, { runId: "brief-apply-run-020", finishedAt: "2026-09-16T12:10:00.000Z", bytesRead: 12345, itemsApplied: 3, stopReason: null });
});

test("recordApplyRunFinish: a failed update (thrown by updateFn) is logged, never thrown (best-effort)", async () => {
  const updateFn = async () => {
    throw new Error("row not found");
  };
  const logs = [];
  await recordApplyRunFinish({ runId: "r1", finishedAt: "now", bytesRead: 0, itemsApplied: 0, stopReason: null }, { updateFn, log: (m) => logs.push(m) });
  assert.ok(logs.some((l) => l.includes("row not found")));
});

// ── preflightOrRefuse: the driver's own single call site ────────────────────────────────────────────────

test("preflightOrRefuse: a fresh FINISHED row (within cooldown) makes main-path code return the refusal shape", async () => {
  const finishedAt = new Date(NOW.getTime() - 5 * 60000).toISOString(); // 5 minutes ago, under the 30-min default cooldown
  const row = { run_id: "brief-apply-run-030", mode: "apply", started_at: new Date(NOW.getTime() - 6 * 60000).toISOString(), finished_at: finishedAt };
  const { sb } = fakeApplyRunsClient({ selectResult: { data: [row], error: null } });

  const r = await preflightOrRefuse({ sb, now: NOW, metricsUrl: null, serviceRoleKey: null, log: () => {} });
  assert.equal(r.ok, false);
  assert.match(r.reason, /cooldown/);
  assert.match(r.reason, /brief-apply-run-030/);
});

test("preflightOrRefuse: no metrics URL/key given never calls fetch, logs, and decides on cooldown alone", async () => {
  const { sb } = fakeApplyRunsClient({ selectResult: { data: [], error: null } });
  const logs = [];
  const r = await preflightOrRefuse({ sb, now: NOW, metricsUrl: null, serviceRoleKey: null, log: (m) => logs.push(m) });
  assert.equal(r.ok, true);
  assert.ok(logs.some((l) => l.includes("metrics unavailable")));
});

test("preflightOrRefuse: a PASS logs its numbers (cooldown state, busy fraction, MB/s) so the thresholds can be calibrated", async () => {
  const finishedAt = new Date(NOW.getTime() - 90 * 60000).toISOString();
  const row = { run_id: "brief-apply-run-031", mode: "apply", started_at: new Date(NOW.getTime() - 95 * 60000).toISOString(), finished_at: finishedAt };
  const { sb } = fakeApplyRunsClient({ selectResult: { data: [row], error: null } });
  const logs = [];
  const sampleFn = async () => ({ ok: true, device: "nvme0n1", readMbps: 3.2, busyFraction: 0.041, elapsedSeconds: 30 });
  const r = await preflightOrRefuse({ sb, now: NOW, metricsUrl: "https://x.supabase.co/customer/v1/privileged/metrics", serviceRoleKey: "k", sampleFn, log: (m) => logs.push(m) });
  assert.equal(r.ok, true);
  const pass = logs.find((l) => l.startsWith("pre-flight: pass"));
  assert.ok(pass, "a pass line is logged: " + JSON.stringify(logs));
  assert.match(pass, /90 min ago/);
  assert.match(pass, /busy 0.041/);
  assert.match(pass, /3.2 MB/s/);
});

test("preflightOrRefuse: metrics available and clean, no prior run - passes", async () => {
  const { sb } = fakeApplyRunsClient({ selectResult: { data: [], error: null } });
  const sampleFn = async () => ({ ok: true, device: "nvme0n1", readMbps: 1, busyFraction: 0.01, elapsedSeconds: 30 });
  const r = await preflightOrRefuse({ sb, now: NOW, metricsUrl: "https://x/y", serviceRoleKey: "k", sampleFn, log: () => {} });
  assert.equal(r.ok, true);
});

test("preflightOrRefuse: sampleFn failing (metrics unavailable) still passes on cooldown alone, and logs why", async () => {
  const { sb } = fakeApplyRunsClient({ selectResult: { data: [], error: null } });
  const sampleFn = async () => ({ ok: false, reason: "timeout" });
  const logs = [];
  const r = await preflightOrRefuse({ sb, now: NOW, metricsUrl: "https://x/y", serviceRoleKey: "k", sampleFn, log: (m) => logs.push(m) });
  assert.equal(r.ok, true);
  assert.ok(logs.some((l) => l.includes("timeout")));
});
