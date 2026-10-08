// Shared workflow-yml reading helpers. Extracted from F50-loop-wiring.mjs (lane F52, 2026-09-20, brief
// item 1: "reuse the yml reader F50 already uses ... extract what you need into ONE shared helper both
// import rather than a copy") so F50 and F52 read the same GitHub Actions workflow text the same way
// instead of carrying two copies of the same regex.
//
// No YAML parser is a direct dependency of this repository (js-yaml is present only as a transitive
// sub-dependency of something else, per package-lock.json). This module reads `.github/workflows/*.yml`
// with a documented, line-based structural scan rather than a real parser, the same posture
// secrets-reference-audit.mjs and F50 already used.
//
// Lane GATE-8 (2026-10-08, AUD-AT-4 B6-27, B6-46, B7-02): the trigger reader used to be a regex over the whole file
// text, which found a `workflow_run:` line wherever it appeared (a `run: |` heredoc that spells one, a comment) and
// missed a trigger written in a form other than a block mapping. It now reads ONLY the top-level `on:` key and
// understands its three shapes:
//   scalar         on: workflow_dispatch
//   flow           on: [push, workflow_dispatch]    or    on: { workflow_dispatch: {}, workflow_run: { workflows: [A] } }
//   block mapping  on:\n  workflow_dispatch:\n  workflow_run:\n    workflows: [A]     (and a block list of names)
// A `workflow_run` mentioned anywhere else in the file (a job step, a heredoc, a comment) is not a trigger.

/** One line with a YAML comment removed (a hash that follows whitespace, outside quotes). */
function stripYamlComment(line) {
  let out = '';
  let q = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = ''; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) break;
    out += ch;
  }
  return out.replace(/\s+$/, '');
}

const unquote = (s) => String(s).trim().replace(/^["']|["']$/g, '');
const indentOf = (line) => line.match(/^ */)[0].length;
const quotedOrBare = (text) => {
  const names = [];
  const strRe = /"([^"]+)"|'([^']+)'|([^\s,[\]{}"'][^,[\]{}"']*)/g;
  let m;
  while ((m = strRe.exec(text))) names.push((m[1] ?? m[2] ?? m[3]).trim());
  return names.filter(Boolean);
};

/** Flow text (`[a, b]` or `{ k: v }`) starting at lines[i] after `prefix`, joined across lines until balanced. */
function collectFlow(lines, i, first) {
  let text = first;
  let depth = 0;
  const count = (s) => { for (const ch of s) { if (ch === '[' || ch === '{') depth++; else if (ch === ']' || ch === '}') depth--; } };
  count(text);
  let k = i;
  while (depth > 0 && k + 1 < lines.length) { k++; text += ' ' + lines[k].trim(); count(lines[k]); }
  return { text, last: k };
}

/**
 * The triggers declared by the top-level `on:` key. @param {string} ymlText
 * @returns {{ triggers: Set<string>, workflowRun: null | { workflows: string[] } }}
 */
export function readWorkflowTriggers(ymlText) {
  const lines = String(ymlText).split(/\r?\n/).map(stripYamlComment);
  const triggers = new Set();
  let workflowRun = null;
  let at = -1;
  let rest = '';
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:on|"on"|'on'|true):\s*(.*)$/.exec(lines[i]);
    if (m) { at = i; rest = m[1].trim(); break; }
  }
  if (at < 0) return { triggers, workflowRun };

  const fromFlowMap = (text) => {
    // top-level keys of { a: ..., b: {...} }
    const inner = text.trim().replace(/^\{/, '').replace(/\}$/, '');
    let depth = 0;
    let cur = '';
    const parts = [];
    for (const ch of inner) {
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    for (const part of parts) {
      const km = /^\s*["']?([A-Za-z_][\w-]*)["']?\s*(?::\s*([\s\S]*))?$/.exec(part);
      if (!km) continue;
      triggers.add(km[1]);
      if (km[1] === 'workflow_run') {
        const wm = /workflows\s*:\s*(\[[^\]]*\])/.exec(km[2] || '');
        workflowRun = { workflows: wm ? quotedOrBare(wm[1].slice(1, -1)) : [] };
      }
    }
  };

  if (rest.startsWith('[')) {
    const { text } = collectFlow(lines, at, rest);
    for (const n of quotedOrBare(text.replace(/^\[/, '').replace(/\]$/, ''))) triggers.add(n);
    if (triggers.has('workflow_run')) workflowRun = { workflows: [] };
    return { triggers, workflowRun };
  }
  if (rest.startsWith('{')) {
    fromFlowMap(collectFlow(lines, at, rest).text);
    return { triggers, workflowRun };
  }
  if (rest) {
    triggers.add(unquote(rest));
    if (unquote(rest) === 'workflow_run') workflowRun = { workflows: [] };
    return { triggers, workflowRun };
  }

  // block form: the lines indented under `on:` up to the next top-level key
  const block = [];
  for (let i = at + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') { block.push(lines[i]); continue; }
    if (indentOf(lines[i]) === 0) break;
    block.push(lines[i]);
  }
  const first = block.find((l) => l.trim() !== '');
  if (!first) return { triggers, workflowRun };
  const base = indentOf(first);
  if (first.trim().startsWith('- ')) {
    for (const l of block) if (indentOf(l) === base && l.trim().startsWith('- ')) triggers.add(unquote(l.trim().slice(2)));
    if (triggers.has('workflow_run')) workflowRun = { workflows: [] };
    return { triggers, workflowRun };
  }
  for (let i = 0; i < block.length; i++) {
    const l = block[i];
    if (l.trim() === '' || indentOf(l) !== base) continue;
    const km = /^\s*["']?([A-Za-z_][\w-]*)["']?\s*:\s*(.*)$/.exec(l);
    if (!km) continue;
    triggers.add(km[1]);
    if (km[1] !== 'workflow_run') continue;
    const sub = [];
    for (let j = i + 1; j < block.length; j++) {
      if (block[j].trim() === '') { sub.push(block[j]); continue; }
      if (indentOf(block[j]) <= base) break;
      sub.push(block[j]);
    }
    const names = [];
    if (km[2].trim().startsWith('{')) {
      const wm = /workflows\s*:\s*(\[[^\]]*\])/.exec(km[2]);
      if (wm) names.push(...quotedOrBare(wm[1].slice(1, -1)));
    } else {
      for (let j = 0; j < sub.length; j++) {
        const wk = /^\s*workflows\s*:\s*(.*)$/.exec(sub[j]);
        if (!wk) continue;
        const wIndent = indentOf(sub[j]);
        if (wk[1].trim().startsWith('[')) {
          names.push(...quotedOrBare(collectFlow(sub, j, wk[1].trim()).text.replace(/^\[/, '').replace(/\]$/, '')));
        } else if (wk[1].trim() === '') {
          for (let k = j + 1; k < sub.length; k++) {
            if (sub[k].trim() === '') continue;
            if (indentOf(sub[k]) <= wIndent) break;
            const item = /^\s*-\s*(.+)$/.exec(sub[k]);
            if (item) names.push(unquote(item[1]));
          }
        }
        break;
      }
    }
    workflowRun = { workflows: names };
  }
  return { triggers, workflowRun };
}

/**
 * Find the `workflow_run:` trigger's `workflows:` list and return the names in it, in order. Returns [] when a
 * `workflow_run` trigger exists but names no workflows (malformed but not this gate's business to reject); returns
 * null when there is no `workflow_run` trigger in the `on:` block at all.
 * @param {string} ymlText
 * @returns {string[] | null}
 */
export function extractWorkflowRunNames(ymlText) {
  const { workflowRun } = readWorkflowTriggers(ymlText);
  return workflowRun ? workflowRun.workflows : null;
}

/**
 * @param {string} ymlText
 * @param {string} producerName
 * @returns {boolean}
 */
export function hasWorkflowRunEdge(ymlText, producerName) {
  const names = extractWorkflowRunNames(ymlText);
  return Array.isArray(names) && names.includes(producerName);
}

/** True when the `on:` block declares the trigger, in any of the three forms. @param {string} ymlText @param {string} trigger */
export function hasWorkflowTrigger(ymlText, trigger) {
  return readWorkflowTriggers(ymlText).triggers.has(trigger);
}

/**
 * Read a workflow file's own top-level `name:` field (repo convention: always at column 0, a single
 * line, plain or quoted scalar). Returns null when no top-level `name:` line is found.
 * @param {string} ymlText
 * @returns {string | null}
 */
export function extractWorkflowName(ymlText) {
  const m = ymlText.match(/^name:\s*(.+?)\s*$/m);
  if (!m) return null;
  return m[1].replace(/^["']|["']$/g, '');
}

/**
 * The text of a workflow file that can INVOKE something. Lane GATE-8 (2026-10-08, AUD-AT-4 B4-17, B4-18, B7-21):
 * a YAML comment line, a trailing YAML comment, and a line that only echoes or prints a string are not
 * invocations, so a script or a test path named there is not run, wired or a dispatch root. A bare path mention in a
 * step name, an `args=` string or a `run:` command still counts (B1's own grep method).
 */
export function workflowInvocationText(text) {
  return String(text).split(/\r?\n/).map((line) => {
    const code = stripYamlComment(line);
    const body = code.replace(/^\s*(?:-\s*)?(?:run:\s*)?(?:[|>][-+]?\s*)?/, '').trim();
    return /^(?:echo|printf)\b/.test(body) ? '' : code;
  }).join('\n');
}

/** A package.json script command with its echo and printf segments removed (`a && echo scripts/x.mjs`). */
export function packageCommandInvocationText(cmd) {
  return String(cmd).split(/&&|\|\||;|\|/).filter((seg) => !/^\s*(?:echo|printf)\b/.test(seg)).join(' && ');
}
