/** Tests for scripts/proof/steps/manifest.mjs and chain-steps.json (lane PROOF-3). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { loadManifest, loadHops, validateManifest, validateAssertion, substitute, templateKeys } from "./manifest.mjs";

const manifest = loadManifest();
const hops = loadHops();
const clone = (x) => JSON.parse(JSON.stringify(x));

test("the hop registry is read from loop-hops.d: 16 hops, in numeric order, each with a producer and a consumer", () => {
  assert.equal(hops.length, 16);
  assert.deepEqual(hops.map((h) => h.num), ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16"]);
  for (const h of hops) {
    assert.match(h.consumerFile, /^\.github\/workflows\/.+\.yml$/);
    assert.ok(h.producerName.length > 0);
  }
});

test("the committed manifest is valid against the hop registry", () => {
  assert.deepEqual(validateManifest(manifest, hops), []);
});

test("every hop 01 to 16 is covered by a step, and the steps run in hop order", () => {
  const covered = manifest.steps.filter((s) => s.hop).map((s) => s.hop);
  for (const h of hops) assert.ok(covered.includes(h.num), `hop ${h.num} has no step`);
  const sorted = [...covered].sort();
  assert.deepEqual(covered, sorted);
});

test("every step has at least one explicit assertion naming a table and a predicate (the closing check is the one exception)", () => {
  for (const s of manifest.steps) {
    if (s.kind === "check") continue;
    assert.ok(Array.isArray(s.assertions) && s.assertions.length > 0, `step ${s.id} has no assertion`);
    for (const a of s.assertions) {
      const alts = a.kind === "any_of" ? a.of : [a];
      for (const x of alts) {
        assert.match(x.table ?? "", /^[a-z_][a-z0-9_]*$/, `${s.id}/${a.id}: table`);
        if (a.kind !== "snapshot_changed") assert.ok(typeof x.predicate === "string" && x.predicate.length > 0, `${s.id}/${a.id}: predicate`);
      }
    }
  }
});

test("the brief's named assertions are present: mint rows and items grew, cross references grew, terms, propagation, sources promoted, full_brief changed", () => {
  const find = (stepId, aid) => manifest.steps.find((s) => s.id === stepId)?.assertions.find((a) => a.id === aid);
  assert.equal(find("population-turn", "items-grew")?.table, "intelligence_items");
  assert.equal(find("population-turn", "flywheel-outcomes")?.table, "harness_runs");
  assert.equal(find("corpus-turn", "cross-references-grew")?.table, "item_cross_references");
  assert.equal(find("downstream-after-population", "terms-counted")?.table, "vocabulary_terms");
  assert.equal(find("propagation-after-downstream", "drained-or-nothing-eligible")?.kind, "any_of");
  assert.equal(find("source-resolution-after-brief-apply", "sources-promoted")?.table, "harness_runs");
  assert.equal(find("brief-apply", "full-brief-changed")?.kind, "snapshot_changed");
});

test("every script step's bash parses (bash -n) with the manifest's prelude", { skip: spawnSync("bash", ["--version"]).error ? "bash is not installed" : false }, () => {
  for (const s of manifest.steps.filter((x) => x.kind === "script")) {
    const r = spawnSync("bash", ["-n", "-c", `${manifest.shell_prelude.join("\n")}\n${s.script.join("\n")}`], { encoding: "utf8" });
    assert.equal(r.status, 0, `step ${s.id}: ${r.stderr}`);
  }
});

test("a step that runs a workflow's script carries that workflow's own command and the apply flag", () => {
  const text = (id) => manifest.steps.find((s) => s.id === id).script.join("\n");
  assert.match(text("source-sweep"), /run-source-sweep\.mjs --walker register-federal-register --mode apply/);
  assert.match(text("fetch-drain"), /run-fetch-drain\.mjs --mode apply --limit 8/);
  assert.match(text("ledger-consume"), /run-ledger-consume\.mjs --mode apply .*--verdicts "\$CP_VERDICTS_FILE"/);
  assert.match(text("population-turn"), /run-mint-batch\.mjs --census-rows .*--grade record --execute/);
  assert.match(text("population-turn"), /run-population-flywheel\.mjs --check-gate --harness-runs-dir "\$EMPTY_GATE_DIR"/);
  assert.match(text("corpus-turn"), /analyze-corpus\.mjs --signals/);
  assert.match(text("downstream-after-corpus"), /raise-term-needs\.mjs --mode apply/);
  assert.match(text("propagation-after-downstream"), /run-propagation-drain\.mjs "\$\{args\[@\]\}"/);
  assert.match(text("brief-apply"), /apply-record-briefs\.mjs --briefs "\$CP_BRIEFS_FILE" --execute/);
  assert.match(text("gate-a-after-brief-apply"), /gate-a-rescan\.mjs --mode apply/);
  assert.match(text("source-resolution-after-brief-apply"), /maintenance_step resolve-provisional-sources apply/);
  assert.match(text("research-walker"), /RESEARCH_WALKER_ENABLED=0/);
  for (const s of manifest.steps.filter((x) => x.kind === "script")) {
    // the one dry flag the chained workflows themselves carry: gate-a-rescan.yml runs attach-found-sources dry on a workflow_run
    const lines = s.script.filter((l) => !/attach-found-sources\.mjs/.test(l)).join("\n");
    assert.doesNotMatch(lines, /--mode dry|--dry\b/, `${s.id} runs a dry flag; the proof is apply mode`);
  }
});

test("no step script reaches a production credential name or a metered flag", () => {
  const all = manifest.steps.filter((x) => x.kind === "script").map((s) => s.script.join("\n")).join("\n") + manifest.shell_prelude.join("\n");
  for (const bad of ["SUPABASE_DB_PASSWORD", "APP_URL", "WORKER_SECRET", "GH_TOKEN", "GITHUB_TOKEN", "ANTHROPIC_API_KEY", "--allow-api", "gh workflow run"]) {
    assert.ok(!all.includes(bad), `a step script mentions ${bad}`);
  }
});

// ---- mutations: the validator refuses each kind of break ------------------------------------------------

test("MUTATION: dropping the only step of a hop is refused, naming the hop", () => {
  const m = clone(manifest);
  m.steps = m.steps.filter((s) => s.hop !== "13");
  assert.ok(validateManifest(m, hops).some((e) => /hop 13 .* is not covered/.test(e)));
});

test("MUTATION: a step that runs the wrong workflow for its hop is refused", () => {
  const m = clone(manifest);
  m.steps.find((s) => s.hop === "09").workflow_file = ".github/workflows/brief-apply.yml";
  assert.ok(validateManifest(m, hops).some((e) => /hop 09/.test(e) && /consumer/.test(e)));
});

test("MUTATION: a step that chains from the wrong producer is refused", () => {
  const m = clone(manifest);
  const s = m.steps.find((x) => x.hop === "04");
  s.upstream = { step: "source-sweep", name: "Source sweep" };
  assert.ok(validateManifest(m, hops).some((e) => /hop 04/.test(e) && /producer/.test(e)));
});

test("MUTATION: a step with no assertion is refused", () => {
  const m = clone(manifest);
  m.steps.find((s) => s.id === "corpus-turn").assertions = [];
  assert.ok(validateManifest(m, hops).some((e) => /corpus-turn/.test(e) && /at least one explicit assertion/.test(e)));
});

test("MUTATION: hops out of order are refused", () => {
  const m = clone(manifest);
  const i = m.steps.findIndex((s) => s.hop === "05");
  const j = m.steps.findIndex((s) => s.hop === "06");
  [m.steps[i], m.steps[j]] = [m.steps[j], m.steps[i]];
  assert.ok(validateManifest(m, hops).some((e) => /numeric order/.test(e)));
});

test("MUTATION: an upstream that has not run yet is refused", () => {
  const m = clone(manifest);
  m.steps.find((s) => s.id === "fetch-drain").upstream = { step: "corpus-turn", name: "Corpus turn" };
  assert.ok(validateManifest(m, hops).some((e) => /upstream step corpus-turn must appear earlier/.test(e)));
});

test("MUTATION: a root that feeds nothing is refused", () => {
  const m = clone(manifest);
  m.steps.push({ ...clone(m.steps.find((s) => s.id === "research-walker")), id: "orphan-root" });
  assert.ok(validateManifest(m, hops).some((e) => /root step orphan-root feeds no later step/.test(e)));
});

test("MUTATION: duplicate step ids, a missing script and a bad table identifier are refused", () => {
  const m = clone(manifest);
  m.steps[2].id = m.steps[1].id;
  m.steps.find((s) => s.id === "corpus-turn").script = [];
  m.steps.find((s) => s.id === "source-sweep").assertions[0].table = "harness_runs; drop table x";
  const errs = validateManifest(m, hops).join("\n");
  assert.match(errs, /duplicate step id/);
  assert.match(errs, /script must be a non-empty array/);
  assert.match(errs, /table must be a plain identifier/);
});

test("validateAssertion: kinds and their required fields", () => {
  assert.deepEqual(validateAssertion({ id: "a", kind: "count", table: "t", predicate: "true", min: 1 }, "x"), []);
  assert.deepEqual(validateAssertion({ id: "a", kind: "max", table: "t", predicate: "true", max: 0 }, "x"), []);
  assert.deepEqual(validateAssertion({ id: "a", kind: "growth", table: "t", predicate: "true", min: 1, direction: "down" }, "x"), []);
  assert.deepEqual(validateAssertion({ id: "a", kind: "snapshot_changed", table: "t", snapshot: "s", min: 1 }, "x"), []);
  assert.ok(validateAssertion({ id: "a", kind: "count", table: "t", predicate: "true" }, "x").length > 0, "count without min");
  assert.ok(validateAssertion({ id: "a", kind: "growth", table: "t", predicate: "true", min: 1, direction: "sideways" }, "x").length > 0);
  assert.ok(validateAssertion({ id: "a", kind: "any_of", of: [{ table: "t", predicate: "true", min: 1 }] }, "x").length > 0, "any_of needs two");
  assert.ok(validateAssertion({ id: "a", kind: "nope" }, "x").length > 0);
});

test("substitute inlines only safe values and refuses unknown variables and unsafe values", () => {
  assert.equal(substitute("a = '{{run_id}}' AND b >= '{{started_at.s1}}'", { run_id: "123", "started_at.s1": "2026-10-07 12:00:00.5+00" }), "a = '123' AND b >= '2026-10-07 12:00:00.5+00'");
  assert.throws(() => substitute("{{nope}}", { nope: "1" }), /unknown template variable/);
  assert.throws(() => substitute("{{run_id}}", {}), /no value yet/);
  assert.throws(() => substitute("{{run_id}}", { run_id: "1'; drop table x; --" }), /not safe to inline/);
  assert.deepEqual(templateKeys("{{run_id}} {{started_at.source-sweep}}"), ["run_id", "started_at.source-sweep"]);
});
