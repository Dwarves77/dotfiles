/**
 * source-type-categories-investigate.mjs — READ-ONLY investigation
 *
 * Walks every active+non-admin row in `sources`, derives a candidate
 * `source_type` (TEXT[]) from URL host, name, description, and notes,
 * classifies confidence as high|medium|low, and emits a JSON summary
 * to docs/source-type-backfill-investigation.json.
 *
 * NO DATABASE WRITES. NO SCHEMA CHANGES. Read-only.
 *
 * Output drives the authorized backfill in
 * scripts/source-type-backfill.mjs (NOT delivered with this PR — to be
 * authored after migration 049 lands).
 *
 * Usage:
 *   cd fsi-app
 *   node scripts/source-type-categories-investigate.mjs
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or
 * NEXT_PUBLIC_SUPABASE_ANON_KEY) in .env.local.
 *
 * See docs/SOURCE-TYPE-TAXONOMY-PROPOSAL.md § 6 for the heuristic
 * specification this script implements.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/ANON_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false },
});

const OUT_PATH = resolve("..", "docs", "source-type-backfill-investigation.json");
mkdirSync(dirname(OUT_PATH), { recursive: true });

// ── Heuristic mapping ────────────────────────────────────────────────
// Each entry is { hostsRegex, namesRegex, type, confidence }.
// Multiple entries can fire on a single row — the row's source_type is
// the union of all firing types.

const RULES = [
  // ── environmental_body ───────────────────────────────────────────
  {
    type: "environmental_body",
    confidence: "high",
    hostsRegex:
      /(^|\.)(epa\.gov|defra\.gov\.uk|eea\.europa\.eu|umweltbundesamt\.de|umweltbundesamt\.at|naturvardsverket\.se|miljoministeriet\.dk|miljodirektoratet\.no|ymparisto\.fi|epa\.ie|miteco\.gob\.es|ipma\.pt|ispra\.ambiente\.it|rivm\.nl|environnement\.brussels|aplinkosministerija\.lt|leefmilieubrussel|melccfp\.gouv\.qc\.ca|ec\.gc\.ca|canada\.ca\/eccc|environment\.gov)/i,
    namesRegex:
      /\b(EPA|Environment Agency|Environmental Protection|Ministry of (the )?Environment|Environment Ministry|Naturvårdsverket|Umweltbundesamt|Defra|MITECO|Miljøministeriet|RIVM|EEA|European Environment Agency|MELCCFP|ECCC|Environment and Climate Change|Brussels Environment|Conservation|Natural Resources)\b/i,
  },
  // ── legislature ─────────────────────────────────────────────────
  {
    type: "legislature",
    confidence: "high",
    hostsRegex:
      /(^|\.)(parliament\.uk|congress\.gov|bundestag\.de|assemblee-nationale\.fr|senat\.fr|riksdagen\.se|stortinget\.no|eduskunta\.fi|folketinget\.dk|tweedekamer\.nl|sejm\.gov\.pl|oireachtas\.ie|nationalrat\.at|chambre\.lu|knesset\.gov\.il|leginfo\.legislature\.ca\.gov|legislature\.[a-z.]+\.gov|parlement\.[a-z]+|chamberbe|assemblee|legis\.la\.gov)/i,
    namesRegex:
      /\b(Parliament|Congress|Bundestag|Bundesrat|Assemblée Nationale|Sénat|Senate|Diet|Riksdag|Folketinget|Eduskunta|Tweede Kamer|Eerste Kamer|Sejm|Oireachtas|Nationalrat|Chamber of Deputies|Knesset|Legislature|Legislative (Assembly|Council)|National Assembly|State Senate|State Assembly)\b/i,
  },
  // ── gazette ─────────────────────────────────────────────────────
  {
    type: "gazette",
    confidence: "high",
    hostsRegex:
      /(^|\.)(federalregister\.gov|regulations\.gov|eur-lex\.europa\.eu|egazette\.gov\.in|flk\.npc\.gov\.cn|legislation\.gov\.uk|sso\.agc\.gov\.sg|elaw\.klri\.re\.kr|bcn\.cl\/leychile|gov\.br\/.*diario-oficial|imprensanacional\.gov\.br|boe\.es|gazzettaufficiale\.it|moniteur\.be|amtsgericht|amtsblatt|journal-officiel\.gouv\.fr|legifrance\.gouv\.fr)/i,
    namesRegex:
      /\b(Gazette|Federal Register|Official Journal|EUR-Lex|Diário Oficial|Diario Oficial|Journal Officiel|Legifrance|BOE|Statutes Online|Legislation\.gov\.uk|National Database of Laws)\b/i,
  },
  // ── treaty_org ──────────────────────────────────────────────────
  {
    type: "treaty_org",
    confidence: "high",
    hostsRegex:
      /(^|\.)(imo\.org|icao\.int|unfccc\.int|oecd\.org|itf-oecd\.org|worldbank\.org|iea\.org|irena\.org|unece\.org|unep\.org|wmo\.int|fao\.org|iucn\.org|wto\.org)/i,
    namesRegex:
      /\b(International Maritime Organization|International Civil Aviation Organization|UNFCCC|International Energy Agency|IRENA|UNEP|World Bank|OECD|UN Economic Commission|World Trade Organization|World Meteorological)\b/i,
  },
  // ── standards_body ─────────────────────────────────────────────
  {
    type: "standards_body",
    confidence: "high",
    hostsRegex:
      /(^|\.)(iso\.org|iec\.ch|ghgprotocol\.org|smartfreightcentre\.org|sciencebasedtargets\.org|ifrs\.org)/i,
    namesRegex:
      /\b(ISO 14083|ISO\/IEC|GHG Protocol|GLEC Framework|Smart Freight Centre|Science Based Targets|SBTi|IFRS|ISSB|CORSIA|MEPC standards)\b/i,
  },
  // ── industry_assoc ─────────────────────────────────────────────
  {
    type: "industry_assoc",
    confidence: "high",
    hostsRegex:
      /(^|\.)(fiata\.org|iata\.org|clecat\.org|iru\.org|tiaca\.org|espo\.be|aapa-ports\.org|cdp\.net)/i,
    namesRegex:
      /\b(FIATA|IATA|CLECAT|IRU|TIACA|International Federation of Freight Forwarders|Road Transport Union|Air Cargo Association|European Sea Ports|American Association of Port Authorities|CDP)\b/i,
  },
  // ── research_institute ─────────────────────────────────────────
  {
    type: "research_institute",
    confidence: "high",
    hostsRegex:
      /(^|\.)(theicct\.org|climate\.law\.columbia\.edu|tyndall\.ac\.uk|mit\.edu|nrel\.gov|lse\.ac\.uk|climate-laws\.org|ecolex\.org|sei\.org|wri\.org|c2es\.org|rff\.org|cmcc\.it)/i,
    namesRegex:
      /\b(MIT|NREL|Tyndall|Stockholm Environment Institute|ICCT|Sabin Center|Grantham|Climate Change Laws|ECOLEX|World Resources Institute|Resources for the Future|Center for Climate)\b/i,
  },
  // ── news ───────────────────────────────────────────────────────
  {
    type: "news",
    confidence: "high",
    hostsRegex:
      /(^|\.)(freightwaves\.com|lloydslist\.com|theloadstar\.com|splash247\.com|joc\.com|tradewindsnews\.com|reuters\.com|bloomberg\.com)/i,
    namesRegex:
      /\b(FreightWaves|Lloyd's List|The Loadstar|Splash247|JOC|TradeWinds|Reuters|Bloomberg|Argus Media)\b/i,
  },
  // ── data_aggregator ─────────────────────────────────────────────
  {
    type: "data_aggregator",
    confidence: "high",
    hostsRegex:
      /(^|\.)(carbonpricingdashboard\.worldbank\.org|regintel-content\.thomsonreuters\.com|eia\.gov\/opendata|iea\.org\/policies|cdp\.net|mrv\.emsa\.europa\.eu)/i,
    namesRegex:
      /\b(Carbon Pricing Dashboard|Regulatory Intelligence|Open Data|Policies and Measures|MRV|THETIS-MRV)\b/i,
  },
  // ── regulatory_executive (medium confidence — needs review when
  //    co-tagged with environmental_body) ──────────────────────────
  {
    type: "regulatory_executive",
    confidence: "medium",
    hostsRegex:
      /(^|\.)(dot\.gov|faa\.gov|fmcsa\.dot\.gov|cbp\.gov|ferc\.gov|emsa\.europa\.eu|easa\.europa\.eu|mlit\.go\.jp|mof\.go\.jp|customs\.gov|coastguard|maritime|aviation\.gov)/i,
    namesRegex:
      /\b(Department of Transportation|Federal Aviation Administration|Customs and Border Protection|Coast Guard|Maritime Administration|Aviation Authority|EMSA|EASA|Civil Aviation Authority|FERC|Energy Regulatory)\b/i,
  },
  // ── judiciary ───────────────────────────────────────────────────
  {
    type: "judiciary",
    confidence: "high",
    hostsRegex: /(^|\.)(curia\.europa\.eu|supremecourt\.gov|courts\.gov)/i,
    namesRegex:
      /\b(Court of Justice|Supreme Court|General Court|Tribunal|Constitutional Court)\b/i,
  },
];

// Tier-based fallbacks — applied only if no rule fired
function tierFallback(row) {
  if (row.tier === 6) {
    return { type: "news", confidence: "medium" };
  }
  return null;
}

function deriveSourceType(row) {
  const text = `${row.name || ""} ${row.url || ""}`;
  const host = (() => {
    try {
      return new URL(row.url || "").hostname;
    } catch {
      return "";
    }
  })();

  const hits = []; // { type, confidence, matched_via }

  for (const rule of RULES) {
    const hostHit = rule.hostsRegex && rule.hostsRegex.test(host);
    const nameHit = rule.namesRegex && rule.namesRegex.test(text);
    if (hostHit || nameHit) {
      hits.push({
        type: rule.type,
        confidence: rule.confidence,
        matched_via: hostHit && nameHit ? "host+name" : hostHit ? "host" : "name",
      });
    }
  }

  if (hits.length === 0) {
    const fallback = tierFallback(row);
    if (fallback) {
      hits.push({
        type: fallback.type,
        confidence: fallback.confidence,
        matched_via: `tier=${row.tier}`,
      });
    }
  }

  // Deduplicate by type, prefer the highest-confidence hit per type.
  const byType = new Map();
  for (const hit of hits) {
    const existing = byType.get(hit.type);
    if (!existing || confidenceRank(hit.confidence) > confidenceRank(existing.confidence)) {
      byType.set(hit.type, hit);
    }
  }
  const final = Array.from(byType.values());

  // Row-level confidence is the WORST confidence across firing rules
  // (one medium hit drags a row to medium). No hits → low.
  let rowConfidence = "low";
  if (final.length > 0) {
    rowConfidence = final.every((h) => h.confidence === "high") ? "high" : "medium";
  }

  return {
    candidate_source_type: final.map((h) => h.type),
    confidence: rowConfidence,
    hit_detail: final,
  };
}

function confidenceRank(c) {
  return c === "high" ? 2 : c === "medium" ? 1 : 0;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("[investigate] fetching active+non-admin sources …");
  const { data, error } = await supabase
    .from("sources")
    .select("id, name, url, description, notes, tier, intelligence_types, jurisdictions")
    .eq("status", "active")
    .eq("admin_only", false);

  if (error) {
    console.error("[investigate] fetch failed:", error.message);
    process.exit(1);
  }
  if (!data) {
    console.error("[investigate] no data returned");
    process.exit(1);
  }

  console.log(`[investigate] classifying ${data.length} sources …`);

  const rows = data.map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    tier: row.tier,
    ...deriveSourceType(row),
  }));

  const summary = {
    generated_at: new Date().toISOString(),
    total_active_sources: rows.length,
    by_confidence: {
      high: rows.filter((r) => r.confidence === "high").length,
      medium: rows.filter((r) => r.confidence === "medium").length,
      low: rows.filter((r) => r.confidence === "low").length,
    },
    by_type_distribution: {},
    multi_type_rows: rows.filter((r) => r.candidate_source_type.length > 1).length,
    untyped_rows_low_confidence: rows.filter((r) => r.confidence === "low"),
    medium_confidence_rows: rows.filter((r) => r.confidence === "medium"),
    high_confidence_count_by_tier: {},
    sample_rows: rows.slice(0, 50),
    all_rows: rows,
  };

  // Type distribution
  for (const r of rows) {
    for (const t of r.candidate_source_type) {
      summary.by_type_distribution[t] = (summary.by_type_distribution[t] || 0) + 1;
    }
  }

  // High-confidence count by tier
  for (const r of rows.filter((x) => x.confidence === "high")) {
    summary.high_confidence_count_by_tier[r.tier] =
      (summary.high_confidence_count_by_tier[r.tier] || 0) + 1;
  }

  writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2), "utf8");
  console.log(`[investigate] wrote ${OUT_PATH}`);
  console.log("[investigate] summary:");
  console.log(`  total: ${summary.total_active_sources}`);
  console.log(`  high confidence: ${summary.by_confidence.high}`);
  console.log(`  medium confidence: ${summary.by_confidence.medium}`);
  console.log(`  low confidence (manual review): ${summary.by_confidence.low}`);
  console.log(`  multi-type rows: ${summary.multi_type_rows}`);
  console.log("  by type:");
  for (const [k, v] of Object.entries(summary.by_type_distribution)) {
    console.log(`    ${k}: ${v}`);
  }
}

main().catch((e) => {
  console.error("[investigate] fatal:", e);
  process.exit(1);
});
