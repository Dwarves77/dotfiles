// F27: PRODUCER SEAM PROOF. Every producer entry point under fsi-app/scripts/producers/** must have its
// WHOLE set of first-party seam modules (src/lib/** it imports, plus any sibling producer module it
// imports) exercised by ONE SINGLE proof file. A proof per module is not enough — the invariant is that
// some file imports every seam TOGETHER, so the composition between them actually runs.
//
// THE DEFECT CLASS, TWO CONCRETE INCIDENTS.
//
// (1) WO-17, 2026-08-30, regional lane. The first live --apply of a regional_data_facts producer died
//     on its very first row: `null value in column "value" ... violates not-null constraint`. The
//     parser had a green fixture proof. buildEnvelopeRow (the function that derives the NOT-NULL
//     `value` column) had a green proof. planUpsert had a green proof. The orchestrator simply never
//     called buildEnvelopeRow — every layer was independently correct and the chain could not write a
//     single row. See scripts/producers/regional/run-envelope-producer.test.mjs's own header for the
//     full story; that file is the proof this incident produced.
//
// (2) The market lane, same day, one layer up. scripts/producers/market/eu-weekly-oil-bulletin.mjs
//     composes parseEuWeeklyOilBulletinCsv (src/lib/market/parsers/eu-weekly-oil-bulletin.mjs) into
//     planMarketSeriesUpsert (src/lib/market/write-market-series.mjs). Each had its own green fixture
//     proof. Nothing imported both together. The seam shipped validated by exactly one thing: a live
//     --apply against the real database on 2026-08-30 — the ADR-023 dry-run-then-apply step, not a
//     repeatable proof anyone could run again. market-producer-composition.test.mjs (added the same
//     day this gate was) is what closed that gap; this gate is what stops it reopening, and what would
//     have caught incident (1) had it existed a day earlier.
//
// THE COMMON SHAPE. A "green suite" over a producer script proves each of its parts works in isolation.
// It says nothing about whether the orchestrator actually calls the part that matters, or whether real
// output from module A survives being fed into module B unchanged. Two unit tests that never import
// each other are two unit tests, not a composition proof — this gate's whole job is telling those apart.
//
// WHAT THIS GATE DOES NOT DO, stated plainly so it is never mistaken for more than it is: it CANNOT tell
// you a test's fixture matches the real world. A composition proof built on a fabricated CSV proves the
// wiring is exercised, not that the wiring is exercised against reality — that is what ADR-023's
// dry-run-then-apply rule is for (fetch the live data, plan it, LOOK at the plan, only then --apply).
// This gate guarantees the seam is exercised by SOMETHING repeatable; it has no opinion on whether the
// fixture is honest.
//
// "PRODUCER ENTRY POINT" — the scope of this gate. A file directly under scripts/producers/** (excluding
// *.test.mjs) that starts with a `#!/usr/bin/env node` shebang: the repo's own convention for "this is a
// CLI a human or CI runs", used consistently by all five producers as of 2026-08-30. A shared orchestration
// module like scripts/producers/regional/run-envelope-producer.mjs carries no shebang and exports functions
// for OTHER producers to call — it is a SEAM other entry points depend on, not itself an entry point that
// needs its own composition proof (it has no meaningful "composition" of its own; its callers' proofs are
// where composing it matters).
//
// "SEAM MODULE" — anything a producer entry point imports (by a relative specifier, resolved to a
// repo-relative path) that lives under fsi-app/src/lib/** or fsi-app/scripts/producers/**. Deliberately
// EXCLUDES fsi-app/scripts/lib/** (db.mjs's readAll/guardedInsert/guardedUpdate and friends): that is the
// guarded I/O boundary every producer goes through by construction (rule 015), not business logic whose
// composition with the rest of the producer needs proving here. A producer that imports NO first-party
// seam at all (a pure I/O shell) is not a violation — there is nothing to compose-prove; see the check()
// loop's explicit skip.
//
// CANDIDATE PROOFS scanned from fsi-app/src/__tests__/**/*.test.mjs and
// fsi-app/scripts/producers/**/*.test.mjs — the two locations the market and regional lanes both already
// use for exactly this kind of proof (see both files' own headers on why they live there rather than
// co-located, run-test-suite.sh glob coverage).
//
// SHAPE: shrinking allowlist audited in BOTH directions, the F14/F25 idiom applied to composition instead
// of liveness. An uncovered seam set with no exemption is RED. An exemption naming a producer that no
// longer exists is RED. An exemption naming a producer that HAS since gained a covering proof is RED (it
// got fixed — delete the entry). SEAM_EXEMPTIONS ships EMPTY: building this gate first found the regional
// lane had the SAME gap the market lane just closed (bls-oews-producer.mjs and
// eurostat-nrg-pc-205-producer.mjs each import a parser AND run-envelope-producer.mjs, and nothing imported
// both together for either — run-envelope-producer.test.mjs proved only run-envelope-producer.mjs itself,
// against a hand-built observation shaped like the parsers' real output, never the parsers). That gap was
// recorded as two exemptions for one revision of this file and then closed the same day:
// regional-bls-oews-composition.test.mjs and regional-eurostat-nrg-pc-205-composition.test.mjs (both
// 2026-08-30) each import their producer's parser AND run-envelope-producer.mjs's toCandidateRows/
// latestPerNaturalKey and assert the composed output against the live regional_data_facts constraints —
// same shape as market-producer-composition.test.mjs. A gate that ships with day-one exemptions is how a
// gate becomes ceremony; the empty list here is verified, not assumed — see the fitnessFunction.check()
// against the live tree below and this file's own selftest.
//
// COST: filesystem only — no network, no database, no model call, no schedule.
//
// Holistic, so it follows the F23/F25 shape: enumerate() returns a single sentinel and the whole analysis
// runs once inside check().

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { resolveSpecifier, isTestFile } from './F25-module-liveness.mjs';

const SHEBANG_RE = /^#!\/usr\/bin\/env node/;
const IMPORT_SPEC_RE = /(?:\bfrom\s*|\bimport\s*)\(?\s*["'`]([^"'`\n]+)["'`]/g;

/** True iff `resolved` (a repo-relative path) is in this gate's seam scope: src/lib/** or a sibling
 *  producer module, and never a test file (a test can never itself be "the seam"). */
export function isSeamScope(resolved) {
  if (!resolved) return false;
  if (isTestFile(resolved)) return false;
  return resolved.startsWith('fsi-app/src/lib/') || resolved.startsWith('fsi-app/scripts/producers/');
}

/**
 * Every first-party seam module `file` (at repo-relative path `file`, with source `content`) imports,
 * resolved against `tracked` (the full candidate file set, for extension resolution — see
 * resolveSpecifier). Pure over its inputs; used identically for a producer's REQUIRED seam set and a
 * proof's COVERED seam set, so the two are directly comparable.
 */
export function extractSeams(file, content, tracked) {
  const seams = new Set();
  for (const m of content.matchAll(IMPORT_SPEC_RE)) {
    const resolved = resolveSpecifier(m[1], file, tracked);
    if (resolved && resolved !== file && isSeamScope(resolved)) seams.add(resolved);
  }
  return Array.from(seams).sort();
}

/** True iff `file` (with source `content`) is a producer CLI entry point in this gate's scope: directly
 *  under scripts/producers/**, not a test file, and shebang-marked (see the header note on scope — a
 *  shebang-less module like run-envelope-producer.mjs is a shared SEAM other entries import, not itself
 *  an entry needing its own composition proof). */
export function isProducerEntryPoint(file, content) {
  return (
    file.startsWith('fsi-app/scripts/producers/') &&
    file.endsWith('.mjs') &&
    !isTestFile(file) &&
    SHEBANG_RE.test(content)
  );
}

// ── the shrinking allowlist ──────────────────────────────────────────────────────────────────────────
// Every entry would name the exact seam set not yet covered by one proof, and why. Reviewed the same way
// F14/F22/F24/F25 review theirs: this list should only ever shrink. It ships EMPTY (2026-08-30) — see the
// header note on the regional-lane gap this list held for one revision and how it was closed — and stays
// empty as long as every producer entry point has a real composition proof. A future gap belongs here
// with a reason and a remedy, never as a silent weakening of auditSeamCoverage itself.
export const SEAM_EXEMPTIONS = [];

/**
 * Pure comparator, exported so the selftest can prove the gate's catching behaviour against CONSTRUCTED
 * inputs rather than only the live tree — the negative-test discipline F23/F25 use on themselves.
 *
 * @param {Array<{file: string, seams: string[]}>} producers - every producer entry point in scope, with
 *   its REQUIRED seam set (already filtered to isSeamScope; may be empty for a pure I/O shell).
 * @param {Array<{file: string, imports: string[]}>} proofs - every candidate proof file, with its own
 *   COVERED seam set (same extraction, same filter, so the two are directly comparable).
 * @param {Array<{file: string, reason: string, remedy: string}>} exemptions
 * @returns {string[]} violation messages ([] = pass)
 */
export function auditSeamCoverage(producers, proofs, exemptions = []) {
  const exemptMap = new Map(exemptions.map((e) => [e.file, e]));
  const problems = [];

  const isCovered = (seams) => proofs.some((p) => {
    const covered = new Set(p.imports);
    return seams.every((s) => covered.has(s));
  });

  for (const producer of producers) {
    if (producer.seams.length === 0) continue; // pure I/O shell — nothing to compose-prove
    if (isCovered(producer.seams)) continue;
    if (exemptMap.has(producer.file)) continue; // recorded gap, audited below
    problems.push(
      `NO COMPOSITION PROOF — "${producer.file}" imports ${producer.seams.length} first-party seam(s) and no ` +
        `single proof file imports all of them together: ${producer.seams.join(', ')}. Write one proof that ` +
        `imports all of: ${producer.seams.join(', ')} — and exercises the real composition this producer ` +
        `performs, asserting the result against the LIVE table's constraints, not just each module's own ` +
        `output shape. Two proofs that each cover half of this producer's seams do not prove the seam between ` +
        `them; that is the exact class that shipped a NULL \`value\` to production on 2026-08-30 with every ` +
        `gate green.`,
    );
  }

  // ── the reverse audit: the exemption list must shrink, never grandfather ──
  const byFile = new Map(producers.map((p) => [p.file, p]));
  for (const entry of exemptions) {
    const producer = byFile.get(entry.file);
    if (!producer) {
      problems.push(
        `STALE EXEMPTION — "${entry.file}" no longer exists as a producer entry point. Remove its ` +
          `SEAM_EXEMPTIONS entry in F27-producer-seam-proof.mjs.`,
      );
      continue;
    }
    if (producer.seams.length === 0) {
      problems.push(
        `STALE EXEMPTION — "${entry.file}" now imports no first-party seams (it became a pure I/O shell). ` +
          `Remove its SEAM_EXEMPTIONS entry in F27-producer-seam-proof.mjs.`,
      );
      continue;
    }
    if (isCovered(producer.seams)) {
      problems.push(
        `STALE EXEMPTION — "${entry.file}" now has a single proof covering its whole seam set. It got fixed — ` +
          `remove its SEAM_EXEMPTIONS entry in F27-producer-seam-proof.mjs so the list keeps shrinking.`,
      );
      continue;
    }
    if (!entry.reason || !entry.remedy) {
      problems.push(
        `EXEMPTION WITHOUT A REASON — "${entry.file}" must carry both reason and remedy, same as F14/F22/F24/F25. ` +
          `An entry with no reason is a permanent exemption wearing a temporary label.`,
      );
    }
  }

  return problems;
}

function collectProducers(root, files, tracked) {
  return files
    .filter((f) => f.startsWith('fsi-app/scripts/producers/') && f.endsWith('.mjs') && !isTestFile(f))
    .map((f) => ({ file: f, content: readFileSync(join(root, f), 'utf8') }))
    .filter(({ file, content }) => isProducerEntryPoint(file, content))
    .map(({ file, content }) => ({ file, seams: extractSeams(file, content, tracked) }));
}

function collectProofs(root, tracked) {
  const proofFiles = globFiles([
    'fsi-app/src/__tests__/**/*.test.mjs',
    'fsi-app/scripts/producers/**/*.test.mjs',
  ]);
  return proofFiles.map((f) => {
    const content = readFileSync(join(root, f), 'utf8');
    return { file: f, imports: extractSeams(f, content, tracked) };
  });
}

export const fitnessFunction = {
  id: 'F27',
  name: 'producer-seam-proof',
  description:
    'Every producer entry point under scripts/producers/** has its whole set of first-party seam modules ' +
    '(src/lib/** it imports, plus any sibling producer module) exercised by ONE proof that imports every ' +
    'seam together — a composition proof, not two unit tests that never meet. Mechanizes the WO-17 ' +
    'buildEnvelopeRow miss (a NOT-NULL `value` never written, every isolated proof green) and the market ' +
    'lane\'s parser->planner seam, which shipped validated only by a live --apply on 2026-08-30.',
  source:
    'WO-17 regional_data_facts incident 2026-08-30 (run-envelope-producer.test.mjs\'s own header); the ' +
    'eu-weekly-oil-bulletin.mjs parser->planner seam proven only by a live apply the same day',

  // Holistic: one pass over the tree, built once. Single sentinel => check() runs once.
  enumerate() {
    return ['fsi-app/.discipline/fitness/functions/F27-producer-seam-proof.mjs'];
  },

  check() {
    const root = getRepoRoot();
    // The tracked set is wider than either scope below: it is only used for resolveSpecifier's
    // extension probing, so it needs to contain every file a relative import could point at.
    const tracked = new Set(globFiles(['fsi-app/src/**/*.mjs', 'fsi-app/scripts/**/*.mjs']));

    const entryFiles = globFiles(['fsi-app/scripts/producers/**/*.mjs']);
    const producers = collectProducers(root, entryFiles, tracked);
    const proofs = collectProofs(root, tracked);

    const problems = auditSeamCoverage(producers, proofs, SEAM_EXEMPTIONS);
    if (problems.length === 0) return PASS;
    return problems.map((msg) => violation(1, msg));
  },
};
