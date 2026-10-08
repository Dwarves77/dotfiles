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
//
// WIRE-1 (2026-10-08): the repo OWNS the wrapper text and the matcher (wire-pretooluse-settings.mjs, the one
// applier, installed by `node fsi-app/.discipline/install-hooks.mjs`). In addition to the checks above this
// FAILS when the installed shim's bytes differ from the template rendered with the main checkout's entry path,
// when the gate entry's matcher is not the applier's MATCHER, when the hook command is not the canonical one,
// when an unknown tool name ("SomeNewTool") is not routed, or when the gate is wired DIRECTLY (unscoped).
// REQUIRED gains nothing: the negative matcher covers every tool by construction.

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname, join, isAbsolute } from "node:path";
import { isMainModule } from "../../scripts/lib/is-main.mjs";
import {
  MATCHER, SHIM_FILE_NAME, TEMPLATE_REL, ENTRY_REL, renderShim, canonicalCommand,
  mainCheckoutRoot, defaultSettingsPath, defaultUserHooksDir,
} from "./wire-pretooluse-settings.mjs";

const UNKNOWN_TOOL = "SomeNewTool";
// Every tool path that can mutate the system must route to the hook. Includes representative MCP write
// tools (which bypass Bash+git) so a matcher that omits mcp coverage FAILs this check.
const REQUIRED = [
  "Bash", "Edit", "Write", "MultiEdit", "NotebookEdit",
  "Agent", "Task", "Workflow", // dispatch tools — subagent calls are not hook-covered, so the dispatch is gated
  "mcp__github__push_files", "mcp__github__create_or_update_file", "mcp__github__merge_pull_request",
  // GATE-7 (2026-10-08, register attacks A-PT-R-*): the harness tools the matcher used to leave unrouted. Each
  // is classified by the gate (shell tools as Bash, worktree and dispatch tools asked, artifact tools by action).
  "PowerShell", "Monitor", "EnterWorktree", "ExitWorktree", "ArtifactData", "Artifact", "SendMessage",
];

// Mirror Claude Code matcher semantics: "*" or "" matches all; only [A-Za-z0-9_|] -> exact `|`-alternation;
// anything else -> JS regex.
export function matcherMatches(matcher, tool) {
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
// SOURCE half of the delegation proof, pure. Two shapes pass:
//   * SPAWN (the original shim): the source names the gate and spawns a child process.
//   * IMPORT (GATE-2, 2026-10-08, one node start instead of two): the source names the gate, imports it
//     (dynamic import()), calls its runGate, and AWAITS that call at the in-scope call site
//     (`if (inScope) await <fn>(...)`). The await is load-bearing: without it the shim's trailing allow()
//     runs first and the gate is bypassed, so an importing wrapper whose in-scope call is not awaited FAILS.
//   * ENTRY (WIRE-1, 2026-10-08): the installed shim names the repo's pretooluse-entry.mjs, imports it,
//     AWAITS its runEntry() and holds the fail-closed `ask` for an entry that cannot load. The entry's own
//     source is then proven by the same function (it names the gate, imports it, awaits runGate at the
//     in-scope call site; `if (inScope) return await ...` counts, the return ends the call before any allow).
export function wrapperSourceDelegates(src) {
  const text = String(src ?? "");
  if (/pretooluse-entry\.mjs/.test(text)) {
    if (!/\bimport\s*\(/.test(text)) return { ok: false, why: "entry shim does not import the repo entry" };
    if (!/\bawait\s+[\w.]+\.runEntry\s*\(/.test(text)) return { ok: false, why: "entry shim does not await entry.runEntry(): the output would be written before the gate answered" };
    if (!/["']ask["']/.test(text)) return { ok: false, why: "entry shim has no fail-closed ask for an entry that cannot be loaded" };
    return { ok: true, why: "imports the repo entry, awaits runEntry and fails closed" };
  }
  if (!/pretooluse-skill-gate\.mjs/.test(text)) return { ok: false, why: "wrapper does not reference pretooluse-skill-gate.mjs (stopped wrapping?)" };
  if (/\bspawn(Sync)?\s*\(/.test(text)) return { ok: true, why: "spawns the gate" };
  const imports = /\bimport\s*\(/.test(text);
  const callsRunGate = /\.runGate\s*\(|\{\s*runGate\b/.test(text);
  if (!imports || !callsRunGate) return { ok: false, why: "wrapper neither spawns a child process nor imports the gate and calls its runGate (no delegation call)" };
  if (!/\bif\s*\(\s*inScope\s*\)\s*(?:return\s+)?await\s+[\w.]+\s*\(/.test(text)) {
    return { ok: false, why: "wrapper imports the gate but does not await it at the in-scope call site (if (inScope) await ...): the trailing allow() would run first and bypass the gate" };
  }
  return { ok: true, why: "imports the gate and awaits runGate at the in-scope call site" };
}

function verifyWrapperDelegates(command) {
  const wrapperPath = quotedMjsPath(command, /pretooluse-fsi-app-scope\.mjs$/i);
  if (!wrapperPath) return { ok: false, why: "wrapper path not found in the hook command" };
  if (!existsSync(wrapperPath)) return { ok: false, why: `wrapper file missing: ${wrapperPath}` };
  let src = "";
  try { src = readFileSync(wrapperPath, "utf8"); } catch (e) { return { ok: false, why: `wrapper unreadable: ${e.message}` }; }
  const srcProof = wrapperSourceDelegates(src);
  if (!srcProof.ok) return srcProof;
  // Where the gate is named: in the wrapper itself (the original shapes), or, for the entry shape (WIRE-1), in
  // the repo entry the wrapper imports; the entry names the gate relative to its own directory.
  const gateRe = /["'`]([^"'`]*pretooluse-skill-gate\.mjs)["'`]/;
  let gateRef;
  let base = "";
  const entryRef = src.match(/["'`]([^"'`]*pretooluse-entry\.mjs)["'`]/);
  if (entryRef) {
    const entryPath = entryRef[1];
    if (!existsSync(entryPath)) return { ok: false, why: `delegated entry file missing: ${entryPath}` };
    let entrySrc = "";
    try { entrySrc = readFileSync(entryPath, "utf8"); } catch (e) { return { ok: false, why: `entry unreadable: ${e.message}` }; }
    const entryProof = wrapperSourceDelegates(entrySrc);
    if (!entryProof.ok) return { ok: false, why: `entry: ${entryProof.why}` };
    gateRef = entrySrc.match(gateRe);
    base = dirname(entryPath);
  } else {
    gateRef = src.match(gateRe);
  }
  if (!gateRef) return { ok: false, why: "wrapper does not reference pretooluse-skill-gate.mjs (stopped wrapping?)" };
  const gatePath = isAbsolute(gateRef[1]) ? gateRef[1] : resolve(base, gateRef[1]);
  if (!existsSync(gatePath)) return { ok: false, why: `delegated gate file missing: ${gatePath}` };
  // behavioral fire: derive an in-scope cwd at RUNTIME from the gate's own path (.../fsi-app/...), never a
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
    return { ok: false, why: `behavioral fire did NOT gate an in-scope git-branch op (permissionDecision=${decision || "<none>"}), wrapper is not delegating` };
  }
  return { ok: true, why: `verified delegating to ${gatePath} (source + behavioral fire: "${decision}")` };
}

/**
 * WIRE-1: the installed shim must equal the repo template rendered with the main checkout's entry path, byte for
 * byte. A hand edit, a stale copy from an older template, or a different entry path all fail.
 * @param {{ shimPath: string, mainRoot: string }} o @returns {{ ok: boolean, why: string }}
 */
export function checkInstalledShim({ shimPath, mainRoot }) {
  const templatePath = join(mainRoot, TEMPLATE_REL);
  const entryPath = join(mainRoot, ENTRY_REL);
  if (!existsSync(templatePath)) return { ok: false, why: `cannot render the expected shim: no template at ${templatePath} in the main checkout (merge and pull first)` };
  if (!existsSync(shimPath)) return { ok: false, why: `installed shim missing: ${shimPath}` };
  const expected = Buffer.from(renderShim(readFileSync(templatePath, "utf8"), entryPath), "utf8");
  if (!readFileSync(shimPath).equals(expected)) return { ok: false, why: "installed shim differs from the rendered template (bytes); the repo owns its text" };
  return { ok: true, why: "installed shim equals the rendered template" };
}

/**
 * The whole wiring verdict, pure apart from reading the files it is pointed at (and one spawned fire of the
 * installed shim). Never returns settings.json content.
 * @param {{ settingsPath?: string, userHooksDir?: string, mainRoot?: string }} [o]
 * @returns {{ status: 'skip'|'pass'|'fail', problems: string[], notes: string[] }}
 */
export function verifyWiring({ settingsPath = defaultSettingsPath(), userHooksDir = defaultUserHooksDir(), mainRoot } = {}) {
  const problems = [];
  const notes = [];
  if (!existsSync(settingsPath)) {
    return { status: "skip", problems, notes: [`${settingsPath} not present (CI/headless). Correctness covered by the fire-test.`] };
  }
  let s;
  try { s = JSON.parse(readFileSync(settingsPath, "utf8")); }
  catch (e) { return { status: "fail", problems: [`could not parse settings.json: ${e.message}`], notes }; }

  const pre = (s.hooks && Array.isArray(s.hooks.PreToolUse)) ? s.hooks.PreToolUse : [];
  const shimPath = join(userHooksDir, SHIM_FILE_NAME).replaceAll("\\", "/");
  // A tool is "covered" if some PreToolUse entry that routes to the gate (directly, or via a VERIFIED scope
  // wrapper) has a matcher matching it.
  const covered = new Set();
  let shimChecked = false;
  for (const e of pre) {
    const hooks = e.hooks || [];
    const direct = hooks.some((h) => (h.command || "").includes("pretooluse-skill-gate"));
    const wrap = hooks.find((h) => (h.command || "").includes("pretooluse-fsi-app-scope"));
    if (!direct && !wrap) continue;
    let routes = false;
    if (direct) {
      routes = true;
      problems.push("the gate is wired DIRECTLY (unscoped, so it also gates other projects); the installer replaces it with the scoped shim");
    } else {
      const v = verifyWrapperDelegates(wrap.command);
      if (v.ok) { routes = true; notes.push(`via scoped wrapper, ${v.why}`); }
      else problems.push(`scope wrapper present but NOT accepted, ${v.why}`);
      if (wrap.command !== canonicalCommand(shimPath)) problems.push("hook command differs from the canonical command (the installed shim path and the fail-closed backstop)");
      if (!shimChecked) {
        shimChecked = true;
        let root = mainRoot;
        try { root = root ?? mainCheckoutRoot(); } catch (err) { problems.push(`cannot find the main checkout to render the expected shim: ${err.message}`); }
        if (root) {
          const c = checkInstalledShim({ shimPath, mainRoot: root });
          if (!c.ok) problems.push(c.why.startsWith("installed shim differs") ? c.why : `installed shim: ${c.why}`);
        }
      }
    }
    if (e.matcher !== MATCHER) problems.push("matcher is not the canonical MATCHER of wire-pretooluse-settings.mjs");
    if (!matcherMatches(e.matcher, UNKNOWN_TOOL)) problems.push(`an unknown tool name (${UNKNOWN_TOOL}) is not routed by the matcher: a closed list leaves new tools unrouted`);
    if (!routes) continue;
    for (const t of REQUIRED) if (matcherMatches(e.matcher, t)) covered.add(t);
  }

  const missing = REQUIRED.filter((t) => !covered.has(t));
  if (missing.length) problems.push(`settings.json PreToolUse does not route these tools to the hook: ${missing.join(", ")}`);
  return { status: problems.length ? "fail" : "pass", problems, notes };
}

if (isMainModule(import.meta.url)) {
  const v = verifyWiring();
  if (v.status === "skip") {
    console.log(`skill-gate wiring: SKIP, ${v.notes[0]}`);
    process.exit(0);
  }
  if (v.status === "fail") {
    for (const p of v.problems) console.error(`skill-gate wiring: FAIL, ${p}`);
    console.error("  Fix: node fsi-app/.discipline/install-hooks.mjs (the one install command; it owns the shim, the matcher and the hook entry).");
    process.exit(1);
  }
  console.log(`skill-gate wiring: PASS, all required tools routed to the hook${v.notes.length ? " (" + v.notes.join("; ") + ")" : ""}.`);
}
