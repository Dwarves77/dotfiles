// FIRE-TEST for the action-time skill gate (pretooluse-skill-gate.mjs), wired into `node --test`
// (pre-push step 3 + CI). Asserts EFFICACY, not existence: feeds real PreToolUse payloads to the hook
// and checks the permissionDecision. Catches the two regressions that made the gate a silent no-op:
//   1. skill-map path matching failing on ABSOLUTE paths (the form the hook actually receives), and
//   2. the Windows `import(C:\...)` ERR_UNSUPPORTED_ESM_URL_SCHEME swallowed by the fail-soft catch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = resolve(dirname(fileURLToPath(import.meta.url)), "pretooluse-skill-gate.mjs");

function decide(payload) {
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: "utf8" });
  try { return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision; }
  catch { return `__UNPARSEABLE__(${(r.stdout || r.stderr || "").slice(0, 80)})`; }
}
function reasonOf(payload) {
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: "utf8" });
  try { return JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason || ""; } catch { return ""; }
}
const P = (o) => JSON.stringify(o);

// Synthetic ABSOLUTE checkout root — exercises the absolute-path suffix-match (a leading slash +
// multi-segment prefix, the shape the hook actually receives) WITHOUT a hardcoded user-home path
// (rule 012). The hook resolves governance purely from the repo-relative suffix, so any abs root works.
const ABS = "/sandbox/checkout";
const gov = (rel) => `${ABS}/${rel}`;

// [name, expected, payload]
const CASES = [
  // Edit/Write on GOVERNED files — must ask (absolute paths = the real hook input shape)
  ["Edit governed canonical-pipeline (abs)", "ask", P({ tool_name: "Edit", tool_input: { file_path: gov("fsi-app/src/lib/agent/canonical-pipeline.ts") } })],
  ["Edit governed trust.ts (abs)", "ask", P({ tool_name: "Edit", tool_input: { file_path: gov("fsi-app/src/lib/trust.ts") } })],
  ["Write new surface page.tsx", "ask", P({ tool_name: "Write", tool_input: { file_path: gov("fsi-app/src/app/newsurface/page.tsx") } })],
  ["Edit formats/ directory file", "ask", P({ tool_name: "Edit", tool_input: { file_path: gov("fsi-app/src/lib/agent/formats/prose-extractor.ts") } })],
  ["Edit migration file", "ask", P({ tool_name: "Edit", tool_input: { file_path: gov("fsi-app/supabase/migrations/140_x.sql") } })],
  ["MultiEdit governed trust.ts", "ask", P({ tool_name: "MultiEdit", tool_input: { file_path: gov("fsi-app/src/lib/trust.ts") } })],
  ["Edit governed via RELATIVE path", "ask", P({ tool_name: "Edit", tool_input: { file_path: "fsi-app/src/lib/agent/canonical-pipeline.ts" } })],
  // Ungoverned files — must allow
  ["Write ungoverned README", "allow", P({ tool_name: "Write", tool_input: { file_path: gov("fsi-app/README.md") } })],
  ["Edit ungoverned component", "allow", P({ tool_name: "Edit", tool_input: { file_path: gov("fsi-app/src/components/Badge.tsx") } })],
  // Bash — write/destructive must ask, read-only must allow
  ["Bash --apply data write", "ask", P({ tool_name: "Bash", tool_input: { command: "node scripts/regen-quarantined.mjs --apply" } })],
  ["Bash DELETE FROM", "ask", P({ tool_name: "Bash", tool_input: { command: "psql -c \"delete from intelligence_items\"" } })],
  ["Bash git push", "ask", P({ tool_name: "Bash", tool_input: { command: "git push origin master" } })],
  ["Bash read-only dry-run", "allow", P({ tool_name: "Bash", tool_input: { command: "node scripts/regen-quarantined.mjs" } })],
  // Other tools — allow
  ["Read tool", "allow", P({ tool_name: "Read", tool_input: { file_path: "x" } })],
  // Fail-closed backstops
  ["empty payload", "ask", ""],
  ["unparseable payload", "ask", "{not json"],
];

for (const [name, expect, payload] of CASES) {
  test(`decision: ${name} → ${expect}`, () => {
    assert.equal(decide(payload), expect, `${name}: expected ${expect}`);
  });
}

// EFFICACY: the Bash --apply reason must NAME the real per-op governing skill, proving the skill-map
// actually loaded (not just the hardcoded fallback string that masked the Windows import failure).
test("EFFICACY: Bash --apply names the real per-op skill (skill-map loaded, not fallback)", () => {
  const reason = reasonOf(P({ tool_name: "Bash", tool_input: { command: "node x.mjs --apply update intelligence_items set provenance_status" } }));
  assert.ok(reason.includes("environmental-policy-and-innovation"), `reason did not name the per-op skill: ${reason}`);
  assert.ok(!reason.includes("(data write)"), `reason fell back to the generic default (skill-map not loaded): ${reason}`);
});
