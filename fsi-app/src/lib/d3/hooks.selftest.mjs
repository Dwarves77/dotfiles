// D3 ingestion hooks — LAYER 1 (known-answer) + LAYER 2 (inject-error / fail-open).
// Run: node --test src/lib/d3/hooks.selftest.mjs
//
// The condition operator set for wire-now: prove (a) a FINDING downgrades to the safe
// outcome, (b) a D3 ERROR is passthrough and NEVER throws (a guard that throws-and-
// blocks is what wedges ingestion), (c) the heartbeat fires either way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { d3GuardAdmission, d3GuardRejection, d3AuditEvent, admissionOutcome, rejectionOutcome } from "./hooks.mjs";

// stub Supabase client: records inserts; can be told to throw or return an error.
function stub(opts = {}) {
  const inserts = [];
  return {
    inserts,
    from(table) {
      return {
        insert: async (row) => {
          if (opts.throwOn && opts.throwOn(table)) throw new Error(`stub ${table}.insert threw`);
          if (opts.errorOn && opts.errorOn(table)) return { error: { message: opts.errorOn(table) } };
          inserts.push({ table, row });
          return { error: null };
        },
      };
    },
  };
}
const ins = (c, t) => c.inserts.filter((x) => x.table === t);

// ───────── LAYER 1 — known-answer pairs ─────────

test("L1 pure outcomes — unreliable method -> conservative; reliable -> route default (pair)", () => {
  assert.equal(admissionOutcome("plain-fetch-reachability"), "provisional");
  assert.equal(admissionOutcome("browserlessRender"), "active");
  assert.equal(rejectionOutcome("plain-fetch-reachability"), "quarantine");
  assert.equal(rejectionOutcome("dns-resolved"), "evict");
});

test("L1 admission guard — FINDING downgrades to provisional + flags; CLEAN stays active, no flag", async () => {
  const bad = stub();
  const rBad = await d3GuardAdmission(bad, { candidateUrl: "https://x.gov", method: "plain-fetch-reachability" });
  assert.deepEqual([rBad.outcome, rBad.flagged, rBad.audited], ["provisional", true, true]);
  assert.equal(ins(bad, "integrity_flags").length, 1);     // finding flagged
  assert.equal(ins(bad, "d3_runs").length, 1);             // heartbeat fired

  const good = stub();
  const rGood = await d3GuardAdmission(good, { candidateUrl: "https://y.gov", method: "browserlessRender" });
  assert.deepEqual([rGood.outcome, rGood.flagged], ["active", false]);
  assert.equal(ins(good, "integrity_flags").length, 0);    // clean -> no flag
  assert.equal(ins(good, "d3_runs").length, 1);            // heartbeat still fires
});

test("L1 rejection guard — FINDING quarantines (not evict); CLEAN evicts (the 420-class pair)", async () => {
  const bad = stub();
  const r = await d3GuardRejection(bad, { candidateUrl: "https://eur-lex.europa.eu", method: "plain-fetch-reachability" });
  assert.equal(r.outcome, "quarantine");                   // NOT evicted -> the 420 prevented
  assert.equal(ins(bad, "integrity_flags").length, 1);
  const good = stub();
  assert.equal((await d3GuardRejection(good, { candidateUrl: "https://dead.example", method: "dns-resolved" })).outcome, "evict");
});

test("L1 async audit — flags only checks that trip; heartbeats regardless", async () => {
  const c = stub();
  const r = await d3AuditEvent(c, { scope: "data", event: "ingest:scan", checks: [
    async () => null,                                          // clean check
    async () => ({ subjectRef: "scan:1", description: "tripped" }), // finding
  ] });
  assert.equal(r.nLoud, 1);
  assert.equal(ins(c, "integrity_flags").length, 1);
  assert.equal(ins(c, "d3_runs").length, 1);
});

// ───────── LAYER 2 — inject-error / fail-open (the wire-now condition) ─────────

test("L2 fail-open — a write that THROWS is swallowed; guard never throws and the SAFE outcome STANDS", async () => {
  const throwsFlag = stub({ throwOn: (t) => t === "integrity_flags" });
  // flag()/heartbeat() self-swallow their write errors, so a finding's CONSERVATIVE
  // outcome stands even when the audit-trail write fails — stronger than passthrough:
  // a finding is never lost to the unsafe side. And the guard never throws (no wedge).
  const settled = await d3GuardAdmission(throwsFlag, { candidateUrl: "https://x.gov", method: "plain-fetch-reachability" })
    .then((v) => v, () => "THREW");
  assert.notEqual(settled, "THREW");           // never wedges ingestion
  assert.equal(settled.outcome, "provisional"); // safe outcome stands despite the failed flag-write
});

test("L2 fail-open — guard whose heartbeat write THROWS still returns its decision", async () => {
  const throwsHb = stub({ throwOn: (t) => t === "d3_runs" });
  const r = await d3GuardRejection(throwsHb, { candidateUrl: "https://eur-lex.europa.eu", method: "plain-fetch-reachability" });
  // heartbeat throwing must not stop the conservative decision from being returned
  assert.equal(["quarantine", "evict"].includes(r.outcome), true);
});

test("L2 mutation — the try/catch is load-bearing: a no-catch guard would propagate the throw", async () => {
  const throwsAll = stub({ throwOn: () => true });
  // real guard: resolves to a value (never rejects)
  const real = await d3GuardAdmission(throwsAll, { candidateUrl: "https://x.gov", method: "plain-fetch-reachability" }).then(() => "resolved", () => "threw");
  assert.equal(real, "resolved");
  // broken guard (no try/catch) modeled: awaiting a throwing op rejects
  const brokenGuard = async (sb) => { await sb.from("integrity_flags").insert({}); return { outcome: "x" }; };
  const broken = await brokenGuard(throwsAll).then(() => "resolved", () => "threw");
  assert.equal(broken, "threw");
  assert.notEqual(real, broken);          // real never wedges; broken would
});

test("L2 async audit — a check that THROWS produces no flag but does not break the hook", async () => {
  const c = stub();
  const r = await d3AuditEvent(c, { scope: "data", event: "ingest:fetch", checks: [
    async () => { throw new Error("check blew up"); },
    async () => ({ subjectRef: "f:1", description: "ok finding" }),
  ] });
  assert.equal(r.audited, true);          // hook survived the throwing check
  assert.equal(r.nLoud, 1);               // the good check still produced its flag
});
