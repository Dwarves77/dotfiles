// section-list-drift.npmtest.mjs -- fix round 1 follow-up (coordinator, task 6.1b, 2026-09-12): the
// criterion 4 mirror's per-format canonical section list (schema.mjs's SECTION_DEFS_BY_FORMAT_TYPE) is a
// second copy of the real format registry (src/lib/agent/formats/*.ts, dispatched by item_type through
// extract-registry.ts, consumed by makeProseExtractor -- the ONE section-extractor every format's real
// sectionBrief write runs through). A second copy drifts: if a future change adds/removes a canonical
// section, renames a heading, or edits a headingAlts entry in any of the five real format files without
// updating the mirror, schema.mjs's criterion 4 mirror would silently check the WRONG section boundaries
// forever, with nothing to catch it. This test makes the mirror's equality with the registry a proven
// fact instead of an assumption: it imports the REAL FormatSpec objects and asserts, per format, that the
// mirrored list equals the registry's canonical sections and heading alternates EXACTLY (key, heading,
// headingAlts, in order) -- any registry change fails THIS test until the mirror is updated to match.
//
// *.npmtest.mjs (not *.test.mjs) because the five real format files import via "@/" tsconfig aliases,
// only resolvable through jiti -- the same constraint apply-record-briefs.npmtest.mjs's own header
// documents for canonical-pipeline.ts. discipline.yml's "App unit tests requiring npm deps" step globs
// fsi-app/src/**/*.npmtest.mjs only, so this file (under fsi-app/scripts/) is added to that step's
// explicit named list, the same precedent apply-record-briefs.npmtest.mjs already set for this directory.
//
// NO DATABASE, NO NETWORK: every import here is a static module load (the format files are plain data +
// pure extractor factories); nothing calls svc() or opens a connection.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { SECTION_DEFS_BY_FORMAT_TYPE } from "./schema.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", ".."); // scripts/turns/record-briefs -> fsi-app
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });

// The real FormatSpec module + its exported spec name, per format_type -- the SAME five files
// SECTION_DEFS_BY_FORMAT_TYPE mirrors data from, and the SAME dispatch extract-registry.ts wires by
// item_type. Listed explicitly (not walked via extract-registry.ts's own BY_ITEM_TYPE map) so a
// format_type this file forgets to list fails loudly in the "no extra/missing keys" test below, rather
// than silently skipping a real registry entry.
const REAL_SPEC_MODULES = Object.freeze({
  regulatory_fact_document: { path: "../../../src/lib/agent/formats/regulation.ts", exportName: "regulationSpec" },
  research_summary: { path: "../../../src/lib/agent/formats/research.ts", exportName: "researchSpec" },
  market_signal_brief: { path: "../../../src/lib/agent/formats/market.ts", exportName: "marketSpec" },
  technology_profile: { path: "../../../src/lib/agent/formats/technology.ts", exportName: "technologySpec" },
  operations_profile: { path: "../../../src/lib/agent/formats/operations.ts", exportName: "operationsSpec" },
});

/** Reduce a FormatSpec's own `sections` array (SectionDef[], carries `order`/`conditional` too) to
 *  exactly the fields the mirror needs to reproduce the write path's own boundary decisions: `key`,
 *  `heading`, `headingAlts` (normalised to `[]` when absent, matching the mirror's own `?? []` reads). */
function toComparable(sections) {
  return (sections ?? []).map((s) => ({ key: s.key, heading: s.heading, headingAlts: s.headingAlts ?? [] }));
}

test("schema.mjs's SECTION_DEFS_BY_FORMAT_TYPE has exactly the same format_type keys as the real registry", () => {
  assert.deepEqual(
    Object.keys(SECTION_DEFS_BY_FORMAT_TYPE).sort(),
    Object.keys(REAL_SPEC_MODULES).sort(),
    "schema.mjs's mirror and the real format registry must cover the SAME set of format_type values",
  );
});

for (const [formatType, { path, exportName }] of Object.entries(REAL_SPEC_MODULES)) {
  test(`schema.mjs's mirrored section list for '${formatType}' equals the real FormatSpec (${exportName}) exactly`, async () => {
    const mod = await jiti.import(path);
    const spec = mod[exportName];
    assert.ok(spec, `expected '${exportName}' to be exported from ${path}`);
    assert.equal(spec.formatType, formatType, `${exportName}.formatType must equal the key this test looked it up by`);

    const real = toComparable(spec.sections);
    const mirrored = toComparable(SECTION_DEFS_BY_FORMAT_TYPE[formatType]);
    assert.deepEqual(
      mirrored,
      real,
      `schema.mjs's SECTION_DEFS_BY_FORMAT_TYPE['${formatType}'] has drifted from ${exportName}.sections in ${path} -- update the mirror to match (key/heading/headingAlts, in order)`,
    );
  });
}
