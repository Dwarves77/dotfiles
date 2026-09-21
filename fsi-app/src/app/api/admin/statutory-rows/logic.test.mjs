// logic.test.mjs , proves the /api/admin/statutory-rows orchestration is ONE PATH with the CLI and the
// propagation-drain.yml gate (lane M7a, 2026-09-20; amended 2026-09-21 FIX), not a second copy of
// validation/write semantics.
//
// AMENDED 2026-09-21 (lane M7a FIX): the route no longer imports the CLI scripts
// (scripts/propagation/write-statutory.mjs / validate-statutory-rows-file.mjs) directly , doing so
// dragged scripts/lib/db.mjs's fs-backed guarded-write snapshot path into the route's Vercel function
// trace (252.76 MB, over the 250 MB limit; see docs/ops/session-log.d/2026-09-20-m7a.md's Correction
// entry). Both the route and the CLI now import the pure row-parsing/row-validation/single-row-write
// logic from ONE home, src/lib/propagation/statutory-rows.ts. The attack-form assertion becomes: the
// route imports from that one home, AND the CLI scripts ALSO import from that same home rather than
// defining their own copies , a fixture that re-implements validation (in the route OR in a CLI script)
// still fails one of these assertions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { processStatutoryRowsFile } from "./logic.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(HERE, "logic.mjs"), "utf8");
const ONE_HOME = "src/lib/propagation/statutory-rows.ts";
const WRITE_STATUTORY_SOURCE = readFileSync(resolve(HERE, "..", "..", "..", "..", "..", "scripts", "propagation", "write-statutory.mjs"), "utf8");
const VALIDATE_ROWS_FILE_SOURCE = readFileSync(resolve(HERE, "..", "..", "..", "..", "..", "scripts", "propagation", "validate-statutory-rows-file.mjs"), "utf8");

test("ONE PATH , logic.mjs imports validateRowsFile/parseRow/writeOneRow from the ONE pure home, never from a CLI script (attack: a route that re-implements validation, or reaches back into the CLI's fs-backed module, fails this assertion)", () => {
  assert.match(
    SOURCE,
    /import\s*\{\s*validateRowsFile,\s*parseRow,\s*writeOneRow\s*\}\s*from\s*"[^"]*src\/lib\/propagation\/statutory-rows\.ts"/,
    `expected an import of validateRowsFile, parseRow, writeOneRow from ${ONE_HOME}`
  );
  assert.doesNotMatch(
    SOURCE,
    /from\s*"[^"]*scripts\/propagation\/(write-statutory|validate-statutory-rows-file)\.mjs"/,
    "the route must not import the CLI scripts directly , that is exactly the import that dragged scripts/lib/db.mjs's fs-backed snapshot path into the route's trace"
  );
});

test("ONE PATH , the CLI's validate-statutory-rows-file.mjs imports validateSourceBlock/validateRow/validateRowsFile from the ONE pure home, never re-implementing them (same attack form, CLI side)", () => {
  assert.match(
    VALIDATE_ROWS_FILE_SOURCE,
    /import\s*\{\s*validateSourceBlock,\s*validateRow,\s*validateRowsFile\s*\}\s*from\s*"[^"]*src\/lib\/propagation\/statutory-rows\.ts"/,
    `expected validate-statutory-rows-file.mjs to import validateSourceBlock, validateRow, validateRowsFile from ${ONE_HOME}`
  );
});

test("ONE PATH , the CLI's write-statutory.mjs imports parseRow/writeOneRow/resolveOrMintEntity's pure core from the ONE pure home, never re-implementing them (same attack form, CLI side)", () => {
  assert.match(
    WRITE_STATUTORY_SOURCE,
    /import\s*\{[^}]*parseRow\s+as\s+parseRowPure[^}]*\}\s*from\s*"[^"]*src\/lib\/propagation\/statutory-rows\.ts"/,
    `expected write-statutory.mjs to import parseRow (as parseRowPure) from ${ONE_HOME}`
  );
  assert.match(
    WRITE_STATUTORY_SOURCE,
    /writeOneRow\s+as\s+writeOneRowPure/,
    `expected write-statutory.mjs to import writeOneRow (as writeOneRowPure) from ${ONE_HOME}`
  );
  assert.match(
    WRITE_STATUTORY_SOURCE,
    /resolveOrMintEntity\s+as\s+resolveOrMintEntityPure/,
    `expected write-statutory.mjs to import resolveOrMintEntity (as resolveOrMintEntityPure) from ${ONE_HOME}`
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
