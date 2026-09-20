// F50: loop-wiring (lane M9a, 2026-09-18). The 2026-09-18 stage audit's own finding (s6-gates-harness.md):
// every hop of the build plan's loop (docs/plans/complete-system-build-plan-2026-09-04.md section 1)
// exists as code, but "wired and never fired" is invisible - nothing states the loop's hops as data, so
// nothing can check that each hop's workflow_run trigger edge exists in the real workflow files, that
// each hop's harness family has a real artifact directory, or that a hop has ever actually fired from its
// upstream rather than from a person. This gate reads `.discipline/governance/loop-manifest.mjs`'s
// LOOP_HOPS against the live tree and checks exactly those three things - and ONLY for a hop that claims
// to be enforced (enforceEdge / enforceFired), so a hop this lane's own manifest marks not-yet-wired
// (M1 to M6's job, not this lane's) is REPORTED, never a violation.
//
// THREE CHECKS, each gated by the hop's own claim:
//   (1) enforceEdge=true: the consumer yml's `on.workflow_run.workflows` list contains the producer's
//       `name`, read directly from the workflow file's committed text.
//   (2) enforceFired=true: the hop's harness family directory exists under scripts/harness-runs/ AND
//       holds at least one artifact whose own `trigger` field equals "workflow_run" (the family-existence
//       half of CONVENTION.md's rule (b) - the family must be real before anything can have fired through
//       it - and the fired-proof half in one check, since a fired claim implies the family is real).
//   (3) every hop with enforceEdge=false OR enforceFired=false is counted, not failed: the runner always
//       prints "hops not yet enforced: N" so the number the plan's own acceptance criterion tracks is
//       visible on every run, whether or not any hop is enforced yet.
//
// YAML READING. No YAML parser is a direct dependency of this repository (js-yaml is present only as a
// transitive sub-dependency of something else, per package-lock.json - not something this gate should
// depend on directly); the existing precedent in this directory (secrets-reference-audit.mjs) reads
// `.github/workflows/*.yml` with a documented, line-based text scan rather than a real parser, and this
// gate does the same (brief-m9a.md item 3 names this as an acceptable fallback when "grep for an existing
// yml reader" finds none). `extractWorkflowRunNames`/`hasWorkflowRunEdge` moved to the shared
// `../lib/yml-read.mjs` module (lane F52, 2026-09-20, brief-f52.md item 1) so F52-workflow-file-validity.mjs
// reads the same `workflow_run:` block the same way instead of a second copy; re-exported here so this
// file's own callers and its test (which imports them from this module) are unaffected. Holistic scope (no
// per-file enumeration, same shape as F23/F25/F27/F47): enumerate() returns a single sentinel and the
// whole analysis runs once inside check().
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { violation } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { readFile } from '../lib/file-content.mjs';
import { LOOP_HOPS } from '../../governance/loop-manifest.mjs';
import { extractWorkflowRunNames, hasWorkflowRunEdge } from '../lib/yml-read.mjs';

export { extractWorkflowRunNames, hasWorkflowRunEdge };

/**
 * Read every `<family>-run-NNN.json` artifact in a harness-runs family directory and report whether any
 * one of them carries `trigger === "workflow_run"`. Returns { dirExists, hasFiredArtifact }. Invalid JSON
 * or a file that does not match the run_id pattern is skipped, never thrown on - one bad file must not
 * hide the real answer for the rest of the family (same posture as run-artifact.mjs's readRunHistory).
 * @param {string} repoRoot
 * @param {string} family
 * @returns {{dirExists: boolean, hasFiredArtifact: boolean}}
 */
export function familyFiredStatus(repoRoot, family) {
  const dir = join(repoRoot, 'fsi-app', 'scripts', 'harness-runs', family);
  if (!existsSync(dir)) return { dirExists: false, hasFiredArtifact: false };
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    entries = [];
  }
  const runRe = new RegExp(`^${family}-run-\\d{3}\\.json$`);
  for (const name of entries) {
    if (!runRe.test(name)) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      if (parsed.trigger === 'workflow_run') return { dirExists: true, hasFiredArtifact: true };
    } catch {
      // corrupt or unparseable artifact - not this gate's business, F28 already covers artifact validity
    }
  }
  return { dirExists: true, hasFiredArtifact: false };
}

export const fitnessFunction = {
  id: 'F50',
  name: 'loop-wiring',
  description:
    'Every loop hop the build plan states (LOOP_HOPS in loop-manifest.mjs) is checked against the real ' +
    'tree: an enforceEdge hop must have its workflow_run edge in the consumer yml; an enforceFired hop ' +
    'must have a harness-run artifact whose own trigger field reads "workflow_run". A hop neither flag ' +
    'claims yet is counted, not failed, and the count prints on every run ("hops not yet enforced: N") so ' +
    'the plan\'s own closure criterion is visible whether or not any hop is enforced.',
  source:
    'docs/plans/complete-system-build-plan-2026-09-04.md section 6.1 row M9; ' +
    'docs/audits/stage-audit-2026-09-18/s6-gates-harness.md ("wired and never fired is invisible")',

  enumerate() {
    return ['fsi-app/.discipline/governance/loop-manifest.mjs'];
  },

  check() {
    const out = [];
    const repoRoot = getRepoRoot();
    const seen = new Set();
    let notEnforced = 0;

    for (const hop of LOOP_HOPS) {
      if (seen.has(hop.id)) {
        out.push(violation(1, `DUPLICATE HOP ID: "${hop.id}" appears more than once in LOOP_HOPS.`));
      }
      seen.add(hop.id);

      if (!(hop.enforceEdge && hop.enforceFired)) notEnforced++;

      if (hop.enforceEdge) {
        const consumerText = readFile(hop.consumer.file);
        if (consumerText === null) {
          out.push(
            violation(
              1,
              `${hop.id}: enforceEdge is true but ${hop.consumer.file} could not be read (missing?).`,
            ),
          );
        } else if (!hasWorkflowRunEdge(consumerText, hop.producer.name)) {
          out.push(
            violation(
              1,
              `${hop.id}: enforceEdge is true but ${hop.consumer.file} has no on.workflow_run.workflows ` +
                `entry naming "${hop.producer.name}". Either the yml lost its trigger, or this hop's ` +
                `enforceEdge should not yet be true.`,
            ),
          );
        }
      }

      if (hop.enforceFired) {
        if (!hop.family) {
          out.push(
            violation(1, `${hop.id}: enforceFired is true but family is null - nowhere to look for a fired artifact.`),
          );
        } else {
          const status = familyFiredStatus(repoRoot, hop.family);
          if (!status.dirExists) {
            out.push(
              violation(
                1,
                `${hop.id}: enforceFired is true but scripts/harness-runs/${hop.family}/ does not exist.`,
              ),
            );
          } else if (!status.hasFiredArtifact) {
            out.push(
              violation(
                1,
                `${hop.id}: enforceFired is true but no artifact in scripts/harness-runs/${hop.family}/ ` +
                  `carries trigger:"workflow_run" - either nothing has fired from the upstream yet, or ` +
                  `this hop's enforceFired should not yet be true.`,
              ),
            );
          }
        }
      }
    }

    // Reported every run, not a violation (brief-m9a.md item 3's fourth bullet): the runner has no
    // separate "informational" output channel (checked: no other fitness function emits one), so this
    // line is the mechanism that makes the acceptance criterion's "hops not yet enforced: N" visible on
    // every run regardless of whether any hop is enforced yet.
    console.log(`  [F50] hops not yet enforced: ${notEnforced}`);

    return out;
  },
};
