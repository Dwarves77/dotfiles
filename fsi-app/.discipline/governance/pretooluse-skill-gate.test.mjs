// FIRE-TEST for the action-time skill gate (pretooluse-skill-gate.mjs), wired into `node --test`
// (pre-push step 3 + CI). Asserts EFFICACY, not existence. Catches the regressions that made the gate
// a silent no-op (absolute-path match failure; Windows ESM import error) AND proves the operator rule:
// a governed write is BLOCKED unless the governing skill was deliberately LOADED this session.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
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
