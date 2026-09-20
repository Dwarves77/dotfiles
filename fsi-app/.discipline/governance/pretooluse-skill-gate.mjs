#!/usr/bin/env node
// ACTION-TIME SKILL GATE (PreToolUse hook). Enforces the operator rule: "skills must be USED — looked
// at — before you can write code. No workaround." Skills/rules were enforced at commit-time + CI + the
// invariant meta-gate, but direct prod-writes (`node scripts/x.mjs --apply`), governed-file edits, and
// MCP repo/deploy writes happen BEFORE a commit exists, so none of those layers see them. This gate
// fires on every such action and BLOCKS it unless the governing skill was deliberately LOADED this
// session (an explicit `Skill` tool invocation in the transcript — passive content-presence from a
// compaction/system-reminder does NOT count, that is the workaround we forbid).
//
// Decision tiers:
//   * Governed file edit (Edit/Write/MultiEdit/NotebookEdit on a skill-mapped file)
//       skill loaded -> allow ; skill NOT loaded -> DENY (load it, then retry)
//   * Data write (Bash --apply/destructive) and MCP write (mcp__* mutating)
//       skill loaded -> ask (surface the prod/external effect) ; skill NOT loaded -> DENY
//   * Read-only / ungoverned / non-mutating -> allow
//   * Any error / empty / unparseable / no transcript -> fail closed (ask, or DENY on a write path)
//
// Wired from ~/.claude/settings.json PreToolUse, matcher
// "^(Bash|Edit|Write|MultiEdit|NotebookEdit|Agent|Task|Workflow|mcp__.+)$".
// COVERAGE (platform, corrected 2026-09-19): PreToolUse DOES fire inside sub-agents. The stale claim
// that it does not (recorded 2026-06-07) was disproved by the gate's own audit log on 2026-09-20 00:55
// UTC: 8 Edit deny and 3 Write deny entries logged while a sub-agent worked and the main session made
// no edits at all, meaning the gate had in fact fired for every one of the sub-agent's calls. The real
// gap was narrower: the payload's transcript_path names the PARENT session's transcript even for a
// sub-agent's own call, and a sub-agent's Skill tool_use is written only to its own sibling transcript
// file, never into the parent's, so the parent-path check could never see it (agent-transcript.mjs has
// the evidence and the fix: resolve the ACTING agent's own transcript from payload.agent_id when
// present). The dispatch tools (Agent/Task/Workflow) are still gated with an ASK below, but that ASK no
// longer claims the sub-agent's later calls go ungated, only that this hook cannot inspect the
// sub-agent's future actions from the dispatch point itself.
// AUDIT LOG: every decision appends `<iso>\t<tool>\t<decision>\t<tag>` to governance/.gate-audit.log
// (gitignored) — tool_name + decision ONLY, never tool_input (no secrets/commands logged). This proves
// the gate fired (incl. inside subagents/workflows) and is the durable "everything went through the skills" record.

import { readFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  missingFromTranscript,
  skillUnresolvableInTranscript,
  skillFileReadInTranscript,
} from "./skill-token.mjs";
import { isBranchingGitCommand, DOCTRINE } from "./worktree-isolation.mjs";
import { resolveActingTranscriptPath } from "./agent-transcript.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIT = resolve(HERE, ".gate-audit.log");

let TOOL = "?";
function logDecision(decision, tag) {
  try { appendFileSync(AUDIT, `${new Date().toISOString()}\t${TOOL}\t${decision}\t${tag}\n`); } catch { /* never block on logging */ }
}
function out(permissionDecision, reason, tag = "") {
  logDecision(permissionDecision, tag);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision, ...(reason ? { permissionDecisionReason: reason } : {}) },
  }));
  process.exit(0);
}

let raw = "";
try { raw = readFileSync(0, "utf8"); } catch { out("ask", "skill-gate backstop: could not read payload — failing closed.", "no-stdin"); }
if (!raw.trim()) out("ask", "skill-gate backstop: empty payload — failing closed.", "empty");

let payload;
try { payload = JSON.parse(raw); } catch { out("ask", "skill-gate backstop: unparseable payload — failing closed.", "unparseable"); }

const tool = payload?.tool_name || "";
TOOL = tool || "?";
const input = payload?.tool_input || {};
// agent_id is present ONLY when this call happens inside a sub-agent (Claude Code hooks reference,
// "Common Input Fields"). When present, the payload's own transcript_path still names the PARENT
// session's file, not this sub-agent's own; see agent-transcript.mjs for the evidence and derivation.
const agentId = payload?.agent_id || "";
const transcriptPath = resolveActingTranscriptPath(payload?.transcript_path || "", agentId);

let skillsForOp = () => [], skillsForFile = () => [], mapLoaded = false;
try {
  // pathToFileURL is REQUIRED: on Windows a raw `C:\...` path throws ERR_UNSUPPORTED_ESM_URL_SCHEME.
  const m = await import(pathToFileURL(resolve(HERE, "skill-map.mjs")).href);
  skillsForOp = m.skillsForOp; skillsForFile = m.skillsForFile; mapLoaded = true;
} catch { /* skill-map unavailable — fail closed below */ }

// "Looked at" == a DELIBERATE Skill invocation this session. The transcript serializes it as
// `"name":"Skill","input":{"skill":"<value>"` where <value> is the bare slug OR a directory/worktree-SCOPED
// name (e.g. "dotfiles/fsi-app:<slug>"). skillLoadedInTranscript (skill-token.mjs) matches BOTH forms as a
// suffix after an optional ':'-terminated scope prefix, so a legitimately-loaded scoped skill is detected
// (the bare-slug substring match wrongly DENIED it before). Passive prose mentions still don't count — the
// full tool_use shape is required.
function readTranscript() { try { return transcriptPath ? readFileSync(transcriptPath, "utf8") : ""; } catch { return ""; } }
function missingSkills(skills) {
  const t = readTranscript();
  if (!t) return { skills, noTranscript: true };
  return { skills: missingFromTranscript(t, skills), noTranscript: false };
}
// Gate a WRITE path on skill-load. onLoaded() is called (to emit allow/ask) only when all skills present.
//
// DEADLOCK ESCAPE (2026-08-09, operator-directed). A required skill that the session cannot
// REGISTER can never be invoked successfully, so the plain deny below is unsatisfiable — the gate
// would enforce a rule whose only escape hatch is structurally out of reach. This repo keeps its
// skills at `fsi-app/.claude/skills/`, one level under the repo root, so any session rooted at or
// above the repo root hits exactly that: `Skill: <slug>` returns "Unknown skill", forever. On
// 2026-08-09 this permanently blocked a legitimate `git push` of a CI-green fix.
//
// The escape is deliberately NARROW and never silent:
//   * it requires POSITIVE EVIDENCE the demand is impossible here — an ATTEMPTED Skill invocation
//     that ERRORED — or that the agent read the skill's SKILL.md directly (substantive
//     consultation, which is what "look at the skill" actually means);
//   * a session that simply skipped the skill still gets the hard deny (discipline preserved);
//   * and the outcome is ASK, not allow — a human confirms, so enforcement is never weakened
//     silently, only made answerable.
function gateWrite(skills, denyTag, contextMsg, onLoaded) {
  const { skills: missing, noTranscript } = missingSkills(skills);
  if (noTranscript) out("deny",
    `BLOCKED — cannot verify governing skill(s) are loaded (no session transcript). Load via the Skill tool: ${skills.join(", ")}. Then retry. No workaround.`,
    denyTag + "-notranscript");
  if (missing.length) {
    const t = readTranscript();
    const unsatisfiable = missing.filter(
      (s) => skillUnresolvableInTranscript(t, s) || skillFileReadInTranscript(t, s)
    );
    if (unsatisfiable.length === missing.length) {
      out("ask",
        `GOVERNING SKILL(S) NOT LOADABLE IN THIS SESSION: ${missing.join(", ")}. ` +
        `The session attempted the Skill tool and it did not resolve (or read the SKILL.md directly), ` +
        `which means this skill is not registered here — typically because the session's project root is ` +
        `above the directory the skills live in (this repo: fsi-app/.claude/skills/<slug>/SKILL.md). ` +
        `${contextMsg} Approve ONLY if the governing discipline has actually been applied to this change; ` +
        `to restore automatic enforcement, start the session at the repo root so the skills register.`,
        denyTag + "-skillunresolvable");
    }
    out("deny",
      `BLOCKED — this write cannot proceed until its governing skill(s) are LOADED this session via the Skill tool. ` +
      `Missing: ${missing.join(", ")}. Invoke e.g. Skill: ${missing[0]} (looking at it — not just having it in context), THEN retry. ` +
      `If the invocation returns "Unknown skill", the skill is not registered in this session: read ` +
      `fsi-app/.claude/skills/${missing[0]}/SKILL.md directly, or restart the session at the repo root. ` +
      `${contextMsg}`,
      denyTag + "-skillmissing");
  }
  onLoaded();
}

// ── Bash: data-writes / destructive / scaled runs. Write signal = --apply/--execute/--write flag +
// inherently-destructive ops + named runners. Read-only / dry-run pass. ──
if (tool === "Bash") {
  const cmd = input.command || "";
  // ── WORKTREE-ISOLATION belt (RD-19), the BELT to the git post-checkout hook's SUSPENDERS. ──
  // A branch/checkout/merge/rebase/worktree op must happen in the agent's assigned worktree, never in the
  // main checkout. PreToolUse DOES fire inside sub-agents too (corrected 2026-09-19, see the COVERAGE
  // note at the file header); this leg still cannot read the eventual cwd from the payload, so it ASKs
  // for either the orchestrator or a sub-agent, and the git post-checkout hook (fires regardless of
  // session type) remains the SUSPENDERS that catch the actual checkout either way.
  if (isBranchingGitCommand(cmd)) {
    out("ask",
      `GIT BRANCH/CHECKOUT/MERGE/REBASE op. WORKTREE-ISOLATION doctrine (RD-19): ${DOCTRINE} ` +
      `Confirm this runs in the assigned worktree (under .claude/worktrees/), NOT the main checkout. ` +
      `(Belt: this session-scoped gate catches the orchestrator's own ops; the git post-checkout + ` +
      `pre-commit hooks catch a sub-agent's — approve only if this honors worktree isolation.)`,
      "worktree-isolation");
  }
  const DANGER = new RegExp([
    "--apply\\b", "--execute\\b", "--write\\b",
    "b2-runner", "git\\s+push", "rm\\s+-rf", "drop\\s+(table|column)", "truncate", "delete\\s+from",
    "set\\s+not\\s+null", "add\\s+constraint", "update\\s+intelligence_items", "update\\s+sources",
    "set\\s+provenance_status", "supabase\\s+db\\s+(reset|push)", "run-migration", "exec_sql", "seed/apply-",
  ].join("|"), "i");
  if (!DANGER.test(cmd)) out("allow", "", "bash-read");
  const skills = skillsForOp(cmd).map((s) => s.skill);
  const required = skills.length ? skills : ["remediation-discipline", "environmental-policy-and-innovation"];
  gateWrite(required, "bash-write", "Data write (prod effect).", () => out("ask",
    `DATA-WRITE / destructive op. GOVERNING SKILL(S) loaded: ${required.join(", ")}. Approach MUST follow them: ` +
    `classify-before-delete; omit-with-note — NEVER delete/null real content for a gap; verify-before-completion ` +
    `(dry-run + paginated read-back). Approve only if skill-grounded.`, "bash-write-ok"));
}

// ── Edit / Write / MultiEdit / NotebookEdit: governed-file edits require the governing skill loaded. ──
if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
  const path = input.file_path || input.notebook_path || "";
  if (!mapLoaded) out("ask", "skill-gate backstop: skill-map failed to load — cannot prove this file is ungoverned; failing closed.", "map-fail");
  const skills = skillsForFile(path).map((s) => s.skill);
  if (!skills.length) out("allow", "", "edit-ungoverned");      // not a governed file
  gateWrite(skills, "edit-governed", "Editing a GOVERNED file — apply its format/grounding/surface/credibility rules.",
    () => out("allow", "", "edit-governed-ok"));                // skill loaded -> frictionless (commit/CI review downstream)
}

// ── Dispatch tools (Agent / Task / Workflow): spawn sub-agents whose LATER tool calls ARE hook-gated
// (corrected 2026-09-19: PreToolUse fires inside sub-agents, per the audit log evidence at the file
// header, and the gate now judges the acting sub-agent's own transcript via agent-transcript.mjs). What
// this dispatch point still cannot do is inspect the sub-agent's future interior from here, at dispatch
// time, before any of its tool calls exist. So we ASK at the dispatch point every time (it cannot be
// silently bypassed) and state the binding rule: a sub-agent that reasons about or writes governed
// content must invoke the Skill tool itself, in its own transcript, before that write, exactly like the
// main session. ──
if (["Agent", "Task", "Workflow"].includes(tool)) {
  out("ask",
    `DISPATCH (${tool}). NOTE: the sub-agent's later tool calls ARE gated by this same hook (corrected ` +
    `2026-09-19), judged against the sub-agent's OWN transcript, not this dispatch call. This ASK exists ` +
    `because the dispatch point itself cannot inspect what the sub-agent will do before it does it. ` +
    `Binding rule: a sub-agent that reasons about or writes governed content must invoke the Skill tool ` +
    `itself, in its own transcript, before that write. Approve only if this dispatch honors that.`,
    "dispatch");
}

// ── MCP tools (mcp__<server>__<tool>): external/repo/data writes that BYPASS Bash + git, invisible to
// commit-msg/CI until (if ever) reviewed. FAIL-CLOSED: anything not clearly read-only is a write. ──
if (tool.startsWith("mcp__")) {
  const t = tool.toLowerCase();
  const READ_ONLY = /(?:^|_)(get|list|search|read|fetch|status)(?:_|$)/.test(t) || /authenticat/.test(t);
  const WRITE = /(create|update|delete|merge|push|write|remove|deploy|promote|rollback|fork|dispatch|comment|upsert|patch|add_|put_|set_|approve)/.test(t);
  if (READ_ONLY && !WRITE) out("allow", "", "mcp-read");
  gateWrite(["caros-ledge-platform-intent", "remediation-discipline"], "mcp-write",
    `MCP WRITE (${tool}) — bypasses Bash+git, so commit-msg/CI/meta-gate never see it.`,
    () => out("ask",
      `MCP WRITE / external op (${tool}). Governing skills loaded. This repo/data/deploy write must still be ` +
      `reviewed + verified (no surface/scope drift; integrity rule). Approve only if skill-grounded.`, "mcp-write-ok"));
}

out("allow", "", "other-tool"); // any other tool
