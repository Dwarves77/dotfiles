// needs-search.test.mjs: the needs-search export, schema and apply on fixtures (lane G5-SEARCH). No database,
// no network. Run: node --test scripts/turns/needs-search/needs-search.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NEEDS_SEARCH_SCHEMA_VERSION, OUTPUT_FOR_KIND, needKindOf, needKey, validateNeedEntry, validateNeedsFile,
} from "./schema.mjs";
import { RESOLVED_BY, buildAppliedNote, parseAppliedNote, needFromFlag, collectOpenNeeds, loadAppliedKeys } from "./data.mjs";
import { buildExport, parseArgs as parseExportArgs, exportArtifactInput } from "../export-needs-for-search.mjs";
import { applyNeedUrls, applyArtifactInput, buildRealDeps, CITE, parseArgs as parseApplyArgs } from "../apply-need-urls.mjs";
import { fixtureDeps } from "./fixture-deps.mjs";
import { ensureCensusRow, ratifyFlag } from "../../connections/ratify-flag-to-census.mjs";
import { kindById } from "../../drain/kinds.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = JSON.parse(readFileSync(resolve(HERE, "fixtures/corpus.fixture.json"), "utf8"));
const BATCH_001 = JSON.parse(readFileSync(resolve(HERE, "batches/needs-search-001.json"), "utf8"));
const NOW = () => "2026-10-07T00:00:00.000Z";

const F = (n) => `11111111-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A fresh in-memory database; the already-applied fixture flag gets its real marker note. */
function freshDeps() {
  const corpus = JSON.parse(JSON.stringify(CORPUS));
  const twin = corpus.tables.integrity_flags.find((f) => f.id === F(7));
  const probe = needFromFlag(twin).need;
  corpus.tables.integrity_flags.find((f) => f.id === F(6)).resolution_note = buildAppliedNote({ key: probe.key, url: "https://eur-lex.europa.eu/fixture/earlier", sourceId: "s", tier: 1, kind: probe.kind, output: "census_worklist:x", batch: "needs-search-000" });
  return fixtureDeps(corpus);
}

const entry = (over = {}) => ({
  need_id: F(1), url: "https://eur-lex.europa.eu/legal-content/fixture", institution: "Publications Office", why_authoritative: "official journal host", confidence: 0.8, ...over,
});
const needCtx = () => {
  const deps = freshDeps();
  const needs = new Map();
  return deps.readAll("integrity_flags", "*", {}).then((rows) => {
    for (const f of rows) { const r = needFromFlag(f); if (r.need && f.status === "open") needs.set(f.id, r.need); }
    return { needs, committedVerdicts: new Map() };
  });
};

// ── schema ──────────────────────────────────────────────────────────────────────────────────────────────
test("need kinds are told apart by created_by namespace; each kind names the output its URL feeds", () => {
  assert.equal(needKindOf("term-need:standard"), "term-need");
  assert.equal(needKindOf("holdings-need:comply"), "holdings-need");
  assert.equal(needKindOf("flywheel-gap:surface_gap"), "flywheel-gap");
  assert.equal(needKindOf("lineage-gap:absent-parent"), "lineage-gap");
  assert.equal(needKindOf("question:what"), null);
  assert.equal(OUTPUT_FOR_KIND["lineage-gap"], "portal_link_candidate");
  for (const k of ["term-need", "holdings-need", "flywheel-gap"]) assert.equal(OUTPUT_FOR_KIND[k], "census_worklist");
});

test("needKey is stable for the same need and changes with the need text", () => {
  const a = needKey({ kind: "term-need", subject_ref: "s", text: "x" });
  assert.equal(a, needKey({ kind: "term-need", subject_ref: "s", text: "  x " }));
  assert.notEqual(a, needKey({ kind: "term-need", subject_ref: "s", text: "y" }));
});

test("a rated host entry is valid and its tier is read from the class table", async () => {
  const ctx = await needCtx();
  const v = validateNeedEntry(entry(), 0, ctx);
  assert.deepEqual(v.errors, []);
  assert.equal(v.plan.tier, 1);
  assert.equal(v.plan.tier_source, "class_table");
});

test("ATTACK: an unrated host without a host verdict is refused whole", async () => {
  const ctx = await needCtx();
  const v = validateNeedEntry(entry({ url: "https://needs-fixture.example/page", institution: "Fixture Institute" }), 0, ctx);
  assert.equal(v.plan, null);
  assert.match(v.errors.join("|"), /class table does not rate host needs-fixture\.example/);
});

test("an institution name never rates a host (the author cannot name a tier into existence)", async () => {
  const ctx = await needCtx();
  const v = validateNeedEntry(entry({ url: "https://needs-fixture.example/page", institution: "Fixture Research Association" }), 0, ctx);
  assert.ok(v.errors.length, "an association-sounding name must not rate an unrated host");
});

test("an accompanying host verdict in the host-verdicts entry format places the host; the tier comes from the table", async () => {
  const ctx = await needCtx();
  const verdict = BATCH_001.entries[0].host_verdict;
  const v = validateNeedEntry(entry({ url: BATCH_001.entries[0].url, host_verdict: verdict }), 0, ctx);
  assert.deepEqual(v.errors, []);
  assert.equal(v.plan.tier, 4);
  assert.equal(v.plan.tier_source, "accompanying_host_verdict");
});

test("a host verdict must name the url's own host, carry no tier, and use a known class", async () => {
  const ctx = await needCtx();
  const base = { ...BATCH_001.entries[0].host_verdict };
  const url = "https://needs-fixture.example/page";
  assert.match(validateNeedEntry(entry({ url, host_verdict: { ...base, host: "other.example" } }), 0, ctx).errors.join("|"), /host_verdict host/);
  assert.match(validateNeedEntry(entry({ url, host_verdict: { ...base, tier: 1 } }), 0, ctx).errors.join("|"), /never a tier/);
  assert.match(validateNeedEntry(entry({ url, host_verdict: { ...base, class: "oracle" } }), 0, ctx).errors.join("|"), /unknown class/);
});

test("a host verdict never places a permanently unregistered host (an aggregator)", async () => {
  const ctx = await needCtx();
  const verdict = { host: "law.justia.com", class: "legal", evidence: "page title", verdict_source: "session-lane", generated_at: "2026-10-07T00:00:00Z" };
  const v = validateNeedEntry(entry({ url: "https://law.justia.com/codes/fixture", host_verdict: verdict }), 0, ctx);
  assert.match(v.errors.join("|"), /aggregator or hosting platform/);
});

test("a committed host verdict places an otherwise unrated host", async () => {
  const ctx = await needCtx();
  ctx.committedVerdicts = new Map([["needs-fixture.example", { class: "association", batch: "host-verdicts-001" }]]);
  const v = validateNeedEntry(entry({ url: "https://needs-fixture.example/page" }), 0, ctx);
  assert.deepEqual(v.errors, []);
  assert.equal(v.plan.tier, 4);
  assert.equal(v.plan.tier_source, "committed_host_verdict");
});

test("url, institution, why, confidence, tier field and unknown need are refused", async () => {
  const ctx = await needCtx();
  const errs = (e) => validateNeedEntry(e, 0, ctx).errors.join("|");
  assert.match(errs(entry({ url: "ftp://eur-lex.europa.eu/x" })), /http or https/);
  assert.match(errs(entry({ url: "https://user:pw@eur-lex.europa.eu/x" })), /credentials/);
  assert.match(errs(entry({ url: "not a url" })), /url/);
  assert.match(errs(entry({ institution: "" })), /institution/);
  assert.match(errs(entry({ why_authoritative: "" })), /why_authoritative/);
  assert.match(errs(entry({ confidence: 1.5 })), /confidence/);
  assert.match(errs(entry({ tier: 1 })), /names a source, never a tier/);
  assert.match(errs(entry({ need_id: "99999999-0000-4000-8000-000000000000" })), /unknown need/);
  assert.match(errs(entry({ need_id: F(8) })), /unknown need/, "a question flag is not a need");
});

test("file validation: a structural problem fails the file; a bad entry never blocks a good one; a repeated need is refused", async () => {
  const ctx = await needCtx();
  assert.equal(validateNeedsFile({ batch: "nope" }, ctx).ok, false);
  const good = { batch: "needs-search-009", generated_at: "2026-10-07T00:00:00Z", authored_by: "session-lane", entries: [entry(), entry({ need_id: F(2), url: "https://needs-fixture.example/x" }), entry()] };
  const r = validateNeedsFile(good, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.valid.length, 1);
  assert.equal(r.refused.length, 2);
  assert.ok(r.refused.some((x) => /duplicate need_id/.test(x.errors.join("|"))));
  assert.equal(NEEDS_SEARCH_SCHEMA_VERSION, "ns1-2026-10-07.1");
});

// ── data ────────────────────────────────────────────────────────────────────────────────────────────────
test("applied note round trips", () => {
  const note = buildAppliedNote({ key: "abc123", url: "https://eur-lex.europa.eu/x", sourceId: "s1", tier: 1, kind: "term-need", output: "census_worklist:c1", batch: "needs-search-003" });
  assert.deepEqual(parseAppliedNote(note), { key: "abc123", url: "https://eur-lex.europa.eu/x" });
  assert.equal(parseAppliedNote("answered by inference"), null);
});

test("needFromFlag: each kind yields its text and context; an unstructured term need is residue", () => {
  const byId = new Map(CORPUS.tables.integrity_flags.map((f) => [f.id, f]));
  assert.equal(needFromFlag(byId.get(F(1))).need.kind, "term-need");
  assert.equal(needFromFlag(byId.get(F(1))).need.context.term_kind, "standard");
  assert.equal(needFromFlag(byId.get(F(2))).need.context.product_question, "comply");
  assert.match(needFromFlag(byId.get(F(3))).need.text, /no market signal tracked/);
  assert.match(needFromFlag(byId.get(F(5))).skip, /structured/);
  assert.equal(needFromFlag(byId.get(F(8))).skip, "not a need namespace");
});

// ── export ──────────────────────────────────────────────────────────────────────────────────────────────
test("export lists open needs of the four kinds in age order with the output each feeds; skips what is in flight", async () => {
  const { file, summary } = await buildExport(freshDeps(), { limit: 100, now: NOW });
  const ids = file.needs.map((n) => n.need_id);
  assert.deepEqual(ids, [F(1), F(2), F(3), F(4)], "oldest first; the unstructured, in-flight and held-parent needs are not listed");
  assert.deepEqual(file.needs.map((n) => n.kind), ["term-need", "holdings-need", "flywheel-gap", "lineage-gap"]);
  assert.deepEqual(file.needs.map((n) => n.output), ["census_worklist", "census_worklist", "census_worklist", "portal_link_candidate"]);
  assert.match(file.needs[3].text, /Directive \(EU\) 2099\/9999/);
  for (const n of file.needs) {
    assert.ok(n.created_at && n.subject_ref && n.text && n.key, n.need_id);
    assert.match(n.satisfies.requirement, /authoritative URL/);
    assert.equal(n.satisfies.tier_floors.regulation_family, 2);
  }
  assert.equal(summary.needs_exported, 4);
  assert.equal(summary.open_needs_by_kind["term-need"], 3);
  assert.equal(summary.skipped_url_in_flight, 1);
  assert.equal(summary.skipped_no_absent_parent, 1);
  assert.equal(summary.unparseable, 1);
  assert.equal(file.schema_version, "ns1-export-2026-10-07.1");
});

test("export honours --limit and counts what it did not examine", async () => {
  const { file, summary } = await buildExport(freshDeps(), { limit: 2, now: NOW });
  assert.equal(file.needs.length, 2);
  assert.ok(summary.not_examined_over_limit >= 1);
});

test("export CLI args", () => {
  assert.equal(parseExportArgs([]).ok, false);
  assert.equal(parseExportArgs(["--out-dir", "x", "--limit", "0"]).ok, false);
  assert.deepEqual(parseExportArgs(["--out-dir", "x"]), { ok: true, outDir: "x", limit: 100, fixture: null });
});

test("export artifact input is a read-only export record", async () => {
  const { file } = await buildExport(freshDeps(), { limit: 100, now: NOW });
  const a = exportArtifactInput({ parsed: { limit: 100 }, file, outPath: "/tmp/x.json", startedAt: NOW() });
  assert.equal(a.action, "export");
  assert.equal(a.perItem.length, file.needs.length + file.residue.length);
});

// ── apply ───────────────────────────────────────────────────────────────────────────────────────────────
test("the committed first batch validates against the fixture corpus and DRY apply writes nothing", async () => {
  const deps = freshDeps();
  const before = JSON.stringify(deps.tables);
  const r = await applyNeedUrls({ json: BATCH_001, execute: false, deps, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.valid.length, 2);
  assert.equal(r.refused.length, 0);
  assert.equal(JSON.stringify(deps.tables), before, "dry run changed no table");
  assert.equal(r.report.would.sources_registered, 1, "the fixture host is new");
  assert.equal(r.report.would.sources_existing, 1, "EUR-Lex is already registered");
  assert.equal(r.report.would.census_rows, 1);
  assert.equal(r.report.would.portal_candidates, 1);
  assert.equal(r.report.would.flags_resolved, 2);
  assert.equal(r.report.flags_resolved, 0);
});

test("EXECUTE over the fixture: source registered at the table tier, census row and portal candidate created, flags resolved, read back", async () => {
  const deps = freshDeps();
  const r = await applyNeedUrls({ json: BATCH_001, execute: true, deps, now: NOW });
  assert.deepEqual(r.writeFailures, []);
  assert.deepEqual(r.readBackFailures, []);
  assert.equal(r.report.sources_registered, 1);
  assert.equal(r.report.sources_existing, 1);
  assert.equal(r.report.census_rows_created, 1);
  assert.equal(r.report.portal_candidates_upserted, 1);
  assert.equal(r.report.flags_resolved, 2);

  const src = deps.tables.sources.find((s) => s.url === BATCH_001.entries[0].url);
  assert.equal(src.base_tier, 4, "standards_body class tier from HOST_CLASS_TIER, never typed");
  assert.equal(src.name, "Fixture Standards Institute");
  assert.equal(deps.tables.sources.filter((s) => s.url.startsWith("https://eur-lex")).length, 1, "the existing EUR-Lex source is reused, not duplicated");

  const census = deps.tables.census_worklist;
  assert.equal(census.length, 1);
  assert.equal(census[0].document_url, BATCH_001.entries[0].url);
  assert.equal(census[0].lane, "C");
  assert.equal(census[0].created_by, `flywheel-ratified:${F(1)}`);
  assert.equal(census[0].source_id, src.id);

  assert.equal(deps.tables.portal_link_candidates.length, 1);
  assert.equal(deps.tables.portal_link_candidates[0].url, BATCH_001.entries[1].url);
  assert.equal(deps.tables.portal_link_candidates[0].source_id, "bbbbbbbb-0000-4000-8000-000000000a01");

  for (const id of [F(1), F(4)]) {
    const f = deps.tables.integrity_flags.find((x) => x.id === id);
    assert.equal(f.status, "resolved");
    assert.equal(f.resolved_by, RESOLVED_BY);
    assert.ok(parseAppliedNote(f.resolution_note));
  }
});

test("a second apply of the same batch writes nothing and reports already applied", async () => {
  const deps = freshDeps();
  await applyNeedUrls({ json: BATCH_001, execute: true, deps, now: NOW });
  const snap = JSON.stringify(deps.tables);
  const r2 = await applyNeedUrls({ json: BATCH_001, execute: true, deps, now: NOW });
  assert.equal(r2.alreadyApplied.length, 2);
  assert.equal(r2.valid.length, 0);
  assert.equal(r2.refused.length, 0);
  assert.equal(JSON.stringify(deps.tables), snap);
});

test("a refused entry never blocks the valid one beside it, and is recorded with its reasons", async () => {
  const deps = freshDeps();
  const json = { ...BATCH_001, entries: [{ ...BATCH_001.entries[0], host_verdict: undefined }, BATCH_001.entries[1]] };
  const r = await applyNeedUrls({ json, execute: true, deps, now: NOW });
  assert.equal(r.refused.length, 1);
  assert.match(r.refused[0].errors.join("|"), /class table does not rate host/);
  assert.equal(r.valid.length, 1);
  assert.equal(r.report.flags_resolved, 1);
  assert.equal(deps.tables.integrity_flags.find((f) => f.id === F(1)).status, "open", "the refused need stays open");
});

test("an existing census row for the same source and document is reused, not duplicated", async () => {
  const deps = freshDeps();
  await applyNeedUrls({ json: BATCH_001, execute: true, deps, now: NOW });
  // a second need whose URL is the same document
  const json = { batch: "needs-search-002", generated_at: "2026-10-07T00:00:00Z", authored_by: "session-lane", entries: [{ ...BATCH_001.entries[0], need_id: F(2) }] };
  const r = await applyNeedUrls({ json, execute: true, deps, now: NOW });
  assert.deepEqual(r.writeFailures, []);
  assert.equal(r.report.census_rows_existing, 1);
  assert.equal(r.report.census_rows_created, 0);
  assert.equal(deps.tables.census_worklist.length, 1);
  assert.equal(deps.tables.integrity_flags.find((f) => f.id === F(2)).status, "resolved");
});

test("a write failure is recorded per entry and the rest still apply", async () => {
  const deps = freshDeps();
  const realRegister = deps.registerSource;
  deps.registerSource = async (s, o) => { if (s.url.includes("needs-fixture")) throw new Error("registry down"); return realRegister(s, o); };
  const r = await applyNeedUrls({ json: BATCH_001, execute: true, deps, now: NOW });
  assert.equal(r.writeFailures.length, 1);
  assert.match(r.writeFailures[0].error, /registry down/);
  assert.equal(r.report.flags_resolved, 1);
  assert.equal(deps.tables.integrity_flags.find((f) => f.id === F(1)).status, "open");
});

test("the flag is resolved only while still open (a flag closed meanwhile is not touched)", async () => {
  const deps = freshDeps();
  deps.tables.integrity_flags.find((f) => f.id === F(1)).status = "archived";
  const r = await applyNeedUrls({ json: BATCH_001, execute: true, deps, now: NOW });
  assert.equal(r.refused.length, 1);
  assert.match(r.refused[0].errors.join("|"), /unknown need/);
});

test("apply artifact input counts outcomes and zeroes live counters on a dry run", async () => {
  const deps = freshDeps();
  const dry = await applyNeedUrls({ json: BATCH_001, execute: false, deps, now: NOW });
  const a = applyArtifactInput({ parsed: { execute: false, batch: "b.json" }, r: dry, batchPath: "b.json", startedAt: NOW() });
  assert.equal(a.action, "apply");
  assert.equal(a.config.mode, "dry");
  assert.equal(a.metrics.valid, 2);
  assert.equal(a.metrics.flags_resolved, 0);
  assert.equal(a.metrics.would_flags_resolved, 2);
  assert.equal(a.perItem.length, 2);
  const live = await applyNeedUrls({ json: BATCH_001, execute: true, deps: freshDeps(), now: NOW });
  const b = applyArtifactInput({ parsed: { execute: true, batch: "b.json" }, r: live, batchPath: "b.json", startedAt: NOW() });
  assert.equal(b.metrics.flags_resolved, 2);
  assert.ok(b.perItem.every((p) => p.outcome === "applied"));
});

test("apply CLI args", () => {
  assert.equal(parseApplyArgs([]).ok, false);
  assert.deepEqual(parseApplyArgs(["--batch", "b.json", "--execute"]), { ok: true, batch: "b.json", execute: true, fixture: null });
});

test("real wiring: buildRealDeps exposes every dep apply uses (a missing import cannot pass dry and fail live)", async () => {
  const deps = await buildRealDeps({ execute: true });
  for (const k of ["readAll", "readAllByIds", "guardedUpdateByIds", "guardedInsert", "registerSource", "upsertPortalCandidate"]) {
    assert.equal(typeof deps[k], "function", k);
  }
  assert.ok(deps.committedVerdicts instanceof Map);
  assert.ok(CITE.skill && CITE.reason);
});

// ── the shared census function (no second copy) ─────────────────────────────────────────────────────────
test("ensureCensusRow is the exported core of ratifyFlag: exists, dry and insert paths", async () => {
  const fields = { source_id: "s1", url: "https://eur-lex.europa.eu/x", lane: "C", shape_class: null, surface_tags: [], notes: "n" };
  const inserted = [];
  const deps = {
    findExisting: async () => ({ data: null, error: null }),
    insertRow: async (row) => { inserted.push(row); return { inserted: { id: "c1" }, snapshot: "snap" }; },
  };
  const dry = await ensureCensusRow(deps, "flag-1", fields, { execute: false });
  assert.equal(dry.status, "dry_run");
  assert.equal(inserted.length, 0);
  const done = await ensureCensusRow(deps, "flag-1", fields, { execute: true });
  assert.equal(done.status, "ratified");
  assert.equal(done.insertedId, "c1");
  assert.equal(inserted[0].created_by, "flywheel-ratified:flag-1");
  const exists = await ensureCensusRow({ ...deps, findExisting: async () => ({ data: { id: "c0" }, error: null }) }, "flag-1", fields, { execute: true });
  assert.equal(exists.status, "skipped_exists");
  const bad = await ensureCensusRow({ ...deps, findExisting: async () => ({ data: null, error: { message: "boom" } }) }, "flag-1", fields, { execute: true });
  assert.equal(bad.status, "exists_error");
});

test("ratifyFlag still behaves as before through the shared core", async () => {
  const flag = { id: "f1", status: "resolved", resolved_by: "op", resolution_note: "ratify:census source_id=s1 url=https://eur-lex.europa.eu/x" };
  const out = await ratifyFlag({ readFlag: async () => ({ data: flag, error: null }), findExisting: async () => ({ data: null, error: null }), insertRow: async () => ({ inserted: { id: "c9" }, snapshot: "s" }) }, "f1", { execute: true });
  assert.equal(out.status, "ratified");
  assert.equal(out.insertedId, "c9");
});

// ── drain registration ──────────────────────────────────────────────────────────────────────────────────
test("the drain registry carries a needs-search kind wired to this exporter and guide", () => {
  const k = kindById("needs-search");
  assert.ok(k);
  assert.equal(k.applyWorkflow, "needs-search.yml");
  assert.equal(k.exportArgv[0], "scripts/turns/export-needs-for-search.mjs");
  assert.equal(k.itemsKey, "needs");
  assert.equal(k.idKey, "need_id");
  assert.equal(k.namesFile, true);
});

test("loadAppliedKeys reads only flags this apply resolved", async () => {
  const keys = await loadAppliedKeys(freshDeps());
  assert.equal(keys.size, 1);
});

test("collectOpenNeeds counts every open need by kind", async () => {
  const c = await collectOpenNeeds(freshDeps());
  assert.deepEqual(c.counts.open_by_kind, { "term-need": 3, "holdings-need": 1, "flywheel-gap": 1, "lineage-gap": 2 });
});

// ── the family artifact (real envelope validation, written to a temp directory) ─────────────────────────
test("both runtimes' artifact inputs validate against the harness-run schema and carry the family", async () => {
  const { mkdtempSync, readdirSync, readFileSync: rf } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { emitNeedsSearchArtifact, FAMILY } = await import("./artifact.mjs");
  const dir = mkdtempSync(join(tmpdir(), "needs-search-art-"));
  const exp = await buildExport(freshDeps(), { limit: 100, now: NOW });
  const p1 = emitNeedsSearchArtifact(exportArtifactInput({ parsed: { limit: 100 }, file: exp.file, outPath: "bundle.json", startedAt: NOW() }), { familyDir: dir });
  const dry = await applyNeedUrls({ json: BATCH_001, execute: false, deps: freshDeps(), now: NOW });
  const p2 = emitNeedsSearchArtifact(applyArtifactInput({ parsed: { execute: false, batch: "b.json" }, r: dry, batchPath: "b.json", startedAt: NOW() }), { familyDir: dir });
  assert.equal(FAMILY, "needs-search");
  const runs = readdirSync(dir).filter((f) => /^needs-search-run-\d{3}\.json$/.test(f));
  assert.equal(runs.length, 2);
  const a = JSON.parse(rf(p1, "utf8"));
  const b = JSON.parse(rf(p2, "utf8"));
  assert.equal(a.harness_family, "needs-search");
  assert.equal(a.config.action, "export");
  assert.equal(b.config.action, "apply");
  assert.match(a.harness_version, /^sha256:/);
});
