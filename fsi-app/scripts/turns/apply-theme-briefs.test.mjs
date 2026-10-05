// apply-theme-briefs.test.mjs: proves the theme-briefs apply step over the fixture corpus (no database).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, applyThemeBriefs, applyArtifactInput, buildThemeBriefRow, writeThemeBriefRow, probeStructuredColumns } from "./apply-theme-briefs.mjs";
import { fixtureDeps } from "./theme-briefs/fixture-deps.mjs";
import { emitThemeBriefsArtifact } from "./theme-briefs/artifact.mjs";
import { computeMemberHash } from "../../src/lib/connections/brief-staleness.mjs";
import { validateRunArtifact } from "../lib/run-artifact.mjs";
import { withoutCredentials } from "../lib/env-file.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CORPUS_PATH = join(HERE, "theme-briefs/fixtures/corpus.fixture.json");
const BATCH_PATH = join(HERE, "theme-briefs/fixtures/theme-briefs-000.fixture.json");
const CORPUS = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
const BATCH = JSON.parse(readFileSync(BATCH_PATH, "utf8"));
const T1 = "11111111-1111-4111-8111-111111111111";
const clone = (x) => JSON.parse(JSON.stringify(x));
const NOW = () => "2026-10-04T12:00:00.000Z";
const cliEnv = { ...withoutCredentials(), FSI_NO_ENV_FILE: "1" };

test("parseArgs: --briefs is required; --execute and --fixture are optional", () => {
  assert.equal(parseArgs([]).ok, false);
  const r = parseArgs(["--briefs", "b.json"]);
  assert.deepEqual([r.ok, r.execute, r.fixture], [true, false, null]);
  assert.equal(parseArgs(["--briefs", "b.json", "--execute"]).execute, true);
  assert.equal(parseArgs(["--briefs", "b.json", "--wat"]).ok, false);
});

test("dry mode: a valid entry is planned and ZERO rows are written", async () => {
  const deps = fixtureDeps(CORPUS);
  const before = deps.tables.theme_briefs.length;
  const r = await applyThemeBriefs({ json: clone(BATCH), execute: false, deps, now: NOW });
  assert.equal(r.valid.length, 1);
  assert.deepEqual(r.written, [{ theme_id: T1, mode: "dry", snapshot: null }]);
  assert.equal(deps.tables.theme_briefs.length, before);
  assert.equal(deps.tables.theme_briefs.find((b) => b.theme_id === T1), undefined);
});

test("execute mode: a valid entry writes exactly one new theme_briefs row, read back", async () => {
  const deps = fixtureDeps(CORPUS);
  const before = deps.tables.theme_briefs.length;
  const r = await applyThemeBriefs({ json: clone(BATCH), execute: true, deps, now: NOW });
  assert.equal(deps.tables.theme_briefs.length, before + 1);
  assert.deepEqual(r.readBackFailures, []);
  assert.equal(r.written[0].mode, "insert");
  const row = deps.tables.theme_briefs.find((b) => b.theme_id === T1);
  assert.equal(row.generated_by, "theme-briefs-000", "generated_by records the batch name");
  assert.equal(row.member_hash, computeMemberHash([T1, "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"]));
  assert.equal(row.member_count, 3);
  assert.equal(row.generated_at, NOW());
  assert.ok(row.brief_md.startsWith("# CBAM obligation"));
  assert.ok(row.brief_md.indexOf("## Connection") < row.brief_md.indexOf("## What it means"));
  assert.deepEqual(Object.keys(row.sections), ["connection", "meaning", "ramifications", "watch", "gaps"]);
  assert.equal(row.claims.length, 5);
  assert.equal(row.member_ids.length, 3, "the membership the brief was written for, so a drifted id can find it");
});

test("execute mode: an existing row is updated through guardedUpdate, not duplicated", async () => {
  const deps = fixtureDeps(CORPUS);
  await applyThemeBriefs({ json: clone(BATCH), execute: true, deps, now: NOW });
  const n = deps.tables.theme_briefs.length;
  const r2 = await applyThemeBriefs({ json: clone(BATCH), execute: true, deps, now: NOW });
  assert.equal(r2.written[0].mode, "update");
  assert.equal(deps.tables.theme_briefs.length, n);
});

test("a refused entry is never written, and never blocks the valid one beside it", async () => {
  const deps = fixtureDeps(CORPUS);
  const json = clone(BATCH);
  const bad = clone(BATCH.entries[0]);
  bad.theme_id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  bad.member_hash = "stale";
  json.entries = [bad, BATCH.entries[0]];
  const r = await applyThemeBriefs({ json, execute: true, deps, now: NOW });
  assert.equal(r.valid.length, 1);
  assert.equal(r.refused.length, 1);
  assert.match(r.refused[0].errors[0], /member_hash does not match/);
  assert.equal(deps.tables.theme_briefs.find((b) => b.theme_id === "cccccccc-cccc-4ccc-8ccc-cccccccccccc").generated_by, "session-executor", "the refused theme's stored brief is untouched");
});

test("a structurally invalid file writes nothing", async () => {
  const deps = fixtureDeps(CORPUS);
  const before = deps.tables.theme_briefs.length;
  const r = await applyThemeBriefs({ json: { batch: "bad", entries: [] }, execute: true, deps, now: NOW });
  assert.equal(r.ok, false);
  assert.equal(deps.tables.theme_briefs.length, before);
});

test("the writer tolerates migration 351's columns being absent: base columns only", async () => {
  const deps = fixtureDeps({ ...CORPUS, missing_columns: { theme_briefs: ["sections", "claims", "member_ids"] } });
  assert.equal(await probeStructuredColumns(deps), false);
  const r = await applyThemeBriefs({ json: clone(BATCH), execute: true, deps, now: NOW });
  assert.equal(r.structured, false);
  assert.deepEqual(r.readBackFailures, []);
  const row = deps.tables.theme_briefs.find((b) => b.theme_id === T1);
  assert.equal(row.sections, undefined);
  assert.ok(row.brief_md.includes("## Ramifications"));
});

test("probeStructuredColumns reports true once the columns exist", async () => {
  assert.equal(await probeStructuredColumns(fixtureDeps(CORPUS)), true);
});

test("buildThemeBriefRow: base columns, plus the structured form only when asked", () => {
  const e = clone(BATCH.entries[0]);
  const base = buildThemeBriefRow(e, { batch: "theme-briefs-000", themeMemberIds: ["b", "a"], nowIso: NOW(), structured: false });
  assert.deepEqual(Object.keys(base).sort(), ["brief_md", "generated_at", "generated_by", "member_count", "member_hash", "theme_id", "title"]);
  const full = buildThemeBriefRow(e, { batch: "theme-briefs-000", themeMemberIds: ["b", "a"], nowIso: NOW(), structured: true });
  assert.deepEqual(full.member_ids, ["a", "b"]);
});

test("writeThemeBriefRow: insert when absent, update when present", async () => {
  const deps = fixtureDeps({ tables: { theme_briefs: [] } });
  const row = { theme_id: "t", member_hash: "h", member_count: 1, title: "x", brief_md: "# x", generated_at: NOW(), generated_by: "b" };
  assert.equal((await writeThemeBriefRow(row, deps)).mode, "insert");
  assert.equal((await writeThemeBriefRow({ ...row, title: "y" }, deps)).mode, "update");
  assert.equal(deps.tables.theme_briefs[0].title, "y");
});

test("a write that does not read back is reported as a read-back failure", async () => {
  const deps = fixtureDeps(CORPUS);
  const lying = { ...deps, guardedInsert: async () => ({ inserted: {}, snapshot: "fixture" }) };
  const r = await applyThemeBriefs({ json: clone(BATCH), execute: true, deps: lying, now: NOW });
  assert.deepEqual(r.readBackFailures, [T1]);
});

test("the run artifact validates against the harness convention", () => {
  const dir = mkdtempSync(join(tmpdir(), "tb-artifact-"));
  const familyDir = join(dir, "theme-briefs");
  mkdirSync(familyDir);
  const path = emitThemeBriefsArtifact({
    action: "apply", startedAt: NOW(), config: { mode: "dry" }, inputsRef: ["b.json"],
    perItem: [{ id: T1, outcome: "valid_dry", verdict: "ok", evidence_refs: [], error: null }],
    metrics: { valid: 1 }, defectsFound: [], fullTraceRefs: ["b.json"], proposerNotes: "",
  }, { familyDir });
  const art = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(art.harness_family, "theme-briefs");
  assert.equal(art.run_id, "theme-briefs-run-001");
  assert.equal(art.config.action, "apply");
  assert.doesNotThrow(() => validateRunArtifact(art));
  assert.ok(readdirSync(familyDir).includes("theme-briefs-run-001.json"));
});

test("CLI: exits 2 with no database credentials and no --fixture", () => {
  const r = spawnSync(process.execPath, [join(HERE, "apply-theme-briefs.mjs"), "--briefs", BATCH_PATH], { env: cliEnv, encoding: "utf8" });
  assert.equal(r.status, 2, r.stderr);
});

test("CLI: --fixture dry run validates the fixture batch and exits 0", () => {
  const r = spawnSync(process.execPath, [join(HERE, "apply-theme-briefs.mjs"), "--briefs", BATCH_PATH, "--fixture", CORPUS_PATH], { env: cliEnv, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 valid, 0 refused \(DRY RUN, nothing written\)/);
});

test("CLI: --fixture --execute writes into memory only and exits 0", () => {
  const r = spawnSync(process.execPath, [join(HERE, "apply-theme-briefs.mjs"), "--briefs", BATCH_PATH, "--fixture", CORPUS_PATH, "--execute"], { env: cliEnv, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /WROTE \(insert\) theme_briefs 11111111/);
});

test("the apply run artifact is schema valid and carries every refusal reason as residue", async () => {
  const json = clone(BATCH);
  const bad = clone(BATCH.entries[0]);
  bad.theme_id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  bad.member_hash = "stale";
  json.entries = [bad, BATCH.entries[0]];
  const r = await applyThemeBriefs({ json, execute: false, deps: fixtureDeps(CORPUS), now: NOW });
  const dir = mkdtempSync(join(tmpdir(), "tb-apply-art-"));
  const familyDir = join(dir, "theme-briefs");
  mkdirSync(familyDir);
  const path = emitThemeBriefsArtifact(applyArtifactInput({ parsed: { execute: false, briefs: "b.json" }, r, briefsPath: "b.json", startedAt: NOW() }), { familyDir });
  const art = JSON.parse(readFileSync(path, "utf8"));
  assert.doesNotThrow(() => validateRunArtifact(art));
  assert.equal(art.metrics.valid, 1);
  assert.equal(art.metrics.refused, 1);
  assert.equal(art.defects_found.length, 1);
  assert.ok(art.per_item.some((i) => i.outcome === "refused" && /member_hash/.test(i.error)));
});
