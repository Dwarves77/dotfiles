// record-facts.markers.test.mjs (lane GATES-2, 2026-10-05): the record-grade full_brief assembly refuses an internal
// marker, for the base builder and for the research layer that shares buildRecordFullBrief. Attack and clean cases.
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { buildRecordFullBrief, buildRecordPayload } from "./record-facts.mjs";
import { buildResearchRecordPayload } from "./record-facts-research.mjs";

const SOURCE = { id: "src-1", url: "https://example-think-tank.org/reports/x", base_tier: 4, tier_override: null, status: "active" };
const SCREEN = { verdict: "on_vertical", provenance: "rule", basis: "registry category=research" };
const SRC_URL = "https://example-think-tank.org/reports/x";
const LEAK = "This report finds that adoption grew 18% <<<CLAIM_PROVENANCE_LEDGER in 2026, driven by incentives.";
const CLEAN = "This report finds that adoption grew 18% in 2026, driven by incentives.";

const fact = (text) => ({ claim_kind: "FACT", claim_text: text, source_span: text, section_key: "record_facts" });

test("buildRecordFullBrief: CLEAN claims assemble a brief", () => {
  const brief = buildRecordFullBrief({ sourceUrl: SRC_URL, claims: [fact(CLEAN)] });
  assert.match(brief, /Verbatim facts/);
});

test("ATTACK: buildRecordFullBrief refuses a claim carrying a ledger marker", () => {
  assert.throws(() => buildRecordFullBrief({ sourceUrl: SRC_URL, claims: [fact(LEAK)] }), /internal_marker_in_body: buildRecordFullBrief/);
});

// The extractors only emit prose spans, so a marker inside a captured source never reaches a claim today (measured:
// a marker inline in the finding sentence yields zero claims carrying it). The refusal is defense in depth at the
// one assembly point; the payload-level cases below prove the guard does not break clean payloads and that the
// research layer cannot assemble a full_brief any other way.
test("CLEAN: base and research payloads still build and carry no marker", () => {
  const text = ["Outlook", "", "This report finds that adoption grew 18% in 2026, driven by incentives.", "", "Limitations of this study include a small sample.", ""].join(String.fromCharCode(10));
  const base = buildRecordPayload({ sourceUrl: SRC_URL, itemType: "research_finding", title: "Outlook", source: SOURCE, capturedText: text, screen: SCREEN, requiredSlots: ["finding"] });
  const research = buildResearchRecordPayload({ sourceUrl: SRC_URL, itemType: "research_finding", title: "Outlook", source: SOURCE, capturedText: text, screen: SCREEN });
  for (const p of [base, research]) assert.doesNotMatch(p.item.full_brief, /<<<|CLAIM_PROVENANCE_LEDGER|_PROVENANCE/);
});

test("the research layer assembles full_brief only through the guarded buildRecordFullBrief", () => {
  const src = readFileSync(fileURLToPath(new URL("./record-facts-research.mjs", import.meta.url)), "utf8");
  assert.match(src, /buildRecordFullBrief\(\{ sourceUrl, claims: upgradedClaims \}\)/);
  assert.doesNotMatch(src, /full_brief:\s*[`"']/, "no literal full_brief assembly outside buildRecordFullBrief");
});
