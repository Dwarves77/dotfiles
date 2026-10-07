// chain-handoff-wiring.test.mjs (lane CHAIN-1, 2026-10-07). Pins the workflow wiring the first dry fire of the
// chain (chain-fire-2026-10-06, findings F1, F2, F3, F5) found broken. The repo tests workflow env text (see
// apply-record-briefs.test.mjs's brief-apply.yml tests); where a step holds real logic (the RUN_DRIVER flag) the
// step's own script is extracted from the yml and EXECUTED under bash with fixture env, so the flag logic is
// proven, not pattern-matched. node:test + node: builtins only (portable, no-npm glob).
// Run: node --test scripts/lib/chain-handoff-wiring.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = resolve(HERE, "..", "..", "..", ".github", "workflows");
const yml = (name) => readFileSync(join(WORKFLOWS, name), "utf8");

/** The lines of the step whose `- name:` line starts with `namePrefix` (step indent: six spaces). */
function stepLines(text, namePrefix) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith("      - name:") && l.slice("      - name:".length).trim().replace(/^['"]/, "").startsWith(namePrefix));
  assert.ok(start >= 0, `no step named "${namePrefix}"`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {6}- /.test(lines[i]) || (/^\S/.test(lines[i]) && lines[i].trim() !== "")) { end = i; break; }
  }
  return lines.slice(start, end);
}
const stepText = (text, prefix) => stepLines(text, prefix).join("\n");

/** The `run: |` script of a step, dedented. */
function runScript(text, prefix) {
  const lines = stepLines(text, prefix);
  const at = lines.findIndex((l) => /^ {8}run: \|\s*$/.test(l));
  assert.ok(at >= 0, `step "${prefix}" has no run: | block`);
  return lines.slice(at + 1).map((l) => l.replace(/^ {10}/, "")).join("\n");
}

// ── F1: the three apply workflows run their driver on a dispatch that names a file ────────────────────────
const APPLY_WORKFLOWS = [
  { file: "brief-apply.yml", fileVar: "RUN_BRIEFS_FILE", driverSteps: ["Build driver flags", "Validate briefs_file", "apply-record-briefs"] },
  { file: "theme-briefs.yml", fileVar: "RUN_BRIEFS_FILE", driverSteps: ["Apply the theme-briefs batch"] },
  { file: "question-answers.yml", fileVar: "RUN_ANSWERS_FILE", driverSteps: ["Apply the question-answers batch"] },
];
const RUN_DRIVER_STEP = "Resolve RUN_DRIVER";

function resolveFlag(script, env) {
  const dir = mkdtempSync(join(tmpdir(), "run-driver-"));
  try {
    const ghEnv = join(dir, "github_env").replace(/\\/g, "/");
    writeFileSync(ghEnv, "");
    const base = { ...process.env };
    for (const k of ["PUSH_BATCH_COUNT", "PUSH_BATCH_FILE", "RUN_BRIEFS_FILE", "RUN_ANSWERS_FILE", "RUN_EVENT"]) delete base[k];
    const r = spawnSync("bash", ["-e", "-c", script], { env: { ...base, ...env, GITHUB_ENV: ghEnv }, encoding: "utf8" });
    assert.equal(r.status, 0, `script failed: ${r.stderr}`);
    const text = readFileSync(ghEnv, "utf8");
    const m = /^RUN_DRIVER=(.*)$/m.exec(text);
    assert.ok(m, `RUN_DRIVER was not written to GITHUB_ENV (got ${JSON.stringify(text)})`);
    return m[1];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const w of APPLY_WORKFLOWS) {
  test(`${w.file}: RUN_DRIVER is true for a dispatch that names a file, false for one that does not (the F1 skip)`, () => {
    const script = runScript(yml(w.file), RUN_DRIVER_STEP);
    assert.equal(resolveFlag(script, { RUN_EVENT: "workflow_dispatch", [w.fileVar]: "scripts/turns/x/batches/x-001.json" }), "true");
    assert.equal(resolveFlag(script, { RUN_EVENT: "workflow_dispatch", [w.fileVar]: "" }), "false");
    assert.equal(resolveFlag(script, { RUN_EVENT: "workflow_dispatch" }), "false");
  });

  test(`${w.file}: on a push RUN_DRIVER follows PUSH_BATCH_COUNT (count 0 or unset is false), a dispatch file never matters`, () => {
    const script = runScript(yml(w.file), RUN_DRIVER_STEP);
    assert.equal(resolveFlag(script, { RUN_EVENT: "push", PUSH_BATCH_COUNT: "1", PUSH_BATCH_FILE: "scripts/a.json" }), "true");
    assert.equal(resolveFlag(script, { RUN_EVENT: "push", PUSH_BATCH_COUNT: "0" }), "false");
    assert.equal(resolveFlag(script, { RUN_EVENT: "push" }), "false");
    assert.equal(resolveFlag(script, { RUN_EVENT: "push", PUSH_BATCH_COUNT: "0", [w.fileVar]: "ignored.json" }), "false");
  });

  test(`${w.file}: every driver step gates on RUN_DRIVER and nothing gates on the old PUSH_BATCH_COUNT comparison`, () => {
    const text = yml(w.file);
    for (const name of w.driverSteps) {
      assert.match(stepText(text, name), /if: .*env\.RUN_DRIVER == 'true'/, `${name} must gate on env.RUN_DRIVER`);
    }
    const ifLines = text.split("\n").filter((l) => /^\s*if:/.test(l));
    assert.deepEqual(ifLines.filter((l) => l.includes("PUSH_BATCH_COUNT")), [], "no if: may compare PUSH_BATCH_COUNT (unset coerces to 0 and the step is skipped)");
  });
}

// ── F5: the guard is told the REAL requested mode ─────────────────────────────────────────────────────
test("F5: no workflow hardcodes --requested-mode apply into the chained dry-run guard call", () => {
  for (const f of ["population-turn.yml", "corpus-turn.yml", "downstream-chain.yml", "propagation-drain.yml", "brief-export.yml"]) {
    assert.ok(!/--requested-mode apply/.test(yml(f)), `${f} still hardcodes --requested-mode apply`);
    assert.ok(yml(f).includes("chained-dry-guard.mjs"), `${f} must still call the guard (F61)`);
  }
});

test("F5: the four mode-carrying workflows pass inputs.mode (apply when a chained firing has no inputs); brief-export has no mode and says read-only", () => {
  for (const f of ["population-turn.yml", "corpus-turn.yml", "downstream-chain.yml", "propagation-drain.yml"]) {
    assert.ok(yml(f).includes(`--requested-mode "\${{ inputs.mode || 'apply' }}"`), `${f}: the guard must receive inputs.mode`);
  }
  assert.ok(yml("brief-export.yml").includes("--requested-mode read-only"));
});

// ── F2: Population turn and Downstream chain read their upstream through harness_runs, not branches ───
test("F2: Population turn and Downstream chain call the one upstream-artifact reader with their own consumer name", () => {
  const pop = yml("population-turn.yml");
  const down = yml("downstream-chain.yml");
  assert.match(pop, /upstream-artifact\.mjs read --consumer population-turn --upstream-name "\$UPSTREAM_NAME" --upstream-run-id "\$UPSTREAM_RUN_ID" --run-mode "\$RUN_MODE"/);
  assert.match(down, /upstream-artifact\.mjs read --consumer downstream-chain --upstream-name "\$UPSTREAM_NAME" --upstream-run-id "\$UPSTREAM_RUN_ID" --run-mode "\$RUN_MODE"/);
});

test("F2: the branch discovery code is gone (no artifact branch fetch, no ls-tree of a family directory, no population/ turn/ ledger-consume/ candidates)", () => {
  for (const f of ["population-turn.yml", "downstream-chain.yml"]) {
    const text = yml(f);
    const code = text.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
    assert.ok(!/ledger-consume\/\$UPSTREAM_RUN_ID/.test(code), `${f}: ledger-consume branch discovery`);
    assert.ok(!/population\/\$UPSTREAM_RUN_ID/.test(code), `${f}: population branch discovery`);
    assert.ok(!/turn\/\$UPSTREAM_RUN_ID/.test(code), `${f}: turn branch discovery`);
    assert.ok(!/UPSTREAM_HEAD_BRANCH/.test(code), `${f}: head_branch discovery`);
    assert.ok(!/NEW_ARTIFACT/.test(code), `${f}: new-artifact-on-branch discovery`);
  }
});

test("F2: Population turn installs unconditionally so a NO-OP can land its row, and records the NO-OP", () => {
  const pop = yml("population-turn.yml");
  assert.ok(!/RUN_SKIP != 'true' \}\}\n\s+with:\n\s+node-version/.test(pop), "setup-node must not be gated on RUN_SKIP");
  assert.ok(!/- name: Install\n\s+if:/.test(pop), "Install must not be gated on RUN_SKIP");
  const noop = stepText(pop, "Record a NO-OP run");
  assert.match(noop, /if: \$\{\{ always\(\) && env\.RUN_SKIP == 'true' \}\}/);
  assert.match(noop, /upstream-artifact\.mjs noop --family mint --mode "\$RUN_MODE"/);
  const order = pop.split("\n").map((l, i) => [l, i]);
  const idx = (needle) => order.find(([l]) => l.includes(needle))[1];
  assert.ok(idx("- name: Record a NO-OP run") < idx("- name: Land this run's harness-run artifact"), "the NO-OP row is written before the landing step");
});

// ── F3: every chained consumer stamps upstream_run_id (writeRunArtifact reads GITHUB_EVENT_WORKFLOW_RUN_ID) ─
test("F3: Downstream chain and Propagation drain export the upstream run id for writeRunArtifact's upstream_run_id stamp", () => {
  const down = yml("downstream-chain.yml");
  assert.match(stepText(down, "Resolve run parameters and the chaining gate"), /GITHUB_EVENT_WORKFLOW_RUN_ID=\$\{UPSTREAM_RUN_ID:-\}/);
  const prop = yml("propagation-drain.yml");
  const resolve = stepText(prop, "Resolve run parameters and the chaining gate");
  assert.match(resolve, /GITHUB_EVENT_WORKFLOW_RUN_ID=\$\{RUN_UPSTREAM_RUN_ID:-\}/);
  assert.match(resolve, /RUN_UPSTREAM_RUN_ID="\$CHAIN_UPSTREAM_RUN_ID"/, "the F60 fallback dispatch's input is the upstream id");
  assert.match(resolve, /RUN_UPSTREAM_RUN_ID="\$UPSTREAM_RUN_ID"/, "a native workflow_run event's id is the upstream id");
});

test("F3: Propagation drain records a NO-OP row and installs unconditionally so it can land", () => {
  const prop = yml("propagation-drain.yml");
  assert.ok(!/- name: Install\n\s+if:/.test(prop));
  assert.match(stepText(prop, "Record a NO-OP run"), /upstream-artifact\.mjs noop --family propagation --mode "\$RUN_MODE"/);
});

// ── ADR-031: the loop id is carried from the upstream row into every consumer that records one ─────────
test("ADR-031: Population turn and Downstream chain carry the upstream row's loop id (explicit id, not the disk resolver)", () => {
  const pop = yml("population-turn.yml");
  assert.match(pop, /RUN_UPSTREAM_LOOP_RUN_ID="\$\(printf '%s\\n' "\$HANDOFF" \| sed -n 's\/\^CHAIN_UPSTREAM_LOOP_RUN_ID=\/\/p'\)"/);
  assert.match(pop, /args\+=\(--loop-run-id "\$RUN_UPSTREAM_LOOP_RUN_ID"\)/, "run-mint-batch receives it");
  assert.match(stepText(pop, "Record a NO-OP run"), /--loop-run-id "\$RUN_UPSTREAM_LOOP_RUN_ID"/);
  const down = yml("downstream-chain.yml");
  assert.match(down, /CHAIN_UPSTREAM_LOOP_RUN_ID=/);
  assert.match(stepText(down, "Record this chain's own harness-run artifact"), /DC_LOOP_RUN_ID: \$\{\{ env\.RUN_UPSTREAM_LOOP_RUN_ID \}\}/);
  assert.match(readFileSync(join(HERE, "..", "turns", "emit-downstream-chain-artifact.mjs"), "utf8"), /explicit: process\.env\.DC_LOOP_RUN_ID \|\| null/);
});

// ── F3 / F1: Brief apply lands its artifact in harness_runs (the hop 10 and 12 producer row) ──────────
test("F3: Brief apply lands its harness-run artifact into harness_runs, before the commit step stages it", () => {
  const text = yml("brief-apply.yml");
  const land = stepText(text, "Land this run's harness-run artifact into harness_runs");
  assert.match(land, /if: always\(\)/);
  assert.match(land, /deliver-artifact-branch\.sh/);
  const lines = text.split("\n");
  const at = (needle) => lines.findIndex((l) => l.includes(needle));
  assert.ok(at("- name: Land this run's harness-run artifact into harness_runs") < at("- name: Commit the run artifact back to the dispatched ref"),
    "deliver-artifact-branch.sh finds artifacts by `git status` (untracked); the commit step would hide them");
});

// ── lane CHAIN-2 (2026-10-07, ADR-031): every other chained consumer carries the upstream's loop id ──────
// CHAIN-1 gave Population turn and Downstream chain the upstream row's loop id. Seven more emitters resolved it
// from files on disk (null in CI). Each of their workflows now reads the upstream row through the same reader
// and exports the id its emitter takes as the explicit id; the emitter's own test proves explicit wins.
const READ_STEP = "Read the upstream loop run id";
const LOOP_ID_CONSUMERS = [
  { file: "corpus-turn.yml", envVar: "CT_LOOP_RUN_ID", gate: "github.event_name == 'workflow_run'", first: "node scripts/turns/emit-corpus-turn-artifact.mjs", reader: "scripts/turns/emit-corpus-turn-artifact.mjs", expr: "explicit: env.CT_LOOP_RUN_ID || null" },
  { file: "ledger-consume.yml", envVar: "LEDGER_CONSUME_LOOP_RUN_ID", gate: "github.event_name == 'workflow_run'", first: "node scripts/turns/run-ledger-consume.mjs", reader: "scripts/turns/run-ledger-consume.mjs", expr: "env.LEDGER_CONSUME_LOOP_RUN_ID || null" },
  { file: "fetch-drain.yml", envVar: "FETCH_DRAIN_LOOP_RUN_ID", gate: "github.event_name == 'workflow_run'", first: "node scripts/turns/run-fetch-drain.mjs", reader: "scripts/turns/run-fetch-drain.mjs", expr: "env.FETCH_DRAIN_LOOP_RUN_ID || null" },
  { file: "brief-export.yml", envVar: "BE_LOOP_RUN_ID", gate: "env.RUN_UPSTREAM_RUN_ID != ''", first: "node scripts/turns/emit-brief-export-artifact.mjs", reader: "scripts/turns/emit-brief-export-artifact.mjs", expr: "explicit: env.BE_LOOP_RUN_ID || null" },
  { file: "gate-a-rescan.yml", envVar: "GAR_LOOP_RUN_ID", gate: "env.GAR_UPSTREAM_RUN_ID != ''", first: "node scripts/turns/emit-gate-a-rescan-artifact.mjs", reader: "scripts/turns/emit-gate-a-rescan-artifact.mjs", expr: "explicit: env.GAR_LOOP_RUN_ID || null" },
  { file: "source-resolution.yml", envVar: "SR_LOOP_RUN_ID", gate: "env.SR_UPSTREAM_RUN_ID != ''", first: "node scripts/turns/emit-source-resolution-artifact.mjs", reader: "scripts/turns/emit-source-resolution-artifact.mjs", expr: "explicit: env.SR_LOOP_RUN_ID || null" },
  { file: "propagation-drain.yml", envVar: "RUN_UPSTREAM_LOOP_RUN_ID", gate: "env.RUN_UPSTREAM_RUN_ID != ''", first: "node scripts/turns/run-propagation-drain.mjs", reader: "scripts/turns/run-propagation-drain.mjs", expr: "explicit: explicitLoopRunId" },
];

/** Index of the first non-comment line containing `needle`. */
function firstCodeLine(text, needle) {
  const at = text.split("\n").findIndex((l) => !/^\s*#/.test(l) && l.includes(needle));
  assert.ok(at >= 0, `no code line contains ${needle}`);
  return at;
}

for (const c of LOOP_ID_CONSUMERS) {
  test(`ADR-031 (${c.file}): reads the upstream row's loop id through the one reader, gated on a chained firing, before the emitter runs`, () => {
    const text = yml(c.file);
    const step = stepText(text, READ_STEP);
    assert.ok(step.includes(`if: \${{ ${c.gate} }}`), `the read step must gate on ${c.gate}`);
    assert.match(step, /node scripts\/lib\/upstream-artifact\.mjs read --consumer downstream-chain --upstream-name "\$CHAIN_UPSTREAM_NAME" --upstream-run-id "\$CHAIN_UPSTREAM_RUN_ID" --run-mode dry/);
    assert.match(step, /sed -n 's\/\^CHAIN_UPSTREAM_LOOP_RUN_ID=\/\/p'/);
    assert.ok(step.includes(`echo "${c.envVar}=$LOOP_ID" >> "$GITHUB_ENV"`), `must export ${c.envVar}`);
    assert.match(step, /::warning::/, "a read failure is a warning and a null id, never a red run");
    const lines = text.split("\n");
    const readAt = lines.findIndex((l) => l.startsWith("      - name:") && l.includes(READ_STEP));
    assert.ok(readAt < firstCodeLine(text, c.first), "the read step must run before the step that writes the artifact");
  });

  test(`ADR-031 (${c.file}): the consumer takes the exported id as its explicit id`, () => {
    const src = readFileSync(join(HERE, "..", "..", c.reader), "utf8");
    assert.ok(src.includes(c.expr), `${c.reader} must pass ${c.expr}`);
  });
}

test("ADR-031 (propagation-drain.yml): the drain gets --loop-run-id and the NO-OP row carries it too", () => {
  const text = yml("propagation-drain.yml");
  assert.match(stepText(text, "run-propagation-drain.mjs"), /args\+=\(--loop-run-id "\$RUN_UPSTREAM_LOOP_RUN_ID"\)/);
  assert.match(stepText(text, "Record a NO-OP run"), /--loop-run-id "\$\{RUN_UPSTREAM_LOOP_RUN_ID:-\}"/);
});

// The read step's own script, EXECUTED under bash with a stub `node`, so the export is proven and not pattern-matched.
function runReadStep(file, nodeBody, env) {
  const script = runScript(yml(file), READ_STEP);
  const dir = mkdtempSync(join(tmpdir(), "read-loop-id-"));
  try {
    const bin = join(dir, "bin");
    spawnSync("mkdir", ["-p", bin]);
    const stub = join(bin, "node");
    writeFileSync(stub, `#!/bin/sh\n${nodeBody}\n`);
    chmodSync(stub, 0o755);
    const ghEnv = join(dir, "github_env").replace(/\\/g, "/");
    writeFileSync(ghEnv, "");
    const sep = process.platform === "win32" ? ";" : ":";
    const r = spawnSync("bash", ["-e", "-c", script], {
      env: { ...process.env, ...env, GITHUB_ENV: ghEnv, PATH: `${bin.replace(/\\/g, "/")}${sep}${process.env.PATH}` },
      encoding: "utf8",
    });
    return { status: r.status, stdout: r.stdout, ghEnv: readFileSync(ghEnv, "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const c of LOOP_ID_CONSUMERS) {
  test(`ADR-031 (${c.file}): executed, the read step exports the upstream row's loop id, an empty one, or a warning on a failed read`, () => {
    const env = { CHAIN_UPSTREAM_NAME: "Source sweep", CHAIN_UPSTREAM_RUN_ID: "424242" };
    const ok = runReadStep(c.file, `echo "CHAIN_SKIP=true"; echo "CHAIN_UPSTREAM_LOOP_RUN_ID=sweep-loop-5"`, env);
    assert.equal(ok.status, 0);
    assert.equal(ok.ghEnv, `${c.envVar}=sweep-loop-5\n`);
    const none = runReadStep(c.file, `echo "CHAIN_UPSTREAM_LOOP_RUN_ID="`, env);
    assert.equal(none.status, 0);
    assert.equal(none.ghEnv, `${c.envVar}=\n`);
    const failed = runReadStep(c.file, `echo "read failed" >&2; exit 1`, env);
    assert.equal(failed.status, 0, "a failed read must not fail the run");
    assert.equal(failed.ghEnv, "", "a failed read exports nothing, so the emitter records null");
    assert.match(failed.stdout, /::warning::/);
  });
}
