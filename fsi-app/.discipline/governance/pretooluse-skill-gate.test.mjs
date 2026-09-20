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

const HOOK = resolve(dirname(fileURLToPath(import.meta.url)), "pretooluse-skill-gate.mjs");

// Fake session transcripts: one WITH explicit (RESOLVED) Skill invocations, one WITHOUT.
// Each invocation is a tool_use + a non-errored tool_result for it — the matcher (skill-token.mjs)
// requires the invocation to have RESOLVED successfully (G-12 fix), not merely to appear.
const TMP = mkdtempSync(join(tmpdir(), "skillgate-"));
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
  ["MCP push_files, NO skill loaded → deny", "deny", P("mcp__github__push_files", { files: [] }, EMPTY)],
  ["Edit governed, NO transcript path → deny (fail closed)", "deny", JSON.stringify({ tool_name: "Edit", tool_input: { file_path: `${ABS}/fsi-app/src/lib/trust.ts` } })],
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

test("sub-agent payload whose derived transcript file does not exist -> deny, fail-closed no-transcript tag", () => {
  const payload = PA("Edit", GOVERNED_FILE, PARENT_NO_SKILL, "sub-does-not-exist");
  assert.equal(decide(payload), "deny");
  assert.ok(reasonOf(payload).includes("no session transcript"), reasonOf(payload));
});

test("main-session payload (no agent_id field at all) is unchanged: parent transcript with skill -> allow", () => {
  assert.equal(decide(P("Edit", GOVERNED_FILE, LOADED)), "allow");
});
test("main-session payload (no agent_id field at all) is unchanged: parent transcript without skill -> deny", () => {
  assert.equal(decide(P("Edit", GOVERNED_FILE, EMPTY)), "deny");
});
