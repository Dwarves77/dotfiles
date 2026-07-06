// node --test — red-then-green for the 4d officialness gate (design §6). Pure fixtures, ZERO fetch.
// Imports only node: builtins + relative .mjs (glob-portability): ./officialness.mjs and, for the §4
// integration proof, ../agent/floor-attribution.mjs (4b reattributeToFloor).
import { test } from "node:test";
import assert from "node:assert/strict";
import { officialnessOf, hasInstrumentMarkers } from "./officialness.mjs";
import { reattributeToFloor } from "../agent/floor-attribution.mjs";

// reg-family authority floor is T2 (source-blocks.authorityFloorFor("regulation") = 2); a legal-primary
// host (eur-lex) is T1. These are the INJECTED axes the pure gate combines.
const REG_FLOOR = 2;
const T1 = 1;

// ── RED-1: nav false-match. A floor source whose ONLY >24ch span match sits in a <nav> menu. Pre-4d,
//    reattributeToFloor().includes() fires on the nav chrome (fabricated floor stamp). Post-4d the span is
//    absent from cleanBody -> no re-home -> path 'b'. (design §6 RED-1) ────────────────────────────────────
const RED1_SPAN = "Corporate Sustainability Reporting Directive overview"; // >24ch, lives ONLY in the menu
const RED1_HTML = `<!doctype html><html><body>
  <header><nav class="primary-menu"><ul>
    <li><a href="/">Home</a></li>
    <li><a href="/csrd">${RED1_SPAN}</a></li>
    <li><a href="/contact">Contact us</a></li>
  </ul></nav></header>
  <main>
    <p>This page provides general information about our organisation and the work we do. We publish
    updates periodically. Please check back for the latest news and announcements from our communications
    team about ongoing activities, events, and public consultations across the year.</p>
  </main>
</body></html>`;

test("RED-1: nav-only span -> path b, span absent from cleanBody, 4b never re-homes", () => {
  const r = officialnessOf(RED1_HTML, "example-agency.org", { hostTier: T1, floorTier: REG_FLOOR });
  assert.equal(r.path, "b", `nav-only body must be path b (reason: ${r.reason})`);
  // the load-bearing property: the menu span is GONE from the clean body (structural strip removed the nav)
  assert.ok(!r.cleanBody.toLowerCase().includes(RED1_SPAN.toLowerCase()), "span must be absent from cleanBody");
  assert.ok(r.cleanBody.length > 0, "the real <main> prose survives the strip");

  // §4 integration: raw stripText WOULD false-match the menu; the CLEAN body does not. Show both.
  const rawText = RED1_HTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert.ok(rawText.toLowerCase().includes(RED1_SPAN.toLowerCase()), "pre-4d: raw text contains the nav span (the defect)");
  const cleanFloorPool = [{ url: "https://example-agency.org/x", text: r.cleanBody, tier: T1 }];
  const home = reattributeToFloor(RED1_SPAN, /*currentTier*/ 5, cleanFloorPool, REG_FLOOR);
  assert.equal(home, null, "post-4d: no floor source verbatim-contains the span in its CLEAN body -> honest wall");
});

// ── RED-2: portal at a high host. A T1-host, link-dense landing page with no Article/shall -> path 'b'
//    DESPITE the T1 host (officialness is host + instrument identity, never topical fit). (design §6 RED-2) ─
const RED2_HTML = `<!doctype html><html><body>
  <main>
    <h1>Welcome to the National Legislation Portal</h1>
    <p>Browse and search the database of national laws and regulations.</p>
    <ul class="link-list">
      <li><a href="/env">Environmental law</a></li>
      <li><a href="/transport">Transport law</a></li>
      <li><a href="/energy">Energy law</a></li>
      <li><a href="/customs">Customs law</a></li>
      <li><a href="/latest">Latest updates</a></li>
      <li><a href="/browse">Browse all legislation</a></li>
      <li><a href="/search">Search the database</a></li>
    </ul>
    <p>Use the search tools above to find the official text you need. Select a category to begin browsing
    the collection of published instruments and official notices from across the jurisdiction.</p>
  </main>
</body></html>`;

test("RED-2: link-dense portal at a T1 host -> path b (no instrument markers), despite the high host", () => {
  const r = officialnessOf(RED2_HTML, "legislation.example.gov", { hostTier: T1, floorTier: REG_FLOOR });
  assert.equal(r.path, "b", `portal must be path b (reason: ${r.reason})`);
  assert.match(r.reason, /no_instrument_markers/, "the miss is the absent instrument body, not the host");
  assert.equal(hasInstrumentMarkers(r.cleanBody), false, "portal prose carries no Article/shall/CELEX markers");
});

// ── GREEN: EUR-Lex enacted-text page — heavy nav + a real directive body. cleanLen >= 200, instrument
//    markers present, T1 host -> path 'a'. (design §6 GREEN) ───────────────────────────────────────────────
const GREEN_HTML = `<!doctype html><html><head><title>Directive (EU) 2022/2464</title></head><body>
  <header id="site-header"><nav class="main-menu"><ul>
    <li><a href="/">Home</a></li><li><a href="/browse">Browse</a></li>
    <li><a href="/search">Search</a></li><li><a href="/about">About EUR-Lex</a></li>
    <li><a href="/help">Help</a></li>
  </ul></nav></header>
  <nav class="breadcrumb"><a href="/">EUR-Lex</a> &gt; <a href="/legal">Legal content</a> &gt; Directive</nav>
  <main>
    <h1>Directive (EU) 2022/2464 of the European Parliament and of the Council</h1>
    <p>Article 1 &mdash; Subject matter. This Directive lays down rules concerning corporate sustainability
    reporting. Undertakings shall disclose the information necessary to understand the undertaking's impacts
    on sustainability matters, and the information necessary to understand how sustainability matters affect
    the undertaking's development, performance and position.</p>
    <p>Article 2 &mdash; Scope. This Directive shall apply to large undertakings and to small and medium-sized
    undertakings which are public-interest entities. Member States shall bring into force the laws,
    regulations and administrative provisions necessary to comply with this Directive.</p>
    <p>Article 3 &mdash; Definitions. For the purposes of this Directive, obligations set out in paragraph 1
    shall apply from 1 January 2024 pursuant to Article 19a and Article 29a.</p>
  </main>
  <footer id="site-footer"><a href="/privacy">Privacy</a><a href="/cookies">Cookie policy</a></footer>
</body></html>`;

test("GREEN: EUR-Lex enacted directive (nav-heavy + real body) -> path a, cleanLen>=200, markers, T1", () => {
  const r = officialnessOf(GREEN_HTML, "eur-lex.europa.eu", { hostTier: T1, floorTier: REG_FLOOR });
  assert.equal(r.path, "a", `official instrument must be path a (reason: ${r.reason})`);
  assert.ok(r.cleanLen >= 200, `clean body must clear the 200ch real-content floor (got ${r.cleanLen})`);
  assert.equal(hasInstrumentMarkers(r.cleanBody), true, "directive body carries Article/shall markers");
  // the moat: chrome is stripped but the instrument survives (find the body PAST the nav, do not downgrade).
  assert.ok(!r.cleanBody.toLowerCase().includes("about eur-lex"), "nav menu label stripped");
  assert.ok(!r.cleanBody.toLowerCase().includes("cookie policy"), "footer stripped");
  assert.ok(r.cleanBody.includes("Article 1"), "the Article body is retained");

  // §4 integration: a real enacted-text span DOES verbatim-re-home to this floor source's clean body.
  const span = "Undertakings shall disclose the information necessary to understand";
  const home = reattributeToFloor(span, /*currentTier*/ 5, [{ url: "https://eur-lex.europa.eu/x", text: r.cleanBody, tier: T1 }], REG_FLOOR);
  assert.ok(home && home.tier === T1, "real instrument span re-homes to the floor source (path a serves as primary)");
});

// ── Moat / edge coverage ─────────────────────────────────────────────────────────────────────────────────
test("sub-floor host -> path b even with a marker-rich body (never promote a low-authority page)", () => {
  const body = "<main><p>Article 5 shall apply. Member States shall bring into force provisions to comply.</p>"
    + " <p>The obligations in paragraph 1 shall apply from 2025 across all relevant undertakings and entities.</p></main>";
  const r = officialnessOf(body, "lawfirm-blog.com", { hostTier: 5, floorTier: REG_FLOOR });
  assert.equal(r.path, "b", `T5 host is below the T2 floor -> path b (reason: ${r.reason})`);
  assert.match(r.reason, /sub_floor_host/);
});

test("floor-exempt item type (floorTier null): host half vacuous, instrument body still decides path", () => {
  const r = officialnessOf(GREEN_HTML, "eur-lex.europa.eu", { hostTier: null, floorTier: null });
  assert.equal(r.path, "a", "no authority floor to clear; the real instrument body carries path a");
});

test("flattened text (no tags) degrades gracefully: cleanBody ~= text, path from markers+host", () => {
  // The stored-excerpt reality at the wire: stripText output, no structure to strip.
  const flat = "Article 1 Subject matter. This Directive lays down rules concerning corporate sustainability "
    + "reporting. Undertakings shall disclose the information necessary to understand the undertaking's impacts "
    + "on sustainability matters. Article 2 Scope. This Directive shall apply to large undertakings.";
  const r = officialnessOf(flat, "eur-lex.europa.eu", { hostTier: T1, floorTier: REG_FLOOR });
  assert.equal(r.path, "a", "markers + host survive flattening -> path a");
  assert.ok(r.cleanBody.includes("Article 1"), "flattened text passes through as the clean body");
});
