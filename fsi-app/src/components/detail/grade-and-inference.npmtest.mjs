// Render proofs for lane P2 (2026-10-05): the grade chip returns on every row and masthead of a record-grade
// item, inferences reach customers labelled as inferences, and a record-grade chip never appears on a
// brief-grade item. These are claims about REAL RENDERED OUTPUT, so this file follows
// source-rating-display.npmtest.mjs's pattern: the real components are compiled with esbuild and rendered with
// react-dom/server's renderToStaticMarkup, entirely in Node.
//
// What is proven (the lane's acceptance list):
//   - a record-grade row shows the grade chip, a brief-grade row and a row with no grade do not (ListRow, the one
//     row every ledger and the dashboard mount);
//   - a record-grade masthead (ActionCard's pill row, where every detail surface puts it) shows the chip and a
//     brief-grade one does not;
//   - a detail page with two admissible inferences and one refuted shows two, each labelled as an inference with
//     its status, confidence, citations and the question in words; none (or only refuted) renders nothing;
//   - the method filter in the section's own input: a hidden method never reaches the section (inference-view
//     test), and the section itself never shows a claim without citations.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { unlinkSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../"); // fsi-app/
const SMOKE = resolve(REPO_ROOT, ".discipline/rendering/smoke");
const OUT_DIR = resolve(REPO_ROOT, "scripts/tmp");

const ENTRY = `
export { GradeChip } from "@/components/ui/Chips";
export { ListRow } from "@/components/ui/ListRow";
export { ActionCard } from "@/components/ui/ActionCard";
export { InferenceSection } from "@/components/detail/InferenceSection";
export { CrossPageSection, crossPagePresence } from "@/components/detail/CrossPageSection";
export { bandFromPriority } from "@/lib/urgency/bands";
export { SourcesGrid, sourceEntriesOf } from "@/components/detail/SourcesGrid";
`;

let M;
before(async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  const outfile = join(OUT_DIR, `grade-and-inference-npmtest-${process.pid}-${Date.now()}.mjs`);
  const built = await esbuild.build({
    stdin: { contents: ENTRY, loader: "ts", resolveDir: REPO_ROOT },
    bundle: true,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    write: false,
    logLevel: "silent",
    absWorkingDir: REPO_ROOT,
    alias: {
      "next/link": join(SMOKE, "stub-next-link.mjs"),
      "next/navigation": join(SMOKE, "stub-next-navigation.mjs"),
      "@/lib/supabase-browser": join(SMOKE, "stub-supabase-browser.mjs"),
      "@/components/market/spec09.css": join(SMOKE, "stub-empty-css.mjs"),
    },
    external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime", "react/jsx-dev-runtime"],
  });
  writeFileSync(outfile, built.outputFiles[0].text);
  M = await import(pathToFileURL(outfile).href);
  try {
    unlinkSync(outfile);
  } catch {
    // best-effort cleanup of a compiled fixture under gitignored scripts/tmp/
  }
});

const h = React.createElement;
const html = (el) => renderToStaticMarkup(el);
const stripStyle = (markup) => markup.replace(/<style>[\s\S]*?<\/style>/g, "");
const text = (markup) => stripStyle(markup).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const countOf = (markup, needle) => markup.split(needle).length - 1;

function rowProps(over = {}) {
  return {
    href: "/regulations/x",
    band: M.bandFromPriority("HIGH"),
    jurisdiction: "EU",
    title: "A regulation row",
    meta: "regulation",
    impact: null,
    due: null,
    timeline: null,
    tier: 3,
    ...over,
  };
}

function cardProps(over = {}) {
  return {
    band: M.bandFromPriority("HIGH"),
    kindLabel: "Regulation",
    onExport: () => {},
    onShare: () => {},
    watch: h("span", null, "watch"),
    where: { value: "EU" },
    whoPays: { value: "Shipper" },
    yourLanes: { value: "Air" },
    timeline: [],
    ...over,
  };
}

// ── the grade chip on rows ───────────────────────────────────────────────────────────────────────

test("a record-grade row shows the grade chip, on the meta line and as the phone copy", () => {
  const markup = stripStyle(html(h(M.ListRow, rowProps({ itemGrade: "record" }))));
  assert.equal(countOf(markup, 'data-part="chip-grade"'), 2, "one on the desktop meta line, one for the phone line");
  assert.match(text(markup), /Catalogue record/);
  const desktop = markup.slice(markup.indexOf('class="cl-row-meta-tags"'));
  assert.ok(desktop.indexOf('data-part="chip-grade"') < desktop.indexOf("regulation</span>"), "the chip sits ahead of the meta text");
});

test("a brief-grade row and a row with no grade show no grade chip, and render exactly what they did before", () => {
  const brief = stripStyle(html(h(M.ListRow, rowProps({ itemGrade: "brief" }))));
  const none = stripStyle(html(h(M.ListRow, rowProps())));
  assert.equal(countOf(brief, 'data-part="chip-grade"'), 0);
  assert.equal(countOf(none, 'data-part="chip-grade"'), 0);
  assert.doesNotMatch(none, /cl-row-grade/);
  assert.equal(brief, none, "a brief-grade row is byte-identical to a row with no grade");
});

test("a record-grade row with nothing else on its meta line still draws the line (the chip is the only content)", () => {
  const markup = stripStyle(html(h(M.ListRow, rowProps({ itemGrade: "record", meta: undefined, tier: 2, due: { label: "Nov 18 2026", days: "73 days" } }))));
  assert.match(markup, /class="cl-row-meta-tags"/);
  assert.match(markup, /data-part="chip-grade"/);
});

test("the grade chip is a neutral tag, never a tier or a band", () => {
  const markup = html(h(M.GradeChip, { itemGrade: "record" }));
  assert.match(markup, /data-part="chip-grade"/);
  assert.doesNotMatch(markup, /data-part="chip-tier"/);
  assert.equal(html(h(M.GradeChip, { itemGrade: "brief" })), "");
  assert.equal(html(h(M.GradeChip, {})), "");
});

// ── the grade chip on a detail masthead ────────────────────────────────────────────────────────

test("a record-grade masthead shows the grade chip in the pill row; a brief-grade one does not", () => {
  const record = html(h(M.ActionCard, cardProps({ extraChips: h(M.GradeChip, { itemGrade: "record" }) })));
  const brief = html(h(M.ActionCard, cardProps({ extraChips: h(M.GradeChip, { itemGrade: "brief" }) })));
  assert.equal(countOf(record, 'data-part="chip-grade"'), 1);
  assert.match(text(record), /Regulation Catalogue record/, "the chip follows the kind chip");
  assert.equal(countOf(brief, 'data-part="chip-grade"'), 0);
});

// ── the inference section ──────────────────────────────────────────────────────────────────────

const ITEM_A = "11111111-1111-4111-8111-111111111111";
const ITEM_B = "22222222-2222-4222-8222-222222222222";

function claim(over = {}) {
  return {
    id: "c1",
    claimText: "The amendment reaches carriers that file in the first quarter.",
    statusToken: "HYPOTHESIS",
    confidence: 0.6,
    citedItemIds: [ITEM_A],
    originClass: "derived",
    questionText: "Does this apply to me?",
    ...over,
  };
}

const TITLES = { [ITEM_A]: "Regulation on carrier reporting", [ITEM_B]: "Guidance on first quarter filing" };

test("two admissible inferences and one refuted show two, labelled, each with its question in words", () => {
  const data = {
    claims: [
      claim({ id: "c1" }),
      claim({ id: "c2", claimText: "Filing late carries a penalty for ocean carriers.", statusToken: "CONFIRMED", confidence: 0.9, citedItemIds: [ITEM_A, ITEM_B], questionText: "What must be done in response, and by when?" }),
      claim({ id: "c3", claimText: "A claim that was later refuted.", statusToken: "REFUTED" }),
    ],
    titles: TITLES,
  };
  const markup = stripStyle(html(h(M.InferenceSection, { inferences: data })));
  assert.equal(countOf(markup, 'data-figure-kind="inference"'), 2, "two inference cards");
  assert.match(markup, /id="inferences"/);
  const t = text(markup);
  assert.match(t, /Inferences/);
  assert.match(t, /These are inferences, not facts/);
  assert.match(t, /Machine-written, not facts/);
  assert.match(t, /HYPOTHESIS/);
  assert.match(t, /CONFIRMED/);
  assert.match(t, /Question: Does this apply to me\?/);
  assert.match(t, /Question: What must be done in response, and by when\?/);
  assert.match(t, /The amendment reaches carriers/);
  assert.match(t, /Filing late carries a penalty/);
  assert.match(t, /Confidence 60%/);
  assert.match(t, /Cited: Regulation on carrier reporting, Guidance on first quarter filing/);
  assert.doesNotMatch(t, /A claim that was later refuted/, "a refuted inference never shows");
  assert.doesNotMatch(t, /REFUTED/);
  assert.doesNotMatch(t, /Not admissible/, "a refused claim is left out, not shown as an error card");
});

test("the section renders nothing at all with no inferences, with none admissible, or with no data", () => {
  assert.equal(html(h(M.InferenceSection, { inferences: null })), "");
  assert.equal(html(h(M.InferenceSection, {})), "");
  assert.equal(html(h(M.InferenceSection, { inferences: { claims: [], titles: {} } })), "");
  const onlyRefuted = { claims: [claim({ statusToken: "REFUTED" })], titles: TITLES };
  assert.equal(html(h(M.InferenceSection, { inferences: onlyRefuted })), "");
  const uncited = { claims: [claim({ citedItemIds: [] })], titles: TITLES };
  assert.equal(html(h(M.InferenceSection, { inferences: uncited })), "", "an uncited claim never shows");
});

test("a claim with no recognised question shows no question line, never the raw reference", () => {
  const markup = html(h(M.InferenceSection, { inferences: { claims: [claim({ questionText: null })], titles: TITLES } }));
  assert.equal(countOf(markup, "Question:"), 0);
  assert.match(text(markup), /The amendment reaches carriers/);
});

test("the section shows at most five inferences", () => {
  const claims = Array.from({ length: 8 }, (_, i) => claim({ id: `c${i}`, claimText: `Inference number ${i}.` }));
  const markup = html(h(M.InferenceSection, { inferences: { claims, titles: TITLES } }));
  assert.equal(countOf(markup, 'data-figure-kind="inference"'), 5);
});

// ── wiring: every list and every detail surface carries the new parts (source-level, the repo's convention) ──

const src = (rel) => readFileSync(resolve(REPO_ROOT, rel), "utf8");

test("all four detail surfaces mount the grade chip in the masthead pill row and the one Connected intelligence section that carries the inferences", () => {
  for (const f of [
    "regulations/RegulationDetailSurface",
    "pages/MarketSignalDetailSurface",
    "operations/OperationsDetailSurface",
    "research/ResearchFindingDetailSurface",
  ]) {
    const code = src(`src/components/${f}.tsx`);
    assert.match(code, /<GradeChip itemGrade=\{r\.itemGrade\} \/>/, `${f} grade chip`);
    assert.match(code, /<CrossPageSection [^>]*crossPage=\{crossPage\}/, `${f} mounts the shared section`);
  }
});

test("the inferences travel with the cross-page read: one read site, rendered by the one shared section", () => {
  const server = src("src/lib/supabase-server.ts");
  assert.match(server, /inferences = await readCustomerInferences\(supabase, self\.id,/);
  assert.match(server, /const THEME_COLUMNS = "[^"]*dominant_signals/, "the theme read selects dominant_signals for the chip label");
  assert.match(src("src/components/detail/CrossPageSection.tsx"), /<InferenceSection inferences=\{crossPage\?\.inferences\} index=\{inferencesSectionOrd\(surfaceKey\)\} \/>/);
});

test("an item with inferences but no intersections or theme still shows the Inferences section, and an item with none shows nothing", () => {
  const data = { claims: [claim()], titles: TITLES };
  const withOnly = html(h(M.CrossPageSection, { surfaceKey: "regulations", surfaceLabel: "Regulations", crossPage: { inferences: data } }));
  assert.match(text(withOnly), /Inferences/);
  assert.doesNotMatch(text(withOnly), /Connected intelligence/);
  assert.equal(html(h(M.CrossPageSection, { surfaceKey: "regulations", surfaceLabel: "Regulations", crossPage: null })), "");
  assert.equal(html(h(M.CrossPageSection, { surfaceKey: "regulations", surfaceLabel: "Regulations", crossPage: { inferences: { claims: [], titles: {} } } })), "");
});

// ── lane IDX-1: the section header, its fixed ordinal, and the index presence ─────────────────────────────

test("the cross-page section is headed Connected intelligence with its fixed ordinal, never Across pages", () => {
  const theme = { memberCount: 2, pages: [], hasBrief: false, absence: "No brief yet.", membersByPage: [], title: null, stale: false };
  const reg = html(h(M.CrossPageSection, { surfaceKey: "regulations", surfaceLabel: "Regulations", crossPage: { theme } }));
  assert.match(text(reg), /Connected intelligence/);
  assert.doesNotMatch(text(reg), /Across pages/);
  assert.match(text(reg), /S9/, "Regulations numbers it 09");
  const mkt = html(h(M.CrossPageSection, { surfaceKey: "market", surfaceLabel: "Market Intel", crossPage: { theme } }));
  assert.match(text(mkt), /S7/, "the other three number it 07");
});

test("the Inferences header carries its fixed ordinal", () => {
  const data = { claims: [claim()], titles: TITLES };
  assert.match(text(html(h(M.CrossPageSection, { surfaceKey: "regulations", surfaceLabel: "Regulations", crossPage: { inferences: data } }))), /S10/);
  assert.match(text(html(h(M.CrossPageSection, { surfaceKey: "research", surfaceLabel: "Research", crossPage: { inferences: data } }))), /S8/);
});

test("crossPagePresence says exactly which of the two sections render, so the index never lists an empty tab", () => {
  const data = { claims: [claim()], titles: TITLES };
  const theme = { memberCount: 1, pages: [], hasBrief: false, absence: "x", membersByPage: [] };
  const p = (crossPage) => M.crossPagePresence({ surfaceKey: "market", crossPage });
  assert.deepEqual(p(null), { connected: false, inferences: false });
  assert.deepEqual(p({ theme }), { connected: true, inferences: false });
  assert.deepEqual(p({ inferences: data }), { connected: false, inferences: true });
  assert.deepEqual(p({ theme, inferences: data }), { connected: true, inferences: true });
  assert.deepEqual(p({ inferences: { claims: [claim({ statusToken: "REFUTED" })], titles: TITLES } }), { connected: false, inferences: false });
});

// ── Sources grid: entries matched to a cited registered source by canonical url (coordinator item 5) ──────

const BRIEF = [
  "## Sources",
  "",
  "| # | Title | Type | Issuing Body | Date | URL |",
  "|---|---|---|---|---|---|",
  "| 1 | Other Source | T5 | Some Body | 2024 | https://other.example.net/doc |",
  "| 2 | Unlisted Source | T4 | Body | 2025 | https://unlisted.example.com/x |",
  "| 3 | Primary Source | T6 | Body | 2025 | https://www.example.org/primary/ |",
].join("\n");
const BIAS = [{ dimension: "funding", tag: "industry-funded", confidence: 0.9 }];
const item = (over = {}) => ({ id: "r1", title: "Item", url: "https://example.org/primary", sourceName: "Primary Source", sourceTier: 2, fullBrief: BRIEF, ...over });
const byName = (rows, n) => rows.find((x) => x.name === n);

test("a Sources entry is matched to a cited registered source by canonical url: customer tier and bias", () => {
  const rows = M.sourceEntriesOf(item({ citedSources: [{ url: "HTTPS://Other.Example.net/doc/", tier: 3, biasTags: BIAS }] }));
  const other = byName(rows, "Other Source");
  assert.equal(other.tier, 3, "the registry's customer tier replaces the tier the brief text carried (T5)");
  assert.deepEqual(other.biasTags, BIAS);
  const markup = html(h(M.SourcesGrid, { rows }));
  assert.match(text(markup), /T3/);
  assert.match(markup, /data-bias-tag="industry-funded"/);
});

test("an entry with no matching cited source is unchanged, and so is the primary entry", () => {
  const rows = M.sourceEntriesOf(item({ citedSources: [{ url: "https://other.example.net/doc", tier: 3, biasTags: BIAS }] }));
  const unlisted = byName(rows, "Unlisted Source");
  // Changed 2026-10-05 (rule 18, lane P3): a tier parsed from the brief's own wording is not a rating, so an entry
  // with no registry match shows no tier chip (the Absence part); it used to keep the parsed T4.
  assert.equal(unlisted.tier, null);
  assert.equal(unlisted.biasTags, undefined);
  assert.equal(byName(rows, "Primary Source").tier, 2, "the primary entry keeps the item's own customer tier");
});

test("a matched source with no bias tags shows none, and one with no tier keeps the brief's tier", () => {
  const rows = M.sourceEntriesOf(item({ citedSources: [{ url: "https://other.example.net/doc", tier: null, biasTags: [] }] }));
  const other = byName(rows, "Other Source");
  // Changed 2026-10-05 (rule 18, lane P3): a matched source with no tier is unrated; the brief's T5 is not a rating.
  assert.equal(other.tier, null);
  assert.equal(other.biasTags, undefined);
});

test("no citations: the grid is exactly what it was", () => {
  const without = M.sourceEntriesOf(item());
  const empty = M.sourceEntriesOf(item({ citedSources: [] }));
  assert.deepEqual(empty, without);
  // Changed 2026-10-05 (rule 18, lane P3): no citations means no registry rating, so the brief's parsed T5 is not drawn.
  assert.equal(byName(without, "Other Source").tier, null);
});

// Lane P3 (2026-10-05, rule 18): one tier per source. The entry's meta text carries the brief's own tier
// wording; when a registry tier shows as the chip, that wording is gone, and when none exists the entry is as written.
const BRIEF_P3 = [
  "## Sources",
  "",
  "| # | Title | Type | Issuing Body | URL |",
  "|---|---|---|---|---|",
  "| 1 | BLS Major Economic Indicators | Tier 1 - Federal statistical release | BLS | https://www.bls.gov/bls/newsrels.htm |",
  "| 2 | Other Report | Tier 4 - Industry analysis | Some Body | https://other.example.org/report |",
].join("\n");
const p3item = (over = {}) => ({ id: "r1", title: "Item", url: "https://www.bls.gov/bls/newsrels.htm", sourceName: "BLS Major Economic Indicators", sourceTier: 3, fullBrief: BRIEF_P3, ...over });

test("P3: a registry tier is the chip and the brief's parsed tier wording is dropped from the entry", () => {
  const rows = M.sourceEntriesOf(p3item());
  const bls = byName(rows, "BLS Major Economic Indicators");
  assert.equal(bls.tier, 3);
  assert.doesNotMatch(bls.meta, /tier\s*1/i);
  assert.match(bls.meta, /Federal statistical release/);
  const markup = text(html(h(M.SourcesGrid, { rows })));
  assert.match(markup, /T3/);
  assert.doesNotMatch(markup, /Tier 1/);
});

test("P3: a cited registered source gets the same treatment", () => {
  const rows = M.sourceEntriesOf(p3item({ citedSources: [{ url: "https://other.example.org/report", tier: 5, biasTags: [] }] }));
  const other = byName(rows, "Other Report");
  assert.equal(other.tier, 5);
  assert.doesNotMatch(other.meta, /tier\s*4/i);
  assert.match(other.meta, /Industry analysis/);
});

test("P3: with no registry tier the entry keeps its text, and the parsed tier is not a rating so no chip (rule 18)", () => {
  const rows = M.sourceEntriesOf(p3item({ sourceTier: null }));
  const bls = byName(rows, "BLS Major Economic Indicators");
  assert.equal(bls.tier, null);
  assert.match(bls.meta, /Tier 1 - Federal statistical release/);
  const other = byName(rows, "Other Report");
  assert.equal(other.tier, null);
  assert.match(other.meta, /Tier 4 - Industry analysis/);
  assert.match(html(h(M.SourcesGrid, { rows })), /data-absence="dash"/);
});
