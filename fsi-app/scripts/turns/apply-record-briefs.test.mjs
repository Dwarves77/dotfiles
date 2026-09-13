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
  importLinkItemEntities,
  resolveBriefsInput,
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
