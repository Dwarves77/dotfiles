// src/lib/sources/vertical-fit.ts
//
// ════════════════════════════════════════════════════════════════════════════
// THE VERTICAL-FIT CRITERION  (written down once; used as BOTH the audit kill
// rule AND the discovery/ingestion gate rule — same logic, no drift)
// ════════════════════════════════════════════════════════════════════════════
//
// A source belongs in Caro's Ledge only if it is, BY ITS INSTITUTIONAL IDENTITY,
// a producer of freight-sustainability intelligence. Relevance is judged on WHAT
// THE INSTITUTION IS, never on its current item yield (every source reads 0 items
// while supply is paused — yield is not a relevance signal).
//
// ── CRITERION REVISED 2026-06-04 (per-jurisdiction lawmaking basis) ──
// Legislatures are KEPT BY DEFAULT: a legislature enacts the binding law our industry must
// follow (US state clean-truck/clean-fuel rules, EU directive transposition, provincial carbon
// pricing, port-city ordinances). The earlier "general_legislature == off-vertical" rule below
// is a CANDIDATE FLAG only, NOT a cut decision. A legislature is cut ONLY when its jurisdiction
// genuinely produces NO freight-sustainability lawmaking AND coverage exists — a researched,
// per-jurisdiction judgment, never an automated verdict. The OPERATIVE gate is the negative list
// (sources already SUSPENDED as off-vertical; see vertical-fit-gate.ts) so an authorized cut can
// never silently re-add. classifyInstitutionalType + isOffVerticalByIdentity remain as inputs to
// the audit and as a soft flag; they do not by themselves retire anything.
//
// OFF-VERTICAL candidate flag (audit input only; cut requires per-jurisdiction research + auth):
//   (a) Off-vertical by institutional identity — the source is a GENERAL LEGISLATURE
//       (the political lawmaking body itself: an Assembly / Parliament / Diet / Congress
//       / Senate / National-Council homepage), OR a redundant portal of an entity already
//       represented; AND
//   (b) No coverage gap — the vertical-relevant authority for that jurisdiction is
//       ALREADY covered by another active source (its statute/gazette database, its
//       environment/transport/maritime/aviation/customs/energy regulator, or a
//       supranational body — EU / IMO / ICAO — that covers it).
//
// Why general legislatures are off-vertical: you do not monitor "the Alabama
// Legislature" or "the Tokyo Metropolitan Assembly" for freight-sustainability — you
// monitor the jurisdiction's environmental/transport regulator and its official
// gazette, where the binding text actually lands and is searchable. The legislature's
// own portal is too broad and, when the regulator/gazette is covered, purely redundant.
//
// What is NOT off-vertical (KEEP), even though it may carry a "legal authority" role:
//   * STATUTE / GAZETTE databases — where binding legal TEXT is published and searchable
//     (EUR-Lex, Federal Register, Singapore Statutes Online, China NPC law database,
//     Gazette of India, official journals). These ARE the primary legal-text source.
//   * SECTORAL regulators / ministries — environment, transport, maritime, aviation,
//     energy, customs (MLIT, MOEJ, EPA, Japan Customs, NHVR, a Bureau of Environment).
//   * Intergovernmental bodies, standards bodies, academic/research, statistical
//     agencies, trade press, industry associations/data providers — on-vertical by their
//     curated role; their relevance is a separate question, out of scope for THIS gate.
//
// This module classifies institutional identity deterministically from name + URL
// (+ the existing source_role as a prior). It NEVER decides "kill" on its own — part (b),
// the coverage check, needs the whole corpus and lives in the audit / gate caller.
// Order is deliberate: gazette/statute DB is checked BEFORE legislature so "Singapore
// Statutes Online" is kept while "Tokyo Metropolitan Assembly" is flagged.

import type { SourceRole } from "@/lib/sources/classify-source-role";

export type InstitutionalType =
  | "statute_gazette_db"          // legal-text publication / searchable law database — KEEP
  | "general_legislature"         // the political lawmaking body's own portal — OFF-VERTICAL candidate
  | "sectoral_regulator_ministry" // environment/transport/maritime/aviation/energy/customs authority — KEEP
  | "intergovernmental"           // IMO/ICAO/EU/UN/OECD/IEA… — KEEP
  | "standards_body"              // ISO/GHGP/SBTi/CDP… — KEEP
  | "academic_research"           // universities / institutes — KEEP
  | "statistical_data_agency"     // EIA/statistics portals — KEEP
  | "industry"                    // associations / data providers / trade press / vendors — KEEP
  | "unknown";                    // undeterminable — review, never auto-kill

// where binding legal TEXT lives / is searchable — KEEP even though "legal authority"-ish
const GAZETTE_STATUTE_DB =
  /\b(gazette|official journal|eur-?lex|federal register|code of federal regulations|statutes?\s*(online|of)|statute law|legislation(\.gov)?|laws?\s+and\s+regulations|law database|legal database|national database of laws|e-?gazette|e-?laws?|elaw|官報|di[áa]rio oficial|bolet[íi]n oficial|gazzetta ufficiale|journal officiel|amtsblatt)\b/i;

// the political lawmaking BODY itself (not the law-text DB) — OFF-VERTICAL candidate
const GENERAL_LEGISLATURE =
  /\b(legislative assembly|legislature|metropolitan assembly|national assembly|general assembly|provincial assembly|state assembly|parliament(ary)?|house of representatives|house of councillors|house of commons|house of lords|chamber of deputies|national council|city council|county council|\bcongress\b|\bsenate\b|\bbundestag\b|\bbundesrat\b|\bnationalrat\b|\briksdag\b|\bfolketing\b|\bsejm\b|cortes generales|asamblea nacional|assembl[ée]e nationale|\bduma\b|\bknesset\b|\bstorting\b|eduskunta|tweede kamer|oireachtas|\bsaeima\b|\bseimas\b|riigikogu|dr[žz]avni zbor|n[áa]rodn[áa] rada|verkhovna rada|lok sabha|rajya sabha|議会|国会|衆議院|参議院|都議会)\b/i;

// sectoral executive authority — KEEP
const SECTORAL_REGULATOR_MINISTRY =
  /\b(ministry|ministerio|minist[èe]re|ministerstv\w*|department of|dept\.?\s+of|\bagency\b|administration|\bauthority\b|commission|\bbureau\b|directorate|secretariat|inspectorate|regulator|\bepa\b|environmental protection|civil aviation|maritime|customs|port authority|transport)\b/i;

/**
 * Classify a source's institutional identity from name + URL, using its existing
 * source_role only as a weak prior (non-legal-authority roles short-circuit to their
 * obvious type). Deterministic; no content fetch, no LLM. Returns "unknown" only when
 * genuinely undeterminable — callers treat unknown as REVIEW, never auto-kill.
 */
export function classifyInstitutionalType(
  name: string | null | undefined,
  url: string | null | undefined,
  sourceRole?: SourceRole | null
): InstitutionalType {
  const n = (name || "").trim();

  // Non-legal-authority roles are not the off-vertical-legislature target — map them
  // straight to their type so the legislature lexicon never mislabels e.g. the
  // "Council of the EU" (intergovernmental) or a "World Business Council" (industry).
  switch (sourceRole) {
    case "intergovernmental_body": return "intergovernmental";
    case "standards_body": return "standards_body";
    case "academic_research": return "academic_research";
    case "statistical_data_agency": return "statistical_data_agency";
    case "trade_press":
    case "industry_association":
    case "industry_data_provider":
    case "vendor_corporate": return "industry";
    default: break; // primary_legal_authority | government_press | null fall through
  }

  // Within the legal-authority space, ORDER MATTERS:
  // 1) a law-text DB / gazette is KEEP even if its name also contains "legislation"
  if (GAZETTE_STATUTE_DB.test(n)) return "statute_gazette_db";
  // 2) the political lawmaking body itself is the OFF-VERTICAL candidate
  if (GENERAL_LEGISLATURE.test(n)) return "general_legislature";
  // 3) a sectoral regulator / ministry is KEEP
  if (SECTORAL_REGULATOR_MINISTRY.test(n)) return "sectoral_regulator_ministry";

  return "unknown";
}

// Many sub-national "legislature" sources are actually the jurisdiction's STATUTE / CODE
// database (where binding state/provincial law text lives) wearing a legislature name —
// e.g. "Nevada Legislature – Nevada Revised Statutes (NRS)", "Michigan Compiled Laws (MCL)
// & Administrative Code". These carry legal TEXT and must NOT be auto-killed as if they were
// a political-body portal; they route to REVIEW. Applied only to general_legislature
// candidates, so the bare "statutes/code/laws" tokens are safe from false hits.
const STATUTE_CODE_DB_NAME =
  /\b(statutes?|revised code|compiled laws|code annotated|statutes annotated|century code|general laws|session laws|administrative code|consolidated laws|municipal code|revisor of statutes|legislative counsel bureau|\bcode\b|\bORS\b|\bMCL\b|\bMCA\b|\bNRS\b|\bNMSA\b|\bMGL\b|\bKSA\b)\b/i;

/** True when a general_legislature source's NAME signals it is really the jurisdiction's
 *  statute/code text database. Such sources are borderline legal-text sources -> REVIEW,
 *  never auto-kill. Used by BOTH the audit and the gate so they treat these identically. */
export function looksLikeStatuteCodeDb(name: string | null | undefined): boolean {
  return STATUTE_CODE_DB_NAME.test((name || "").trim());
}

/**
 * Part (a) of the kill criterion only: is this source off-vertical BY IDENTITY?
 * True for a general legislature. (Redundant-portal detection is corpus-level and
 * handled by the caller.) Part (b), the coverage-gap guard, is ALSO the caller's job —
 * this function never authorizes a kill by itself.
 */
export function isOffVerticalByIdentity(type: InstitutionalType): boolean {
  return type === "general_legislature";
}

/** Types whose presence in a jurisdiction COUNTS as the vertical-relevant authority
 *  being covered (used by the coverage-gap guard). A general legislature does NOT count
 *  — it is the thing we are trying to retire. */
export function coversVerticalAuthority(type: InstitutionalType): boolean {
  return (
    type === "statute_gazette_db" ||
    type === "sectoral_regulator_ministry" ||
    type === "intergovernmental"
  );
}
