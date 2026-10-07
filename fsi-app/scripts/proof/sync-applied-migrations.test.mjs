/** Tests for scripts/proof/sync-applied-migrations.mjs (lane PROOF-1). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeExport, buildInventory } from "./sync-applied-migrations.mjs";

test("rows are sorted by version then name and carry count and synced_at", () => {
  const inv = buildInventory([{ version: "20260711032524", name: "b" }, { version: "002", name: "rls" }, { version: "001", name: "schema" }], "2026-10-07T00:00:00.000Z");
  assert.deepEqual(inv.migrations.map((m) => m.version), ["001", "002", "20260711032524"]);
  assert.equal(inv.count, 3);
  assert.equal(inv.synced_at, "2026-10-07T00:00:00.000Z");
});

test("extra fields in the export are dropped, so nothing but version and name is committed", () => {
  const inv = buildInventory([{ version: "001", name: "schema", statements: ["select secret"], token: "x" }], "t");
  assert.deepEqual(inv.migrations, [{ version: "001", name: "schema" }]);
});

test("malformed exports are refused by name", () => {
  assert.throws(() => normalizeExport({}), /JSON array/);
  assert.throws(() => normalizeExport([{ version: 1, name: "a" }]), /numeric string version/);
  assert.throws(() => normalizeExport([{ version: "001" }]), /no name/);
  assert.throws(() => normalizeExport([{ version: "001", name: "a" }, { version: "001", name: "a" }]), /duplicates/);
});

test("two names under one version are both kept (006 and 007 carry several files)", () => {
  assert.equal(normalizeExport([{ version: "006", name: "a" }, { version: "006", name: "b" }]).length, 2);
});
