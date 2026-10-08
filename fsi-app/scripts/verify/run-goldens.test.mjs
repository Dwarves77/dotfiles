// run-goldens.test.mjs (lane GATE-9, 2026-10-08): the sibling test run-goldens.mjs never had. AUD-AT-5 listed
// the runner as NOT TESTED by a sibling, so a golden that always exited 2 (FC-4) and goldens spelled in forms
// the glob did not know (FC-5) passed with GOLDENS GREEN. Every case here runs the REAL script over a fixture
// directory and asserts its EXIT STATUS, not only its output. node:test, node: builtins only (no-npm suite).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isGoldenFile, discoverGoldens, classifyGolden, overallVerdict } from "./run-goldens.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "run-goldens.mjs");

const PASS = "console.log('golden ok');\n";
const FAIL = "console.error('assertion failed');\nprocess.exit(1);\n";
const SKIP_WITH_REASON = "console.error('x.golden: no DB creds - cannot verify here (exit 2).');\nprocess.exit(2);\n";
const SKIP_SILENT = "process.exit(2);\n";
const CRASH = "process.kill(process.pid, 'SIGKILL');\n";

function fixture(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), "run-goldens-"));
  try {
    for (const [name, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), body);
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const run = (dir) => spawnSync(process.execPath, [SCRIPT, `--dir=${dir}`], { encoding: "utf8" });

test("FC-5: every golden spelling is a golden, in any case of extension that node runs, and the runner is not one", () => {
  for (const n of ["a.golden.mjs", "x.golden.cjs", "y.goldens.mjs", "golden-z.mjs", "funded-pass-lock-golden.mjs", "b-golden.cjs"]) {
    assert.equal(isGoldenFile(n), true, n);
  }
  for (const n of ["run-goldens.mjs", "run-goldens.test.mjs", "goldens.md", "notgolden.mjs", "a.golden.json", "my-golden-thing.mjs"]) {
    assert.equal(isGoldenFile(n), false, n);
  }
});

test("FC-5: discovery is recursive and finds the four unlisted spellings the register used", () => {
  fixture({ "lib/sub.golden.mjs": PASS, "x.golden.cjs": PASS, "y.goldens.mjs": PASS, "golden-z.mjs": PASS, "deep/er/w.golden.mjs": PASS, "readme.md": "x", "helper.mjs": PASS }, (dir) => {
    assert.deepEqual(discoverGoldens(dir), ["deep/er/w.golden.mjs", "golden-z.mjs", "lib/sub.golden.mjs", "x.golden.cjs", "y.goldens.mjs"]);
  });
});

test("FC-5: through the real script, a FAILING golden in a subdirectory or in an unlisted spelling fails the run (exit 1)", () => {
  for (const name of ["lib/sub.golden.mjs", "x.golden.cjs", "y.goldens.mjs", "golden-z.mjs"]) {
    fixture({ "ok.golden.mjs": PASS, [name]: FAIL }, (dir) => {
      const r = run(dir);
      assert.equal(r.status, 1, `${name}: ${r.stdout}`);
      assert.match(r.stdout, /GOLDENS FAIL/);
    });
  }
});

test("FC-4: a golden that always exits 2 with no reason is a FAIL, and the run exits 1", () => {
  fixture({ "ok.golden.mjs": PASS, "always-skip.golden.mjs": SKIP_SILENT }, (dir) => {
    const r = run(dir);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /FAIL\s+always-skip\.golden\.mjs \(exit 2: exited 2 \(skip\) with no reason line/);
    assert.match(r.stdout, /GOLDENS FAIL/);
  });
});

test("FC-4: a golden that skips WITH its reason is a SKIP, and the run is still green when another golden passed", () => {
  fixture({ "ok.golden.mjs": PASS, "live.golden.mjs": SKIP_WITH_REASON }, (dir) => {
    const r = run(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /SKIP\s+live\.golden\.mjs/);
    assert.match(r.stdout, /passed: 1 \| failed: 0 \| skipped \(no creds\): 1/);
    assert.match(r.stdout, /GOLDENS GREEN/);
  });
});

test("FC-4: when EVERY golden skipped, nothing was proved and the run fails (exit 1) even with reasons", () => {
  fixture({ "a.golden.mjs": SKIP_WITH_REASON, "b.golden.mjs": SKIP_WITH_REASON }, (dir) => {
    const r = run(dir);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /no golden passed/);
  });
});

test("a crash (killed by a signal) and an ordinary failing exit are FAIL, exit 1", () => {
  fixture({ "ok.golden.mjs": PASS, "crash.golden.mjs": CRASH }, (dir) => {
    const r = run(dir);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /FAIL\s+crash\.golden\.mjs/);
  });
  fixture({ "ok.golden.mjs": PASS, "red.golden.mjs": FAIL }, (dir) => assert.equal(run(dir).status, 1));
});

test("all goldens passing is exit 0; the golden's own output is shown", () => {
  fixture({ "a.golden.mjs": PASS, "b.golden.mjs": PASS }, (dir) => {
    const r = run(dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /golden ok/);
    assert.match(r.stdout, /passed: 2 \| failed: 0 \| skipped \(no creds\): 0 \| total: 2/);
  });
});

test("a directory with no golden at all is exit 1, never a silent no-op", () => {
  fixture({ "readme.md": "x" }, (dir) => {
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no golden files found/);
  });
});

test("classifyGolden and overallVerdict (pure): the skip-reason rule and the none-passed rule", () => {
  assert.equal(classifyGolden(0, "").verdict, "PASS");
  assert.equal(classifyGolden(1, "").verdict, "FAIL");
  assert.equal(classifyGolden(null, "").verdict, "FAIL");
  assert.equal(classifyGolden(3, "skipped").verdict, "FAIL", "only exit 2 is a skip");
  assert.equal(classifyGolden(2, "").verdict, "FAIL");
  assert.equal(classifyGolden(2, "\n  \nx\n").verdict, "FAIL", "blank and trivial lines are not a reason");
  assert.equal(classifyGolden(2, "mutation-lease.golden: no DB creds - cannot verify here (exit 2).").verdict, "SKIP");
  assert.equal(classifyGolden(2, "skipping: SUPABASE_URL not set in this environment").verdict, "SKIP");
  assert.equal(overallVerdict([{ f: "a", verdict: "SKIP" }]).ok, false);
  assert.equal(overallVerdict([{ f: "a", verdict: "SKIP" }, { f: "b", verdict: "PASS" }]).ok, true);
  assert.equal(overallVerdict([{ f: "a", verdict: "FAIL" }, { f: "b", verdict: "PASS" }]).ok, false);
  assert.equal(overallVerdict([]).ok, false);
});

test("the committed goldens: discovery finds them, none is the runner, and the real names all satisfy isGoldenFile", () => {
  const found = discoverGoldens(HERE);
  assert.ok(found.length >= 15, `expected the committed goldens, found ${found.length}`);
  assert.ok(!found.includes("run-goldens.mjs"));
  for (const f of found) assert.ok(isGoldenFile(f.split("/").pop()), f);
});
