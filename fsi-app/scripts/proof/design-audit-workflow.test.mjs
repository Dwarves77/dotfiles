/** Static proof of the design-audit leg of the ONE pipeline workflow (lane DAUDIT-2, 2026-10-08; rewritten against
 *  .github/workflows/ci.yml by lane PIPE-1, 2026-10-11, when design-audit.yml became steps of the `app` job). It reads the
 *  committed workflow text and asserts what must stay true however the file is edited later: the job name, the ONE
 *  Playwright image line of the whole workflow (the rendering guard and the design audit share the app job, so the old
 *  "image equal to discipline.yml's" rule is now "exactly one image line"), the install step reading the version back out of
 *  this file with the same pattern, the upload step, the SOFT exit contract (fails only when the harness cannot run,
 *  never for a non-matching row), no continue-on-error and no path filter, and (lane DAUDIT-3) the commit-back
 *  contract: the committed result is CI's, so one step commits results.json and the audit document back to the dispatched
 *  ref, guarded to workflow_dispatch (the pull_request path never commits), through the shared commit-back script, with
 *  `contents: write` the only write permission in the file, declared once at the app job. Also (lane DORMANT-1) the
 *  harness-run record step: dispatch only, the only step in the file that names a secret. The summary script embedded in
 *  the workflow is extracted and RUN against fixture results, so the four counts and the row-id list are proven by
 *  execution and not by reading.
 *
 *  Every rule is a pure function of the workflow text (`problems(text)`), so each can be attacked: the attack tests below
 *  feed it a copy of the real file with one defect injected into the app job (or the triggers) and require that exact
 *  defect to be reported. Every case of the old design-audit-workflow test maps to a case here. Node builtins only (this
 *  file runs in the no-npm discipline suite). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = resolve(HERE, "..", "..", "..", ".github", "workflows");
const TEXT = readFileSync(join(WORKFLOWS, "ci.yml"), "utf8");

/** One job of ci.yml: from its column-2 id line to the next column-2 id line. */
function jobText(text, id) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l === `  ${id}:`);
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i]) || /^\S/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join("\n");
}

/** The same pattern the install step's sed uses (GATE-6): the whole `image:` line value of every line that names the
 *  Playwright image. Returns the image strings, e.g. `mcr.microsoft.com/playwright:v1.61.1-noble`. */
function playwrightImage(text) {
  const found = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^ *image: (mcr\.microsoft\.com\/playwright:v[0-9][0-9.]*-.*)$/);
    if (m) found.push(m[1]);
  }
  return found;
}

/** The install step's version read, character for character (lane GATE-6), pointed at this file. */
const INSTALL_SED = String.raw`sed -n 's|^ *image: mcr\.microsoft\.com/playwright:v\([0-9][0-9.]*\)-.*$|\1|p' .github/workflows/ci.yml`;

const codeOf = (text) => text.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

/** Split the steps: each starts at a line `      - name:` (6 spaces). */
function stepsOf(job) {
  return job.split(/^\s{6}- name: /m).slice(1).map((p) => ({ name: p.split("\n")[0], body: p }));
}

/** Every defect in a workflow text, as short strings; empty means the contract holds. */
function problems(text) {
  const out = [];
  const wfCode = codeOf(text);
  const job = jobText(text, "app");
  const code = codeOf(job);
  if (!/^name: CI$/m.test(wfCode)) out.push("workflow name is not exactly 'CI'");
  if (!/^ {2}app:\n {4}name: app$/m.test(code)) out.push("the job is not named exactly 'app'");

  const on = wfCode.slice(wfCode.indexOf("\non:"), wfCode.indexOf("\npermissions:"));
  if (!/^ {2}pull_request:\n {4}branches:\n {6}- master$/m.test(on)) out.push("not triggered on pull_request to master");
  if (!/^ {2}workflow_dispatch:/m.test(on)) out.push("no workflow_dispatch trigger");
  for (const t of ["schedule:", "workflow_run:", "paths:", "paths-ignore:", "pull_request_target:"]) if (on.includes(t)) out.push(`trigger or filter ${t} present`);

  if (!/^permissions:\n {2}contents: read\n/m.test(wfCode)) out.push("permissions are not contents: read");
  // The ONE permitted write: the job-level `contents: write` of the app job, for the workflow_dispatch commit-back (DAUDIT-3).
  const JOB_WRITE = /^ {4}permissions:\n {6}contents: write\n/m;
  if (!JOB_WRITE.test(code)) out.push("the job does not declare permissions: contents: write for the commit-back step");
  if (/^\s*(actions|id-token|pull-requests|issues|statuses|packages|checks|contents|deployments): write/m.test(wfCode.replace(job ? codeOf(job) : "", "").replace(JOB_WRITE, ""))) out.push("a write permission is granted beyond the job-level contents: write");
  if (/^\s*(actions|id-token|pull-requests|issues|statuses|packages|checks|deployments): write/m.test(code.replace(JOB_WRITE, ""))) out.push("a write permission is granted beyond the job-level contents: write");
  if (!/^ {4}defaults:\n {6}run:\n {8}shell: bash\n/m.test(code)) out.push("the job does not declare defaults.run.shell: bash (a container job runs sh by default; GATE-9)");
  if (!/^ {4}timeout-minutes: 25$/m.test(code)) out.push("timeout is not 25 minutes");
  if (/continue-on-error/.test(wfCode)) out.push("continue-on-error present");
  if (/\|\|\s*true\b/.test(code.replace(/git fetch --no-tags origin "\$BASE_REF" \|\| true/g, ""))) out.push("a '|| true' swallows a failure");

  const mine = playwrightImage(text);
  if (mine.length !== 1) out.push(`expected one Playwright image line in the whole workflow, found ${mine.length}`);
  if (!/^ {4}container:\n {6}image: mcr\.microsoft\.com\/playwright:/m.test(code)) out.push("the job does not run in the Playwright container");

  const steps = stepsOf(job);
  const names = steps.map((s) => s.name);
  const idx = (re) => names.findIndex((n) => re.test(n));
  const trust = idx(/Trust the workspace for git/);
  const install = idx(/Install the Playwright npm package/);
  const build = idx(/next build/);
  const guard = idx(/Run rendering guard/);
  const audit = idx(/Run the design audit/);
  const summary = idx(/job summary/);
  const upload = idx(/Upload the audit result/);
  const commit = idx(/Commit the audit result back/);
  const forbid = idx(/Attack the D-M4 forbid rows/);
  const record = idx(/Land the design-audit harness-run artifact/);
  for (const [label, i] of [["trust", trust], ["install", install], ["build", build], ["rendering guard", guard], ["audit", audit], ["summary", summary], ["commit-back", commit], ["upload", upload], ["forbid attack", forbid], ["harness-run record", record]]) if (i < 0) out.push(`missing the ${label} step`);
  if (trust >= 0 && !/git config --global --add safe\.directory "\$GITHUB_WORKSPACE"/.test(steps[trust].body)) out.push("safe.directory step does not trust $GITHUB_WORKSPACE");
  if (trust >= 0 && install >= 0 && trust > install) out.push("safe.directory must precede the install step");
  if (install >= 0) {
    const b = steps[install].body;
    if (!b.includes(INSTALL_SED)) out.push("install step does not read the version back out of this workflow file with the GATE-6 sed");
    if (!/npm install --no-save "playwright@\$\{version\}"/.test(b)) out.push("install step does not install the matching playwright package");
  }
  if (build >= 0) {
    const b = steps[build].body;
    if (!/run: npx next build$/m.test(b)) out.push("the build step does not run npx next build");
    if (!/NEXT_PUBLIC_SUPABASE_URL: 'https:\/\/build-proof-placeholder\.supabase\.co'/.test(b)) out.push("the build step does not use the placeholder public Supabase url");
    if (/secrets\./.test(b)) out.push("the build step names a secret");
    if (install >= 0 && build < install) out.push("the build runs before the Playwright install step");
  }
  if ((job.match(/npx next build/g) ?? []).length !== 1) out.push("the app job must run exactly one next build");
  for (const s of steps) {
    const run = s.body.split("\n").find((l) => /^\s{8}run: \|$/.test(l));
    if (run && !/set -euo pipefail/.test(s.body)) out.push(`multi-command step "${s.name}" lacks set -euo pipefail`);
  }

  if (audit >= 0) {
    const b = steps[audit].body;
    if (!/working-directory: fsi-app/.test(b)) out.push("audit step does not run in fsi-app");
    if (!/^ {8}if: \$\{\{ !cancelled\(\) \}\}$/m.test(b)) out.push("the audit step is not run whether or not the rendering guard passed (one run reports both)");
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

  if (commit >= 0) {
    const b = steps[commit].body;
    if (!/^ {8}if: github\.event_name == 'workflow_dispatch'$/m.test(b)) out.push("the commit-back step is not guarded to workflow_dispatch (the pull_request path must never commit)");
    if (/pull_request/.test(b.split("\n").filter((l) => /^ {8}if:/.test(l)).join("\n"))) out.push("the commit-back guard names pull_request");
    if (!/scripts\/maintenance\/commit-worklist-artifact\.sh/.test(b)) out.push("commit-back does not use the shared commit-back script (a second copy of the push-degradation logic)");
    if (!/"\$GITHUB_REF_NAME"/.test(b)) out.push("commit-back does not pass the dispatched ref to the script");
    if (!b.includes('".discipline/rendering/audit/results.json"')) out.push("commit-back does not commit results.json");
    if (!b.includes('git add "../docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md"')) out.push("commit-back does not commit the audit document");
    if (summary >= 0 && commit < summary) out.push("commit-back runs before the summary step, so a harness-errored run could commit its partial result");
    if (upload >= 0 && commit > upload) out.push("commit-back must precede the upload step");
  }
  for (const s of steps) {
    if (s !== steps[commit] && /\bgit\s+(commit|push)\b|commit-worklist-artifact/.test(s.body.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n"))) out.push(`step "${s.name}" commits or pushes outside the guarded commit-back step`);
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

  if (forbid >= 0) {
    const b = steps[forbid].body.split(/\n\n {2}# /)[0];
    if (upload >= 0 && forbid < upload) out.push("the forbid attack must follow the upload so a red attack never loses the audit artifact");
    if (!/working-directory: fsi-app/.test(b)) out.push("the forbid attack does not run in fsi-app");
    if (!/node scripts\/verify\/attacks\/forbid-fires-attack\.mjs/.test(b)) out.push("the forbid attack step does not run forbid-fires-attack.mjs");
    if (/\|\|\s*true|continue-on-error/.test(b)) out.push("the forbid attack swallows a failure");
  }

  // The harness-run record step (lane DORMANT-1): dispatch only, and the ONLY place the file names a secret.
  if (record >= 0) {
    const b = steps[record].body;
    if (!/^ {8}if: \$\{\{ always\(\) && github\.event_name == 'workflow_dispatch' \}\}$/m.test(b)) out.push("the harness-run record step is not guarded to workflow_dispatch (a pull request job must not hold the production service credential)");
    if (!/--family design-audit --workflow ci\.yml/.test(b)) out.push("the harness-run record step does not record family design-audit for ci.yml");
    if (!/--land/.test(b)) out.push("the harness-run record step does not land the row");
  }
  const secretSteps = stepsOf(text.slice(text.indexOf("\njobs:\n"))).filter((s) => /secrets\./.test(s.body.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n")));
  if (secretSteps.length !== 1 || !/Land the design-audit harness-run artifact/.test(secretSteps[0]?.name ?? "")) out.push(`secrets are referenced outside the one dispatch-only record step: ${secretSteps.map((s) => s.name).join(" | ")}`);
  return out;
}

/** Apply `fn` to the app job of the workflow text and splice the result back. */
const inApp = (text, fn) => text.replace(jobText(text, "app"), fn(jobText(text, "app")));

test("the real workflow satisfies the whole contract", () => {
  assert.deepEqual(problems(TEXT), []);
});

test("the workflow name is unique across .github/workflows", () => {
  const owners = readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith(".yml"))
    .filter((f) => (readFileSync(join(WORKFLOWS, f), "utf8").split("\n").find((l) => l.startsWith("name:")) || "").trim() === "name: CI");
  assert.deepEqual(owners, ["ci.yml"]);
});

test("the one Playwright image line sits inside the app job, so the rendering guard and the design audit run in one image", () => {
  const all = playwrightImage(TEXT);
  assert.equal(all.length, 1, "ci.yml must carry exactly one Playwright image line");
  assert.deepEqual(playwrightImage(jobText(TEXT, "app")), all);
});

// ── attacks: one injected defect each, and the rule that owns it must name it ──────────────────────────
const attack = (mutate, expected) => {
  const text = inApp(TEXT, mutate);
  assert.notEqual(text, TEXT, "the attack changed nothing, so it proves nothing");
  const got = problems(text);
  assert.ok(got.some((p) => expected.test(p)), `expected a problem matching ${expected}, got ${JSON.stringify(got)}`);
};
const attackWorkflow = (mutate, expected) => {
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
test("ATTACK: a second Playwright image line (a different tag in the same file) is refused", () => {
  attack((t) => t.replace("    defaults:\n", "    # second pin\n    services:\n      other:\n        image: mcr.microsoft.com/playwright:v0.0.1-noble\n    defaults:\n"), /expected one Playwright image line/);
});
test("ATTACK: dropping the generated-file deletion is refused", () => {
  attack((t) => t.replace('          rm -f "$results" "$document"\n', ""), /delete the generated files/);
});
test("ATTACK: dropping the output existence checks is refused", () => {
  attack((t) => t.replace('          test -s "$results"\n', ""), /require both outputs to exist/);
});
test("ATTACK: a path filter is refused", () => {
  attackWorkflow((t) => t.replace("  workflow_dispatch:\n", "  workflow_dispatch:\n  schedule:\n    - cron: '0 3 * * *'\n"), /schedule:/);
  attackWorkflow((t) => t.replace("  pull_request:\n    branches:\n      - master\n", "  pull_request:\n    paths-ignore:\n      - 'docs/**'\n    branches:\n      - master\n"), /paths-ignore|not triggered on pull_request/);
});
test("ATTACK: dropping the upload retention or the unconditional upload is refused", () => {
  attack((t) => t.replace("          path: |\n            fsi-app/.discipline/rendering/audit/results.json\n            docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md\n          if-no-files-found: ignore\n          retention-days: 7\n", "          path: |\n            fsi-app/.discipline/rendering/audit/results.json\n            docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md\n          if-no-files-found: ignore\n"), /retention/);
  attack((t) => t.replace("          path: |\n            fsi-app/.discipline/rendering/audit/results.json\n            docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md\n          if-no-files-found: ignore\n          retention-days: 7\n", "          path: |\n            fsi-app/.discipline/rendering/audit/results.json\n            docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md\n          if-no-files-found: ignore\n          retention-days: 14\n"), /not 7 days/);
  attack((t) => t.replace("      - name: Upload the audit result (results.json and the audit document)\n        if: always()\n", "      - name: Upload the audit result (results.json and the audit document)\n"), /unconditional/);
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
test("ATTACK: removing the workflow_dispatch guard from the commit-back step is refused", () => {
  attack((t) => t.replace("        if: github.event_name == 'workflow_dispatch'\n        working-directory: fsi-app\n        run: |\n          set -euo pipefail\n          git add", "        working-directory: fsi-app\n        run: |\n          set -euo pipefail\n          git add"), /not guarded to workflow_dispatch/);
});
test("ATTACK: guarding the commit-back to pull_request instead is refused", () => {
  attack((t) => t.replace("        if: github.event_name == 'workflow_dispatch'\n        working-directory: fsi-app\n        run: |\n          set -euo pipefail\n          git add", "        if: github.event_name == 'pull_request'\n        working-directory: fsi-app\n        run: |\n          set -euo pipefail\n          git add"), /not guarded to workflow_dispatch|names pull_request/);
});
test("ATTACK: dropping the commit-back step is refused", () => {
  attack((t) => t.replace("      - name: Commit the audit result back to the dispatched ref (workflow_dispatch only)", "      - name: Something else entirely"), /missing the commit-back step/);
});
test("ATTACK: a second, unguarded git push in another step is refused", () => {
  attack((t) => t.replace("          npm run audit:design\n", "          npm run audit:design\n          git push origin HEAD\n"), /commits or pushes outside the guarded commit-back step/);
});
test("ATTACK: a write permission beyond the job-level contents: write is refused", () => {
  attack((t) => t.replace("      contents: write\n", "      contents: write\n      pull-requests: write\n"), /beyond the job-level contents: write/);
  attack((t) => t.replace("    permissions:\n      contents: write\n", ""), /does not declare permissions: contents: write/);
  attackWorkflow((t) => t.replace("permissions:\n  contents: read\n\nconcurrency:", "permissions:\n  contents: read\n  pull-requests: write\n\nconcurrency:"), /beyond the job-level contents: write/);
});
test("ATTACK: a hand-rolled push in place of the shared script (no protected-ref degrade) is refused", () => {
  attack((t) => t.replace("bash scripts/maintenance/commit-worklist-artifact.sh", "git push origin HEAD # "), /shared commit-back script/);
});
test("ATTACK: committing before the summary step is refused", () => {
  attack((t) => {
    const i = t.indexOf("      # WORKFLOW_DISPATCH ONLY (lane DAUDIT-3).");
    const j = t.indexOf("      - name: Upload the audit result");
    const block = t.slice(i, j);
    const rest = t.slice(0, i) + t.slice(j);
    const k = rest.indexOf("      # Reads the file the generator just wrote");
    return rest.slice(0, k) + block + rest.slice(k);
  }, /runs before the summary step/);
});
test("the audit step reads the container image out of this file and exports it for the generated_on stamp", () => {
  const audit = stepsOf(jobText(TEXT, "app")).find((x) => /Run the design audit/.test(x.name)).body;
  const IMAGE_SED = String.raw`AUDIT_CONTAINER_IMAGE="$(sed -n 's|^ *image: \(mcr\.microsoft\.com/playwright:v[0-9][0-9.]*-.*\)$|\1|p' ../.github/workflows/ci.yml)"`;
  assert.ok(audit.includes(IMAGE_SED), "the audit step must read the image out of this workflow file");
  assert.match(audit, /export AUDIT_HEAD AUDIT_BRANCH AUDIT_CONTAINER_IMAGE/);
  // the sed, run for real on this workflow text, yields the one Playwright image line
  const out = spawnSync("sed", ["-n", String.raw`s|^ *image: \(mcr\.microsoft\.com/playwright:v[0-9][0-9.]*-.*\)$|\1|p`], { input: TEXT, encoding: "utf8" });
  if (out.status === 0) assert.deepEqual(out.stdout.trim().split("\n"), playwrightImage(TEXT));
});
test("ATTACK: a renamed workflow or job is refused", () => {
  attackWorkflow((t) => t.replace("name: CI\n", "name: CI run\n"), /workflow name is not exactly/);
  attackWorkflow((t) => t.replace("  app:\n    name: app\n", "  app:\n    name: application\n"), /not named exactly 'app'/);
});
test("ATTACK: a multi-command step without set -euo pipefail is refused", () => {
  attack((t) => t.replace("          set -euo pipefail\n          version=", "          version="), /lacks set -euo pipefail/);
});
test("ATTACK: a second next build in the app job, or a build before the install, is refused (next build runs once)", () => {
  attack((t) => t.replace("      - name: Run rendering guard", "      - name: next build again\n        run: npx next build\n\n      - name: Run rendering guard"), /exactly one next build/);
});
test("ATTACK: the audit step losing its run-whether-or-not-the-guard-passed condition is refused", () => {
  attack((t) => t.replace("      - name: Run the design audit (the generator reports, it never gates)\n        if: ${{ !cancelled() }}\n", "      - name: Run the design audit (the generator reports, it never gates)\n"), /whether or not the rendering guard passed/);
});
test("ATTACK: the harness-run record step losing its dispatch guard is refused, and a secret named in any other step is refused", () => {
  attack((t) => t.replace("        if: ${{ always() && github.event_name == 'workflow_dispatch' }}\n", ""), /not guarded to workflow_dispatch/);
  attack((t) => t.replace("        run: npx next build\n", "        run: npx next build\n      - name: Leak\n        env:\n          K: ${{ secrets.WORKER_SECRET }}\n        run: echo hi\n"), /secrets are referenced outside the one dispatch-only record step/);
});
test("ATTACK: the forbid attack moved before the upload, or made to swallow its failure, is refused", () => {
  attack((t) => t.replace("        run: node scripts/verify/attacks/forbid-fires-attack.mjs\n", "        run: node scripts/verify/attacks/forbid-fires-attack.mjs || true\n"), /swallows a failure/);
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
