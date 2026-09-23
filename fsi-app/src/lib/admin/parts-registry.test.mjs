// parts-registry.test.mjs: red-then-green for the /admin/parts registry loader (lane W10-ListRow-2,
// 2026-09-23). Proven by attack (rule 15): a violation is planted in a throwaway fixture, the loader
// catches it, the violation is removed, the loader passes. Mirrors family-registry.test.mjs's shape.
//
// node: builtins only (mkdtempSync fixture trees), no npm deps -- discovered by run-test-suite.sh's
// no-npm glob (git-tracked *.test.mjs, any depth).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadPartEntries, validatePartDescriptor, PartDescriptorError, PARTS_DIR } from "./parts-registry.ts";

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "parts-registry-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function makePartDir(root, slug, descriptor) {
  const dir = join(root, slug);
  mkdirSync(dir, { recursive: true });
  if (descriptor !== undefined) {
    writeFileSync(join(dir, "part.json"), JSON.stringify(descriptor, null, 2) + "\n", "utf8");
  }
  return dir;
}

function validDescriptor(overrides = {}) {
  return {
    slug: "widget",
    name: "Widget",
    summary: "A fixture part used only by this test.",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// validatePartDescriptor: pure shape checks
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test("validatePartDescriptor: a well-formed descriptor has no errors", () => {
  assert.deepEqual(validatePartDescriptor("widget", validDescriptor()), []);
});

test("validatePartDescriptor RED: missing required fields are each named", () => {
  const errors = validatePartDescriptor("widget", { slug: "widget" });
  assert.ok(errors.some((e) => e.includes("missing required field: name")));
  assert.ok(errors.some((e) => e.includes("missing required field: summary")));
});

test("validatePartDescriptor RED: an unknown field is refused", () => {
  const errors = validatePartDescriptor("widget", { ...validDescriptor(), extra: "nope" });
  assert.ok(errors.some((e) => e.includes("unknown field: extra")));
});

test("validatePartDescriptor RED: slug must equal the directory name", () => {
  const errors = validatePartDescriptor("widget", validDescriptor({ slug: "not-widget" }));
  assert.ok(errors.some((e) => e.includes('must equal its own directory name')));
});

test("validatePartDescriptor RED: an empty name or summary is refused", () => {
  const errors = validatePartDescriptor("widget", validDescriptor({ name: "  " }));
  assert.ok(errors.some((e) => e.includes('"name" must be a non-empty string')));
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// loadPartEntries: fixture-tree behavior
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test("loadPartEntries: reads every folder with a valid part.json, sorted by slug", () => {
  withTempDir((root) => {
    makePartDir(root, "zeta", validDescriptor({ slug: "zeta", name: "Zeta" }));
    makePartDir(root, "alpha", validDescriptor({ slug: "alpha", name: "Alpha" }));
    const entries = loadPartEntries(root);
    assert.deepEqual(entries.map((e) => e.slug), ["alpha", "zeta"]);
    assert.equal(entries[0].name, "Alpha");
  });
});

test("loadPartEntries: a folder with no part.json is skipped, not an error (mirrors family-registry's tolerance)", () => {
  withTempDir((root) => {
    makePartDir(root, "has-meta", validDescriptor({ slug: "has-meta", name: "Has Meta" }));
    makePartDir(root, "no-meta", undefined); // folder exists, no part.json
    const entries = loadPartEntries(root);
    assert.deepEqual(entries.map((e) => e.slug), ["has-meta"]);
  });
});

test("loadPartEntries RED: a folder whose part.json fails validation throws PartDescriptorError naming the file", () => {
  withTempDir((root) => {
    makePartDir(root, "broken", { slug: "broken" }); // missing name/summary
    assert.throws(
      () => loadPartEntries(root),
      (err) => {
        assert.ok(err instanceof PartDescriptorError);
        assert.match(err.message, /broken[\\/]part\.json/);
        return true;
      },
    );
  });
});

test("loadPartEntries RED: malformed JSON throws PartDescriptorError", () => {
  withTempDir((root) => {
    const dir = join(root, "malformed");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "part.json"), "{ not json", "utf8");
    assert.throws(() => loadPartEntries(root), PartDescriptorError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// "adding a folder needs no edit to page.tsx" -- proven directly: loadPartEntries derives its result
// purely from what is on disk under the given directory. Adding a third fixture folder between two
// calls, with zero code changes to this module or to any page.tsx, changes the result -- the same
// property page.tsx relies on when a future part lane adds its own folder.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test("loadPartEntries: adding a new part folder changes the result with no code edit anywhere", () => {
  withTempDir((root) => {
    makePartDir(root, "alpha", validDescriptor({ slug: "alpha", name: "Alpha" }));
    const before = loadPartEntries(root).map((e) => e.slug);
    assert.deepEqual(before, ["alpha"]);

    // Simulates a new part lane landing its own folder: a NEW file, never an edit to an existing one.
    makePartDir(root, "beta", validDescriptor({ slug: "beta", name: "Beta" }));
    const after = loadPartEntries(root).map((e) => e.slug);
    assert.deepEqual(after, ["alpha", "beta"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// Live tree: every real folder under src/app/admin/parts/ carries a valid part.json (the test that
// fails if a folder under admin/parts has no metadata).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test("live tree: every folder under src/app/admin/parts/ has a valid part.json", () => {
  assert.ok(existsSync(PARTS_DIR), `PARTS_DIR does not exist: ${PARTS_DIR}`);
  const dirEntries = readdirSync(PARTS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
  assert.ok(dirEntries.length > 0, "expected at least one part folder in the live tree");

  const missing = dirEntries
    .filter((e) => !existsSync(join(PARTS_DIR, e.name, "part.json")))
    .map((e) => e.name);
  assert.deepEqual(missing, [], `folder(s) under src/app/admin/parts/ with no part.json: ${missing.join(", ")}`);

  // loadPartEntries() itself throws (fail-closed) on any invalid descriptor in the live tree, and
  // returns one entry per folder -- both assert the full live tree is clean, not just "file exists".
  const entries = loadPartEntries();
  assert.equal(entries.length, dirEntries.length);
});
