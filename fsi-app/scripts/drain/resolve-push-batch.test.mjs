// resolve-push-batch.test.mjs: which batch file a merge added (lane G6-DRAIN). git is injected.
import test from "node:test";
import assert from "node:assert/strict";
import { kindById } from "./kinds.mjs";
import { selectBatchFiles, decideBatch, changedPaths, parseArgs } from "./resolve-push-batch.mjs";

const theme = kindById("theme-briefs");
const ledger = kindById("ledger-verdicts");

test("selectBatchFiles keeps only this kind's batch files, repo or app relative, deduplicated and sorted", () => {
  const got = selectBatchFiles(theme, ["fsi-app/scripts/turns/theme-briefs/batches/theme-briefs-002.json", "scripts/turns/theme-briefs/batches/theme-briefs-002.json", "fsi-app/scripts/turns/theme-briefs/README.md", "fsi-app/scripts/turns/question-answers/batches/question-answers-001.json"]);
  assert.deepEqual(got, ["scripts/turns/theme-briefs/batches/theme-briefs-002.json"]);
});

test("decideBatch: zero files is a clean no-op, one file is applied, a file-naming kind refuses two", () => {
  assert.deepEqual(decideBatch(theme, []), { ok: true, file: "", count: 0 });
  assert.deepEqual(decideBatch(theme, ["scripts/turns/theme-briefs/batches/theme-briefs-002.json"]), { ok: true, file: "scripts/turns/theme-briefs/batches/theme-briefs-002.json", count: 1 });
  const two = decideBatch(theme, ["a", "b"]);
  assert.equal(two.ok, false);
  assert.match(two.error, /exactly one per merge/);
});

test("decideBatch: a kind whose workflow auto-discovers its files names none and accepts several", () => {
  assert.deepEqual(decideBatch(ledger, ["x", "y"]), { ok: true, file: "", count: 2 });
});

test("changedPaths: before..sha when reachable, else the commit against its first parent, else diff-tree", () => {
  const run = (_g, args) => (args.includes("cafe") ? { status: 128, stdout: "" } : { status: 0, stdout: "a.json\nb.json\n" });
  assert.deepEqual(changedPaths({ before: "good", sha: "f00d", run }), ["a.json", "b.json"]);
  assert.deepEqual(changedPaths({ before: "cafe", sha: "f00d", run }), ["a.json", "b.json"]);
  assert.deepEqual(changedPaths({ before: "0000000000000000000000000000000000000000", sha: "f00d", run }), ["a.json", "b.json"]);
  const seen = [];
  const rec = (_g, args) => { seen.push(args.join(" ")); return { status: 0, stdout: "z.json\n" }; };
  changedPaths({ before: "good", sha: "f00d", run: rec });
  assert.match(seen[0], /diff --name-only --diff-filter=AM good f00d/);
  const none = () => ({ status: 1, stdout: "" });
  assert.deepEqual(changedPaths({ before: "", sha: "f00d", run: none }), []);
});

test("parseArgs: --kind must be a drain kind", () => {
  assert.equal(parseArgs(["--kind", "nope"]).ok, false);
  assert.equal(parseArgs([]).ok, false);
  assert.equal(parseArgs(["--kind", "theme-briefs", "--sha", "abc"]).kind.id, "theme-briefs");
});
