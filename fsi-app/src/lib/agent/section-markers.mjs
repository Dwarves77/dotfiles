// section-markers.mjs (lane GATES-2, 2026-10-05): the ONE definition of "an internal marker that must never
// reach a customer or a stored section body". Pure, dependency-free, node builtins only.
//
// WHY. The agent emits a Claim Provenance Ledger between sentinels (parse-output.ts) and the parser strips
// it before the body is stored. When the closing sentinel is missing or malformed the strip silently does
// not happen, the ledger rides into `full_brief`, and a customer reads raw JSON on a Market item
// (production, 2026-10-05). No check saw it: the write path trusted the parser, and the rendering guard
// mounts fixtures, never stored data. This module is the shared definition three callers use, so the
// write path, the stored-data audit and the live smoke gate can never disagree about what a marker is:
//   1. src/lib/agent/canonical-pipeline.ts writeSynthesizedBrief  refuses to persist a body carrying one;
//   2. scripts/verify/section-marker-audit.mjs                    counts stored bodies that already carry one;
//   3. .discipline/rendering/live/live-assertions.mjs              fails a live page whose text carries one.

/** Longest JSON object literal that may appear in prose before it counts as a leaked payload. */
export const JSON_LITERAL_MAX_PROSE_CHARS = 40;

/**
 * The marker pattern list. One exported constant; every caller reads it, none keeps a copy.
 * `kind: "json"` is handled by a bracket-matching scan instead of a regex because a nested object
 * cannot be matched by a regex.
 */
export const INTERNAL_MARKER_PATTERNS = Object.freeze([
  Object.freeze({ id: "sentinel-open", kind: "regex", re: /<<</g, describe: "an agent sentinel opener (<<<)" }),
  Object.freeze({ id: "claim-ledger", kind: "regex", re: /CLAIM_PROVENANCE_LEDGER/g, describe: "the claim provenance ledger name" }),
  Object.freeze({ id: "provenance-token", kind: "regex", re: /_PROVENANCE/g, describe: "an internal *_PROVENANCE token" }),
  Object.freeze({
    id: "json-object-literal",
    kind: "json",
    describe: `a JSON object literal longer than ${JSON_LITERAL_MAX_PROSE_CHARS} characters`,
  }),
]);

const EXCERPT_CHARS = 80;
const JSON_SCAN_LIMIT = 6000;
const JSON_OPEN = /\{\s*"[^"\n]{1,80}"\s*:/g;

/** Bracket-match one object literal starting at `start` (a `{`). Returns its end index (exclusive) or -1.
 *  String-aware so a brace inside a quoted value does not end the literal early. */
function matchObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  const stop = Math.min(text.length, start + JSON_SCAN_LIMIT);
  for (let i = start; i < stop; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Every internal marker in `text`.
 * @param {unknown} text
 * @returns {{id: string, excerpt: string}[]} empty when clean; a non-string is clean (nothing to leak).
 */
export function findInternalMarkers(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  const hits = [];
  for (const p of INTERNAL_MARKER_PATTERNS) {
    if (p.kind === "regex") {
      p.re.lastIndex = 0;
      const m = p.re.exec(text);
      p.re.lastIndex = 0;
      if (m) hits.push({ id: p.id, excerpt: text.slice(Math.max(0, m.index - 10), m.index + EXCERPT_CHARS).replace(/\s+/g, " ") });
      continue;
    }
    JSON_OPEN.lastIndex = 0;
    let open;
    while ((open = JSON_OPEN.exec(text)) !== null) {
      const end = matchObjectEnd(text, open.index);
      if (end !== -1 && end - open.index > JSON_LITERAL_MAX_PROSE_CHARS) {
        hits.push({ id: p.id, excerpt: text.slice(open.index, open.index + EXCERPT_CHARS).replace(/\s+/g, " ") });
        break;
      }
    }
    JSON_OPEN.lastIndex = 0;
  }
  return hits;
}

/** One line naming every marker found, for a refusal message or a log line. */
export function describeMarkers(hits) {
  return hits.map((h) => `${h.id} "${h.excerpt}"`).join("; ");
}
