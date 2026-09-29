import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStatutoryRowsFile, DEFAULT_LIVE_ROWS_FILE } from "./resolve-statutory-rows-file.mjs";

test("resolveStatutoryRowsFile: no override (absent input) resolves to the LIVE default path, unchanged", () => {
  assert.equal(resolveStatutoryRowsFile(undefined), DEFAULT_LIVE_ROWS_FILE);
  assert.equal(resolveStatutoryRowsFile(null), DEFAULT_LIVE_ROWS_FILE);
});

test("resolveStatutoryRowsFile: an empty-string override (workflow_dispatch's shape when unset) resolves to the live default", () => {
  assert.equal(resolveStatutoryRowsFile(""), DEFAULT_LIVE_ROWS_FILE);
});

test("resolveStatutoryRowsFile: a whitespace-only override is treated as absent, never a literal whitespace path", () => {
  assert.equal(resolveStatutoryRowsFile("   "), DEFAULT_LIVE_ROWS_FILE);
});

test("resolveStatutoryRowsFile: an explicit override path is used verbatim (trimmed), never silently redirected", () => {
  assert.equal(
    resolveStatutoryRowsFile("scripts/propagation/fixtures/test-statutory-rows.dry.json"),
    "scripts/propagation/fixtures/test-statutory-rows.dry.json"
  );
});

test("resolveStatutoryRowsFile: surrounding whitespace on a real override is trimmed", () => {
  assert.equal(
    resolveStatutoryRowsFile("  scripts/propagation/fixtures/test-statutory-rows.dry.json  "),
    "scripts/propagation/fixtures/test-statutory-rows.dry.json"
  );
});

test("resolveStatutoryRowsFile: DEFAULT_LIVE_ROWS_FILE is exactly the path the write-statutory.mjs workflow step has always read", () => {
  assert.equal(DEFAULT_LIVE_ROWS_FILE, "scripts/propagation/fixtures/fueleu-annex-iv-rows.json");
});
