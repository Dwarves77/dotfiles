// Tests for lib/worktree-node-modules.sh (RD-85, 2026-09-27): a linked worktree resolves fsi-app's npm
// dependencies from the main checkout's shared install through ONE link beside the worktrees, with no
// special OS rights; nothing is created inside a worktree, so no way of removing a worktree can reach
// the shared install; a junction inside a worktree (the old hand fix, which git empties the install
// through) is removed; and pre-push step 0b self-heals, then fails fast naming the fix instead of
// reporting F9/F10/F11/F12 fitness violations.
//
// End-to-end against throwaway git repos, node builtins only. Each fixture commits the REAL tracked
// post-checkout / pre-push / lib fragment and the REAL root and fsi-app .gitignore files, installs the
// REAL installer trampoline, and runs real `git worktree add` / `git worktree remove`, so the proof is
// the hook firing under git against the repo's own ignore rules, not a function called by hand.
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
const REPO_ROOT = join(HERE, "..", "..", "..");
const HOOK_REL = "fsi-app/.discipline/hooks";
const LIB_SH = `${HOOK_REL}/lib/worktree-node-modules.sh`;
const FIX_LINK = `fsi-app dependencies do not resolve in this worktree: run sh ${LIB_SH} --link`;
const IS_WINDOWS = process.platform === "win32";

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

// Runs one lib function in <cwd> via `sh -c`, sourcing the checkout's committed copy of the lib.
function lib(cwd, snippet) {
  return run("sh", ["-c", `. ./${LIB_SH} && ${snippet}`], cwd);
}

// What every consumer asks (lib/resolve-dep.mjs, run-npmtest-suites.sh, next.config.ts): does `next`
// resolve from <checkout>/fsi-app? Returns the resolved file, or null.
function resolveNext(checkout) {
  const r = run(process.execPath, ["-e",
    "try { process.stdout.write(require.resolve('next/package.json', { paths: [process.argv[1]] })) } catch {}",
    join(checkout, "fsi-app")], checkout);
  return r.stdout || null;
}

function winJunction(link, target) {
  const r = spawnSync("cmd", ["/c", "mklink", "/J", link, target], { encoding: "utf8" });
  assert.equal(r.status, 0, `mklink /J failed: ${r.stdout}${r.stderr}`);
}

// Main checkout: real hook sources and real ignore files committed, a stand-in install (a `next`
// package plus a marker) untracked and gitignored, the installer's trampoline in .git/hooks.
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
  copyFileSync(join(REPO_ROOT, ".gitignore"), join(main, ".gitignore"));
  copyFileSync(join(REPO_ROOT, "fsi-app/.gitignore"), join(main, "fsi-app/.gitignore"));
  git(main, "add", "-A");
  git(main, "commit", "-q", "-m", "fixture");
  mkdirSync(join(main, "fsi-app/node_modules/next"), { recursive: true });
  writeFileSync(join(main, "fsi-app/node_modules/next/package.json"), '{"name":"next","version":"0.0.0"}');
  mkdirSync(join(main, "fsi-app/node_modules/pkg"), { recursive: true });
  writeFileSync(join(main, "fsi-app/node_modules/pkg/marker.txt"), "shared-install");
  const hooksDir = join(main, ".git", "hooks");
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(join(hooksDir, "post-checkout"), buildTrampoline("post-checkout"));
  try { chmodSync(join(hooksDir, "post-checkout"), 0o755); } catch { /* no-op on Windows */ }
  const noHooks = join(base, "no-hooks");
  mkdirSync(noHooks);
  const worktrees = join(main, ".claude", "worktrees");
  mkdirSync(worktrees, { recursive: true });
  return { base, main, hooksDir, noHooks, worktrees, shared: join(worktrees, "node_modules") };
}

// `git worktree add` with an explicit hooks dir, so a global core.hooksPath on the test machine can
// neither add nor suppress hooks. Default location is the repo convention, <main>/.claude/worktrees.
function addWorktree(fx, name, hooksDir, parent = fx.worktrees) {
  const wt = join(parent, name);
  const r = run("git", ["-c", `core.hooksPath=${hooksDir}`, "worktree", "add", "-q", "-b", name, wt], fx.main);
  assert.equal(r.status, 0, `worktree add failed: ${r.stderr}`);
  return { wt, stderr: r.stderr };
}

const mainMarker = (fx) => join(fx.main, "fsi-app/node_modules/pkg/marker.txt");
const installIntact = (fx) => readFileSync(mainMarker(fx), "utf8") === "shared-install";

function withFixture(fn) {
  const fx = makeFixture();
  try { fn(fx); } finally { rmSync(fx.base, { recursive: true, force: true }); }
}

test("post-checkout on `git worktree add`: deps resolve through the one shared link; nothing inside the worktree", () => {
  withFixture((fx) => {
    const { wt } = addWorktree(fx, "lane-a", fx.hooksDir);
    assert.ok(resolveNext(wt), "next must resolve from the new worktree's fsi-app/");
    assert.ok(!existsSync(join(wt, "fsi-app/node_modules")), "no link is created inside the worktree");
    assert.ok(lstatSync(fx.shared).isSymbolicLink(), "the shared link sits beside the worktrees");
    assert.equal(git(wt, "status", "--porcelain"), "", "the worktree stays clean");
    assert.equal(git(fx.main, "status", "--porcelain"), "", "the shared link is gitignored in the main checkout");
    // A second worktree reuses the same link; nothing new is created.
    const { wt: wt2 } = addWorktree(fx, "lane-a2", fx.hooksDir);
    assert.ok(resolveNext(wt2));
    assert.ok(!existsSync(join(wt2, "fsi-app/node_modules")));
  });
});

test("every way of removing a worktree leaves the shared install and the shared link intact", () => {
  withFixture((fx) => {
    const { wt: forced } = addWorktree(fx, "lane-b1", fx.hooksDir);
    const { wt: plain } = addWorktree(fx, "lane-b2", fx.hooksDir);
    const { wt: rmrf } = addWorktree(fx, "lane-b3", fx.hooksDir);
    const { wt: survivor } = addWorktree(fx, "lane-b4", fx.hooksDir);
    git(fx.main, "worktree", "remove", "--force", forced);
    git(fx.main, "worktree", "remove", plain);
    rmSync(rmrf, { recursive: true, force: true });
    git(fx.main, "worktree", "prune");
    assert.ok(installIntact(fx), "the main install survives git worktree remove (forced and not) and rm -rf");
    assert.ok(resolveNext(survivor), "a remaining worktree still resolves through the shared link");
  });
});

test("HAZARD PIN (Windows): git worktree remove empties the shared install through a junction INSIDE a worktree", { skip: !IS_WINDOWS && "junctions are Windows-only" }, () => {
  // Pins DEFECT 2 as observed on git 2.53.0.windows.1: the reason nothing is ever linked INSIDE a
  // worktree. If this ever fails, git stopped following junctions; the design stays correct either way.
  withFixture((fx) => {
    const { wt } = addWorktree(fx, "lane-h", fx.noHooks);
    winJunction(join(wt, "fsi-app", "node_modules"), join(fx.main, "fsi-app", "node_modules"));
    assert.ok(installIntact(fx));
    git(fx.main, "worktree", "remove", "--force", wt);
    assert.ok(!existsSync(mainMarker(fx)), "git followed the junction");
  });
});

test("a junction inside a worktree: --check refuses it, --link removes it (target untouched) and deps still resolve", { skip: !IS_WINDOWS && "junctions are Windows-only" }, () => {
  withFixture((fx) => {
    const { wt } = addWorktree(fx, "lane-j", fx.noHooks);
    winJunction(join(wt, "fsi-app", "node_modules"), join(fx.main, "fsi-app", "node_modules"));

    const check = run("sh", [LIB_SH, "--check"], wt);
    assert.equal(check.status, 1);
    assert.match(check.stderr, /is a junction, which git worktree remove would empty the shared install through/);
    assert.match(run("sh", [LIB_SH, "--audit"], fx.main).stdout, /^resolves junction .*lane-j$/m);

    const link = run("sh", [LIB_SH, "--link"], wt);
    assert.equal(link.status, 0, link.stderr);
    assert.ok(!existsSync(join(wt, "fsi-app/node_modules")), "the junction is gone");
    assert.ok(resolveNext(wt), "deps resolve through the shared link instead");
    assert.ok(installIntact(fx), "removing the junction never touches its target");
    git(fx.main, "worktree", "remove", "--force", wt);
    assert.ok(installIntact(fx), "and the worktree is now safe to remove");
  });
});

test("wt_nm_unlink never empties a real directory", () => {
  withFixture((fx) => {
    const r = lib(fx.main, "wt_nm_unlink fsi-app/node_modules");
    assert.notEqual(r.status, 0, "unlinking a real directory must report failure");
    assert.ok(installIntact(fx));
  });
});

test("a worktree made without the hook: --check names the fix, --link repairs it; a deleted or stale shared link self-heals", () => {
  withFixture((fx) => {
    const { wt } = addWorktree(fx, "lane-d", fx.noHooks);
    assert.equal(resolveNext(wt), null, "precondition: nothing resolves before the link exists");
    const check = run("sh", [LIB_SH, "--check"], wt);
    assert.equal(check.status, 1);
    assert.ok(check.stderr.includes(FIX_LINK), check.stderr);

    assert.equal(run("sh", [LIB_SH, "--link"], wt).status, 0);
    assert.ok(resolveNext(wt));

    rmSync(fx.shared, { recursive: true, force: true }); // rm -rf of a link removes the link only
    assert.ok(installIntact(fx));
    assert.equal(resolveNext(wt), null);
    assert.equal(run("sh", [LIB_SH, "--link"], wt).status, 0, "a deleted shared link is recreated");
    assert.ok(resolveNext(wt));

    // Stale: the shared link exists but points somewhere that does not hold the install (a moved or
    // wrong target). --link must replace it, not trust its existence.
    const wrong = join(fx.base, "wrong-target");
    mkdirSync(join(wrong, "unrelated"), { recursive: true });
    lib(fx.main, `wt_nm_unlink '${fx.shared.replaceAll("\\", "/")}'`);
    assert.equal(lib(fx.main, `wt_nm_make_link '${fx.shared.replaceAll("\\", "/")}' '${wrong.replaceAll("\\", "/")}'`).status, 0);
    assert.equal(resolveNext(wt), null, "precondition: the stale link does not resolve");
    assert.equal(run("sh", [LIB_SH, "--link"], wt).status, 0);
    assert.ok(resolveNext(wt), "the stale link was replaced");
    assert.ok(existsSync(join(wrong, "unrelated")), "replacing a stale link never touches its old target");
    assert.equal(run("sh", [LIB_SH, "--check"], wt).status, 0);
  });
});

test("a worktree outside <main>/.claude/worktrees is refused with the convention named, and nothing is created", () => {
  withFixture((fx) => {
    const { wt } = addWorktree(fx, "lane-o", fx.noHooks, fx.base);
    const r = run("sh", [LIB_SH, "--link"], wt);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /outside .*\.claude\/worktrees; create worktrees there/);
    assert.ok(!existsSync(join(fx.base, "node_modules")), "never a link in an arbitrary parent directory");
    assert.ok(!existsSync(join(wt, "fsi-app/node_modules")));
  });
});

test("main checkout: never touched; without an install --check names npm ci and a worktree reports it cannot resolve", () => {
  withFixture((fx) => {
    const { wt } = addWorktree(fx, "lane-e", fx.noHooks);
    assert.equal(lib(fx.main, "wt_nm_ensure_link").status, 0);
    assert.equal(lib(fx.main, "wt_nm_link_kind fsi-app/node_modules").stdout.trim(), "dir");

    renameSync(join(fx.main, "fsi-app/node_modules"), join(fx.base, "moved-away"));
    const mainCheck = run("sh", [LIB_SH, "--check"], fx.main);
    assert.equal(mainCheck.status, 1);
    assert.match(mainCheck.stderr, /do not resolve in this worktree: run \(cd fsi-app && npm ci\)/);
    const link = run("sh", [LIB_SH, "--link"], wt);
    assert.equal(link.status, 1);
    assert.match(link.stderr, /the main checkout has no fsi-app\/node_modules/);
    assert.ok(!existsSync(fx.shared), "nothing left behind");
  });
});

test("pre-push step 0b self-heals a worktree without the link, and fails fast naming the fix when it cannot", () => {
  withFixture((fx) => {
    const { wt } = addWorktree(fx, "lane-f", fx.noHooks);
    const prePush = () => run("sh", [`${HOOK_REL}/pre-push`, "origin", "unused"], wt, { env: { DISCIPLINE_HOOK_TRAMPOLINE: "1" } });

    const healed = prePush();
    assert.doesNotMatch(healed.stderr, /STEP 0b FAIL/, "a missing link is repaired, not reported");
    assert.ok(resolveNext(wt), "and the worktree now resolves");

    rmSync(fx.shared, { recursive: true, force: true });
    renameSync(join(fx.main, "fsi-app/node_modules"), join(fx.base, "moved-away"));
    const r = prePush();
    assert.equal(r.status, 1, `expected fail-fast exit 1, got ${r.status}: ${r.stderr}`);
    assert.ok(r.stderr.includes(FIX_LINK), `stderr must carry the fix line; got: ${r.stderr}`);
    assert.match(r.stderr, /STEP 0b FAIL/);
    assert.doesNotMatch(r.stdout + r.stderr, /step 1|STEP 1|F9|running 4-step/);
  });
});

test("WIRING: post-checkout repairs before exec'ing the isolation runner; pre-push self-heals then checks before step 1", () => {
  const post = readFileSync(join(HERE, "post-checkout"), "utf8");
  const ensure = post.indexOf("wt_nm_ensure_link");
  assert.ok(ensure > 0 && ensure < post.indexOf("exec node"), "repair must run before exec replaces the shell");
  const pre = readFileSync(join(HERE, "pre-push"), "utf8");
  const heal = pre.indexOf("wt_nm_ensure_link || true");
  const req = pre.indexOf("if ! wt_nm_require");
  assert.ok(heal > 0 && heal < req && req < pre.indexOf("# Step 1:"), "step 0b must heal, then check, before every CI-parity step");
});

test("IGNORE RULES: the repo's own gitignores cover the shared link and an in-tree link", () => {
  // --no-index + a path without a trailing slash is evaluated as a non-directory: how git sees a link.
  for (const p of [".claude/worktrees/node_modules", "fsi-app/node_modules"]) {
    const r = run("git", ["check-ignore", "--no-index", "-q", p], REPO_ROOT);
    assert.equal(r.status, 0, `${p} must be gitignored as a link, not only as a directory`);
  }
});

// Lane TESTS-1 (2026-10-09; AUD-AT-3 "Step 0b symlink inside a worktree": wt_nm_ensure_link leaves a real symlink alone
// by design; creating one on Windows needs Developer Mode or an administrator right, which that lane did not use).
// Linux CI creates symlinks freely, so the leg runs there; on a Windows machine without the right it skips with the
// reason. A REAL symlink (not a junction) is safe from git, so --link must neither remove it nor replace it, and the
// install behind it must stay intact when the worktree is removed.
function trySymlink(target, link) {
  try { symlinkSync(target, link, "dir"); return true; } catch (e) { return e; }
}

test("a real symlink inside a worktree is left alone by --link and --check, deps resolve through it, and removing the worktree keeps the install", () => {
  withFixture((fx) => {
    const { wt } = addWorktree(fx, "lane-s", fx.noHooks);
    const link = join(wt, "fsi-app", "node_modules");
    const made = trySymlink(join(fx.main, "fsi-app", "node_modules"), link);
    if (made !== true) return;           // see the skip test below: the reason is reported there
    assert.ok(lstatSync(link).isSymbolicLink());
    assert.equal(lib(wt, 'wt_nm_link_kind "$PWD/fsi-app/node_modules"').stdout.trim(), "symlink");

    const check = run("sh", [LIB_SH, "--check"], wt);
    assert.equal(check.status, 0, check.stderr);
    const linkRun = run("sh", [LIB_SH, "--link"], wt);
    assert.equal(linkRun.status, 0, linkRun.stderr);
    assert.ok(lstatSync(link).isSymbolicLink(), "the real symlink is still there: --link did not remove or replace it");
    assert.ok(resolveNext(wt), "next resolves through the symlink");
    assert.match(run("sh", [LIB_SH, "--audit"], fx.main).stdout, /^resolves symlink .*lane-s$/m);

    git(fx.main, "worktree", "remove", "--force", wt);
    assert.ok(installIntact(fx), "git worktree remove unlinks a real symlink and never follows it into the shared install");
  });
});

test("symlink creation is available on this machine, or the symlink leg above is skipped with the reason named", () => {
  withFixture((fx) => {
    const probe = join(fx.base, "probe-link");
    const made = trySymlink(fx.main, probe);
    if (made !== true) {
      assert.ok(IS_WINDOWS, `a non-Windows machine must be able to create a symlink (got ${made && made.code})`);
      assert.match(String(made.code), /EPERM|EACCES|UNKNOWN/, "Windows without Developer Mode or an administrator right refuses with a permission code");
    } else {
      assert.ok(lstatSync(probe).isSymbolicLink());
    }
  });
});
