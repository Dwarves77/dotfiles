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
// what the CI "Fitness functions" job runs. This test pins the hook's command to the exact command
// discipline.yml runs, read from the workflow file, so the two cannot drift apart silently.
//
// Step label updated (lane R7-LINT-CI, 2026-10-01/03): the runner's own step moved from 3d to 3e when
// a new "ESLint (max-warnings 0)" step was inserted as 3d (matching CI's fitness-check job ordering,
// right before the fitness-runner step), renumbering every step after it (3d->3e, 3e->3f, 3f->3g,
// 3g->3h). This test still asserted the pre-renumbering "3d" label and was red on master itself
// (CLAUDE.md rule 15: a proof that does not execute, or asserts stale wording, is not a proof) -- fixed
// to match the hook's current wording, not the other way around.
test("pre-push hook source: step 3e runs the SAME fitness-runner command the CI Fitness functions job runs (parity by construction)", () => {
  const hook = readFileSync(PRE_PUSH_PATH, "utf8");
  const workflow = readFileSync(resolve(HERE, "..", "..", "..", ".github", "workflows", "discipline.yml"), "utf8");
  const m = workflow.match(/run:\s*(node fsi-app\/\.discipline\/fitness\/runner\.mjs)\s*$/m);
  assert.ok(m, "discipline.yml must run the fitness runner as a bare command line this test can read");
  const ciCommand = m[1];
  assert.ok(
    hook.includes("if ! " + ciCommand + " >"),
    "pre-push step 3e must run exactly the CI fitness-runner command: " + ciCommand,
  );
  assert.match(hook, /step 3e \(fitness runner, live tree, CI parity\): OK/);
  // Ordering: the runner runs after the canonical suite (step 3) and before tsc (step 4).
  const i3 = hook.indexOf("step 3 (discipline + fitness tests, canonical suite): OK");
  const i3e = hook.indexOf("step 3e (fitness runner, live tree, CI parity): OK");
  const i4 = hook.indexOf("step 4 (tsc --noEmit): OK");
  assert.ok(i3 > 0 && i3e > i3 && i4 > i3e, "step 3e must sit between step 3 and step 4");
});

// Lane R23 item 2 (2026-10-02): step 2b (the memory gate) used to redirect to the FIXED path
// /tmp/discipline-prepush-mem.log and `rm -f` it, the exact D11 concurrent-run collision class this file
// otherwise tests for every other step. Proven by attack: the fixed-path literal must be ABSENT from the
// tracked hook, and step 2b's own command must redirect into $PRE_PUSH_LOG_DIR like every sibling step.
test("pre-push step 2b: no fixed /tmp log path (the D11 class); redirects into $PRE_PUSH_LOG_DIR like every sibling step", () => {
  const hook = readFileSync(PRE_PUSH_PATH, "utf8");
  assert.doesNotMatch(
    hook,
    /\/tmp\/discipline-prepush-mem\.log/,
    "step 2b must not reintroduce the fixed /tmp path two concurrent pushes could clobber"
  );
  assert.match(
    hook,
    /node fsi-app\/\.discipline\/governance\/memory-gate\.mjs >"\$PRE_PUSH_LOG_DIR\/mem\.log" 2>&1/,
    "step 2b must redirect to $PRE_PUSH_LOG_DIR/mem.log, the same per-run directory every other step uses"
  );
  assert.match(hook, /step 2b \(memory gate, CI parity\): OK/);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// GATE-2 (2026-10-08): step 2c removed, the UX substring check gone from 2b, and a firing log line per step
// failure. Proven against the hook source and by running the extracted logging function under `sh`.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

test("pre-push GATE-2: step 2c is gone (no rules re-run), steps 0, 0b, 0c, 1, 2 and 2b are kept", () => {
  const hook = readFileSync(PRE_PUSH_PATH, "utf8");
  assert.doesNotMatch(hook, /^if ! node fsi-app\/\.discipline\/runner\.mjs/m, "no executable rules re-run may remain");
  assert.doesNotMatch(hook, /STEP 2c FAIL/);
  assert.doesNotMatch(hook, /step 2c \(discipline rules/);
  for (const marker of [
    "STEP 0 FAIL", "STEP 0b FAIL", "step 0c (docs-only fast path)", "step 1 (untracked critical files): OK",
    "step 2 (consistency runner, override-aware): OK", "step 2b (memory gate, CI parity): OK",
  ]) {
    assert.ok(hook.includes(marker), `kept step marker missing: ${marker}`);
  }
});

test("pre-push GATE-2: step 2b's failure advice no longer asks for a UX compliance block", () => {
  const hook = readFileSync(PRE_PUSH_PATH, "utf8");
  const failMsg = hook.slice(hook.indexOf("STEP 2b FAIL"), hook.indexOf("step 2b (memory gate, CI parity): OK"));
  assert.ok(failMsg.length > 0);
  assert.doesNotMatch(failMsg, /UX compliance/);
});

test("pre-push GATE-2: every STEP FAIL echo (past step 0) is preceded by a pre_push_log_firing call", () => {
  const lines = readFileSync(PRE_PUSH_PATH, "utf8").split("\n");
  let sites = 0;
  lines.forEach((line, i) => {
    const m = /^\s*echo "\[discipline pre-push\] STEP (\w+) FAIL/.exec(line);
    if (!m || m[1] === "0") return; // step 0 refuses before REPO_ROOT is known, so it has no repo to log into
    sites += 1;
    assert.match(lines[i - 1], new RegExp(`pre_push_log_firing ${m[1]} `), `STEP ${m[1]} FAIL must log its firing on the line before`);
  });
  assert.ok(sites >= 12, `expected the failing steps to be covered, found ${sites}`);
});

function runFiringLogger(script, base) {
  const hook = readFileSync(PRE_PUSH_PATH, "utf8");
  const fn = /pre_push_log_firing\(\) \{[\s\S]*?\n\}\n/.exec(hook);
  assert.ok(fn, "the hook must define pre_push_log_firing");
  const logPath = join(base, "firings.log").replaceAll("\\", "/");
  // The script goes through a file, not `sh -c`: the function body is full of quotes and backslashes that
  // Windows argv quoting would mangle on the way into msys sh.
  const scriptPath = join(base, "firing.sh");
  writeFileSync(scriptPath, `HOOK_FIRINGS_LOG="${logPath}"\n${fn[0]}\n${script}\n`);
  const r = spawnSync("sh", [scriptPath.replaceAll("\\", "/")], { encoding: "utf8", cwd: base });
  assert.equal(r.status, 0, r.stderr);
  return existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n") : [];
}

test("pre_push_log_firing: appends one valid JSON line {ts, rule, mode, path, line, verdict} per call, evidence from a log file or text", () => {
  const base = mkdtempSync(join(tmpdir(), "prepush-firing-"));
  try {
    const stepLog = join(base, "c.log").replaceAll("\\", "/");
    writeFileSync(stepLog, '\n\n  C4 drift: worktree "x" at C:\\scratch\\wt is unlisted\nsecond line is not used\n');
    const lines = runFiringLogger(`pre_push_log_firing 2 "${stepLog}"; pre_push_log_firing 0b "deps do not resolve"`, base);
    assert.equal(lines.length, 2);
    const a = JSON.parse(lines[0]);
    assert.deepEqual(Object.keys(a), ["ts", "rule", "mode", "path", "line", "verdict"]);
    assert.equal(a.rule, "pre-push:2");
    assert.equal(a.mode, "pre-push");
    assert.equal(a.verdict, "fail");
    assert.match(a.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.ok(a.line.includes('C4 drift: worktree "x" at C:\\scratch\\wt is unlisted'), a.line);
    assert.ok(!a.line.includes("second line"));
    const b = JSON.parse(lines[1]);
    assert.equal(b.rule, "pre-push:0b");
    assert.equal(b.line, "deps do not resolve");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("pre_push_log_firing: evidence is cut to 200 characters and never blocks (an unwritable log path still exits 0)", () => {
  const base = mkdtempSync(join(tmpdir(), "prepush-firing-"));
  try {
    const long = "x".repeat(500);
    const lines = runFiringLogger(`pre_push_log_firing 3e "${long}"`, base);
    assert.equal(JSON.parse(lines[0]).line.length, 200);
    const hook = readFileSync(PRE_PUSH_PATH, "utf8");
    const fn = /pre_push_log_firing\(\) \{[\s\S]*?\n\}\n/.exec(hook)[0];
    const scriptPath = join(base, "unwritable.sh");
    writeFileSync(scriptPath, `HOOK_FIRINGS_LOG="/nonexistent-dir/zz/firings.log"\n${fn}\npre_push_log_firing 1 "x"\necho done\n`);
    const r = spawnSync("sh", [scriptPath.replaceAll("\\", "/")], { encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /done/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
