// theme-briefs.test.mjs: the executable spec for the theme-briefs validator (schema.mjs), the shared reads
// and bundle assembly (data.mjs) and the fixture database (fixture-deps.mjs). Fixture only: no database, no
// network. Runs in the no-npm suite (node: builtins and relative imports only).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeMemberHash } from "../../../src/lib/connections/brief-staleness.mjs";
import {
  THEME_BRIEF_SECTIONS, SECTION_CEILINGS, TITLE_CEILING, validateThemeBriefsFile, validateThemeBriefEntry,
  findUncitedFigures, parseRamifications, renderBriefMd, figureTokens,
} from "./schema.mjs";
import {
  loadThemes, loadBriefs, loadLineage, loadThemeMaterial, computeThemeGaps, buildValidationContext, themesNeedingBrief, buildThemeBundle,
} from "./data.mjs";
import { fixtureDeps } from "./fixture-deps.mjs";

const readJson = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
const CORPUS = readJson("./fixtures/corpus.fixture.json");
const BATCH = readJson("./fixtures/theme-briefs-000.fixture.json");

const T1 = "11111111-1111-4111-8111-111111111111";
const M1 = T1;
const M2 = "22222222-2222-4222-8222-222222222222";
const M3 = "33333333-3333-4333-8333-333333333333";
const clone = (x) => JSON.parse(JSON.stringify(x));

async function ctxFor(corpus = CORPUS, ids = [T1]) {
  const deps = fixtureDeps(corpus);
  const themes = await loadThemes(deps, ids);
  const material = await loadThemeMaterial(deps, themes);
  const gaps = computeThemeGaps(themes, material);
  return { ctx: buildValidationContext(themes, material, gaps), themes, material, deps };
}

const entryOf = () => clone(BATCH.entries[0]);
const refusalsFor = async (mutate) => {
  const { ctx } = await ctxFor();
  const e = entryOf();
  mutate(e);
  return validateThemeBriefEntry(e, 0, ctx);
};

// ── the loader: the fixture batch is valid ───────────────────────────────────────────────────────────

test("fixture batch theme-briefs-000.fixture.json loads and validates with zero refusals", async () => {
  const { ctx } = await ctxFor();
  const r = validateThemeBriefsFile(clone(BATCH), ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.fileErrors, []);
  assert.deepEqual(r.refused, []);
  assert.equal(r.valid.length, 1);
});

test("the fixture entry's hash is the live membership hash", () => {
  assert.equal(BATCH.entries[0].member_hash, computeMemberHash([M1, M2, M3]));
});

// ── the pre-write refusals, each with a failing fixture ──────────────────────────────────────────────

test("refusal: wrong member hash", async () => {
  const errs = await refusalsFor((e) => { e.member_hash = "0".repeat(32); });
  assert.ok(errs.some((x) => /member_hash does not match the live membership/.test(x)), errs.join("\n"));
});

test("refusal: unknown theme", async () => {
  const errs = await refusalsFor((e) => { e.theme_id = "99999999-0000-4000-8000-000000000000"; });
  assert.ok(errs.some((x) => /unknown theme/.test(x)));
});

for (const section of ["connection", "meaning", "ramifications", "watch"]) {
  test(`refusal: required section "${section}" empty`, async () => {
    const errs = await refusalsFor((e) => { e.sections[section] = "  "; e.claims = e.claims.filter((c) => c.section !== section); });
    assert.ok(errs.some((x) => x.includes(`required section "${section}" is empty`)), errs.join("\n"));
  });
}

test("refusal: a missing section key", async () => {
  const errs = await refusalsFor((e) => { delete e.sections.watch; });
  assert.ok(errs.some((x) => /section "watch" is missing or not a string/.test(x)));
});

test("refusal: an unknown section key", async () => {
  const errs = await refusalsFor((e) => { e.sections.extra = "x"; });
  assert.ok(errs.some((x) => /unknown section "extra"/.test(x)));
});

test("refusal: ramifications subsection for a surface the theme does not span", async () => {
  const errs = await refusalsFor((e) => { e.sections.ramifications += "\n\n### Operations\nWhat follows for operations readers."; });
  assert.ok(errs.some((x) => /"Operations" is for a surface this theme does not span/.test(x)), errs.join("\n"));
});

test("refusal: a spanned surface with no ramifications subsection", async () => {
  const errs = await refusalsFor((e) => {
    e.sections.ramifications = e.sections.ramifications.replace(/\n\n### Research[\s\S]*$/, "");
    e.claims = e.claims.filter((c) => c.member_id !== M3);
  });
  assert.ok(errs.some((x) => /spans "Research" but ramifications has no subsection for it/.test(x)), errs.join("\n"));
});

test("refusal: an unknown ramifications heading", async () => {
  const errs = await refusalsFor((e) => { e.sections.ramifications += "\n\n### Community\nx"; });
  assert.ok(errs.some((x) => /"Community" is not one of/.test(x)));
});

test("refusal: claim id that is not a claim of the cited member", async () => {
  // M1's claim id cited against M2.
  const errs = await refusalsFor((e) => { e.claims[2].claim_ids = ["c0000001-0000-4000-8000-000000000001"]; });
  assert.ok(errs.some((x) => /claims\[2\].*is not a grounded claim of member/.test(x)), errs.join("\n"));
});

test("refusal: an ANALYSIS claim is not a grounded claim", async () => {
  const errs = await refusalsFor((e) => { e.claims[3].claim_ids = ["c0000001-0000-4000-8000-000000000005"]; });
  assert.ok(errs.some((x) => /claims\[3\].*is not a grounded claim/.test(x)));
});

test("refusal: a forward event id is accepted only in the watch section", async () => {
  const errs = await refusalsFor((e) => { e.claims[0].claim_ids = ["ee000001-0000-4000-8000-000000000001"]; });
  assert.ok(errs.some((x) => /claims\[0\].*is not a grounded claim/.test(x)), "an event id cited from the connection section");
});

test("refusal: claim member_id that is not a live member", async () => {
  const errs = await refusalsFor((e) => { e.claims[0].member_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; });
  assert.ok(errs.some((x) => /member_id is not a live member of this theme/.test(x)));
});

test("refusal: claim text that does not appear in its section", async () => {
  const errs = await refusalsFor((e) => { e.claims[0].text = "A sentence the section never says."; });
  assert.ok(errs.some((x) => /text does not appear in section "connection"/.test(x)));
});

test("refusal: claim with empty claim_ids", async () => {
  const errs = await refusalsFor((e) => { e.claims[0].claim_ids = []; });
  assert.ok(errs.some((x) => /claim_ids must be a non-empty array/.test(x)));
});

test("refusal: an uncited figure outside an analysis paragraph", async () => {
  const errs = await refusalsFor((e) => { e.sections.connection += " The levy rose 12% in 2025."; });
  assert.ok(errs.some((x) => /section "connection" states "12%", "2025" outside any listed claim or labelled analysis paragraph/.test(x)), errs.join("\n"));
});

test("refusal: an uncited named instrument (an acronym) outside an analysis paragraph", async () => {
  const errs = await refusalsFor((e) => { e.sections.meaning = "The CORSIA scheme will matter here.\n\n" + e.sections.meaning; });
  assert.ok(errs.some((x) => /section "meaning" states "CORSIA"/.test(x)), errs.join("\n"));
});

test("accepted: the same figure inside a labelled analysis paragraph", async () => {
  const errs = await refusalsFor((e) => { e.sections.meaning += "\n\n*Analytical inference:* the levy may rise 12% by 2030."; });
  assert.deepEqual(errs, []);
});

test("accepted: the same figure once a claim covers it", async () => {
  const { ctx } = await ctxFor();
  const e = entryOf();
  e.sections.connection += " The definitive period starts on 1 January 2026.";
  e.claims.push({ section: "connection", text: "The definitive period starts on 1 January 2026.", member_id: M1, claim_ids: ["c0000001-0000-4000-8000-000000000002"] });
  assert.deepEqual(validateThemeBriefEntry(e, 0, ctx), []);
});

test("refusal: a member cited by id, not by title", async () => {
  const errs = await refusalsFor((e) => { e.sections.meaning = `See ${M2} for the market side.\n\n${e.sections.meaning}`; });
  assert.ok(errs.some((x) => /section "meaning" carries an id; cite members by title/.test(x)), errs.join("\n"));
});

test("refusal: a section over its length ceiling", async () => {
  const errs = await refusalsFor((e) => { e.sections.meaning = `*Analytical inference:* ${"word ".repeat(700)}`; });
  assert.ok(errs.some((x) => new RegExp(`section "meaning" is \\d+ characters, ceiling ${SECTION_CEILINGS.meaning}`).test(x)), errs.join("\n"));
});

test("refusal: a title over the ceiling", async () => {
  const errs = await refusalsFor((e) => { e.title = "t".repeat(TITLE_CEILING + 1); });
  assert.ok(errs.some((x) => /title is \d+ characters, ceiling/.test(x)));
});

test("refusal: empty gaps while the bundle lists a gap for the theme", async () => {
  const errs = await refusalsFor((e) => { e.sections.gaps = ""; e.claims = e.claims.filter((c) => c.section !== "gaps"); });
  assert.ok(errs.some((x) => /the bundle lists 1 gap\(s\) for this theme but section "gaps" is empty/.test(x)));
});

test("a refused entry is refused whole and does not block the valid one beside it", async () => {
  const { ctx } = await ctxFor();
  const bad = entryOf();
  bad.theme_id = "99999999-0000-4000-8000-000000000000";
  const file = clone(BATCH);
  file.entries = [bad, entryOf()];
  const r = validateThemeBriefsFile(file, ctx);
  assert.equal(r.valid.length, 1);
  assert.equal(r.refused.length, 1);
  assert.equal(r.refused[0].index, 0);
});

test("a duplicate theme_id in one batch refuses the second entry", async () => {
  const { ctx } = await ctxFor();
  const file = clone(BATCH);
  file.entries = [entryOf(), entryOf()];
  const r = validateThemeBriefsFile(file, ctx);
  assert.equal(r.valid.length, 1);
  assert.match(r.refused[0].errors[0], /duplicate theme_id in this batch/);
});

test("file-level refusals: bad batch name, authored_by, entries not an array", async () => {
  const { ctx } = await ctxFor();
  const f = clone(BATCH);
  f.batch = "other-001"; f.authored_by = "someone"; f.entries = {};
  const r = validateThemeBriefsFile(f, ctx);
  assert.equal(r.ok, false);
  assert.equal(r.fileErrors.length, 3);
  assert.equal(validateThemeBriefsFile(null, ctx).ok, false);
});

// ── the narrow figure check, directly ────────────────────────────────────────────────────────────────

test("findUncitedFigures: ordered-list markers are not figures; headings are exempt", () => {
  const text = "1. First point\n2) Second point\n### Regulations 2026\nplain";
  assert.deepEqual(findUncitedFigures(text), []);
});

test("findUncitedFigures: label words and two-letter acronyms are not flagged", () => {
  assert.deepEqual(findUncitedFigures("ACTION REQUIRED for the EU and UK readers."), []);
});

test("findUncitedFigures: member titles and edge-basis tokens cover their figures", () => {
  assert.deepEqual(findUncitedFigures("See ISO 14083 Accounting Guide.", { memberTitles: ["ISO 14083 Accounting Guide"] }), []);
  assert.deepEqual(findUncitedFigures("Both touch CBAM here.", { allowedTokens: figureTokens("both touch CBAM-declaration") }), []);
  assert.deepEqual(findUncitedFigures("Both touch CBAM here."), ["CBAM"]);
});

test("findUncitedFigures: a labelled analysis list item covers only its own item", () => {
  const text = "- *Operational implication:* costs rise 5%\n- costs rose 7%";
  assert.deepEqual(findUncitedFigures(text), ["7%"]);
});

test("parseRamifications: text before the first subsection and duplicate headings are problems", () => {
  const r = parseRamifications("intro\n### Regulations\na\n### Regulations\nb");
  assert.equal(r.problems.length, 2);
});

test("renderBriefMd: sections in order under fixed headings, empty gaps omitted", () => {
  const e = entryOf();
  const md = renderBriefMd(e);
  const order = ["# CBAM", "## Connection", "## What it means", "## Ramifications", "## Watch", "## Gaps"].map((h) => md.indexOf(h));
  assert.ok(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), md);
  const noGaps = renderBriefMd({ ...e, sections: { ...e.sections, gaps: "" } });
  assert.equal(noGaps.includes("## Gaps"), false);
  assert.deepEqual(THEME_BRIEF_SECTIONS, ["connection", "meaning", "ramifications", "watch", "gaps"]);
});

// ── the fixture database ─────────────────────────────────────────────────────────────────────────────

test("fixtureDeps: a column listed as missing throws like PostgREST; present columns read", async () => {
  const deps = fixtureDeps({ tables: { theme_briefs: [{ theme_id: "a" }] }, missing_columns: { theme_briefs: ["sections"] } });
  await assert.rejects(() => deps.readAll("theme_briefs", "theme_id, sections", { orderBy: "theme_id" }), /column theme_briefs.sections does not exist/);
  assert.equal((await deps.readAll("theme_briefs", "theme_id", { orderBy: "theme_id" })).length, 1);
  await assert.rejects(() => deps.guardedInsert("theme_briefs", { theme_id: "b", sections: {} }), /does not exist/);
});

// ── the bundle and the need list ─────────────────────────────────────────────────────────────────────

test("themesNeedingBrief: no brief, stale and superseded are listed; a current brief is skipped", async () => {
  const deps = fixtureDeps(CORPUS);
  const themes = await loadThemes(deps);
  const briefs = await loadBriefs(deps);
  const needs = themesNeedingBrief(themes, briefs.rows, { lineage: await loadLineage(deps) });
  const byReason = Object.fromEntries(needs.map((n) => [n.theme.id, n.reason]));
  assert.equal(byReason[T1], "no_brief");
  assert.equal(byReason["cccccccc-cccc-4ccc-8ccc-cccccccccccc"], "stale");
  assert.equal(byReason["99999999-9999-4999-8999-999999999999"], "superseded");
  assert.equal(byReason["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], undefined, "the current brief is skipped");
  const sup = needs.find((n) => n.reason === "superseded");
  assert.equal(sup.supersedes_theme_id, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
});

test("loadBriefs: a database without migration 351's member_ids column still loads, unstructured", async () => {
  const deps = fixtureDeps({ ...CORPUS, missing_columns: { theme_briefs: ["member_ids", "sections", "claims"] } });
  const b = await loadBriefs(deps);
  assert.equal(b.structured, false);
  assert.equal(b.rows.length, 3);
});

test("loadLineage: reads the latest finished run's theme_delta", async () => {
  const deps = fixtureDeps({ tables: { connection_theme_runs: [
    { id: 1, started_at: "2026-09-01T00:00:00Z", status: "ok", theme_delta: { renamed: [{ prior_id: "old", new_id: "x" }] } },
    { id: 2, started_at: "2026-09-02T00:00:00Z", status: "ok", theme_delta: { renamed: [{ prior_id: "b", new_id: "a" }] } },
    { id: 3, started_at: "2026-09-03T00:00:00Z", status: "error", theme_delta: { renamed: [{ prior_id: "z", new_id: "y" }] } },
  ] } });
  assert.deepEqual(await loadLineage(deps), [{ prior_id: "b", new_id: "a" }]);
});

test("buildThemeBundle: members carry grounded FACT claims and forward events; edges carry their full basis", async () => {
  const { themes, material } = await ctxFor();
  const gaps = computeThemeGaps(themes, material).get(T1);
  const b = buildThemeBundle({ theme: themes[0], reason: "no_brief", prior: null, supersedes_theme_id: null }, material, gaps, { charBudget: 60000 });
  const m1 = b.members.find((m) => m.id === M1);
  assert.equal(m1.surface, "regulations");
  assert.equal(m1.claims.length, 2);
  assert.equal(m1.forward_events[0].event_date, "2026-12-31");
  const m3 = b.members.find((m) => m.id === M3);
  assert.equal(m3.claims.length, 1, "the ANALYSIS claim is not exported as a grounded claim");
  assert.ok(b.intra_theme_edges.every((e) => Array.isArray(e.basis) && e.basis.length > 0));
  assert.equal(b.truncation.members_omitted, 0);
  assert.equal(b.gaps.length, 1);
  assert.equal(b.member_hash, computeMemberHash([M1, M2, M3]));
});

test("buildThemeBundle: a tight budget omits members and claims and says exactly how many", async () => {
  const { themes, material } = await ctxFor();
  const need = { theme: themes[0], reason: "no_brief", prior: null, supersedes_theme_id: null };
  const full = buildThemeBundle(need, material, [], { charBudget: 60000 });
  const tight = buildThemeBundle(need, material, [], { charBudget: JSON.stringify({ ...full, members: [], intra_theme_edges: [], truncation: undefined }).length + 700 });
  assert.ok(tight.truncation.members_omitted + tight.truncation.claims_omitted + tight.truncation.edges_omitted > 0);
  assert.equal(tight.truncation.members_included, tight.members.length);
  assert.equal(tight.truncation.members_total, 3);
  assert.ok(tight.truncation.chars_used <= tight.truncation.char_budget);
  assert.equal(tight.truncation.claims_total, 4);
  const keptClaims = tight.members.reduce((a, m) => a + m.claims.length, 0);
  assert.equal(keptClaims + tight.truncation.claims_omitted, 4, "every claim is either kept or counted as omitted");
});
