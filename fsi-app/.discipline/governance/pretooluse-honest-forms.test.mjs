// PreToolUse honest forms (lane GATE-7, 2026-10-08).
// Run: node --test fsi-app/.discipline/governance/pretooluse-honest-forms.test.mjs
//
// Each test cites the AUD-AT-3 register attack it closes. In-process (evaluateGate / runGate), no node spawn.
// A decision of "deny" with no skill loaded means the gate read the call as a governed write; "allow" on the
// same call means it did not. The audit log and the firing log are redirected into a temp directory so the
// gate's own test never writes under the checkout.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateGate, runGate, scriptFileRun, governedPath, classifyMcp, isSelectSql, sqlReadKind, sqlSkeleton, auditLogPath, inScope,
} from "./pretooluse-skill-gate.mjs";
import { collectOpenFindings, REGISTER_GRACE_MS } from "../../scripts/verify/audit-finding-status.mjs";
import { skillFileReadInTranscript } from "./skill-token.mjs";
import { cwdHoldsFsiApp } from "./pretooluse-scope.mjs";
import { decide as decideEntry } from "./pretooluse-entry.mjs";
import { verifyWiring, matcherMatches } from "./check-pretooluse-wired.mjs";
import { applyWiring, SHIM_FILE_NAME } from "./wire-pretooluse-settings.mjs";

const TMP = mkdtempSync(join(tmpdir(), "gate7-honest-"));
const AUDIT_LOG = join(TMP, "gate-audit.log");
const FIRING_LOG = join(TMP, "firings.log");
process.env.GATE_AUDIT_LOG = AUDIT_LOG;
process.env.DISCIPLINE_FIRING_LOG = FIRING_LOG;
// RULE 13 (FLAG-1): a dispatch is refused while any finding is open. The dispatch cases below run against a clean
// empty root so they stay hermetic; the last test in this file proves the forcing point against the real tree.
const CLEAN_ROOT = join(TMP, "clean-root");
mkdirSync(CLEAN_ROOT, { recursive: true });
process.env.GATE_DISPOSITION_ROOT = CLEAN_ROOT;

let _id = 0;
const skillLine = (slug) => {
  const id = `toolu_h${++_id}`;
  return `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"${id}","name":"Skill","input":{"skill":"${slug}"}}]}}\n` +
    `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"${id}","content":"ok"}]}}`;
};
const readLine = (path, { error = false, result = true } = {}) => {
  const id = `toolu_r${++_id}`;
  const call = `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"${id}","name":"Read","input":{"file_path":${JSON.stringify(path)}}}]}}`;
  const res = `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"${id}","is_error":${error},"content":"x"}]}}`;
  return result ? `${call}\n${res}` : call;
};
const transcript = (name, ...lines) => {
  const p = join(TMP, name);
  writeFileSync(p, lines.join("\n") + "\n");
  return p;
};
const EMPTY = transcript("empty.jsonl", '{"type":"user","message":{"content":"hi"}}');
const LOADED = transcript("loaded.jsonl",
  ...["environmental-policy-and-innovation", "caros-ledge-platform-intent", "remediation-discipline", "source-credibility-model", "analysis-construction-spec", "sprint-followups-discipline"].map(skillLine));

const ABS = "/sandbox/checkout";
const decide = (tool_name, tool_input, tr = EMPTY, extra = {}) => evaluateGate({ tool_name, tool_input, transcript_path: tr, ...extra });
const verdict = (...a) => decide(...a).permissionDecision;
const bash = (command, tr = EMPTY) => verdict("Bash", { command }, tr);

// ── Bash danger leg ──────────────────────────────────────────────────────────────────────────────
const DENIED_FORMS = {
  "A-PT-B1 git -C <dir> push": "git -C /some/dir push origin x",
  "A-PT-B2 git --no-pager push": "git --no-pager push origin x",
  "A-PT-B3 git.exe push": "git.exe push origin x",
  "A-PT-B3 a path to git": "/usr/bin/git push origin x",
  "A-PT-B4 alias set on the command line": "git -c alias.p=push p origin x",
  "A-PT-B5 rm -fr": "rm -fr build",
  "A-PT-B6 rm -r -f": "rm -r -f build",
  "A-PT-B7 rm --recursive --force": "rm --recursive --force build",
  "A-PT-B8 find -delete": "find build -name '*.tmp' -delete",
  "A-PT-B8 find -exec rm": "find build -exec rm {} ;",
  "A-PT-B10 a quoted flag": 'node s.mjs "--apply"',
  "A-PT-B10 a single-quoted flag": "node s.mjs '--execute'",
  "A-PT-B11 env wrapper": 'env bash -c "git push"',
  "A-PT-B11 env with assignments and flags": 'env -i FOO=1 bash -c "git push"',
  "A-PT-B12 nohup wrapper": 'nohup sh -c "git push"',
  "A-PT-B13 timeout wrapper": "timeout 5 bash -c 'git push'",
  "A-PT-B14 heredoc fed to sh": "sh <<EOF\ngit push\nEOF",
  "A-PT-B14 heredoc fed to bash with a dash": "bash <<-EOF\n\tgit push\n\tEOF",
  "A-PT-B15 here-string fed to bash": 'bash <<< "git push"',
  "A-PT-B17 curl -X DELETE": 'curl -X DELETE "https://x.example/rest/v1/intelligence_items?id=eq.1"',
  "A-PT-B19 DROP SCHEMA": 'psql -c "DROP SCHEMA public CASCADE"',
  "A-PT-B20 schema-qualified update": 'psql -c "UPDATE public.intelligence_items SET x = 1"',
  "A-PT-B22 supabase.exe": "supabase.exe db push",
  "A-PT-B23 fetch method DELETE in node -e": "node -e \"fetch(u, { method: 'DELETE' })\"",
};
for (const [name, cmd] of Object.entries(DENIED_FORMS)) {
  test(`${name}: denied with no skill loaded, asked with them loaded`, () => {
    assert.equal(bash(cmd), "deny", cmd);
    assert.equal(bash(cmd, LOADED), "ask", cmd);
  });
}

const QUIET_FORMS = [
  "git status",
  "git -C /some/dir log --oneline",
  "rm -r build",
  "rm -f x.tmp",
  "find . -name '*.tmp'",
  "env FOO=1 node x.mjs",
  'timeout 5 node -e "console.log(1)"',
  'echo "--apply is documented here"',
  "cat <<EOF\ngit push\nEOF",
  "cat <<< 'git push'",
  'psql -c "select 1"',
  'curl -s "https://x.example/health"',
  "sh run-tests.sh",
];
for (const cmd of QUIET_FORMS) {
  test(`control: ${JSON.stringify(cmd).slice(0, 60)} stays allowed`, () => assert.equal(bash(cmd), "allow", cmd));
}

// ── governed-file edits ──────────────────────────────────────────────────────────────────────────
const EDIT_FORMS = {
  "A-PT-E1 a relative path resolved against the cwd": [{ file_path: "src/lib/agent/x.ts" }, { cwd: `${ABS}/fsi-app` }],
  "A-PT-E2 dot segment": [{ file_path: `${ABS}/fsi-app/./src/lib/agent/x.ts` }, {}],
  "A-PT-E2 dot-dot segment": [{ file_path: `${ABS}/fsi-app/src/lib/../lib/agent/x.ts` }, {}],
  "A-PT-E3 upper case": [{ file_path: `${ABS.toUpperCase()}/FSI-APP/SRC/LIB/AGENT/X.TS` }, {}],
  "A-PT-E5 doubled separator": [{ file_path: `${ABS}/fsi-app//src/lib/agent/x.ts` }, {}],
  "A-PT-E5 backslashes": [{ file_path: `${ABS}\\fsi-app\\src\\lib\\agent\\x.ts` }, {}],
  "A-PT-E6 the rules directory": [{ file_path: `${ABS}/fsi-app/.discipline/rules/012-hardcoded-user-path.mjs` }, {}],
  "A-PT-E6 the hooks directory": [{ file_path: `${ABS}/fsi-app/.discipline/hooks/pre-push` }, {}],
  "A-PT-E6 the engine": [{ file_path: `${ABS}/fsi-app/.discipline/runner.mjs` }, {}],
  "A-PT-E7 the CI workflow": [{ file_path: `${ABS}/.github/workflows/discipline.yml` }, {}],
  "A-PT-E8 the gate's own map": [{ file_path: `${ABS}/fsi-app/.discipline/governance/skill-map.mjs` }, {}],
};
for (const [name, [input, extra]] of Object.entries(EDIT_FORMS)) {
  test(`${name}: governed, denied with no skill, allowed with it loaded`, () => {
    assert.equal(verdict("Edit", input, EMPTY, extra), "deny");
    assert.equal(verdict("Edit", input, LOADED, extra), "allow");
  });
}
test("A-PT-E9 notebook_path on a governed directory is governed", () => {
  assert.equal(verdict("NotebookEdit", { notebook_path: `${ABS}/fsi-app/src/lib/agent/n.ipynb` }), "deny");
});
test("control: an ungoverned file stays ungoverned in every spelling", () => {
  assert.equal(verdict("Edit", { file_path: `${ABS}/fsi-app/src/components/Badge.tsx` }), "allow");
  assert.equal(verdict("Edit", { file_path: "docs/notes.md" }, EMPTY, { cwd: `${ABS}` }), "allow");
});
test("A-PT-E4 an 8.3 short name is expanded by the file system when it exists (Windows only)", { skip: process.platform !== "win32" }, () => {
  const long = join(TMP, "fsi-app-a-rather-long-directory-name");
  mkdirSync(join(long, "src"), { recursive: true });
  let short = "";
  try {
    short = execFileSync("cmd", ["/c", `for %I in ("${long}") do @echo %~sI`], { encoding: "utf8" }).trim();
  } catch { /* no cmd */ }
  if (!short || !short.includes("~")) return; // 8.3 names are switched off on this volume: nothing to expand
  assert.equal(governedPath(join(short, "src")).toLowerCase(), join(long, "src").toLowerCase());
});
test("governedPath leaves an unresolvable path as given and resolves a relative path against the cwd", () => {
  assert.equal(governedPath("FSI-AP~1/x.ts"), "FSI-AP~1/x.ts");
  assert.match(governedPath("src/x.ts", `${ABS}/fsi-app`).replaceAll("\\", "/"), /fsi-app\/src\/x\.ts$/);
});

// ── MCP leg ──────────────────────────────────────────────────────────────────────────────────────
const SRV = "mcp__38a1930a-6589-4306-b603-e51dc4e00422__";
test("A-PT-M1 / A-PT-M2: a read prefix with a mutating verb in the name is a write", () => {
  for (const name of ["get_and_delete_rows", "search_and_replace", "list_and_update_items", "read_then_write"]) {
    assert.equal(classifyMcp(SRV + name, {}), "write", name);
    assert.equal(verdict(SRV + name, {}), "deny", name);
  }
  for (const name of ["get_project", "list_deployments", "get_deployment_check_run", "list_vercel_ci_job_runs", "search_docs", "read_page"]) {
    assert.equal(classifyMcp(SRV + name, {}), "read", name);
  }
});
test("A-PT-M3 / A-PT-M5: a SELECT that calls a mutating function is not a plain read; a row lock or SELECT INTO is a write", () => {
  const tool = SRV + "execute_sql";
  assert.equal(classifyMcp(tool, { query: "select pg_terminate_backend(123)" }), "unknown");
  assert.equal(classifyMcp(tool, { query: "select set_config('a', 'b', false)" }), "unknown");
  assert.equal(verdict(tool, { query: "select pg_terminate_backend(123)" }), "ask");
  assert.equal(classifyMcp(tool, { query: "select * from t for update" }), "write");
  assert.equal(classifyMcp(tool, { query: "select * from t for no key update" }), "write");
  assert.equal(classifyMcp(tool, { query: "select 1 into scratch" }), "write");
  assert.equal(classifyMcp(tool, { query: "select count(*) from t where a in (select b from u)" }), "read");
});
test("A-PT-M4: a -- inside a string literal does not hide a second statement", () => {
  assert.equal(isSelectSql("select 'a--b'; delete from t"), false);
  assert.equal(classifyMcp(SRV + "execute_sql", { query: "select '--' as x; drop table t" }), "write");
  assert.equal(isSelectSql("select 'a--b' as x"), true);
  assert.equal(isSelectSql("select 1 -- trailing comment ; delete from t"), true);
  assert.equal(isSelectSql("select 1 /* ; delete from t */"), true);
  assert.equal(sqlSkeleton("select $$a;b$$, 'c' -- d"), "select '', ''  ");
  assert.equal(sqlReadKind("with x as (delete from t returning *) select * from x"), "write");
});

// ── skill evidence ───────────────────────────────────────────────────────────────────────────────
test("A-PT-T2: a Read counts for its own slug only, at a real .claude/skills path, and only if it resolved", () => {
  const slug = "remediation-discipline";
  const good = readLine(`${ABS}/fsi-app/.claude/skills/${slug}/SKILL.md`);
  assert.equal(skillFileReadInTranscript(good, slug), true);
  assert.equal(skillFileReadInTranscript(good, "source-credibility-model"), false, "another slug is not satisfied");
  assert.equal(skillFileReadInTranscript(readLine(`${ABS}/attacker/myskills/${slug}/SKILL.md`), slug), false, "a look-alike directory");
  assert.equal(skillFileReadInTranscript(readLine(`${ABS}/attacker/skills/${slug}/SKILL.md`), slug), false, "not under .claude");
  assert.equal(skillFileReadInTranscript(readLine(`${ABS}/fsi-app/.claude/skills/${slug}/SKILL.md`, { error: true }), slug), false, "an errored Read");
  assert.equal(skillFileReadInTranscript(readLine(`${ABS}/fsi-app/.claude/skills/${slug}/SKILL.md`, { result: false }), slug), false, "no result");
});
test("A-PT-T2 end to end: a forged Read does not turn a deny into an allow", () => {
  const forged = transcript("forged.jsonl", readLine(`${ABS}/attacker/skills/remediation-discipline/SKILL.md`), readLine(`${ABS}/attacker/skills/environmental-policy-and-innovation/SKILL.md`));
  assert.equal(bash("node x.mjs --apply", forged), "deny");
});

// ── worktree isolation leg ───────────────────────────────────────────────────────────────────────
test("A-PT-I1 to I7: more branch-moving forms ask; their read forms do not", () => {
  const asks = ["git -c alias.co=checkout co -b y", "git pull", "git pull --ff-only origin master", "git cherry-pick abc123", "git am patch.mbox",
    "git revert abc123", "git symbolic-ref HEAD refs/heads/x", "git restore .", "git clean -fdx", "git clean -f"];
  for (const cmd of asks) assert.equal(bash(cmd, LOADED), "ask", cmd);
  const quiet = ["git symbolic-ref HEAD", "git symbolic-ref --short HEAD", "git restore file.txt", "git clean -n", "git cherry-pick --abort", "git log"];
  for (const cmd of quiet) assert.equal(bash(cmd, LOADED), "allow", cmd);
});

// ── tools the registered matcher did not route ───────────────────────────────────────────────────
test("A-PT-R PowerShell and Monitor are judged as the shell they run", () => {
  assert.equal(verdict("PowerShell", { command: "git push origin x" }), "deny");
  assert.equal(verdict("PowerShell", { command: "Remove-Item -Recurse -Force build" }), "deny");
  assert.equal(verdict("PowerShell", { command: "Get-ChildItem" }), "allow");
  assert.equal(verdict("Monitor", { command: "node scripts/x.mjs --apply" }), "deny");
  assert.equal(verdict("Monitor", { command: "tail -f build.log" }), "allow");
});
test("A-PT-R EnterWorktree, ExitWorktree and SendMessage are asked", () => {
  for (const tool of ["EnterWorktree", "ExitWorktree"]) {
    assert.equal(verdict(tool, {}), "ask", tool);
    assert.match(decide(tool, {}).reason, /RD-19/);
  }
  assert.equal(verdict("SendMessage", { to: "agent", message: "x" }), "ask");
});
test("A-PT-R ArtifactData and Artifact: read actions allow, write actions are skill-gated (deny without, ask with)", () => {
  for (const action of ["get", "list", "query"]) assert.equal(verdict("ArtifactData", { action, url: "u" }), "allow", action);
  for (const action of ["set", "update", "delete", "batch"]) {
    assert.equal(verdict("ArtifactData", { action, url: "u" }), "deny", action);
    assert.equal(verdict("ArtifactData", { action, url: "u" }, LOADED), "ask", action);
  }
  for (const action of ["read", "list", "open", "quickstart"]) assert.equal(verdict("Artifact", { action }), "allow", action);
  for (const input of [{ action: "publish" }, { action: "delete", url: "u" }, { action: "pin", url: "u" }, { file_path: "x.html" }]) {
    assert.equal(verdict("Artifact", input), "deny", JSON.stringify(input));
    assert.equal(verdict("Artifact", input, LOADED), "ask", JSON.stringify(input));
  }
});

// ── logging: the audit log is out of the checkout and injectable; refusals reach the firing log ──
test("the audit log defaults under the gitignored out directory and is injectable or off", () => {
  assert.match(auditLogPath({}).replaceAll("\\", "/"), /fsi-app\/\.discipline\/out\/gate-audit\.log$/);
  assert.equal(auditLogPath({ GATE_AUDIT_LOG: "off" }), null);
  assert.equal(auditLogPath({ GATE_AUDIT_LOG: "/x/y.log" }), "/x/y.log");
});
test("runGate writes its audit line to the injected path and one firing line per refusal", () => {
  const payload = JSON.stringify({ tool_name: "Bash", tool_input: { command: "node x.mjs --apply" }, transcript_path: EMPTY });
  const before = existsSync(FIRING_LOG) ? readFileSync(FIRING_LOG, "utf8").length : 0;
  const out = JSON.parse(runGate(payload)).hookSpecificOutput;
  assert.equal(out.permissionDecision, "deny");
  assert.match(readFileSync(AUDIT_LOG, "utf8"), /\tBash\tdeny\tbash-write-skillmissing/);
  const added = readFileSync(FIRING_LOG, "utf8").slice(before).trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(added.length, 1);
  assert.deepEqual([added[0].rule, added[0].mode, added[0].verdict, added[0].line], ["pretooluse:bash-write-skillmissing", "pretooluse", "deny", "Bash"]);
  assert.equal(JSON.stringify(added[0]).includes("--apply"), false, "never the command");
});
test("an allow leaves no firing line; a script-file run is counted as a note and still decided on its command line", () => {
  const before = readFileSync(FIRING_LOG, "utf8").length;
  runGate(JSON.stringify({ tool_name: "Bash", tool_input: { command: "git status" }, transcript_path: EMPTY }));
  assert.equal(readFileSync(FIRING_LOG, "utf8").length, before);
  assert.equal(scriptFileRun("bash run-it.sh"), true);
  assert.equal(scriptFileRun("sh ./x.sh arg"), true);
  assert.equal(scriptFileRun('bash -c "echo hi"'), false);
  assert.equal(scriptFileRun("node x.mjs"), false);
  assert.equal(scriptFileRun("cat <<EOF\nx\nEOF"), false);
  runGate(JSON.stringify({ tool_name: "Bash", tool_input: { command: "bash run-it.sh" }, transcript_path: EMPTY }));
  const lines = readFileSync(FIRING_LOG, "utf8").slice(before).trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => [l.rule, l.verdict]), [["pretooluse:script-file", "note"]]);
});

// ── scope (the logic the out-of-repo shim imports) ───────────────────────────────────────────────
const exists = (set) => (p) => set.has(String(p).replaceAll("\\", "/"));
const REPO = new Set(["/work/wt-lane/fsi-app", "/work/fsi-app-copy/fsi-app"]);
const scope = (tool_name, tool_input, cwd) => inScope({ tool_name, tool_input, cwd }, { exists: exists(REPO) });
test("A-PT-S1 / A-PT-S2: fsi-app named as a word in the command is in scope from any cwd", () => {
  assert.equal(scope("Bash", { command: "node fsi-app/scripts/x.mjs --apply" }, "/elsewhere"), true);
  assert.equal(scope("Bash", { command: "cd fsi-app && node scripts/x.mjs --apply" }, "/elsewhere"), true);
  assert.equal(scope("Bash", { command: "ls my-fsi-app-backup" }, "/elsewhere"), false);
});
test("A-PT-S3 / A-PT-S8: a cwd that is or sits under a directory holding fsi-app is in scope, a renamed clone too", () => {
  assert.equal(scope("Bash", { command: "git push" }, "/work/wt-lane"), true);
  assert.equal(scope("Bash", { command: "git push" }, "/work/wt-lane/docs/ops"), true);
  assert.equal(scope("Bash", { command: "git push" }, "/work/fsi-app-copy"), true);
  assert.equal(scope("Bash", { command: "git push" }, "/work/other-project"), false);
  assert.equal(cwdHoldsFsiApp("/work/wt-lane/fsi-app/src", exists(new Set())), true);
});
test("A-PT-S4: a relative file path is resolved against the cwd; a file outside the project is not in scope", () => {
  assert.equal(scope("Edit", { file_path: "fsi-app/src/lib/agent/x.ts" }, "/elsewhere"), true);
  assert.equal(scope("Edit", { file_path: "src/lib/agent/x.ts" }, "/sandbox/fsi-app"), true);
  assert.equal(scope("Edit", { file_path: "/tmp/notes.txt" }, "/sandbox/fsi-app"), false);
  assert.equal(scope("Edit", { file_path: "/sandbox/.github/workflows/discipline.yml" }, "/elsewhere"), true);
  assert.equal(scope("Edit", { file_path: "/home/u/.claude/hooks/pretooluse-fsi-app-scope.mjs" }, "/elsewhere"), false);
});
test("A-PT-S5 / A-PT-S6: an MCP write or an Agent dispatch is scoped by the paths it NAMES, then by the cwd", () => {
  assert.equal(scope("mcp__s__apply_migration", { query: "x", note: "see fsi-app/supabase/migrations/1.sql" }, "/home/u"), true);
  assert.equal(scope("Agent", { prompt: "edit C:\\work\\wt\\fsi-app\\src\\x.ts" }, "/home/u"), true);
  assert.equal(scope("mcp__s__apply_migration", { query: "create table x(a int)" }, "/work/wt-lane"), true);
  assert.equal(scope("mcp__s__apply_migration", { query: "create table x(a int)" }, "/home/u"), false, "names no project path: not attributable");
});
test("A-PT-S7: a payload with no cwd and a command naming nothing is out of scope", () => {
  assert.equal(scope("Bash", { command: "ls" }, ""), false);
});

// ── WIRE-1 (2026-10-08): the entry the installed shim delegates to, and the verifier that fails on drift ──
// The shim installed under the user home carries no logic; pretooluse-entry.mjs holds read, parse, scope
// (failing TOWARD the gate) and the gate call. The matcher routes every tool name except a closed read-only
// list, so a tool that does not exist yet is classified by the entry, never silently unrouted.
const WIRE_HERE = dirname(fileURLToPath(import.meta.url));
const WIRE_REPO = join(WIRE_HERE, "..", "..", "..");
const decisionOf = (out) => JSON.parse(out).hookSpecificOutput.permissionDecision;

test("WIRE-1 entry: a routed tool the gate does not classify as mutating is allowed (a future SomeNewTool)", async () => {
  const out = await decideEntry(JSON.stringify({ tool_name: "SomeNewTool", tool_input: { x: 1 }, cwd: `${ABS}/fsi-app`, transcript_path: EMPTY }));
  assert.equal(decisionOf(out), "allow");
});
test("WIRE-1 entry: an in-scope write reaches the gate (deny with no skill), an out-of-scope call is allowed", async () => {
  const inside = await decideEntry(JSON.stringify({ tool_name: "Bash", tool_input: { command: "node fsi-app/scripts/x.mjs --apply" }, cwd: "/elsewhere", transcript_path: EMPTY }));
  assert.equal(decisionOf(inside), "deny");
  const outside = await decideEntry(JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push" }, cwd: "/unrelated-project-dir-with-no-repo", transcript_path: EMPTY }));
  assert.equal(decisionOf(outside), "allow");
});
test("WIRE-1 entry: an empty, unparseable or non-object payload goes to the gate and is asked (fails TOWARD the gate)", async () => {
  for (const raw of ["", "not json", "null", "42"]) assert.equal(decisionOf(await decideEntry(raw)), "ask", JSON.stringify(raw));
});

const wireSandbox = () => {
  const root = mkdtempSync(join(tmpdir(), "wire1-verify-"));
  const settingsPath = join(root, "home", ".claude", "settings.json");
  const userHooksDir = join(root, "home", ".claude", "hooks");
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify({ theme: "dark", env: { SECRET: "x" }, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "node other.mjs" }] }] } }, null, 2) + "\n");
  const ctx = { settingsPath, userHooksDir, mainRoot: WIRE_REPO };
  return { root, ctx, shimPath: join(userHooksDir, SHIM_FILE_NAME), edit: (fn) => { const s = JSON.parse(readFileSync(settingsPath, "utf8")); fn(s); writeFileSync(settingsPath, JSON.stringify(s, null, 2) + "\n"); }, clean: () => rmSync(root, { recursive: true, force: true }) };
};
const installed = () => { const sb = wireSandbox(); applyWiring({ ...sb.ctx, apply: true, log: () => {} }); return sb; };
const gateEntry = (s) => s.hooks.PreToolUse.find((e) => e.hooks.some((h) => String(h.command).includes("pretooluse-fsi-app-scope")));

test("WIRE-1 verifier: a freshly installed shim and settings pass end to end (source proof plus a real behavioral fire)", () => {
  const sb = installed();
  try {
    const v = verifyWiring(sb.ctx);
    assert.equal(v.status, "pass", JSON.stringify(v.problems));
  } finally { sb.clean(); }
});
test("WIRE-1: a new tool is routed by the matcher; Read is not", () => {
  const sb = installed();
  try {
    const entry = gateEntry(JSON.parse(readFileSync(sb.ctx.settingsPath, "utf8")));
    assert.equal(matcherMatches(entry.matcher, "SomeNewTool"), true);
    assert.equal(matcherMatches(entry.matcher, "mcp__brand__new_tool"), true);
    assert.equal(matcherMatches(entry.matcher, "Read"), false);
    assert.equal(matcherMatches(entry.matcher, "Glob"), false);
  } finally { sb.clean(); }
});
test("ATTACK WIRE-1: a shim with one logic line added fails the byte check", () => {
  const sb = installed();
  try {
    writeFileSync(sb.shimPath, readFileSync(sb.shimPath, "utf8") + "\nprocess.env.SKIP_GATE = '1';\n");
    const v = verifyWiring(sb.ctx);
    assert.equal(v.status, "fail");
    assert.match(v.problems.join("\n"), /installed shim differs from the rendered template/);
  } finally { sb.clean(); }
});
test("ATTACK WIRE-1: a stale matcher (the GATE-7 fifteen-name form, or the older one) fails", () => {
  for (const stale of [
    "^(Bash|PowerShell|Monitor|Edit|Write|MultiEdit|NotebookEdit|Agent|Task|Workflow|SendMessage|EnterWorktree|ExitWorktree|ArtifactData|Artifact|mcp__.+)$",
    "^(Bash|Edit|Write|MultiEdit|NotebookEdit|Agent|Task|Workflow|mcp__.+)$",
  ]) {
    const sb = installed();
    try {
      sb.edit((s) => { gateEntry(s).matcher = stale; });
      const v = verifyWiring(sb.ctx);
      assert.equal(v.status, "fail");
      assert.match(v.problems.join("\n"), /matcher is not the canonical MATCHER/);
      assert.match(v.problems.join("\n"), /SomeNewTool/, "an unknown tool name is not routed by a closed list");
    } finally { sb.clean(); }
  }
});
test("ATTACK WIRE-1: a hook command that drifted from the canonical command fails", () => {
  const sb = installed();
  try {
    sb.edit((s) => { gateEntry(s).hooks[0].command = `node "${sb.shimPath.replaceAll("\\", "/")}"`; });
    const v = verifyWiring(sb.ctx);
    assert.equal(v.status, "fail");
    assert.match(v.problems.join("\n"), /hook command differs from the canonical command/);
  } finally { sb.clean(); }
});
test("ATTACK WIRE-1: a missing installed shim fails; a missing gate entry fails; an absent settings.json skips", () => {
  const sb = installed();
  try {
    rmSync(sb.shimPath);
    assert.equal(verifyWiring(sb.ctx).status, "fail");
    sb.edit((s) => { s.hooks.PreToolUse = s.hooks.PreToolUse.filter((e) => !gateEntry({ hooks: { PreToolUse: [e] } })); });
    const v = verifyWiring(sb.ctx);
    assert.equal(v.status, "fail");
    rmSync(sb.ctx.settingsPath);
    assert.equal(verifyWiring(sb.ctx).status, "skip");
  } finally { sb.clean(); }
});
test("ATTACK WIRE-1: a gate hook wired DIRECTLY (unscoped) fails, so the installer's migration is required", () => {
  const sb = installed();
  try {
    sb.edit((s) => { gateEntry(s).hooks[0].command = `node "${join(WIRE_HERE, "pretooluse-skill-gate.mjs").replaceAll("\\", "/")}" || printf %s x`; });
    const v = verifyWiring(sb.ctx);
    assert.equal(v.status, "fail");
    assert.match(v.problems.join("\n"), /direct/i);
  } finally { sb.clean(); }
});

test("FLAG-1 forcing point: on the REAL tree a dispatch is refused while any finding is undispositioned, and reaches the ask once none is", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const open = collectOpenFindings(root, { registerGraceMs: REGISTER_GRACE_MS });
  const prev = process.env.GATE_DISPOSITION_ROOT;
  process.env.GATE_DISPOSITION_ROOT = root;
  try {
    const d = decide("Agent", { description: "x", prompt: "build the next thing" });
    if (open.length) {
      assert.equal(d.permissionDecision, "deny");
      assert.equal(d.tag, "dispatch-undispositioned");
      assert.ok(d.reason.includes(open[0].file + ":" + open[0].line), d.reason);
    } else {
      assert.equal(d.permissionDecision, "ask");
    }
    assert.equal(decide("Agent", { prompt: "DISPOSITION-LANE: disposition the open findings" }).permissionDecision, "ask");
  } finally { process.env.GATE_DISPOSITION_ROOT = prev; }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// LANE GATE-FIX-1 (2026-10-09). Register cells S4 and X4 (honest read-only and scratch commands refused), S5 and
// the Read-evidence ruling, X2 (the FLAG-1 loop). Each honest form is a passing test; each has an attack test
// proving the dishonest form is still refused.
// ═════════════════════════════════════════════════════════════════════════════════════════════════
import { skillsForFile } from "./skill-map.mjs";
import { utimesSync, symlinkSync } from "node:fs";

const wholeRead = (slug, extra = {}) => {
  const id = `toolu_gf${++_id}`;
  return `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"${id}","name":"Read","input":${JSON.stringify({ file_path: `${ABS}/fsi-app/.claude/skills/${slug}/SKILL.md`, ...extra })}}]}}\n` +
    `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"${id}","is_error":false,"content":"x"}]}}`;
};
const BASH_DEFAULT_SKILLS = ["remediation-discipline", "environmental-policy-and-innovation"];

test("GATE-FIX-1 S5: a whole Read of each governing SKILL.md is the skill looked at, equal to a Skill call (bash write: ask, not deny)", () => {
  const read = transcript("gf-read-both.jsonl", ...BASH_DEFAULT_SKILLS.map((s) => wholeRead(s)));
  const d = decide("Bash", { command: "node x.mjs --apply" }, read);
  assert.equal(d.permissionDecision, "ask");
  assert.equal(d.tag, "bash-write-ok");
  const target = `${ABS}/fsi-app/src/lib/trust.ts`;
  const skills = skillsForFile(target).map((s) => s.skill);
  assert.ok(skills.length > 0, "the fixture path is governed");
  const readAll = transcript("gf-read-edit.jsonl", ...skills.map((s) => wholeRead(s)));
  assert.equal(verdict("Edit", { file_path: target }, readAll), "allow");
});
test("ATTACK GATE-FIX-1 S5: a slice Read, one of two skills, or a Bash cat still denies; the refusal names the Read path first", () => {
  const slice = transcript("gf-read-slice.jsonl", ...BASH_DEFAULT_SKILLS.map((s) => wholeRead(s, { limit: 40 })));
  assert.equal(bash("node x.mjs --apply", slice), "deny", "limit");
  const offset = transcript("gf-read-offset.jsonl", ...BASH_DEFAULT_SKILLS.map((s) => wholeRead(s, { offset: 10 })));
  assert.equal(bash("node x.mjs --apply", offset), "deny", "offset");
  const one = transcript("gf-read-one.jsonl", wholeRead(BASH_DEFAULT_SKILLS[0]));
  const d = decide("Bash", { command: "node x.mjs --apply" }, one);
  assert.equal(d.permissionDecision, "deny");
  assert.match(d.reason, /Missing: environmental-policy-and-innovation\./);
  assert.ok(d.reason.indexOf("Read fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md") !== -1, d.reason);
  assert.ok(d.reason.indexOf("Read fsi-app/") < d.reason.indexOf("invoke Skill"), "the Read path comes before the Skill invocation");
  assert.match(d.reason, /stale/);
  const catted = transcript("gf-cat.jsonl", '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_cat","name":"Bash","input":{"command":"cat fsi-app/.claude/skills/remediation-discipline/SKILL.md"}}]}}');
  assert.equal(bash("node x.mjs --apply", catted), "deny", "Bash cat");
});

// ── item 2: honest read-only and scratch commands are allowed, not asked ─────────────────────────────
const TMP_FWD = TMP.split(String.fromCharCode(92)).join("/");
const OS_TMP_FWD = tmpdir().split(String.fromCharCode(92)).join("/");
const gfBash = (command, cwd = ABS) => verdict("Bash", { command }, EMPTY, { cwd });
test("GATE-FIX-1 S4/X4: git merge-tree in any form, git push --dry-run and output truncation are allowed with no skill loaded", () => {
  for (const cmd of [
    "git merge-tree --write-tree HEAD origin/master",
    "git -C /some/wt merge-tree --write-tree --name-only a b",
    "git merge-tree $(git merge-base a b) a b",
    "git push --dry-run origin lane/x",
    "git push -n origin lane/x",
    "git push origin lane/x --dry-run",
    "grep -rn truncate fsi-app/src",
    "grep -rn delete from docs",
    "git log --oneline | head -20",
    "git diff origin/master --stat | tail -5",
    "node --test x.test.mjs | grep -E fail | head",
  ]) assert.equal(gfBash(cmd), "allow", cmd);
});
test("ATTACK GATE-FIX-1 S4/X4: the dishonest forms still ask or deny", () => {
  assert.equal(gfBash("git push origin lane/x"), "deny", "git push without --dry-run");
  assert.equal(gfBash("git push --dry-run --no-dry-run origin x"), "deny", "dry-run cancelled");
  assert.equal(gfBash("git merge-tree --write-tree a b && node s.mjs --apply"), "deny", "an --apply after merge-tree");
  assert.equal(gfBash("git merge-tree a b; git push origin x"), "deny", "a real push after merge-tree");
  assert.equal(gfBash("node s.mjs --write"), "deny", "--write on anything but merge-tree");
  assert.equal(gfBash("node s.mjs --apply | head -5"), "deny", "truncation does not launder the write before it");
  assert.equal(gfBash("psql -c 'truncate t' | tail"), "deny", "a truncate run by an interpreter");
  assert.equal(gfBash("git push --dry-run origin x; git push origin x"), "deny", "dry-run then a real push");
});
test("GATE-FIX-1 X4: rm -rf of paths under the OS temp dir, the scratchpad or fsi-app/scripts/tmp is allowed", () => {
  const scratch = `${TMP_FWD}/gf-scratch`;
  mkdirSync(join(TMP, "gf-scratch"), { recursive: true });
  assert.equal(gfBash(`rm -rf ${scratch}`), "allow");
  assert.equal(gfBash(`rm -rf ${scratch}/a ${scratch}/b`), "allow");
  assert.equal(gfBash(`rm -r -f "${scratch}/quoted dir"`), "allow", "quoted path");
  assert.equal(gfBash("rm -rf gf-scratch/sub", TMP_FWD), "allow", "relative, resolved against the cwd");
  assert.equal(gfBash(`rm -rf ${scratch} 2>/dev/null`), "allow", "redirect target is not a path");
  assert.equal(gfBash(`rm -rf -- ${scratch}`), "allow", "end of options");
  assert.equal(gfBash("rm -rf fsi-app/scripts/tmp/probe-1", ABS), "allow", "the repo scratch directory, by cwd");
  assert.equal(gfBash(`rm -rf ${ABS}/fsi-app/scripts/tmp/probe-2`), "allow", "the repo scratch directory, absolute");
});
test("ATTACK GATE-FIX-1 X4: rm -rf with ANY path outside those roots still denies", () => {
  const scratch = `${TMP_FWD}/gf-scratch`;
  for (const cmd of [
    "rm -rf build",
    `rm -rf ${scratch} build`,
    `rm -rf build ${scratch}`,
    `rm -rf ${OS_TMP_FWD}`,
    `rm -rf ${OS_TMP_FWD}/`,
    `rm -rf ${scratch}/../../../elsewhere`,
    `rm -rf ${ABS}/fsi-app/scripts/tmp`,
    `rm -rf ${ABS}/fsi-app/src`,
    `rm -rf ${scratch}/*`,
    "rm -rf $HOME/x",
    "rm -rf ~/x",
    `rm -rf ${scratch} && rm -rf build`,
    "rm -rf /",
    "rm -fr relative-path-under-no-root",
  ]) assert.equal(gfBash(cmd), "deny", cmd);
  assert.equal(verdict("Bash", { command: "rm -rf gf-scratch/x" }, EMPTY), "deny", "a relative path with no cwd is unresolvable");
  assert.equal(gfBash("find build -delete"), "deny", "find -delete is untouched");
});
test("ATTACK GATE-FIX-1 X4: a link inside the temp dir that leads out of it does not carry a delete out", (t) => {
  const link = join(TMP, "gf-escape");
  try { symlinkSync(process.cwd(), link, "junction"); } catch { t.skip("cannot create a link here"); return; }
  assert.equal(gfBash(`rm -rf ${TMP_FWD}/gf-escape/src`), "deny");
});

// ── item 3: register staleness; item 3b: a disposition act ──────────────────────────────────────────
const gfRoot = (name, files, { ageHours = {} } = {}) => {
  const root = join(TMP, name);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
    if (ageHours[rel] !== undefined) {
      const t = (Date.now() - ageHours[rel] * 3600 * 1000) / 1000;
      utimesSync(join(root, rel), t, t);
    }
  }
  return root;
};
const gfDispatch = (root, tool, input) => {
  const prev = process.env.GATE_DISPOSITION_ROOT;
  process.env.GATE_DISPOSITION_ROOT = root;
  try { return evaluateGate({ tool_name: tool, tool_input: input, transcript_path: LOADED }); } finally { process.env.GATE_DISPOSITION_ROOT = prev; }
};
const REG = "fsi-app/scripts/tmp/gf-register-a.md";
const LOG = "docs/ops/session-log.d/2026-10-09-gf-x.md";
test("GATE-FIX-1 item 3: a 1-hour-old scratch register does not block a dispatch; the refusal for a 25-hour-old one names file and age", () => {
  const fresh = gfRoot("gf-fresh", { [REG]: "- a guard that is missing here\n" }, { ageHours: { [REG]: 1 } });
  assert.equal(gfDispatch(fresh, "Agent", { prompt: "go" }).permissionDecision, "ask");
  const stale = gfRoot("gf-stale", { [REG]: "- a guard that is missing here\n" }, { ageHours: { [REG]: 25 } });
  const d = gfDispatch(stale, "Agent", { prompt: "go" });
  assert.equal(d.permissionDecision, "deny");
  assert.equal(d.tag, "dispatch-undispositioned");
  assert.ok(d.reason.includes(`${REG}:1`), d.reason);
  assert.match(d.reason, /register 25h old/);
});
test("ATTACK GATE-FIX-1 item 3: a committed session log with one open finding refuses regardless of age, a fresh register beside it is not listed", () => {
  const root = gfRoot("gf-log-fresh", { [LOG]: "## NOT done\n- a leg nobody owns\n", [REG]: "- a guard that is missing here\n" }, { ageHours: { [REG]: 1, [LOG]: 0 } });
  const d = gfDispatch(root, "Agent", { prompt: "go" });
  assert.equal(d.permissionDecision, "deny");
  assert.match(d.reason, /1 finding\(s\) carry no disposition/);
  assert.ok(d.reason.includes(`${LOG}:2`), d.reason);
  assert.ok(!d.reason.includes(REG), "the fresh register is not listed");
});
test("GATE-FIX-1 item 3b: a message of file:line -> [TOKEN] pairs covering every open finding is a disposition act and passes", () => {
  const root = gfRoot("gf-act", { [LOG]: "## NOT done\n- leg one\n- leg two\n", [REG]: "- a guard that is missing here\n" }, { ageHours: { [REG]: 30 } });
  const message = `${LOG}:2 -> [NOT-WORK: a scope statement]\n${LOG}:3 -> [WORK: gatefix2]\n${REG}:1 -> [CLOSED: PR 1040]`;
  for (const [tool, input] of [["SendMessage", { to: "x", message }], ["Agent", { description: "d", prompt: message }]]) {
    const d = gfDispatch(root, tool, input);
    assert.equal(d.permissionDecision, "ask", tool);
    assert.equal(d.tag, "dispatch", tool);
  }
  const arrows = `${LOG}:2 => [NOT-WORK: r]\n${LOG}:3 → [NOT-WORK: r]\n./${REG}:1 -> [NOT-WORK: r]`;
  assert.equal(gfDispatch(root, "SendMessage", { message: arrows }).permissionDecision, "ask");
});
test("ATTACK GATE-FIX-1 item 3b: partial, malformed, bare-status or unrelated pairs are refused, naming what is uncovered", () => {
  const root = gfRoot("gf-partial", { [LOG]: "## NOT done\n- leg one\n- leg two\n" });
  const partial = gfDispatch(root, "SendMessage", { message: `${LOG}:2 -> [NOT-WORK: r]` });
  assert.equal(partial.permissionDecision, "deny");
  assert.match(partial.reason, /1 finding\(s\) carry no disposition/);
  assert.ok(partial.reason.includes(`${LOG}:3`) && !partial.reason.includes(`${LOG}:2;`), partial.reason);
  assert.match(partial.reason, /dispositions 1 of 2/);
  for (const bad of [`${LOG}:2 -> [NOT-WORK]\n${LOG}:3 -> [NOT-WORK: r]`, `${LOG}:2 -> [REFUTED]\n${LOG}:3 -> [NOT-WORK: r]`, `${LOG}:2 -> [WORK: bad lane id]\n${LOG}:3 -> [NOT-WORK: r]`,
    `${LOG}:2 -> [NOT-WORK: r]\n${LOG}:9 -> [NOT-WORK: r]`, "build the next thing", `see ${LOG} and [NOT-WORK: r]`]) {
    assert.equal(gfDispatch(root, "SendMessage", { message: bad }).permissionDecision, "deny", bad);
  }
  assert.equal(gfDispatch(root, "Agent", { prompt: "DISPOSITION-LANE: disposition them" }).permissionDecision, "ask", "the lane literal stays");
});
