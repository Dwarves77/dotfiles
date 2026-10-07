// loop-fired-evidence-audit.test.mjs (lane GATES-1, 2026-10-04): the attack proof for the committed loop
// firing evidence. Fixture rows only, every dependency injected.
// Run: node --test fsi-app/scripts/verify/loop-fired-evidence-audit.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { auditEntries, readEvidenceFile, runAudit } from "./loop-fired-evidence-audit.mjs";

const live = {
  harness_family: "fetch-drain", run_id: "fetch-drain-run-007", started_at: "2026-10-03T10:00:00+00:00",
  trigger: "workflow_run", github_run_id: 200, upstream_run_id: "100",
};
const entry = {
  hop: "sweep-to-fetch-drain", family: "fetch-drain", run_id: "fetch-drain-run-007", github_run_id: "200",
  upstream_run_id: "100", started_at: "2026-10-03T10:00:00Z", trigger: "workflow_run",
};

test("an entry matching a live row passes (numeric vs text ids and timestamp formats compare equal)", () => {
  assert.deepEqual(auditEntries([entry], [live]), { ok: true, failures: [] });
});

test("ATTACK: a forged entry with no harness_runs row fails the audit", () => {
  const r = auditEntries([{ ...entry, run_id: "fetch-drain-run-999" }], [live]);
  assert.equal(r.ok, false);
  assert.match(r.failures[0], /no harness_runs row with run_id fetch-drain-run-999/);
});

test("ATTACK: a real run id with a forged trigger fails (a manual run dressed as a fired one)", () => {
  const r = auditEntries([entry], [{ ...live, trigger: "workflow_dispatch" }]);
  assert.equal(r.ok, false);
  assert.match(r.failures.join("\n"), /trigger is "workflow_dispatch" in harness_runs/);
});

test("ATTACK: an entry claiming a non-fired trigger fails before any row is consulted", () => {
  const r = auditEntries([{ ...entry, trigger: "manual" }], [live]);
  assert.equal(r.ok, false);
  assert.match(r.failures[0], /not a fired trigger/);
});

test("ATTACK: an edited family, github run id, upstream run id or started_at each fail", () => {
  for (const [field, value, needle] of [
    ["family", "mint", /family is "fetch-drain"/],
    ["github_run_id", "201", /github_run_id is "200"/],
    ["upstream_run_id", "101", /upstream_run_id is "100"/],
    ["started_at", "2026-01-01T00:00:00Z", /started_at is/],
  ]) {
    const r = auditEntries([{ ...entry, [field]: value }], [live]);
    assert.equal(r.ok, false, field);
    assert.match(r.failures.join("\n"), needle, field);
  }
});

test("readEvidenceFile: shape errors are reported, never thrown", () => {
  assert.ok(readEvidenceFile("/x", () => "{ nope").error);
  assert.ok(readEvidenceFile("/x", () => "{}").error);
  assert.deepEqual(readEvidenceFile("/x", () => '{"entries":[]}'), { entries: [] });
});

function deps(text, over = {}) {
  const out = { logs: [], errs: [] };
  return {
    out,
    deps: {
      log: (m) => out.logs.push(m), errorLog: (m) => out.errs.push(m), loadEnv: () => {},
      readFn: () => text, hasCreds: () => true, readAllFn: async () => [live], ...over,
    },
  };
}

test("runAudit: an empty evidence file passes without credentials or a database read", async () => {
  const d = deps('{"entries":[]}', { hasCreds: () => false, readAllFn: async () => { throw new Error("must not read"); } });
  assert.equal(await runAudit(d.deps), 0);
});

test("runAudit: entries with no credentials self-skip with exit 2", async () => {
  const d = deps(JSON.stringify({ entries: [entry] }), { hasCreds: () => false });
  assert.equal(await runAudit(d.deps), 2);
});

test("runAudit: a matching entry exits 0, a forged one exits 1, a DB read error exits 2, a corrupt file exits 1", async () => {
  assert.equal(await runAudit(deps(JSON.stringify({ entries: [entry] })).deps), 0);
  assert.equal(await runAudit(deps(JSON.stringify({ entries: [{ ...entry, run_id: "fetch-drain-run-404" }] })).deps), 1);
  assert.equal(await runAudit(deps(JSON.stringify({ entries: [entry] }), { readAllFn: async () => { throw new Error("x"); } }).deps), 2);
  assert.equal(await runAudit(deps("{ nope").deps), 1);
});

// ── lane CHAIN-1 ruling 1 (2026-10-07): the dispatch-fallback entry on hop 07 ─────────────────────────
const dEntry = {
  hop: "downstream-chain-to-propagation-drain", family: "propagation", run_id: "propagation-run-002", github_run_id: "911",
  upstream_run_id: "901", started_at: "2026-10-03T10:00:00Z", trigger: "workflow_dispatch",
};
const dLive = { harness_family: "propagation", run_id: "propagation-run-002", started_at: "2026-10-03T10:00:00+00:00", trigger: "workflow_dispatch", github_run_id: 911, upstream_run_id: "901" };
const producerRow = { harness_family: "downstream-chain", run_id: "downstream-chain-run-001", started_at: "2026-10-03T09:00:00+00:00", trigger: "workflow_run_forced_dry", github_run_id: "901", upstream_run_id: "555" };

test("a dispatch-fallback entry on hop 07 passes when the producer family holds the upstream run", () => {
  assert.deepEqual(auditEntries([dEntry], [dLive, producerRow]), { ok: true, failures: [] });
});

test("ATTACK: a dispatch-fallback entry whose upstream run has no producer row fails", () => {
  const r = auditEntries([dEntry], [dLive]);
  assert.equal(r.ok, false);
  assert.match(r.failures[0], /no downstream-chain row has github_run_id 901/);
});

test("ATTACK: a workflow_dispatch entry with no upstream_run_id, or on a hop without dispatchFallback, fails", () => {
  assert.equal(auditEntries([{ ...dEntry, upstream_run_id: null }], [{ ...dLive, upstream_run_id: null }, producerRow]).ok, false);
  assert.equal(auditEntries([{ ...entry, trigger: "workflow_dispatch" }], [{ ...live, trigger: "workflow_dispatch" }]).ok, false);
});
