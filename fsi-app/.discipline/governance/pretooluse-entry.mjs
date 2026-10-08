// The PreToolUse entry the user-level shim delegates to (lane WIRE-1, 2026-10-08). It holds what the shim used
// to hold: read the payload, decide scope, call the skill gate, allow what is out of scope. Versioned and
// tested here; the shim installed under the user home only imports this file by the absolute path the
// installer wrote (see pretooluse-user-shim.mjs and wire-pretooluse-settings.mjs).
//
// Scope is decided by pretooluse-scope.mjs: a call that touches the fsi-app project or one of its worktrees
// goes to the gate; any other project on the machine is allowed so it is never blocked by fsi-app
// governance. Fails TOWARD the gate, never away from it: a payload that cannot be read or parsed, or a scope
// module that cannot be loaded or throws, hands the call to the gate. A routed tool the gate does not
// classify as mutating (the matcher routes every tool name except a closed read-only list) is allowed by the
// gate itself, so a tool that does not exist yet is classified here, never silently unrouted.
//
// The gate and the scope are loaded lazily: an out-of-scope call never pays for the gate's import.

import { readFileSync } from "node:fs";

const ALLOW = JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } });

async function gate(raw) {
  const { runGate } = await import("./pretooluse-skill-gate.mjs");
  return runGate(raw);
}

/** The stdout JSON for one raw stdin payload. Never allows a call it could not read. @param {string} raw */
export async function decide(raw) {
  let payload;
  try { payload = JSON.parse(raw); } catch { return await gate(raw); }
  if (payload === null || typeof payload !== "object") return await gate(raw);
  let inScope = true;
  try { inScope = (await import("./pretooluse-scope.mjs")).inScope(payload); } catch { /* keep true: fail toward the gate */ }
  if (inScope) return await gate(raw);
  return ALLOW;
}

/** Read stdin and decide; the shim writes the result. A stdin that cannot be read goes to the gate (ask). */
export async function runEntry() {
  let raw = "";
  try { raw = readFileSync(0, "utf8"); } catch { return await gate(""); }
  return await decide(raw);
}
