// The real readAll("system_state", "scrape_cadence") that recompute-tiers' buildDeps().readCadence performs, run
// through db.mjs's real readAll, TABLE_PRIMARY_KEY ordering and readClient() proxy over a fake client (lane TESTS-1,
// 2026-10-09; S1C session log, "readAll uses the real read client"). recompute-tiers.npmtest.mjs proves main() with an
// INJECTED readCadence; this file proves the leg it injects. buildDeps itself needs jiti (an npm package), so it stays
// in the npmtest; this file imports only node builtins and relative modules, so the no-npm discipline job runs it.
//
// Run: node --test fsi-app/scripts/maintenance/recompute-tiers-cadence.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readAll, __setWriteClientForTest } from "../lib/db.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function makeClient(rows) {
  const calls = [];
  function from(table) {
    const state = { table, ops: [] };
    const b = {
      select(c) { state.ops.push(["select", c]); return b; },
      order(c) { state.ops.push(["order", c]); return b; },
      range(a, z) { state.ops.push(["range", a, z]); return b; },
      then(res, rej) { calls.push(state); return Promise.resolve({ data: rows, error: null }).then(res, rej); },
    };
    return b;
  }
  return { from, __calls: calls };
}

// The exact expression buildDeps().readCadence evaluates, taken from the source so the two cannot drift.
const SRC = readFileSync(join(HERE, "recompute-tiers.mjs"), "utf8");
const readCadenceBody = SRC.match(/readCadence: async \(\) => \{([^]*?)\n    \},/);

test("buildDeps().readCadence reads system_state.scrape_cadence through readAll and fails closed to 'off'", () => {
  assert.ok(readCadenceBody, "the readCadence closure is found in recompute-tiers.mjs");
  assert.match(readCadenceBody[1], /readAll\("system_state", "scrape_cadence"\)/);
  assert.match(readCadenceBody[1], /\?\? "off"/);
});

async function readCadenceWith(rows) {
  const client = makeClient(rows);
  __setWriteClientForTest(() => client);
  try {
    // Same two lines as the closure (asserted above): the real readAll, then the fail-closed default.
    const got = await readAll("system_state", "scrape_cadence");
    return { cadence: got?.[0]?.scrape_cadence ?? "off", client };
  } finally { __setWriteClientForTest(null); }
}

test("readAll('system_state') resolves an order key (the singleton table is in TABLE_PRIMARY_KEY) and selects scrape_cadence", async () => {
  const { cadence, client } = await readCadenceWith([{ scrape_cadence: "weekly" }]);
  assert.equal(cadence, "weekly");
  assert.equal(client.__calls.length, 1);
  const ops = client.__calls[0].ops;
  assert.deepEqual(ops.find((o) => o[0] === "select"), ["select", "scrape_cadence"]);
  assert.deepEqual(ops.find((o) => o[0] === "order"), ["order", "id"]);
});

test("a missing system_state row reads as 'off' (the build-mode hold, fail closed)", async () => {
  assert.equal((await readCadenceWith([])).cadence, "off");
});

test("a row with a null scrape_cadence reads as 'off'", async () => {
  assert.equal((await readCadenceWith([{ scrape_cadence: null }])).cadence, "off");
});
