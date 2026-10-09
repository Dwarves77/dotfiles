/** Static proof of the Design audit workflow's contract (lane DAUDIT-2, 2026-10-08). It reads the committed
 *  workflow text and asserts what must stay true however the file is edited later: the name, the Playwright
 *  image equal to the one discipline.yml's rendering-guard job carries (read with the same pattern the
 *  install step uses, never a literal), the upload step, the SOFT exit contract (fails only when the harness
 *  cannot run, never for a non-matching row), no continue-on-error and no path filter. The summary script
 *  embedded in the workflow is extracted and RUN against fixture results, so the four counts and the row-id
 *  list are proven by execution and not by reading.
 *
 *  Every rule is a pure function of the workflow text (`problems(text)`), so each can be attacked: the
 *  attack tests below feed it a copy of the real file with one defect injected and require that exact defect
 *  to be reported. Node builtins only (this file runs in the no-npm discipline suite). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = resolve(HERE, "..", "..", "..", ".github", "workflows");
const TEXT = readFileSync(join(WORKFLOWS, "design-audit.yml"), "utf8");
const DISCIPLINE = readFileSync(join(WORKFLOWS, "discipline.yml"), "utf8");

/** The same pattern the install step's sed uses (GATE-6): the whole `image:` line value of the one line
 *  that names the Playwright image. Returns the image string, e.g. `mcr.microsoft.com/playwright:v1.61.1-noble`. */
function playwrightImage(text) {
  const found = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^ *image: (mcr\.microsoft\.com\/playwright:v[0-9][0-9.]*-.*)$/);
    if (m) found.push(m[1]);
  }
  return found;
}

/** The install step's version read, character for character (lane GATE-6), pointed at this file. */
const INSTALL_SED = String.raw`sed -n 's|^ *image: mcr\.microsoft\.com/playwright:v\([0-9][0-9.]*\)-.*$|\1|p' .github/workflows/design-audit.yml`;

const codeOf = (text) => text.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

/** Split the steps: each starts at a line `      - name:` (6 spaces). */
function stepsOf(text) {
  return text.split(/^\s{6}- name: /m).slice(1).map((p) => ({ name: p.split("\n")[0], body: p }));
}

/** Every defect in a workflow text, as short strings; empty means the contract holds. */
function problems(text, disciplineText = DISCIPLINE) {
  const out = [];
  const code = codeOf(text);
  const head = text.split("\n").find((l) => l.trim() !== "");
  if (head !== "name: Design audit") out.push("name is not exactly 'Design audit'");

  const on = code.slice(code.indexOf("\non:"), code.indexOf("\npermissions:"));
  if (!/^ {2}pull_request:\n {4}branches:\n {6}- master$/m.test(on)) out.push("not triggered on pull_request to master");
  if (!/^ {2}workflow_dispatch:/m.test(on)) out.push("no workflow_dispatch trigger");
  for (const t of ["push:", "schedule:", "workflow_run:", "paths:", "paths-ignore:"]) if (on.includes(t)) out.push(`trigger or filter ${t} present`);

  if (!/^permissions:\n {2}contents: read\n/m.test(code)) out.push("permissions are not contents: read");
  if (/^\s*(actions|id-token|pull-requests|issues|statuses|packages|checks|contents): write/m.test(code)) out.push("a write permission is granted");
  if (!/^ {4}defaults:\n {6}run:\n {8}shell: bash\n/m.test(code)) out.push("the job does not declare defaults.run.shell: bash (a container job runs sh by default; GATE-9)");
  if (!/^ {4}timeout-minutes: 15$/m.test(code)) out.push("timeout is not 15 minutes");
  if (/continue-on-error/.test(code)) out.push("continue-on-error present");
  if (/\|\|\s*true\b/.test(code)) out.push("a '|| true' swallows a failure");

  const mine = playwrightImage(text);
  const theirs = playwrightImage(disciplineText);
  if (mine.length !== 1) out.push(`expected one Playwright image line, found ${mine.length}`);
  if (theirs.length !== 1) out.push(`discipline.yml carries ${theirs.length} Playwright image lines, expected the rendering-guard job's one`);
  if (mine.length === 1 && theirs.length === 1 && mine[0] !== theirs[0]) out.push(`image ${mine[0]} differs from discipline.yml's ${theirs[0]}`);
  if (!/^ {4}container:\n {6}image: mcr\.microsoft\.com\/playwright:/m.test(code)) out.push("the job does not run in the Playwright container");

  const steps = stepsOf(text);
  const names = steps.map((s) => s.name);
  const idx = (re) => names.findIndex((n) => re.test(n));
  const trust = idx(/Trust the workspace for git/);
  const install = idx(/Install the Playwright npm package/);
  const audit = idx(/Run the design audit/);
  const summary = idx(/job summary/);
  const upload = idx(/Upload the audit result/);
  for (const [label, i] of [["trust", trust], ["install", install], ["audit", audit], ["summary", summary], ["upload", upload]]) if (i < 0) out.push(`missing the ${label} step`);
  if (trust >= 0 && !/git config --global --add safe\.directory "\$GITHUB_WORKSPACE"/.test(steps[trust].body)) out.push("safe.directory step does not trust $GITHUB_WORKSPACE");
  if (trust >= 0 && install >= 0 && trust > install) out.push("safe.directory must precede the install step");
  if (install >= 0) {
    const b = steps[install].body;
    if (!b.includes(INSTALL_SED)) out.push("install step does not read the version back out of this workflow file with the GATE-6 sed");
    if (!/npm install --no-save "playwright@\$\{version\}"/.test(b)) out.push("install step does not install the matching playwright package");
  }
  for (const s of steps) {
    const run = s.body.split("\n").find((l) => /^\s{8}run: \|$/.test(l));
    if (run && !/set -euo pipefail/.test(s.body)) out.push(`multi-command step "${s.name}" lacks set -euo pipefail`);
  }

  if (audit >= 0) {
    const b = steps[audit].body;
    if (!/working-directory: fsi-app/.test(b)) out.push("audit step does not run in fsi-app");
    const rm = b.indexOf('rm -f "$results" "$document"');
    const run = b.indexOf("npm run audit:design");
    const t1 = b.indexOf('test -s "$results"');
    const t2 = b.indexOf('test -s "$document"');
    if (rm < 0) out.push("audit step does not delete the generated files first (a stale file could pass for fresh output)");
    if (run < 0) out.push("audit step does not run npm run audit:design");
    if (rm >= 0 && run >= 0 && rm > run) out.push("the generated files are deleted after the run, not before");
    if (t1 < 0 || t2 < 0 || (run >= 0 && (t1 < run || t2 < run))) out.push("audit step does not require both outputs to exist after the run");
    if (!/results="\.discipline\/rendering\/audit\/results\.json"/.test(b)) out.push("results path is not the generator's results.json");
    if (!/document="\.\.\/docs\/design\/handoff-2026-09-06\/AUDIT-2026-09-07\.md"/.test(b)) out.push("document path is not the generator's audit document");
  }

  if (summary >= 0) {
    const b = steps[summary].body;
    if (/\bexit\s+[1-9]/.test(b) || /process\.exit\(\s*[1-9]/.test(b)) out.push("the summary step can exit non-zero for a finding");
    if (!/if \(results\.errors\.length > 0\) \{[\s\S]*?process\.exitCode = 1;/.test(b)) out.push("a non-empty errors list does not fail the summary step");
    if (/process\.exitCode\s*=\s*1/.test(b.replace(/if \(results\.errors\.length > 0\) \{[\s\S]*?\n {10}\}/, ""))) out.push("the summary step sets a failing exit code outside the errors branch");
    if (!/GITHUB_STEP_SUMMARY/.test(b)) out.push("summary step does not write $GITHUB_STEP_SUMMARY");
  }

  if (upload >= 0) {
    const b = steps[upload].body;
    if (!/uses: actions\/upload-artifact@v4/.test(b)) out.push("upload step does not use actions/upload-artifact@v4");
    if (!/name: design-audit-results/.test(b)) out.push("artifact is not named design-audit-results");
    if (!/retention-days: 7$/m.test(b)) out.push("artifact retention is not 7 days (the F68 Actions-storage budget)");
    if (!/fsi-app\/\.discipline\/rendering\/audit\/results\.json/.test(b)) out.push("results.json is not uploaded");
    if (!/docs\/design\/handoff-2026-09-06\/AUDIT-2026-09-07\.md/.test(b)) out.push("the audit document is not uploaded");
    if (!/if: always\(\)/.test(b)) out.push("upload is not unconditional (it must also keep the partial output of a failed run)");
  }
  return out;
}

test("the real workflow satisfies the whole contract", () => {
  assert.deepEqual(problems(TEXT), []);
});

test("the workflow name is unique across .github/workflows", () => {
  const owners = readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith(".yml"))
    .filter((f) => (readFileSync(join(WORKFLOWS, f), "utf8").split("\n").find((l) => l.startsWith("name:")) || "").trim() === "name: Design audit");
  assert.deepEqual(owners, ["design-audit.yml"]);
});

test("the image is read from discipline.yml with the install step's own pattern, and is the rendering-guard job's", () => {
  const theirs = playwrightImage(DISCIPLINE);
  assert.equal(theirs.length, 1, "discipline.yml must carry exactly one Playwright image line");
  assert.deepEqual(playwrightImage(TEXT), theirs);
  const rg = DISCIPLINE.slice(DISCIPLINE.indexOf("  rendering-guard:"));
  assert.ok(rg.includes(`image: ${theirs[0]}`), "the one image line must sit inside the rendering-guard job");
});

// ── attacks: one injected defect each, and the rule that owns it must name it ──────────────────────────
const attack = (mutate, expected) => {
  const text = mutate(TEXT);
  assert.notEqual(text, TEXT, "the attack changed nothing, so it proves nothing");
  const got = problems(text);
  assert.ok(got.some((p) => expected.test(p)), `expected a problem matching ${expected}, got ${JSON.stringify(got)}`);
};

test("ATTACK: continue-on-error on any step is refused", () => {
  attack((t) => t.replace("        uses: actions/upload-artifact@v4", "        continue-on-error: true\n        uses: actions/upload-artifact@v4"), /continue-on-error/);
});
test("ATTACK: a '|| true' on the generator run is refused", () => {
  attack((t) => t.replace("          npm run audit:design\n", "          npm run audit:design || true\n"), /\|\| true/);
});
test("ATTACK: a different image tag is refused", () => {
  attack((t) => t.replace(/(image: mcr\.microsoft\.com\/playwright:v)[0-9.]+/, "$10.0.1"), /differs from discipline\.yml/);
});
test("ATTACK: a literal image that discipline.yml does not carry is refused", () => {
  const other = DISCIPLINE.replace(/(image: mcr\.microsoft\.com\/playwright:v)[0-9.]+/, "$19.9.9");
  assert.ok(problems(TEXT, other).some((p) => /differs from discipline\.yml/.test(p)));
});
test("ATTACK: dropping the generated-file deletion is refused", () => {
  attack((t) => t.replace('          rm -f "$results" "$document"\n', ""), /delete the generated files/);
});
test("ATTACK: dropping the output existence checks is refused", () => {
  attack((t) => t.replace('          test -s "$results"\n', ""), /require both outputs to exist/);
});
test("ATTACK: a path filter is refused", () => {
  attack((t) => t.replace("  workflow_dispatch:\n", "  workflow_dispatch:\n  push:\n    paths-ignore:\n      - 'docs/**'\n"), /paths-ignore|push:/);
});
test("ATTACK: dropping the upload retention or the unconditional upload is refused", () => {
  attack((t) => t.replace("          retention-days: 7\n", ""), /retention/);
  attack((t) => t.replace("retention-days: 7", "retention-days: 14"), /not 7 days/);
  attack((t) => t.replace("        if: always()\n", ""), /unconditional/);
});
test("ATTACK: a summary step that exits non-zero for a finding is refused", () => {
  attack((t) => t.replace("          console.log(out);\n", "          console.log(out);\n          if (nonMatching.length > 0) process.exit(1);\n"), /summary step can exit non-zero/);
});
test("ATTACK: dropping the errors-list failure is refused", () => {
  attack((t) => t.replace("            process.exitCode = 1;\n", ""), /errors list does not fail/);
});
test("ATTACK: a finding that sets the failing exit code is refused", () => {
  attack((t) => t.replace("          console.log(out);\n", "          console.log(out);\n          if (nonMatching.length > 0) process.exitCode = 1;\n"), /outside the errors branch/);
});
test("ATTACK: a renamed workflow is refused", () => {
  attack((t) => t.replace("name: Design audit\n", "name: Design audit run\n"), /name is not exactly/);
});
test("ATTACK: a multi-command step without set -euo pipefail is refused", () => {
  attack((t) => t.replace("          set -euo pipefail\n          version=", "          version="), /lacks set -euo pipefail/);
});

// ── the embedded summary script, run for real ─────────────────────────────────────────────────────────
/** The node script between `node --input-type=module - <<'NODE'` and the closing `NODE`, with the YAML block
 *  indentation (10 spaces) removed. */
function summaryScript(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /node --input-type=module - <<'NODE'$/.test(l));
  assert.ok(start >= 0, "summary heredoc not found");
  const end = lines.findIndex((l, i) => i > start && l.trim() === "NODE");
  assert.ok(end > start, "summary heredoc is not closed");
  return lines.slice(start + 1, end).map((l) => l.slice(10)).join("\n");
}

function runSummary(results) {
  const dir = mkdtempSync(join(tmpdir(), "design-audit-summary-"));
  try {
    mkdirSync(join(dir, ".discipline", "rendering", "audit"), { recursive: true });
    if (results !== null) writeFileSync(join(dir, ".discipline", "rendering", "audit", "results.json"), typeof results === "string" ? results : JSON.stringify(results));
    const summaryFile = join(dir, "summary.md");
    const run = spawnSync(process.execPath, ["--input-type=module", "-"], { cwd: dir, input: summaryScript(TEXT), env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile }, encoding: "utf8" });
    let written = "";
    try { written = readFileSync(summaryFile, "utf8"); } catch { /* the script died before writing */ }
    return { status: run.status, written, stdout: run.stdout, stderr: run.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const row = (spec, status) => ({ spec, status, target: "t", property: "p", expected: "x", actual: "y" });

test("the summary states the four counts and every non-matching row as <spec id>#<index>, and exits 0", () => {
  const rows = [row("alpha", "MATCH"), row("alpha", "MISMATCH"), row("beta", "NOT BUILT"), row("beta", "MATCH"), row("gamma", "NOT IN SPEC"), row("gamma", "MISMATCH")];
  const r = runSummary({ runAt: "2026-10-08T00:00:00.000Z", specs: [{ __id: "alpha" }, { __id: "beta" }, { __id: "gamma" }], rows, errors: [] });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.written, /\| MATCH \| 2 \|/);
  assert.match(r.written, /\| MISMATCH \| 2 \|/);
  assert.match(r.written, /\| NOT BUILT \| 1 \|/);
  assert.match(r.written, /\| NOT IN SPEC \| 1 \|/);
  assert.match(r.written, /Non-matching rows \(4\)/);
  assert.match(r.written, /`alpha#1`, `beta#2`, `gamma#4`, `gamma#5`/);
  assert.doesNotMatch(r.written, /alpha#0|beta#3/, "a MATCH row must not be listed");
});

test("a run with no non-matching row says so and exits 0", () => {
  const r = runSummary({ runAt: "2026-10-08T00:00:00.000Z", specs: [{ __id: "alpha" }], rows: [row("alpha", "MATCH")], errors: [] });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.written, /Non-matching rows \(0\)/);
  assert.match(r.written, /None\./);
});

test("harness errors are listed and FAIL the summary step (a spec whose mount threw is the harness unable to run)", () => {
  const r = runSummary({ runAt: "2026-10-08T00:00:00.000Z", specs: [{ __id: "alpha" }], rows: [row("alpha", "MATCH")], errors: [{ spec: "alpha", message: "mount threw" }] });
  assert.notEqual(r.status, 0, "a non-empty errors list must fail");
  assert.match(r.written, /Harness errors: 1\./);
  assert.match(r.written, /`alpha`: mount threw/);
  assert.match(r.stdout, /::error::1 spec file\(s\) hit a harness error/);
});

test("ATTACK: a results.json that cannot be read is the harness failing, so the summary step fails", () => {
  assert.notEqual(runSummary(null).status, 0, "a missing results.json must fail");
  assert.notEqual(runSummary("{ not json").status, 0, "an unparsable results.json must fail");
});
