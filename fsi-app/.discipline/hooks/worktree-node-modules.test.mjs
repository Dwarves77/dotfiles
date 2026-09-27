// Tests for lib/worktree-node-modules.sh (2026-09-27): a new linked worktree gets fsi-app/node_modules as
// a SYMLINK to the main checkout's shared install (post-checkout), a junction is never created and is
// reported as the data-loss hazard it is, and pre-push fails fast (step 0b) naming the fix instead of
// reporting F9/F10/F11/F12 fitness violations.
//
// End-to-end against throwaway git repos, node builtins only: each fixture commits the REAL tracked
// post-checkout / pre-push / lib fragment, installs the REAL installer trampoline, and runs a real
// `git worktree add` / `git worktree remove`, so the proof is the hook firing under git.
//
// Platform split, stated rather than skipped silently: where the OS permits symlinks (POSIX CI, Windows
// with Developer Mode) the link + removal-safety path runs; where Windows refuses them, the fail-closed
// path runs instead (no junction fallback, the Developer Mode fix named). The junction-hazard tests run
// on Windows only, because junctions exist only there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, lstatSync, renameSync,
  rmSync, chmodSync, symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTrampoline } from "../install-hooks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK_REL = "fsi-app/.discipline/hooks";
const LIB_SH = `${HOOK_REL}/lib/worktree-node-modules.sh`;
const FIX_LINK = `fsi-app/node_modules missing in this worktree: run sh ${LIB_SH} --link`;
const IS_WINDOWS = process.platform === "win32";

const CAN_SYMLINK = (() => {
  const d = mkdtempSync(join(tmpdir(), "wt-nm-probe-"));
  try {
    mkdirSync(join(d, "t"));
    symlinkSync(join(d, "t"), join(d, "l"), "dir");
    return lstatSync(join(d, "l")).isSymbolicLink();
  } catch {
    return false;
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
})();

// Hook-inherited git variables (pre-push step 3 runs this suite from inside a hook) would point every
// fixture git command at the REAL repo; strip them all.
function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_")) env[k] = v;
  return { ...env, ...extra };
}

function run(cmd, args, cwd, { env = {}, input = "" } = {}) {
  const r = spawnSync(cmd, args, { cwd, env: cleanEnv(env), input, encoding: "utf8" });
  if (r.error) throw r.error;
  return r;
}

function git(cwd, ...args) {
  const r = run("git", args, cwd);
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

// Runs one lib function in <cwd> via `sh -c`, sourcing the fixture's committed copy of the lib.
function lib(cwd, snippet) {
  return run("sh", ["-c", `. ./${LIB_SH} && ${snippet}`], cwd);
}

function winJunction(link, target) {
  const r = spawnSync("cmd", ["/c", "mklink", "/J", link, target], { encoding: "utf8" });
  assert.equal(r.status, 0, `mklink /J failed: ${r.stdout}${r.stderr}`);
}

// Main checkout: real hook sources committed, node_modules gitignored and populated, the installer's
// trampoline in .git/hooks. Caller removes `base`.
function makeFixture() {
  const base = mkdtempSync(join(tmpdir(), "wt-nm-fixture-"));
  const main = join(base, "main");
  mkdirSync(join(main, HOOK_REL, "lib"), { recursive: true });
  git(main, "init", "-q", "-b", "master");
  git(main, "config", "user.email", "fixture@example.invalid");
  git(main, "config", "user.name", "fixture");
  git(main, "config", "core.autocrlf", "false");
  for (const f of ["post-checkout", "pre-push", "lib/worktree-node-modules.sh"]) {
    copyFileSync(join(HERE, f), join(main, HOOK_REL, f));
  }
  writeFileSync(join(main, ".gitignore"), "node_modules/\n");
  git(main, "add", "-A");
  git(main, "commit", "-q", "-m", "fixture");
  mkdirSync(join(main, "fsi-app/node_modules/pkg"), { recursive: true });
  writeFileSync(join(main, "fsi-app/node_modules/pkg/marker.txt"), "shared-install");
  const hooksDir = join(main, ".git", "hooks");
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(join(hooksDir, "post-checkout"), buildTrampoline("post-checkout"));
  try { chmodSync(join(hooksDir, "post-checkout"), 0o755); } catch { /* no-op on Windows */ }
  const noHooks = join(base, "no-hooks");
  mkdirSync(noHooks);
  return { base, main, hooksDir, noHooks };
}

// `git worktree add` with an explicit hooks dir, so a global core.hooksPath on the test machine can
// neither add nor suppress hooks.
function addWorktree(fx, name, hooksDir) {
  const wt = join(fx.base, name);
  const r = run("git", ["-c", `core.hooksPath=${hooksDir}`, "worktree", "add", "-q", "-b", name, wt], fx.main);
  assert.equal(r.status, 0, `worktree add failed: ${r.stderr}`);
  return { wt, stderr: r.stderr };
}

const mainMarker = (fx) => join(fx.main, "fsi-app/node_modules/pkg/marker.txt");

function withFixture(fn) {
  const fx = makeFixture();
  try { fn(fx); } finally { rmSync(fx.base, { recursive: true, force: true }); }
}

test("post-checkout on `git worktree add`: a symlink to the main install, or fail closed with no junction", () => {
  withFixture((fx) => {
    const { wt, stderr } = addWorktree(fx, "lane-a", fx.hooksDir);
    const link = join(wt, "fsi-app/node_modules");
    if (CAN_SYMLINK) {
      assert.equal(readFileSync(join(link, "pkg/marker.txt"), "utf8"), "shared-install");
      assert.equal(lib(wt, `wt_nm_link_kind fsi-app/node_modules`).stdout.trim(), "symlink");
      assert.equal(git(wt, "status", "--porcelain"), "", "the link must not dirty the worktree");
    } else {
      assert.ok(IS_WINDOWS, "only Windows is expected to refuse symlinks");
      assert.ok(!existsSync(link), "a refused symlink must never fall back to a junction");
      assert.match(stderr, /Developer Mode/);
    }
  });
});

test("git worktree remove deletes the symlink only; the shared install survives", { skip: !CAN_SYMLINK && "OS refuses symlinks (fail-closed path covered above)" }, () => {
  withFixture((fx) => {
    const { wt } = addWorktree(fx, "lane-b", fx.hooksDir);
    assert.ok(existsSync(join(wt, "fsi-app/node_modules/pkg/marker.txt")));
    git(fx.main, "worktree", "remove", wt);
    assert.ok(!existsSync(wt));
    assert.equal(readFileSync(mainMarker(fx), "utf8"), "shared-install");
  });
});

test("HAZARD PIN (Windows): git worktree remove empties the shared install through a junction", { skip: !IS_WINDOWS && "junctions are Windows-only" }, () => {
  // Pins DEFECT 2 as observed on git 2.53.0.windows.1. If this ever fails, git stopped following
  // junctions and the lib's refusal to create them can be revisited, not before.
  withFixture((fx) => {
    const { wt } = addWorktree(fx, "lane-h", fx.noHooks);
    winJunction(join(wt, "fsi-app", "node_modules"), join(fx.main, "fsi-app", "node_modules"));
    assert.ok(existsSync(mainMarker(fx)));
    git(fx.main, "worktree", "remove", "--force", wt);
    assert.ok(!existsSync(mainMarker(fx)), "git followed the junction (the reason junctions are refused)");
  });
});

test("a junction is reported by --check, classified by --audit, and converted (or kept intact) by --link", { skip: !IS_WINDOWS && "junctions are Windows-only" }, () => {
  withFixture((fx) => {
    const { wt } = addWorktree(fx, "lane-j", fx.noHooks);
    winJunction(join(wt, "fsi-app", "node_modules"), join(fx.main, "fsi-app", "node_modules"));

    const check = run("sh", [LIB_SH, "--check"], wt);
    assert.equal(check.status, 1);
    assert.match(check.stderr, /is a junction, which git worktree remove would empty the shared install through/);
    assert.match(run("sh", [LIB_SH, "--audit"], fx.main).stdout, /^junction .*lane-j$/m);

    const link = run("sh", [LIB_SH, "--link"], wt);
    const kind = lib(wt, "wt_nm_link_kind fsi-app/node_modules").stdout.trim();
    if (CAN_SYMLINK) {
      assert.equal(link.status, 0, link.stderr);
      assert.equal(kind, "symlink");
    } else {
      assert.equal(link.status, 1);
      assert.match(link.stderr, /Developer Mode/);
      assert.equal(kind, "junction", "a refused conversion restores the junction, never leaves nothing");
    }
    assert.equal(readFileSync(mainMarker(fx), "utf8"), "shared-install", "conversion never touches the target");
  });
});

test("wt_nm_unlink never empties a real directory", () => {
  withFixture((fx) => {
    const r = lib(fx.main, "wt_nm_unlink fsi-app/node_modules");
    assert.notEqual(r.status, 0, "unlinking a real directory must report failure");
    assert.equal(readFileSync(mainMarker(fx), "utf8"), "shared-install");
  });
});

test("--check names the exact fix; --link repairs a worktree created without the hook", () => {
  withFixture((fx) => {
    const { wt } = addWorktree(fx, "lane-d", fx.noHooks);
    const check = run("sh", [LIB_SH, "--check"], wt);
    assert.equal(check.status, 1);
    assert.ok(check.stderr.includes(FIX_LINK), check.stderr);

    const link = run("sh", [LIB_SH, "--link"], wt);
    if (CAN_SYMLINK) {
      assert.equal(link.status, 0, link.stderr);
      assert.equal(run("sh", [LIB_SH, "--check"], wt).status, 0);
    } else {
      assert.equal(link.status, 1);
      assert.match(link.stderr, /Developer Mode/);
      assert.ok(!existsSync(join(wt, "fsi-app/node_modules")));
    }
  });
});

test("main checkout: never linked; without an install --check names npm ci and a worktree cannot link", () => {
  withFixture((fx) => {
    const { wt } = addWorktree(fx, "lane-e", fx.noHooks);
    assert.equal(lib(fx.main, "wt_nm_ensure_link").status, 0);
    assert.equal(lib(fx.main, "wt_nm_link_kind fsi-app/node_modules").stdout.trim(), "dir");

    renameSync(join(fx.main, "fsi-app/node_modules"), join(fx.base, "moved-away"));
    const mainCheck = run("sh", [LIB_SH, "--check"], fx.main);
    assert.equal(mainCheck.status, 1);
    assert.match(mainCheck.stderr, /missing in this worktree: run \(cd fsi-app && npm ci\)/);
    const link = run("sh", [LIB_SH, "--link"], wt);
    assert.equal(link.status, 1);
    assert.match(link.stderr, /cannot link: main checkout has no fsi-app\/node_modules/);
    assert.ok(!existsSync(join(wt, "fsi-app/node_modules")), "nothing left behind");
  });
});

test("pre-push step 0b: the real hook refuses before any step runs, with the fix line, not F9-F12", () => {
  withFixture((fx) => {
    const { wt } = addWorktree(fx, "lane-f", fx.noHooks);
    const r = run("sh", [`${HOOK_REL}/pre-push`, "origin", "unused"], wt, {
      env: { DISCIPLINE_HOOK_TRAMPOLINE: "1" },
    });
    assert.equal(r.status, 1, `expected fail-fast exit 1, got ${r.status}: ${r.stderr}`);
    assert.ok(r.stderr.includes(FIX_LINK), `stderr must carry the fix line; got: ${r.stderr}`);
    assert.match(r.stderr, /STEP 0b FAIL/);
    assert.doesNotMatch(r.stdout + r.stderr, /step 1|STEP 1|F9|running 4-step/);
  });
});

test("WIRING: post-checkout links before exec'ing the isolation runner; pre-push checks before step 1", () => {
  const post = readFileSync(join(HERE, "post-checkout"), "utf8");
  const ensure = post.indexOf("wt_nm_ensure_link");
  assert.ok(ensure > 0 && ensure < post.indexOf("exec node"), "link must run before exec replaces the shell");
  const pre = readFileSync(join(HERE, "pre-push"), "utf8");
  const req = pre.indexOf("if ! wt_nm_require");
  assert.ok(req > 0 && req < pre.indexOf("# Step 1:"), "step 0b must precede every CI-parity step");
});
