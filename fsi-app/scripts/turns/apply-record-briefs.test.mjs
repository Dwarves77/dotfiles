// apply-record-briefs.test.mjs - the PURE plan-builder coverage for the brief-apply driver (task 3.4,
// brief-chain build plan Part 3, 2026-09-11). Covers exactly what the brief's own gate names: order,
// skip-on-stale-hash, and the per-item outcome vocabulary - never the I/O-bearing per-item executor
// (applyOneEntry), which calls the live canonical-pipeline.ts functions (sectionBrief/groundBrief/
// growSources call svc() internally and accept no injected client, so they cannot be driven by a fake
// client the way generateBriefFromInjected's own tests do - the same "not unit-tested directly" posture
// run-population-flywheel.mjs's own step handlers/runFlywheelForOneArtifact already carry, per that
// module's own test file header).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseArgs,
  buildApplyPlan,
  applyOneEntry,
  APPLY_STEP_ORDER,
  ENTITIES_MODULE_NOT_PRESENT,
  DEFAULT_HARNESS_RUNS_DIR,
  DEFAULT_IO_BUDGET_MB,
  BYTES_PER_MB,
  importLinkItemEntities,
  resolveBriefsInput,
  runApplyLoop,
  PIPELINE_POOL_REREADS,
  IO_BUDGET_STOP_REASON,
} from "./apply-record-briefs.mjs";
import { validateRunArtifact } from "../lib/run-artifact.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER_PATH = join(HERE, "apply-record-briefs.mjs");

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: --briefs is required", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--briefs/);
});

test("parseArgs: dry is the default (no --execute)", () => {
  const r = parseArgs(["--briefs", "x.json"]);
  assert.equal(r.ok, true);
  assert.equal(r.execute, false);
  assert.equal(r.limit, null);
  assert.equal(r.afterId, null);
  assert.equal(r.allowBriefOverwrite, false);
  assert.equal(r.harnessRunsDir, null);
});

test("parseArgs: --execute, --limit, --after-id, --allow-brief-overwrite, --harness-runs-dir all thread through", () => {
  const r = parseArgs([
    "--briefs", "x.json",
    "--execute",
    "--limit", "5",
    "--after-id", "11111111-1111-1111-1111-111111111111",
    "--allow-brief-overwrite",
    "--harness-runs-dir", "scripts/tmp/brief-apply",
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.execute, true);
  assert.equal(r.limit, 5);
  assert.equal(r.afterId, "11111111-1111-1111-1111-111111111111");
  assert.equal(r.allowBriefOverwrite, true);
  assert.equal(r.harnessRunsDir, "scripts/tmp/brief-apply");
});

test("parseArgs: --limit must be a non-negative integer", () => {
  const r = parseArgs(["--briefs", "x.json", "--limit", "-1"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--limit/);
});

test("parseArgs: --limit rejects a non-numeric string", () => {
  const r = parseArgs(["--briefs", "x.json", "--limit", "five"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--limit/);
});

test("parseArgs: --limit 0 is valid (process nothing this dispatch)", () => {
  const r = parseArgs(["--briefs", "x.json", "--limit", "0"]);
  assert.equal(r.ok, true);
  assert.equal(r.limit, 0);
});

test("parseArgs: --help short-circuits without requiring --briefs", () => {
  const r = parseArgs(["--help"]);
  assert.equal(r.ok, true);
  assert.equal(r.help, true);
});

test("parseArgs: an unknown flag is a hard error (strict:true)", () => {
  const r = parseArgs(["--briefs", "x.json", "--bogus"]);
  assert.equal(r.ok, false);
});

// ── resolveBriefsInput (D27, defect-fix-plan-2026-09-12.md, W9 lane L18) ───────────────────────────────
// The batch-003 defect: a --briefs path that did not resolve from the driver's own cwd parsed to zero
// entries and both the dry and the apply run completed GREEN with nothing written. These three cases are
// the exact ones the brief names: missing path refused, empty entries refused, a real fixture proceeds.

function briefsTmpDir() {
  return mkdtempSync(join(tmpdir(), "resolve-briefs-input-test-"));
}

test("resolveBriefsInput: a path that does not resolve to an existing file is refused, naming BOTH the given path and the resolved absolute path", () => {
  const dir = briefsTmpDir();
  try {
    const givenPath = join(dir, "does-not-exist.json");
    const r = resolveBriefsInput(givenPath);
    assert.equal(r.ok, false);
    assert.match(r.error, /does not exist/);
    assert.ok(r.error.includes(givenPath), "error must include the path as given");
    assert.ok(r.error.includes(r.resolvedPath), "error must include the resolved absolute path");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveBriefsInput: a file that parses to zero entries is refused, naming BOTH the given path and the resolved absolute path", () => {
  const dir = briefsTmpDir();
  try {
    const givenPath = join(dir, "empty-entries.json");
    writeFileSync(givenPath, JSON.stringify({ batch: "b1", generated_at: new Date().toISOString(), entries: [] }));
    const r = resolveBriefsInput(givenPath);
    assert.equal(r.ok, false);
    assert.match(r.error, /ZERO entries/);
    assert.ok(r.error.includes(givenPath));
    assert.ok(r.error.includes(r.resolvedPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveBriefsInput: a file whose entries key is absent entirely is also refused as zero entries (never guesses a non-array into an entry count)", () => {
  const dir = briefsTmpDir();
  try {
    const givenPath = join(dir, "no-entries-key.json");
    writeFileSync(givenPath, JSON.stringify({ batch: "b1", generated_at: new Date().toISOString() }));
    const r = resolveBriefsInput(givenPath);
    assert.equal(r.ok, false);
    assert.match(r.error, /ZERO entries/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveBriefsInput: a real fixture path with at least one entry proceeds (ok:true, entries carried through)", () => {
  const dir = briefsTmpDir();
  try {
    const givenPath = join(dir, "record-briefs-fixture.json");
    const entries = [{ item_id: "11111111-1111-1111-1111-111111111111", source_pool_hash: "h", body: "b", metadata: {}, claims: [] }];
    writeFileSync(givenPath, JSON.stringify({ batch: "b1", generated_at: new Date().toISOString(), entries }));
    const r = resolveBriefsInput(givenPath);
    assert.equal(r.ok, true);
    assert.equal(r.entries.length, 1);
    assert.equal(r.entries[0].item_id, entries[0].item_id);
    assert.equal(r.resolvedPath, resolve(givenPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveBriefsInput: a malformed (non-JSON) file is refused with both paths named, distinct from the zero-entries message", () => {
  const dir = briefsTmpDir();
  try {
    const givenPath = join(dir, "not-json.json");
    writeFileSync(givenPath, "{ this is not valid json");
    const r = resolveBriefsInput(givenPath);
    assert.equal(r.ok, false);
    assert.match(r.error, /failed to read\/parse/);
    assert.ok(r.error.includes(givenPath));
    assert.ok(r.error.includes(r.resolvedPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveBriefsInput: CLI end-to-end - a missing --briefs path exits 1 and prints both paths, before any DB client is built (dry mode, the default)", () => {
  const dir = briefsTmpDir();
  try {
    const givenPath = join(dir, "missing.json");
    const harnessRunsDir = join(dir, "harness-runs", "brief-apply");
    const res = run(["--briefs", givenPath, "--harness-runs-dir", harnessRunsDir]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /does not exist/);
    assert.ok(res.stderr.includes(givenPath));
    assert.ok(res.stderr.includes(resolve(givenPath)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveBriefsInput: CLI end-to-end - a zero-entry --briefs file exits 1 and prints both paths, in apply mode too", () => {
  const dir = briefsTmpDir();
  try {
    const givenPath = join(dir, "empty.json");
    writeFileSync(givenPath, JSON.stringify({ batch: "b1", generated_at: new Date().toISOString(), entries: [] }));
    const harnessRunsDir = join(dir, "harness-runs", "brief-apply");
    const res = run(["--briefs", givenPath, "--execute", "--harness-runs-dir", harnessRunsDir]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /ZERO entries/);
    assert.ok(res.stderr.includes(givenPath));
    assert.ok(res.stderr.includes(resolve(givenPath)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── APPLY_STEP_ORDER - the per-item outcome vocabulary's own step namespace ─────────────────────────────

test("APPLY_STEP_ORDER: the exact 8-step order the module header documents", () => {
  assert.deepEqual(APPLY_STEP_ORDER, [
    "generate",
    "section",
    "ground",
    "grow",
    "discovery",
    "forward-events",
    "compliance-deadline",
    "entities",
  ]);
});

test("ENTITIES_MODULE_NOT_PRESENT: the exact named skip outcome the pre-flight note requires", () => {
  assert.equal(ENTITIES_MODULE_NOT_PRESENT, "entities: module not present on this branch");
});

test("DEFAULT_HARNESS_RUNS_DIR: resolves under scripts/harness-runs/brief-apply", () => {
  assert.match(DEFAULT_HARNESS_RUNS_DIR.replaceAll("\\", "/"), /scripts\/harness-runs\/brief-apply$/);
});

// ── unscoped flywheel steps deps: fix round 2 (task 6.1b, brief-chain-build-plan-2026-09-11, fix D). The
// pilot's exact failure was `readAllByIds is not a function` from scripts/obligations/derive-
// obligations.mjs:161, thrown because this driver's own execute-mode call site destructured only a
// five-function subset of ../lib/db.mjs (readAll/guardedInsertMany/guardedUpdate/guardedUpdateByIds/
// readClient) and handed THAT to runUnscopedFlywheelSteps, whose stepDeriveObligations passes the whole
// db object straight through to deriveObligationsMain -- which needs readAllByIds too.
// applyOneEntry's own DI seam does not reach this call site (it lives deeper in main(), gated on
// parsed.execute and a non-empty appliedItemIds list, which requires a real write), so this is proven the
// SAME way the wiring proof at the bottom of target-match.golden.mjs proves its own call site: a
// structural scan of the driver's own source confirms it passes the WHOLE module object (never a
// destructured subset again), plus a live import of the real ../lib/db.mjs confirming every name derive-
// obligations.mjs / tag-proposals.mjs / tag-ratification.mjs / analyze-corpus read off it is present as a
// function -- so "the object handed to the unscoped step carries readAllByIds" is proven both structurally
// (the driver's own code) and by content (the real module those names actually resolve on). ──────────────
test("unscoped flywheel steps: the driver passes the WHOLE ../lib/db.mjs module to runUnscopedFlywheelSteps, never a hand-picked subset", async () => {
  const src = readFileSync(RUNNER_PATH, "utf8");
  assert.match(
    src,
    /const db = await import\("\.\.\/lib\/db\.mjs"\);\s*\n\s*unscoped = await runUnscopedFlywheelSteps\("apply", appliedItemIds, db\);/,
    "expected the execute-mode call site to await the whole db.mjs module and pass it straight through",
  );
  // The old five-function destructure must be gone from this call site entirely.
  assert.doesNotMatch(
    src,
    /const \{ readAll, guardedInsertMany, guardedUpdate, guardedUpdateByIds, readClient \} = await import\("\.\.\/lib\/db\.mjs"\);/,
    "the prior subset destructure (missing readAllByIds) must not reappear",
  );

  const db = await import("../lib/db.mjs");
  for (const name of ["readAllByIds", "readAll", "guardedInsertMany", "guardedUpdate", "guardedUpdateByIds", "readClient"]) {
    assert.equal(typeof db[name], "function", `../lib/db.mjs must export ${name} as a function`);
  }
});

// ── entities pre-flight: fix round 1, coordinator ruling, 2026-09-11. Part 1 (lane/w9-part1-2026-09-11)
// merged to master at c63c0bf9 while this task was under review, so src/lib/entities/link-item-entities.mjs
// IS now on this branch (confirmed: `ls src/lib/entities/` lists it post-rebase) - importLinkItemEntities()
// now RESOLVES the real module. The named-skip behavior is still real (it protects any FUTURE lane whose
// own entity-linking module has not merged yet), so it is asserted here on its own terms: `specifier`
// (default the real path) accepts an override, and the test passes a deliberately nonexistent path to
// exercise the absent-module branch directly, independent of what actually exists on disk today. The
// positive case (module present, the now-live branch state) is asserted separately, exercising the real
// import end to end through the SAME fake-supabase client task 1.1's own link-item-entities.test.mjs uses.

test("importLinkItemEntities: returns null (named skip) ONLY when the module is genuinely absent", async () => {
  const fn = await importLinkItemEntities("../../src/lib/entities/__definitely-not-a-real-module__.mjs");
  assert.equal(fn, null);
});

test("importLinkItemEntities: resolves the REAL linkItemEntities now that Part 1 is on this branch (positive case)", async () => {
  const fn = await importLinkItemEntities();
  assert.equal(typeof fn, "function");

  // End-to-end proof it is genuinely wired, not merely "a function": drive it through the SAME
  // fake-supabase client task 1.1's own test suite uses, and confirm real linkItemEntities behavior
  // (an item with no jurisdiction and no instrument key writes nothing).
  const { fakeSupabase } = await import("../../src/test-support/fake-supabase.mjs");
  const sb = fakeSupabase({ entities: [], entity_refs: [], entity_identifiers: [] });
  const r = await fn(sb, { id: "44444444-4444-4444-8444-444444444444", jurisdiction_iso: [], canonical_instrument_key: null });
  assert.equal(r.refs, 0);
  assert.equal(r.instrumentEntityId, null);
});

// ── buildApplyPlan: order ───────────────────────────────────────────────────────────────────────────────

function entry(id, hash = "h") {
  return { item_id: id, source_pool_hash: hash, body: "body", metadata: {}, claims: [] };
}

test("buildApplyPlan: preserves file entry order with no --limit/--after-id", () => {
  const entries = [entry("a"), entry("b"), entry("c")];
  const plan = buildApplyPlan(entries, {});
  assert.deepEqual(plan.map((p) => p.itemId), ["a", "b", "c"]);
});

test("buildApplyPlan: --limit caps the plan to the first N entries, in file order", () => {
  const entries = [entry("a"), entry("b"), entry("c")];
  const plan = buildApplyPlan(entries, { limit: 2 });
  assert.deepEqual(plan.map((p) => p.itemId), ["a", "b"]);
});

test("buildApplyPlan: --limit 0 selects nothing", () => {
  const entries = [entry("a"), entry("b")];
  const plan = buildApplyPlan(entries, { limit: 0 });
  assert.deepEqual(plan, []);
});

test("buildApplyPlan: --after-id resumes strictly AFTER the named item, in file order", () => {
  const entries = [entry("a"), entry("b"), entry("c"), entry("d")];
  const plan = buildApplyPlan(entries, { afterId: "b" });
  assert.deepEqual(plan.map((p) => p.itemId), ["c", "d"]);
});

test("buildApplyPlan: --after-id naming an id not in the file leaves the plan unchanged (never guesses)", () => {
  const entries = [entry("a"), entry("b")];
  const plan = buildApplyPlan(entries, { afterId: "does-not-exist" });
  assert.deepEqual(plan.map((p) => p.itemId), ["a", "b"]);
});

test("buildApplyPlan: --after-id and --limit compose (resume, then cap)", () => {
  const entries = [entry("a"), entry("b"), entry("c"), entry("d")];
  const plan = buildApplyPlan(entries, { afterId: "a", limit: 2 });
  assert.deepEqual(plan.map((p) => p.itemId), ["b", "c"]);
});

// ── buildApplyPlan: skip-on-stale-hash ────────────────────────────────────────────────────────────────

test("buildApplyPlan: a matching current hash is not skipped, and carries the full step order", () => {
  const entries = [entry("a", "hash-a")];
  const plan = buildApplyPlan(entries, { currentHashByItemId: { a: "hash-a" } });
  assert.equal(plan[0].skip, false);
  assert.equal(plan[0].skipReason, null);
  assert.deepEqual(plan[0].steps, APPLY_STEP_ORDER);
});

test("buildApplyPlan: a mismatched current hash is skipped, naming BOTH hashes in the reason, with zero steps", () => {
  const entries = [entry("a", "hash-stale")];
  const plan = buildApplyPlan(entries, { currentHashByItemId: { a: "hash-current" } });
  assert.equal(plan[0].skip, true);
  assert.match(plan[0].skipReason, /stale pool/);
  assert.match(plan[0].skipReason, /hash-stale/);
  assert.match(plan[0].skipReason, /hash-current/);
  assert.deepEqual(plan[0].steps, []);
});

test("buildApplyPlan: an item id absent from currentHashByItemId is NOT treated as stale (never guesses a verdict it cannot support)", () => {
  const entries = [entry("a", "hash-a")];
  const plan = buildApplyPlan(entries, { currentHashByItemId: {} });
  assert.equal(plan[0].skip, false);
  assert.deepEqual(plan[0].steps, APPLY_STEP_ORDER);
});

test("buildApplyPlan: a mixed batch skips only the stale entry, in file order, the rest proceed", () => {
  const entries = [entry("a", "match"), entry("b", "stale"), entry("c", "match")];
  const plan = buildApplyPlan(entries, {
    currentHashByItemId: { a: "match", b: "current", c: "match" },
  });
  assert.deepEqual(
    plan.map((p) => ({ id: p.itemId, skip: p.skip })),
    [
      { id: "a", skip: false },
      { id: "b", skip: true },
      { id: "c", skip: false },
    ],
  );
});

test("buildApplyPlan: an empty entries array plans nothing", () => {
  assert.deepEqual(buildApplyPlan([], {}), []);
});

test("buildApplyPlan: each planned entry retains the original entry object (the executor's own input)", () => {
  const e = entry("a", "hash-a");
  const plan = buildApplyPlan([e], { currentHashByItemId: { a: "hash-a" } });
  assert.equal(plan[0].entry, e);
});

// ── CLI integration: fix round 1 (coordinator, 2026-09-11) - "a run artifact must always land, even on a
// thrown failure" (rule 17), driven against the REAL CLI as a subprocess, the same pattern
// run-mint-batch.test.mjs's own "artifact written on THROWN FAILURE" test uses. Fake-but-present DB creds
// (a real network call is never reached - a malformed --briefs file throws inside main()'s own try block
// before createClient/buildPoolContext are ever called) so the pre-flight "no DB creds" exit does not mask
// the failure this test actually targets. ─────────────────────────────────────────────────────────────

function tmpDir() {
  return mkdtempSync(join(tmpdir(), "apply-record-briefs-test-"));
}

function run(args, opts = {}) {
  try {
    const stdout = execFileSync(process.execPath, [RUNNER_PATH, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: "https://fake-project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key-for-this-test-only",
      },
      ...opts,
    });
    return { status: 0, stdout };
  } catch (err) {
    return { status: err.status, stdout: err.stdout, stderr: err.stderr };
  }
}

test("CLI: artifact written on THROWN FAILURE - a malformed --briefs file still produces a schema-valid artifact recording the error, never silence", () => {
  const dir = tmpDir();
  try {
    const briefsPath = join(dir, "briefs.json");
    writeFileSync(briefsPath, "{ this is not valid json");
    const harnessRunsDir = join(dir, "harness-runs", "brief-apply");

    const res = run(["--briefs", briefsPath, "--harness-runs-dir", harnessRunsDir]);
    assert.equal(res.status, 1, "a thrown run must still exit non-zero");
    assert.match(res.stderr, /apply-record-briefs: FAILED/);

    const artifactPath = join(harnessRunsDir, "brief-apply-run-001.json");
    assert.ok(existsSync(artifactPath), "even a thrown failure must leave a run artifact - no run escapes recording");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    assert.deepEqual(validateRunArtifact(artifact), [], "the written artifact must validate against F28's own schema check");
    assert.equal(artifact.harness_family, "brief-apply");
    assert.equal(artifact.defects_found.length, 1);
    assert.match(artifact.defects_found[0].description, /threw during a run/);
    assert.match(artifact.defects_found[0].description, /failed to read\/parse --briefs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: artifact written on a VALIDATION REFUSAL - a well-formed but schema-invalid --briefs file also leaves a schema-valid artifact naming every error, and exits non-zero", () => {
  const dir = tmpDir();
  try {
    const briefsPath = join(dir, "briefs.json");
    // Structurally an object with ONE (invalid) entry - a validateRecordBriefsFile refusal, not a
    // JSON.parse failure, exercising the OTHER throw site inside the same try block. A missing/empty
    // `entries` array is no longer usable as this fixture (D27, W9 lane L18): resolveBriefsInput now
    // refuses a zero-entry file BEFORE validateRecordBriefsFile ever runs, so this fixture carries a
    // non-empty entries array whose one entry is itself malformed (no item_id) - covered on its own terms
    // by the resolveBriefsInput tests above.
    writeFileSync(
      briefsPath,
      JSON.stringify({ batch: "b1", generated_at: new Date().toISOString(), entries: [{}] }),
    );
    const harnessRunsDir = join(dir, "harness-runs", "brief-apply");

    const res = run(["--briefs", briefsPath, "--harness-runs-dir", harnessRunsDir]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /apply-record-briefs: FAILED/);
    assert.match(res.stderr, /file failed validation/);

    const artifactPath = join(harnessRunsDir, "brief-apply-run-001.json");
    assert.ok(existsSync(artifactPath));
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    assert.deepEqual(validateRunArtifact(artifact), []);
    assert.equal(artifact.metrics.file_valid, false);
    assert.equal(artifact.defects_found.length, 1);
    assert.match(artifact.defects_found[0].description, /validateRecordBriefsFile/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: two consecutive thrown-failure runs claim distinct, incrementing run ids (claimRunId wired through end to end, even on failure)", () => {
  const dir = tmpDir();
  try {
    const briefsPath = join(dir, "briefs.json");
    writeFileSync(briefsPath, "not json at all");
    const harnessRunsDir = join(dir, "harness-runs", "brief-apply");

    run(["--briefs", briefsPath, "--harness-runs-dir", harnessRunsDir]);
    run(["--briefs", briefsPath, "--harness-runs-dir", harnessRunsDir]);

    assert.ok(existsSync(join(harnessRunsDir, "brief-apply-run-001.json")));
    assert.ok(existsSync(join(harnessRunsDir, "brief-apply-run-002.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── D23(c): revalidate after a successful apply (defect-fix-plan-2026-09-12.md) ─────────────────────
//
// Not CLI-driven: --execute unconditionally runs the four UNSCOPED (corpus-wide, not batch-scoped)
// flywheel steps (analyze-corpus first) before the revalidate call site is ever reached, and those
// steps need a real database connection regardless of how many items this run itself applied -
// exactly the same "not unit-tested directly" posture this file's own header already documents for
// the unscoped-flywheel call site immediately above the revalidate one. These are structural proofs
// of the SAME kind the "unscoped flywheel steps" test above already uses for that adjacent call site
// (a scan of the driver's own source, confirming the exact shape a CLI-subprocess test cannot reach
// without a live database) - never a substitute for scripts/lib/revalidate.test.mjs's own full
// behavioural proof of what revalidateTags itself does with the tags it receives.

test("D23(c): the revalidate call site is reached only inside the --execute branch, after appliedItemIds is fully populated and the unscoped flywheel steps have run", () => {
  const src = readFileSync(RUNNER_PATH, "utf8");
  const executeBlockMatch = src.match(/if \(parsed\.execute\) \{[\s\S]*?\n {4}\}\n {2}\} catch \(err\) \{/);
  assert.ok(executeBlockMatch, "expected exactly one `if (parsed.execute) { ... }` block directly before the outer catch");
  const block = executeBlockMatch[0];
  assert.match(block, /const db = await import\("\.\.\/lib\/db\.mjs"\);/, "the unscoped flywheel steps must run before revalidate");
  assert.match(block, /unscoped = await runUnscopedFlywheelSteps\("apply", appliedItemIds, db\);/);
  const revalidateIdx = block.indexOf("revalidateResult = await revalidateTags(");
  const unscopedIdx = block.indexOf("unscoped = await runUnscopedFlywheelSteps(");
  assert.ok(revalidateIdx > unscopedIdx, "revalidate must run AFTER the unscoped flywheel steps, not before or in parallel");
});

test("D23(c): the revalidate call unions PUBLIC_ITEMS_TAG with itemTag(id) for every id in appliedItemIds, and passes apply:true", () => {
  const src = readFileSync(RUNNER_PATH, "utf8");
  assert.match(
    src,
    /revalidateResult = await revalidateTags\(\[PUBLIC_ITEMS_TAG, \.\.\.appliedItemIds\.map\(\(id\) => itemTag\(id\)\)\], \{\s*\n\s*apply: true,\s*\n\s*\}\);/,
    "the revalidate call must union PUBLIC_ITEMS_TAG with itemTag(id) for every id in appliedItemIds, always with apply:true",
  );
});

test("D23(c): the revalidate result is logged and threaded into the run artifact's own metrics, never swallowed", () => {
  const src = readFileSync(RUNNER_PATH, "utf8");
  assert.match(src, /console\.log\(`apply-record-briefs: revalidate: \$\{JSON\.stringify\(revalidateResult\)\}`\);/);
  assert.match(src, /metrics: \{ \.\.\.metrics, applied_item_ids: appliedItemIds, unscoped_flywheel: unscoped, revalidate: revalidateResult \}/);
  // `revalidateResult` is declared beside the other run-scoped mutables (module header's own "declared
  // here so `finally` can see it however far the run got" rule), so a thrown failure BEFORE the
  // --execute branch is reached still writes a schema-valid artifact with revalidate: null, never a
  // missing field.
  assert.match(src, /let revalidateResult = null;/);
});

test("D23(c): revalidateTags itself never throws (a flush failure can never fail the apply) - see scripts/lib/revalidate.mjs's own test file for the full behavioural proof", async () => {
  const { revalidateTags } = await import("../lib/revalidate.mjs");
  const result = await revalidateTags(["public-items"], {
    apply: true,
    appUrl: "https://example.invalid",
    workerSecret: "s3cret",
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.equal(result.applied, false);
  assert.match(result.reason, /ECONNREFUSED/);
});

// ── applyOneEntry via dependency injection: fix round 1 (coordinator, 2026-09-11) - "the jiti production
// path is exercised by no test." `applyOneEntry` now accepts an overridable `deps` bag (the same injected-
// fake pattern this module already uses for `sb`); these tests drive the FULL 8-step order and outcome
// vocabulary against pure fakes, in plain `node --test` with zero jiti/canonical-pipeline.ts overhead. The
// real jiti resolution itself (does loadPipeline()/loadFlywheelDefect() actually resolve the "@/..." alias
// against the live tree) is proven separately, in apply-record-briefs.npmtest.mjs, below this file's own
// concern. ──────────────────────────────────────────────────────────────────────────────────────────────

// A minimal, chainable fake covering exactly what applyOneEntry reads DIRECTLY (every other read/write is
// routed through an injectable dep, per this section's own header).
function fakeSb({ provenanceStatus = "verified", provenanceError = null } = {}) {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    async single() {
      if (provenanceError) return { data: null, error: { message: provenanceError } };
      return { data: { provenance_status: provenanceStatus }, error: null };
    },
  };
  return {
    from(table) {
      if (table !== "intelligence_items") {
        throw new Error(`fakeSb: unexpected table ${table} (applyOneEntry should only read intelligence_items directly; every other read/write is routed through an injectable dep)`);
      }
      return chain;
    },
  };
}

function baseEntry(itemId = "item-1") {
  return { item_id: itemId, source_pool_hash: "h", body: "the body", metadata: {}, claims: [] };
}

function successfulDeps(overrides = {}) {
  return {
    generateBriefFromInjected: async () => ({ ok: true, detail: "generated ok" }),
    sectionBrief: async () => ({ ok: true, detail: "3 sections" }),
    groundBrief: async () => ({ ok: true, detail: "grounded" }),
    growSources: async () => ({ ok: true, detail: "grown" }),
    recordFlywheelDefect: async () => {},
    runDiscoveryStep: async () => ({ written: 2 }),
    runForwardEventsStep: async () => ({ attempted: 1, insertedCount: 1, collision: false, staleRows: [] }),
    syncComplianceDeadlineForItem: async () => ({ changed: true, value: "2026-01-01" }),
    importLinkItemEntities: async () => async () => ({ refs: 1, instrumentEntityId: "cl:instrument:abc" }),
    // D23(a): the default fake never touches `sb` (see fakeSb's own header - it throws on any table
    // but intelligence_items), matching every other step's injectable-dep posture in this file.
    recordItemChange: async () => ({ written: true, reason: "inserted", row: null }),
    ...overrides,
  };
}

test("applyOneEntry: step order and outcome vocabulary, all 8 steps + provenance-status, all succeeding", async () => {
  const itemId = "item-1";
  const result = await applyOneEntry(
    { itemId, entry: baseEntry(itemId) },
    { sb: fakeSb({ provenanceStatus: "verified" }), allowBriefOverwrite: false, deps: successfulDeps() },
  );

  assert.equal(result.generated, true);
  assert.equal(result.provenanceStatus, "verified");
  assert.deepEqual(
    result.steps.map((s) => ({ id: s.id, outcome: s.outcome })),
    [
      { id: "item-1#generate", outcome: "generated" },
      { id: "item-1#section", outcome: "sectioned" },
      { id: "item-1#ground", outcome: "grounded" },
      { id: "item-1#provenance-status", outcome: "verified" },
      { id: "item-1#changelog", outcome: "changelog:written" },
      { id: "item-1#grow", outcome: "grown" },
      { id: "item-1#discovery", outcome: "discovery:2" },
      { id: "item-1#forward-events", outcome: "forward-events:1" },
      { id: "item-1#compliance-deadline", outcome: "compliance-deadline:2026-01-01" },
      { id: "item-1#entities", outcome: "entities:1+instrument" },
    ],
  );
});

// Fix round 1, finding 1 (review-6.2b.md): record-briefs claims now carry an explicit `.section` field
// (the canonical section key the live write path attaches the claim to, canonical-pipeline.ts:1889's own
// `sectionMap[String(c2.section)]`). This proves the driver passes `entry.claims` through to `groundBrief`'s
// injected ledger UNCHANGED -- no transform strips or renames the field -- by capturing the exact argument
// groundBrief receives and asserting it is reference-identical to (and therefore carries every field of)
// the entry's own claims array.
test("applyOneEntry: entry.claims (including each claim's .section field) passes through to groundBrief's injectedLedger unchanged", async () => {
  const itemId = "item-1";
  const claims = [
    { slot_key: "effective_date", claim_kind: "FACT", claim_text: "text", source_span: "span", source_url: "https://example.org", section: "2" },
    { slot_key: null, claim_kind: "FACT", claim_text: "text2", source_span: "span2", source_url: "https://example.org", section: "8" },
  ];
  let capturedLedger = null;
  const deps = successfulDeps({
    groundBrief: async (_itemId, _caller, opts) => {
      capturedLedger = opts.injectedLedger;
      return { ok: true, detail: "grounded" };
    },
  });
  await applyOneEntry(
    { itemId, entry: { ...baseEntry(itemId), claims } },
    { sb: fakeSb({ provenanceStatus: "verified" }), allowBriefOverwrite: false, deps },
  );
  assert.equal(capturedLedger, claims, "groundBrief must receive the SAME array reference (no copy that could drop fields)");
  assert.deepEqual(capturedLedger, claims);
  assert.equal(capturedLedger[0].section, "2");
  assert.equal(capturedLedger[1].section, "8");
});

// D29 (defect-fix-plan-2026-09-12, lane L19): with --allow-brief-overwrite, the driver passes
// replaceLedger:true to groundBrief (so a prior claim this entry does not reproduce is ARCHIVED, not kept --
// see canonical-pipeline.ts / ledger-apply.mjs's own "REPLACE-LEDGER EXCEPTION"), plus the record-briefs
// file's own batch id, named on every archive's `note`. Proven the same way the claims-passthrough test
// above proves the ledger itself: capture groundBrief's own opts and assert on it directly.
test("applyOneEntry: allowBriefOverwrite=true passes replaceLedger:true and the batchId through to groundBrief", async () => {
  const itemId = "item-1";
  let capturedOpts = null;
  const deps = successfulDeps({
    groundBrief: async (_itemId, _caller, opts) => {
      capturedOpts = opts;
      return { ok: true, detail: "grounded" };
    },
  });
  await applyOneEntry(
    { itemId, entry: baseEntry(itemId) },
    { sb: fakeSb({ provenanceStatus: "verified" }), allowBriefOverwrite: true, batchId: "record-briefs-003", deps },
  );
  assert.equal(capturedOpts.replaceLedger, true);
  assert.equal(capturedOpts.batchId, "record-briefs-003");
});

test("applyOneEntry: allowBriefOverwrite=false (default) passes replaceLedger:false -- today's call, unchanged", async () => {
  const itemId = "item-1";
  let capturedOpts = null;
  const deps = successfulDeps({
    groundBrief: async (_itemId, _caller, opts) => {
      capturedOpts = opts;
      return { ok: true, detail: "grounded" };
    },
  });
  await applyOneEntry(
    { itemId, entry: baseEntry(itemId) },
    { sb: fakeSb({ provenanceStatus: "verified" }), allowBriefOverwrite: false, deps },
  );
  assert.equal(capturedOpts.replaceLedger, false);
  assert.equal(capturedOpts.batchId, null, "batchId defaults to null when the caller supplies none");
});

test("applyOneEntry: a generate failure is recorded, but every OTHER step still runs (independent-step, non-halting posture)", async () => {
  const itemId = "item-2";
  const deps = successfulDeps({
    generateBriefFromInjected: async () => ({ ok: false, detail: "stale pool: recorded hash does not match" }),
  });
  const result = await applyOneEntry(
    { itemId, entry: baseEntry(itemId) },
    { sb: fakeSb(), allowBriefOverwrite: false, deps },
  );

  assert.equal(result.generated, false);
  const byId = Object.fromEntries(result.steps.map((s) => [s.id, s]));
  assert.equal(byId["item-2#generate"].outcome, "generate_failed");
  assert.match(byId["item-2#generate"].error, /stale pool/);
  // every later step still ran, unaffected:
  assert.equal(byId["item-2#section"].outcome, "sectioned");
  assert.equal(byId["item-2#entities"].outcome, "entities:1+instrument");
});

test("applyOneEntry: a thrown discovery step is caught, records a flywheel-defect, and does not stop later steps", async () => {
  const itemId = "item-3";
  const defectCalls = [];
  const deps = successfulDeps({
    runDiscoveryStep: async () => {
      throw new Error("discovery boom");
    },
    recordFlywheelDefect: async (sb, id, subtype, message) => {
      defectCalls.push({ id, subtype, message });
    },
  });
  const result = await applyOneEntry({ itemId, entry: baseEntry(itemId) }, { sb: fakeSb(), allowBriefOverwrite: false, deps });

  const byId = Object.fromEntries(result.steps.map((s) => [s.id, s]));
  assert.equal(byId["item-3#discovery"].outcome, "discovery_failed");
  assert.match(byId["item-3#discovery"].error, /discovery boom/);
  assert.equal(byId["item-3#forward-events"].outcome, "forward-events:1", "a later step still ran");
  assert.equal(defectCalls.length, 1);
  assert.equal(defectCalls[0].subtype, "discovery");
});

test("applyOneEntry: entities step records the named skip when importLinkItemEntities resolves to null (module absent)", async () => {
  const itemId = "item-4";
  const deps = successfulDeps({ importLinkItemEntities: async () => null });
  const result = await applyOneEntry({ itemId, entry: baseEntry(itemId) }, { sb: fakeSb(), allowBriefOverwrite: false, deps });

  const byId = Object.fromEntries(result.steps.map((s) => [s.id, s]));
  assert.equal(byId["item-4#entities"].outcome, "entities_skipped_module_not_present");
  assert.equal(byId["item-4#entities"].error, ENTITIES_MODULE_NOT_PRESENT);
});

test("applyOneEntry: provenance_status is read back and reported even when ground itself failed (a quarantine is reported, never hidden)", async () => {
  const itemId = "item-5";
  const deps = successfulDeps({ groundBrief: async () => ({ ok: false, detail: "dominance guard refused" }) });
  const result = await applyOneEntry(
    { itemId, entry: baseEntry(itemId) },
    { sb: fakeSb({ provenanceStatus: "quarantined" }), allowBriefOverwrite: false, deps },
  );

  const byId = Object.fromEntries(result.steps.map((s) => [s.id, s]));
  assert.equal(byId["item-5#ground"].outcome, "ground_failed");
  assert.equal(result.provenanceStatus, "quarantined");
  assert.equal(byId["item-5#provenance-status"].outcome, "quarantined");
});

// ── D23(a): the changelog step (defect-fix-plan-2026-09-12.md, "a regenerated brief is invisible to
// the customer") ────────────────────────────────────────────────────────────────────────────────────

test("D23(a): the changelog step passes the batch, the claim count, and the item's severity through to recordItemChange", async () => {
  const itemId = "item-6";
  let captured = null;
  const deps = successfulDeps({
    recordItemChange: async (client, opts) => {
      captured = opts;
      return { written: true, reason: "inserted", row: null };
    },
  });
  const claims = [{ slot_key: "a" }, { slot_key: "b" }, { slot_key: "c" }];
  await applyOneEntry(
    { itemId, entry: { ...baseEntry(itemId), claims, metadata: { severity: "action_required" } } },
    { sb: fakeSb({ provenanceStatus: "verified" }), allowBriefOverwrite: false, batch: "record-briefs-002", deps },
  );
  assert.equal(captured.itemId, itemId);
  assert.equal(captured.field, "full_brief");
  assert.equal(captured.batch, "record-briefs-002");
  assert.equal(captured.severity, "action_required");
  assert.equal(captured.apply, true);
  assert.match(captured.note, /record-briefs-002/);
  assert.match(captured.note, /3 claim/);
});

test("D23(a): a non-verified item (quarantined) never reaches the changelog step at all", async () => {
  const itemId = "item-7";
  let called = false;
  const deps = successfulDeps({
    recordItemChange: async () => {
      called = true;
      return { written: true, reason: "inserted", row: null };
    },
  });
  const result = await applyOneEntry(
    { itemId, entry: baseEntry(itemId) },
    { sb: fakeSb({ provenanceStatus: "quarantined" }), allowBriefOverwrite: false, batch: "b1", deps },
  );
  assert.equal(called, false, "a quarantined item has nothing new to show a customer yet - no changelog row");
  assert.equal(result.steps.some((s) => s.id === "item-7#changelog"), false);
});

test("D23(a): recordItemChange reporting 'already recorded' (idempotent re-run) is a non-failing outcome", async () => {
  const itemId = "item-8";
  const deps = successfulDeps({
    recordItemChange: async () => ({ written: false, reason: "already recorded for this item and batch", row: null }),
  });
  const result = await applyOneEntry(
    { itemId, entry: baseEntry(itemId) },
    { sb: fakeSb({ provenanceStatus: "verified" }), allowBriefOverwrite: false, batch: "b1", deps },
  );
  const byId = Object.fromEntries(result.steps.map((s) => [s.id, s]));
  assert.equal(byId["item-8#changelog"].outcome, "changelog:skipped");
  assert.match(byId["item-8#changelog"].error, /already recorded/);
});

test("D23(a): a thrown recordItemChange is caught and does not stop the item's other steps", async () => {
  const itemId = "item-9";
  const deps = successfulDeps({
    recordItemChange: async () => {
      throw new Error("db unreachable");
    },
  });
  const result = await applyOneEntry(
    { itemId, entry: baseEntry(itemId) },
    { sb: fakeSb({ provenanceStatus: "verified" }), allowBriefOverwrite: false, batch: "b1", deps },
  );
  const byId = Object.fromEntries(result.steps.map((s) => [s.id, s]));
  assert.equal(byId["item-9#changelog"].outcome, "changelog_failed");
  assert.match(byId["item-9#changelog"].error, /db unreachable/);
  assert.equal(byId["item-9#grow"].outcome, "grown", "a thrown changelog step must not stop later steps");
});

test("D23(a): the real changelogClient adapter (built from `sb`) is only reached when deps.recordItemChange is NOT overridden", async () => {
  // fakeSb() throws on any table other than intelligence_items (see its own header) - so if the
  // production changelogClient were ever invoked against it (i.e. doRecordItemChange fell through to
  // the real module-level recordItemChange instead of the test's override), this test would throw
  // instead of asserting. Proven here by NOT overriding recordItemChange and using a `sb` that also
  // answers item_changelog, confirming the adapter shape (findExisting -> boolean, insert -> {error}).
  const itemId = "item-10";
  let inserted = null;
  const itemsChain = {
    select() { return itemsChain; },
    eq() { return itemsChain; },
    async single() { return { data: { provenance_status: "verified" }, error: null }; },
  };
  const changelogChain = {
    select() { return changelogChain; },
    eq() { return changelogChain; },
    async limit() { return { data: [], error: null }; },
    async insert(row) {
      inserted = row;
      return { error: null };
    },
  };
  const sb = {
    from(table) {
      if (table === "intelligence_items") return itemsChain;
      if (table === "item_changelog") return changelogChain;
      throw new Error(`unexpected table ${table}`);
    },
  };
  const result = await applyOneEntry(
    { itemId, entry: baseEntry(itemId) },
    { sb, allowBriefOverwrite: false, batch: "record-briefs-real", deps: successfulDeps({ recordItemChange: undefined }) },
  );
  const byId = Object.fromEntries(result.steps.map((s) => [s.id, s]));
  assert.equal(byId["item-10#changelog"].outcome, "changelog:written");
  assert.ok(inserted, "the real recordItemChange must have inserted through the sb-backed adapter");
  assert.equal(inserted.item_id, itemId);
  assert.equal(inserted.field, "full_brief");
  assert.equal(inserted.new_value, "record-briefs-real");
  assert.equal(inserted.detected_by, "record-briefs");
});

// Fix round 1 (review-l15.md, C2): the changelog write must never be decided from the read-back
// provenance_status alone. An item can already be "verified" in the database from an earlier,
// unrelated success while THIS run's own generate/section/ground steps all fail - that must never
// record a false "brief regenerated" change.
test("Fix round 1 (C2): item already verified in the DB, but this run's generate/section/ground all fail - NO changelog row is written", async () => {
  const itemId = "item-11";
  let called = false;
  const deps = successfulDeps({
    generateBriefFromInjected: async () => ({ ok: false, detail: "generate failed" }),
    sectionBrief: async () => ({ ok: false, detail: "section failed" }),
    groundBrief: async () => ({ ok: false, detail: "ground failed" }),
    recordItemChange: async () => {
      called = true;
      return { written: true, reason: "inserted", row: null };
    },
  });
  const result = await applyOneEntry(
    { itemId, entry: baseEntry(itemId) },
    // fakeSb reports "verified" regardless of this run's own outcome - reproducing the reviewer's
    // repro: the item was verified by an EARLIER, unrelated success, not by this run.
    { sb: fakeSb({ provenanceStatus: "verified" }), allowBriefOverwrite: false, batch: "b1", deps },
  );
  assert.equal(result.generated, false);
  assert.equal(result.provenanceStatus, "verified");
  assert.equal(
    called,
    false,
    "recordItemChange must not be called when this run's own generate/section/ground all failed",
  );
  assert.equal(
    result.steps.some((s) => s.id === "item-11#changelog"),
    false,
    "no changelog step should even be attempted",
  );
});

test("Fix round 1 (C2): a fully successful run (generate, section and ground all ok this run, verified read-back) writes exactly one changelog row", async () => {
  const itemId = "item-12";
  let callCount = 0;
  const deps = successfulDeps({
    recordItemChange: async () => {
      callCount += 1;
      return { written: true, reason: "inserted", row: null };
    },
  });
  const result = await applyOneEntry(
    { itemId, entry: baseEntry(itemId) },
    { sb: fakeSb({ provenanceStatus: "verified" }), allowBriefOverwrite: false, batch: "b1", deps },
  );
  assert.equal(callCount, 1, "recordItemChange must be called exactly once");
  const changelogSteps = result.steps.filter((s) => s.id === "item-12#changelog");
  assert.equal(changelogSteps.length, 1, "exactly one changelog step outcome is recorded");
  assert.equal(changelogSteps[0].outcome, "changelog:written");
});

// Partial-success variants: only ONE of generate/section/ground failing this run must also refuse
// the changelog write, since the plan text requires ALL THREE to have succeeded this run.
test("Fix round 1 (C2): generate succeeds but ground fails this run - NO changelog row, even though provenance_status reads verified", async () => {
  const itemId = "item-13";
  let called = false;
  const deps = successfulDeps({
    groundBrief: async () => ({ ok: false, detail: "dominance guard refused" }),
    recordItemChange: async () => {
      called = true;
      return { written: true, reason: "inserted", row: null };
    },
  });
  const result = await applyOneEntry(
    { itemId, entry: baseEntry(itemId) },
    { sb: fakeSb({ provenanceStatus: "verified" }), allowBriefOverwrite: false, batch: "b1", deps },
  );
  assert.equal(called, false, "a ground failure this run must refuse the changelog write");
  assert.equal(result.steps.some((s) => s.id === "item-13#changelog"), false);
});

// ── D32 (defect-fix-plan-2026-09-12.md, lane L21): IO budget in the apply driver ───────────────────────
//
// "a fake client whose pool rows are oversized" (brief (b)(5)(i)): readCurrentPool/buildPoolContext are
// the I/O helpers that would talk to a fake Supabase client (not unit-tested directly, same posture this
// file's own header already documents for applyOneEntry's pipeline calls) - their OUTPUT is exactly
// poolBytesByItemId, so these tests drive runApplyLoop (the pure, exported budget-metering loop) with that
// map populated as an oversized fake client's readCurrentPool calls would have produced it.

function ioPlan(ids) {
  return buildApplyPlan(
    ids.map((id) => ({ item_id: id, source_pool_hash: "h", body: "b", metadata: {}, claims: [] })),
    { currentHashByItemId: Object.fromEntries(ids.map((id) => [id, "h"])) },
  );
}

function applySpy(overrides = {}) {
  const calls = [];
  const fn = async (planned) => {
    calls.push(planned.itemId);
    return { itemId: planned.itemId, generated: true, provenanceStatus: "verified", steps: [{ id: `${planned.itemId}#generate`, outcome: "generated", error: null }], ...overrides };
  };
  fn.calls = calls;
  return fn;
}

test("runApplyLoop: stops at the budget - the applyEntry spy is not called for any item past the stop, every remaining item is not_applied_io_budget, metrics carry stop_reason/bytes_read/last_item_id", async () => {
  const plan = ioPlan(["a", "b", "c"]);
  const poolBytesByItemId = { a: 100, b: 100, c: 100 };
  const applyEntry = applySpy();
  const logs = [];
  const { perItem, metrics, appliedItemIds, stopped } = await runApplyLoop({
    plan,
    execute: true,
    ioBudgetBytes: 650, // precheck 300 + a's 200 (100*REREADS) = 500 ok; + b's 200 = 700 > 650 -> stop at b
    poolBytesByItemId,
    applyEntry,
    log: (m) => logs.push(m),
  });

  assert.equal(stopped, true);
  assert.deepEqual(applyEntry.calls, ["a"], "applyEntry must be called for a only - never for b or c, past the stop");
  assert.deepEqual(appliedItemIds, ["a"]);
  assert.equal(metrics.stop_reason, IO_BUDGET_STOP_REASON);
  assert.equal(metrics.bytes_read, 500, "bytes_read = precheck(300) + a's applied cost (100 * PIPELINE_POOL_REREADS)");
  assert.equal(metrics.last_item_id, "a", "the last item actually processed, so the next dispatch resumes with --after-id a");
  assert.equal(metrics.io_budget_bytes, 650);

  const byId = Object.fromEntries(perItem.filter((p) => p.id === "b" || p.id === "c").map((p) => [p.id, p]));
  assert.equal(byId.b.outcome, "not_applied_io_budget");
  assert.match(byId.b.error, /io budget/);
  assert.equal(byId.c.outcome, "not_applied_io_budget");
  assert.ok(logs.some((l) => l.startsWith("::warning::")), "a ::warning:: line is logged on the stop");
});

test("runApplyLoop: ioBudgetBytes 0 never stops (unlimited) - every item applies regardless of pool size", async () => {
  const plan = ioPlan(["a", "b", "c"]);
  const poolBytesByItemId = { a: 10_000_000, b: 10_000_000, c: 10_000_000 };
  const applyEntry = applySpy();
  const { metrics, appliedItemIds, stopped } = await runApplyLoop({
    plan,
    execute: true,
    ioBudgetBytes: 0,
    poolBytesByItemId,
    applyEntry,
    log: () => {},
  });
  assert.equal(stopped, false);
  assert.deepEqual(applyEntry.calls, ["a", "b", "c"]);
  assert.deepEqual(appliedItemIds, ["a", "b", "c"]);
  assert.equal(metrics.stop_reason, null);
  assert.equal(metrics.bytes_read, 3 * 10_000_000 + 3 * 10_000_000 * PIPELINE_POOL_REREADS);
});

test("runApplyLoop: dry mode never calls applyEntry, reports bytes_read as the flat pre-check total, and predicts would_stop_at_item_id via the same walk", async () => {
  const plan = ioPlan(["a", "b", "c"]);
  const poolBytesByItemId = { a: 100, b: 100, c: 100 };
  const applyEntry = applySpy();
  const { perItem, metrics, appliedItemIds, stopped } = await runApplyLoop({
    plan,
    execute: false,
    ioBudgetBytes: 650, // same numbers as the apply-mode stop test above -> would stop at b
    poolBytesByItemId,
    applyEntry,
    log: () => {},
  });
  assert.equal(stopped, false, "dry mode never itself stops - it only predicts");
  assert.equal(applyEntry.calls.length, 0, "dry mode never calls applyEntry");
  assert.deepEqual(appliedItemIds, []);
  assert.equal(metrics.bytes_read, 300, "dry mode bytes_read is the flat pre-check total, not the simulated running total");
  assert.equal(metrics.would_stop_at_item_id, "b");
  assert.deepEqual(perItem.map((p) => p.outcome), ["would_apply", "would_apply", "would_apply"], "dry mode per-item outcomes are unaffected by the prediction");
});

test("runApplyLoop: skip-on-stale-hash entries never consume the apply-cost budget walk, but their pre-read bytes still count toward bytes_read", async () => {
  const plan = buildApplyPlan(
    [
      { item_id: "a", source_pool_hash: "stale", body: "b", metadata: {}, claims: [] },
      { item_id: "b", source_pool_hash: "h", body: "b", metadata: {}, claims: [] },
    ],
    { currentHashByItemId: { a: "current", b: "h" } },
  );
  const poolBytesByItemId = { a: 500, b: 50 };
  const applyEntry = applySpy();
  const { perItem, metrics, appliedItemIds } = await runApplyLoop({
    plan,
    execute: true,
    ioBudgetBytes: 0,
    poolBytesByItemId,
    applyEntry,
    log: () => {},
  });
  assert.deepEqual(applyEntry.calls, ["b"]);
  assert.deepEqual(appliedItemIds, ["b"]);
  assert.equal(metrics.skipped_stale_hash, 1);
  assert.equal(perItem[0].outcome, "stale_pool_hash");
  assert.equal(metrics.bytes_read, 550 + 50 * PIPELINE_POOL_REREADS, "precheck(a's 500 + b's 50) + b's applied cost");
});

test("parseArgs: --io-budget-mb defaults to DEFAULT_IO_BUDGET_MB when omitted", () => {
  const r = parseArgs(["--briefs", "x.json"]);
  assert.equal(r.ok, true);
  assert.equal(r.ioBudgetMb, DEFAULT_IO_BUDGET_MB);
});

test("parseArgs: --io-budget-mb threads through, 0 is valid (unlimited)", () => {
  assert.equal(parseArgs(["--briefs", "x.json", "--io-budget-mb", "0"]).ioBudgetMb, 0);
  assert.equal(parseArgs(["--briefs", "x.json", "--io-budget-mb", "200"]).ioBudgetMb, 200);
});

test("parseArgs: --io-budget-mb rejects a negative value", () => {
  const r = parseArgs(["--briefs", "x.json", "--io-budget-mb", "-1"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--io-budget-mb/);
});

test("parseArgs: --io-budget-mb rejects a non-numeric string", () => {
  const r = parseArgs(["--briefs", "x.json", "--io-budget-mb", "abc"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--io-budget-mb/);
});

test("BYTES_PER_MB: 1024 * 1024", () => {
  assert.equal(BYTES_PER_MB, 1024 * 1024);
});

// ── workflow-text: brief-apply.yml declares io_budget_mb and passes --io-budget-mb ─────────────────────

test("brief-apply.yml: declares the io_budget_mb workflow_dispatch input, string type, default '400'", () => {
  const yml = readFileSync(resolve(HERE, "..", "..", "..", ".github", "workflows", "brief-apply.yml"), "utf8");
  assert.match(
    yml,
    /io_budget_mb:\s*\n\s*description:[^\n]*\n\s*required: false\s*\n\s*default: '400'\s*\n\s*type: string/,
    "expected io_budget_mb: required:false, default:'400', type:string, in that order",
  );
});

test("brief-apply.yml: RUN_IO_BUDGET_MB is threaded from inputs.io_budget_mb and passed to the driver as --io-budget-mb", () => {
  const yml = readFileSync(resolve(HERE, "..", "..", "..", ".github", "workflows", "brief-apply.yml"), "utf8");
  assert.match(yml, /RUN_IO_BUDGET_MB:\s*\$\{\{\s*inputs\.io_budget_mb\s*\}\}/);
  assert.match(yml, /--io-budget-mb \$RUN_IO_BUDGET_MB/);
});
