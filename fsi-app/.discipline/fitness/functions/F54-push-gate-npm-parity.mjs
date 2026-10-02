// F54: push-gate-npm-parity (lane G2, 2026-09-21, brief-g2.md, invariant RD-79). The parity proof, by
// attack, for the class PR #769 exposed: PR #769 passed fsi-app/.discipline/hooks/pre-push locally and
// FAILED .github/workflows/discipline.yml's required "Fitness functions" job on GitHub, in the step
// "App unit tests requiring npm deps (*.npmtest.mjs)", three tests asserting component source text
// broke on a markup change, and the local gate never ran them at all. Operator ruling, verbatim: "This
// is a constant. sTOP pushing when it will fail Discipline engine / Fitness functions."
//
// WHAT THIS CHECKS. Reads .github/workflows/discipline.yml's "Fitness functions" job (matched by its
// `name:` field, not the job key, so a key rename doesn't silently stop the check) and
// fsi-app/.discipline/hooks/pre-push's text. For every step in that job that LOOKS like a test-running
// step, its name contains "test", "golden" or "lint" (case-insensitive), OR its `run:` block invokes a
// tracked .mjs/.sh script via node/sh/bash, this checks that the SAME script path (joined with the
// step's own `working-directory:` when it has one, exactly as GitHub Actions would resolve it) appears
// somewhere in the pre-push hook's text. A step whose script the hook does not also call is a
// VIOLATION: the push gate would not catch a failure in that CI step, the exact PR #769 shape.
//
// EXEMPT_STEPS is the ONE small, dated, reason-bearing table (brief-g2.md item 2) for steps that
// genuinely cannot run on a lane's PC by operator ruling. An entry missing either `decidedOn` or
// `reason` is itself a violation, "nothing else goes in that table" is enforced, not just written down.
// A step matched as test-running with NO script invocation found (e.g. actionlint, which runs a
// downloaded binary, not a tracked .mjs/.sh) and NOT in EXEMPT_STEPS is also a violation: there is
// nothing here to silently wave through.
//
// PARSING. No YAML parser is a direct dependency of this repository (see fitness/lib/yml-read.mjs's own
// header); this reads discipline.yml with the same documented, line-based text scan every gate in this
// directory already uses (2-space block-style indentation, the convention every workflow file here
// follows). The pure parsing/comparison core (extractJobBlock, extractSteps, stepRunText,
// stepWorkingDirectory, extractScriptInvocations, isCandidateTestStep, evaluateStepParity) takes plain
// text and returns plain data, nothing here touches the filesystem, so the sibling .test.mjs can drive
// it against fixture text (rule 15: a guard is proven by attack, not by presence) without depending on
// the real repo tree at all. Production reads (the real discipline.yml + the real pre-push hook) are
// isolated to runCheck() at the bottom.

//
// WIDENED (lane CI-PARITY, 2026-09-28). Two gaps, both [CONFIRMED], closed here:
//
//   1. SCOPE. This check used to read ONE job ("Fitness functions"). The seven red runs on
//      lane/quarantine-disposition (six "Discipline engine" runs, 36450339377 through 36463279310) all
//      failed a DIFFERENT job, "Discipline engine unit tests", which F54 never looked at. Measured with
//      this file's own evaluateStepParity() over every job on 2026-09-28, the widening found six CI steps
//      the push gate never ran (runner.mjs --mode=ci twice, closure-gate.mjs, skill-contract-map.mjs
//      --check, orphan-modules.mjs --all, run-rendering-guard.mjs). check() now scans EVERY job in
//      discipline.yml, derived from the file (listJobKeys), never a named list. A job whose own
//      `continue-on-error: true` means it can never fail the workflow is skipped BY THAT RULE
//      (jobContinuesOnError), not by an exemption entry: it cannot make CI red, so no push-gate parity
//      is owed for it.
//
//   2. SAME SCRIPT, DIFFERENT ENVIRONMENT. Parity of the script PATH was not enough: pre-push step 3 and
//      the CI job both called run-test-suite.sh, yet the local run could resolve npm packages (the shared
//      node_modules install, RD-85) and could read fsi-app/.env.local, while CI's job has neither. A
//      .test.mjs file that reached @supabase/supabase-js passed locally and failed in CI six times.
//      evaluateNoNpmSuiteParity() checks, from the files themselves, that run-test-suite.sh's
//      `node --test` invocation runs under the no-npm sandbox (.discipline/lib/no-npm-sandbox.mjs) with
//      the env-file load switched off, and that the CI job running that suite installs no npm packages
//      (if it ever did, the sandbox would be stricter than CI and the two would disagree the other way).

import { violation } from '../lib/result.mjs';
import { readFile } from '../lib/file-content.mjs';

const KEYWORD_TRIGGERS = ['test', 'golden', 'lint'];
const NO_NPM_SUITE = 'fsi-app/.discipline/run-test-suite.sh';
const NO_NPM_SANDBOX = 'fsi-app/.discipline/lib/no-npm-sandbox.mjs';
const RUN_EXPLICIT_TESTS_BASENAME = 'run-explicit-tests.mjs';

/**
 * Every top-level job key under `jobs:` (2-space-indented `<key>:` lines after the `jobs:` line).
 * @param {string} ymlText
 * @returns {string[]}
 */
export function listJobKeys(ymlText) {
  const lines = String(ymlText ?? '').split(/\r?\n/);
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start === -1) return [];
  const keys = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break; // next top-level key ends the jobs map
    const m = lines[i].match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

/** A job-level `continue-on-error: true` (4-space indent), meaning the job cannot fail the workflow. */
export function jobContinuesOnError(jobBlockText) {
  return /^ {4}continue-on-error:\s*true\s*$/m.test(String(jobBlockText ?? ''));
}

/**
 * The environment half of parity for the no-npm suite. `suiteText` is run-test-suite.sh's text, `ymlText`
 * discipline.yml's. Returns plain-string violation messages. PURE.
 * @param {string} suiteText
 * @param {string} ymlText
 * @returns {string[]}
 */
export function evaluateNoNpmSuiteParity(suiteText, ymlText) {
  const out = [];
  const code = String(suiteText ?? '')
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
  // RUNNER SHAPE (lane R6-8, 2026-10-01, closes CF-SEC-11's runner half): run-test-suite.sh no longer
  // invokes `node --test` directly -- a bare CLI `node --test <path>` re-parses every explicit file
  // argument through Node's own glob matcher, silently dropping any path with a literal "["/"]"
  // segment (see F65-no-bracket-path-tests.mjs). It now pipes its discovery list through
  // RUN_EXPLICIT_TESTS (node:test's programmatic run({ files }) API, whose files option is a literal
  // array, never re-parsed as a glob), passing the sandbox via `execArgv` after a `--` separator. Both
  // invocation shapes are recognized here so an OLDER suite still carrying the literal `--test` form
  // (a hand revert, or a future rewrite) is still checked correctly.
  const testLines = code
    .split('\n')
    .filter((l) => /\bnode\b[^\n]*\s--test\b/.test(l) || new RegExp(`\\b${RUN_EXPLICIT_TESTS_BASENAME}\\b`).test(l));
  if (testLines.length === 0) {
    out.push(`${NO_NPM_SUITE} has no \`node --test\` or \`${RUN_EXPLICIT_TESTS_BASENAME}\` invocation to check.`);
  }
  for (const l of testLines) {
    const m = l.match(/--import\s+["']?(\.\/)?([^\s"']+)["']?/);
    if (!m || m[2] !== NO_NPM_SANDBOX) {
      out.push(
        `${NO_NPM_SUITE} runs its test invocation without \`--import ./${NO_NPM_SANDBOX}\`: locally the ` +
          `suite could resolve npm packages CI's job cannot (the lane/quarantine-disposition class, six ` +
          `red runs).`,
      );
    }
  }
  if (!/^\s*(export\s+)?FSI_NO_ENV_FILE=1\b/m.test(code) && !/\bFSI_NO_ENV_FILE=1\b[^\n]*\bnode\b/.test(code)) {
    out.push(
      `${NO_NPM_SUITE} does not set FSI_NO_ENV_FILE=1: locally the suite could load fsi-app/.env.local ` +
        `credentials CI's job never has (scripts/lib/env-file.mjs's one switch).`,
    );
  }
  if (!/CREDENTIAL_VARS/.test(code)) {
    out.push(
      `${NO_NPM_SUITE} does not unset scripts/lib/env-file.mjs's CREDENTIAL_VARS: a developer shell's ` +
        `credentials would reach tests CI runs with none set.`,
    );
  }
  for (const key of listJobKeys(ymlText)) {
    const block = extractJobBlock(ymlText, key);
    if (!block || !block.includes(NO_NPM_SUITE.replace(/^fsi-app\//, '')) && !block.includes(NO_NPM_SUITE)) continue;
    if (/\bnpm\s+(ci|install|i)\b/.test(block)) {
      out.push(
        `discipline.yml job "${key}" runs ${NO_NPM_SUITE} AND installs npm packages: the no-npm sandbox is ` +
          `now stricter than CI, so a local failure there would be a false red. Keep that job npm-free, or ` +
          `move the npm-dependent test to *.npmtest.mjs.`,
      );
    }
  }
  return out;
}

/**
 * Extract one top-level job's block of text (from its `  <jobKey>:` line up to, but not including, the
 * next top-level `  <key>:` line, or end of file). Returns null when the job key is not found.
 * @param {string} ymlText
 * @param {string} jobKey
 * @returns {string | null}
 */
export function extractJobBlock(ymlText, jobKey) {
  const lines = String(ymlText ?? '').split(/\r?\n/);
  const jobRe = new RegExp(`^  ${jobKey}:\\s*$`);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (jobRe.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/**
 * Split a job block's `steps:` list into `{ name, body }` entries. `body` is the step's raw text,
 * `name` is the trimmed name value (empty string when the step has no `name:`, which never happens in
 * this repo's own workflows but is handled rather than thrown on).
 * @param {string} jobBlockText
 * @returns {{name: string, body: string}[]}
 */
export function extractSteps(jobBlockText) {
  const lines = String(jobBlockText ?? '').split(/\r?\n/);
  const startIdxs = [];
  lines.forEach((line, i) => {
    if (/^ {6}- name:\s*.+$/.test(line)) startIdxs.push(i);
  });
  const steps = [];
  for (let s = 0; s < startIdxs.length; s++) {
    const start = startIdxs[s];
    const end = s + 1 < startIdxs.length ? startIdxs[s + 1] : lines.length;
    const body = lines.slice(start, end).join('\n');
    const nameMatch = lines[start].match(/^ {6}- name:\s*(.+)$/);
    steps.push({ name: nameMatch ? nameMatch[1].trim() : '', body });
  }
  return steps;
}

/** @param {string} stepBody @returns {string | null} */
export function stepWorkingDirectory(stepBody) {
  const m = String(stepBody ?? '').match(/^ {8}working-directory:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

/**
 * Extract a step's `run:` content, whether written as an inline scalar (`run: cmd`) or a block scalar
 * (`run: |` followed by more-indented lines). Returns null when the step has no `run:` field (a `uses:`
 * step, e.g. Checkout / Setup Node).
 * @param {string} stepBody
 * @returns {string | null}
 */
export function stepRunText(stepBody) {
  const lines = String(stepBody ?? '').split(/\r?\n/);
  const idx = lines.findIndex((l) => /^ {8}run:/.test(l));
  if (idx === -1) return null;
  const inlineMatch = lines[idx].match(/^ {8}run:\s*(.*)$/);
  const inlineValue = inlineMatch ? inlineMatch[1].trim() : '';
  if (inlineValue && inlineValue !== '|' && inlineValue !== '>') return inlineValue;
  // Block scalar: everything more-indented than the `run:` line itself, until a line at 8 spaces or
  // less (the next step field or the next step), matching this repo's consistent 2-space-per-level
  // convention (see yml-read.mjs's own header note).
  const collected = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      collected.push('');
      continue;
    }
    if (/^ {0,8}\S/.test(line)) break;
    collected.push(line);
  }
  return collected.join('\n');
}

/**
 * Find every `node <path>` / `sh <path>` / `bash <path>` invocation of a tracked .mjs/.sh script in a
 * run block, joined with `workingDirectory` (GitHub Actions resolves a relative script argument against
 * the step's own working-directory) exactly the way the runner would. A path already starting with
 * `workingDirectory/` or an absolute path is left alone.
 * @param {string | null} runText
 * @param {string | null} workingDirectory
 * @returns {string[]}
 */
export function extractScriptInvocations(runText, workingDirectory) {
  if (!runText) return [];
  const re = /(?:^|[\s;&|(])(?:node|sh|bash)\s+([^\s"'|;&)]+\.(?:mjs|sh))/g;
  const out = [];
  let m;
  while ((m = re.exec(runText))) {
    let p = m[1];
    if (workingDirectory && !p.startsWith(`${workingDirectory}/`) && !p.startsWith('/')) {
      p = `${workingDirectory}/${p}`;
    }
    out.push(p);
  }
  return out;
}

/** @param {string} stepName @returns {boolean} */
export function isCandidateTestStep(stepName) {
  const lower = String(stepName ?? '').toLowerCase();
  return KEYWORD_TRIGGERS.some((k) => lower.includes(k));
}

/**
 * Pure comparison core. `steps` is extractSteps()'s output; `hookText` is the pre-push hook's raw text;
 * `exemptSteps` is EXEMPT_STEPS-shaped: `[{ nameContains, decidedOn, reason }]`. Returns an array of
 * plain-string violation messages (never throws, never touches the filesystem).
 * @param {{name: string, body: string}[]} steps
 * @param {string} hookText
 * @param {{nameContains: string, decidedOn?: string, reason?: string}[]} exemptSteps
 * @returns {string[]}
 */
export function evaluateStepParity(steps, hookText, exemptSteps) {
  const out = [];
  for (const step of steps) {
    const runText = stepRunText(step.body);
    const workingDirectory = stepWorkingDirectory(step.body);
    const scripts = extractScriptInvocations(runText, workingDirectory);
    const candidateByName = isCandidateTestStep(step.name);
    if (scripts.length === 0 && !candidateByName) continue; // not a test-running step; no parity owed

    const exempt = (exemptSteps ?? []).find((e) => step.name.includes(e.nameContains));
    if (exempt) {
      if (!exempt.decidedOn || !exempt.reason) {
        out.push(
          `EXEMPT_STEPS entry for "${exempt.nameContains}" (matching step "${step.name}") is missing a ` +
            `decidedOn date or a reason, an exemption without both fails this check (brief-g2.md item 2: ` +
            `"an entry without a date and a reason fails the test").`,
        );
      }
      continue;
    }

    if (scripts.length === 0) {
      out.push(
        `step "${step.name}" looks like a test-running step (name contains "test", "golden" or "lint") ` +
          `but no node/sh/bash script invocation was found to check parity against, and it is not in ` +
          `EXEMPT_STEPS. Either add a dated, reason-bearing EXEMPT_STEPS entry, or route its command ` +
          `through a script this checker can see.`,
      );
      continue;
    }

    for (const script of scripts) {
      if (!hookText.includes(script)) {
        out.push(
          `step "${step.name}" runs "${script}", which fsi-app/.discipline/hooks/pre-push does not call ` +
            `, the local push gate would not catch a failure in this CI step (the PR #769 class). Add a ` +
            `step to pre-push that calls the same script, or route both callers through one shared home.`,
        );
      }
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// EXEMPT_STEPS, the one small, dated, reason-bearing table (brief-g2.md item 2). Scope note: this
// checker only scans the "Fitness functions" job (JOB_NAME above), so the Rendering-guard entry below
// currently matches nothing there, it is named per the brief's own instruction ("today exactly ...
// and ...") and stays inert unless this checker is later widened to other jobs, at which point it takes
// effect with no further edit needed.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
export const EXEMPT_STEPS = [
  {
    nameContains: 'actionlint',
    decidedOn: '2026-09-21',
    reason:
      'downloads a pinned, checksum-verified actionlint binary from GitHub releases at run time (F52\'s ' +
      'own step comment); the operator declined installing extra software locally for this ("We do not ' +
      'need to install extra software use GitHub", brief-g2.md item 2), runs in CI only.',
  },
  {
    nameContains: 'Orphan-module + dead-export census',
    decidedOn: '2026-09-28',
    reason:
      'orphan-modules.mjs --all is a REPORT that never fails (its own header, and the step name says ' +
      '"reports, never fails"), so it cannot turn CI red and owes the push gate no parity; the failing ' +
      'enforcement for its class is F25, which the pre-push fitness runner (step 3d) already runs. ' +
      'Lane CI-PARITY, found by widening this check to every job.',
  },
  {
    nameContains: 'Playwright',
    decidedOn: '2026-09-21',
    reason:
      'the rendering-guard job\'s Playwright + chromium install step; a DIFFERENT job from "Fitness ' +
      'functions" so this checker never reaches it today, named per the operator\'s own instruction ' +
      '("We do not need to install extra software use GitHub", brief-g2.md item 2) in case this checker ' +
      'is ever widened to scan that job too.',
  },
  {
    nameContains: 'ESLint (max-warnings 0)',
    decidedOn: '2026-10-01',
    reason:
      'lane R7-LINT-CI (remediation plan Lane 7, CF-SEC-10). The step\'s run: is `npm run lint -- ' +
      '--max-warnings=0`, an npm-script invocation, not a `node`/`sh`/`bash <path>.(mjs|sh)` call, so ' +
      'extractScriptInvocations() finds nothing to match even though real parity exists: pre-push\'s own ' +
      'step 3d runs the byte-for-byte identical command (fsi-app/.discipline/hooks/pre-push, "Step 3d: ' +
      'ESLint"). Widening the script-invocation regex to also parse npm-script commands is a separate, ' +
      'larger change to this checker\'s detection surface than this lane\'s write set covers; filed here ' +
      'as a dated, reason-bearing exemption per this file\'s own rule rather than left unexplained.',
  },
];

export const fitnessFunction = {
  id: 'F54',
  name: 'push-gate-npm-parity',
  description:
    'Every test-running step of EVERY discipline.yml job that can fail the workflow (name contains ' +
    '"test", "golden" or "lint", or its run: block invokes a tracked .mjs/.sh script) must have its ' +
    'script also called by fsi-app/.discipline/hooks/pre-push, or carry a dated, reason-bearing ' +
    'EXEMPT_STEPS entry; and the no-npm suite must run locally under the same no-npm, no-credential ' +
    'environment CI gives it. Closes the PR #769 class (a CI step the push gate never ran) and the ' +
    'lane/quarantine-disposition class (the same script, a different environment).',
  source: 'docs/dispatches/lane-briefs/2026-09-21/brief-g2.md ("the local push gate runs what CI\'s Fitness job runs")',

  enumerate() {
    return ['.github/workflows/discipline.yml'];
  },

  check() {
    const ymlText = readFile('.github/workflows/discipline.yml');
    if (ymlText === null) {
      return [violation(1, '.github/workflows/discipline.yml not found.')];
    }
    const hookText = readFile('fsi-app/.discipline/hooks/pre-push');
    if (hookText === null) {
      return [violation(1, 'fsi-app/.discipline/hooks/pre-push not found.')];
    }
    const suiteText = readFile(NO_NPM_SUITE);
    if (suiteText === null) {
      return [violation(1, `${NO_NPM_SUITE} not found.`)];
    }
    const jobKeys = listJobKeys(ymlText);
    if (jobKeys.length === 0) {
      return [violation(1, '.github/workflows/discipline.yml: no jobs found under `jobs:` (parse failure?).')];
    }
    const out = [];
    for (const key of jobKeys) {
      const jobBlock = extractJobBlock(ymlText, key);
      if (jobBlock === null || jobContinuesOnError(jobBlock)) continue; // cannot fail the workflow
      const messages = evaluateStepParity(extractSteps(jobBlock), hookText, EXEMPT_STEPS);
      for (const m of messages) out.push(violation(1, `.github/workflows/discipline.yml (job ${key}): ${m}`));
    }
    for (const m of evaluateNoNpmSuiteParity(suiteText, ymlText)) out.push(violation(1, m));
    return out;
  },
};
