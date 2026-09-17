// GOLDEN — smart-search identifier variants + candidate discovery (operator CRITICAL DISPATCH +
// SMART-SEARCH AMENDMENT, 2026-07-14). The MANDATED golden: eu_clean_trucking's stored identifier →
// discovery produces CELEX 32024R1610 + the fetchable /legal-content URL, no human help.
// Run: node --test src/lib/sources/identifier-variants.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseYearNumber, separatorVariants, toCelex, euTypeLetters, euCandidates,
  ukCandidates, usCandidates, genericSearchQueries, discoverCandidateUrls, detectScheme, rankCandidates,
  celexTxtHtmlUrl, celexTxtUrl, eliPathUrl, eliUrl, eurlexSearchUrl, ojDailyViewUrl,
  EUR_LEX_PORTAL_URL, EUR_LEX_KNOWN_DEAD_OJ_TXT_URL,
} from "./identifier-variants.mjs";

test("MANDATED GOLDEN: eu_clean_trucking_2024_1610 identifier → CELEX 32024R1610 + fetchable TXT URL + ELI", () => {
  // The item's stored identifier (verified in DB): eli/reg/2024/1610/oj ; canonical key 32024R1610.
  const item = { identifier: "eli/reg/2024/1610/oj", canonicalKey: "32024R1610", itemType: "regulation", jurisdiction: ["EU"], title: "EU clean trucking regulation" };
  const d = discoverCandidateUrls(item);
  assert.equal(d.scheme, "eu");
  assert.ok(d.identifiers.includes("32024R1610"), "CELEX 32024R1610 derived");
  assert.ok(d.identifiers.includes("reg/2024/1610/oj"), "ELI reg/2024/1610/oj present");
  assert.ok(d.candidates.some((c) => c.url === "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1610"),
    "the fetchable enacted-text URL the old title-search never produced");
});

test("GOLDEN: bare 2024_1610 + regulation type → 32024R1610 (separator-insensitive, type-driven)", () => {
  const eu = euCandidates({ identifier: "2024_1610", itemType: "regulation" });
  assert.ok(eu.celex.includes("32024R1610"));
  const eu2 = euCandidates({ identifier: "2024/1610", itemType: "regulation" });
  assert.ok(eu2.celex.includes("32024R1610"));
});

test("toCelex zero-pads the number to 4; euTypeLetters maps type or fans out", () => {
  assert.equal(toCelex(2025, "R", 40), "32025R0040");
  assert.deepEqual(euTypeLetters("regulation"), ["R"]);
  assert.deepEqual(euTypeLetters("directive"), ["L"]);
  assert.deepEqual(euTypeLetters(null, null), ["R", "L", "D"]);
});

test("unknown EU type fans out to R/L/D candidates (each fetch-verified, never stamped)", () => {
  const eu = euCandidates({ identifier: "2024/1610" });
  assert.ok(eu.celex.includes("32024R1610"));
  assert.ok(eu.celex.includes("32024L1610"));
  assert.ok(eu.celex.includes("32024D1610"));
});

test("parseYearNumber handles every separator + embedded CELEX/ELI", () => {
  for (const s of ["2024/1610", "2024_1610", "2024-1610", "2024 1610"]) {
    assert.deepEqual(parseYearNumber(s), { year: 2024, number: 1610 });
  }
  assert.deepEqual(parseYearNumber("eli/reg/2024/1610/oj"), { year: 2024, number: 1610 });
  assert.deepEqual(parseYearNumber("32024R1610"), { year: 2024, number: 1610 });
  assert.equal(parseYearNumber("no numbers here"), null);
});

test("separatorVariants: all four mutations", () => {
  assert.deepEqual(separatorVariants(2024, 1610), ["2024/1610", "2024_1610", "2024-1610", "2024 1610"]);
});

test("UK: uksi identifier → legislation.gov.uk paths + made/contents", () => {
  const uk = ukCandidates({ identifier: "uksi/2024/1234", title: "SECR amendment" });
  assert.ok(uk.urls.includes("https://www.legislation.gov.uk/uksi/2024/1234"));
  assert.ok(uk.urls.some((u) => u.endsWith("/made")));
  assert.ok(uk.searchUrls.some((u) => /all\?title=/.test(u)));
});

test("US: FR doc number → federalregister search + api; title → eCFR search", () => {
  const us = usCandidates({ identifier: "2024-12345", title: "HD GHG standards" });
  assert.ok(us.urls.some((u) => /federalregister\.gov.*2024-12345/.test(u)));
  assert.ok(us.searchUrls.some((u) => /ecfr\.gov\/search/.test(u)));
});

test("detectScheme routes by jurisdiction/identifier/host", () => {
  assert.equal(detectScheme({ jurisdiction: ["EU"] }), "eu");
  assert.equal(detectScheme({ identifier: "eli/reg/2024/1/oj" }), "eu");
  assert.equal(detectScheme({ jurisdiction: ["UK"], identifier: "uksi/2024/1" }), "uk");
  assert.equal(detectScheme({ sourceUrl: "https://www.federalregister.gov/x" }), "us");
  assert.equal(detectScheme({ jurisdiction: ["MX"], sourceUrl: "http://diariooficial.gob.mx/x" }), "generic");
});

test("genericSearchQueries aims at official primary + includes identifier variants", () => {
  const q = genericSearchQueries({ title: "Ley General", jurisdiction: "MX", instrumentType: "regulation", identifier: "2024/1610" });
  assert.ok(q.some((s) => /official gazette|official journal/i.test(s)));
  assert.ok(q.some((s) => /2024\/1610/.test(s)));
});

test("rankCandidates SC-13: registered > codified-class > new (injected lookups, no model guess)", () => {
  const cands = [
    { url: "https://newblog.example/x" },       // new host
    { url: "https://eur-lex.europa.eu/y" },       // registered
    { url: "https://someministry.gov/z" },        // codified class
  ];
  const ranked = rankCandidates(cands, {
    isRegistered: (h) => h === "eur-lex.europa.eu",
    hostClassTier: (h) => (h === "someministry.gov" ? 2 : null),
  });
  assert.equal(ranked[0].host, "eur-lex.europa.eu"); // registered first
  assert.equal(ranked[1].host, "someministry.gov");  // codified class next
  assert.equal(ranked[2].host, "newblog.example");   // new host last (worklist)
});

// ── eur-lex.europa.eu one-home builders (lane L35, F46): every URL shape callers used, preserved exactly.
test("eur-lex.europa.eu builders: each named shape matches what callers built before consolidation", () => {
  assert.equal(celexTxtHtmlUrl("32024R1610"), "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1610");
  assert.equal(celexTxtUrl("32024R1610"), "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1610");
  assert.equal(eliPathUrl("reg/2023/1115"), "https://eur-lex.europa.eu/eli/reg/2023/1115"); // seek-more's variable-path shape
  assert.equal(eliUrl("reg", 2024, 1610), "https://eur-lex.europa.eu/eli/reg/2024/1610/oj/eng"); // euCandidates' fixed shape
  assert.equal(eurlexSearchUrl("32024R1610"), "https://eur-lex.europa.eu/search.html?scope=EURLEX&lang=en&text=32024R1610");
  assert.equal(ojDailyViewUrl("2026-07-18"), "https://eur-lex.europa.eu/oj/daily-view/L-series/default.html?ojDate=18072026");
  assert.equal(EUR_LEX_PORTAL_URL, "https://eur-lex.europa.eu");
  assert.equal(EUR_LEX_KNOWN_DEAD_OJ_TXT_URL, "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=OJ:L_202500040");
});

// ── Sweep (lane L35, F46 external-host-home; models eurlex-cellar.mjs's own sweep). The EUR-Lex route was
// written three times before F46 existed; this fails the build the moment a second copy of the host string
// appears anywhere in scope. ONE named exception stands: scripts/maintenance/capture-static-primaries.mjs
// is out of this lane's write set ("other lanes own them", lane brief L35) and still builds its own
// eur-lex.europa.eu URLs; F46's MULTI_HOME_CEILING therefore could not move for this host in this lane (see
// docs/ops/session-log.md, lane L35 entry). Any OTHER new file naming the host is a real regression this
// test must catch.
import { execFileSync as execFileSyncEurlex } from "node:child_process";
test("ONE home for eur-lex.europa.eu (except the write-set-excluded maintenance file): no other in-scope source file builds this host's URL", () => {
  const root = execFileSyncEurlex("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const files = execFileSyncEurlex("git", ["ls-files", "--", "fsi-app/scripts", "fsi-app/src"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(mjs|js|ts|tsx)$/.test(f) && !/\.(test|npmtest|selftest|golden)\.mjs$/.test(f) && !/\/fixtures\//.test(f));
  const EXCEPTIONS = new Set(["fsi-app/src/lib/sources/identifier-variants.mjs", "fsi-app/scripts/maintenance/capture-static-primaries.mjs"]);
  const hostRe = /https?:\/\/eur-lex\.europa\.eu/;
  const offenders = [];
  for (const f of files) {
    if (EXCEPTIONS.has(f)) continue;
    const src = readFileSync(resolve(root, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (hostRe.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], "import src/lib/sources/identifier-variants.mjs instead of building an eur-lex.europa.eu URL in: " + offenders.join(", "));
});
