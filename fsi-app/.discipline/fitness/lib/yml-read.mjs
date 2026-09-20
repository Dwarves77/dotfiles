// Shared workflow-yml reading helpers. Extracted from F50-loop-wiring.mjs (lane F52, 2026-09-20, brief
// item 1: "reuse the yml reader F50 already uses ... extract what you need into ONE shared helper both
// import rather than a copy") so F50 and F52 read the same GitHub Actions workflow text the same way
// instead of carrying two copies of the same regex.
//
// No YAML parser is a direct dependency of this repository (js-yaml is present only as a transitive
// sub-dependency of something else, per package-lock.json). This module reads `.github/workflows/*.yml`
// with a documented, line-based text scan rather than a real parser, the same posture
// secrets-reference-audit.mjs and F50 already used. It handles the inline-array form every workflow file
// in this repo actually uses today (`workflows: ["A", "B"]`) and a multi-line `- "A"` block list as a
// documented bonus, but is not a general YAML parser: a `workflow_run:` block written in some other valid
// YAML shape (a flow-mapping list without quotes, a folded scalar) would not be found, and a `name:`
// written as a folded/block scalar would not be found either.

/**
 * Find the `workflow_run:` trigger block's `workflows:` list and return the quoted strings in it, in
 * order. Returns [] when a `workflow_run:` block exists but names no workflows (malformed but not this
 * gate's business to reject); returns null when there is no `workflow_run:` trigger at all.
 * @param {string} ymlText
 * @returns {string[] | null}
 */
export function extractWorkflowRunNames(ymlText) {
  const wrMatch = ymlText.match(/^\s*workflow_run:\s*$/m);
  if (!wrMatch) return null;
  const rest = ymlText.slice(ymlText.indexOf(wrMatch[0]) + wrMatch[0].length);
  const workflowsMatch = rest.match(/\bworkflows:\s*(\[[^\]]*\]|(?:\r?\n\s*-\s*.+)+)/);
  if (!workflowsMatch) return [];
  const names = [];
  const strRe = /["']([^"']+)["']/g;
  let m;
  while ((m = strRe.exec(workflowsMatch[1]))) names.push(m[1]);
  return names;
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
