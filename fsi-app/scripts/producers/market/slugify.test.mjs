// slugify.test.mjs, direct proof for the shared slugify.mjs (lane L11, 2026-10-03), extracted from
// eia-v2-petroleum-spot-producer.mjs's own prior local copy. Both producers' own tests already exercise
// it indirectly (series_key assertions); this is the direct proof.
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slugify.mjs";

test("slugify: lower-cases, joins non-alphanumeric runs with one hyphen, trims leading/trailing hyphens", () => {
  assert.equal(slugify("Containers and Packaging"), "containers-and-packaging");
  assert.equal(slugify("Healthcare Providers and Services, and Healthcare Technology"), "healthcare-providers-and-services-and-healthcare-technology");
  assert.equal(slugify("  Air/Freight  "), "air-freight");
  assert.equal(slugify(""), "");
  assert.equal(slugify(null), "");
  assert.equal(slugify(undefined), "");
});
