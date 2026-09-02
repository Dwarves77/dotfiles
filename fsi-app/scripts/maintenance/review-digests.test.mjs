// Run: node --test scripts/maintenance/review-digests.test.mjs — no DB, no filesystem, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, UPSTREAM_SCRIPT } from "./review-digests.mjs";

test("dry, script absent: reports NOT PRESENT, exits 0, nothing run", async () => {
  const r = await main({ mode: "dry" }, { scriptExists: () => false, runScript: async () => { throw new Error("must not run"); } });
  assert.equal(r.step, "review-digests");
  assert.equal(r.counts.script_present, false);
  assert.match(r.note, /NOT PRESENT/);
  assert.match(r.note, new RegExp(UPSTREAM_SCRIPT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(r.applied, 0);
  assert.deepEqual(r.read_back, {});
  assert.equal(r.exitCode, 0);
});

test("apply, script absent: fails CLEARLY, exit 1, nothing run", async () => {
  const r = await main({ mode: "apply" }, { scriptExists: () => false, runScript: async () => { throw new Error("must not run"); } });
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /NOT PRESENT/);
});

test("dry, script present: reports present, does not run it", async () => {
  let ran = false;
  const r = await main({ mode: "dry" }, { scriptExists: () => true, runScript: async () => { ran = true; return { code: 0 }; } });
  assert.equal(r.counts.script_present, true);
  assert.equal(ran, false);
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 0);
});

test("apply, script present: runs it with --out, reports success, read_back stays empty by design", async () => {
  let calledWith = null;
  const r = await main(
    { mode: "apply", out: "/tmp/review-digests-test" },
    { scriptExists: () => true, runScript: async (outDir) => { calledWith = outDir; return { code: 0 }; } },
  );
  assert.equal(calledWith, "/tmp/review-digests-test");
  assert.equal(r.applied, 1);
  assert.deepEqual(r.read_back, {});
  assert.equal(r.exitCode, 0);
});

test("apply, script present but exits non-zero: treated as a failed dispatch", async () => {
  const r = await main(
    { mode: "apply" },
    { scriptExists: () => true, runScript: async () => ({ code: 3, stderr: "boom" }) },
  );
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /exited 3/);
});

test("out dir defaults when not passed (uses defaultOutDir convention)", async () => {
  const r = await main({ mode: "dry" }, { scriptExists: () => true, runScript: async () => ({ code: 0 }) });
  assert.match(r.counts.out_dir, /maintenance-review-digests/);
});
