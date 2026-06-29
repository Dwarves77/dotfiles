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
// ACTIVE_PHASE: none  → no-op (between phases). Only the active phase's anchors are checked.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { drift, DRIFT_KIND, NO_DRIFT } from '../lib/drift.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

const PROGRAM_DOC = 'fsi-app/docs/program/GOVERNING-PROGRAM.md';

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
    if (active === 'none') return NO_DRIFT;

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

    const drifts = [];
    for (const a of anchors) {
      const fileAbs = join(root, a.file);
      if (!existsSync(fileAbs)) {
        drifts.push(drift(
          DRIFT_KIND.REFERENCE_DEAD,
          `[phase ${active}] re-ground anchor references ${a.file}, which does not exist. Correct the phase plan.`,
          a.file,
        ));
        continue;
      }
      const content = readFileSync(fileAbs, 'utf-8');
      const has = content.includes(a.substr);
      if (a.kind === 'present' && !has) {
        drifts.push(drift(
          DRIFT_KIND.STALE_STATUS,
          `[phase ${active}] PLAN-vs-CODE DRIFT: expected substring PRESENT in ${a.file} but it is GONE — "${a.substr}". Re-read the code and re-ground the phase plan before executing.`,
          a.file,
        ));
      } else if (a.kind === 'absent' && has) {
        drifts.push(drift(
          DRIFT_KIND.STALE_STATUS,
          `[phase ${active}] PLAN-vs-CODE DRIFT: expected substring ABSENT from ${a.file} but it is PRESENT — "${a.substr}". Re-read the code and re-ground the phase plan before executing.`,
          a.file,
        ));
      }
    }
    return drifts.length === 0 ? NO_DRIFT : drifts;
  },
};

// Find the fenced ```anchors block under the heading whose text contains the active phase id.
// Scans from that heading to the next heading of the same-or-higher level (so sub-headings stay in).
function extractActiveAnchors(doc, active) {
  const lines = doc.split(/\r?\n/);
  let start = -1;
  let headingLevel = 2;
  for (let i = 0; i < lines.length; i++) {
    const hm = lines[i].match(/^(#{1,6})\s/);
    if (hm && lines[i].includes(active)) { start = i; headingLevel = hm[1].length; break; }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const hm = lines[i].match(/^(#{1,6})\s/);
    if (hm && hm[1].length <= headingLevel) { end = i; break; }
  }
  const section = lines.slice(start, end).join('\n');
  const fence = section.match(/```anchors\s*\r?\n([\s\S]*?)```/);
  if (!fence) return null;

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
