// Render proofs for lane P1 (2026-10-05, CLAUDE.md rule 18, "the surface shows the rating"): every item
// shows its source's rating and bias, correctly. These are claims about REAL RENDERED OUTPUT, so this file
// follows ImpactMeter.npmtest.mjs's pattern (not the plain-source-regex convention): the real components are
// compiled with esbuild and rendered with react-dom/server's renderToStaticMarkup, entirely in Node. react
// and react-dom stay external so the components render with the same React the app ships.
//
// What is proven (each item in the lane brief's test list):
//   - a T7 source reads T7 on a row, on the ActionCard and on the bare TierChip (it read T6 before);
//   - an overridden source shows its override (the one customer tier rule, through the row chip);
//   - a source with five bias tags shows the bounded chips plus the remainder, a row with none renders nothing;
//   - lower confidence is said in words;
//   - a brief-grade fact with a grounded source shows its tier, one without shows the Absence part;
//   - the Sources grid carries the primary source's bias outside the link, and a tier-less source the Absence part;
//   - the legends end at T7 and the Research legend renders the real vocabulary.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { unlinkSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../"); // fsi-app/
const SMOKE = resolve(REPO_ROOT, ".discipline/rendering/smoke");
const OUT_DIR = resolve(REPO_ROOT, "scripts/tmp");

const ENTRY = `
export { TierChip } from "@/components/ui/Chips";
export { ListRow } from "@/components/ui/ListRow";
export { ActionCard } from "@/components/ui/ActionCard";
export { BiasChips, BiasLegend } from "@/components/ui/BiasChips";
export { SourcesGrid, sourceEntriesOf } from "@/components/detail/SourcesGrid";
export { FactCard, ClaimTierProvider } from "@/components/ui/FactCard";
export { RailLegend } from "@/components/detail/DetailShell";
export { bandFromPriority } from "@/lib/urgency/bands";
export { customerSourceTier } from "@/lib/customer-source-tier";
export { deriveFactCardModels } from "@/lib/detail/fact-card-model";
export { classifyParagraph } from "@/lib/detail/fact-paragraphs";
`;

let M; // the compiled module, built once
before(async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  const outfile = join(OUT_DIR, `source-rating-display-npmtest-${process.pid}-${Date.now()}.mjs`);
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

const FIVE = [
  { dimension: "funding", tag: "foundation-funded", confidence: 0.95 },
  { dimension: "methodology", tag: "methodologically-transparent", confidence: 0.9 },
  { dimension: "methodology", tag: "analytical-synthesis", confidence: 0.85 },
  { dimension: "stakeholder", tag: "independent-research", confidence: 0.7 },
  { dimension: "stakeholder", tag: "environmental-advocate", confidence: 0.82 },
];

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
  const b = M.bandFromPriority("HIGH");
  return {
    band: b,
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

// ── T7 reads T7 ─────────────────────────────────────────────────────────────────────────────

test("a T7 source reads T7 on the bare tier chip, never T6", () => {
  const out = text(html(h(M.TierChip, { tier: 7 })));
  assert.equal(out, "T7");
  assert.equal(text(html(h(M.TierChip, { tier: 9 }))), "T7", "an out-of-range value clamps to the vocabulary's top tier");
  assert.equal(text(html(h(M.TierChip, { tier: 0 }))), "T1");
  assert.equal(text(html(h(M.TierChip, { tier: 7, max: 6 }))), "T6", "a caller may still narrow the ceiling explicitly");
});

test("a T7 source reads T7 on a list row", () => {
  const markup = stripStyle(html(h(M.ListRow, rowProps({ tier: 7 }))));
  const start = markup.indexOf('class="cl-row-tier"');
  const tierCell = markup.slice(start, markup.indexOf("</span></span>", start));
  assert.match(tierCell, /data-part="chip-tier"[^>]*>T7$/);
  assert.doesNotMatch(markup, /data-part="chip-tier"[^>]*>T6</);
});

test("a T7 source reads T7 on the detail ActionCard", () => {
  const markup = html(h(M.ActionCard, cardProps({ tier: 7 })));
  assert.match(markup, /data-part="chip-tier"[^>]*>T7</);
  assert.doesNotMatch(markup, /data-part="chip-tier"[^>]*>T6</);
});

// ── an admin override is what the customer sees ──────────────────────────────────────────────

test("an overridden source shows its override on the row chip and the ActionCard", () => {
  // The loaders feed these components the helper's result; override beats effective beats base.
  const tier = M.customerSourceTier({ tier_override: 2, effective_tier: 5, base_tier: 6 });
  assert.equal(tier, 2);
  assert.match(html(h(M.ListRow, rowProps({ tier }))), /data-part="chip-tier"[^>]*>T2</);
  assert.match(html(h(M.ActionCard, cardProps({ tier }))), /data-part="chip-tier"[^>]*>T2</);
  // and the pre-fix reading (effective, then base) would have shown T5
  assert.notEqual(tier, 5);
});

// ── bias chips ────────────────────────────────────────────────────────────────────────────────

test("a source with five bias tags shows the bounded chips plus the remainder behind one disclosure (detail)", () => {
  const markup = html(h(M.BiasChips, { tags: FIVE, variant: "detail" }));
  assert.equal((markup.match(/data-bias-tag=/g) || []).length, 3, "three chips shown, two behind the disclosure");
  assert.equal((markup.match(/data-bias-more="disclosure"/g) || []).length, 1, "exactly one disclosure control");
  assert.match(markup, /aria-expanded="false"/);
  assert.match(text(markup), /\+2 more/);
  // the three shown are the highest-confidence tags, with human labels (not slugs)
  assert.match(text(markup), /Foundation funded/);
  assert.match(text(markup), /Method disclosed/);
  assert.match(text(markup), /Analytical synthesis/);
  assert.doesNotMatch(markup, /foundation-funded</, "no raw slug is shown as chip text");
});

test("on a list row the bound is two chips and a visible '+N more' count, with no control inside the row", () => {
  const markup = html(h(M.BiasChips, { tags: FIVE, variant: "row" }));
  assert.equal((markup.match(/data-bias-tag=/g) || []).length, 2);
  assert.match(text(markup), /\+3 more/);
  assert.doesNotMatch(markup, /<button/, "a row is one click target; the count is text, not a control");
  assert.match(markup, /data-bias-more="count"/);
});

test("a source with no bias tags renders nothing at all", () => {
  for (const tags of [null, undefined, [], [{ dimension: "bogus", tag: "x" }]]) {
    assert.equal(html(h(M.BiasChips, { tags, variant: "detail" })), "");
    assert.equal(html(h(M.BiasChips, { tags, variant: "row" })), "");
  }
});

test("a tag stored below the adopt-as-high line says lower confidence in words", () => {
  const markup = html(h(M.BiasChips, { tags: FIVE, variant: "detail", max: 5 }));
  assert.match(text(markup), /Independent research · lower confidence/);
  assert.doesNotMatch(text(markup), /Foundation funded · lower confidence/);
  assert.match(markup, /data-lower-confidence="true"/);
});

test("a list row carries its source's bias chips on the meta line (desktop) and on a line of their own (phone)", () => {
  const markup = stripStyle(html(h(M.ListRow, rowProps({ biasTags: FIVE }))));
  assert.match(markup, /class="cl-row-bias-desktop"/);
  assert.match(markup, /class="cl-row-bias-mobile"/);
  const meta = markup.slice(markup.indexOf('class="cl-row-meta-tags"'), markup.indexOf('class="cl-row-line2"'));
  assert.match(meta, /data-part="bias-chips"/, "the bias chips sit in the meta line, not in the tier column");
  const tierStart = markup.indexOf('class="cl-row-tier"');
  const tierCell = markup.slice(tierStart, markup.indexOf("</span></span>", tierStart));
  assert.doesNotMatch(tierCell, /bias-chips/, "never in the fixed tier column");
  // the phone line is its own element, after the value cells
  assert.ok(markup.indexOf('class="cl-row-bias-mobile"') > tierStart);
});

test("a list row with no bias tags renders no bias wrapper and no mobile line", () => {
  for (const biasTags of [undefined, null, []]) {
    const markup = stripStyle(html(h(M.ListRow, rowProps({ biasTags }))));
    assert.doesNotMatch(markup, /bias-chips|cl-row-bias-desktop|cl-row-bias-mobile/);
  }
});

test("the ActionCard shows the primary source's bias chips on a row of their own, and nothing without them", () => {
  const withBias = html(h(M.ActionCard, cardProps({ tier: 2, biasTags: FIVE })));
  assert.match(withBias, /data-part="bias-chips"/);
  assert.match(text(withBias), /Primary source/);
  const without = html(h(M.ActionCard, cardProps({ tier: 2 })));
  assert.doesNotMatch(without, /bias-chips/);
});

// ── per-claim tier on brief-grade facts ────────────────────────────────────────────────────────

const CLAIM = "The Regulation applies to all operators placing covered goods on the Union market from 1 January 2026.";
const BRIEF_FACT = `FACT: "${CLAIM}" *Source: Regulation (EU) 2023/956, European Parliament, 2023. https://eur-lex.europa.eu/eli/reg/2023/956/oj.*`;

function factModel() {
  return M.deriveFactCardModels(M.classifyParagraph(BRIEF_FACT))[0];
}

test("a brief-grade fact with a grounded source shows that claim's tier", () => {
  const claimTiers = { [`[scope] ${CLAIM}`]: { tier: 1, sourceName: "EUR-Lex", sourceUrl: null } };
  const markup = html(h(M.ClaimTierProvider, { claimTiers }, h(M.FactCard, { model: factModel() })));
  assert.match(markup, /title="Tier 1 - provenance, never urgency"/);
  assert.doesNotMatch(markup, /data-part-slot="tier-absence"/);
});

test("a brief-grade fact with no grounded source shows the Absence part, never a guessed tier", () => {
  const unrelated = { "A different claim about something else entirely, never a match.": { tier: 2, sourceName: "X", sourceUrl: null } };
  for (const el of [
    h(M.ClaimTierProvider, { claimTiers: unrelated }, h(M.FactCard, { model: factModel() })),
    h(M.ClaimTierProvider, { claimTiers: {} }, h(M.FactCard, { model: factModel() })),
    h(M.FactCard, { model: factModel() }), // outside any provider
  ]) {
    const markup = html(el);
    assert.match(markup, /data-part-slot="tier-absence"/);
    assert.match(markup, /data-absence="dash"/);
    assert.doesNotMatch(markup, /title="Tier \d/);
  }
});

test("an inference card carries neither a tier nor the absence slot", () => {
  const [inf] = M.deriveFactCardModels(M.classifyParagraph("*Analytical inference:* The Regulation will likely extend to downstream goods."));
  const markup = html(h(M.ClaimTierProvider, { claimTiers: {} }, h(M.FactCard, { model: inf })));
  assert.match(markup, /not citable/);
  assert.doesNotMatch(markup, /tier-absence/);
});

// ── Sources grid ──────────────────────────────────────────────────────────────────────────────

function resource(over = {}) {
  return {
    id: "r1",
    title: "Item",
    url: "https://example.org/primary",
    sourceName: "Primary Source",
    sourceTier: 2,
    biasTags: FIVE,
    ...over,
  };
}

test("the Sources grid shows the primary source's tier (override) and bias outside the link, others untouched", () => {
  const r = resource({
    fullBrief: [
      "## Sources",
      "",
      "| # | Title | Type | Issuing Body | Date | URL |",
      "|---|---|---|---|---|---|",
      "| 1 | Other Source | T5 | Some Body | 2024 | https://other.example.net/doc |",
      "| 2 | Primary Source | T6 | Body | 2025 | https://www.example.org/primary/ |",
    ].join("\n"),
  });
  const rows = M.sourceEntriesOf(r);
  assert.equal(rows.length, 2, "the brief's own sources table is parsed (not the single-row fallback)");
  const primary = rows.find((x) => /Primary/.test(x.name));
  const other = rows.find((x) => /Other/.test(x.name));
  assert.equal(primary.tier, 2, "the primary entry shows the customer tier, not the tier the brief text was written with");
  assert.deepEqual(primary.biasTags, FIVE);
  assert.equal(other.tier, 5, "an entry this page cannot identify keeps what the brief says");
  assert.equal(other.biasTags, undefined, "and carries no bias it was not given");
});

test("with no parsed list the grid falls back to one row for the item's own source, carrying its bias", () => {
  const rows = M.sourceEntriesOf(resource({ fullBrief: undefined }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tier, 2);
  assert.deepEqual(rows[0].biasTags, FIVE);
});

test("a Sources row renders the bias chips after (outside) the link, and nothing for a source without tags", () => {
  const rows = M.sourceEntriesOf(resource({ fullBrief: undefined }));
  const markup = html(h(M.SourcesGrid, { rows }));
  assert.ok(markup.indexOf("</a>") >= 0 && markup.indexOf("</a>") < markup.indexOf('data-part="bias-chips"'), "chips follow the closing anchor");
  const bare = html(h(M.SourcesGrid, { rows: M.sourceEntriesOf(resource({ fullBrief: undefined, biasTags: undefined })) }));
  assert.doesNotMatch(bare, /bias-chips/);
});

test("a source row whose tier cannot be derived shows the Absence part in the tier slot", () => {
  const markup = html(h(M.SourcesGrid, { rows: [{ tier: null, name: "Unrated source", meta: "", url: null }] }));
  assert.match(markup, /data-absence="dash"/);
  const rated = html(h(M.SourcesGrid, { rows: [{ tier: 7, name: "News source", meta: "", url: null }] }));
  assert.match(text(rated), /T7/);
  assert.doesNotMatch(rated, /data-absence/);
});

// ── legends ───────────────────────────────────────────────────────────────────────────────────

test("the detail rail legend ends the tier scale at T7, built from tier-labels", () => {
  const t = text(html(h(M.RailLegend)));
  assert.match(t, /T1 binding law through T7 news \/ commentary/);
  assert.doesNotMatch(t, /T6 commentary/);
});

test("the bias legend renders the whole vocabulary with human labels, grouped by dimension", () => {
  const t = text(html(h(M.BiasLegend)));
  for (const label of ["Industry funded", "Funding undisclosed", "Peer reviewed", "Method disclosed", "Regulator aligned", "Labour perspective"]) {
    assert.match(t, new RegExp(label));
  }
  assert.match(t, /Funding/);
  assert.match(t, /Position/);
});

// ── Operations matrix fact cards (density="matrix") ───────────────────────────────────────────

const MATRIX_FACT = { label: "Warehouse rent", value: "12.4", sourceName: "Statistics Office", sourceUrl: "https://example.org/s", sourceNote: null };

test("a matrix fact whose source is rated shows that tier, with the override already applied by the loader", () => {
  const sourceTier = M.customerSourceTier({ tier_override: 2, effective_tier: 4, base_tier: 5 });
  const markup = html(h(M.FactCard, { density: "matrix", fact: { ...MATRIX_FACT, sourceTier }, baseFact: null }));
  assert.match(markup, /title="Tier 2 - provenance, never urgency"/);
  assert.doesNotMatch(markup, /tier-absence/);
});

test("a matrix fact with an unrated or unsourced source shows the Absence part, never a tier", () => {
  for (const f of [{ ...MATRIX_FACT, sourceTier: null }, { ...MATRIX_FACT }, { ...MATRIX_FACT, sourceName: null, sourceUrl: null, sourceTier: null }]) {
    const markup = html(h(M.FactCard, { density: "matrix", fact: f, baseFact: null }));
    assert.match(markup, /data-part-slot="tier-absence"/);
    assert.doesNotMatch(markup, /title="Tier \d/);
  }
});
