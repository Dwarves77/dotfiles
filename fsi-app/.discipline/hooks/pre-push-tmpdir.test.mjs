// Tests for D11 (docs/plans/defect-fix-plan-2026-09-12.md): the pre-push hook's per-run log directory.
// The hook itself is a POSIX sh script, so this drives the extracted, sourced fragment
// (.discipline/hooks/lib/prepush-logdir.sh) directly via `sh -c`, node builtins only (node:child_process,
// node:fs, node:os, node:path). Proves the concrete defect fixed: two CONCURRENT invocations (one push
// per lane, lane preflights, the coordinator's own gate runs all invoke the real hook this way) each get
// their OWN log directory and neither's marker file is clobbered by the other, unlike the fixed
// /tmp/discipline-prepush-*.log paths this replaces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// Forward-slash form: this string is interpolated directly into a POSIX `sh -c` script below, and a
// Windows backslash-separated path (node:path's own resolve() form on win32) is not a safe token there.
const FRAGMENT = resolve(HERE, "lib/prepush-logdir.sh").replaceAll("\\", "/");

// Runs one invocation of the fragment in a fresh `sh`: sources it, creates the log dir (scoped under
// `base` via PRE_PUSH_LOG_DIR_PREFIX so this test never touches the real system temp dir's shared
// namespace), writes a marker file into it, sleeps briefly (widens any race window a shared-path bug
// would need to actually collide), then prints the directory path on its own stdout line.
function runOneInvocation(base, markerName) {
  return new Promise((resolvePromise, reject) => {
    const script = `. "${FRAGMENT}" && pre_push_make_log_dir && echo "marker" > "$PRE_PUSH_LOG_DIR/${markerName}" && sleep 0.2 && printf '%s' "$PRE_PUSH_LOG_DIR"`;
    const child = spawn("sh", ["-c", script], {
      env: { ...process.env, PRE_PUSH_LOG_DIR_PREFIX: base.replaceAll("\\", "/") },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`invocation exited ${code}: ${stderr}`));
      else resolvePromise(stdout.trim());
    });
  });
}

test("pre_push_make_log_dir: two concurrent invocations each get a distinct directory; both marker files survive", async () => {
  const base = mkdtempSync(join(tmpdir(), "prepush-fixture-"));
  try {
    const [dirA, dirB] = await Promise.all([
      runOneInvocation(base, "a.log"),
      runOneInvocation(base, "b.log"),
    ]);

    assert.notEqual(dirA, dirB, "two concurrent invocations must never share a log directory");
    assert.ok(existsSync(join(dirA, "a.log")), "invocation A's marker file must survive invocation B");
    assert.ok(existsSync(join(dirB, "b.log")), "invocation B's marker file must survive invocation A");
    assert.equal(readFileSync(join(dirA, "a.log"), "utf8").trim(), "marker");
    assert.equal(readFileSync(join(dirB, "b.log"), "utf8").trim(), "marker");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("pre_push_make_log_dir: a single invocation creates a real, writable directory", async () => {
  const base = mkdtempSync(join(tmpdir(), "prepush-fixture-"));
  try {
    const dir = await runOneInvocation(base, "solo.log");
    assert.ok(existsSync(dir));
    assert.ok(existsSync(join(dir, "solo.log")));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// D19 (defect-fix-plan-2026-09-12.md, lane L12, 2026-09-13): the tracked pre-push hook's own step 0 --
// drives the REAL tracked file directly (never an installed copy), with DISCIPLINE_HOOK_TRAMPOLINE
// deliberately absent from the child's environment, proving the hook refuses BEFORE doing anything else
// (before reading stdin, before resolving REPO_ROOT, before any of the four numbered steps). Forward-slash
// form for the same reason FRAGMENT above uses it: this path is interpolated into a POSIX `sh` argv.
const PRE_PUSH_PATH = resolve(HERE, "pre-push").replaceAll("\\", "/");

function runPrePushWithoutTrampoline() {
  return new Promise((resolvePromise, reject) => {
    // Start from the real process env, then delete the marker var explicitly -- setting it to undefined
    // in the env object would otherwise be passed through as the literal string "undefined" by
    // node:child_process on some platforms, which is not the same as the variable being unset.
    const env = { ...process.env };
    delete env.DISCIPLINE_HOOK_TRAMPOLINE;
    const child = spawn("sh", [PRE_PUSH_PATH], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    // Close stdin immediately -- step 0 must refuse before the hook ever tries to read git's ref-update
    // lines from it (a `git push` always provides a pipe here; an empty pipe proves step 0 runs first).
    child.stdin.end();
  });
}

test("pre-push step 0: the tracked hook, run with DISCIPLINE_HOOK_TRAMPOLINE unset, exits 1 with the stale-copy message before doing anything else", async () => {
  const { code, stderr, stdout } = await runPrePushWithoutTrampoline();
  assert.equal(code, 1, `expected exit 1, got ${code}. stdout: ${stdout} stderr: ${stderr}`);
  assert.match(
    stderr,
    /\[discipline pre-push\] STEP 0 FAIL: stale hook copy; run node fsi-app\/\.discipline\/install-hooks\.mjs/,
  );
  // "before doing anything else": none of the numbered steps' own OK lines may appear -- step 0 must be
  // the only thing that ran.
  assert.doesNotMatch(stdout, /step 1 \(untracked critical files\)/);
  assert.doesNotMatch(stdout, /running 4-step CI-parity check/);
});

// Lane L22 (2026-09-16), class fix for the first-push-red pattern: five lanes in a row went red on their
// FIRST CI run on a fitness function that scans the live tree (F23 twice, F20, F25, the skill-drift gate)
// because the hook ran the fitness functions' unit tests (step 3) but never the runner itself, which is
// what the CI "Fitness functions" job runs. Step 3d now runs it; this test pins the hook's command to the
// exact command discipline.yml runs, read from the workflow file, so the two cannot drift apart silently.
test("pre-push hook source: step 3d runs the SAME fitness-runner command the CI Fitness functions job runs (parity by construction)", () => {
  const hook = readFileSync(PRE_PUSH_PATH, "utf8");
  const workflow = readFileSync(resolve(HERE, "..", "..", "..", ".github", "workflows", "discipline.yml"), "utf8");
  const m = workflow.match(/run:\s*(node fsi-app\/\.discipline\/fitness\/runner\.mjs)\s*$/m);
  assert.ok(m, "discipline.yml must run the fitness runner as a bare command line this test can read");
  const ciCommand = m[1];
  assert.ok(
    hook.includes("if ! " + ciCommand + " >"),
    "pre-push step 3d must run exactly the CI fitness-runner command: " + ciCommand,
  );
  assert.match(hook, /step 3d \(fitness runner, live tree, CI parity\): OK/);
  // Ordering: the runner runs after the canonical suite (step 3) and before tsc (step 4).
  const i3 = hook.indexOf("step 3 (discipline + fitness tests, canonical suite): OK");
  const i3d = hook.indexOf("step 3d (fitness runner, live tree, CI parity): OK");
  const i4 = hook.indexOf("step 4 (tsc --noEmit): OK");
  assert.ok(i3 > 0 && i3d > i3 && i4 > i3d, "step 3d must sit between step 3 and step 4");
});
