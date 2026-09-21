// family-registry.test.mjs, fire-tests for family-registry.mjs (lane N2, 2026-09-19).
//
// Behavioural, in the F23/F25/F27/F28 style: validateFamilyDescriptor/loadFamilies are driven with
// CONSTRUCTED fixture trees (mkdtempSync) so the RULES are proven, not just today's tree, plus one test
// against the live tree at the bottom. RED FIRST: every refusal below has a fixture proving it actually
// fires before the "live tree loads" test.
//
// Run: node --test scripts/harness-runs/family-registry.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { validateFamilyDescriptor, loadFamilies, FamilyDescriptorError, FAMILIES, HARNESS_RUNS_DIR } from "./family-registry.mjs";
import { isRunArtifactFilename } from "../lib/run-artifact.mjs";

function validDescriptor(overrides = {}) {
  return {
    family: "widget",
    registered: "2026-09-19",
    registered_by: "lane N2",
    governing_files: ["scripts/widget/widget.mjs"],
    rationale: "widget is a fixture family used only by this test.",
    ...overrides,
  };
}

function makeFamilyDir(root, name, descriptor) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  if (descriptor !== undefined) {
    writeFileSync(join(dir, "family.json"), JSON.stringify(descriptor, null, 2) + "\n", "utf8");
  }
  return dir;
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "family-registry-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// True when `dirPath` holds either a committed run artifact (<family>-run-NNN.json, the shape
// isRunArtifactFilename recognizes) or a pending/ folder (a lane's own acknowledgment that a run is
// owed). Either one means the directory is a real harness family in use, so it MUST carry a valid
// family.json; a directory with neither is free to have no descriptor (a scratch dir, traces/, .claims/).
function hasArtifactOrPending(dirPath) {
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === "pending") return true;
    if (entry.isFile() && isRunArtifactFilename(entry.name)) return true;
  }
  return false;
}

// The protection LIVE_FAMILIES used to give by accident (a family missing from the pinned list would
// fail the exact-set comparison): every directory under harnessRunsDir that holds a committed run
// artifact or a pending/ folder but has no family.json is an offender, named here directly rather than
// inferred from a list going stale. Empty result is the honest, protected state.
function unregisteredFamilyDirectories(harnessRunsDir) {
  const resolved = resolve(harnessRunsDir);
  let entries;
  try {
    entries = readdirSync(resolved, { withFileTypes: true });
  } catch {
    return [];
  }
  const offenders = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = join(resolved, entry.name);
    if (existsSync(join(dirPath, "family.json"))) continue; // has a descriptor; loadFamilies validates it
    if (hasArtifactOrPending(dirPath)) offenders.push(entry.name);
  }
  return offenders;
}

// ── validateFamilyDescriptor: shape rules ────────────────────────────────────

test("GREEN: a well-formed descriptor validates", () => {
  assert.deepEqual(validateFamilyDescriptor("widget", validDescriptor()), []);
});

test("RED: descriptor is not a plain object", () => {
  const errors = validateFamilyDescriptor("widget", ["not", "an", "object"]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /must be a plain JSON object/);
});

test("RED: missing required field is named", () => {
  const { rationale, ...rest } = validDescriptor();
  const errors = validateFamilyDescriptor("widget", rest);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /missing required field: rationale/);
});

test("RED: unknown field is refused, not silently ignored", () => {
  const errors = validateFamilyDescriptor("widget", { ...validDescriptor(), extra_field: "nope" });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /unknown field: extra_field/);
});

test("RED: family field must equal the directory name (name mismatch)", () => {
  const errors = validateFamilyDescriptor("widget", validDescriptor({ family: "gadget" }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /must equal its own directory name/);
  assert.match(errors[0], /"gadget"/);
  assert.match(errors[0], /"widget"/);
});

test("RED: registered must be a YYYY-MM-DD string (bad date shape)", () => {
  const errors = validateFamilyDescriptor("widget", validDescriptor({ registered: "Sept 19 2026" }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /must be a YYYY-MM-DD date string/);
});

test("RED: registered that matches the shape but does not parse as a real date", () => {
  const errors = validateFamilyDescriptor("widget", validDescriptor({ registered: "2026-13-40" }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /does not parse as a valid date/);
});

test("RED: governing_files must be a non-empty array (empty list)", () => {
  const errors = validateFamilyDescriptor("widget", validDescriptor({ governing_files: [] }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /must be a non-empty array/);
});

test("RED: governing_files entries must be non-empty strings", () => {
  const errors = validateFamilyDescriptor("widget", validDescriptor({ governing_files: ["ok.mjs", "", 42] }));
  assert.equal(errors.length, 2);
  assert.match(errors[0], /governing_files\[1\] must be a non-empty string/);
  assert.match(errors[1], /governing_files\[2\] must be a non-empty string/);
});

test("RED: a governing_files entry under a pending/ directory is refused (lane N3, build plan 6.8 Rule B)", () => {
  const errors = validateFamilyDescriptor(
    "widget",
    validDescriptor({ governing_files: ["scripts/widget/widget.mjs", "scripts/harness-runs/widget/pending/2026-09-19-x.md"] }),
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /is under a pending\/ directory/);
  assert.match(errors[0], /pending\/2026-09-19-x\.md/);
});

test("RED: registered_by must be a non-empty string", () => {
  const errors = validateFamilyDescriptor("widget", validDescriptor({ registered_by: "" }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /registered_by.*must be a non-empty string/);
});

test("RED: multiple problems are all reported, not just the first", () => {
  const errors = validateFamilyDescriptor("widget", validDescriptor({ family: "gadget", governing_files: [] }));
  assert.equal(errors.length, 2);
});

// ── loadFamilies: filesystem behaviour over constructed fixture trees ────────

test("GREEN: loadFamilies reads a single valid family directory", () => {
  withTempDir((root) => {
    makeFamilyDir(root, "widget", validDescriptor());
    const families = loadFamilies(root);
    assert.equal(families.length, 1);
    assert.equal(families[0].family, "widget");
    assert.deepEqual(families[0].governing_files, ["scripts/widget/widget.mjs"]);
  });
});

test("GREEN: a subdirectory with no family.json is skipped, not an error (traces/, .claims/, etc.)", () => {
  withTempDir((root) => {
    makeFamilyDir(root, "widget", validDescriptor());
    makeFamilyDir(root, "traces"); // no family.json written
    makeFamilyDir(root, ".claims");
    const families = loadFamilies(root);
    assert.equal(families.length, 1);
    assert.equal(families[0].family, "widget");
  });
});

test("RED: an invalid descriptor throws a NAMED FamilyDescriptorError naming the file and the reason", () => {
  withTempDir((root) => {
    makeFamilyDir(root, "widget", validDescriptor({ family: "gadget" }));
    assert.throws(
      () => loadFamilies(root),
      (err) => {
        assert.ok(err instanceof FamilyDescriptorError);
        assert.match(err.message, /widget[/\\]family\.json/);
        assert.match(err.message, /must equal its own directory name/);
        return true;
      },
    );
  });
});

test("RED: unparseable JSON throws a named error, not a raw JSON.parse crash", () => {
  withTempDir((root) => {
    const dir = join(root, "widget");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "family.json"), "not json{{{", "utf8");
    assert.throws(
      () => loadFamilies(root),
      (err) => {
        assert.ok(err instanceof FamilyDescriptorError);
        assert.match(err.message, /is not valid JSON/);
        return true;
      },
    );
  });
});

test("GREEN: the 2026-09-18 collision, now impossible, two NEW family directories added side by side both load", () => {
  withTempDir((root) => {
    makeFamilyDir(root, "alpha-family", validDescriptor({ family: "alpha-family", registered: "2026-09-18" }));
    makeFamilyDir(root, "beta-family", validDescriptor({ family: "beta-family", registered: "2026-09-18" }));
    const families = loadFamilies(root);
    assert.equal(families.length, 2);
    const names = families.map((f) => f.family).sort();
    assert.deepEqual(names, ["alpha-family", "beta-family"]);
  });
});

test("loadFamilies result is sorted by registered then family (deterministic, no shared counter)", () => {
  withTempDir((root) => {
    makeFamilyDir(root, "zed", validDescriptor({ family: "zed", registered: "2026-09-01" }));
    makeFamilyDir(root, "alpha", validDescriptor({ family: "alpha", registered: "2026-09-18" }));
    makeFamilyDir(root, "beta", validDescriptor({ family: "beta", registered: "2026-09-01" }));
    const families = loadFamilies(root);
    assert.deepEqual(
      families.map((f) => f.family),
      ["beta", "zed", "alpha"], // 2026-09-01 tie broken alphabetically (beta before zed), then 2026-09-18
    );
  });
});

test("loadFamilies freezes every descriptor and its governing_files array", () => {
  withTempDir((root) => {
    makeFamilyDir(root, "widget", validDescriptor());
    const [descriptor] = loadFamilies(root);
    assert.ok(Object.isFrozen(descriptor));
    assert.ok(Object.isFrozen(descriptor.governing_files));
  });
});

test("RED: an unreadable harnessRunsDir throws a named error, not a raw ENOENT", () => {
  assert.throws(
    () => loadFamilies("/does/not/exist/at/all"),
    (err) => {
      assert.ok(err instanceof FamilyDescriptorError);
      assert.match(err.message, /cannot read/);
      return true;
    },
  );
});

// ── the live tree ─────────────────────────────────────────────────────────────
//
// No pinned list here (lane R6t, 2026-09-21, build plan section 6.8 follow-up). The prior LIVE_FAMILIES
// array required every new family lane to edit the same line, which is exactly the shared-insertion-point
// collision this module exists to remove (see the header above and the 2026-09-18 collision it names).
// The assertions below derive the expectation from the tree itself: (a) FAMILIES equals exactly the set
// of directories that carry a family.json, (b) every descriptor is valid (loadFamilies already throws on
// the first invalid one, so FAMILIES existing at all proves this for the live tree; the per-field check
// below is the always-true-when-it-loaded belt-and-suspenders), and (c) the protection the old list gave
// by accident, that a directory holding real work (a committed run artifact or a pending/ folder) can
// never be silently unregistered.

test("(a) FAMILIES equals exactly the set of directories under scripts/harness-runs/ that contain a family.json", () => {
  const onDisk = readdirSync(HARNESS_RUNS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(HARNESS_RUNS_DIR, entry.name, "family.json")))
    .map((entry) => entry.name)
    .sort();
  const loaded = FAMILIES.map((f) => f.family).sort();
  assert.deepEqual(loaded, onDisk);
});

test("(b) every live descriptor's governing_files is a non-empty array of strings", () => {
  for (const f of FAMILIES) {
    assert.ok(Array.isArray(f.governing_files) && f.governing_files.length > 0, f.family);
    for (const path of f.governing_files) assert.equal(typeof path, "string", `${f.family}: ${path}`);
  }
});

test("(c) PROTECTION: every harness-runs directory holding a committed run artifact or a pending/ folder is a registered family", () => {
  const offenders = unregisteredFamilyDirectories(HARNESS_RUNS_DIR);
  assert.deepEqual(offenders, []);
});

test("HARNESS_RUNS_DIR points at this module's own directory", () => {
  assert.ok(HARNESS_RUNS_DIR.endsWith(join("scripts", "harness-runs")));
});

// ── (d) attack forms, on a temp fixture tree (rule 15: proven by attack, not by presence) ─────────────

test("ATTACK: a directory with a committed run artifact and no family.json is caught by the (c) protection", () => {
  withTempDir((root) => {
    const dir = join(root, "orphan-family");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "orphan-family-run-001.json"), "{}", "utf8");
    assert.deepEqual(unregisteredFamilyDirectories(root), ["orphan-family"]);
  });
});

test("ATTACK: a directory with a pending/ folder and no family.json is caught by the (c) protection", () => {
  withTempDir((root) => {
    mkdirSync(join(root, "orphan-family", "pending"), { recursive: true });
    assert.deepEqual(unregisteredFamilyDirectories(root), ["orphan-family"]);
  });
});

// A descriptor whose "family" differs from its directory (the (b) attack) is already proven above by
// "RED: an invalid descriptor throws a NAMED FamilyDescriptorError naming the file and the reason".
// loadFamilies throws before FAMILIES could ever contain a mismatched entry, so no separate test repeats
// it here.

test("ATTACK: a new valid family directory added to the tree passes with no edit to this test", () => {
  withTempDir((root) => {
    makeFamilyDir(root, "widget", validDescriptor());
    makeFamilyDir(root, "new-family", validDescriptor({ family: "new-family" }));
    const families = loadFamilies(root);
    assert.deepEqual(families.map((f) => f.family).sort(), ["new-family", "widget"]);
    assert.deepEqual(unregisteredFamilyDirectories(root), []);
  });
});
