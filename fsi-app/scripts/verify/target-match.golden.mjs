#!/usr/bin/env node
// target-match.golden.mjs — behavioral golden for the TARGET-MATCH VERIFY gate (target-match.mjs, drain-loop
// finding). Proves the wrong-instrument capture is HELD before grounding: the eu_clean_trucking RED fixture
// (an item that is the HDV CO2 regulation, Regulation (EU) 2024/1610, whose capture is actually the CSRD
// directive, Directive (EU) 2022/2464) is a MISMATCH, while a correct own-identifier capture is a MATCH — for
// EU pair-keys, raw non-EU identifiers (California SB-261), and the raised-threshold subject fallback. Pure,
// no DB/network. Run: node scripts/verify/target-match.golden.mjs — exits 0 PASS, 1 FAIL.
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { verifyTargetMatch, targetMatchHolds, scanInstrumentIds, expectedInstrumentIds, subjectOverlap, SUBJECT_MATCH_THRESHOLD } =
  await jiti.import("../../src/lib/sources/target-match.mjs");

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────────────────
// The HDV CO2 item (correct instrument = Regulation (EU) 2024/1610).
const HDV_ITEM = { title: "CO2 emission performance standards for heavy-duty vehicles", item_type: "regulation",
  instrument_type: "regulation", identifier: "2024/1610", canonical_instrument_key: "32024R1610", jurisdiction: ["EU"] };
// The WRONG capture actually delivered for it: the CSRD directive. Bears 2022/2464, NOT 2024/1610.
const CSRD_CAPTURE = "Directive (EU) 2022/2464 of the European Parliament and of the Council amending Regulation (EU) No 537/2014 as regards corporate sustainability reporting. Undertakings shall disclose sustainability information in the management report.";
// The CORRECT capture for the HDV item: the enacted HDV text, bears 2024/1610.
const HDV_CAPTURE = "Regulation (EU) 2024/1610 of the European Parliament and of the Council amending Regulation (EU) 2019/1242 as regards strengthening the CO2 emission performance standards for new heavy-duty vehicles. From 2030 the fleet target shall be reduced by 45 percent.";

// California SB-261 (raw non-EU identifier; no CELEX).
const SB261_ITEM = { title: "Greenhouse gases: climate-related financial risk", item_type: "regulation", identifier: "SB-261", jurisdiction: ["US-CA"] };
const SB261_CAPTURE = "SB-261 Greenhouse gases: climate-related financial risk. Section 38533 is added to the Health and Safety Code. A covered entity shall prepare a climate-related financial risk report on or before January 1, 2026.";

// 1. THE RED FIXTURE — the exact defect. Wrong instrument → MISMATCH → HELD.
const csrd = verifyTargetMatch(HDV_ITEM, CSRD_CAPTURE);
check("eu_clean_trucking RED: CSRD capture for the HDV item is a MISMATCH", csrd.verdict === "mismatch");
check("eu_clean_trucking RED: MISMATCH names the conflicting identifier 2022/2464", csrd.conflicting.includes("2022/2464"));
check("eu_clean_trucking RED: a MISMATCH HOLDS (is not ground)", targetMatchHolds(csrd.verdict) === true);

// 2. THE GREEN TWIN — the correct HDV capture for the same item is a MATCH via its own identifier.
const hdv = verifyTargetMatch(HDV_ITEM, HDV_CAPTURE);
check("HDV GREEN: correct enacted capture MATCHES on the item's own identifier 2024/1610", hdv.verdict === "match" && hdv.foundOwn.includes("2024/1610"));
check("HDV GREEN: a MATCH does not hold (grounds)", targetMatchHolds(hdv.verdict) === false);

// 3. RAW NON-EU IDENTIFIER — California SB-261 present literally → MATCH (proves the free-loop verified item stays verifiable).
const sb = verifyTargetMatch(SB261_ITEM, SB261_CAPTURE);
check("SB-261 GREEN: raw non-EU identifier present → MATCH", sb.verdict === "match" && sb.via === "raw-id");

// 4. THE 0.4 SLIP IS GONE — no identifier signal, weak subject overlap → UNVERIFIED (held), not a false match.
const WEAK = { title: "Extended producer responsibility for packaging waste", item_type: "regulation", jurisdiction: ["EU"] };
const OFFTOPIC = "This page describes battery recycling collection targets and consumer electronics take-back obligations.";
const weak = verifyTargetMatch(WEAK, OFFTOPIC);
check("no-id + weak subject overlap → UNVERIFIED (held), not a false match", weak.verdict === "unverified" && targetMatchHolds(weak.verdict));
check("weak subject overlap is below the raised threshold", weak.score < SUBJECT_MATCH_THRESHOLD);

// 5. NO-ID + STRONG subject overlap → MATCH via subject (portal TOC with the title but no reg-number).
const STRONG = { title: "Extended producer responsibility packaging waste reduction targets", item_type: "regulation", jurisdiction: ["EU"] };
const ONTOPIC = "Extended producer responsibility scheme: packaging producers must meet waste reduction and recycling targets and register for producer responsibility obligations.";
const strong = verifyTargetMatch(STRONG, ONTOPIC);
check("no-id + strong subject overlap → MATCH via subject-overlap", strong.verdict === "match" && strong.via === "subject-overlap");

// 6. PURE-HELPER witnesses (the mechanical parts the verdict rests on).
check("scanInstrumentIds finds the CSRD pair 2022/2464 in prose", scanInstrumentIds(CSRD_CAPTURE).has("2022/2464"));
check("scanInstrumentIds normalizes the CELEX 32024R1610 to 2024/1610", scanInstrumentIds("see 32024R1610 here").has("2024/1610"));
check("scanInstrumentIds normalizes pre-2015 order 'No 1610/2024' to 2024/1610", scanInstrumentIds("Regulation (EU) No 1610/2024").has("2024/1610"));
check("expectedInstrumentIds derives 2024/1610 from the item's canonical key", expectedInstrumentIds(HDV_ITEM).has("2024/1610"));
check("a bare year/number with no instrument word is NOT counted (noise excluded)", scanInstrumentIds("see table 2022/2464 in the appendix").size === 0);

// 7. WIRING PROOF (executor-agnostic) — groundBrief calls the gate on the SHARED fetched pool and HARD-returns
//    on a mismatch BEFORE the extraction pivot, so BOTH the injected (CC) and metered drivers are gated. A
//    structural scan (comment-stripped, CRLF-normalized) so it cannot pass on a comment.
const pipe = readFileSync(resolve(ROOT, "src/lib/agent/canonical-pipeline.ts"), "utf8")
  .replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const callIdx = pipe.indexOf("verifyPoolTargetMatch(");
const holdIdx = pipe.indexOf('verdict === "mismatch"');
const pivotIdx = pipe.indexOf("claims = injected ??");
check("groundBrief CALLS verifyPoolTargetMatch on the fetched pool", callIdx > 0);
check("the target-match call precedes the extraction pivot (gates both drivers)", callIdx > 0 && pivotIdx > callIdx);
check("the MISMATCH hard-hold precedes the extraction pivot", holdIdx > 0 && pivotIdx > holdIdx);
check("the gate is imported from the one home", pipe.includes('from "@/lib/sources/target-match.mjs"'));

console.log(failed ? `\nGOLDEN FAILED (${failed})` : "\nGOLDEN PASSED");
process.exit(failed ? 1 : 0);
