#!/usr/bin/env node
// Caro's Ledge PreToolUse shim: the TEMPLATE for ~/.claude/hooks/pretooluse-fsi-app-scope.mjs (lane WIRE-1,
// 2026-10-08). A permanent delegator with NO decision logic. Everything that reads the payload, decides scope
// and calls the skill gate lives in pretooluse-entry.mjs in the repo, where it is versioned and tested, so a
// change to the gate is never a hand step in the user home.
//
// The placeholder below is replaced at INSTALL time by wire-pretooluse-settings.mjs (run through
// `node fsi-app/.discipline/install-hooks.mjs`) with the absolute path of the main checkout's entry file. The
// installed copy must equal the rendered template byte for byte; check-pretooluse-wired.mjs fails the push on
// any difference. If the entry cannot be loaded or throws, this prints the fail-closed `ask`: a broken
// install can never silently allow.

import { pathToFileURL } from "node:url";

const ENTRY = "__PRETOOLUSE_ENTRY_PATH__";
const FAIL_CLOSED = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: "skill-gate: the repo entry could not be loaded, failing closed.",
  },
});

let out = "";
try {
  const entry = await import(pathToFileURL(ENTRY).href);
  out = await entry.runEntry();
} catch { /* fall through: fail closed */ }
process.stdout.write(out || FAIL_CLOSED);
process.exit(0);
