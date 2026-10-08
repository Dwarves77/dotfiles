// C5: the ACTIVE phase declared in the governing program doc re-grounds against the actual code.
//
// THE PLAN-LAYER SILENT-ROT GUARD (remediation-discipline, invariant RG-1). Every phase changes code
// a later phase's plan was written against. Relying on "re-read the code before each phase" is the
// honor-system discipline this whole effort proved fails. This check forces it: it reads ACTIVE_PHASE
// from docs/program/GOVERNING-PROGRAM.md, finds that phase's ```anchors block, and asserts each
// declared substring is still present/absent in the real file. A prior phase that invalidated a later
// phase's stated code-dependency fails the build here, naming exactly what drifted — so no phase
// executes on a stale plan. Same shape as C3/C4 ("the artifact matches reality"); runs in pre-push
// step 2 + CI. Anchor grammar (one per line inside the fence):
//   present :: <repo-relative-file> :: <verbatim substring>   (substring MUST exist)
//   absent  :: <repo-relative-file> :: <verbatim substring>   (substring MUST NOT exist)
//
// Lane GATE-8 (2026-10-08, AUD-AT-4 B7-38, B7-39):
//   - An anchor is matched against CODE, not against prose. For a JavaScript or TypeScript file the comments are
//     blanked first, and for a migration the SQL comments are, so an anchor kept alive only in a trailing comment
//     while the anchored identifier is gone no longer passes (and an `absent` anchor is not tripped by a comment).
//   - `ACTIVE_PHASE: none` is a value, and it is validated. It no longer silences everything:
//       (1) the anchors of every phase the doc marks DONE or LANDING are still checked (a finished phase's code
//           dependencies must not rot), and
//       (2) flipping the active phase to none requires the phase being deactivated to be marked DONE or LANDING in
//           the doc: a phase cannot be switched off while its anchors fail by changing one line.
//     Between phases, with every finished phase's anchors intact, `none` stays a no-op.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { drift, DRIFT_KIND, NO_DRIFT } from '../lib/drift.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { codeAndStrings } from '../../governance/source-lexer.mjs';
import { maskSql } from '../../fitness/lib/sql-mask.mjs';
import { resolveRange, gitFileAtBase } from '../../lib/change-range.mjs';

const PROGRAM_DOC = 'fsi-app/docs/program/GOVERNING-PROGRAM.md';
const DONE_MARKER_RE = /✅\s*(?:DONE|LANDING)/;

/** The text an anchor is matched against: code, not comments (SQL and JavaScript or TypeScript), raw otherwise. */
export function anchorView(file, content) {
  if (/\.sql$/i.test(file)) return maskSql(content);
  if (/\.(?:mjs|cjs|js|jsx|ts|tsx)$/i.test(file)) return codeAndStrings(content);
  return content;
}

export const consistencyCheck = {
  id: 'C5',
  name: 'program-anchors reality',
  description:
    'The ACTIVE phase in docs/program/GOVERNING-PROGRAM.md declares code-dependency anchors that still match the actual code (present/absent) — forcing plan-vs-code re-grounding before a phase executes.',
  source: 'remediation-discipline — Plan re-grounding mechanism (invariant RG-1)',

  run() {
    const root = getRepoRoot();
    const docAbs = join(root, PROGRAM_DOC);
    if (!existsSync(docAbs)) {
      return [drift(
        DRIFT_KIND.ORPHAN_CLAIM,
        `Governing program doc missing at ${PROGRAM_DOC}; plan re-grounding cannot run.`,
        PROGRAM_DOC,
      )];
    }
    const doc = readFileSync(docAbs, 'utf-8');

    const m = doc.match(/^ACTIVE_PHASE:\s*([A-Za-z0-9_-]+)\s*$/m);
    if (!m) {
      return [drift(
        DRIFT_KIND.MALFORMED,
        `Governing program doc has no parseable "ACTIVE_PHASE: <id>" line.`,
        PROGRAM_DOC,
      )];
    }
    const active = m[1];
    if (active === 'none') return checkBetweenPhases(root, doc);

    const anchors = extractActiveAnchors(doc, active);
    if (anchors === null) {
      return [drift(
        DRIFT_KIND.MALFORMED,
        `ACTIVE_PHASE is "${active}" but no \`\`\`anchors block was found under its heading in ${PROGRAM_DOC}.`,
        PROGRAM_DOC,
      )];
    }
    if (anchors.length === 0) {
      return [drift(
        DRIFT_KIND.MALFORMED,
        `ACTIVE_PHASE "${active}" has an anchors block with no parseable "present|absent :: file :: substring" lines.`,
        PROGRAM_DOC,
      )];
    }

    const drifts = checkAnchors(root, active, anchors);
    return drifts.length === 0 ? NO_DRIFT : drifts;
  },
};

/** Evaluate anchors against the real files. Returns drift records. */
function checkAnchors(root, label, anchors) {
  const drifts = [];
  for (const a of anchors) {
    const fileAbs = join(root, a.file);
    if (!existsSync(fileAbs)) {
      drifts.push(drift(
        DRIFT_KIND.REFERENCE_DEAD,
        `[phase ${label}] re-ground anchor references ${a.file}, which does not exist. Correct the phase plan.`,
        a.file,
      ));
      continue;
    }
    const content = anchorView(a.file, readFileSync(fileAbs, 'utf-8'));
    const has = content.includes(a.substr);
    if (a.kind === 'present' && !has) {
      drifts.push(drift(
        DRIFT_KIND.STALE_STATUS,
        `[phase ${label}] PLAN-vs-CODE DRIFT: expected substring PRESENT in ${a.file} but it is GONE, "${a.substr}". Re-read the code and re-ground the phase plan before executing.`,
        a.file,
      ));
    } else if (a.kind === 'absent' && has) {
      drifts.push(drift(
        DRIFT_KIND.STALE_STATUS,
        `[phase ${label}] PLAN-vs-CODE DRIFT: expected substring ABSENT from ${a.file} but it is PRESENT, "${a.substr}". Re-read the code and re-ground the phase plan before executing.`,
        a.file,
      ));
    }
  }
  return drifts;
}

/** `ACTIVE_PHASE: none`, validated (see the header). */
function checkBetweenPhases(root, doc) {
  const drifts = [];
  // (1) the anchors of every finished phase still hold
  for (const section of finishedPhaseSections(doc)) {
    drifts.push(...checkAnchors(root, section.heading, parseAnchorLines(section.text)));
  }
  // (2) the phase being switched off must be marked finished
  const range = resolveRange({ cwd: root });
  if (range.source !== 'unavailable') {
    const message = flippedToNoneWithoutFinishing(gitFileAtBase(range.base, PROGRAM_DOC, { cwd: root }), doc);
    if (message) drifts.push(drift(DRIFT_KIND.STALE_STATUS, message, PROGRAM_DOC));
  }
  return drifts.length === 0 ? NO_DRIFT : drifts;
}

/**
 * Pure: the message when `baseDoc` had a phase active and `headDoc` sets none while that phase is not marked DONE or
 * LANDING in `headDoc`; null otherwise (no base, base was none, or the phase is finished). Exported for the test.
 */
export function flippedToNoneWithoutFinishing(baseDoc, headDoc) {
  const prior = baseDoc ? baseDoc.match(/^ACTIVE_PHASE:\s*([A-Za-z0-9_-]+)\s*$/m) : null;
  const now = headDoc ? headDoc.match(/^ACTIVE_PHASE:\s*([A-Za-z0-9_-]+)\s*$/m) : null;
  if (!prior || prior[1] === 'none' || !now || now[1] !== 'none') return null;
  const section = phaseSection(headDoc, prior[1]);
  if (section !== null && DONE_MARKER_RE.test(section.headingLine)) return null;
  return `ACTIVE_PHASE was "${prior[1]}" on the merge-base and is now "none", but phase "${prior[1]}" is not marked DONE or LANDING in ${PROGRAM_DOC}. A phase is switched off by finishing it, not by changing the active line: mark it done, or restore ACTIVE_PHASE.`;
}

/** The section (heading line, level, text) of the heading that contains `id`, or null. */
function phaseSection(doc, id) {
  const lines = doc.split(/\r?\n/);
  let start = -1;
  let headingLevel = 2;
  for (let i = 0; i < lines.length; i++) {
    const hm = lines[i].match(/^(#{1,6})\s/);
    if (hm && lines[i].includes(id)) { start = i; headingLevel = hm[1].length; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const hm = lines[i].match(/^(#{1,6})\s/);
    if (hm && hm[1].length <= headingLevel) { end = i; break; }
  }
  return { headingLine: lines[start], heading: lines[start].replace(/^#+\s*/, '').split(/\s+[^\w\s]\s+/)[0].trim(), text: lines.slice(start, end).join('\n') };
}

/** Every section whose heading is marked DONE or LANDING, as { heading, text }. */
function finishedPhaseSections(doc) {
  const lines = doc.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const hm = lines[i].match(/^(#{1,6})\s/);
    if (!hm || !DONE_MARKER_RE.test(lines[i])) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const nm = lines[j].match(/^(#{1,6})\s/);
      if (nm && nm[1].length <= hm[1].length) { end = j; break; }
    }
    out.push({ heading: lines[i].replace(/^#+\s*/, '').split(/\s+[^\w\s]\s+/)[0].trim(), text: lines.slice(i, end).join('\n') });
  }
  return out;
}

function parseAnchorLines(sectionText) {
  const fence = sectionText.match(/```anchors\s*\r?\n([\s\S]*?)```/);
  if (!fence) return [];
  const anchors = [];
  for (const raw of fence[1].split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    const parts = line.split('::');
    if (parts.length < 3) continue;
    const kind = parts[0].trim();
    const file = parts[1].trim();
    const substr = parts.slice(2).join('::').trim();
    if ((kind === 'present' || kind === 'absent') && file && substr) {
      anchors.push({ kind, file, substr });
    }
  }
  return anchors;
}

// Find the fenced ```anchors block under the heading whose text contains the active phase id.
// Scans from that heading to the next heading of the same-or-higher level (so sub-headings stay in).
function extractActiveAnchors(doc, active) {
  const section = phaseSection(doc, active);
  if (section === null) return null;
  if (!/```anchors\s*\r?\n([\s\S]*?)```/.test(section.text)) return null;
  return parseAnchorLines(section.text);
}
