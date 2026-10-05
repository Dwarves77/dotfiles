// export-themes-for-briefs.test.mjs: proves the theme-briefs export over the fixture corpus (no database).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, buildExport, exportArtifactInput, DEFAULT_CHAR_BUDGET } from "./export-themes-for-briefs.mjs";
import { fixtureDeps } from "./theme-briefs/fixture-deps.mjs";
import { withoutCredentials } from "../lib/env-file.mjs";
import { emitThemeBriefsArtifact } from "./theme-briefs/artifact.mjs";
import { validateRunArtifact } from "../lib/run-artifact.mjs";
import { mkdirSync } from "node:fs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CORPUS_PATH = join(HERE, "theme-briefs/fixtures/corpus.fixture.json");
const CORPUS = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
const T1 = "11111111-1111-4111-8111-111111111111";
const SUPERSEDER = "99999999-9999-4999-8999-999999999999";
const PRIOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const clone = (x) => JSON.parse(JSON.stringify(x));

test("parseArgs: --out-dir is required; budget, limit and theme are validated", () => {
  assert.equal(parseArgs([]).ok, false);
  const ok = parseArgs(["--out-dir", "x"]);
  assert.equal(ok.ok, true);
  assert.equal(ok.charBudget, DEFAULT_CHAR_BUDGET);
  assert.equal(parseArgs(["--out-dir", "x", "--char-budget", "10"]).ok, false);
  assert.equal(parseArgs(["--out-dir", "x", "--limit", "0"]).ok, false);
  assert.deepEqual(parseArgs(["--out-dir", "x", "--theme", "a,b", "--theme", "c"]).themeIds, ["a", "b", "c"]);
  assert.equal(parseArgs(["--out-dir", "x", "--bogus"]).ok, false);
});

test("export lists a theme with no brief and one with a stale brief, skips a current one", async () => {
  const { file, summary } = await buildExport(fixtureDeps(CORPUS), { charBudget: 60000 });
  const byId = Object.fromEntries(file.bundles.map((b) => [b.theme_id, b]));
  assert.equal(byId[T1].needs, "no_brief");
  assert.equal(byId["cccccccc-cccc-4ccc-8ccc-cccccccccccc"].needs, "stale");
  assert.equal(byId["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], undefined, "the theme with a current brief is skipped");
  assert.equal(summary.themes_total, 4);
  assert.equal(summary.skipped_current, 1);
  assert.equal(summary.themes_needing_brief, 3);
});

test("export carries member claims, forward events, gaps and the full edge basis", async () => {
  const { file } = await buildExport(fixtureDeps(CORPUS), { charBudget: 60000 });
  const b = file.bundles.find((x) => x.theme_id === T1);
  assert.equal(b.members.length, 3);
  assert.ok(b.members.every((m) => m.title && m.item_type && m.surface && m.summary));
  assert.ok(b.members.some((m) => m.claims.length > 0));
  assert.equal(b.members.find((m) => m.id === T1).forward_events.length, 1);
  assert.equal(b.gaps[0].type, "pivot_operations_gap");
  assert.equal(b.intra_theme_edges.length, 2);
  assert.deepEqual(b.intra_theme_edges[0].basis.map((x) => x.signal), ["shared_scenario", "shared_compliance_object"]);
  assert.deepEqual([...b.surfaces].sort(), ["market", "regulations", "research"]);
});

test("export: a theme whose smallest member changed is listed superseded, with supersedes_theme_id", async () => {
  const { file, summary } = await buildExport(fixtureDeps(CORPUS), { charBudget: 60000 });
  const b = file.bundles.find((x) => x.theme_id === SUPERSEDER);
  assert.equal(b.needs, "superseded");
  assert.equal(b.supersedes_theme_id, PRIOR);
  assert.equal(b.prior_brief.title, "Packaging reuse cluster");
  assert.equal(summary.by_reason.superseded, 1);
});

test("export: a legacy brief with no stored members is found through the latest run's theme_delta lineage", async () => {
  const corpus = clone(CORPUS);
  for (const r of corpus.tables.theme_briefs) delete r.member_ids;
  corpus.missing_columns = { theme_briefs: ["member_ids", "sections", "claims"] };
  const without = await buildExport(fixtureDeps(corpus), { charBudget: 60000 });
  assert.equal(without.file.bundles.find((x) => x.theme_id === SUPERSEDER).needs, "no_brief");
  corpus.tables.connection_theme_runs = [{ id: 1, started_at: "2026-09-02T00:00:00Z", status: "ok", theme_delta: { renamed: [{ prior_id: PRIOR, new_id: SUPERSEDER }] } }];
  const withLineage = await buildExport(fixtureDeps(corpus), { charBudget: 60000 });
  assert.equal(withLineage.file.bundles.find((x) => x.theme_id === SUPERSEDER).needs, "superseded");
  assert.equal(withLineage.summary.briefs_have_member_ids, false);
});

test("export: --theme and --limit narrow the bundle; the summary still counts every theme needing a brief", async () => {
  const one = await buildExport(fixtureDeps(CORPUS), { charBudget: 60000, themeIds: [T1] });
  assert.equal(one.file.bundles.length, 1);
  const lim = await buildExport(fixtureDeps(CORPUS), { charBudget: 60000, limit: 1 });
  assert.equal(lim.file.bundles.length, 1);
  assert.equal(lim.summary.themes_needing_brief, 3);
  assert.equal(lim.file.bundles[0].theme_id, T1, "highest convergence first");
});

test("export: honest truncation reporting under a tight char budget", async () => {
  const { file, summary } = await buildExport(fixtureDeps(CORPUS), { charBudget: 1500, themeIds: [T1] });
  const t = file.bundles[0].truncation;
  assert.ok(t.members_omitted + t.claims_omitted + t.edges_omitted + t.forward_events_omitted > 0);
  assert.equal(t.members_included + t.members_omitted, t.members_total);
  assert.equal(summary.members_omitted, t.members_omitted);
});

test("export is read only: it never calls a write dep", async () => {
  const deps = fixtureDeps(CORPUS);
  let wrote = 0;
  const guarded = { ...deps, guardedInsert: () => { wrote++; }, guardedUpdate: () => { wrote++; } };
  await buildExport(guarded, { charBudget: 60000 });
  assert.equal(wrote, 0);
});

test("CLI: exits 2 with no database credentials and no --fixture", () => {
  const r = spawnSync(process.execPath, [join(HERE, "export-themes-for-briefs.mjs"), "--out-dir", tmpdir()], { env: { ...withoutCredentials(), FSI_NO_ENV_FILE: "1" }, encoding: "utf8" });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /no database credentials/);
});

test("CLI: --fixture writes one bundle file to --out-dir and exits 0 with no credentials", () => {
  const out = mkdtempSync(join(tmpdir(), "tb-export-"));
  const r = spawnSync(process.execPath, [join(HERE, "export-themes-for-briefs.mjs"), "--out-dir", out, "--fixture", CORPUS_PATH], { env: { ...withoutCredentials(), FSI_NO_ENV_FILE: "1" }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const files = readdirSync(out);
  assert.equal(files.length, 1);
  const f = JSON.parse(readFileSync(join(out, files[0]), "utf8"));
  assert.equal(f.bundles.length, 3);
});

test("the export run artifact is schema valid and records each theme needing a brief", async () => {
  const parsed = { charBudget: 60000, limit: null, themeIds: null };
  const { summary, needs } = await buildExport(fixtureDeps(CORPUS), { charBudget: 60000 });
  const dir = mkdtempSync(join(tmpdir(), "tb-export-art-"));
  const familyDir = join(dir, "theme-briefs");
  mkdirSync(familyDir);
  const path = emitThemeBriefsArtifact(exportArtifactInput({ parsed, summary, needs, outPath: "bundle.json", startedAt: "2026-10-04T00:00:00.000Z" }), { familyDir });
  const art = JSON.parse(readFileSync(path, "utf8"));
  assert.doesNotThrow(() => validateRunArtifact(art));
  assert.equal(art.config.action, "export");
  assert.equal(art.per_item.length, 3);
  assert.equal(art.metrics.superseded, 1);
});
