#!/usr/bin/env node
// OUT-OF-REPO BOUNDARY APPLIER (see OUT-OF-REPO-BOUNDARY.md).
// The action-time skill gate (pretooluse-skill-gate.mjs) lives IN this repo, but it only fires if
// ~/.claude/settings.json registers a PreToolUse hook for it. settings.json is OUTSIDE the repo, so CI cannot
// enforce it. WIRE-1 (2026-10-08, operator: "Nothing is on me. Find and fix the issue. Not a work around. A
// fix.") makes the repo OWN everything that file and the user hooks directory must contain for the gate:
//
//   * the wrapper text: pretooluse-user-shim.mjs is a permanent delegator (no decision logic). It is rendered
//     with the main checkout's absolute path to pretooluse-entry.mjs (the placeholder is replaced at install
//     time) and written to ~/.claude/hooks/pretooluse-fsi-app-scope.mjs, the same file name settings.json
//     already points at, so nothing else in settings.json changes;
//   * the matcher: a NEGATIVE form that routes every tool name except a closed list of read-only tools, so a
//     tool that does not exist yet is classified by the entry, never silently unrouted;
//   * the one PreToolUse entry that runs the shim, with the fail-closed `|| printf` backstop.
//
// check-pretooluse-wired.mjs fails on any drift from this module's output. The one install command is
// `node fsi-app/.discipline/install-hooks.mjs`, which calls applyWiring with --apply semantics.
//
// What applyWiring does: edits ONLY the gate's PreToolUse entry (a legacy DIRECT unscoped gate hook is migrated
// to it), passes every other settings.json key and entry through, writes a timestamped backup first, installs
// the shim (backup when the installed file differs), prints a summary ONLY, never file contents (settings.json
// holds plaintext credentials). Idempotent: a second run writes nothing.
//
// Usage: node wire-pretooluse-settings.mjs [--apply] [--settings=<path>] [--user-hooks-dir=<dir>]
//        (dry-run by default; the two path flags exist for fixtures)

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve, dirname, join, basename } from "node:path";
import { isMainModule } from "../../scripts/lib/is-main.mjs";

export const SHIM_FILE_NAME = "pretooluse-fsi-app-scope.mjs";
export const ENTRY_PLACEHOLDER = "__PRETOOLUSE_ENTRY_PATH__";
export const TEMPLATE_REL = "fsi-app/.discipline/governance/pretooluse-user-shim.mjs";
export const ENTRY_REL = "fsi-app/.discipline/governance/pretooluse-entry.mjs";

// The closed list of tools that cannot change state. Everything else is routed to the entry.
export const READ_ONLY_TOOLS = [
  "Read", "Glob", "Grep", "LS", "WebFetch", "WebSearch", "ToolSearch", "ListAgents", "ReadNotifications",
  "ListSkills", "AskUserQuestion", "TodoWrite", "Skill",
];
// Anchored JS regex (Claude Code treats a matcher with anything beyond [A-Za-z0-9_|] as a regex): matches any
// non-empty tool name that is not exactly one of READ_ONLY_TOOLS. check-pretooluse-wired.mjs mirrors the
// semantics in matcherMatches and compares the installed matcher to this constant.
export const MATCHER = `^(?!(?:${READ_ONLY_TOOLS.join("|")})$).+$`;

const FALLBACK = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: "skill-gate backstop: hook process failed to launch, failing closed.",
  },
});

/** The one hook command: run the installed shim; if node itself fails to launch, fail CLOSED to `ask`.
 *  @param {string} shimPath @returns {string} */
export function canonicalCommand(shimPath) {
  return `node "${String(shimPath).replaceAll("\\", "/")}" || printf %s '${FALLBACK}'`;
}

/** The shim text for one installation: the repo template with the entry path substituted (forward slashes,
 *  LF line endings, so a CRLF checkout renders the same bytes). @param {string} template @param {string} entryPath */
export function renderShim(template, entryPath) {
  const text = String(template).replaceAll("\r\n", "\n");
  if (!text.includes(ENTRY_PLACEHOLDER)) throw new Error(`shim template has no ${ENTRY_PLACEHOLDER} placeholder`);
  return text.replaceAll(ENTRY_PLACEHOLDER, String(entryPath).replaceAll("\\", "/"));
}

const isGateHook = (h) => /pretooluse-fsi-app-scope|pretooluse-skill-gate/.test(String(h?.command ?? ""));

/**
 * Pure: the settings object with the gate's PreToolUse entry set to the canonical one. Every other key and
 * entry is passed through; a gate hook sharing an entry with another hook is split out, the other hook keeps
 * its entry and matcher. @param {object} settings @param {string} shimPath
 * @returns {{ settings: object, changed: boolean }}
 */
export function wireSettings(settings, shimPath) {
  const hooks = settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {};
  const pre = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  const command = canonicalCommand(shimPath);
  const firstGateHook = pre.flatMap((e) => e.hooks || []).find(isGateHook);
  const gateHook = { ...(firstGateHook || {}), type: "command", command };
  const gateEntryAt = pre.findIndex((e) => (e.hooks || []).some(isGateHook));
  const next = [];
  pre.forEach((e, i) => {
    const hasGate = (e.hooks || []).some(isGateHook);
    if (!hasGate) { next.push(e); return; }
    const others = (e.hooks || []).filter((h) => !isGateHook(h));
    if (i === gateEntryAt) {
      if (others.length === 0) next.push({ ...e, matcher: MATCHER, hooks: [gateHook] });
      else { next.push({ ...e, hooks: others }); next.push({ matcher: MATCHER, hooks: [gateHook] }); }
    } else if (others.length) next.push({ ...e, hooks: others });
  });
  if (gateEntryAt === -1) next.push({ matcher: MATCHER, hooks: [gateHook] });
  const changed = JSON.stringify(pre) !== JSON.stringify(next);
  return { settings: { ...settings, hooks: { ...hooks, PreToolUse: next } }, changed };
}

/** The main checkout's root (the parent of the shared .git directory), forward slashes. Worktree-aware.
 *  @param {string} [cwd] */
export function mainCheckoutRoot(cwd = process.cwd()) {
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8" }).trim();
  const abs = resolve(cwd, common);
  if (basename(abs) !== ".git") throw new Error(`cannot derive the main checkout from git common dir ${abs}`);
  return dirname(abs).replaceAll("\\", "/");
}

export const defaultSettingsPath = () => resolve(homedir(), ".claude", "settings.json");
export const defaultUserHooksDir = () => resolve(homedir(), ".claude", "hooks");

const stamp = (now) => now().toISOString().replaceAll(":", "").replaceAll("-", "").slice(0, 15);

function detectIndent(text) {
  const m = /^\{\r?\n([ \t]+)"/.exec(text);
  return m ? m[1] : 2;
}

/**
 * Plan and (with apply) perform the whole wiring: the shim file and the one settings.json entry.
 * @param {{ settingsPath?: string, userHooksDir?: string, mainRoot?: string, apply?: boolean, log?: (l: string) => void, now?: () => Date }} [o]
 * @returns {{ status: 'skip'|'error'|'dry-run'|'applied'|'unchanged', why?: string, shimChange?: boolean, settingsChange?: boolean }}
 */
export function applyWiring({
  settingsPath = defaultSettingsPath(),
  userHooksDir = defaultUserHooksDir(),
  mainRoot,
  apply = false,
  log = console.log,
  now = () => new Date(),
} = {}) {
  if (!existsSync(settingsPath)) {
    log("gate wiring: skip, settings.json is not present on this machine (CI or headless).");
    return { status: "skip" };
  }
  let root;
  try { root = mainRoot ?? mainCheckoutRoot(); } catch (e) { log(`gate wiring: ERROR, ${e.message}`); return { status: "error", why: e.message }; }
  const entryPath = join(root, ENTRY_REL);
  const templatePath = join(root, TEMPLATE_REL);
  if (!existsSync(entryPath)) { const why = `the main checkout has no gate entry at ${entryPath}; merge and pull first`; log(`gate wiring: ERROR, ${why}`); return { status: "error", why }; }
  if (!existsSync(templatePath)) { const why = `the main checkout has no shim template at ${templatePath}; merge and pull first`; log(`gate wiring: ERROR, ${why}`); return { status: "error", why }; }

  const shimText = renderShim(readFileSync(templatePath, "utf8"), entryPath);
  const shimPath = join(userHooksDir, SHIM_FILE_NAME);
  const installedShim = existsSync(shimPath) ? readFileSync(shimPath, "utf8") : null;
  const shimChange = installedShim !== shimText;

  const original = readFileSync(settingsPath, "utf8");
  let parsed;
  try { parsed = JSON.parse(original); } catch (e) { const why = `could not parse settings.json: ${e.message}`; log(`gate wiring: ERROR, ${why}`); return { status: "error", why }; }
  const planned = wireSettings(parsed, shimPath);
  const settingsChange = planned.changed;

  log(`gate wiring: shim ${shimPath}: ${shimChange ? (installedShim === null ? "to be created" : "to be replaced (backup first)") : "unchanged"}`);
  log(`gate wiring: settings ${settingsPath}: gate entry ${settingsChange ? "to be rewritten (backup first)" : "unchanged"}, every other key passed through`);
  log(`gate wiring: matcher ${MATCHER}`);
  if (!apply) {
    log("DRY-RUN, pass --apply to write (a timestamped backup is made first).");
    return { status: "dry-run", shimChange, settingsChange };
  }
  if (shimChange) {
    mkdirSync(userHooksDir, { recursive: true });
    if (installedShim !== null) copyFileSync(shimPath, `${shimPath}.bak-${stamp(now)}`);
    writeFileSync(shimPath, shimText, "utf8");
  }
  if (settingsChange) {
    copyFileSync(settingsPath, `${settingsPath}.bak-${stamp(now)}`);
    writeFileSync(settingsPath, JSON.stringify(planned.settings, null, detectIndent(original)) + (original.endsWith("\n") ? "\n" : ""), "utf8");
  }
  const status = shimChange || settingsChange ? "applied" : "unchanged";
  log(`gate wiring: ${status === "applied" ? "WROTE" : "nothing to write"}${shimChange ? ", shim installed" : ""}${settingsChange ? ", gate entry rewritten (all other keys preserved)" : ""}.`);
  return { status, shimChange, settingsChange };
}

if (isMainModule(import.meta.url)) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const res = applyWiring({
    apply: process.argv.includes("--apply"),
    ...(arg("settings") ? { settingsPath: resolve(arg("settings")) } : {}),
    ...(arg("user-hooks-dir") ? { userHooksDir: resolve(arg("user-hooks-dir")) } : {}),
  });
  if (res.status === "error") process.exitCode = 2;
}
