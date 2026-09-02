// Tests for run-artifact.mjs — the meta-harness run-artifact writer/reader/CLI (Wave MH-1). Filesystem
// only, node:test + node:assert/strict, no npm deps — same no-npm-ci discipline as
// community-topics-seed.test.mjs in this same directory (see that file's header for why a
// scripts/lib/*.test.mjs lives in the no-npm suite: run-test-suite.sh's scripts/lib entries are a
// hand-maintained NAMED LIST, not a directory glob — this file is wired in by an explicit line in
// .discipline/run-test-suite.sh, not by dropping it in this directory).
//
// Every fixture below is a syntactically-valid-but-deliberately-wrong artifact built from the SAME
// shape as the real retrofitted artifacts under scripts/harness-runs/ — the red cases exist to prove
// validateRunArtifact/writeRunArtifact actually fail closed, not just that they accept good input.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALLOWED_FAMILIES,
  validateRunArtifact,
  writeRunArtifact,
  readRunHistory,
  hashHarnessVersion,
  metricHeadline,
  formatRunListing,
  claimRunId,
  listFamiliesSummary,
  resolveRunIdArg,
  loadRunArtifactJSON,
} from "./run-artifact.mjs";
import { mkdirSync } from "node:fs";

function makeValidArtifact(overrides = {}) {
  return {
    harness_family: "mint",
    harness_version: "sha256:abcdef0123456789",
    run_id: "mint-run-001",
    started_at: "2026-09-01T00:49:22Z",
    config: { batch_size: 6 },
    inputs_ref: ["path/to/input.json"],
    per_item: [
      { id: "32006R1692", outcome: "minted", verdict: "valid, 0 orphans", evidence_refs: ["path/to/payload.json"], error: null },
    ],
    metrics: { minted: 1 },
    defects_found: [],
    full_trace_refs: ["path/to/report.md"],
    proposer_notes: "",
    ...overrides,
  };
}

function tmpDir() {
  return mkdtempSync(join(tmpdir(), "run-artifact-test-"));
}

// ── validateRunArtifact: green ──────────────────────────────────────────────────────────────────

test("validateRunArtifact: a well-formed artifact validates clean (empty error array)", () => {
  assert.deepEqual(validateRunArtifact(makeValidArtifact()), []);
});

test("validateRunArtifact: defects_found entries with root_cause:'' and fix_ref:null are valid (explicit-open, not silently blank)", () => {
  const artifact = makeValidArtifact({
    defects_found: [{ description: "something is wrong", root_cause: "", fix_ref: null }],
  });
  assert.deepEqual(validateRunArtifact(artifact), []);
});

test("validateRunArtifact: per_item may be empty (a run that processed thousands of rows, per CONVENTION.md's 'per_item at scale')", () => {
  const artifact = makeValidArtifact({ per_item: [] });
  assert.deepEqual(validateRunArtifact(artifact), []);
});

// ALLOWED_FAMILIES shape (Lane SPEND, system-completion train, 2026-09-02): derived assertions, not exact
// equality against a hardcoded list. Registering a new harness family (ledger-consume, change-detection —
// each landed by its own lane, one addition apiece) used to also require editing THIS test's hardcoded
// array, a second place the same fact had to be kept in sync by hand. Membership of the six ORIGINAL
// families is still asserted by name (nobody may silently drop one), plus the two invariants that make
// "add a family" a one-line edit forever after: every family name is kebab-case (matches run_id's
// `^<family>-run-\d{3}$` shape, F28's CONVENTION-TABLE-PARITY row-key shape, and the registration-order
// error message's own regex) and no name repeats.
const ORIGINAL_SIX_FAMILIES = ["mint", "screen", "fetch-drain", "meta-harness", "forward-events", "source-sweep"];

test("ALLOWED_FAMILIES: the six original families are present (registration never silently drops one)", () => {
  for (const family of ORIGINAL_SIX_FAMILIES) {
    assert.ok(ALLOWED_FAMILIES.includes(family), `expected "${family}" in ALLOWED_FAMILIES: ${JSON.stringify(ALLOWED_FAMILIES)}`);
  }
});

test("ALLOWED_FAMILIES: every family name is kebab-case (lowercase letters + hyphens only, matching the run_id shape)", () => {
  for (const family of ALLOWED_FAMILIES) {
    assert.match(family, /^[a-z]+(-[a-z]+)*$/, `"${family}" is not kebab-case`);
  }
});

test("ALLOWED_FAMILIES: no duplicate family names", () => {
  assert.equal(new Set(ALLOWED_FAMILIES).size, ALLOWED_FAMILIES.length, `duplicate entries in ${JSON.stringify(ALLOWED_FAMILIES)}`);
});

// ── validateRunArtifact: red cases (fail-closed) ────────────────────────────────────────────────

test("validateRunArtifact RED: not an object", () => {
  assert.deepEqual(validateRunArtifact(null), ["artifact must be a plain object"]);
  assert.deepEqual(validateRunArtifact([1, 2, 3]), ["artifact must be a plain object"]);
  assert.deepEqual(validateRunArtifact("mint-run-001"), ["artifact must be a plain object"]);
});

test("validateRunArtifact RED: missing a required top-level key is reported by name", () => {
  const artifact = makeValidArtifact();
  delete artifact.proposer_notes;
  const errors = validateRunArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("proposer_notes")), `expected a proposer_notes error, got: ${errors}`);
});

test("validateRunArtifact RED: missing several required keys reports each by name, in one pass", () => {
  const artifact = makeValidArtifact();
  delete artifact.metrics;
  delete artifact.defects_found;
  const errors = validateRunArtifact(artifact);
  assert.equal(errors.length, 2);
  assert.ok(errors.some((e) => e.includes("metrics")));
  assert.ok(errors.some((e) => e.includes("defects_found")));
});

test("validateRunArtifact RED: harness_family not in ALLOWED_FAMILIES", () => {
  const artifact = makeValidArtifact({ harness_family: "brief" });
  const errors = validateRunArtifact(artifact);
  assert.ok(errors.some((e) => e.includes('harness_family "brief"')), errors.join("; "));
});

test("validateRunArtifact RED: unregistered harness_family names the registration-order rule, the offending family, and the exact fix (not just the bare symptom)", () => {
  const artifact = makeValidArtifact({ harness_family: "brief" });
  const errors = validateRunArtifact(artifact);
  const msg = errors.find((e) => e.includes('harness_family "brief"'));
  assert.ok(msg, errors.join("; "));
  assert.match(msg, /not registered in ALLOWED_FAMILIES/);
  assert.match(msg, /RULE:.*BEFORE any of its run artifacts can validate/);
  assert.match(msg, /FIX:.*add "brief" to ALLOWED_FAMILIES in scripts\/lib\/run-artifact\.mjs/);
  assert.match(msg, /F28's GOVERNING_FILES/);
});

test("validateRunArtifact RED: run_id family prefix mismatch (screen-run-001 under harness_family mint)", () => {
  const artifact = makeValidArtifact({ harness_family: "mint", run_id: "screen-run-001" });
  const errors = validateRunArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("run_id")), errors.join("; "));
});

test("validateRunArtifact RED: run_id not zero-padded / wrong shape", () => {
  for (const badId of ["mint-run-1", "mint-run-01", "mint-run-1000", "mint_run_001", "mint-run-abc"]) {
    const artifact = makeValidArtifact({ run_id: badId });
    const errors = validateRunArtifact(artifact);
    assert.ok(errors.length > 0, `expected "${badId}" to fail run_id validation`);
  }
});

test("validateRunArtifact RED: started_at is not a parseable timestamp", () => {
  const artifact = makeValidArtifact({ started_at: "not-a-date" });
  const errors = validateRunArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("started_at")), errors.join("; "));
});

test("validateRunArtifact RED: harness_version is empty / whitespace-only", () => {
  for (const badVersion of ["", "   "]) {
    const artifact = makeValidArtifact({ harness_version: badVersion });
    const errors = validateRunArtifact(artifact);
    assert.ok(errors.some((e) => e.includes("harness_version")), errors.join("; "));
  }
});

test("validateRunArtifact RED: full_trace_refs empty — the paper's core finding, enforced structurally", () => {
  const artifact = makeValidArtifact({ full_trace_refs: [] });
  const errors = validateRunArtifact(artifact);
  assert.ok(
    errors.some((e) => e.includes("full_trace_refs") && e.includes("non-empty")),
    errors.join("; "),
  );
});

test("validateRunArtifact RED: full_trace_refs with a blank-string entry", () => {
  const artifact = makeValidArtifact({ full_trace_refs: ["real/path.json", "   "] });
  const errors = validateRunArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("full_trace_refs[1]")), errors.join("; "));
});

test("validateRunArtifact RED: array-typed fields rejected when not arrays", () => {
  for (const field of ["inputs_ref", "per_item", "defects_found", "full_trace_refs"]) {
    const artifact = makeValidArtifact({ [field]: "not-an-array" });
    const errors = validateRunArtifact(artifact);
    assert.ok(errors.some((e) => e.includes(`field ${field} must be an array`)), `${field}: ${errors.join("; ")}`);
  }
});

test("validateRunArtifact RED: object-typed fields rejected when not objects", () => {
  for (const field of ["config", "metrics"]) {
    const artifact = makeValidArtifact({ [field]: ["not", "an", "object"] });
    const errors = validateRunArtifact(artifact);
    assert.ok(errors.some((e) => e.includes(`field ${field} must be an object`)), `${field}: ${errors.join("; ")}`);
  }
});

test("validateRunArtifact RED: per_item entry missing id or outcome", () => {
  const artifact = makeValidArtifact({
    per_item: [{ outcome: "minted" }, { id: "x" }],
  });
  const errors = validateRunArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("per_item[0].id")), errors.join("; "));
  assert.ok(errors.some((e) => e.includes("per_item[1].outcome")), errors.join("; "));
});

test("validateRunArtifact RED: per_item.evidence_refs present but not an array", () => {
  const artifact = makeValidArtifact({
    per_item: [{ id: "x", outcome: "minted", evidence_refs: "not-an-array" }],
  });
  const errors = validateRunArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("per_item[0].evidence_refs")), errors.join("; "));
});

test("validateRunArtifact RED: defects_found entry missing description, or fix_ref key entirely absent", () => {
  const artifact = makeValidArtifact({
    defects_found: [
      { root_cause: "x", fix_ref: null },
      { description: "y", root_cause: "z" },
    ],
  });
  const errors = validateRunArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("defects_found[0].description")), errors.join("; "));
  assert.ok(errors.some((e) => e.includes("defects_found[1].fix_ref")), errors.join("; "));
});

test("validateRunArtifact RED: defects_found.fix_ref present but neither string nor null", () => {
  const artifact = makeValidArtifact({
    defects_found: [{ description: "y", root_cause: "z", fix_ref: 42 }],
  });
  const errors = validateRunArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("defects_found[0].fix_ref")), errors.join("; "));
});

// ── writeRunArtifact: fail-closed, no partial writes, overwrite guard ──────────────────────────

test("writeRunArtifact: writes a valid artifact and readRunHistory reads it back byte-faithful", () => {
  const dir = tmpDir();
  try {
    const artifact = makeValidArtifact();
    const path = writeRunArtifact(dir, artifact);
    assert.ok(existsSync(path));
    const onDisk = JSON.parse(readFileSync(path, "utf8"));
    assert.deepEqual(onDisk, artifact);
    const { runs, invalid } = readRunHistory(dir);
    assert.equal(runs.length, 1);
    assert.equal(invalid.length, 0);
    assert.deepEqual(runs[0], artifact);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeRunArtifact: throws on an invalid artifact and writes NOTHING to disk", () => {
  const dir = tmpDir();
  try {
    const badArtifact = makeValidArtifact({ full_trace_refs: [] });
    assert.throws(() => writeRunArtifact(dir, badArtifact), /full_trace_refs/);
    const target = join(dir, "mint-run-001.json");
    assert.equal(existsSync(target), false, "an invalid artifact must not produce a partial file");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeRunArtifact: refuses to silently overwrite an existing run_id.json (the screen-v1 loss this convention exists against)", () => {
  const dir = tmpDir();
  try {
    const artifact = makeValidArtifact();
    writeRunArtifact(dir, artifact);
    const changed = makeValidArtifact({ proposer_notes: "a second, different run body" });
    assert.throws(() => writeRunArtifact(dir, changed), /already exists/);
    // Confirm the ORIGINAL content survived the refused overwrite attempt.
    const onDisk = JSON.parse(readFileSync(join(dir, "mint-run-001.json"), "utf8"));
    assert.equal(onDisk.proposer_notes, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeRunArtifact: { allowOverwrite: true } permits a deliberate overwrite", () => {
  const dir = tmpDir();
  try {
    writeRunArtifact(dir, makeValidArtifact());
    const changed = makeValidArtifact({ proposer_notes: "deliberately replaced" });
    writeRunArtifact(dir, changed, { allowOverwrite: true });
    const onDisk = JSON.parse(readFileSync(join(dir, "mint-run-001.json"), "utf8"));
    assert.equal(onDisk.proposer_notes, "deliberately replaced");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── readRunHistory: sorting, invalid-file reporting, missing dir ───────────────────────────────

test("readRunHistory: sorts runs ascending by started_at regardless of write/filename order", () => {
  const dir = tmpDir();
  try {
    writeRunArtifact(dir, makeValidArtifact({ run_id: "mint-run-003", started_at: "2026-09-03T00:00:00Z" }));
    writeRunArtifact(dir, makeValidArtifact({ run_id: "mint-run-001", started_at: "2026-09-01T00:00:00Z" }));
    writeRunArtifact(dir, makeValidArtifact({ run_id: "mint-run-002", started_at: "2026-09-02T00:00:00Z" }));
    const { runs } = readRunHistory(dir);
    assert.deepEqual(runs.map((r) => r.run_id), ["mint-run-001", "mint-run-002", "mint-run-003"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readRunHistory: a corrupt/unparseable JSON file is reported in `invalid`, not thrown, and never blocks the rest of the dir", () => {
  const dir = tmpDir();
  try {
    writeRunArtifact(dir, makeValidArtifact());
    writeFileSync(join(dir, "mint-run-002.json"), "{ this is not valid json");
    const { runs, invalid } = readRunHistory(dir);
    assert.equal(runs.length, 1);
    assert.equal(invalid.length, 1);
    assert.equal(invalid[0].file, "mint-run-002.json");
    assert.match(invalid[0].reason, /unparseable JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readRunHistory: a hand-edited file that parses but fails schema validation lands in `invalid` with the reason, not silently skipped or crashing", () => {
  const dir = tmpDir();
  try {
    writeFileSync(join(dir, "mint-run-001.json"), JSON.stringify({ harness_family: "mint" }));
    const { runs, invalid } = readRunHistory(dir);
    assert.equal(runs.length, 0);
    assert.equal(invalid.length, 1);
    assert.equal(invalid[0].file, "mint-run-001.json");
    assert.ok(invalid[0].reason.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readRunHistory: a non-existent directory returns empty runs/invalid, never throws", () => {
  const { runs, invalid } = readRunHistory(join(tmpdir(), "run-artifact-test-does-not-exist-" + Date.now()));
  assert.deepEqual(runs, []);
  assert.deepEqual(invalid, []);
});

// ── hashHarnessVersion: deterministic, content-sensitive, path-sorted ──────────────────────────

test("hashHarnessVersion: deterministic for identical file content", () => {
  const dir = tmpDir();
  try {
    writeFileSync(join(dir, "a.mjs"), "export const x = 1;\n");
    const h1 = hashHarnessVersion(["a.mjs"], dir);
    const h2 = hashHarnessVersion(["a.mjs"], dir);
    assert.equal(h1, h2);
    assert.match(h1, /^sha256:[0-9a-f]{16}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hashHarnessVersion: any change to any listed file changes the hash", () => {
  const dir = tmpDir();
  try {
    writeFileSync(join(dir, "a.mjs"), "export const x = 1;\n");
    const before = hashHarnessVersion(["a.mjs"], dir);
    writeFileSync(join(dir, "a.mjs"), "export const x = 2;\n");
    const after = hashHarnessVersion(["a.mjs"], dir);
    assert.notEqual(before, after);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hashHarnessVersion: file list order does not matter (sorted by relative path internally)", () => {
  const dir = tmpDir();
  try {
    writeFileSync(join(dir, "a.mjs"), "aaa\n");
    writeFileSync(join(dir, "b.mjs"), "bbb\n");
    const h1 = hashHarnessVersion(["a.mjs", "b.mjs"], dir);
    const h2 = hashHarnessVersion(["b.mjs", "a.mjs"], dir);
    assert.equal(h1, h2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── metricHeadline / formatRunListing ───────────────────────────────────────────────────────────

test("metricHeadline: up to 3 top-level metrics entries as key=value, in object order", () => {
  assert.equal(
    metricHeadline({ on_vertical: 1729, off_vertical: 1676, ambiguous: 256, unused: 1 }),
    "on_vertical=1729 off_vertical=1676 ambiguous=256",
  );
});

test("metricHeadline: empty metrics object renders a visible placeholder, not a blank string", () => {
  assert.equal(metricHeadline({}), "(no metrics)");
});

test("metricHeadline: long or object-shaped values are truncated/stringified, never break the line", () => {
  const headline = metricHeadline({
    validator_first_pass_rate: "3/6 = 50% — a much longer explanation than belongs on one CLI line",
    queue_queued: { before: 143, after: 35 },
  });
  assert.ok(headline.includes("validator_first_pass_rate="));
  assert.ok(headline.includes("queue_queued="));
  assert.ok(!headline.includes("\n"));
  for (const line of headline.split(" ").filter((s) => s.includes("="))) {
    assert.ok(line.length < 80, `unexpectedly long segment: ${line}`);
  }
});

test("formatRunListing: '(no runs)' for an empty list", () => {
  assert.equal(formatRunListing([]), "(no runs)");
});

test("formatRunListing: one line per run — run_id, started_at, metric headline, defect count", () => {
  const runs = [
    makeValidArtifact({ run_id: "mint-run-001", metrics: { minted: 6 }, defects_found: [{ description: "d1", root_cause: "", fix_ref: null }] }),
  ];
  const out = formatRunListing(runs);
  assert.equal(out, "mint-run-001  2026-09-01T00:49:22Z  minted=6  defects=1");
});

test("formatRunListing: multiple runs, one line each, in the given order", () => {
  const runs = [
    makeValidArtifact({ run_id: "mint-run-001", started_at: "2026-09-01T00:00:00Z", metrics: { a: 1 } }),
    makeValidArtifact({ run_id: "mint-run-002", started_at: "2026-09-02T00:00:00Z", metrics: { b: 2 } }),
  ];
  const lines = formatRunListing(runs).split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^mint-run-001\s/);
  assert.match(lines[1], /^mint-run-002\s/);
});

// ── CLI integration: the real retrofitted artifacts, end to end ────────────────────────────────

// ── claimRunId: collision-safe run-id claim (Wave MH-5) ────────────────────────────────────────

test("claimRunId: first claim in an empty dir returns <family>-run-001", () => {
  const dir = tmpDir();
  try {
    assert.equal(claimRunId(dir, "mint"), "mint-run-001");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claimRunId: sequential claims in the same directory never collide", () => {
  const dir = tmpDir();
  try {
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(claimRunId(dir, "mint"));
    assert.deepEqual(ids, ["mint-run-001", "mint-run-002", "mint-run-003", "mint-run-004", "mint-run-005"]);
    assert.equal(new Set(ids).size, 5, "every claimed id must be distinct");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claimRunId: skips a number an already-written artifact occupies", () => {
  const dir = tmpDir();
  try {
    writeRunArtifact(dir, makeValidArtifact({ run_id: "mint-run-001" }));
    writeRunArtifact(dir, makeValidArtifact({ run_id: "mint-run-002" }));
    assert.equal(claimRunId(dir, "mint"), "mint-run-003");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claimRunId: a pre-existing claim marker (simulating a concurrent winner) is skipped via bounded EEXIST retry, not reused", () => {
  const dir = tmpDir();
  try {
    // Simulate a concurrent process that already won the claim for -001 (and -002) before this call —
    // exactly the mkdir-based marker claimRunId itself creates, pre-seeded by hand.
    mkdirSync(join(dir, ".claims", "mint-run-001.json.claim"), { recursive: true });
    mkdirSync(join(dir, ".claims", "mint-run-002.json.claim"), { recursive: true });
    assert.equal(claimRunId(dir, "mint"), "mint-run-003");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claimRunId: a claim marker survives even after the real artifact for that number is written, so a later concurrent caller still can't reuse the number by scanning only *.json files", () => {
  const dir = tmpDir();
  try {
    const id1 = claimRunId(dir, "mint");
    assert.equal(id1, "mint-run-001");
    writeRunArtifact(dir, makeValidArtifact({ run_id: id1 }));
    // A second caller who raced and lost (or simply calls after) must land on -002, not re-claim -001.
    assert.equal(claimRunId(dir, "mint"), "mint-run-002");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claimRunId: distinct families in the same parent directory claim independently (families don't share a number sequence)", () => {
  const dir = tmpDir();
  try {
    assert.equal(claimRunId(dir, "mint"), "mint-run-001");
    assert.equal(claimRunId(dir, "screen"), "screen-run-001");
    assert.equal(claimRunId(dir, "mint"), "mint-run-002");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claimRunId: a REAL EEXIST collision (forced via startAt, since the normal scan makes a single-process collision impossible) is retried and resolves to the next free number", () => {
  const dir = tmpDir();
  try {
    // Pre-seed claim markers at 001 and 002 (as claimRunId itself would create them), then force the
    // candidate scan to start at 001 anyway via startAt — this is what actually drives the mkdir ->
    // EEXIST -> increment -> retry loop, not just the smart starting-point calculation.
    mkdirSync(join(dir, ".claims", "mint-run-001.json.claim"), { recursive: true });
    mkdirSync(join(dir, ".claims", "mint-run-002.json.claim"), { recursive: true });
    assert.equal(claimRunId(dir, "mint", { startAt: 1 }), "mint-run-003");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claimRunId RED: exhausting maxAttempts throws a named, non-generic error", () => {
  const dir = tmpDir();
  try {
    // Pre-seed 3 consecutive claim markers, force the scan to start at 001 (startAt), and cap attempts
    // at 2 — 001 and 002 both collide (real EEXIST), leaving no room to reach the free 003 within budget.
    for (const n of ["001", "002", "003"]) {
      mkdirSync(join(dir, ".claims", `mint-run-${n}.json.claim`), { recursive: true });
    }
    assert.throws(
      () => claimRunId(dir, "mint", { maxAttempts: 2, startAt: 1 }),
      /could not claim a run_id for family "mint"/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── CLI: list [family] / show <family> <run> (Wave MH-5) ───────────────────────────────────────

test("listFamiliesSummary: one line per family directory, name + run count + latest run", () => {
  const root = tmpDir();
  try {
    writeRunArtifact(join(root, "mint"), makeValidArtifact({ run_id: "mint-run-001", started_at: "2026-09-01T00:00:00Z" }));
    writeRunArtifact(join(root, "mint"), makeValidArtifact({ run_id: "mint-run-002", started_at: "2026-09-02T00:00:00Z" }));
    writeRunArtifact(join(root, "screen"), makeValidArtifact({ harness_family: "screen", run_id: "screen-run-001", started_at: "2026-09-01T00:00:00Z" }));
    const summary = listFamiliesSummary(root);
    const lines = summary.split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines.find((l) => l.startsWith("mint:")), /^mint: 2 run\(s\).*latest: mint-run-002/);
    assert.match(lines.find((l) => l.startsWith("screen:")), /^screen: 1 run\(s\).*latest: screen-run-001/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("listFamiliesSummary: an empty/non-existent root reports a visible placeholder, not a throw or blank string", () => {
  const root = join(tmpdir(), "run-artifact-test-no-such-root-" + Date.now());
  assert.match(listFamiliesSummary(root), /no harness-run families found/);
});

test("resolveRunIdArg: a full run_id passes through unchanged", () => {
  assert.equal(resolveRunIdArg("mint", "mint-run-007"), "mint-run-007");
});

test("resolveRunIdArg: a bare or zero-padded number resolves to the family's run_id shape", () => {
  assert.equal(resolveRunIdArg("mint", "7"), "mint-run-007");
  assert.equal(resolveRunIdArg("mint", "007"), "mint-run-007");
  assert.equal(resolveRunIdArg("screen", "12"), "screen-run-012");
});

test("resolveRunIdArg: an unrecognized shape is passed through unchanged (the caller reports 'not found', this function never guesses further)", () => {
  assert.equal(resolveRunIdArg("mint", "bogus"), "bogus");
});

test("loadRunArtifactJSON: reads and parses a real artifact file", () => {
  const dir = tmpDir();
  try {
    const artifact = makeValidArtifact();
    writeRunArtifact(dir, artifact);
    const loaded = loadRunArtifactJSON(join(dir, "mint-run-001.json"));
    assert.deepEqual(loaded, artifact);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadRunArtifactJSON RED: a missing file throws a named 'no such run artifact' error, never a raw ENOENT", () => {
  const dir = tmpDir();
  try {
    assert.throws(() => loadRunArtifactJSON(join(dir, "mint-run-999.json")), /no such run artifact/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadRunArtifactJSON RED: unparseable JSON throws a named error naming the path, never a raw JSON.parse throw", () => {
  const dir = tmpDir();
  try {
    writeFileSync(join(dir, "mint-run-001.json"), "{ not json");
    assert.throws(() => loadRunArtifactJSON(join(dir, "mint-run-001.json")), /is not valid JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI integration: --list against the real retrofitted screen family reads all 3 rounds, sorted, with defect counts intact", () => {
  const dir = new URL("../harness-runs/screen", import.meta.url).pathname;
  const { runs, invalid } = readRunHistory(dir);
  assert.equal(invalid.length, 0, `unexpected invalid files: ${JSON.stringify(invalid)}`);
  assert.deepEqual(runs.map((r) => r.run_id), ["screen-run-001", "screen-run-002", "screen-run-003"]);
  assert.equal(runs[0].defects_found.length, 1); // the screen-v1 loss
  assert.equal(runs[2].defects_found.length, 0);
  const listing = formatRunListing(runs);
  assert.match(listing, /screen-run-001.*ambiguous=3312/);
  assert.match(listing, /screen-run-003.*ambiguous=256/);
});
