// node --test src/lib/sources/classify-source-role.selftest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySourceRole } from "./classify-source-role.ts";

const cases = [
  ["MIT Climate Machine", "https://climatemachine.mit.edu/", "academic_research"],
  ["Tyndall Centre for Climate Research", "https://tyndall.ac.uk/", "academic_research"],
  ["Fraunhofer Institute for Material Flow", "https://iml.fraunhofer.de/", "academic_research"],
  ["California Air Resources Board (CARB)", "https://ww2.arb.ca.gov/", "primary_legal_authority"],
  ["US EPA Emissions Regulations", "https://epa.gov/", "primary_legal_authority"],
  ["Ministry of Land, Infrastructure, Transport", "https://mlit.go.jp/", "primary_legal_authority"],
  ["EUR-Lex Official Journal", "https://eur-lex.europa.eu/", "primary_legal_authority"],
  ["International Maritime Organization (IMO)", "https://imo.org/", "intergovernmental_body"],
  ["UNCTAD", "https://unctad.org/", "intergovernmental_body"],
  ["Science Based Targets initiative", "https://sciencebasedtargets.org/", "standards_body"],
  ["ISO 14083", "https://iso.org/", "standards_body"],
  ["FreightWaves Sustainability", "https://freightwaves.com/", "trade_press"],
  ["The Loadstar", "https://theloadstar.com/", "trade_press"],
  ["US EIA Open Data API", "https://eia.gov/", "statistical_data_agency"],
  ["EcoVadis", "https://ecovadis.com/", "standards_body"],   // ratings/standards body
  ["BloombergNEF Energy Storage", "https://bnef.com/", "industry_data_provider"],
  ["Sustainable Air Freight Alliance (SAFA)", "https://safa.aero/", "industry_association"],
];

test("classifySourceRole on the canonical examples", () => {
  for (const [name, url, expected] of cases) {
    assert.equal(classifySourceRole(name, url), expected, `${name} -> expected ${expected}`);
  }
});
