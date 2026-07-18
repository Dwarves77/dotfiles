#!/usr/bin/env node
// drain-clear-two-condition.golden.mjs — behavioral golden for the TIGHTENED drain-clear auto-version-out
// (operator ruling 2026-07-16, over-clear incident). Proof, not inference: a claim is auto-versioned-out ONLY
// when BOTH (a) its span is absent from the verified primary AND (b) its text names a FOREIGN instrument
// identifier. The 55f90df0 pattern (span-absent, names a different instrument) MUST auto-clear; the 4ff5cf56
// pattern (span-absent, same subject, NO foreign id, wrong declared primary) MUST NOT. Pure. No DB.
// Run: node scripts/verify/drain-clear-two-condition.golden.mjs — exits 0 PASS, 1 FAIL.
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { foreignInstrumentTokens, ownInstrumentTokens, scanImoTokens, verifyTargetMatch } =
  await jiti.import("../../src/lib/sources/target-match.mjs");

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

// The two-condition predicate as drain-clear applies it (primary must be id-confirmed; span absent; foreign id).
const wouldAutoClear = (claimText, spanInPrimary, item, primaryText) => {
  const tm = verifyTargetMatch(item, primaryText);
  const primaryIdConfirmed = tm.verdict === "match" && (tm.via === "instrument-id" || tm.via === "raw-id");
  const foreign = foreignInstrumentTokens(claimText, item);
  return primaryIdConfirmed && !spanInPrimary && foreign.length > 0;
};

// ── 55f90df0 pattern: item is the IMO MEPC.338(76) guidelines; a claim naming MEPC.400(83) (a DIFFERENT IMO
//    instrument) with a span absent from the primary is proven cross-instrument -> MUST auto-clear. ─────────
// identifier set inline per operator ruling #4 (derive+set the instrument key as part of draining an IMO item),
// so the primary is id-confirmed (raw-id) rather than subject-overlap.
const IMO_ITEM = { title: "IMO MEPC Resolution 338(76) - Maritime Environmental Protection Committee Decision", item_type: "regulation", identifier: "MEPC.338(76)" };
const IMO_PRIMARY = "RESOLUTION MEPC.338(76) (adopted on 17 June 2021) 2021 Guidelines on the operational carbon intensity reduction factors. These Guidelines provide the methods to determine the annual operational carbon intensity reduction factors from year 2023 to 2030.";
check("own-token includes the item's MEPC.338(76) from title", ownInstrumentTokens(IMO_ITEM).has("mepc.338(76)"));
check("scanImoTokens finds MEPC.400(83) in a claim", scanImoTokens("The Z factors for 2027-2030 adopted by MEPC.400(83)").has("mepc.400(83)"));
check("foreign token detected: MEPC.400(83) claim vs a MEPC.338(76) item", foreignInstrumentTokens("The Z factors for 2027-2030 adopted by MEPC.400(83) are 13.625%.", IMO_ITEM).includes("mepc.400(83)"));
check("55f90df0 pattern AUTO-CLEARS (span absent + foreign MEPC.400(83), id-confirmed primary)",
  wouldAutoClear("The Z factors for 2027-2030 adopted by MEPC.400(83) are 13.625%.", false, IMO_ITEM, IMO_PRIMARY) === true);

// ── 4ff5cf56 pattern: item is the Wyoming CCR permit-program approval; the declared primary is the WRONG doc
//    (a docket of Wyoming statutes), so a same-subject claim (Wyoming CCR effective date) has a span absent
//    from that primary but names NO foreign instrument -> MUST NOT auto-clear (relabel / re-point, not erase). ─
const CCR_ITEM = { title: "Wyoming DEQ Receives EPA Partial Approval for Coal Combustion Residuals Permit Program", item_type: "regulation" };
const CCR_WRONG_PRIMARY = "Wyoming geologic sequestration special revenue account. This section is effective as of 7/1/2023. Injected carbon dioxide definitions under the Wyoming statutes.";
check("no foreign token for a same-subject Wyoming CCR claim", foreignInstrumentTokens("Wyoming DEQ partial CCR permit program authority became effective March 30, 2026.", CCR_ITEM).length === 0);
check("4ff5cf56 primary is NOT id-confirmed (subject-overlap at best)",
  (() => { const tm = verifyTargetMatch(CCR_ITEM, CCR_WRONG_PRIMARY); return !(tm.verdict === "match" && (tm.via === "instrument-id" || tm.via === "raw-id")); })());
check("4ff5cf56 pattern does NOT auto-clear (no foreign id AND primary not id-confirmed)",
  wouldAutoClear("Wyoming DEQ partial CCR permit program authority became effective March 30, 2026.", false, CCR_ITEM, CCR_WRONG_PRIMARY) === false);

// ── Guards: even with a foreign id, a span PRESENT in the primary never auto-clears (re-attribute, not erase);
//    and an EU cross-instrument case (CSRD claim vs an HDV item) auto-clears only when the primary is id-confirmed.
check("span present in primary never auto-clears even with a foreign id",
  wouldAutoClear("MEPC.400(83) is referenced here.", true, IMO_ITEM, IMO_PRIMARY) === false);
const HDV_ITEM = { title: "CO2 emission standards for heavy-duty vehicles", item_type: "regulation", identifier: "2024/1610", canonical_instrument_key: "32024R1610" };
const HDV_PRIMARY = "Regulation (EU) 2024/1610 of the European Parliament amending Regulation (EU) 2019/1242 on CO2 emission performance standards for heavy-duty vehicles.";
check("EU cross-instrument: a CSRD (2022/2464) claim on an id-confirmed HDV (2024/1610) primary AUTO-CLEARS",
  wouldAutoClear("Directive (EU) 2022/2464 requires corporate sustainability reporting.", false, HDV_ITEM, HDV_PRIMARY) === true);

// ── ORPHAN class (third exit, orphaned_no_prose_referent): version out ONLY when BOTH (a) claim text is
//    verbatim-absent from ALL section prose AND (b) if it covers a required slot, that slot is ALSO covered by a
//    FACT/GAP (slot-safe). A slot's SOLE coverage is a slot GAP to fill, never cleared. Predicate mirrors drain-clear.
const strip = (t) => String(t || "").replace(/^\[[^\]]+\]\s*/, "").trim();
const slotOf = (t) => { const m = String(t || "").match(/^\[([^\]]+)\]/); return m ? m[1] : null; };
const wouldOrphanClear = (claimText, allProse, requiredSlots, coveredByFactOrGap) => {
  const inProse = allProse.toLowerCase().includes(strip(claimText).toLowerCase());
  if (inProse) return false;                                   // in prose -> relabel, not orphan
  const slot = slotOf(claimText);
  if (slot && requiredSlots.has(slot) && !coveredByFactOrGap.has(slot)) return false; // sole coverage -> fill, not clear
  return true;
};
const PROSE = "The program is administered by the state. *Analytical inference:* the workspace should monitor filings.";
const REQ = new Set(["effective_date", "penalty_summary"]);
const COVERED = new Set(["effective_date"]); // effective_date has a FACT; penalty_summary does not
check("orphan CLEARS: text absent from all prose, no required slot", wouldOrphanClear("Wyoming is one of five states with CCR authority.", PROSE, REQ, COVERED) === true);
check("orphan CLEARS: text absent, covers effective_date which a FACT also covers (slot-safe)", wouldOrphanClear("[effective_date] Authority became effective March 30, 2026.", PROSE, REQ, COVERED) === true);
check("orphan does NOT clear: it is a required slot's SOLE coverage (fill, never clear)", wouldOrphanClear("[penalty_summary] Penalties apply under RCRA.", PROSE, REQ, COVERED) === false);
check("orphan does NOT clear: claim text IS in prose (relabel path, stays live)", wouldOrphanClear("the workspace should monitor filings", PROSE, REQ, COVERED) === false);

console.log(failed ? `\nGOLDEN FAILED (${failed})` : "\nGOLDEN PASSED");
process.exit(failed ? 1 : 0);
