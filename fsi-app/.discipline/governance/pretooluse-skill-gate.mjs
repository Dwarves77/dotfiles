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
//   * Data write (Bash --apply/destructive) and MCP write (an MCP tool in the WRITE table)
//       skill loaded -> ask (surface the prod/external effect) ; skill NOT loaded -> DENY
//   * Read-only / ungoverned / non-mutating -> allow
//   * An MCP tool in neither table (UNKNOWN) -> ask, never deny
//   * Unreadable / empty / unparseable payload -> ask. No readable transcript on a write path -> ask.
//   * A required skill the session cannot register (an errored Skill call, or the SKILL.md read directly)
//       -> allow, with an audit-log line naming the skills.
//
// GATE-2 (2026-10-08) rebuilt the classifiers that gate-evaluation-A measured as the false-positive
// sources (47 no-transcript denies, 107 unresolvable asks, 16 MCP misclassifications, 1,094 worktree asks
// of which an unknown share were read-only git, and a DANGER regex that matched prose in commit messages
// and heredocs, which denied the evaluation lane's own read-only `cat <<EOF`):
//   * DANGER runs over the command's own argv: heredoc bodies, quoted strings and `#` comments are stripped
//     first (argvOnly).
//   * MCP reads and writes come from explicit tables in skill-map.mjs, not a name regex (classifyMcp).
//   * worktree isolation asks only for the branch-moving git forms in skill-map.mjs (isolationAsk).
//
// IN-PROCESS USE. The decision logic is the exported runGate(rawPayload) -> stdout JSON string, so the
// out-of-repo scope shim (~/.claude/hooks/pretooluse-fsi-app-scope.mjs) can import this module and call it
// in the same node process instead of spawning a second one (0.23 s per in-scope call, 38,231 gated calls
// in 30 days). The CLI below is the same function behind stdin/stdout, so there is one implementation.
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
// AUDIT LOG: every decision appends `<iso>\t<tool>\t<decision>\t<tag>[\t<detail>]` to
// governance/.gate-audit.log (gitignored): tool_name + decision ONLY, never tool_input (no secrets/commands
// logged). The optional detail column carries skill slugs for the unresolvable allow. This proves the gate
// fired (incl. inside subagents/workflows) and is the durable "everything went through the skills" record.

import { readFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../../scripts/lib/is-main.mjs";
import {
  missingFromTranscript,
  skillUnresolvableInTranscript,
  skillFileReadInTranscript,
} from "./skill-token.mjs";
import { isBranchingGitCommand, DOCTRINE } from "./worktree-isolation.mjs";
import { resolveActingTranscriptPath } from "./agent-transcript.mjs";
import {
  skillsForOp,
  skillsForFile,
  BASH_DANGER_PATTERNS,
  MCP_READ_PREFIXES,
  MCP_READ_NAMES,
  MCP_WRITE_PREFIXES,
  MCP_WRITE_NAMES,
  MCP_SQL_TOOL_NAMES,
  MCP_BATCH_NAMES,
  MCP_COMPUTER_NAMES,
  MCP_COMPUTER_READ_ACTIONS,
  GIT_ISOLATION_FORMS,
} from "./skill-map.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIT = resolve(HERE, ".gate-audit.log");

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// CLASSIFIERS (pure; exported for the tests)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════

const DANGER = new RegExp(BASH_DANGER_PATTERNS.join("|"), "i");

/**
 * The command's OWN argv text: heredoc bodies, single- and double-quoted strings and everything after an
 * unquoted `#` (to the end of that line) are removed, so a DANGER word inside a commit message, a grep
 * pattern, an echo or a heredoc never reads as an operation. A quoted string is replaced by the single
 * token `Q` (so `git -C "p q" checkout x` keeps its shape); newlines are kept (they separate commands).
 * PURE. The one exception is an interpreter's inline-code argument (`psql -c "..."`, `bash -c "..."`,
 * `node -e "..."`), which interpreterPayloads() hands back so DANGER also runs over its contents.
 * @param {string} cmd @returns {string}
 */
export function argvOnly(cmd) {
  return scanArgv(cmd).text.replace(PLACEHOLDER_RE, "Q");
}

// A quoted string is carried through the scan as \u0001<index>\u0002 so interpreterPayloads() can find its
// contents again; argvOnly() turns every placeholder into the plain token Q.
const PLACEHOLDER_RE = /\u0001\d+\u0002/g;

function scanArgv(cmd) {
  const s = String(cmd ?? "");
  const n = s.length;
  const pending = []; // heredocs opened on the current line: { delim, dash }
  const quoted = []; // contents of each quoted string, by placeholder index
  let out = "";
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === "\\") { // escaped char (or line continuation): not an operator
      out += " ";
      i += 2;
      continue;
    }
    if (c === "'") { // single quote: literal to the next single quote
      const j = s.indexOf("'", i + 1);
      out += `\u0001${quoted.push(s.slice(i + 1, j === -1 ? n : j)) - 1}\u0002`;
      i = j === -1 ? n : j + 1;
      continue;
    }
    if (c === '"') { // double quote: to the next unescaped double quote
      let j = i + 1;
      while (j < n && s[j] !== '"') j += s[j] === "\\" ? 2 : 1;
      out += `\u0001${quoted.push(s.slice(i + 1, Math.min(j, n))) - 1}\u0002`;
      i = j >= n ? n : j + 1;
      continue;
    }
    if (c === "#" && (i === 0 || /[\s;&|(]/.test(s[i - 1]))) { // comment to end of line
      while (i < n && s[i] !== "\n") i++;
      continue;
    }
    if (c === "<" && s[i + 1] === "<" && s[i + 2] !== "<") { // heredoc (not a <<< here-string)
      let j = i + 2;
      let dash = false;
      if (s[j] === "-") { dash = true; j++; }
      while (j < n && (s[j] === " " || s[j] === "\t")) j++;
      let delim = "";
      if (s[j] === "'" || s[j] === '"') {
        const q = s[j];
        const e = s.indexOf(q, j + 1);
        delim = s.slice(j + 1, e === -1 ? n : e);
        j = e === -1 ? n : e + 1;
      } else {
        const m = /^[^\s;&|()<>]+/.exec(s.slice(j));
        delim = m ? m[0] : "";
        j += delim.length;
      }
      if (delim) pending.push({ delim, dash });
      out += "<< ";
      i = j;
      continue;
    }
    if (c === "\n") {
      out += "\n";
      i++;
      while (pending.length) { // the heredoc bodies start on the next line
        const { delim, dash } = pending.shift();
        while (i < n) {
          let e = s.indexOf("\n", i);
          if (e === -1) e = n;
          const line = s.slice(i, e);
          i = Math.min(e + 1, n);
          const cmp = dash ? line.replace(/^\t+/, "") : line;
          if (cmp === delim || cmp.replace(/\r$/, "") === delim) break;
        }
      }
      continue;
    }
    out += c;
    i++;
  }
  return { text: out, quoted };
}

// Interpreters whose inline-code argument is run as code, so DANGER also reads it (operator ruling on PR 998):
// a SHELL interpreter's argument is itself a command line (analysed recursively, so `bash -c "echo 'git push'"`
// stays quiet); a CODE interpreter's argument (SQL for psql, a script for node or python) is read as written.
const SHELL_INTERPRETERS = new Set(["bash", "sh", "zsh"]);
const CODE_INTERPRETERS = new Set(["psql", "node", "python", "python3"]);

/**
 * The inline-code arguments of interpreter calls in a command: [{ kind: "shell" | "code", content }] for each
 * simple command whose first word (after env assignments) is bash, sh, zsh, psql, node, python or python3 and
 * that carries -c / -e (bundled flags such as -lc, --command, --eval accepted) followed by a quoted string.
 * PURE. @param {string} cmd @returns {{kind: string, content: string}[]}
 */
export function interpreterPayloads(cmd) {
  const { text, quoted } = scanArgv(cmd);
  const found = [];
  for (const segment of text.split(/\n|;|&&|\|\||\||&|\(|\)/)) {
    const t = segment.trim().split(/\s+/).filter(Boolean);
    let k = 0;
    while (k < t.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[k])) k++;
    if (k >= t.length) continue;
    const prog = t[k].replace(/^.*[\\/]/, "").replace(/\.exe$/i, "").toLowerCase();
    const kind = SHELL_INTERPRETERS.has(prog) ? "shell" : CODE_INTERPRETERS.has(prog) ? "code" : null;
    if (!kind) continue;
    for (let m = k + 1; m < t.length; m++) {
      const inline = /^(?:-[a-zA-Z]*[ce]|--command|--eval)$/.test(t[m]);
      const joined = /^--(?:command|eval)=\u0001(\d+)\u0002$/.exec(t[m]);
      const next = inline && m + 1 < t.length ? /^\u0001(\d+)\u0002$/.exec(t[m + 1]) : null;
      const hit = joined || next;
      if (hit) found.push({ kind, content: quoted[Number(hit[1])] });
    }
  }
  return found;
}

/** True when DANGER matches the command's own argv or the inline code of an interpreter it runs (depth 3). */
export function dangerIn(cmd, depth = 0) {
  if (DANGER.test(argvOnly(cmd))) return true;
  if (depth >= 3) return false;
  return interpreterPayloads(cmd).some((p) => (p.kind === "code" ? DANGER.test(p.content) : dangerIn(p.content, depth + 1)));
}

// The git invocations in an argv-only command: [{ sub, args }] for each `git [global opts] <sub> <args>`.
function gitInvocations(argv) {
  const found = [];
  for (const segment of argv.split(/\n|;|&&|\|\||\||&|\(|\)/)) {
    const t = segment.trim().split(/\s+/).filter(Boolean);
    let k = 0;
    while (k < t.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t[k]) || /^(env|command|time|exec|nice|sudo)$/i.test(t[k]))) k++;
    if (k >= t.length || !/^(?:.*[\\/])?git(?:\.exe)?$/i.test(t[k])) continue;
    k++;
    // global options: -C <dir>, -c <k=v>, --git-dir/--work-tree/--namespace <v>, and bare --no-pager style flags
    while (k < t.length && t[k].startsWith("-")) {
      k += /^(?:-C|-c|--git-dir|--work-tree|--namespace|--exec-path)$/.test(t[k]) ? 2 : 1;
    }
    if (k >= t.length) continue;
    found.push({ sub: t[k].toLowerCase(), args: t.slice(k + 1) });
  }
  return found;
}

/**
 * True when the command contains a git form that moves or rewrites a branch (the GIT_ISOLATION_FORMS rows).
 * Read-only forms never match. PURE. @param {string} cmd the RAW command @returns {boolean}
 */
export function isolationAsk(cmd) {
  const argv = argvOnly(cmd);
  // Cheap prefilter before tokenizing: RD-19's single-home matcher (checkout, switch, branch, merge, rebase,
  // worktree add) plus the two forms it never covered (push, reset). The GIT_ISOLATION_FORMS rows then decide.
  if (!isBranchingGitCommand(argv) && !/\bgit\s+(?:-\S+\s+)*(?:push|reset)\b/i.test(argv)) return false;
  for (const { sub, args } of gitInvocations(argv)) {
    const form = GIT_ISOLATION_FORMS.find((f) => f.sub === sub);
    if (!form) continue;
    if (form.needsArgs && args.length === 0) continue;
    if (form.exceptFirstArg && form.exceptFirstArg.includes(args[0])) continue;
    if (form.exceptAnyArg && args.some((a) => form.exceptAnyArg.includes(a))) continue;
    if (form.firstArg && !form.firstArg.includes(args[0])) continue;
    if (form.anyArg && !args.some((a) => form.anyArg.includes(a))) continue;
    if (form.anyArgRe && !args.some((a) => form.anyArgRe.test(a))) continue;
    return true;
  }
  return false;
}

/** True when a SQL string is a single read statement: the first token is SELECT and nothing follows a `;`. */
export function isSelectSql(sql) {
  const noComments = String(sql ?? "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  const noStrings = noComments.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
  const trimmed = noStrings.trim();
  if (!/^select\b/i.test(trimmed)) return false;
  const semi = trimmed.indexOf(";");
  return semi === -1 || trimmed.slice(semi + 1).trim() === "";
}

/** The tool name after `mcp__<server>__` (the whole name when it does not have that shape). */
export function mcpToolName(tool) {
  const m = /^mcp__.+?__(.+)$/.exec(String(tool ?? ""));
  return (m ? m[1] : String(tool ?? "")).toLowerCase();
}

function classifyName(name, input) {
  if (MCP_WRITE_NAMES.includes(name)) {
    if (MCP_SQL_TOOL_NAMES.includes(name) && isSelectSql(input?.query ?? input?.sql)) return "read";
    return "write";
  }
  if (MCP_WRITE_PREFIXES.some((p) => name.startsWith(p))) return "write";
  if (MCP_READ_NAMES.includes(name) || MCP_READ_PREFIXES.some((p) => name.startsWith(p))) return "read";
  if (MCP_COMPUTER_NAMES.includes(name)) {
    return MCP_COMPUTER_READ_ACTIONS.includes(String(input?.action ?? "").toLowerCase()) ? "read" : "unknown";
  }
  return "unknown";
}

/**
 * 'read' | 'write' | 'unknown' for an MCP tool call, from the explicit tables in skill-map.mjs. A
 * browser_batch is read only when every action in it is read; one write makes it a write, otherwise one
 * unknown makes it unknown. PURE. @param {string} tool the full tool_name @param {object} [input]
 */
export function classifyMcp(tool, input = {}) {
  const name = mcpToolName(tool);
  if (MCP_BATCH_NAMES.includes(name)) {
    const actions = Array.isArray(input?.actions) ? input.actions : [];
    const kinds = actions.map((a) => classifyName(String(a?.name ?? "").toLowerCase(), a?.input ?? {}));
    if (kinds.includes("write")) return "write";
    if (kinds.includes("unknown")) return "unknown";
    return "read";
  }
  return classifyName(name, input);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// DECISION
// ═════════════════════════════════════════════════════════════════════════════════════════════════════

function decision(permissionDecision, reason, tag, detail = "") {
  return { permissionDecision, reason: reason || "", tag, detail };
}

function readTranscriptAt(path) {
  try { return path ? readFileSync(path, "utf8") : ""; } catch { return ""; }
}

// Gate a WRITE path on skill-load. Returns the decision, calling onLoaded() only when every skill is present.
//
// No readable transcript -> ASK (GATE-2: 47 of 367 denies in 30 days were this infrastructure condition
// refused as if it were a violation; a human confirms instead).
//
// DEADLOCK ESCAPE (2026-08-09, operator-directed). A required skill that the session cannot REGISTER can
// never be invoked successfully, so a deny would be unsatisfiable. This repo keeps its skills at
// `fsi-app/.claude/skills/`, one level under the repo root, so any session rooted at or above the repo root
// hits exactly that: `Skill: <slug>` returns "Unknown skill", forever. The escape is narrow: it requires
// POSITIVE EVIDENCE the demand is impossible here (an ATTEMPTED Skill invocation that ERRORED, or the
// agent reading the skill's SKILL.md directly); a session that simply skipped the skill still gets the
// hard deny. GATE-2: the outcome is now ALLOW with an audit-log line naming the skills (107 asks in 30 days
// were this case, false positives by the gate's own header), where it used to be an ask.
function gateWrite(transcriptPath, skills, denyTag, contextMsg, onLoaded) {
  const t = readTranscriptAt(transcriptPath);
  if (!t) {
    return decision("ask",
      `Cannot verify governing skill(s) are loaded (no readable session transcript). Governing: ${skills.join(", ")}. ` +
      `${contextMsg} Approve only if the governing discipline has been applied to this change.`,
      denyTag + "-notranscript");
  }
  const missing = missingFromTranscript(t, skills);
  if (missing.length) {
    const unsatisfiable = missing.filter((s) => skillUnresolvableInTranscript(t, s) || skillFileReadInTranscript(t, s));
    if (unsatisfiable.length === missing.length) {
      return decision("allow", "", denyTag + "-skillunresolvable", missing.join(","));
    }
    return decision("deny",
      `BLOCKED — this write cannot proceed until its governing skill(s) are LOADED this session via the Skill tool. ` +
      `Missing: ${missing.join(", ")}. Invoke e.g. Skill: ${missing[0]} (looking at it — not just having it in context), THEN retry. ` +
      `If the invocation returns "Unknown skill", the skill is not registered in this session: read ` +
      `fsi-app/.claude/skills/${missing[0]}/SKILL.md directly, or restart the session at the repo root. ` +
      `${contextMsg}`,
      denyTag + "-skillmissing");
  }
  return onLoaded();
}

/**
 * The gate's decision for one parsed PreToolUse payload. PURE apart from reading the transcript file.
 * @param {object} payload @returns {{permissionDecision: string, reason: string, tag: string, detail: string}}
 */
export function evaluateGate(payload) {
  const tool = payload?.tool_name || "";
  const input = payload?.tool_input || {};
  // agent_id is present ONLY when this call happens inside a sub-agent (Claude Code hooks reference,
  // "Common Input Fields"). When present, the payload's own transcript_path still names the PARENT
  // session's file, not this sub-agent's own; see agent-transcript.mjs for the evidence and derivation.
  const transcriptPath = resolveActingTranscriptPath(payload?.transcript_path || "", payload?.agent_id || "");

  // ── Bash: data-writes / destructive / scaled runs. Write signal = --apply/--execute/--write flag +
  // inherently-destructive ops + named runners, found in the command's own argv. Read-only / dry-run pass. ──
  if (tool === "Bash") {
    const cmd = input.command || "";
    // ── WORKTREE-ISOLATION belt (RD-19), the BELT to the git post-checkout hook's SUSPENDERS. ──
    // A branch-moving git op must happen in the agent's assigned worktree, never in the main checkout.
    // PreToolUse DOES fire inside sub-agents too (corrected 2026-09-19); this leg still cannot read the
    // eventual cwd from the payload, so it ASKs for the branch-moving forms only (isolationAsk), and the
    // git post-checkout hook (fires regardless of session type) remains the SUSPENDERS.
    if (isolationAsk(cmd)) {
      return decision("ask",
        `GIT BRANCH-MOVING op (checkout <ref>, switch, rebase, merge, worktree add, reset --hard, branch -d/-D, push --force). ` +
        `WORKTREE-ISOLATION doctrine (RD-19): ${DOCTRINE} ` +
        `Confirm this runs in the assigned worktree (under .claude/worktrees/), NOT the main checkout. ` +
        `(Belt: this session-scoped gate catches the orchestrator's own ops; the git post-checkout + ` +
        `pre-commit hooks catch a sub-agent's; approve only if this honors worktree isolation.)`,
        "worktree-isolation");
    }
    if (!dangerIn(cmd)) return decision("allow", "", "bash-read");
    const skills = skillsForOp(cmd).map((s) => s.skill);
    const required = skills.length ? skills : ["remediation-discipline", "environmental-policy-and-innovation"];
    return gateWrite(transcriptPath, required, "bash-write", "Data write (prod effect).", () => decision("ask",
      `DATA-WRITE / destructive op. GOVERNING SKILL(S) loaded: ${required.join(", ")}. Approach MUST follow them: ` +
      `classify-before-delete; omit-with-note: NEVER delete/null real content for a gap; verify-before-completion ` +
      `(dry-run + paginated read-back). Approve only if skill-grounded.`, "bash-write-ok"));
  }

  // ── Edit / Write / MultiEdit / NotebookEdit: governed-file edits require the governing skill loaded. ──
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
    const path = input.file_path || input.notebook_path || "";
    const skills = skillsForFile(path).map((s) => s.skill);
    if (!skills.length) return decision("allow", "", "edit-ungoverned");      // not a governed file
    return gateWrite(transcriptPath, skills, "edit-governed", "Editing a GOVERNED file: apply its format/grounding/surface/credibility rules.",
      () => decision("allow", "", "edit-governed-ok"));                       // skill loaded -> frictionless (commit/CI review downstream)
  }

  // ── Dispatch tools (Agent / Task / Workflow): spawn sub-agents whose LATER tool calls ARE hook-gated
  // (corrected 2026-09-19: PreToolUse fires inside sub-agents, and the gate judges the acting sub-agent's
  // own transcript via agent-transcript.mjs). What this dispatch point still cannot do is inspect the
  // sub-agent's future interior from here. So we ASK at the dispatch point every time and state the binding
  // rule: a sub-agent that reasons about or writes governed content must invoke the Skill tool itself, in
  // its own transcript, before that write, exactly like the main session. ──
  if (["Agent", "Task", "Workflow"].includes(tool)) {
    return decision("ask",
      `DISPATCH (${tool}). NOTE: the sub-agent's later tool calls ARE gated by this same hook (corrected ` +
      `2026-09-19), judged against the sub-agent's OWN transcript, not this dispatch call. This ASK exists ` +
      `because the dispatch point itself cannot inspect what the sub-agent will do before it does it. ` +
      `Binding rule: a sub-agent that reasons about or writes governed content must invoke the Skill tool ` +
      `itself, in its own transcript, before that write. Approve only if this dispatch honors that.`,
      "dispatch");
  }

  // ── MCP tools (mcp__<server>__<tool>): external/repo/data writes that BYPASS Bash + git, invisible to
  // commit-msg/CI until (if ever) reviewed. READ and WRITE come from the explicit tables in skill-map.mjs;
  // a name in neither table is UNKNOWN and is asked, never denied. ──
  if (tool.startsWith("mcp__")) {
    const kind = classifyMcp(tool, input);
    if (kind === "read") return decision("allow", "", "mcp-read");
    if (kind === "unknown") {
      return decision("ask",
        `MCP tool ${tool} is in neither the read table nor the write table (skill-map.mjs). Approve only if it ` +
        `does not write repo, data or deploy state; add its name to the right table so it stops asking.`,
        "mcp-unknown");
    }
    return gateWrite(transcriptPath, ["caros-ledge-platform-intent", "remediation-discipline"], "mcp-write",
      `MCP WRITE (${tool}): bypasses Bash+git, so commit-msg/CI/meta-gate never see it.`,
      () => decision("ask",
        `MCP WRITE / external op (${tool}). Governing skills loaded. This repo/data/deploy write must still be ` +
        `reviewed + verified (no surface/scope drift; integrity rule). Approve only if skill-grounded.`, "mcp-write-ok"));
  }

  return decision("allow", "", "other-tool"); // any other tool
}

function logDecision(tool, d) {
  try {
    appendFileSync(AUDIT, `${new Date().toISOString()}\t${tool || "?"}\t${d.permissionDecision}\t${d.tag}${d.detail ? `\t${d.detail}` : ""}\n`);
  } catch { /* never block on logging */ }
}

function render(d) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: d.permissionDecision,
      ...(d.reason ? { permissionDecisionReason: d.reason } : {}),
    },
  });
}

/**
 * The whole hook: raw stdin text in, the PreToolUse stdout JSON out, one audit-log line appended. Never
 * throws; every failure is an ask. This is what the CLI below runs and what the scope shim imports.
 * @param {string} raw @returns {string}
 */
export function runGate(raw) {
  let d;
  let tool = "?";
  if (!String(raw ?? "").trim()) {
    d = decision("ask", "skill-gate backstop: empty payload, failing closed.", "empty");
  } else {
    let payload = null;
    try { payload = JSON.parse(raw); } catch { /* handled below */ }
    if (payload === null || typeof payload !== "object") {
      d = decision("ask", "skill-gate backstop: unparseable payload, failing closed.", "unparseable");
    } else {
      tool = payload.tool_name || "?";
      try {
        d = evaluateGate(payload);
      } catch (e) {
        d = decision("ask", `skill-gate backstop: the gate itself failed (${String(e?.message || e).slice(0, 120)}), failing closed.`, "gate-error");
      }
    }
  }
  logDecision(tool, d);
  return render(d);
}

if (isMainModule(import.meta.url)) {
  let raw = "";
  try { raw = readFileSync(0, "utf8"); } catch {
    const d = decision("ask", "skill-gate backstop: could not read payload, failing closed.", "no-stdin");
    logDecision("?", d);
    process.stdout.write(render(d));
    process.exit(0);
  }
  process.stdout.write(runGate(raw));
  process.exit(0);
}
