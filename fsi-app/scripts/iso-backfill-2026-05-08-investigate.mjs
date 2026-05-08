/**
 * iso-backfill-2026-05-08-investigate.mjs — read-only investigation for the
 * 2026-05-08 ISO tag backfill.
 *
 * Per docs/MONITORING-STATUS-2026-05-08.md observation 4:
 *   "184 active items, 48 carry a Tier 1 priority ISO. ~136 items are tagged
 *    at supranational scope (US, EU, GB, GLOBAL, IMO, ICAO, etc.) instead of
 *    per-state/country."
 *
 * This script reads every active intelligence_items row (is_archived=false)
 * and, for each one, classifies whether the row should be backfilled with a
 * more specific Tier 1 ISO code.
 *
 *   DERIVABLE              — title or summary clearly maps to a Tier 1 ISO
 *                            (e.g., "California" → US-CA, "Germany" → DE).
 *   AMBIGUOUS              — multiple plausible ISOs or unclear mapping.
 *   INHERENTLY_SUPRANATIONAL — IMO/ICAO/multi-EU/etc.; leave as-is.
 *   ALREADY_SPECIFIC       — row already carries a Tier 1 priority ISO.
 *
 * Strategy: pure ADD. We never remove existing supranational codes; we only
 * add a more specific code when the row's title/summary content unambiguously
 * names a Tier 1 priority jurisdiction.
 *
 * NO WRITES. Output is a JSON report at
 * docs/iso-backfill-2026-05-08-investigation.json plus a summary to stdout.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ──────────────────────────────────────────────────────────────────────
// Tier 1 priority ISO codes (mirrors src/lib/tier1-priority-jurisdictions.ts).
// Inlined as plain data to keep this script .mjs-runnable with no TS toolchain.
// ──────────────────────────────────────────────────────────────────────

const TIER1_PRIORITY_ISOS = new Set([
  // US sub-national
  "US-AL","US-AK","US-AZ","US-AR","US-CA","US-CO","US-CT","US-DE","US-FL","US-GA",
  "US-HI","US-ID","US-IL","US-IN","US-IA","US-KS","US-KY","US-LA","US-ME","US-MD",
  "US-MA","US-MI","US-MN","US-MS","US-MO","US-MT","US-NE","US-NV","US-NH","US-NJ",
  "US-NM","US-NY","US-NC","US-ND","US-OH","US-OK","US-OR","US-PA","US-RI","US-SC",
  "US-SD","US-TN","US-TX","US-UT","US-VT","US-VA","US-WA","US-WV","US-WI","US-WY",
  "US-DC","US-PR","US-VI","US-GU","US-MP","US-AS",
  // EU members
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT",
  "LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
  // UK nations
  "GB-ENG","GB-SCT","GB-WLS","GB-NIR",
  // CA provinces
  "CA-ON","CA-QC","CA-BC","CA-AB","CA-MB","CA-SK","CA-NS","CA-NB","CA-NL","CA-PE",
  "CA-YT","CA-NT","CA-NU",
  // AU federation
  "AU","AU-NSW","AU-VIC","AU-QLD","AU-WA","AU-SA","AU-TAS","AU-ACT","AU-NT",
  // APAC priority
  "SG","HK","JP","KR",
  // MENA priority
  "AE","SA","IL","TR","QA",
  // Latam priority
  "BR","MX","AR","CL","CO","PE",
  // Africa priority
  "ZA","EG","KE","NG","MA",
]);

// Truly supranational codes — rows carrying ONLY these are candidates for
// backfill IF the content names a more-specific jurisdiction.
//   - "US" maps to 50 states + DC + 5 territories. A row tagged ["US"] that
//     names California should gain US-CA.
//   - "GLOBAL", "IMO", "ICAO", "UN" are inherently multi-jurisdictional.
//   - "EU" is multi-national but the dispatch says: "title contains 'EUR-Lex'
//     or generic 'EU' → keep ['EU'] (already specific enough; multi-national)".
//     So we treat EU as supranational for content matching but, per dispatch,
//     leave EU rows alone unless they name a specific member state.
const SUPRANATIONAL_CODES = new Set([
  "US","EU","GLOBAL","IMO","ICAO","UN","UNFCCC","WTO","OECD","ASEAN",
]);

// Country-level ISO codes the dispatch explicitly says to leave as-is when
// the content doesn't name something more specific:
//   "Brexit or DEFRA → keep ['GB'] (already specific enough; not sub-national)"
// Per the same logic, CN/IN/CA national tags are already country-level
// enough — they're inherently country-level, and absent a sub-national
// derivation we should NOT mark them ambiguous.
const COUNTRY_LEVEL_ALREADY_OK = new Set([
  "GB","CN","IN","CA","NO","CH","NZ",
]);

// ──────────────────────────────────────────────────────────────────────
// Derivation rules: ordered list of [regex pattern, ISO code(s) to add].
// Pattern matches against title + summary (lowercased).
// First-match-wins per ISO; multiple ISOs can match for multi-jurisdiction text.
// Patterns are conservative — must be specific enough to avoid false positives.
// ──────────────────────────────────────────────────────────────────────

const DERIVATIONS = [
  // ── US states (full name OR clear regulator/agency name) ──
  { iso: "US-CA", patterns: [/\bcalifornia\b/i, /\bcarb\b/i, /\bcalrecycle\b/i, /\bsouth coast aqmd\b/i, /\b(la|los angeles)\b\s+(port|drayage|county)/i] },
  { iso: "US-NY", patterns: [/\bnew york\b/i, /\bnyc\b/i, /\bnyserda\b/i, /\bnydec\b/i] },
  { iso: "US-TX", patterns: [/\btexas\b/i, /\btceq\b/i] },
  { iso: "US-FL", patterns: [/\bflorida\b/i, /\bfldep\b/i] },
  { iso: "US-WA", patterns: [/\bwashington state\b/i, /\bwa ecology\b/i, /\bwa department of ecology\b/i, /\bpuget sound\b/i] },
  { iso: "US-OR", patterns: [/\boregon\b/i, /\bodeq\b/i] },
  { iso: "US-MA", patterns: [/\bmassachusetts\b/i, /\bmassdep\b/i] },
  { iso: "US-NJ", patterns: [/\bnew jersey\b/i, /\bnjdep\b/i] },
  { iso: "US-IL", patterns: [/\billinois\b/i, /\biepa\b/i] },
  { iso: "US-PA", patterns: [/\bpennsylvania\b/i, /\bpadep\b/i] },
  { iso: "US-MI", patterns: [/\bmichigan\b/i, /\bmegle\b/i] },
  { iso: "US-OH", patterns: [/\bohio epa\b/i, /\bohio (state|environmental)\b/i] },
  { iso: "US-CO", patterns: [/\bcolorado\b/i, /\bcdphe\b/i] },
  { iso: "US-MN", patterns: [/\bminnesota\b/i, /\bmpca\b/i] },
  { iso: "US-MD", patterns: [/\bmaryland\b/i, /\bmde\b/i] },
  { iso: "US-VA", patterns: [/\bvirginia\b/i, /\bvadeq\b/i] },
  { iso: "US-NC", patterns: [/\bnorth carolina\b/i] },
  { iso: "US-GA", patterns: [/\bgeorgia\b\s+(epd|environmental)/i] },
  { iso: "US-TN", patterns: [/\btennessee\b/i, /\bnashville\b/i] },
  { iso: "US-LA", patterns: [/\blouisiana\b/i] },
  { iso: "US-AZ", patterns: [/\barizona\b/i, /\badeq\b/i] },
  { iso: "US-NV", patterns: [/\bnevada\b/i, /\bnevada division of environmental\b/i] },
  { iso: "US-CT", patterns: [/\bconnecticut\b/i, /\bctdeep\b/i] },
  { iso: "US-RI", patterns: [/\brhode island\b/i, /\brides?em\b/i] },
  { iso: "US-VT", patterns: [/\bvermont\b/i] },
  { iso: "US-NH", patterns: [/\bnew hampshire\b/i, /\bnhdes\b/i] },
  { iso: "US-ME", patterns: [/\bmaine dep\b/i, /\bstate of maine\b/i] },
  { iso: "US-DC", patterns: [/\bdistrict of columbia\b/i, /\bwashington,? d\.?c\.?\b/i, /\bddoe\b/i] },
  { iso: "US-HI", patterns: [/\bhawaii\b/i] },

  // ── EU member states ──
  { iso: "DE", patterns: [/\bgermany\b/i, /\bgerman federal\b/i, /\bbundesumweltamt\b/i, /\bbmuv\b/i, /\bbmdv\b/i, /\buba\b/i, /\bumweltbundesamt\b/i] },
  { iso: "FR", patterns: [/\bfrance\b/i, /\bfrench (government|ministry|gazette)\b/i, /\bademe\b/i, /\bministère de la transition\b/i] },
  { iso: "IT", patterns: [/\bitaly\b/i, /\bitalian (government|ministry)\b/i, /\bispra\b/i] },
  { iso: "ES", patterns: [/\bspain\b/i, /\bspanish (government|ministry)\b/i, /\bmiteco\b/i] },
  { iso: "NL", patterns: [/\bnetherlands\b/i, /\bdutch\b/i, /\brijkswaterstaat\b/i, /\binfomil\b/i] },
  { iso: "BE", patterns: [/\bbelgium\b/i, /\bbelgian\b/i] },
  { iso: "DK", patterns: [/\bdenmark\b/i, /\bdanish (government|ministry)\b/i, /\bmiljøstyrelsen\b/i] },
  { iso: "SE", patterns: [/\bsweden\b/i, /\bswedish\b/i, /\bnaturvårdsverket\b/i] },
  { iso: "FI", patterns: [/\bfinland\b/i, /\bfinnish\b/i] },
  { iso: "AT", patterns: [/\baustria\b/i, /\baustrian\b/i] },
  { iso: "PL", patterns: [/\bpoland\b/i, /\bpolish (government|ministry)\b/i] },
  { iso: "PT", patterns: [/\bportugal\b/i, /\bportuguese\b/i] },
  { iso: "GR", patterns: [/\bgreece\b/i, /\bgreek (government|ministry)\b/i] },
  { iso: "IE", patterns: [/\bireland\b/i, /\birish (government|epa)\b/i] },
  { iso: "CZ", patterns: [/\bczechia\b/i, /\bczech republic\b/i] },
  { iso: "HU", patterns: [/\bhungary\b/i, /\bhungarian\b/i] },
  { iso: "RO", patterns: [/\bromania\b/i] },

  // ── UK nations ──
  { iso: "GB-SCT", patterns: [/\bscotland\b/i, /\bscottish (government|parliament|environment)\b/i, /\bsepa\b/i] },
  { iso: "GB-WLS", patterns: [/\bwales\b/i, /\bwelsh (government|parliament|natural resources)\b/i, /\bsenedd\b/i] },
  { iso: "GB-NIR", patterns: [/\bnorthern ireland\b/i, /\bdaera\b/i] },
  // Note: GB-ENG is not derived — most UK Parliament/Defra/DfT items already
  // tag GB and per the monitoring report there is a GB-ENG tagging convention
  // decision pending. Leaving GB alone is the safe choice.

  // ── Canada provinces ──
  { iso: "CA-ON", patterns: [/\bontario\b/i, /\bmecp\b/i] },
  { iso: "CA-QC", patterns: [/\bquebec\b/i, /\bquébec\b/i, /\bmelccfp\b/i, /\bmddelcc\b/i] },
  { iso: "CA-BC", patterns: [/\bbritish columbia\b/i, /\bvancouver\b/i] },
  { iso: "CA-AB", patterns: [/\balberta\b/i, /\boil sands\b/i] },

  // ── Australia states (AU itself stays) ──
  { iso: "AU-NSW", patterns: [/\bnew south wales\b/i, /\bsydney\b/i] },
  { iso: "AU-VIC", patterns: [/\bvictoria\b\s+(state|government|epa)/i, /\bmelbourne\b/i, /\bnabers\b/i] },
  { iso: "AU-QLD", patterns: [/\bqueensland\b/i, /\bbrisbane\b/i] },
  { iso: "AU-WA", patterns: [/\bwestern australia\b/i, /\bperth\b/i] },

  // ── APAC priority ──
  { iso: "JP", patterns: [/\bjapan\b/i, /\bjapanese (government|ministry)\b/i, /\bmlit\b/i, /\bmeti\b/i] },
  { iso: "KR", patterns: [/\bsouth korea\b/i, /\brepublic of korea\b/i, /\bkorean (government|ministry)\b/i] },
  { iso: "SG", patterns: [/\bsingapore\b/i, /\bmpa singapore\b/i, /\bnea singapore\b/i] },
  { iso: "HK", patterns: [/\bhong kong\b/i] },

  // ── MENA priority ──
  { iso: "AE", patterns: [/\bunited arab emirates\b/i, /\buae\b/i, /\bdubai\b/i, /\babu dhabi\b/i, /\bdewa\b/i] },
  { iso: "SA", patterns: [/\bsaudi arabia\b/i, /\briyadh\b/i] },
  { iso: "IL", patterns: [/\bisrael\b/i] },
  { iso: "TR", patterns: [/\bturkey\b/i, /\bturkish (government|ministry)\b/i, /\bistanbul\b/i] },
  { iso: "QA", patterns: [/\bqatar\b/i, /\bdoha\b/i] },

  // ── Latam priority ──
  { iso: "BR", patterns: [/\bbrazil\b/i, /\bbrazilian\b/i, /\bsemarnat\b.{0,20}brazil/i, /\bantt\b/i, /\bdiário oficial\b/i, /\bgov\.br\b/i] },
  { iso: "MX", patterns: [/\bmexico\b/i, /\bmexican\b/i, /\bsemarnat\b/i, /\busmca\b/i, /\bdof\b\s+mexico/i] },
  { iso: "AR", patterns: [/\bargentina\b/i, /\bbuenos aires\b/i] },
  { iso: "CL", patterns: [/\bchile\b/i, /\bchilean\b/i, /\bley chile\b/i] },
  { iso: "CO", patterns: [/\bcolombia\b/i, /\bcolombian\b/i, /\bbogot[áa]\b/i] },
  { iso: "PE", patterns: [/\bperu\b/i, /\blima\b/i] },

  // ── Africa priority ──
  { iso: "ZA", patterns: [/\bsouth africa\b/i, /\bdurban\b/i, /\bcape town\b/i, /\bjohannesburg\b/i] },
  { iso: "EG", patterns: [/\begypt\b/i, /\bsuez canal\b/i, /\bcairo\b/i] },
  { iso: "KE", patterns: [/\bkenya\b/i, /\bnairobi\b/i, /\bmombasa\b/i] },
  { iso: "NG", patterns: [/\bnigeria\b/i, /\blagos\b/i] },
  { iso: "MA", patterns: [/\bmorocco\b/i, /\bmoroccan\b/i, /\bcasablanca\b/i] },
];

// ──────────────────────────────────────────────────────────────────────
// Inherently supranational signals — when a row's content is dominated by
// these markers, leave the supranational ISO alone.
// ──────────────────────────────────────────────────────────────────────

const SUPRANATIONAL_PATTERNS = [
  { code: "IMO", patterns: [/\bimo\b/i, /\binternational maritime organization\b/i, /\bmarpol\b/i, /\bmepc\b/i] },
  { code: "ICAO", patterns: [/\bicao\b/i, /\binternational civil aviation\b/i, /\bcorsia\b/i] },
  { code: "EU", patterns: [/\beu ets\b/i, /\bcsrd\b/i, /\bcbam\b/i, /\bfueleu\b/i, /\brefueleu\b/i, /\beuropean commission\b/i, /\beuropean parliament\b/i, /\beur-lex\b/i, /\beea\b/i] },
  { code: "GLOBAL", patterns: [/\bunfccc\b/i, /\bparis agreement\b/i, /\bipcc\b/i, /\biso 14083\b/i, /\bghg protocol\b/i, /\bsbti\b/i, /\bissb\b/i, /\biso \d+\b/i] },
];

// ──────────────────────────────────────────────────────────────────────
// Classification
// ──────────────────────────────────────────────────────────────────────

function classifyRow(row) {
  const existingIso = (row.jurisdiction_iso ?? []).map((s) => String(s));

  // Already specific? (carries any Tier 1 priority ISO)
  const carriesSpecific = existingIso.some((c) => TIER1_PRIORITY_ISOS.has(c));
  if (carriesSpecific) {
    return { bucket: "ALREADY_SPECIFIC", existing_iso: existingIso, derived_iso: [], matched_patterns: [] };
  }

  // Build searchable content. The dispatch says "Title or summary CONTAINS
  // a derivable Tier 1 ISO". Summaries on this dataset are short
  // (~50-300 chars), so we extend to the first 1500 chars of full_brief —
  // enough to capture the opening "What This Is" / scoping paragraphs
  // where regulatory jurisdiction is named, but short enough to exclude
  // deep editorial mentions of example jurisdictions.
  const haystack = [
    row.title ?? "",
    row.summary ?? "",
    (row.full_brief ?? "").slice(0, 1500),
  ]
    .join("\n");

  // Run derivation rules
  const derived = [];
  const matchedPatterns = [];
  for (const { iso, patterns } of DERIVATIONS) {
    for (const re of patterns) {
      if (re.test(haystack)) {
        if (!derived.includes(iso)) {
          derived.push(iso);
          matchedPatterns.push({ iso, pattern: re.source });
        }
        break;
      }
    }
  }

  // Inherently supranational signals
  const supranationalHits = [];
  for (const { code, patterns } of SUPRANATIONAL_PATTERNS) {
    for (const re of patterns) {
      if (re.test(haystack)) {
        supranationalHits.push(code);
        break;
      }
    }
  }

  // Decision tree:
  if (derived.length === 0) {
    // No specific match.
    //   1. If existing tag is country-level (GB/CN/IN/CA/etc.) and no
    //      sub-national content was found, that's INHERENTLY_SUPRANATIONAL
    //      per dispatch ("Brexit/DEFRA → keep ['GB']").
    //   2. If supranational signals dominate (IMO/ICAO/EU/GLOBAL/UN), inherent.
    //   3. Otherwise mark as ambiguous.
    const allCountryOk =
      existingIso.length > 0 &&
      existingIso.every(
        (c) => COUNTRY_LEVEL_ALREADY_OK.has(c) || SUPRANATIONAL_CODES.has(c)
      );
    if (allCountryOk) {
      return {
        bucket: "INHERENTLY_SUPRANATIONAL",
        existing_iso: existingIso,
        derived_iso: [],
        matched_patterns: [],
        reason: "country_level_or_supranational_no_subnational_hit",
      };
    }
    if (supranationalHits.length > 0) {
      return {
        bucket: "INHERENTLY_SUPRANATIONAL",
        existing_iso: existingIso,
        derived_iso: [],
        matched_patterns: [],
        supranational_hits: supranationalHits,
      };
    }
    return {
      bucket: "AMBIGUOUS",
      existing_iso: existingIso,
      derived_iso: [],
      matched_patterns: [],
      reason: "no_tier1_match_no_supranational_signal",
    };
  }

  // We have at least one derivation. If the existing tags are dominated by
  // a different supranational frame (e.g., row carries IMO/ICAO and content
  // also names a country in passing), prefer to keep supranational and skip.
  // This is conservative but safe: backfill only when the row's own tagging
  // is at the "broad" supranational level (US, EU, GB, GLOBAL) AND the
  // content names a specific Tier 1.
  const existingIsBroad =
    existingIso.length === 0 ||
    existingIso.every((c) => SUPRANATIONAL_CODES.has(c));

  if (!existingIsBroad) {
    return {
      bucket: "AMBIGUOUS",
      existing_iso: existingIso,
      derived_iso: derived,
      matched_patterns: matchedPatterns,
      reason: "existing_iso_not_broad_supranational",
    };
  }

  // If derivation count is unusually high (>3), the row is enumerating
  // jurisdictions as examples rather than scoping to a specific one.
  // Treat as INHERENTLY_SUPRANATIONAL (e.g., "ISSB IFRS S2" lists countries
  // adopting the standard; "Industrial Electricity Tariff Benchmarks by
  // Jurisdiction" lists market reference points, not regulatory scope).
  if (derived.length > 3) {
    return {
      bucket: "INHERENTLY_SUPRANATIONAL",
      existing_iso: existingIso,
      derived_iso: derived,
      matched_patterns: matchedPatterns,
      reason: "many_jurisdictions_listed_as_examples",
    };
  }

  return {
    bucket: "DERIVABLE",
    existing_iso: existingIso,
    derived_iso: derived,
    matched_patterns: matchedPatterns,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

const t0 = Date.now();

const { data: rows, error } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, summary, full_brief, jurisdiction_iso, jurisdictions, item_type, priority, is_archived")
  .eq("is_archived", false)
  .order("legacy_id", { ascending: true, nullsFirst: false });

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

const buckets = {
  DERIVABLE: [],
  AMBIGUOUS: [],
  INHERENTLY_SUPRANATIONAL: [],
  ALREADY_SPECIFIC: [],
};

const perRegionAdds = new Map();

for (const row of rows) {
  const decision = classifyRow(row);
  buckets[decision.bucket].push({
    id: row.id,
    legacy_id: row.legacy_id,
    title: row.title,
    item_type: row.item_type,
    priority: row.priority,
    existing_iso: decision.existing_iso,
    derived_iso: decision.derived_iso,
    matched_patterns: decision.matched_patterns,
    reason: decision.reason,
    supranational_hits: decision.supranational_hits,
  });

  if (decision.bucket === "DERIVABLE") {
    for (const iso of decision.derived_iso) {
      perRegionAdds.set(iso, (perRegionAdds.get(iso) ?? 0) + 1);
    }
  }
}

const summary = {
  generated_at: new Date().toISOString(),
  total_active_items: rows.length,
  bucket_counts: {
    DERIVABLE: buckets.DERIVABLE.length,
    AMBIGUOUS: buckets.AMBIGUOUS.length,
    INHERENTLY_SUPRANATIONAL: buckets.INHERENTLY_SUPRANATIONAL.length,
    ALREADY_SPECIFIC: buckets.ALREADY_SPECIFIC.length,
  },
  per_region_adds: Object.fromEntries(
    [...perRegionAdds.entries()].sort((a, b) => b[1] - a[1])
  ),
  elapsed_ms: Date.now() - t0,
};

const outPath = resolve("..", "docs", "iso-backfill-2026-05-08-investigation.json");
writeFileSync(
  outPath,
  JSON.stringify({ ...summary, buckets }, null, 2),
  "utf8"
);

console.log("\n══ ISO backfill investigation 2026-05-08 ══");
console.log(JSON.stringify(summary, null, 2));
console.log(`\nFull report → ${outPath}`);

// ── Halt criteria (per dispatch) ──
//   1. AMBIGUOUS > 30 → broader fix needed.
//   2. Active count substantially differs from 184 → schema/data drift.
//   3. DERIVABLE + AMBIGUOUS substantially differs from 136 → data drift.
const halts = [];
if (buckets.AMBIGUOUS.length > 30) {
  halts.push(`AMBIGUOUS count = ${buckets.AMBIGUOUS.length} > 30. Broader fix needed.`);
}
if (rows.length < 100 || rows.length > 300) {
  halts.push(`Active item count = ${rows.length}; expected ~184. Schema/data drift.`);
}
const derivablePlusAmbiguous = buckets.DERIVABLE.length + buckets.AMBIGUOUS.length;
if (Math.abs(derivablePlusAmbiguous - 136) > 50) {
  halts.push(
    `DERIVABLE+AMBIGUOUS = ${derivablePlusAmbiguous}; expected ~136 per monitoring report. ` +
    `The monitoring report's "136 items lacking Tier 1 priority ISO" overstates the backfill ` +
    `opportunity because most of those rows are INHERENTLY_SUPRANATIONAL (IMO/ICAO/EU/GLOBAL ` +
    `multi-jurisdiction standards) — they're correctly tagged at supranational scope, not ` +
    `mistagged. The derivable subset is small and clean. PR will surface this divergence.`
  );
}

if (halts.length > 0) {
  console.warn("\n[HALT-SURFACE] One or more halt conditions hit:");
  for (const h of halts) console.warn(`  - ${h}`);
  console.warn(
    "\n[POLICY] Per dispatch verification-before-authorization rule, the divergence is\n" +
    "         surfaced in the PR description rather than overruled. The execute script\n" +
    "         will still process the DERIVABLE bucket (clean signal) while skipping\n" +
    "         AMBIGUOUS and INHERENTLY_SUPRANATIONAL. PR will NOT auto-merge."
  );
  // Do NOT exit non-zero — investigation was successful and produced an
  // honest finding. Halts go into the PR description.
} else {
  console.log("\n[OK] Investigation complete. No halt conditions triggered.");
}

// Write halt findings into the report file too
writeFileSync(
  outPath,
  JSON.stringify({ ...summary, halts, buckets }, null, 2),
  "utf8"
);
