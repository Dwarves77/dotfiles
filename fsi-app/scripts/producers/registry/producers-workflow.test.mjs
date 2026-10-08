// producers-workflow.test.mjs -- lane S8-E0. The gate that keeps producers.yml registry-driven: the workflow
// references the registry runner, it carries no hand list of registry producers (no step condition, no
// dispatch option and no script path for any entry), and the registry step sits after the step that exports
// PRODUCER_SUMMARY_DIR. Attack-tested: a fixture workflow that re-adds a hand step for a registry entry is
// caught by the same extractor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProducerRegistry } from "./load-registry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const WORKFLOW = resolve(REPO_ROOT, ".github", "workflows", "producers.yml");
const RUNNER = "scripts/producers/registry/run-registered.mjs";

/** Lines of a workflow with comment-only lines removed (comments may name a producer; code may not). */
function codeLines(text) {
  return text.split("\n").filter((l) => !l.trim().startsWith("#"));
}

/** The producer input's options line: the choice list that carries "all" (the mode input's is [dry, apply]). */
function producerOptionsLine(code) {
  return code.split("\n").find((l) => /^\s*options:\s*\[/.test(l) && /\ball\b/.test(l)) ?? "";
}

/** Every way the workflow could hand-list a registry entry. @returns {string[]} human-readable problems */
export function findHandListProblems(ymlText, entries) {
  const code = codeLines(ymlText).join("\n");
  const problems = [];
  const optionsLine = producerOptionsLine(code);
  const options = optionsLine.replace(/^[^[]*\[/, "").replace(/\].*$/, "").split(",").map((s) => s.trim());
  for (const e of entries) {
    if (new RegExp(`RUN_PRODUCER\\s*==\\s*'${e.name}'`).test(code)) problems.push(`step condition names ${e.name}`);
    if (options.includes(e.name)) problems.push(`dispatch options list ${e.name}`);
    for (const script of [e.script, e.pre?.script].filter(Boolean)) {
      if (code.includes(script)) problems.push(`script path ${script} appears in code`);
    }
  }
  return problems;
}

test("producers.yml runs the registry runner, and the producer input offers 'registry'", () => {
  const text = readFileSync(WORKFLOW, "utf8");
  const code = codeLines(text).join("\n");
  assert.ok(code.includes(`node ${RUNNER}`), "no step runs the registry runner");
  assert.ok(/--mode "\$RUN_MODE"/.test(code), "the runner step must pass the workflow mode");
  const optionsLine = producerOptionsLine(code);
  assert.ok(/\bregistry\b/.test(optionsLine), "the producer choice list has no 'registry' option");
  assert.ok(/registry_producer:/.test(code), "no registry_producer input to name one entry");
});

test("producers.yml carries no hand list of registry producers (conditions, options, script paths)", () => {
  const entries = loadProducerRegistry();
  assert.ok(entries.length >= 4, "sanity: the registry holds the four moved producers");
  assert.deepEqual(findHandListProblems(readFileSync(WORKFLOW, "utf8"), entries), []);
});

test("ATTACK: findHandListProblems catches a hand step, a hand option and a hand script path for a registry entry", () => {
  const entries = loadProducerRegistry();
  const fixture = `
        options: [all, registry, ecb-fx]
      - name: hand step
        if: env.RUN_PRODUCER == 'all' || env.RUN_PRODUCER == 'ecb-fx'
        run: node scripts/producers/market/ecb-fx-producer.mjs --apply
  `;
  const problems = findHandListProblems(fixture, entries);
  assert.ok(problems.includes("step condition names ecb-fx"));
  assert.ok(problems.includes("dispatch options list ecb-fx"));
  assert.ok(problems.includes("script path scripts/producers/market/ecb-fx-producer.mjs appears in code"));
});

test("the registry step comes after the step that exports PRODUCER_SUMMARY_DIR and before the artifact step", () => {
  const text = readFileSync(WORKFLOW, "utf8");
  const exportIdx = text.search(/PRODUCER_SUMMARY_DIR=.*>>\s*"?\$GITHUB_ENV"?/);
  const runnerIdx = text.indexOf(`node ${RUNNER}`);
  const artifactIdx = text.indexOf("emit-producers-artifact.mjs");
  assert.ok(exportIdx !== -1 && runnerIdx !== -1 && artifactIdx !== -1);
  assert.ok(exportIdx < runnerIdx, "PRODUCER_SUMMARY_DIR must be exported before the registry runner");
  assert.ok(runnerIdx < artifactIdx, "the registry runner must run before the artifact step");
});
