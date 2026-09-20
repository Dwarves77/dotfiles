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
