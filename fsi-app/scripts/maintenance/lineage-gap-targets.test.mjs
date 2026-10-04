// lineage-gap-targets.test.mjs -- dependency-injected, no database (lane s2a-typed-edges).
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, buildResolutionNote, ARTIFACT_NAME, RESOLVED_BY, STEP } from "./lineage-gap-targets.mjs";
import { planLinkWrites } from "../../src/lib/entities/entity-resolve.mjs";

const TEXT = "Commission Implementing Regulation (EU) 2026/394 laying down rules for the application of Regulation (EU) 2023/1805 as regards reporting.";
const CHILD = { id: "child", title: "Implementing Regulation 2026/394", instrument_identifier: "2026/394" };
const PARENT = { id: "parent", title: "FuelEU Maritime", instrument_identifier: "2023/1805" };

// a real flag row, made by the real writer
function realFlag(id, itemId) {
  const w = planLinkWrites(TEXT, [{ ...CHILD, id: itemId }], itemId).find((x) => x.table === "integrity_flags" && x.row.created_by === "lineage-gap:absent-parent");
  return { id, subject_ref: itemId, status: "open", ...w.row };
}

function makeDeps({ flags, corpus, resolveFails = false }) {
  const state = { flags: flags.map((f) => ({ ...f })), writes: [], artifacts: [] };
  return {
    state,
    todayIso: "2026-10-04",
    readOpenFlags: async () => state.flags.filter((f) => f.status === "open"),
    readCorpus: async () => corpus,
    resolveIds: async (ids, note) => {
      state.writes.push({ ids, note });
      if (resolveFails) return { updated: 0, snapshot: null };
      for (const f of state.flags) if (ids.includes(f.id)) f.status = "resolved";
      return { updated: ids.length, snapshot: "snap.jsonl" };
    },
    writeArtifact: (dir, name, json) => { state.artifacts.push({ dir, name, json }); return `${dir}/${name}`; },
  };
}

test("flag whose parent is held is RESOLVED in apply mode (guarded write, note names the parent item)", async () => {
  const deps = makeDeps({ flags: [realFlag("f1", "child")], corpus: [CHILD, PARENT] });
  const s = await main({ mode: "apply", out: "/out" }, deps);
  assert.equal(s.step, STEP);
  assert.equal(s.applied, 1);
  assert.equal(s.read_back.remaining_open, 0);
  assert.equal(deps.state.writes.length, 1);
  assert.deepEqual(deps.state.writes[0].ids, ["f1"]);
  assert.match(deps.state.writes[0].note, /now held on 2026-10-04: 2023\/1805 -> parent\./);
  assert.deepEqual(deps.state.artifacts[0].json.relink_item_ids, ["child"]);
  assert.equal(s.exitCode, 0);
});

test("flag whose parent is NOT held appears in the target list and stays open", async () => {
  const deps = makeDeps({ flags: [realFlag("f1", "child")], corpus: [CHILD] });
  const s = await main({ mode: "apply", out: "/out" }, deps);
  assert.equal(s.applied, 0);
  assert.deepEqual(deps.state.writes, []);
  const art = deps.state.artifacts[0];
  assert.equal(art.name, ARTIFACT_NAME);
  assert.deepEqual(art.json.targets, [{ identifier: "2023/1805", relationship: "implements", citing_item_id: "child", flag_id: "f1" }]);
  assert.equal(s.read_back.remaining_open, 1);
  assert.equal(s.counts.distinct_missing_identifiers, 1);
});

test("DRY writes nothing to the database but still produces the target artifact", async () => {
  const deps = makeDeps({ flags: [realFlag("f1", "child"), realFlag("f2", "other")], corpus: [CHILD, PARENT, { ...CHILD, id: "other" }] });
  const s = await main({ mode: "dry", out: "/out" }, deps);
  assert.deepEqual(deps.state.writes, [], "no flag write in dry mode");
  assert.equal(deps.state.flags.every((f) => f.status === "open"), true);
  assert.equal(s.counts.would_resolve, 2);
  assert.equal(deps.state.artifacts.length, 1);
  assert.match(s.note, /^DRY/);
});

test("no --out: no artifact is written, the summary still carries the counts", async () => {
  const deps = makeDeps({ flags: [realFlag("f1", "child")], corpus: [CHILD] });
  const s = await main({ mode: "dry" }, deps);
  assert.equal(s.artifact, null);
  assert.deepEqual(deps.state.artifacts, []);
  assert.equal(s.counts.targets, 1);
});

test("an unparseable flag is residue with its reason, never a throw and never a blocker", async () => {
  const bad = { id: "fbad", subject_ref: "child", status: "open", created_by: "lineage-gap:absent-parent", description: "nothing", recommended_actions: [] };
  const deps = makeDeps({ flags: [bad, realFlag("f1", "child")], corpus: [CHILD, PARENT] });
  const s = await main({ mode: "apply", out: "/out" }, deps);
  assert.equal(s.counts.residue, 1);
  assert.equal(deps.state.artifacts[0].json.residue[0].flag_id, "fbad");
  assert.equal(s.applied, 1);
});

test("a write that updates fewer rows than planned sets a nonzero exit code (never silent)", async () => {
  const deps = makeDeps({ flags: [realFlag("f1", "child")], corpus: [CHILD, PARENT], resolveFails: true });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.exitCode, 1);
});

test("RESOLVED_BY and the note helper are stable strings", () => {
  assert.equal(RESOLVED_BY, "lineage-gap-targets");
  assert.equal(buildResolutionNote({ citing_item_id: "c", parents: [{ identifier: "2001/1", parent_item_ids: ["a", "b"] }] }, "2026-10-04"),
    "parent instrument(s) now held on 2026-10-04: 2001/1 -> a/b. Typed edge is written by the linker's next pass over c.");
});
