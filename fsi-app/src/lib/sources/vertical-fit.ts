import type { SourceRole } from "@/lib/sources/classify-source-role";

type InstitutionalType =
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
  _url: string | null | undefined,
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

/**
 * Part (a) of the kill criterion only: is this source off-vertical BY IDENTITY?
 * True for a general legislature. (Redundant-portal detection is corpus-level and
 * handled by the caller.) Part (b), the coverage-gap guard, is ALSO the caller's job —
 * this function never authorizes a kill by itself.
 */
export function isOffVerticalByIdentity(type: InstitutionalType): boolean {
  return type === "general_legislature";
}
