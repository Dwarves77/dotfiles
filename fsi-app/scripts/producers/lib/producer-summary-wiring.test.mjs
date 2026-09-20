// producer-summary-wiring.test.mjs -- the gate against recurrence (lane M9d, brief-m9d Amendment 1 item
// C.3): parses .github/workflows/producers.yml, collects every `node scripts/....mjs` invocation run with
// `--apply`, and asserts each such script imports producer-summary.mjs. Proven with an attack fixture: a
// yml naming a script that does NOT import it must be caught, not silently pass.
//
// SCOPE, DELIBERATE: only scripts under scripts/producers/ or scripts/gen/ are producer scripts in this
// family's sense -- population-report.mjs (scripts/verify/) and revalidate.mjs (scripts/lib/) are also
// invoked with a flag named --apply in this same workflow, but neither is a data producer this family
// covers (revalidate.mjs's --apply takes a list of cache tags, an unrelated CLI convention that happens to
// share the flag spelling), so they are excluded by directory rather than by name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", ".."); // fsi-app/scripts/producers/lib -> repo root
const FSI_ROOT = resolve(REPO_ROOT, "fsi-app");
const WORKFLOW_PATH = resolve(REPO_ROOT, ".github", "workflows", "producers.yml");

const PRODUCER_SCRIPT_DIR_RE = /^scripts\/(producers|gen)\//;

/**
 * Scan a producers.yml-shaped text for every `node <path>.mjs ...--apply...` invocation and return the
 * DISTINCT fsi-app-relative script paths run with --apply, restricted to scripts/producers/ and
 * scripts/gen/ (see file header for why). Pure, no I/O -- a fixture string exercises this the same way
 * the real workflow file does.
 * @param {string} ymlText
 * @returns {string[]}
 */
export function findApplyInvokedProducerScripts(ymlText) {
  const found = new Set();
  const lineRe = /node\s+(scripts\/[^\s"]+\.mjs)([^\n]*)/g;
  let m;
  while ((m = lineRe.exec(ymlText))) {
    const scriptPath = m[1];
    const rest = m[2] ?? "";
    if (!/--apply\b/.test(rest)) continue;
    if (!PRODUCER_SCRIPT_DIR_RE.test(scriptPath)) continue;
    found.add(scriptPath);
  }
  return [...found].sort();
}

/**
 * True when `fileText` (a script's own source) is wired into the producers-family summary mechanism,
 * either DIRECTLY (imports producer-summary.mjs, from either of its two real callers' relative depths --
 * scripts/producers/market|regional/*.mjs -> "../lib/producer-summary.mjs"; scripts/gen/*.mjs ->
 * "../producers/lib/producer-summary.mjs") or INDIRECTLY through the one shared wrapper
 * assertEdgesAuthoredAndRecordSummary (author-market-series-delta.mjs -- lane M9d, F45 duplicate-code: the
 * three market_series producers share this wrapper rather than each importing producer-summary.mjs and
 * repeating its try/catch shape three times). Pure string check, no module resolution -- matching this
 * repo's own "text scan over a real parser" precedent (F50's own YAML reading) for a check this small.
 * @param {string} fileText
 * @returns {boolean}
 */
export function scriptImportsProducerSummary(fileText) {
  return (
    /["'][^"']*producer-summary\.mjs["']/.test(fileText) ||
    /\bassertEdgesAuthoredAndRecordSummary\b/.test(fileText) ||
    /\brecordSeedFactorsSummary\b/.test(fileText)
  );
}

test("every script producers.yml runs with --apply, under scripts/producers/ or scripts/gen/, imports producer-summary.mjs", () => {
  const ymlText = readFileSync(WORKFLOW_PATH, "utf8");
  const scripts = findApplyInvokedProducerScripts(ymlText);

  // Not a vacuous pass: prove the extractor actually found the eleven scripts this lane wired, by name.
  assert.deepEqual(scripts, [
    "scripts/gen/emission-factors-desnz.mjs",
    "scripts/gen/emission-factors-epa.mjs",
    "scripts/gen/fetch-desnz-factors.mjs",
    "scripts/producers/market/ecb-fx-producer.mjs",
    "scripts/producers/market/eia-v2-petroleum-spot-producer.mjs",
    "scripts/producers/market/eu-weekly-oil-bulletin.mjs",
    "scripts/producers/market/ratify-series-items.mjs",
    "scripts/producers/market/refresh-published-price-statistics.mjs",
    "scripts/producers/regional/bls-oews-producer.mjs",
    "scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs",
    "scripts/producers/regional/eurostat-nrg-pc-205-producer.mjs",
  ]);

  const missing = scripts.filter((rel) => !scriptImportsProducerSummary(readFileSync(resolve(FSI_ROOT, rel), "utf8")));
  assert.deepEqual(missing, [], `these --apply-invoked producer scripts do not import producer-summary.mjs: ${missing.join(", ")}`);
});

test("ATTACK: findApplyInvokedProducerScripts + scriptImportsProducerSummary catches a script that does not import it", () => {
  const fixtureYml = `
      - name: A future producer step
        if: env.RUN_PRODUCER == 'all' || env.RUN_PRODUCER == 'future-thing'
        run: |
          if [ "$RUN_MODE" = "apply" ]; then
            node scripts/producers/market/future-thing-producer.mjs --apply
          else
            node scripts/producers/market/future-thing-producer.mjs
          fi
  `;
  const scripts = findApplyInvokedProducerScripts(fixtureYml);
  assert.deepEqual(scripts, ["scripts/producers/market/future-thing-producer.mjs"]);

  // The fixture script's own text: a producer that writes rows but never imports producer-summary.mjs --
  // exactly the recurrence this gate exists to catch.
  const fixtureScriptText = `
    import { readAll, guardedInsert } from "../../lib/db.mjs";
    async function main() { /* ... writes rows, never calls writeProducerSummary ... */ }
    main();
  `;
  assert.equal(scriptImportsProducerSummary(fixtureScriptText), false);

  const missing = scripts.filter((rel) => !scriptImportsProducerSummary(fixtureScriptText));
  assert.deepEqual(missing, ["scripts/producers/market/future-thing-producer.mjs"], "the attack fixture must be caught, not silently pass");
});

test("scriptImportsProducerSummary: true for both real relative-depth forms, false for an unrelated import", () => {
  assert.equal(scriptImportsProducerSummary('import { writeProducerSummary } from "../lib/producer-summary.mjs";'), true);
  assert.equal(scriptImportsProducerSummary('import { writeProducerSummary } from "../producers/lib/producer-summary.mjs";'), true);
  assert.equal(scriptImportsProducerSummary('import { readAll } from "../../lib/db.mjs";'), false);
});

test("findApplyInvokedProducerScripts excludes non-producer directories (scripts/verify/, scripts/lib/) even when run with --apply", () => {
  const ymlText = `
        run: node scripts/verify/population-report.mjs
        run: node scripts/lib/revalidate.mjs --apply app-data public-items
  `;
  assert.deepEqual(findApplyInvokedProducerScripts(ymlText), []);
});

// ---------------------------------------------------------------------------------------------------
// Recurrence gate (lane M9d correction, 2026-09-20): run 35533637184 failed with zero jobs ("This run
// likely failed because of a workflow file issue") because the original shape put
// `PRODUCER_SUMMARY_DIR: ${{ runner.temp }}/producer-summaries` in the JOB-level `env:` block. The
// `runner` context is not available there per GitHub's context-availability table (only github, needs,
// strategy, matrix, vars, secrets, inputs are) -- only inside steps. The fix moved the assignment into a
// step ("Resolve PRODUCER_SUMMARY_DIR") that exports it to $GITHUB_ENV before the first producer step.
// These three checks make this exact class of defect fail a future PR touching this file, not just this
// one instance.
// ---------------------------------------------------------------------------------------------------

/**
 * Extract the raw lines of a workflow-level (`indent === 0`) or job-level (`indent === 4`, this file's
 * own indentation for `jobs.produce.env`) `env:` block, keyed off indentation rather than a full YAML
 * parse -- matching this test file's existing "text scan over a real parser" precedent. A step-level
 * `env:` block (indented under a `- name: ...` list item, 8+ spaces in this file) is deliberately NOT
 * matched by either indent value, so a step's own `env:` never counts toward this check.
 * @param {string} ymlText
 * @param {number} indent
 * @returns {string[]} the block's own lines (not including the `env:` line itself), or [] if absent
 */
export function extractEnvBlockLines(ymlText, indent) {
  const lines = ymlText.split("\n");
  const envLineRe = new RegExp(`^ {${indent}}env:\\s*$`);
  const startIdx = lines.findIndex((l) => envLineRe.test(l));
  if (startIdx === -1) return [];

  const block = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const leadingSpaces = line.length - line.trimStart().length;
    if (leadingSpaces <= indent) break;
    block.push(line);
  }
  return block;
}

/**
 * True when any workflow-level or job-level `env:` value in `ymlText` references the `runner` context
 * (`${{ runner. ... }}`) -- a context unavailable at either level. Step-level `env:` blocks are excluded
 * by construction (see extractEnvBlockLines).
 * @param {string} ymlText
 * @returns {boolean}
 */
export function hasRunnerContextInJobOrWorkflowEnv(ymlText) {
  const workflowLevel = extractEnvBlockLines(ymlText, 0);
  const jobLevel = extractEnvBlockLines(ymlText, 4);
  return [...workflowLevel, ...jobLevel].some((line) => line.includes("${{ runner."));
}

test("producers.yml: no workflow-level or job-level env: value references the runner context", () => {
  const ymlText = readFileSync(WORKFLOW_PATH, "utf8");
  assert.equal(
    hasRunnerContextInJobOrWorkflowEnv(ymlText),
    false,
    "the runner context is not available in workflow-level or job-level env: (only inside steps) -- this made run 35533637184 fail with zero jobs"
  );
});

test("ATTACK: hasRunnerContextInJobOrWorkflowEnv catches a job-level env: value using the runner context", () => {
  const fixtureYml = `
name: Fixture
on: workflow_dispatch
jobs:
  produce:
    runs-on: ubuntu-latest
    env:
      SOME_VAR: ${"$"}{{ secrets.SOME_SECRET }}
      PRODUCER_SUMMARY_DIR: ${"$"}{{ runner.temp }}/producer-summaries
    steps:
      - name: A step
        run: echo hi
  `;
  assert.equal(hasRunnerContextInJobOrWorkflowEnv(fixtureYml), true, "the attack fixture must be caught, not silently pass");
});

test("ATTACK: hasRunnerContextInJobOrWorkflowEnv does not flag a step-level env: value using the runner context (that IS valid)", () => {
  const fixtureYml = `
name: Fixture
on: workflow_dispatch
jobs:
  produce:
    runs-on: ubuntu-latest
    env:
      SOME_VAR: ${"$"}{{ secrets.SOME_SECRET }}
    steps:
      - name: A step with a legitimate step-level runner reference
        env:
          TMP_DIR: ${"$"}{{ runner.temp }}/scratch
        run: echo hi
  `;
  assert.equal(hasRunnerContextInJobOrWorkflowEnv(fixtureYml), false);
});

/**
 * Index of the step that exports PRODUCER_SUMMARY_DIR to $GITHUB_ENV, or -1 if absent.
 * @param {string} ymlText
 * @returns {number}
 */
export function findProducerSummaryDirExportIndex(ymlText) {
  const exportRe = /PRODUCER_SUMMARY_DIR=.*>>\s*"?\$GITHUB_ENV"?/;
  const m = exportRe.exec(ymlText);
  return m ? m.index : -1;
}

/**
 * Index of every `node <path>.mjs ...--apply...` invocation restricted to scripts/producers/ and
 * scripts/gen/ (same restriction as findApplyInvokedProducerScripts), returned in source order.
 * @param {string} ymlText
 * @returns {number[]}
 */
export function findApplyInvokedProducerScriptStepIndices(ymlText) {
  const indices = [];
  const lineRe = /node\s+(scripts\/[^\s"]+\.mjs)([^\n]*)/g;
  let m;
  while ((m = lineRe.exec(ymlText))) {
    const scriptPath = m[1];
    const rest = m[2] ?? "";
    if (!/--apply\b/.test(rest)) continue;
    if (!PRODUCER_SCRIPT_DIR_RE.test(scriptPath)) continue;
    indices.push(m.index);
  }
  return indices;
}

test("producers.yml: PRODUCER_SUMMARY_DIR is exported to GITHUB_ENV in a step that precedes every --apply producer step", () => {
  const ymlText = readFileSync(WORKFLOW_PATH, "utf8");
  const exportIdx = findProducerSummaryDirExportIndex(ymlText);
  assert.notEqual(exportIdx, -1, "no step exports PRODUCER_SUMMARY_DIR to $GITHUB_ENV");

  const producerStepIndices = findApplyInvokedProducerScriptStepIndices(ymlText);
  assert.ok(producerStepIndices.length > 0, "sanity: expected at least one --apply-invoked producer step");

  const precededByExport = producerStepIndices.every((idx) => idx > exportIdx);
  assert.ok(precededByExport, "PRODUCER_SUMMARY_DIR must be exported to GITHUB_ENV before every --apply-invoked producer step, not after");
});

test("ATTACK: the ordering check catches PRODUCER_SUMMARY_DIR exported AFTER a producer step", () => {
  const fixtureYml = `
      - name: A producer step that runs BEFORE the export (the defect this attack proves is caught)
        run: |
          if [ "$RUN_MODE" = "apply" ]; then
            node scripts/producers/market/future-thing-producer.mjs --apply
          else
            node scripts/producers/market/future-thing-producer.mjs
          fi

      - name: Resolve PRODUCER_SUMMARY_DIR (too late)
        run: |
          echo "PRODUCER_SUMMARY_DIR=$RUNNER_TEMP/producer-summaries" >> "$GITHUB_ENV"
  `;
  const exportIdx = findProducerSummaryDirExportIndex(fixtureYml);
  assert.notEqual(exportIdx, -1);
  const producerStepIndices = findApplyInvokedProducerScriptStepIndices(fixtureYml);
  assert.equal(producerStepIndices.length, 1);
  assert.equal(producerStepIndices[0] < exportIdx, true, "the fixture's producer step must precede the export, proving the ordering check would fail it");
});
