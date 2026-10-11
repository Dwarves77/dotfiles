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
  assert.doesNotMatch(stdout, /step 0e/);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// HOOK-1 (2026-10-11, ADR-040 second amendment): the hook keeps three steps. The behaviour of each step is attacked through
// the real hook in pre-push-step-attacks.test.mjs; the checks here pin the hook SOURCE: the deleted steps stay deleted, the
// memory gate is the command CI runs, no step logs to a fixed path, and every failure echo logs its firing first.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
import { spawnSync, execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const HOOK_DIR_REL = "fsi-app/.discipline/hooks";
const REPO_ROOT_DIR = resolve(HERE, "..", "..", "..");

test("HOOK-1: the hook runs exactly steps A, B and C; every deleted step, the docs-only classifier and the full opt-in are gone", () => {
  const hook = readFileSync(PRE_PUSH_PATH, "utf8");
  const code = hook.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  for (const gone of [
    "run-test-suite.sh", "invariant-coverage.mjs", "check-pretooluse-wired.mjs", "fitness/runner.mjs", "run-npmtest-suites.sh",
    "run-goldens.mjs", "closure-gate.mjs", "skill-contract-map.mjs", "tsc --noEmit", "override-check.mjs", "docs-only-range.mjs",
    "DISCIPLINE_PREPUSH_FULL", "RUN_HEAVY", "DOCS_ONLY",
  ]) {
    assert.ok(!code.includes(gone), `the hook must no longer run or mention ${gone} outside comments`);
  }
  for (const marker of ["STEP 0 FAIL", "STEP A FAIL", "STEP B FAIL", "STEP C FAIL", "step A (", "step B (", "step C (memory gate, CI parity): OK"]) {
    assert.ok(hook.includes(marker), `kept step marker missing: ${marker}`);
  }
  assert.ok(hook.indexOf("Step A:") < hook.indexOf("Step 0e:") && hook.indexOf("Step 0e:") < hook.indexOf("Step B:") && hook.indexOf("Step B:") < hook.indexOf("Step C:"), "A, then 0e, then B, then C");
});

test("HOOK-1: step C runs the SAME memory-gate script CI's static job runs, and logs to the per-run directory (no fixed /tmp path, the D11 class)", () => {
  const hook = readFileSync(PRE_PUSH_PATH, "utf8");
  const workflow = readFileSync(resolve(HERE, "..", "..", "..", ".github", "workflows", "ci.yml"), "utf8");
  assert.match(workflow, /node fsi-app\/\.discipline\/governance\/memory-gate\.mjs/, "ci.yml must run the memory gate script");
  assert.match(hook, /node fsi-app\/\.discipline\/governance\/memory-gate\.mjs >"\$PRE_PUSH_LOG_DIR\/mem\.log" 2>&1/);
  assert.doesNotMatch(hook, /\/tmp\/discipline-prepush/, "no fixed /tmp log path two concurrent pushes could clobber");
  const failMsg = hook.slice(hook.indexOf("STEP C FAIL"), hook.indexOf("step C (memory gate, CI parity): OK"));
  assert.doesNotMatch(failMsg, /UX compliance/);
});

test("HOOK-1: every STEP FAIL echo (past step 0) is preceded by a pre_push_log_firing call, and the hook logs a pass line before it exits 0", () => {
  const src = readFileSync(PRE_PUSH_PATH, "utf8");
  const lines = src.split("\n");
  let sites = 0;
  lines.forEach((line, i) => {
    const m = /^\s*echo "\[discipline pre-push\] STEP (\w+) FAIL/.exec(line);
    if (!m || m[1] === "0") return; // step 0 refuses before REPO_ROOT is known, so it has no repo to log into
    sites += 1;
    assert.match(lines[i - 1], new RegExp(`pre_push_log_firing ${m[1]} `), `STEP ${m[1]} FAIL must log its firing on the line before`);
  });
  assert.ok(sites >= 6, `expected the failing steps to be covered, found ${sites}`);
  assert.match(src, /pre_push_log_firing push "\$SUMMARY" pass\necho "\[discipline pre-push\] all checks pass/);
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
test("pre_push_log_firing: a third argument sets the verdict (pass lines for a push the hook lets through); the default is fail", () => {
  const base = mkdtempSync(join(tmpdir(), "prepush-firing-"));
  try {
    const lines = runFiringLogger('pre_push_log_firing push "tier=final A=ok" pass; pre_push_log_firing B "lint failed"', base);
    assert.equal(lines.length, 2);
    assert.deepEqual([JSON.parse(lines[0]).rule, JSON.parse(lines[0]).verdict, JSON.parse(lines[0]).line], ["pre-push:push", "pass", "tier=final A=ok"]);
    assert.equal(JSON.parse(lines[1]).verdict, "fail");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The lib functions step B uses, driven in a throwaway repository with the REAL final-push-tier.sh.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const LIB_SH = join(REPO_ROOT_DIR, HOOK_DIR_REL, "lib", "final-push-tier.sh").replaceAll("\\", "/");

function libRepo(files, changed) {
  const dir = mkdtempSync(join(tmpdir(), "prepush-lib-"));
  const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git(["init", "-q", "-b", "master"]);
  for (const [k, v] of [["user.name", "T"], ["user.email", "t@example.com"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]]) git(["config", k, v]);
  const put = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
  for (const [rel, text] of Object.entries(files)) put(rel, text);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"]);
  git(["update-ref", "refs/remotes/origin/master", "HEAD"]);
  for (const [rel, text] of Object.entries(changed)) put(rel, text);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "change"]);
  return dir;
}

function libCall(dir, snippet) {
  const r = spawnSync("sh", ["-c", `. "${LIB_SH}" && ${snippet}`], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split("\n").filter(Boolean);
}

test("pre_push_changed_test_files: the changed test, the sibling test and the same-directory tests that import a changed module; nothing else", () => {
  const dir = libRepo(
    {
      "fsi-app/scripts/lib/alpha.mjs": "export const a = 1;\n",
      "fsi-app/scripts/lib/alpha.test.mjs": 'import { a } from "./alpha.mjs";\n',
      "fsi-app/scripts/lib/beta.mjs": "export const b = 1;\n",
      "fsi-app/scripts/lib/uses-beta.test.mjs": 'import { b } from "./beta.mjs";\n',
      "fsi-app/scripts/lib/unrelated.test.mjs": 'import { c } from "./gamma.mjs";\n',
      "fsi-app/scripts/lib/betamax.test.mjs": 'import { m } from "./betamax.mjs";\n',
      "fsi-app/scripts/other/uses-alpha.test.mjs": 'import { a } from "../lib/alpha.mjs";\n',
      "fsi-app/scripts/lib/standalone.test.mjs": "export {};\n",
      "fsi-app/scripts/lib/legacy.npmtest.mjs": 'import { b } from "./beta.mjs";\n',
    },
    {
      "fsi-app/scripts/lib/alpha.mjs": "export const a = 2;\n",
      "fsi-app/scripts/lib/beta.mjs": "export const b = 2;\n",
      "fsi-app/scripts/lib/standalone.test.mjs": "export const edited = true;\n",
      "fsi-app/scripts/lib/note.md": "docs\n",
    },
  );
  try {
    assert.deepEqual(libCall(dir, "pre_push_changed_test_files"), [
      "fsi-app/scripts/lib/alpha.test.mjs",
      "fsi-app/scripts/lib/standalone.test.mjs",
      "fsi-app/scripts/lib/uses-beta.test.mjs",
    ]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("pre_push_changed_test_files: a push that changes no js module and no test lists nothing, and a deleted test is not listed", () => {
  const dir = libRepo({ "README.md": "a\n", "fsi-app/scripts/gone.test.mjs": "export {};\n" }, { "README.md": "b\n", "fsi-app/data/x.json": "{}\n" });
  try {
    assert.deepEqual(libCall(dir, "pre_push_changed_test_files"), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("pre_push_run_changed_tests: runs the given files through run-explicit-tests.mjs with the no-npm sandbox import and FSI_NO_ENV_FILE set", () => {
  const dir = libRepo(
    {
      "fsi-app/.discipline/lib/run-explicit-tests.mjs":
        'import { appendFileSync } from "node:fs";\nlet b = "";\nprocess.stdin.on("data", (c) => { b += c; });\nprocess.stdin.on("end", () => { appendFileSync(process.env.PP_OUT, JSON.stringify({ files: b.split(String.fromCharCode(0)).filter(Boolean), argv: process.argv.slice(2), env: process.env.FSI_NO_ENV_FILE }) + String.fromCharCode(10)); process.exit(Number(process.env.PP_EXIT || 0)); });\n',
    },
    { "fsi-app/x.txt": "x\n" },
  );
  try {
    const out = join(dir, ".git", "pp-out");
    const run = (exit) => spawnSync("sh", ["-c", `. "${LIB_SH}" && pre_push_run_changed_tests fsi-app/a.test.mjs fsi-app/b.test.mjs`], { cwd: dir, encoding: "utf8", env: { ...process.env, PP_OUT: out, PP_EXIT: String(exit) } });
    { const r0 = run(0); assert.equal(r0.status, 0, r0.stdout + r0.stderr); }
    const rec = JSON.parse(readFileSync(out, "utf8").trim());
    assert.deepEqual(rec.files, ["fsi-app/a.test.mjs", "fsi-app/b.test.mjs"]);
    assert.deepEqual(rec.argv, ["--", "--import", "./fsi-app/.discipline/lib/no-npm-sandbox.mjs"]);
    assert.equal(rec.env, "1");
    assert.equal(run(1).status, 1, "a failing run is a failing step");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("pre_push_text_has_skip_token: the five tokens and the skip-checks trailer match, case-insensitively; plain text does not", () => {
  const lib = join(REPO_ROOT_DIR, HOOK_DIR_REL, "lib", "final-push-tier.sh").replaceAll("\\", "/");
  const probe = (text) => spawnSync("sh", ["-c", `. "${lib}" && pre_push_text_has_skip_token "$1"`, "sh", text]).status === 0;
  for (const t of ["[skip ci]", "[ci skip]", "[no ci]", "[skip actions]", "[actions skip]", "x [SKIP CI] y", "a\n\nskip-checks: true\n"]) {
    assert.equal(probe(t), true, t);
  }
  for (const t of ["", "skip ci", "[skip]", "no ci here"]) assert.equal(probe(t), false, t);
});

// ATTACK, real ESLint (rule 15: a guard is proven by an adversarial case, not by presence). Self-skips when
// the app's ESLint does not resolve (the no-npm CI suite has no install); it runs in every worktree with the
// shared link and in the npm-deps environment.
function eslintResolves() {
  try { createRequire(join(REPO_ROOT_DIR, "fsi-app", "package.json")).resolve("eslint/package.json"); return true; } catch { return false; }
}

test("GATE-PUSH-1 attack: a changed file with an unused variable is BLOCKED by the 3d lint command; a clean file passes", { skip: !eslintResolves() && "eslint not installed in this environment" }, () => {
  const rel = "fsi-app/scripts/tmp";
  mkdirSync(join(REPO_ROOT_DIR, rel), { recursive: true });
  const bad = `${rel}/gatepush1-attack-${process.pid}-bad.ts`;
  const good = `${rel}/gatepush1-attack-${process.pid}-good.ts`;
  writeFileSync(join(REPO_ROOT_DIR, bad), "export function f() {\n  const unusedVariable = 1;\n  return 2;\n}\n");
  writeFileSync(join(REPO_ROOT_DIR, good), "export function g() {\n  return 2;\n}\n");
  const lib = "fsi-app/.discipline/hooks/lib/final-push-tier.sh";
  const lint = (file) => spawnSync("sh", ["-c", `. "${lib}" && pre_push_eslint_files "$1"`, "sh", file], { cwd: REPO_ROOT_DIR, encoding: "utf8" });
  try {
    const rBad = lint(bad);
    assert.notEqual(rBad.status, 0, `an unused variable must fail max-warnings 0: ${rBad.stdout}${rBad.stderr}`);
    assert.match(`${rBad.stdout}${rBad.stderr}`, /unusedVariable/);
    const rGood = lint(good);
    assert.equal(rGood.status, 0, `${rGood.stdout}${rGood.stderr}`);
  } finally {
    rmSync(join(REPO_ROOT_DIR, bad), { force: true });
    rmSync(join(REPO_ROOT_DIR, good), { force: true });
  }
});
