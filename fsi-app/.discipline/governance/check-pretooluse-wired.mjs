#!/usr/bin/env node
// OUT-OF-REPO BOUNDARY CHECK (see memory [[out-of-repo-boundary]]).
// Proves the action-time skill gate is ACTUALLY WIRED — not asserted. The hook + skill-map + fire-test
// are in-repo and CI-verified for correctness; but the gate only FIRES if ~/.claude/settings.json
// registers it as a PreToolUse hook for every tool type that can mutate the system. settings.json is
// outside the repo, so this check runs in pre-push (on the operator's machine) where that file exists.
//
// Contract:
//   * settings.json ABSENT (CI / headless / fresh clone)  -> SKIP (exit 0 with a note). CI cannot
//     enforce a file it does not have; correctness is covered by pretooluse-skill-gate.test.mjs.
//   * settings.json PRESENT but the hook is not wired for ALL required tools -> FAIL (exit 1).
//   * settings.json PRESENT and fully wired                 -> PASS (exit 0).
// Never prints settings.json contents (it holds plaintext credentials).

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const SETTINGS = resolve(homedir(), ".claude", "settings.json");
// Every tool path that can mutate the system must route to the hook. Includes representative MCP write
// tools (which bypass Bash+git) so a matcher that omits mcp coverage FAILs this check.
const REQUIRED = [
  "Bash", "Edit", "Write", "MultiEdit", "NotebookEdit",
  "Agent", "Task", "Workflow", // dispatch tools — subagent calls are not hook-covered, so the dispatch is gated
  "mcp__github__push_files", "mcp__github__create_or_update_file", "mcp__github__merge_pull_request",
];

// Mirror Claude Code matcher semantics: "*" or "" matches all; only [A-Za-z0-9_|] -> exact `|`-alternation;
// anything else -> JS regex.
function matcherMatches(matcher, tool) {
  const m = String(matcher || "");
  if (m === "" || m === "*") return true;
  if (/^[A-Za-z0-9_|]+$/.test(m)) return m.split("|").map((s) => s.trim()).includes(tool);
  try { return new RegExp(m).test(tool); } catch { return false; }
}

if (!existsSync(SETTINGS)) {
  console.log(`skill-gate wiring: SKIP — ${SETTINGS} not present (CI/headless). Correctness covered by the fire-test.`);
  process.exit(0);
}

let s;
try { s = JSON.parse(readFileSync(SETTINGS, "utf8")); }
catch (e) { console.error(`skill-gate wiring: FAIL — could not parse settings.json: ${e.message}`); process.exit(1); }

const pre = (s.hooks && Array.isArray(s.hooks.PreToolUse)) ? s.hooks.PreToolUse : [];
// A tool is "covered" if some PreToolUse entry that points at the hook has a matcher matching it.
const covered = new Set();
for (const e of pre) {
  const pointsAtHook = (e.hooks || []).some((h) => (h.command || "").includes("pretooluse-skill-gate"));
  if (!pointsAtHook) continue;
  for (const t of REQUIRED) if (matcherMatches(e.matcher, t)) covered.add(t);
}

const missing = REQUIRED.filter((t) => !covered.has(t));
if (missing.length) {
  console.error(`skill-gate wiring: FAIL — settings.json PreToolUse does not route these tools to the hook: ${missing.join(", ")}`);
  console.error(`  Fix: node ${resolve(import.meta.dirname || ".", "wire-pretooluse-settings.mjs")} --apply`);
  process.exit(1);
}
console.log(`skill-gate wiring: PASS — all required tools routed to the hook (${REQUIRED.join(", ")}).`);
