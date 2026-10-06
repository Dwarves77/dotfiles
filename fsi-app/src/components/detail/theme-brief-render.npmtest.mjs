// Render proofs for lane P3 defect 3 (2026-10-05): the theme analysis card and the Research rail card stop
// printing the pre-contract generator's working numbers and raw tag slugs. Real components, compiled with
// esbuild and rendered with react-dom/server (the pattern of src/components/ui/source-rating-display.npmtest.mjs).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { unlinkSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../"); // fsi-app/
const SMOKE = resolve(REPO_ROOT, ".discipline/rendering/smoke");

const ENTRY = `
export { ThemeBriefCard } from "@/components/detail/ThemeBriefCard";
export { CrossPageSection } from "@/components/detail/CrossPageSection";
export { GfmSection } from "@/components/shared/GfmSection";
`;

let M;
before(async () => {
  const outDir = resolve(REPO_ROOT, "scripts/tmp");
  mkdirSync(outDir, { recursive: true });
  const outfile = join(outDir, `theme-brief-render-npmtest-${process.pid}-${Date.now()}.mjs`);
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
const text = (markup) => markup.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const LEGACY_MD =
  "**57 members · market + research surfaces · 294 grounded intra-theme connections · density 0.184**\n\n" +
  "The engine binds it on shared scenarios (dominant signal weight 104.2): **emissions-reporting-Scope3** (14), " +
  "**sustainability-report-CSRD** (9). Obligated parties: freight-forwarder (16). Strongest edges score 0.986, 0.895 and 0.762.";

function theme(over = {}) {
  return {
    themeId: "t1",
    title: "Reporting theme",
    briefMd: LEGACY_MD,
    generatedAt: "2026-10-01T00:00:00Z",
    memberCount: 44,
    density: 0.184,
    stale: true,
    supersedesThemeId: null,
    hasBrief: true,
    absence: null,
    sections: null,
    ramificationsMissing: false,
    pages: [{ surface: "market", label: "Market Intel" }],
    membersByPage: [],
    ...over,
  };
}
const section = (t) => text(renderToStaticMarkup(h(M.CrossPageSection, { surfaceKey: "market", surfaceLabel: "Market Intel", crossPage: { theme: t } })));

test("the Research rail card states the member count once and no density", () => {
  const out = text(renderToStaticMarkup(h(M.ThemeBriefCard, { brief: { title: "Cluster", memberCount: 44, density: 0.184, stale: true } })));
  assert.match(out, /44 items/);
  assert.doesNotMatch(out, /density|0\.184/);
  assert.match(out, /stale/i, "the stale marker stays");
});

test("a pre-contract brief renders without its working numbers or raw slugs, and the stale marker stays", () => {
  const out = section(theme());
  assert.doesNotMatch(out, /density|dominant signal weight|grounded intra-theme|0\.986|0\.895|0\.762|57 members/);
  assert.doesNotMatch(out, /emissions-reporting-Scope3|sustainability-report-CSRD|freight-forwarder/);
  assert.match(out, /Scope 3 emissions reporting/);
  assert.match(out, /CSRD sustainability reporting/);
  assert.match(out, /freight forwarder/);
  assert.match(out, /44 items across Market Intel/, "the card's own subtitle states the live count once");
  assert.match(out, /Stale: /);
});

test("a brief written under the contract (sections present) is rendered as written, unchanged", () => {
  const sections = { connection: null, meaning: "It binds on emissions-reporting-Scope3 with density 0.184.", forThisPage: null, watch: null, gaps: null };
  const out = section(theme({ briefMd: null, sections, ramificationsMissing: false }));
  assert.match(out, /emissions-reporting-Scope3 with density 0\.184/);
});

test("P3: GfmSection never draws a stored Claim Provenance Ledger block (the 9d18608f section 7 shape)", () => {
  const stored = [
    "| a | b |",
    "|---|---|",
    "| EPR fee | data sharing |",
    "",
    "---",
    "",
    "<<<CLAIM_PROVENANCE_LEDGER",
    '[ { "claim_text": "x"  "claim_kind": "FACT" } ]',
    "CLAIM_PROVENANCE_LEDGER>>>",
  ].join("\n");
  const out = text(renderToStaticMarkup(h(M.GfmSection, { markdown: stored })));
  assert.doesNotMatch(out, /CLAIM_PROVENANCE_LEDGER|claim_text|claim_kind/);
  assert.match(out, /EPR fee/);
  assert.equal(renderToStaticMarkup(h(M.GfmSection, { markdown: "<<<CLAIM_PROVENANCE_LEDGER\n[" })), "");
});
