// logic.test.mjs , proves the /api/admin/statutory-rows orchestration is ONE PATH with the CLI and the
// propagation-drain.yml gate (lane M7a, 2026-09-20), not a second copy of validation/write semantics.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { processStatutoryRowsFile } from "./logic.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(HERE, "logic.mjs"), "utf8");

test("ONE PATH , logic.mjs imports validateRowsFile from the real validator module (attack: a route that re-implements validation, i.e. does not import from this path, fails this assertion)", () => {
  assert.match(
    SOURCE,
    /import\s*\{\s*validateRowsFile\s*\}\s*from\s*"[^"]*scripts\/propagation\/validate-statutory-rows-file\.mjs"/,
    "expected an import of validateRowsFile from scripts/propagation/validate-statutory-rows-file.mjs"
  );
});

test("ONE PATH , logic.mjs imports parseRow and writeOneRow from the real write-statutory.mjs module (same attack form)", () => {
  assert.match(
    SOURCE,
    /import\s*\{\s*parseRow,\s*writeOneRow\s*\}\s*from\s*"[^"]*scripts\/propagation\/write-statutory\.mjs"/,
    "expected an import of parseRow, writeOneRow from scripts/propagation/write-statutory.mjs"
  );
});

function fakeWriteOneRow(actions) {
  let call = 0;
  return async (_sb, parsed, mode) => {
    call += 1;
    return { action: actions[call - 1] ?? "would-write", shipKey: parsed.shipKey, mode };
  };
}

test("refusal , a validator violation writes nothing and returns the violations verbatim", async () => {
  let parseRowCalls = 0;
  let writeOneRowCalls = 0;
  const result = await processStatutoryRowsFile(
    {},
    { rows: [{ shipKey: "FIXTURE-ship" }] },
    "apply",
    {
      validateRowsFileFn: () => ["row[0]: shipKey itself carries a placeholder marker"],
      parseRowFn: () => { parseRowCalls += 1; return {}; },
      writeOneRowFn: async () => { writeOneRowCalls += 1; return { action: "written" }; },
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.deepEqual(result.violations, ["row[0]: shipKey itself carries a placeholder marker"]);
  assert.equal(parseRowCalls, 0, "a refused rows-file must never reach parseRow");
  assert.equal(writeOneRowCalls, 0, "a refused rows-file must never reach writeOneRow");
});

test("dry mode , writeOneRow is called with mode='dry' and nothing is counted as written", async () => {
  const calls = [];
  const result = await processStatutoryRowsFile(
    {},
    { rows: [{ shipKey: "ship-1" }, { shipKey: "ship-2" }] },
    "dry",
    {
      validateRowsFileFn: () => [],
      parseRowFn: (row) => row,
      writeOneRowFn: async (_sb, parsed, mode) => {
        calls.push({ shipKey: parsed.shipKey, mode });
        return { action: "would-write", shipKey: parsed.shipKey };
      },
    }
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.mode === "dry"), "dry mode must call writeOneRow with mode='dry', never 'apply'");
  assert.equal(result.counts.wouldWrite, 2);
  assert.equal(result.counts.written, 0, "dry mode must never count a row as written");
});

test("apply mode , writeOneRow is called once per valid row with mode='apply' and counted written", async () => {
  const calls = [];
  const result = await processStatutoryRowsFile(
    {},
    { rows: [{ shipKey: "ship-1" }, { shipKey: "ship-2" }] },
    "apply",
    {
      validateRowsFileFn: () => [],
      parseRowFn: (row) => row,
      writeOneRowFn: async (_sb, parsed, mode) => {
        calls.push({ shipKey: parsed.shipKey, mode });
        return { action: "written", shipKey: parsed.shipKey, computationId: `${parsed.shipKey}-id` };
      },
    }
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2, "writeOneRow must be called exactly once per valid row");
  assert.ok(calls.every((c) => c.mode === "apply"));
  assert.equal(result.counts.written, 2);
  assert.equal(result.outcomes[0].detail.computationId, "ship-1-id");
});

test("a structurally bad row is refused without calling writeOneRow for that row", async () => {
  const writeOneRowFn = fakeWriteOneRow(["written"]);
  let writeCalls = 0;
  const result = await processStatutoryRowsFile(
    {},
    { rows: [{ shipKey: "bad-row" }] },
    "apply",
    {
      validateRowsFileFn: () => [],
      parseRowFn: () => { throw new Error("write-statutory: row[0]: missing required field(s): targetYear"); },
      writeOneRowFn: async (...args) => { writeCalls += 1; return writeOneRowFn(...args); },
    }
  );
  assert.equal(result.counts.refused, 1);
  assert.equal(writeCalls, 0);
  assert.equal(result.outcomes[0].action, "refused-structural");
});
