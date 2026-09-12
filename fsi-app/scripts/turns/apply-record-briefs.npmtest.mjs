// apply-record-briefs.npmtest.mjs -- fix round 1 (coordinator ruling, task 3.4, brief-chain build plan
// Part 3, 2026-09-11): "the jiti production path (loadPipeline / loadFlywheelDefect and the real
// generateBriefFromInjected / sectionBrief / groundBrief / growSources calls inside applyOneEntry) is
// exercised by no test." apply-record-briefs.test.mjs (plain `node --test`, RED/GREEN via injected fakes)
// proves the STEP ORDER and OUTCOME VOCABULARY without ever loading canonical-pipeline.ts or
// flywheel-defect.ts -- by design, so those tests stay instant. This file is the OTHER half: it actually
// imports both modules through jiti, the exact way apply-record-briefs.mjs's own loadPipeline()/
// loadFlywheelDefect() do (createJiti with the "@" -> src alias), so a broken alias, a renamed export, or
// a moved file fails THIS gate, not merely a fake-driven test that could stay green forever regardless.
//
// *.npmtest.mjs (not *.test.mjs) because canonical-pipeline.ts/flywheel-defect.ts are only importable via
// jiti (their "@/..." tsconfig-path imports are not portable to plain `node --test` -- the same constraint
// canonical-pipeline.injected-synthesis.npmtest.mjs's own header documents for the identical module). This
// is the FIRST scripts/**/*.npmtest.mjs file in this repo -- discipline.yml's own "App unit tests requiring
// npm deps" step globs `fsi-app/src/**/*.npmtest.mjs` only, so this file is added to that step's explicit
// `named` list (the same precedent already used for other npm-dependent files outside that glob's reach,
// e.g. scripts/lib/batch-primitives.test.mjs) rather than left git-tracked and run by nothing (CLAUDE.md
// rule 15: a proof that does not execute is not a proof).
//
// NO DATABASE: every call below either passes an injected fake client (generateBriefFromInjected,
// recordFlywheelDefect both accept one) or stops before the first real client call would happen.
// sectionBrief/groundBrief/growSources are NOT called here -- unlike generateBriefFromInjected, they call
// svc() unconditionally and accept no injected client, so calling them would require real env vars or risk
// a real network attempt; this file only proves the ALIAS/EXPORT surface for those three (typeof function)
// and exercises the one real end-to-end call generateBriefFromInjected's own signature safely allows.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });

test("jiti resolves canonical-pipeline.ts's four pipeline exports (the alias apply-record-briefs.mjs's loadPipeline() depends on)", async () => {
  const mod = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
  assert.equal(typeof mod.generateBriefFromInjected, "function");
  assert.equal(typeof mod.sectionBrief, "function");
  assert.equal(typeof mod.groundBrief, "function");
  assert.equal(typeof mod.growSources, "function");
});

test("jiti resolves flywheel-defect.ts's recordFlywheelDefect export (the alias apply-record-briefs.mjs's loadFlywheelDefect() depends on)", async () => {
  const mod = await jiti.import("../../src/lib/intake/flywheel-defect.ts");
  assert.equal(typeof mod.recordFlywheelDefect, "function");
});

test("end to end, no database: the REAL generateBriefFromInjected (loaded through jiti) reaches its own item-not-found refusal against an injected fake client, never a network call", async () => {
  const { generateBriefFromInjected } = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");

  // A fake client that answers ONLY the one read generateBriefFromInjected's own item lookup makes, with
  // "no such item" -- if the real function ever reached past that early return (a network fetch, a second
  // table), this fake would throw on the unexpected call instead of silently succeeding.
  const fakeSb = {
    from(table) {
      if (table !== "intelligence_items") {
        throw new Error(`unexpected table ${table} -- generateBriefFromInjected should refuse before reaching it`);
      }
      return {
        select: () => fakeSb.chain,
        eq: () => fakeSb.chain,
        single: async () => ({ data: null, error: { message: "no rows" } }),
      };
    },
    chain: null,
  };
  fakeSb.chain = fakeSb.from("intelligence_items");

  const result = await generateBriefFromInjected(
    "00000000-0000-0000-0000-000000000000",
    "brief-apply",
    { body: "irrelevant", metadata: {}, sourcePoolHash: "irrelevant" },
    fakeSb,
  );

  assert.equal(result.ok, false);
  assert.match(result.detail, /item not found/);
});

test("end to end, no database: the REAL recordFlywheelDefect (loaded through jiti) writes through an injected fake client, never a real network call", async () => {
  const { recordFlywheelDefect } = await jiti.import("../../src/lib/intake/flywheel-defect.ts");

  let insertedRow = null;
  const fakeSb = {
    from(table) {
      if (table !== "integrity_flags") throw new Error(`unexpected table ${table}`);
      return {
        insert: (row) => {
          insertedRow = row;
          return { then: (resolve) => resolve({ data: null, error: null }) };
        },
      };
    },
  };

  await recordFlywheelDefect(fakeSb, "00000000-0000-0000-0000-000000000000", "discovery", "boom", { context: "brief-apply" });
  assert.ok(insertedRow, "recordFlywheelDefect must have inserted a row through the injected client");
  assert.equal(insertedRow.category, "data_quality");
  assert.equal(insertedRow.subject_ref, "00000000-0000-0000-0000-000000000000");
  assert.match(insertedRow.description, /discovery.*failed at brief-apply/);
});
