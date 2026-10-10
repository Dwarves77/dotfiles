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
// fsi-app/.discipline/out/gate-audit.log (gitignored; GATE_AUDIT_LOG redirects or disables it): tool_name + decision ONLY, never tool_input (no secrets/commands
// logged). The optional detail column carries skill slugs for the unresolvable allow. This proves the gate
// fired (incl. inside subagents/workflows) and is the durable "everything went through the skills" record.

import { readFileSync, appendFileSync, mkdirSync, realpathSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../../scripts/lib/is-main.mjs";
import { appendFirings } from "../lib/firing-log.mjs";
import {
  missingFromTranscript,
  skillUnresolvableInTranscript,
} from "./skill-token.mjs";
import { DOCTRINE } from "./worktree-isolation.mjs";
import { resolveActingTranscriptPath } from "./agent-transcript.mjs";
import { collectOpenFindings, dispositionProblem, REGISTER_GRACE_MS } from "../../scripts/verify/audit-finding-status.mjs";
import {
  skillsForOp,
  skillsForFile,
  BASH_DANGER_PATTERNS,
  MCP_READ_PREFIXES,
  MCP_MUTATING_WORDS,
  SHELL_TOOLS,
  DISPATCH_TOOLS,
  WORKTREE_TOOLS,
  ACTION_TOOLS,
  MCP_READ_NAMES,
  MCP_WRITE_PREFIXES,
  MCP_WRITE_NAMES,
  MCP_SQL_TOOL_NAMES,
  MCP_BATCH_NAMES,
  MCP_COMPUTER_NAMES,
  MCP_COMPUTER_READ_ACTIONS,
  GIT_ISOLATION_FORMS,
} from "./skill-map.mjs";

// The scope decision (does this call belong to the fsi-app project?) lives in its own dependency-free module so
// the out-of-repo shim can import it without loading this gate; it is re-exported here so there is one entry.
export { inScope } from "./pretooluse-scope.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// RULE 13 AT THE DISPATCH POINT (lane FLAG-1, 2026-10-09). Detection after the fact is half of a gate: a flag
// is a commitment, and a required step must be impossible to skip. A dispatch (Agent, Task, Workflow,
// SendMessage) is REFUSED while any finding is undispositioned in docs/audits/*.md, in the Not done / Open
// items / Open questions / Residual sections of docs/ops/session-log.d/*.md (both dated 2026-10-01 or
// later), or in any *register*.md under fsi-app/scripts/tmp/. The scan is the same function the push-time
// CLI uses (collectOpenFindings in scripts/verify/audit-finding-status.mjs, one site), cached by file mtime.
// The one dispatch it allows is a disposition lane: the dispatch text contains the literal DISPOSITION-LANE.
// That literal is a mistake-catcher for a cooperating session (ADR-046): it stops the honest slip of
// dispatching new work over open flags, and is NOT an intent barrier, since any dispatcher can type the
// literal. GATE_DISPOSITION_ROOT=<dir> redirects the scanned repo root (the tests use it; it is read from the
// hook process's own environment, which the session being gated does not control).
const DISPOSITION_LITERAL = "DISPOSITION-LANE";
const REPO_ROOT = resolve(HERE, "..", "..", "..");
//
// GATE-FIX-1 (2026-10-09), two honest forms of the same gate:
//   * a scratch register (gitignored, never committed) blocks only once its file is older than 24 hours (mtime),
//     so a fact lane's fresh register has a landing window and a stale one still forces; the refusal names the
//     file and its age. Committed audits and session logs keep blocking at once.
//   * a DISPOSITION ACT passes: a message whose text carries file:line -> [TOKEN] pairs that cover EVERY
//     currently open finding with a well-formed token is the coordinator dispositioning, not dispatching new work
//     (every merged lane's log reopened the gate, and the only path to a disposition commit was the executor,
//     whom the gate also refused). A message covering only some open findings is refused, naming the uncovered.
const PAIR_RE = /([^\s"'`<>|,;()[\]]+?\.md):(\d+)\s*(?:->|=>|\u2192)\s*(\[[^\]]*\])/g;

/** Every string value inside a tool input, joined by newlines (so a pair is read as written, not JSON-escaped). */
function inputText(input) {
  const out = [];
  const walk = (v, depth) => {
    if (typeof v === "string") out.push(v);
    else if (depth < 6 && v && typeof v === "object") for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(input, 0);
  return out.join("\n");
}

/** The `file:line -> [TOKEN]` pairs in a text whose token is a well-formed disposition, as a Set of "file:line". */
function dispositionPairs(text) {
  const covered = new Set();
  for (const m of text.matchAll(PAIR_RE)) {
    if (dispositionProblem(m[3]) !== null || /^\[REFUTED\]$/.test(m[3])) continue; // malformed or the bare status token
    covered.add(`${m[1].split("\\").join("/").replace(/^\.\//, "")}:${m[2]}`);
  }
  return covered;
}

function dispositionRefusal(tool, input) {
  const text = inputText(input);
  if (text.includes(DISPOSITION_LITERAL)) return null;
  const open = collectOpenFindings(process.env.GATE_DISPOSITION_ROOT || REPO_ROOT, { registerGraceMs: REGISTER_GRACE_MS });
  if (!open.length) return null;
  const covered = dispositionPairs(text);
  const uncovered = open.filter((o) => !covered.has(`${o.file}:${o.line}`));
  if (covered.size && !uncovered.length) return null; // a disposition act: every open finding has its token
  const label = (o) => `${o.file}:${o.line}${o.ageMs === undefined ? "" : ` (register ${Math.floor(o.ageMs / 3600000)}h old)`}`;
  const shown = uncovered.slice(0, 20).map(label).join("; ");
  return decision("deny",
    `DISPATCH (${tool}) REFUSED by rule 13 (a flag is a commitment): ${uncovered.length} finding(s) carry no disposition` +
    `${covered.size ? ` (this message dispositions ${open.length - uncovered.length} of ${open.length} open findings; a disposition act must cover every one)` : ""}. ` +
    `First ${Math.min(20, uncovered.length)}: ${shown}${uncovered.length > 20 ? "; ..." : ""}. Give each exactly one of [WORK: <lane id or PR N>], ` +
    `[CLOSED: PR N], [REFUTED: <evidence>], [NOT-WORK: <reason>] (node fsi-app/scripts/verify/audit-finding-status.mjs --all lists every one), ` +
    `by a message of \`file:line -> [TOKEN]\` pairs covering all of them, or dispatch the lane that does so with the literal ${DISPOSITION_LITERAL} in its prompt.`,
    "dispatch-undispositioned");
}

// AUDIT LOG PATH (lane GATE-7, coordinator addition 2026-10-08, TESTFIX-1): the audit log lived beside the gate
// (governance/.gate-audit.log), so the gate's own test dirtied the checkout. It is now under the gitignored
// out directory (fsi-app/.discipline/out/gate-audit.log, the same directory the CI firing artifacts use) and the
// path is injectable: GATE_AUDIT_LOG=<path> redirects it and GATE_AUDIT_LOG=off disables it, which is how the
// tests keep it out of the checkout.
const AUDIT_DEFAULT = resolve(HERE, "..", "out", "gate-audit.log");
/** The audit log's path, or null when it is switched off. @param {NodeJS.ProcessEnv} [env] */
export function auditLogPath(env = process.env) {
  const target = env.GATE_AUDIT_LOG;
  if (target === "off") return null;
  return target || AUDIT_DEFAULT;
}

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

// Separators between simple commands in an argv-only command line.
const SEGMENT_SPLIT = /\n|;|&&|\|\||\||&|\(|\)/;

/** The program a token names: directory and .exe stripped, lower-cased. */
function progName(tok) {
  return String(tok ?? "").replace(/^.*[\\/]/, "").replace(/\.exe$/i, "").toLowerCase();
}

// Words that run another command and are not the program (GATE-7, register attacks A-PT-B11 to B13: `env bash
// -c "git push"`, `nohup sh -c ...`, `timeout 5 bash -c ...` hid the interpreter from the gate).
const WRAPPER_WORDS = new Set(["env", "nohup", "command", "exec", "time", "sudo", "setsid", "stdbuf", "nice", "ionice", "timeout"]);
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Index of the token that is the real program of a simple command: env assignments, wrapper words and their
 *  own flags/arguments (timeout's duration, nice's -n value, env's -u name) are skipped. t.length if none. */
function unwrap(t) {
  let k = 0;
  for (;;) {
    while (k < t.length && ASSIGNMENT_RE.test(t[k])) k++;
    if (k >= t.length) return k;
    const w = progName(t[k]);
    if (!WRAPPER_WORDS.has(w)) return k;
    k++;
    if (w === "timeout") {
      while (k < t.length && t[k].startsWith("-")) k++;
      if (k < t.length) k++; // the duration
    } else if (w === "nice" || w === "ionice") {
      while (k < t.length && t[k].startsWith("-")) k += /^-[nc]$/.test(t[k]) ? 2 : 1;
    } else if (w === "env") {
      while (k < t.length && (t[k].startsWith("-") || ASSIGNMENT_RE.test(t[k]))) k += /^-[uC]$/.test(t[k]) ? 2 : 1;
    } else {
      while (k < t.length && t[k].startsWith("-")) k++;
    }
  }
}

/** The program of the LAST simple command in `text` (what a heredoc or here-string opened there feeds). */
function ownerOf(text) {
  const seg = text.split(SEGMENT_SPLIT).pop() ?? "";
  const t = seg.trim().split(/\s+/).filter(Boolean);
  const k = unwrap(t);
  return k < t.length ? progName(t[k]) : null;
}

// A quoted string that is exactly one of the write flags is a flag, not prose (A-PT-B10: `node s.mjs "--apply"`).
const FLAG_ONLY_RE = /^--(?:apply|execute|write)$/i;

function scanArgv(cmd) {
  const s = String(cmd ?? "");
  const n = s.length;
  const pending = []; // heredocs opened on the current line: { delim, dash, owner }
  const quoted = []; // contents of each quoted string, by placeholder index
  const bodies = []; // heredoc and here-string bodies: { owner, content }; the owner is the program that reads them
  const stash = (content) => (FLAG_ONLY_RE.test(content.trim()) ? ` ${content.trim()} ` : `\u0001${quoted.push(content) - 1}\u0002`);
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
      out += stash(s.slice(i + 1, j === -1 ? n : j));
      i = j === -1 ? n : j + 1;
      continue;
    }
    if (c === '"') { // double quote: to the next unescaped double quote
      let j = i + 1;
      while (j < n && s[j] !== '"') j += s[j] === "\\" ? 2 : 1;
      out += stash(s.slice(i + 1, Math.min(j, n)));
      i = j >= n ? n : j + 1;
      continue;
    }
    if (c === "<" && s[i + 1] === "<" && s[i + 2] === "<") { // here-string: the word after <<< is the program's input
      let j = i + 3;
      while (j < n && (s[j] === " " || s[j] === "\t")) j++;
      let content = "";
      if (s[j] === "'") {
        const e = s.indexOf("'", j + 1);
        content = s.slice(j + 1, e === -1 ? n : e);
        j = e === -1 ? n : e + 1;
      } else if (s[j] === '"') {
        let e = j + 1;
        while (e < n && s[e] !== '"') e += s[e] === "\\" ? 2 : 1;
        content = s.slice(j + 1, Math.min(e, n));
        j = e >= n ? n : e + 1;
      } else {
        const m = /^[^\s;&|()<>]+/.exec(s.slice(j));
        content = m ? m[0] : "";
        j += content.length;
      }
      bodies.push({ owner: ownerOf(out), content });
      out += "<<< ";
      i = j;
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
      if (delim) pending.push({ delim, dash, owner: ownerOf(out) });
      out += "<< ";
      i = j;
      continue;
    }
    if (c === "\n") {
      out += "\n";
      i++;
      while (pending.length) { // the heredoc bodies start on the next line
        const { delim, dash, owner } = pending.shift();
        let body = "";
        while (i < n) {
          let e = s.indexOf("\n", i);
          if (e === -1) e = n;
          const line = s.slice(i, e);
          i = Math.min(e + 1, n);
          const cmp = dash ? line.replace(/^\t+/, "") : line;
          if (cmp === delim || cmp.replace(/\r$/, "") === delim) break;
          body += `${line}\n`;
        }
        bodies.push({ owner, content: body });
      }
      continue;
    }
    out += c;
    i++;
  }
  return { text: out, quoted, bodies };
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
  const { text, quoted, bodies } = scanArgv(cmd);
  const found = [];
  const kindOf = (prog) => (SHELL_INTERPRETERS.has(prog) ? "shell" : CODE_INTERPRETERS.has(prog) ? "code" : null);
  for (const segment of text.split(SEGMENT_SPLIT)) {
    const t = segment.trim().split(/\s+/).filter(Boolean);
    const k = unwrap(t);
    if (k >= t.length) continue;
    const kind = kindOf(progName(t[k]));
    if (!kind) continue;
    for (let m = k + 1; m < t.length; m++) {
      const inline = /^(?:-[a-zA-Z]*[ce]|--command|--eval)$/.test(t[m]);
      const joined = /^--(?:command|eval)=\u0001(\d+)\u0002$/.exec(t[m]);
      const next = inline && m + 1 < t.length ? /^\u0001(\d+)\u0002$/.exec(t[m + 1]) : null;
      const hit = joined || next;
      if (hit) found.push({ kind, content: quoted[Number(hit[1])] });
    }
  }
  // A heredoc or here-string FED to an interpreter is that interpreter's script (A-PT-B14, B15). One fed to
  // cat, tee, wc and the like stays prose (the GATE-2 rule: a commit message or a note is not an operation).
  for (const b of bodies) {
    const kind = b.owner ? kindOf(b.owner) : null;
    if (kind) found.push({ kind, content: b.content });
  }
  return found;
}

// ── HONEST READ-ONLY AND SCRATCH FORMS (lane GATE-FIX-1, 2026-10-09, RULES-X-1 register S4 and X4) ──────────
// The DANGER words are matched on adjacent text, so four honest operations were asked or denied as writes:
// `git merge-tree --write-tree` (the write flag pattern matches `--write-tree`; merge-tree writes only to the
// object store), `git push --dry-run` (sends nothing), `rm -rf <scratch>` (a scratch directory is the point of
// a scratch directory), and `grep -rn truncate` / `head` / `tail` (search and output truncation read, they never
// write). A SIMPLE COMMAND (one segment between separators) that is exactly one of those forms is removed from
// the text DANGER and the structural check read; every other segment of the same line is judged as before, so
// `git merge-tree ... && node x.mjs --apply` and `node x.mjs --apply | head` still ask. Mistake-catcher for a
// cooperating session (ADR-046), not an intent barrier.
const SEGMENT_SPLIT_KEEP = /(\n|;|&&|\|\||\||&|\(|\))/;
const REDIRECT_RE = /^\d*[<>]+/;

/** Roots an `rm -r` may delete strictly under: the OS temp dir (the session scratchpad is under it) and /tmp;
 *  `fsi-app/scripts/tmp` is matched by path shape so a worktree's own copy counts. GATE_SCRATCH_ROOTS
 *  (path-delimited) adds roots from the hook process's own environment, which the gated session does not control. */
function scratchRoots(env = process.env) {
  const roots = new Set([tmpdir(), env.TMPDIR, env.TEMP, env.TMP, ...(sep === "/" ? ["/tmp"] : [])].filter(Boolean));
  for (const r of String(env.GATE_SCRATCH_ROOTS || "").split(/[;:]/).filter(Boolean)) roots.add(r);
  return [...roots].map((r) => resolve(r));
}

const foldCase = (p) => (process.platform === "win32" || process.platform === "darwin" ? p.toLowerCase() : p);
const slashed = (p) => p.split("\\").join("/");

/** The nearest existing ancestor of p resolved through links, with the rest re-appended: a junction or symlink
 *  inside a scratch root cannot carry a delete out of it. */
function realish(p) {
  let head = p;
  const tail = [];
  for (let hops = 0; hops < 64; hops++) {
    if (existsSync(head)) {
      let real = head;
      try { real = realpathSync.native(head); } catch { /* keep the unresolved path */ }
      return resolve(real, ...tail.reverse());
    }
    const up = dirname(head);
    if (up === head) break;
    tail.push(head.slice(up.length).replace(/^[\\/]+/, ""));
    head = up;
  }
  return p;
}

/** Is `path` strictly inside a scratch root? A bare token only: no variable, glob, tilde or brace. */
function underScratch(path, cwd, env) {
  if (!path || /[$*?~`{}[\]!]/.test(path)) return false;
  let p = path;
  if (process.platform === "win32") {
    const m = /^\/([A-Za-z])(\/.*)?$/.exec(p); // Git Bash drive spelling, /c/dir
    if (m) p = `${m[1].toUpperCase()}:${m[2] || "/"}`;
    else if (/^\/tmp(\/|$)/.test(p)) p = tmpdir() + p.slice(4); // Git Bash maps /tmp to the temp dir
  }
  const abs = isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p) ? resolve(p) : cwd ? resolve(cwd, p) : null;
  if (!abs) return false;
  const roots = scratchRoots(env);
  for (const candidate of [abs, realish(abs)]) { // the spelling AND where it really lands must both be inside
    const f = foldCase(slashed(candidate));
    const shape = /\/fsi-app\/scripts\/tmp\/[^/]/.test(f);
    const inRoot = roots.some((root) => {
      const r = foldCase(slashed(root)).replace(/\/+$/, "");
      const realRoot = foldCase(slashed(realish(root))).replace(/\/+$/, "");
      return f.startsWith(r + "/") || f.startsWith(realRoot + "/");
    });
    if (!shape && !inRoot) return false;
  }
  return true;
}

/** Is this one simple command (quoted strings as placeholders) an honest read-only or scratch form? */
function honestSegment(segment, quoted, cwd, env) {
  const t = segment.trim().split(/\s+/).filter(Boolean);
  const k = unwrap(t);
  if (k >= t.length) return false;
  const prog = progName(t[k]);
  const args = t.slice(k + 1);
  const literal = (tok) => { const m = /^\u0001(\d+)\u0002$/.exec(tok); return m ? quoted[Number(m[1])] : tok; };
  if (prog === "grep" || prog === "egrep" || prog === "fgrep" || prog === "head" || prog === "tail") return true;
  if (prog === "git") {
    const inv = gitInvocations(segment)[0];
    if (!inv) return false;
    if (inv.sub === "merge-tree") return true;
    if (inv.sub === "push") {
      const dry = inv.args.some((a) => a === "--dry-run" || a === "-n");
      return dry && !inv.args.some((a) => a === "--no-dry-run");
    }
    return false;
  }
  if (prog === "rm") {
    const shorts = args.filter((a) => /^-[A-Za-z]+$/.test(a)).join("");
    if (!/[rR]/.test(shorts) && !args.includes("--recursive")) return false; // plain rm is not a DANGER form
    const paths = [];
    let skipTarget = false;
    let optsDone = false;
    for (const a of args) {
      if (skipTarget) { skipTarget = false; continue; }
      if (!optsDone && a === "--") { optsDone = true; continue; }
      if (REDIRECT_RE.test(a)) { skipTarget = /^\d*[<>]+$/.test(a); continue; }
      if (!optsDone && a.startsWith("-")) continue;
      paths.push(literal(a));
    }
    return paths.length > 0 && paths.every((p) => underScratch(p, cwd, env));
  }
  return false;
}

/** The scanned command text with every honest simple command blanked out, quoted strings left as placeholders. */
function withoutHonestSegments(scan, ctx) {
  return scan.text.split(SEGMENT_SPLIT_KEEP).map((part, i) =>
    (i % 2 === 0 && part.trim() && honestSegment(part, scan.quoted, ctx.cwd, ctx.env) ? " " : part)).join("");
}

/** True when DANGER matches the command's own argv, a structural danger form is present, or DANGER matches
 *  the inline code or fed script of an interpreter it runs (depth 3). Honest read-only and scratch commands are
 *  not danger (see above). `ctx.cwd` resolves a relative `rm` path; `ctx.env` is for the tests. */
export function dangerIn(cmd, depth = 0, ctx = {}) {
  const scan = scanArgv(cmd);
  const argv = withoutHonestSegments(scan, { cwd: ctx.cwd, env: ctx.env ?? process.env }).replace(PLACEHOLDER_RE, "Q");
  if (DANGER.test(argv) || structuralDanger(argv)) return true;
  if (depth >= 3) return false;
  return interpreterPayloads(cmd).some((p) => (p.kind === "code" ? DANGER.test(p.content) : dangerIn(p.content, depth + 1, ctx)));
}

// The git invocations in an argv-only command: [{ sub, args }] for each `git [global opts] <sub> <args>`.
// Global options (-C <dir>, -c <k=v>, --no-pager, ...) and wrapper words are skipped; the program may be
// git.exe or a path to git; an alias set on the command line (`-c alias.p=push`) is resolved to its target.
function gitInvocations(argv) {
  const found = [];
  for (const segment of argv.split(SEGMENT_SPLIT)) {
    const t = segment.trim().split(/\s+/).filter(Boolean);
    let k = unwrap(t);
    if (k >= t.length || progName(t[k]) !== "git") continue;
    k++;
    const aliases = {};
    // RULES-X-2 (pair 7): the directory a `-C <dir>` global option points the command at (the last one wins), and
    // whether the repo or work tree was redirected by other means; the isolation exemption below reads both.
    let dir = null;
    let redirected = false;
    while (k < t.length && t[k].startsWith("-")) {
      if (t[k] === "-c" && k + 1 < t.length) {
        const a = /^alias\.([^=]+)=(\S+)/.exec(t[k + 1]);
        if (a) aliases[a[1].toLowerCase()] = a[2].toLowerCase();
        k += 2;
        continue;
      }
      if (t[k] === "-C" && k + 1 < t.length) dir = t[k + 1];
      else if (/^(?:--git-dir|--work-tree)(?:=|$)/.test(t[k])) redirected = true;
      k += /^(?:-C|--git-dir|--work-tree|--namespace|--exec-path)$/.test(t[k]) ? 2 : 1;
    }
    if (k >= t.length) continue;
    const written = t[k].toLowerCase();
    found.push({ sub: aliases[written] ?? written, args: t.slice(k + 1), dir, redirected });
  }
  return found;
}

// The danger forms that are decided on the command's STRUCTURE, not on adjacent words (GATE-7, register attacks
// A-PT-B1 to B8): any git push (global options between `git` and `push`, git.exe, a path, an alias), rm with
// both a recursive and a force flag in any spelling or order (-rf, -fr, -r -f, --recursive --force), and find
// with -delete or -exec rm.
function structuralDanger(argv) {
  for (const inv of gitInvocations(argv)) if (inv.sub === "push") return true;
  for (const segment of argv.split(SEGMENT_SPLIT)) {
    const t = segment.trim().split(/\s+/).filter(Boolean);
    const k = unwrap(t);
    if (k >= t.length) continue;
    const prog = progName(t[k]);
    const args = t.slice(k + 1);
    if (prog === "rm") {
      const shorts = args.filter((a) => /^-[A-Za-z]+$/.test(a)).join("");
      const longs = args.filter((a) => a.startsWith("--"));
      const recursive = /[rR]/.test(shorts) || longs.includes("--recursive");
      const force = /f/.test(shorts) || longs.includes("--force");
      if (recursive && force) return true;
    }
    if (prog === "find") {
      const exec = args.indexOf("-exec");
      if (args.includes("-delete") || (exec !== -1 && progName(args[exec + 1]) === "rm")) return true;
    }
  }
  return false;
}

/**
 * True when the command contains a git form that moves or rewrites a branch (the GIT_ISOLATION_FORMS rows).
 * Read-only forms never match. PURE. @param {string} cmd the RAW command @returns {boolean}
 */
export function isolationAsk(cmd, ctx = {}) {
  const argv = argvOnly(cmd);
  // Cheap prefilter before tokenizing: a command with no git in it asks for nothing. (It used to be RD-19's
  // single-home matcher plus push and reset; GATE-7 widened the rows to cherry-pick, pull, am, symbolic-ref and
  // the command-line alias forms, which that matcher does not name, so the rows alone decide now.)
  if (!/\bgit(?:\.exe)?\b/i.test(argv)) return false;
  for (const inv of gitInvocations(argv)) {
    const { sub, args } = inv;
    const form = GIT_ISOLATION_FORMS.find((f) => f.sub === sub);
    if (!form) continue;
    if (form.needsArgs && args.length === 0) continue;
    if (form.exceptFirstArg && form.exceptFirstArg.includes(args[0])) continue;
    if (form.exceptAnyArg && args.some((a) => form.exceptAnyArg.includes(a))) continue;
    if (form.firstArg && !form.firstArg.includes(args[0])) continue;
    if (form.anyArg && !args.some((a) => form.anyArg.includes(a))) continue;
    if (form.anyArgRe && !args.some((a) => form.anyArgRe.test(a))) continue;
    if (laneContractForm(inv, ctx, argv, cmd)) continue;
    return true;
  }
  return false;
}

// RULES-X-2 (pair 7, 2026-10-09): the lane contract's own two forms, run INSIDE a lane worktree, are not branch
// moves of the main checkout: `git worktree add ...` (a lane that makes a sibling worktree) and
// `git merge origin/master` (a lane refreshing its own branch, plain flags only). They are allowed there and still
// asked everywhere else, including the main checkout, `git -C <main checkout> ...`, a redirected --git-dir or
// --work-tree, and any command that also changes directory (the effective directory is then not the payload's).
const LANE_WORKTREE_PATH_RE = /(?:^|\/)\.(?:claude\/)?worktrees\/[^/]+(?:\/|$)/;
const PLAIN_MERGE_FLAGS = new Set(["--no-edit", "--no-ff", "--ff", "--ff-only"]);
const CD_RE = /(?:^|[\s;&|(])(?:cd|pushd|popd)\b/;

/** True when `dir` is an existing directory inside a linked worktree under .claude/worktrees/ or .worktrees/: its nearest `.git` is a FILE. */
export function isInLaneWorktree(dir) {
  if (!dir) return false;
  let p = resolve(String(dir));
  // A directory that does not exist (a `-C` target the argv scan mangled, a typo) is not provably a lane worktree.
  try { if (!statSync(p).isDirectory()) return false; } catch { return false; }
  if (!LANE_WORKTREE_PATH_RE.test(p.replaceAll(String.fromCharCode(92), "/") + "/")) return false;
  for (let i = 0; i < 64; i++) {
    try {
      return statSync(resolve(p, ".git")).isFile();
    } catch { /* no .git here, look one level up */ }
    const up = dirname(p);
    if (up === p) return false;
    p = up;
  }
  return false;
}

function laneContractForm(inv, ctx, argv, raw) {
  // A backslash anywhere in the raw command is not trusted: the argv scan unescapes it, so a Windows `-C` path would
  // reach this check mangled, and a mangled path must never resolve to a worktree.
  if (String(raw).includes(String.fromCharCode(92))) return false;
  if (!ctx.cwd || inv.redirected || CD_RE.test(argv)) return false;
  const isWorktreeAdd = inv.sub === "worktree" && inv.args[0] === "add";
  const isPlainMerge = inv.sub === "merge" && inv.args.filter((a) => !PLAIN_MERGE_FLAGS.has(a)).join(" ") === "origin/master";
  if (!isWorktreeAdd && !isPlainMerge) return false;
  return isInLaneWorktree(inv.dir ? resolve(ctx.cwd, inv.dir) : ctx.cwd);
}

/**
 * SQL with comments removed and string literals, quoted identifiers and dollar-quoted bodies replaced by empty
 * ones, in ONE pass (GATE-7, register attacks A-PT-M3 to M5). The old two-step removed comments first, so a
 * `--` inside a string literal swallowed the rest of the line and hid a second statement. PURE.
 */
export function sqlSkeleton(sql) {
  const s = String(sql ?? "");
  const n = s.length;
  let out = "";
  let i = 0;
  while (i < n) {
    const c = s[i];
    const d = s[i + 1];
    if (c === "-" && d === "-") { while (i < n && s[i] !== "\n") i++; out += " "; continue; }
    if (c === "/" && d === "*") { // block comments nest in Postgres
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (s[i] === "/" && s[i + 1] === "*") { depth++; i += 2; } else if (s[i] === "*" && s[i + 1] === "/") { depth--; i += 2; } else i++;
      }
      out += " ";
      continue;
    }
    if (c === "'" || c === '"') {
      i++;
      while (i < n) {
        if (s[i] === c) { if (s[i + 1] === c) { i += 2; continue; } break; }
        i++;
      }
      i++;
      out += c + c;
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(s.slice(i, i + 80));
      if (m) {
        const e = s.indexOf(m[0], i + m[0].length);
        i = e === -1 ? n : e + m[0].length;
        out += "''";
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

// Function-name tokens that mean a call may change state (or leave the session): a SELECT that calls one is not
// a plain read. `jsonb_set` and the like are pure and common, so this classifies as UNKNOWN (asked), not write.
const SQL_MUTATING_TOKENS = new Set([
  "delete", "update", "insert", "create", "drop", "set", "write", "apply", "archive", "reclassify", "mint",
  "terminate", "cancel", "reload", "kill", "purge", "truncate", "merge", "upsert", "reset", "acquire", "release",
  "heartbeat", "nextval", "setval", "import", "export", "copy", "dblink", "grant", "revoke",
]);

/** 'read' | 'suspect' | 'write' for a SQL string. 'read' is a single SELECT with no row lock, no INTO and no
 *  state-changing function; 'suspect' is such a SELECT that calls a function named like a mutation; every other
 *  statement shape (a second statement after `;`, a leading WITH, FOR UPDATE, SELECT INTO, DML, DDL) is 'write'. */
export function sqlReadKind(sql) {
  const t = sqlSkeleton(sql).trim();
  if (!/^select\b/i.test(t)) return "write";
  const semi = t.indexOf(";");
  if (semi !== -1 && t.slice(semi + 1).trim() !== "") return "write";
  if (/\bfor\s+(?:no\s+key\s+)?(?:update|share)\b|\bfor\s+key\s+share\b/i.test(t)) return "write";
  if (/\binto\b/i.test(t)) return "write";
  for (const m of t.matchAll(/([A-Za-z_][\w$]*)\s*\(/g)) {
    if (m[1].split("_").some((tok) => SQL_MUTATING_TOKENS.has(tok.toLowerCase()))) return "suspect";
  }
  return "read";
}

/** True when a SQL string is a single plain read statement (sqlReadKind === "read"). */
export function isSelectSql(sql) {
  return sqlReadKind(sql) === "read";
}

/** The tool name after `mcp__<server>__` (the whole name when it does not have that shape). */
export function mcpToolName(tool) {
  const m = /^mcp__.+?__(.+)$/.exec(String(tool ?? ""));
  return (m ? m[1] : String(tool ?? "")).toLowerCase();
}

function classifyName(name, input) {
  if (MCP_WRITE_NAMES.includes(name)) {
    if (MCP_SQL_TOOL_NAMES.includes(name)) {
      const kind = sqlReadKind(input?.query ?? input?.sql);
      if (kind === "read") return "read";
      if (kind === "suspect") return "unknown"; // a SELECT that calls a mutating-looking function: asked, never silently allowed
    }
    return "write";
  }
  if (MCP_WRITE_PREFIXES.some((p) => name.startsWith(p))) return "write";
  // A read prefix does not make a read when a whole token of the name is a mutating verb (GATE-7, A-PT-M1, M2:
  // get_and_delete_rows, search_and_replace).
  if (MCP_READ_PREFIXES.some((p) => name.startsWith(p)) && name.split("_").some((tok) => MCP_MUTATING_WORDS.includes(tok))) return "write";
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

/**
 * The path an edit names, made comparable (GATE-7, register attacks A-PT-E1, E4): a relative path is resolved
 * against the call's own cwd (`src/lib/agent/x.ts` from fsi-app), and an 8.3 short name (FSI-AP~1) is expanded
 * by the file system when the path exists. Dot segments, doubled separators and case are handled by the map's
 * canonPath. A path that cannot be resolved is returned as given, never dropped.
 */
export function governedPath(rawPath, cwd = "") {
  let p = String(rawPath ?? "");
  if (!p) return p;
  if (cwd && !isAbsolute(p) && !/^[A-Za-z]:[\\/]/.test(p) && !p.startsWith("/")) p = resolve(cwd, p);
  if (/~\d/.test(p)) {
    try { if (existsSync(p)) p = realpathSync.native(p); } catch { /* keep the path as given */ }
  }
  return p;
}

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
  // A resolved Skill invocation OR a whole, resolved Read of the skill's SKILL.md counts as looked at (GATE-FIX-1).
  const missing = missingFromTranscript(t, skills);
  if (missing.length) {
    const unsatisfiable = missing.filter((s) => skillUnresolvableInTranscript(t, s));
    if (unsatisfiable.length === missing.length) {
      return decision("allow", "", denyTag + "-skillunresolvable", missing.join(","));
    }
    const readPaths = missing.map((s) => `fsi-app/.claude/skills/${s}/SKILL.md`).join(", ");
    return decision("deny",
      `BLOCKED: this write cannot proceed until its governing skill(s) are looked at this session. ` +
      `Missing: ${missing.join(", ")}. Read ${readPaths} in full (no offset or limit; the harness may serve a stale ` +
      `registry copy through the Skill tool, the file on disk is current), or invoke Skill: ${missing[0]}, which is ` +
      `LOADED this session via the Skill tool. Either counts equally; THEN retry. ${contextMsg}`,
      denyTag + "-skillmissing");
  }
  return onLoaded();
}

/**
 * The shell invocations that run a SCRIPT FILE through a shell interpreter (`bash run.sh`, `sh ./x.sh`, `zsh x`):
 * the form a session reaches by habit once the gate has denied the inline command, because the gate reads the
 * command line and not the file. It is not blocked (an interpreter fed through a file is out of the gate's
 * scope, ADR-046 addendum); it is COUNTED, as a firing note. PURE. @param {string} cmd @returns {boolean}
 */
export function scriptFileRun(cmd) {
  const text = scanArgv(cmd).text;
  for (const segment of text.split(SEGMENT_SPLIT)) {
    const t = segment.trim().split(/\s+/).filter(Boolean);
    const k = unwrap(t);
    if (k >= t.length || !SHELL_INTERPRETERS.has(progName(t[k]))) continue;
    const rest = t.slice(k + 1);
    if (rest.some((a) => /^-[a-zA-Z]*[ce]$/.test(a) || a.startsWith("--command"))) continue; // inline code, analysed elsewhere
    if (rest.some((a) => !a.startsWith("-") && !a.startsWith("\u0001") && !a.startsWith("<"))) return true;
  }
  return false;
}

/**
 * The gate's decision for one parsed PreToolUse payload. PURE apart from reading the transcript file.
 * A shell-tool call that runs a script file through a shell interpreter carries `notes: ["script-file"]`.
 * @param {object} payload @returns {{permissionDecision: string, reason: string, tag: string, detail: string, notes?: string[]}}
 */
export function evaluateGate(payload) {
  const d = evaluateCore(payload);
  const tool = payload?.tool_name || "";
  if (SHELL_TOOLS.includes(tool)) {
    const cmd = payload?.tool_input?.command || payload?.tool_input?.script || "";
    if (scriptFileRun(cmd)) d.notes = [...(d.notes || []), "script-file"];
  }
  return d;
}

function evaluateCore(payload) {
  const tool = payload?.tool_name || "";
  const input = payload?.tool_input || {};
  // agent_id is present ONLY when this call happens inside a sub-agent (Claude Code hooks reference,
  // "Common Input Fields"). When present, the payload's own transcript_path still names the PARENT
  // session's file, not this sub-agent's own; see agent-transcript.mjs for the evidence and derivation.
  const transcriptPath = resolveActingTranscriptPath(payload?.transcript_path || "", payload?.agent_id || "");

  // ── Bash: data-writes / destructive / scaled runs. Write signal = --apply/--execute/--write flag +
  // inherently-destructive ops + named runners, found in the command's own argv. Read-only / dry-run pass. ──
  if (SHELL_TOOLS.includes(tool)) {
    const cmd = input.command || input.script || "";
    // ── WORKTREE-ISOLATION belt (RD-19), the BELT to the git post-checkout hook's SUSPENDERS. ──
    // A branch-moving git op must happen in the agent's assigned worktree, never in the main checkout.
    // PreToolUse DOES fire inside sub-agents too (corrected 2026-09-19); this leg still cannot read the
    // eventual cwd from the payload, so it ASKs for the branch-moving forms only (isolationAsk), and the
    // git post-checkout hook (fires regardless of session type) remains the SUSPENDERS.
    if (isolationAsk(cmd, { cwd: payload?.cwd || "" })) {
      return decision("ask",
        `GIT BRANCH-MOVING op (checkout <ref>, switch, rebase, merge, worktree add, reset --hard, branch -d/-D, push --force). ` +
        `WORKTREE-ISOLATION doctrine (RD-19): ${DOCTRINE} ` +
        `Confirm this runs in the assigned worktree (under .claude/worktrees/), NOT the main checkout. ` +
        `(Belt: this session-scoped gate catches the orchestrator's own ops; the git post-checkout + ` +
        `pre-commit hooks catch a sub-agent's; approve only if this honors worktree isolation.)`,
        "worktree-isolation");
    }
    if (!dangerIn(cmd, 0, { cwd: payload?.cwd || "" })) return decision("allow", "", "bash-read");
    const skills = skillsForOp(cmd).map((s) => s.skill);
    const required = skills.length ? skills : ["remediation-discipline", "environmental-policy-and-innovation"];
    return gateWrite(transcriptPath, required, "bash-write", "Data write (prod effect).", () => decision("ask",
      `DATA-WRITE / destructive op. GOVERNING SKILL(S) loaded: ${required.join(", ")}. Approach MUST follow them: ` +
      `classify-before-delete; omit-with-note: NEVER delete/null real content for a gap; verify-before-completion ` +
      `(dry-run + paginated read-back). Approve only if skill-grounded.`, "bash-write-ok"));
  }

  // ── Edit / Write / MultiEdit / NotebookEdit: governed-file edits require the governing skill loaded. ──
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
    const path = governedPath(input.file_path || input.notebook_path || "", payload?.cwd || "");
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
  if (DISPATCH_TOOLS.includes(tool)) {
    const refused = dispositionRefusal(tool, input);
    if (refused) return refused;
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
  // ── Worktree tools (EnterWorktree / ExitWorktree): they create, enter or remove a worktree, i.e. they move
  // the session's working directory and branch, the RD-19 class. Always asked, with the doctrine. ──
  if (WORKTREE_TOOLS.includes(tool)) {
    return decision("ask",
      `WORKTREE op (${tool}): creates, enters or removes a worktree. WORKTREE-ISOLATION doctrine (RD-19): ${DOCTRINE} ` +
      `Confirm this is the assigned worktree under .claude/worktrees/, never the main checkout, and that nothing in it is unsaved ` +
      `before it is removed.`,
      "worktree-tool");
  }

  // ── Tools with several actions (ArtifactData, Artifact): the ACTION decides. A read action allows; a write
  // action (set/update/delete/batch on stored data, publish/delete/pin on a page) is a write effect and is
  // skill-gated as an MCP write is. A missing action is a write for a tool that writes by default. ──
  if (Object.prototype.hasOwnProperty.call(ACTION_TOOLS, tool)) {
    const spec = ACTION_TOOLS[tool];
    const action = String(input.action ?? "").toLowerCase();
    const isRead = action ? spec.readActions.includes(action) : !spec.defaultWrite;
    if (isRead) return decision("allow", "", "action-tool-read");
    return gateWrite(transcriptPath, ["caros-ledge-platform-intent", "remediation-discipline"], "action-tool-write",
      `${tool} ${action || "(default action)"}: a stored-data or published-page write that bypasses Bash and git.`,
      () => decision("ask",
        `${tool} WRITE (${action || "default action"}). Governing skills loaded. This write must still be reviewed ` +
        `(no surface or scope drift; integrity rule). Approve only if skill-grounded.`, "action-tool-write-ok"));
  }

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
    const path = auditLogPath();
    if (!path) return;
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${new Date().toISOString()}\t${tool || "?"}\t${d.permissionDecision}\t${d.tag}${d.detail ? `\t${d.detail}` : ""}\n`);
  } catch { /* never block on logging */ }
}

// FIRING LOG (GATE-7, ADR-046 point 6): every refusal the gate makes (a deny, an ask, a failed-closed ask) is one
// line in the shared firing log (lib/firing-log.mjs), so FIRED-TRUE can count it. An intent form a session
// reaches by habit (running a script file because the inline form was denied) is recorded as a NOTE, not a
// refusal: the gate does not stop it, it counts it. Tool name and tag only, never the command.
function logFiring(tool, d) {
  const entries = [];
  if (d.permissionDecision !== "allow") entries.push({ rule: `pretooluse:${d.tag}`, mode: "pretooluse", path: null, line: tool || "?", verdict: d.permissionDecision });
  for (const note of d.notes || []) entries.push({ rule: `pretooluse:${note}`, mode: "pretooluse", path: null, line: tool || "?", verdict: "note" });
  appendFirings(entries);
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
  logFiring(tool, d);
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
