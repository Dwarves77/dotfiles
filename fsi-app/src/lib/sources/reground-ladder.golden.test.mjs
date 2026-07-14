// FLOW GOLDEN — the reground/discovery ladder, END-TO-END (operator CRITICAL DISPATCH + FLOW-GOLDEN
// MANDATE, 2026-07-14). This is Unit 1's EXIT TEST and the first flow-golden: input a FAILING item, assert
// EACH intended rung fires — declared primary → DISCOVERY (identifier-derived candidate) → candidate fetch →
// win — with the real generateCandidates as the discovery mechanism (not a mock). A caller-count is NOT
// wiring verification (seek-more had a test but zero live callers and was dormant); this proves the WIRING
// by driving the actual ladder. Run: node --test src/lib/sources/reground-ladder.golden.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPrimaryWithFallback } from "./primary-fallback.mjs";
import { generateCandidates } from "./seek-more.mjs";

// The operator's proof case: eu_clean_trucking. Its declared primary (an ELI /oj/eng URL) roadblocks; the
// enacted text lives at the CELEX /legal-content URL that discovery DERIVES from the same identifier.
const ELI_PRIMARY = "https://eur-lex.europa.eu/eli/reg/2024/1610/oj/eng";
const CELEX_URL = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1610";
const ENACTED = "Article 1 Subject matter. This Regulation lays down CO2 emission standards for heavy-duty vehicles. ".repeat(40);

test("FLOW GOLDEN: failing item → declared-primary roadblock → discovery derives CELEX candidate → win", async () => {
  const fetched = [];
  const item = {
    title: "EU clean trucking regulation", identifier: "eli/reg/2024/1610/oj", canonicalKey: "32024R1610",
    itemType: "regulation", jurisdiction: "EU", sourceUrl: ELI_PRIMARY,
  };
  // The REAL discovery mechanism — no web search injected, so ONLY the deterministic identifier resolvers run.
  const discoverCandidates = () => generateCandidates(item, { webSearch: async () => [] });

  const r = await fetchPrimaryWithFallback(
    { title: item.title, primaryUrl: ELI_PRIMARY, itemType: "regulation" },
    {
      browserlessFetch: async (u) => {
        fetched.push(u);
        // declared primary roadblocks (soft-404 shell); the CELEX enacted-text URL returns real content.
        if (u === CELEX_URL) return { text: ENACTED };
        return { text: "Page not found - EUR-Lex" }; // soft-404 marker → roadblock
      },
      discoverCandidates,
    },
  );

  // RUNG 1 fired: the declared primary was tried and roadblocked.
  assert.equal(fetched[0], ELI_PRIMARY, "declared primary tried first");
  assert.equal(r.alternatives[0].role, "declared_primary");
  // RUNG 2 fired: DISCOVERY ran and derived the CELEX candidate WITHOUT human help (the whole point).
  assert.ok(fetched.includes(CELEX_URL), "discovery derived + tried the CELEX /legal-content URL");
  assert.ok(r.alternatives.some((a) => a.role === "alternative" && a.url === CELEX_URL));
  // RUNG 3 fired: the discovered candidate WON — the enacted text is now the result.
  assert.equal(r.ok, true);
  assert.equal(r.fellBack, true);
  assert.equal(r.url, CELEX_URL);
  assert.ok(r.text.includes("CO2 emission standards"));
});

test("FLOW GOLDEN: total exhaustion → ok:false with the FULL N×M attempt record (proof-of-exhaustion)", async () => {
  const item = {
    title: "Unfindable reg", identifier: "eli/reg/2024/9999/oj", itemType: "regulation", jurisdiction: "EU",
    sourceUrl: "https://eur-lex.europa.eu/eli/reg/2024/9999/oj/eng",
  };
  const r = await fetchPrimaryWithFallback(
    { title: item.title, primaryUrl: item.sourceUrl, itemType: "regulation" },
    {
      browserlessFetch: async () => ({ text: "Page not found - EUR-Lex" }), // everything roadblocks
      discoverCandidates: () => generateCandidates(item, { webSearch: async () => [] }),
    },
  );
  assert.equal(r.ok, false, "honest exhaustion");
  // the exhaustion record carries the declared primary + every discovered candidate tried — the durable
  // proof the earth-exhaustion doctrine requires (persisted by persistPrimaryExhaustion at the call site).
  assert.ok(r.alternatives.length >= 2, "records primary + candidates tried");
  assert.ok(r.alternatives.some((a) => a.url.includes("CELEX:32024R9999")), "discovery ran even on the exhausted item");
});
