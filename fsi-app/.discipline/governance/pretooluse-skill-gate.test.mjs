// FIRE-TEST for the action-time skill gate (pretooluse-skill-gate.mjs), wired into `node --test`
// (pre-push step 3 + CI). Asserts EFFICACY, not existence. Catches the regressions that made the gate
// a silent no-op (absolute-path match failure; Windows ESM import error) AND proves the operator rule:
// a governed write is BLOCKED unless the governing skill was deliberately LOADED this session.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { runGate, evaluateGate, argvOnly, isolationAsk, classifyMcp, isSelectSql, mcpToolName, interpreterPayloads } from "./pretooluse-skill-gate.mjs";

const HOOK = resolve(dirname(fileURLToPath(import.meta.url)), "pretooluse-skill-gate.mjs");

// Fake session transcripts: one WITH explicit (RESOLVED) Skill invocations, one WITHOUT.
// Each invocation is a tool_use + a non-errored tool_result for it — the matcher (skill-token.mjs)
// requires the invocation to have RESOLVED successfully (G-12 fix), not merely to appear.
const TMP = mkdtempSync(join(tmpdir(), "skillgate-"));
// The gate's audit log and the shared firing log are redirected into the temp directory (GATE-7, TESTFIX-1): the
// gate's own test must never append to files under the checkout. The CLI children spawned below inherit this.
const AUDIT_LOG = join(TMP, "gate-audit.log");
const FIRING_LOG = join(TMP, "firings.log");
process.env.GATE_AUDIT_LOG = AUDIT_LOG;
process.env.DISCIPLINE_FIRING_LOG = FIRING_LOG;
let _sgId = 0;
const skillLine = (slug) => {
  const id = `toolu_sg${++_sgId}`;
  return `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"${id}","name":"Skill","input":{"skill":"${slug}"}}]}}\n` +
    `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"${id}","content":"Launching skill: ${slug}"}]}}`;
};
const LOADED = join(TMP, "loaded.jsonl");
writeFileSync(LOADED, [
  skillLine("environmental-policy-and-innovation"),
  skillLine("analysis-construction-spec"),
  skillLine("caros-ledge-platform-intent"),
  skillLine("source-credibility-model"),
  skillLine("remediation-discipline"),
  skillLine("sprint-followups-discipline"),
].join("\n") + "\n");
const EMPTY = join(TMP, "empty.jsonl");
writeFileSync(EMPTY, '{"type":"user","message":{"content":"hi"}}\n'); // no Skill invocation

// ── sub-agent transcript fixtures (2026-09-19 fix: the gate must judge the ACTING agent's own
// transcript, derived from payload.agent_id via agent-transcript.mjs, not the parent's). Layout mirrors
// what this machine actually writes: `<parent-dir>/<parent-basename-without-ext>/subagents/agent-<id>.jsonl`.
const PARENT_NO_SKILL = join(TMP, "parent-no-skill.jsonl");
writeFileSync(PARENT_NO_SKILL, '{"type":"user","message":{"content":"hi"}}\n'); // parent never loaded it
const SUBAGENT_OK_DIR = join(TMP, "parent-no-skill", "subagents");
mkdirSync(SUBAGENT_OK_DIR, { recursive: true });
const SUBAGENT_OK = join(SUBAGENT_OK_DIR, "agent-subA.jsonl");
writeFileSync(SUBAGENT_OK, skillLine("environmental-policy-and-innovation") + "\n"); // the sub-agent DID load it

const PARENT_WITH_SKILL = join(TMP, "parent-with-skill.jsonl");
writeFileSync(PARENT_WITH_SKILL, skillLine("environmental-policy-and-innovation") + "\n"); // PARENT loaded it
const SUBAGENT_EMPTY_DIR = join(TMP, "parent-with-skill", "subagents");
mkdirSync(SUBAGENT_EMPTY_DIR, { recursive: true });
const SUBAGENT_EMPTY = join(SUBAGENT_EMPTY_DIR, "agent-subB.jsonl");
writeFileSync(SUBAGENT_EMPTY, '{"type":"user","message":{"content":"hi"}}\n'); // the sub-agent itself did NOT

const PA = (tool_name, tool_input, transcript, agent_id) =>
  JSON.stringify({ tool_name, tool_input, transcript_path: transcript, agent_id });

function decide(payload) {
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: "utf8" });
  try { return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision; }
  catch { return `__UNPARSEABLE__(${(r.stdout || r.stderr || "").slice(0, 80)})`; }
}
function reasonOf(payload) {
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: "utf8" });
  try { return JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason || ""; } catch { return ""; }
}
const ABS = "/sandbox/checkout"; // synthetic absolute root — exercises abs-path suffix match w/o a hardcoded home (rule 012)
const P = (tool_name, tool_input, transcript = LOADED) => JSON.stringify({ tool_name, tool_input, transcript_path: transcript });

// ── decisions WHEN the governing skill IS loaded ──
const LOADED_CASES = [
  ["Edit governed canonical-pipeline → allow (skill loaded)", "allow", P("Edit", { file_path: `${ABS}/fsi-app/src/lib/agent/canonical-pipeline.ts` })],
  ["Edit governed trust.ts → allow (skill loaded)", "allow", P("Edit", { file_path: `${ABS}/fsi-app/src/lib/trust.ts` })],
  ["Write new surface page.tsx → allow (skill loaded)", "allow", P("Write", { file_path: `${ABS}/fsi-app/src/app/x/page.tsx` })],
  ["Edit formats/ file → allow (skill loaded)", "allow", P("Edit", { file_path: `${ABS}/fsi-app/src/lib/agent/formats/prose-extractor.ts` })],
  ["Edit migration → allow (skill loaded)", "allow", P("Edit", { file_path: `${ABS}/fsi-app/supabase/migrations/140_x.sql` })],
  ["Edit governed via RELATIVE path → allow (skill loaded)", "allow", P("Edit", { file_path: "fsi-app/src/lib/agent/canonical-pipeline.ts" })],
  ["Write ungoverned README → allow", "allow", P("Write", { file_path: `${ABS}/fsi-app/README.md` })],
  ["Edit ungoverned component → allow", "allow", P("Edit", { file_path: `${ABS}/fsi-app/src/components/Badge.tsx` })],
  ["Bash --apply with skill loaded → ask", "ask", P("Bash", { command: "node scripts/regen-quarantined.mjs --apply" })],
  ["Bash read-only → allow", "allow", P("Bash", { command: "node scripts/regen-quarantined.mjs" })],
  ["MCP read (get_file_contents) → allow", "allow", P("mcp__github__get_file_contents", { path: "x" })],
  ["MCP read (list_commits) → allow", "allow", P("mcp__github__list_commits", {})],
  ["MCP write (create_pull_request) with skill loaded → ask", "ask", P("mcp__github__create_pull_request", { title: "x" })],
  ["MCP write (push_files) with skill loaded → ask", "ask", P("mcp__github__push_files", { files: [] })],
  ["MCP write (merge_pull_request) with skill loaded → ask", "ask", P("mcp__github__merge_pull_request", { pull_number: 1 })],
  ["Read tool → allow", "allow", P("Read", { file_path: "x" })],
  // Dispatch tools — always ask (subagent interior is not hook-covered; surface the gap every time)
  ["Agent dispatch → ask", "ask", P("Agent", { description: "x", prompt: "y" })],
  ["Task dispatch → ask", "ask", P("Task", { prompt: "y" })],
  ["Workflow dispatch → ask", "ask", P("Workflow", { script: "..." })],
];
for (const [name, expect, payload] of LOADED_CASES) {
  test(name, () => assert.equal(decide(payload), expect));
}

// ── DENY WHEN the governing skill is NOT loaded (the operator rule: no workaround) ──
const DENY_CASES = [
  ["Edit governed pipeline, NO skill loaded → deny", "deny", P("Edit", { file_path: `${ABS}/fsi-app/src/lib/agent/canonical-pipeline.ts` }, EMPTY)],
  ["Bash --apply, NO skill loaded → deny", "deny", P("Bash", { command: "node x.mjs --apply" }, EMPTY)],
  ["MCP create_pull_request, NO skill loaded → deny", "deny", P("mcp__github__create_pull_request", { title: "x" }, EMPTY)],
  ["MCP push_files, NO skill loaded → deny", "deny", P("mcp__github__push_files", { files: [] }, EMPTY)],
  ["MCP merge_pull_request, NO skill loaded → deny", "deny", P("mcp__github__merge_pull_request", { pull_number: 1 }, EMPTY)],
];
for (const [name, expect, payload] of DENY_CASES) {
  test(name, () => assert.equal(decide(payload), expect));
}

// ── fail-closed backstops (no transcript needed) ──
test("empty payload → ask", () => assert.equal(decide(""), "ask"));
test("unparseable payload → ask", () => assert.equal(decide("{not json"), "ask"));

// ── EFFICACY: deny reason must NAME the missing skill (proves the transcript check ran, not a blanket deny) ──
test("EFFICACY: deny reason names the missing governing skill", () => {
  const reason = reasonOf(P("Edit", { file_path: `${ABS}/fsi-app/src/lib/agent/canonical-pipeline.ts` }, EMPTY));
  assert.ok(reason.includes("environmental-policy-and-innovation"), `deny reason did not name the skill: ${reason}`);
});
// ── EFFICACY: Bash --apply (skill loaded) names the real per-op skill (skill-map loaded, not fallback) ──
test("EFFICACY: Bash --apply names the real per-op skill", () => {
  const reason = reasonOf(P("Bash", { command: "node x.mjs --apply update intelligence_items set provenance_status" }));
  assert.ok(reason.includes("environmental-policy-and-innovation"), `reason did not name per-op skill: ${reason}`);
});

// ── ACTING-AGENT TRANSCRIPT (2026-09-19 fix, lane G1). Plants the exact defect lane M3 hit on
// 2026-09-20 00:55 UTC: a sub-agent's OWN Skill load must be what the gate judges, never the parent's. ──
const GOVERNED_FILE = { file_path: `${ABS}/fsi-app/src/lib/agent/canonical-pipeline.ts` };

test("sub-agent payload: its OWN transcript holds the Skill load -> allow (parent never loaded it)", () => {
  assert.equal(decide(PA("Edit", GOVERNED_FILE, PARENT_NO_SKILL, "subA")), "allow");
});

test("ATTACK: sub-agent payload where ONLY the parent transcript holds the Skill load -> deny (a skill loaded solely by the parent does not count for the sub-agent)", () => {
  assert.equal(decide(PA("Edit", GOVERNED_FILE, PARENT_WITH_SKILL, "subB")), "deny");
});

test("sub-agent payload whose derived transcript file does not exist -> ask (GATE-2: no transcript is an infrastructure condition, not a violation), no-transcript reason", () => {
  const payload = PA("Edit", GOVERNED_FILE, PARENT_NO_SKILL, "sub-does-not-exist");
  assert.equal(decide(payload), "ask");
  assert.ok(reasonOf(payload).includes("no readable session transcript"), reasonOf(payload));
});

test("main-session payload (no agent_id field at all) is unchanged: parent transcript with skill -> allow", () => {
  assert.equal(decide(P("Edit", GOVERNED_FILE, LOADED)), "allow");
});
test("main-session payload (no agent_id field at all) is unchanged: parent transcript without skill -> deny", () => {
  assert.equal(decide(P("Edit", GOVERNED_FILE, EMPTY)), "deny");
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// GATE-2 (2026-10-08): the classifier rebuild. In-process (runGate / evaluateGate), no node spawn.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════
const decideIn = (tool_name, tool_input, transcript = EMPTY) =>
  evaluateGate({ tool_name, tool_input, transcript_path: transcript }).permissionDecision;
const tagIn = (tool_name, tool_input, transcript = EMPTY) =>
  evaluateGate({ tool_name, tool_input, transcript_path: transcript }).tag;

// ── (a) DANGER runs over the command's own argv ──
// The sample commands of gate-evaluation-A section 5 P2 plus the heredoc cases. With NO skill loaded a
// command the gate reads as a data write is DENIED; a command it reads as plain argv is allowed.
const NOT_DANGER = [
  'git commit -m "fix truncate bug"',
  "echo truncated",
  'grep -rn "git push" docs',
  'git log --grep="rm -rf"',
  "git commit -m 'drop table users and delete from sources'",
  "echo hello # node x.mjs --apply and git push",
  "git status # rm -rf",
  "cat > note.md <<EOF\ngit push origin master\nrm -rf build\ntruncate table x; delete from sources\nnode run --apply\nEOF",
  "cat > note.md <<'EOF'\nupdate intelligence_items set provenance_status = 'x'\nEOF",
  "cat <<-EOF\n\tgit push\n\tEOF\necho done",
  "cat <<EOF | wc -l\nrm -rf x\nEOF",
];
const IS_DANGER = [
  "node scripts/x.mjs --apply",
  "git push origin lane/x",
  "rm -rf build",
  "truncate -s 0 file.log",
  "supabase db push",
  'echo "ok" ; git push',
  "cat <<EOF\nharmless\nEOF\nnode y.mjs --execute",
  "cat <<EOF > f.txt\nharmless\nEOF\nrm -rf dist # cleanup",
];
for (const cmd of NOT_DANGER) {
  test(`DANGER not read from prose: ${JSON.stringify(cmd).slice(0, 70)} -> allow bash-read`, () => {
    assert.equal(decideIn("Bash", { command: cmd }), "allow");
    assert.equal(tagIn("Bash", { command: cmd }), "bash-read");
  });
}
for (const cmd of IS_DANGER) {
  test(`DANGER still read from argv: ${JSON.stringify(cmd).slice(0, 70)} -> deny with no skill loaded`, () => {
    assert.equal(decideIn("Bash", { command: cmd }), "deny");
  });
}
// Interpreter inline code (coordinator ruling on PR 998): DANGER also runs over the -c / -e argument of
// psql, bash, sh, zsh, node, python and python3. Prose in an echo is still quiet.
const INTERPRETER_DENIED = [
  'psql -c "delete from t"',
  'bash -c "git push"',
  "sh -c 'rm -rf build'",
  'zsh -c "git push origin x"',
  'node -e "require(\'x\').run(\'--apply\')"',
  'python3 -c "import os; os.system(\'rm -rf /tmp/x\')"',
  'PGPASSWORD=x psql -c "truncate table sources"',
  'bash -lc "git push"',
  'psql --command="drop table x"',
  'cd repo && bash -c "bash -c \'git push\'"',
];
const INTERPRETER_ALLOWED = [
  'echo "delete from t"',
  'bash -c "echo hello"',
  "bash -c \"echo 'git push is documented'\"",
  'node -e "console.log(1 + 1)"',
  'psql -c "select 1"',
  'grep -c "delete from" file.sql',
  'git commit -m "psql -c delete from t"',
];
for (const cmd of INTERPRETER_DENIED) {
  test(`interpreter inline code is read: ${cmd.slice(0, 60)} -> deny with no skill loaded`, () => {
    assert.equal(decideIn("Bash", { command: cmd }), "deny");
  });
}
for (const cmd of INTERPRETER_ALLOWED) {
  test(`interpreter look-alike stays quiet: ${cmd.slice(0, 60)} -> allow`, () => {
    assert.equal(decideIn("Bash", { command: cmd }), "allow");
  });
}
test("interpreterPayloads: shell vs code kinds, env assignments skipped, only inline-code flags", () => {
  assert.deepEqual(interpreterPayloads('FOO=1 bash -c "git push"'), [{ kind: "shell", content: "git push" }]);
  assert.deepEqual(interpreterPayloads('psql -c "select 1"'), [{ kind: "code", content: "select 1" }]);
  assert.deepEqual(interpreterPayloads('/usr/bin/node.exe -e "1"'), [{ kind: "code", content: "1" }]);
  assert.deepEqual(interpreterPayloads('grep -c "x" f'), []);
  assert.deepEqual(interpreterPayloads('bash script.sh "arg"'), []);
});

test("argvOnly strips heredoc bodies, quoted strings and comments, keeps the command shape", () => {
  assert.equal(argvOnly('git commit -m "a b c" # note').trim(), "git commit -m Q");
  assert.equal(argvOnly("echo 'x y' && ls").trim(), "echo Q && ls");
  assert.equal(argvOnly("cat <<EOF\nbody git push\nEOF\nls").replace(/\s+/g, " ").trim(), "cat << ls");
  assert.equal(argvOnly("echo a#b").trim(), "echo a#b"); // # inside a word is not a comment
});

// ── (b) MCP classification by explicit tables ──
const SERVERS = ["mcp__38a1930a-6589-4306-b603-e51dc4e00422__", "mcp__Claude_Browser__", "mcp__ccd_session__", "mcp__claude-in-chrome__", "mcp__computer-use__"];
const READ_NAMES = [
  "list_deployments", "list_deployment_events", "list_tables", "get_project", "get_page_text", "read_page", "read_console_messages",
  "search_docs", "query_logs", "find", "navigate", "screenshot", "mark_chapter", "tabs_context", "tabs_context_mcp", "status",
];
const WRITE_NAMES = [
  "apply_migration", "create_branch", "create_project", "update_project", "delete_branch", "deploy_edge_function",
  "upload_file", "set_pinned", "run_session_command", "push_files", "merge_pull_request", "merge_branch",
];
for (const name of READ_NAMES) {
  test(`MCP read table: ${name} -> read, allowed with no skill loaded`, () => {
    for (const srv of SERVERS) assert.equal(classifyMcp(srv + name, {}), "read", srv + name);
    assert.equal(decideIn(SERVERS[0] + name, {}), "allow");
  });
}
for (const name of WRITE_NAMES) {
  test(`MCP write table: ${name} -> write, denied with no skill loaded, asked with the skills loaded`, () => {
    assert.equal(classifyMcp(SERVERS[0] + name, {}), "write");
    assert.equal(decideIn(SERVERS[0] + name, {}, EMPTY), "deny");
    assert.equal(decideIn(SERVERS[0] + name, {}, LOADED), "ask");
  });
}
test("MCP execute_sql: a SELECT is a read, anything else is a write", () => {
  const tool = "mcp__195a4223-3d5d-4202-92f2-c21ab8592f58__execute_sql";
  assert.equal(classifyMcp(tool, { query: "select count(*) from sources" }), "read");
  assert.equal(classifyMcp(tool, { query: "  /* c */ SELECT 1; " }), "read");
  assert.equal(classifyMcp(tool, { query: "select 1; delete from sources" }), "write");
  assert.equal(classifyMcp(tool, { query: "delete from sources" }), "write");
  assert.equal(classifyMcp(tool, { query: "with x as (delete from sources returning *) select * from x" }), "write");
  assert.equal(classifyMcp(tool, { query: "update sources set a = 'select'" }), "write");
  assert.equal(classifyMcp(tool, {}), "write");
  assert.equal(decideIn(tool, { query: "select 1" }, EMPTY), "allow");
  assert.equal(decideIn(tool, { query: "drop table x" }, EMPTY), "deny");
  assert.equal(isSelectSql("select ';' as a"), true);
});
test("MCP unknown names ask and never deny (with or without the skills loaded)", () => {
  for (const name of ["left_click", "form_input", "buy_credits", "weird_tool"]) {
    assert.equal(classifyMcp(SERVERS[0] + name, {}), "unknown", name);
    assert.equal(decideIn(SERVERS[0] + name, {}, EMPTY), "ask", name);
    assert.equal(decideIn(SERVERS[0] + name, {}, LOADED), "ask", name);
  }
});
test("MCP browser_batch is read only when every action is read", () => {
  const b = (actions) => classifyMcp("mcp__Claude_Browser__browser_batch", { actions });
  assert.equal(b([{ name: "navigate", input: {} }, { name: "get_page_text", input: {} }]), "read");
  assert.equal(b([{ name: "computer", input: { action: "screenshot" } }, { name: "find", input: {} }]), "read");
  assert.equal(b([{ name: "computer", input: { action: "left_click" } }]), "unknown");
  assert.equal(b([{ name: "navigate", input: {} }, { name: "form_input", input: {} }]), "unknown");
  assert.equal(b([{ name: "create_project", input: {} }]), "write");
  assert.equal(decideIn("mcp__claude-in-chrome__browser_batch", { actions: [{ name: "read_page", input: {} }] }, EMPTY), "allow");
});
test("mcpToolName takes the part after the server", () => {
  assert.equal(mcpToolName("mcp__Claude_Browser__navigate"), "navigate");
  assert.equal(mcpToolName("mcp__claude-in-chrome__tabs_context_mcp"), "tabs_context_mcp");
  assert.equal(mcpToolName("mcp__plugin_data_hex__get_thing"), "get_thing");
});

// ── (c) worktree isolation asks only for the branch-moving forms ──
const ISOLATION_ASKS = [
  "git checkout main", "git checkout -b feature", "git -C /some/dir checkout origin/master", "git switch main", "git switch -c x",
  "git rebase master", "git rebase --continue", "git merge origin/master", "git worktree add ../w branchx",
  "git reset --hard HEAD~1", "git branch -D old", "git branch -d old", "git push --force origin x", "git push -f origin x",
  "git push --force-with-lease origin x", "cd repo && git checkout master",
];
const ISOLATION_NEVER = [
  "git merge-base HEAD origin/master", "git branch --list", "git branch -a", "git branch --show-current", "git branch",
  "git checkout -- file.txt", "git rebase --abort", "git log --oneline -5", "git diff origin/master", "git status",
  "git fetch origin", "git rev-parse HEAD", "git commit -m \"merge and rebase and checkout notes\"", "git reset HEAD file.txt",
  "git push origin lane/x", "git worktree list", "git checkout",
];
for (const cmd of ISOLATION_ASKS) {
  test(`worktree isolation asks: ${cmd}`, () => {
    assert.equal(isolationAsk(cmd), true);
    assert.equal(tagIn("Bash", { command: cmd }, LOADED), "worktree-isolation");
    assert.equal(decideIn("Bash", { command: cmd }, LOADED), "ask");
  });
}
for (const cmd of ISOLATION_NEVER) {
  test(`worktree isolation never asks: ${cmd}`, () => {
    assert.equal(isolationAsk(cmd), false);
    assert.notEqual(tagIn("Bash", { command: cmd }, LOADED), "worktree-isolation");
  });
}
test("worktree isolation: the four read-only forms the evaluation named stay silent end to end", () => {
  for (const cmd of ["git merge-base HEAD origin/master", "git branch --list", "git branch --show-current", "git checkout -- file.txt"]) {
    assert.equal(decideIn("Bash", { command: cmd }, LOADED), "allow", cmd);
  }
});

// ── (d) no transcript -> ask ; (e) skill unresolvable -> allow with an audit-log line ──
test("no transcript on a governed edit, a bash write and an MCP write is an ASK, never a deny", () => {
  const none = (tool_name, tool_input) => evaluateGate({ tool_name, tool_input });
  const e = none("Edit", { file_path: `${ABS}/fsi-app/src/lib/trust.ts` });
  assert.equal(e.permissionDecision, "ask");
  assert.equal(e.tag, "edit-governed-notranscript");
  assert.equal(none("Bash", { command: "node x.mjs --apply" }).permissionDecision, "ask");
  assert.equal(none("mcp__x__create_thing", {}).permissionDecision, "ask");
});
const UNRESOLVABLE = join(TMP, "unresolvable.jsonl");
writeFileSync(UNRESOLVABLE,
  `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_u1","name":"Skill","input":{"skill":"environmental-policy-and-innovation"}}]}}\n` +
  `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_u1","is_error":true,"content":"Unknown skill: environmental-policy-and-innovation"}]}}\n`);
test("a skill the session cannot register (errored Skill call) is an ALLOW, with an audit-log line naming it", () => {
  const payload = JSON.stringify({ tool_name: "Edit", tool_input: GOVERNED_FILE, transcript_path: UNRESOLVABLE });
  const out = JSON.parse(runGate(payload)).hookSpecificOutput;
  assert.equal(out.permissionDecision, "allow");
  const log = readFileSync(AUDIT_LOG, "utf8").trim().split("\n");
  assert.ok(
    log.some((l) => /\tEdit\tallow\tedit-governed-skillunresolvable\tenvironmental-policy-and-innovation$/.test(l)),
    "the unresolvable allow must leave an audit-log line naming the skill",
  );
});
test("DISCIPLINE PRESERVED: a session that never tried the Skill tool still gets the deny", () => {
  assert.equal(decideIn("Edit", GOVERNED_FILE, EMPTY), "deny");
});

// ── in-process entry point (the scope shim imports runGate) ──
test("runGate: empty, unparseable and non-object payloads fail closed to ask; a normal payload returns hook JSON", () => {
  for (const raw of ["", "   ", "{not json", "42"]) {
    assert.equal(JSON.parse(runGate(raw)).hookSpecificOutput.permissionDecision, "ask", JSON.stringify(raw));
  }
  const ok = JSON.parse(runGate(JSON.stringify({ tool_name: "Read", tool_input: { file_path: "x" } })));
  assert.equal(ok.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(ok.hookSpecificOutput.permissionDecision, "allow");
});
