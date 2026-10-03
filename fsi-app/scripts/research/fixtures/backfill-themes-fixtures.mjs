// backfill-themes-fixtures.mjs — fixture population for scripts/research/backfill-themes.mjs's dry
// run (lane L8, 2026-10-02). Sized to the coordinator's live, DB-executor-confirmed count: 47
// research_finding rows with theme IS NULL (SELECT count(*) FROM intelligence_items WHERE
// item_type = 'research_finding' AND theme IS NULL; the 49-total/2-themed denominator is the same
// read). No DB credential, no live LLM call — this module is imported only by the test file and by
// backfill-themes.mjs's own dry path.
//
// Each row carries enough text for the SAME keyword signal the live Haiku call would see (title +
// a short body), tagged by `expectTheme` for this fixture's own fake classifier (fakeStream below) so
// the dry run's printed assignments are deterministic and reviewable, never randomly generated.
// `expectTheme` is fixture-only; it is never read by backfill-themes.mjs itself, which classifies
// from `title`/`text` exactly as the live path would.

const TEMPLATES = [
  { theme: "emissions_accounting", title: "Scope 3 GHG accounting methodology revision", text: "A revised lifecycle CO2e accounting methodology changes how freight forwarders report Scope 3 emissions for ocean and air legs." },
  { theme: "fuels_saf", title: "SAF feedstock supply constraint analysis", text: "Sustainable aviation fuel feedstock supply remains constrained, with hydrogen and biofuel blending pilots showing slow price-trajectory improvement." },
  { theme: "packaging_circular", title: "Reusable crate pilot cuts single-use packaging", text: "A returnable-crate pilot across three distribution centers reduces single-use packaging volume; PFAS-free material trial included." },
  { theme: "carbon_markets", title: "EU ETS maritime allowance price update", text: "EU ETS allowance prices for maritime carriers moved this quarter; CBAM reporting obligations widen for affected cargo categories." },
  { theme: "cold_chain_art", title: "Vacuum-insulated panel trial for art shipments", text: "A climate-controlled transport trial using vacuum-insulated panels targets fine-art shipment conservation standards." },
  { theme: "last_mile_electrification", title: "Urban EV delivery fleet charging rollout", text: "A last-mile electrification pilot adds zero-emission delivery vans with new depot charging infrastructure in three metro areas." },
  { theme: "disclosure_regimes", title: "ISSB S2 disclosure timeline update", text: "CSRD omnibus simplification talks continue alongside ISSB S2 climate-disclosure adoption timelines for mid-size filers." },
  { theme: "unclassified", title: "Warehouse labor market survey results", text: "A labor market survey of warehouse staffing levels and wage trends across three regions, with no climate or sustainability content." },
];

/** 47 fixture rows, cycling the 8 templates above (7 themes + 1 honest unclassified case) with a
 *  stable per-row id so the dry-run report is reproducible run to run. */
export const NULL_THEME_RESEARCH_FINDINGS = Array.from({ length: 47 }, (_, i) => {
  const t = TEMPLATES[i % TEMPLATES.length];
  return {
    id: `fixture-research-finding-${String(i + 1).padStart(2, "0")}`,
    title: `${t.title} (#${i + 1})`,
    text: t.text,
    expectTheme: t.theme,
  };
});

/** Fake `streamMessagesText` standing in for the canonical Anthropic streaming call in the dry path:
 *  no network, no API key, deterministic from the fixture's own `expectTheme` tag (round-tripped
 *  through the request body's user message, which backfill-themes.mjs builds from title+text, never
 *  from `expectTheme` directly — this fake only reads the IDENTIFYING TEXT it was given, same as a
 *  real classifier would reconstruct from title/text, by matching against the same TEMPLATES table
 *  above). Same return shape as the real streamMessagesText: { text, stopReason, usage }. */
export async function fakeStream({ body }) {
  const userMessage = body.messages[0].content;
  const match = TEMPLATES.find((t) => userMessage.includes(t.text));
  const theme = match ? match.theme : "unclassified";
  const rationale =
    theme === "unclassified"
      ? "No climate or sustainability theme content in the supplied text."
      : `Matches ${theme} per the row's own text.`;
  const payload = { theme, confidence: match ? 0.9 : 0.4, rationale };
  return { text: JSON.stringify(payload), stopReason: "end_turn", usage: { input: 0, output: 0 } };
}
