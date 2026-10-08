/** Tests for scripts/proof/steps/prepare.mjs (lane PROOF-3). Filesystem and database seams are injected. */
import { test } from "node:test";
import { join } from "node:path";
import assert from "node:assert/strict";
import { ledgerVerdicts, briefBatch, chooseBriefTargets, MAX_TARGETS, HOOKS } from "./prepare.mjs";
import { validateVerdictsFile } from "../../turns/run-ledger-consume.mjs";

const LIVE = "sha256:1ceca92ff0dfae68";
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("ledgerVerdicts: writes a schema-valid fixture file and names it in the step environment", async () => {
  const written = {};
  const rows = Array.from({ length: 5 }, (_, i) => ({ candidate_id: uuid(i), url: `https://example.org/${i}`, anchor_text: `T${i}` }));
  const out = await ledgerVerdicts({
    vars: { verdict_candidates: JSON.stringify(rows) },
    livePromptVersion: async () => LIVE,
    stepTmp: "/tmp/step",
    now: () => new Date("2026-10-07T00:00:00Z"),
    writeFile: (p, t) => { written[p] = t; },
  });
  assert.equal(out.env.CP_VERDICTS_FILE, join("/tmp/step", "ledger-verdicts-chain-proof.json"));
  const parsed = JSON.parse(written[out.env.CP_VERDICTS_FILE]);
  assert.deepEqual(validateVerdictsFile(parsed), []);
  assert.match(out.notes[0], /4 usable entries and 1 stale entry/);
});

test("ledgerVerdicts: too few candidates stops the step with the count; a non-JSON query result is named", async () => {
  const base = { livePromptVersion: async () => LIVE, stepTmp: "/t", writeFile: () => {} };
  await assert.rejects(ledgerVerdicts({ ...base, vars: { verdict_candidates: "[]" } }), /needs 5 candidate rows/);
  await assert.rejects(ledgerVerdicts({ ...base, vars: { verdict_candidates: "not json" } }), /did not return JSON/);
});

test("chooseBriefTargets: most held entries first, then the smaller file, then the name; capped at MAX_TARGETS", () => {
  const batch = (ids) => ({ batch: "b", generated_at: "x", entries: ids.map((id) => ({ item_id: id, body: "b" })) });
  const batches = [
    { file: "a-big.json", bytes: 900, batch: batch([uuid(1), uuid(2)]) },
    { file: "b-small.json", bytes: 100, batch: batch([uuid(1), uuid(2)]) },
    { file: "c-one.json", bytes: 10, batch: batch([uuid(3)]) },
  ];
  const present = new Set([uuid(1), uuid(2), uuid(3)]);
  const r = chooseBriefTargets(batches, present);
  assert.equal(r.file, "b-small.json");
  assert.equal(r.entries.length, 2);
  const many = chooseBriefTargets([{ file: "m.json", bytes: 1, batch: batch([1, 2, 3, 4, 5].map(uuid)) }], new Set([1, 2, 3, 4, 5].map(uuid)));
  assert.equal(many.entries.length, MAX_TARGETS);
  assert.equal(chooseBriefTargets(batches, new Set()), null);
});

function fsFor(files) {
  return {
    listDir: () => Object.keys(files),
    readFile: (p) => files[p.split(/[\\/]/).pop()],
  };
}

test("briefBatch: keeps only the entries whose item the database holds, unchanged, in a copy of the file", async () => {
  const entries = [uuid(1), uuid(2), uuid(3)].map((id) => ({ item_id: id, source_pool_hash: "h", body: "B", metadata: {}, claims: [] }));
  const files = { "record-briefs-x.json": JSON.stringify({ batch: "record-briefs-x", generated_at: "2026-09-18T00:00:00Z", entries }) };
  const written = {};
  const asked = [];
  const out = await briefBatch({
    fsiRoot: "/fsi",
    stepTmp: "/tmp/s",
    ...fsFor(files),
    query: async (sql, params) => { asked.push([sql, params]); return [{ id: uuid(2) }]; },
    writeFile: (p, t) => { written[p] = t; },
  });
  assert.deepEqual(out.params.brief_target_ids, [uuid(2)]);
  const copy = JSON.parse(written[out.env.CP_BRIEFS_FILE]);
  assert.equal(copy.entries.length, 1);
  assert.deepEqual(copy.entries[0], entries[1]);
  assert.equal(copy.batch, "record-briefs-x-chain-proof");
  assert.match(asked[0][0], /is_archived = false/);
  assert.deepEqual(asked[0][1][0].sort(), [uuid(1), uuid(2), uuid(3)]);
});

test("ATTACK: when no committed batch names a held item the hook stops with NO TARGET instead of passing", async () => {
  const files = { "record-briefs-x.json": JSON.stringify({ batch: "x", entries: [{ item_id: uuid(1) }] }) };
  await assert.rejects(
    briefBatch({ fsiRoot: "/fsi", stepTmp: "/t", ...fsFor(files), query: async () => [], writeFile: () => { throw new Error("must not write"); } }),
    /NO TARGET/,
  );
});

test("ATTACK: batches with no item ids at all are refused", async () => {
  const files = { "record-briefs-x.json": JSON.stringify({ batch: "x", entries: [] }) };
  await assert.rejects(briefBatch({ fsiRoot: "/fsi", stepTmp: "/t", ...fsFor(files), query: async () => [], writeFile: () => {} }), /lists an item id/);
});

test("the hook table names exactly the two hooks the manifest uses", () => {
  assert.deepEqual(Object.keys(HOOKS).sort(), ["brief-batch", "ledger-verdicts"]);
});
