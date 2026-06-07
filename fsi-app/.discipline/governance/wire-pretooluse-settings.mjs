#!/usr/bin/env node
// OUT-OF-REPO BOUNDARY APPLIER (see memory [[out-of-repo-boundary]]).
// The action-time skill gate (pretooluse-skill-gate.mjs) lives IN this repo, but it only fires if
// ~/.claude/settings.json registers it as a PreToolUse hook. settings.json is OUTSIDE the repo, so
// CI/pre-push cannot enforce it — this script is the in-repo, auditable, idempotent tool that applies
// the wiring, and check-pretooluse-wired.mjs verifies it.
//
// What it does: ensures ONE PreToolUse entry whose matcher covers ALL tool types that can mutate the
// system (Bash + Edit/Write/MultiEdit/NotebookEdit), pointing at the in-repo hook. It REUSES the
// existing hook command verbatim if one is already wired (preserves the fail-closed fallback), else
// constructs the canonical command. Every other settings.json key (permissions, secrets, theme, …) is
// passed through untouched. A timestamped backup is written first. Prints a summary ONLY — never the
// file contents (settings.json holds plaintext credentials; this script must not echo them).
//
// Usage: node wire-pretooluse-settings.mjs [--apply]   (dry-run by default)

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SETTINGS = resolve(homedir(), ".claude", "settings.json");
const HOOK = resolve(dirname(fileURLToPath(import.meta.url)), "pretooluse-skill-gate.mjs");
const MATCHER = "Bash|Edit|Write|MultiEdit|NotebookEdit";
const APPLY = process.argv.includes("--apply");

// Canonical command: run the in-repo hook; if node itself fails to launch, fail CLOSED to `ask`.
const FALLBACK = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: "skill-gate backstop: hook process failed to launch — failing closed.",
  },
});
const canonicalCommand = `node "${pathToFileURL(HOOK).pathname.replace(/^\//, "")}" || printf %s '${FALLBACK}'`;
// NB: keep Windows path in a node-friendly form; node accepts forward-slashed C:/... paths.
const cmdWin = `node "${HOOK.replaceAll("\\", "/")}" || printf %s '${FALLBACK}'`;

const s = JSON.parse(readFileSync(SETTINGS, "utf8"));
s.hooks = s.hooks || {};
const pre = Array.isArray(s.hooks.PreToolUse) ? s.hooks.PreToolUse : [];

// Find an existing entry already pointing at the skill-gate hook; reuse its command verbatim.
let existingCmd = null;
for (const e of pre) for (const h of (e.hooks || [])) {
  if ((h.command || "").includes("pretooluse-skill-gate")) existingCmd = h.command;
}
const command = existingCmd || cmdWin;

// Rebuild PreToolUse: keep every entry that does NOT reference the skill-gate, then add ONE combined
// entry covering all five tools. This removes any stale Bash-only skill-gate entry (no double-fire).
const kept = pre.filter((e) => !(e.hooks || []).some((h) => (h.command || "").includes("pretooluse-skill-gate")));
const combined = { matcher: MATCHER, hooks: [{ type: "command", command }] };
const next = [...kept, combined];

console.log("settings.json :", SETTINGS);
console.log("hook          :", HOOK);
console.log("matcher       :", MATCHER);
console.log("reused command:", existingCmd ? "yes (preserved existing fail-closed fallback)" : "no (constructed canonical)");
console.log("kept non-gate PreToolUse entries:", kept.length);
console.log("\nResulting PreToolUse matchers:");
for (const e of next) console.log("  -", JSON.stringify(e.matcher), e.hooks.some((h)=> (h.command||"").includes("pretooluse-skill-gate")) ? "[->skill-gate]" : "[other]");

if (!APPLY) { console.log("\nDRY-RUN — pass --apply to write (a timestamped backup is made first)."); process.exit(0); }

const stamp = new Date().toISOString().replaceAll(":", "").replaceAll("-", "").slice(0, 15);
const bak = `${SETTINGS}.bak-${stamp}`;
copyFileSync(SETTINGS, bak);
s.hooks.PreToolUse = next;
writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + "\n", "utf8");
console.log(`\nWROTE settings.json (backup: ${bak}). All other keys preserved untouched.`);
