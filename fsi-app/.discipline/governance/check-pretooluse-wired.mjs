#!/usr/bin/env node
// OUT-OF-REPO BOUNDARY CHECK (see memory [[out-of-repo-boundary]]).
// Proves the action-time skill gate is ACTUALLY WIRED — not asserted. The hook + skill-map + fire-test
// are in-repo and CI-verified for correctness; but the gate only FIRES if ~/.claude/settings.json
// registers it as a PreToolUse hook for every tool type that can mutate the system. settings.json is
// outside the repo, so this check runs in pre-push (on the operator's machine) where that file exists.
//
// WIRING SHAPES ACCEPTED (2026-07-26): the gate may be wired DIRECTLY (a PreToolUse hook command that
// references pretooluse-skill-gate) OR via the fsi-app SCOPE WRAPPER pretooluse-fsi-app-scope.mjs — the
// operator's 2026-07-26 scoping decision, which stops the gate from blocking unrelated repos (Pet Pursuit
// etc.) while still delegating to the real gate for fsi-app-scoped tool calls. The wrapper is accepted ONLY
// after VERIFYING it genuinely delegates — a source-delegation check PLUS a behavioral fire — NEVER on the
// filename alone. A name-only acceptance would pass a wrapper that silently stopped wrapping, which is the
// vacuous-verification class (case-file: enforcement tooling must be updated in the SAME change as the
// decision it enforces — the scoping decision left this checker stale, so `--apply` would have re-added the
// unscoped direct hook and re-broken the other repos the scoping fixed).
//
// Contract:
//   * settings.json ABSENT (CI / headless / fresh clone)  -> SKIP (exit 0 with a note).
//   * settings.json PRESENT but the hook is not wired (directly or via a VERIFIED wrapper) for ALL
//     required tools -> FAIL (exit 1).
//   * settings.json PRESENT and fully wired                 -> PASS (exit 0).
// Never prints settings.json contents (it holds plaintext credentials).

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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

// Pull the first "..."-quoted .mjs path from a hook command that matches needleRe.
function quotedMjsPath(command, needleRe) {
  for (const q of String(command || "").match(/"([^"]+\.mjs)"/g) || []) {
    const p = q.slice(1, -1);
    if (needleRe.test(p)) return p;
  }
  return null;
}

// Accept the scope wrapper ONLY if it verifiably delegates to the real gate. Two independent proofs:
//   (1) SOURCE-delegation — the wrapper names pretooluse-skill-gate.mjs as its gate AND actually spawns a
//       child, and that gate file exists on disk. Catches a wrapper whose delegation was deleted/renamed.
//   (2) BEHAVIORAL fire — feed the wrapper an in-scope git-BRANCH Bash op (transcript omitted so no skill can
//       appear loaded); the real gate's worktree-isolation belt returns "ask" for that op UNCONDITIONALLY
//       (skill-map- and skill-state-independent), so a wrapper that stopped delegating would "allow" instead.
//       The gate only INSPECTS the command text; it never executes it, so no branch is created.
function verifyWrapperDelegates(command) {
  const wrapperPath = quotedMjsPath(command, /pretooluse-fsi-app-scope\.mjs$/i);
  if (!wrapperPath) return { ok: false, why: "wrapper path not found in the hook command" };
  if (!existsSync(wrapperPath)) return { ok: false, why: `wrapper file missing: ${wrapperPath}` };
  let src = "";
  try { src = readFileSync(wrapperPath, "utf8"); } catch (e) { return { ok: false, why: `wrapper unreadable: ${e.message}` }; }
  const gateRef = src.match(/["'`]([^"'`]*pretooluse-skill-gate\.mjs)["'`]/);
  if (!gateRef) return { ok: false, why: "wrapper does not reference pretooluse-skill-gate.mjs (stopped wrapping?)" };
  if (!/\bspawn(Sync)?\s*\(/.test(src)) return { ok: false, why: "wrapper never spawns a child process (no delegation call)" };
  const gatePath = gateRef[1];
  if (!existsSync(gatePath)) return { ok: false, why: `delegated gate file missing: ${gatePath}` };
  // behavioral fire — derive an in-scope cwd at RUNTIME from the gate's own path (…/fsi-app/…), never a
  // hardcoded home path, so the wrapper's fsi-app scope check matches and it delegates.
  const fsiCwd = gatePath.replace(/([\\/]fsi-app)(?![\w-]).*$/i, "$1");
  const payload = JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "git checkout -b skill-gate-wiring-probe" },
    cwd: fsiCwd,
    transcript_path: "",
  });
  const r = spawnSync("node", [wrapperPath], { input: payload, encoding: "utf8" });
  let decision = "";
  try { decision = (JSON.parse(r.stdout || "{}").hookSpecificOutput || {}).permissionDecision || ""; } catch { /* leave blank -> fail */ }
  if (decision !== "ask" && decision !== "deny") {
    return { ok: false, why: `behavioral fire did NOT gate an in-scope git-branch op (permissionDecision=${decision || "<none>"}) — wrapper is not delegating` };
  }
  return { ok: true, why: `verified delegating to ${gatePath} (source + behavioral fire: "${decision}")` };
}

if (!existsSync(SETTINGS)) {
  console.log(`skill-gate wiring: SKIP — ${SETTINGS} not present (CI/headless). Correctness covered by the fire-test.`);
  process.exit(0);
}

let s;
try { s = JSON.parse(readFileSync(SETTINGS, "utf8")); }
catch (e) { console.error(`skill-gate wiring: FAIL — could not parse settings.json: ${e.message}`); process.exit(1); }

const pre = (s.hooks && Array.isArray(s.hooks.PreToolUse)) ? s.hooks.PreToolUse : [];
// A tool is "covered" if some PreToolUse entry that routes to the gate (directly, or via a VERIFIED scope
// wrapper) has a matcher matching it.
const covered = new Set();
let wrapperNote = "";
for (const e of pre) {
  const hooks = e.hooks || [];
  let pointsAtHook = hooks.some((h) => (h.command || "").includes("pretooluse-skill-gate"));
  if (!pointsAtHook) {
    const wrap = hooks.find((h) => (h.command || "").includes("pretooluse-fsi-app-scope"));
    if (wrap) {
      const v = verifyWrapperDelegates(wrap.command);
      if (v.ok) { pointsAtHook = true; wrapperNote = `via scoped wrapper — ${v.why}`; }
      else console.error(`skill-gate wiring: scope wrapper present but NOT accepted — ${v.why}`);
    }
  }
  if (!pointsAtHook) continue;
  for (const t of REQUIRED) if (matcherMatches(e.matcher, t)) covered.add(t);
}

const missing = REQUIRED.filter((t) => !covered.has(t));
if (missing.length) {
  console.error(`skill-gate wiring: FAIL — settings.json PreToolUse does not route these tools to the hook: ${missing.join(", ")}`);
  console.error(`  Fix: wire the gate directly, or via the scope wrapper pretooluse-fsi-app-scope.mjs (which must verifiably delegate).`);
  console.error(`  Direct-wire helper: node ${resolve(import.meta.dirname || ".", "wire-pretooluse-settings.mjs")} --apply`);
  process.exit(1);
}
console.log(`skill-gate wiring: PASS — all required tools routed to the hook${wrapperNote ? " (" + wrapperNote + ")" : ""}.`);
