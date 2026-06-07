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
const REQUIRED = ["Bash", "Edit", "Write", "MultiEdit", "NotebookEdit"];

if (!existsSync(SETTINGS)) {
  console.log(`skill-gate wiring: SKIP — ${SETTINGS} not present (CI/headless). Correctness covered by the fire-test.`);
  process.exit(0);
}

let s;
try { s = JSON.parse(readFileSync(SETTINGS, "utf8")); }
catch (e) { console.error(`skill-gate wiring: FAIL — could not parse settings.json: ${e.message}`); process.exit(1); }

const pre = (s.hooks && Array.isArray(s.hooks.PreToolUse)) ? s.hooks.PreToolUse : [];
// A tool is "covered" if some PreToolUse entry whose matcher includes that tool name points at the hook.
const covered = new Set();
for (const e of pre) {
  const matcher = String(e.matcher || "");
  const tools = matcher.split("|").map((t) => t.trim());
  const pointsAtHook = (e.hooks || []).some((h) => (h.command || "").includes("pretooluse-skill-gate"));
  if (pointsAtHook) for (const t of tools) covered.add(t);
}

const missing = REQUIRED.filter((t) => !covered.has(t));
if (missing.length) {
  console.error(`skill-gate wiring: FAIL — settings.json PreToolUse does not route these tools to the hook: ${missing.join(", ")}`);
  console.error(`  Fix: node ${resolve(import.meta.dirname || ".", "wire-pretooluse-settings.mjs")} --apply`);
  process.exit(1);
}
console.log(`skill-gate wiring: PASS — all required tools routed to the hook (${REQUIRED.join(", ")}).`);
