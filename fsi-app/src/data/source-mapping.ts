/**
 * Legacy Resource → Source Mapping
 *
 * Maps each of the 119 legacy resource IDs to the source portal
 * they came from. This is the critical linkage that converts
 * orphaned manual entries into properly anchored intelligence items.
 *
 * A SOURCE is the portal where the legislation lives.
 * The resource URL is the direct link to that specific item
 * within the source portal.
 *
 * Mapping rules:
 * - URL domain determines the source (imo.org → IMO, eur-lex → EUR-Lex)
 * - If the URL points to a regulator page (e.g. ec.europa.eu), map to
 *   the relevant T2 source (EC DG CLIMA, EC CBAM Portal, etc.)
 * - If URL is from a standards body (iso.org, ghgprotocol.org), map
 *   to the T5 source
 * - Research items map to their institutional source
 */

export interface SourceMapping {
  source_name: string;     // Matches sources.name in seed-sources.sql
  source_url_pattern: string; // URL pattern to match against resource.url
}

/**
 * URL domain → source name mapping.
 * Order matters — more specific patterns match first.
 */
export const URL_TO_SOURCE: SourceMapping[] = [
  // T1: Official legal text
  { source_name: "EUR-Lex", source_url_pattern: "eur-lex.europa.eu" },
  { source_name: "Federal Register", source_url_pattern: "federalregister.gov" },
  { source_name: "UK Legislation", source_url_pattern: "legislation.gov.uk" },

  // T2: Regulator implementation
  { source_name: "EC DG CLIMA Shipping", source_url_pattern: "climate.ec.europa.eu" },
  { source_name: "EC CBAM Portal", source_url_pattern: "taxation-customs.ec.europa.eu" },
  { source_name: "THETIS-MRV", source_url_pattern: "mrv.emsa.europa.eu" },
  { source_name: "US EPA Emissions Regulations", source_url_pattern: "epa.gov" },
  { source_name: "European Commission Press Corner", source_url_pattern: "ec.europa.eu" },
  { source_name: "Council of the European Union Press", source_url_pattern: "consilium.europa.eu" },
  { source_name: "US DOE Clean Investment Monitor", source_url_pattern: "cleaninvestmentmonitor.org" },

  // T2: EU transport-specific
  { source_name: "EUR-Lex", source_url_pattern: "transport.ec.europa.eu" },
  { source_name: "EUR-Lex", source_url_pattern: "environment.ec.europa.eu" },

  // T3: Intergovernmental bodies
  { source_name: "International Maritime Organization", source_url_pattern: "imo.org" },
  { source_name: "International Civil Aviation Organization", source_url_pattern: "icao.int" },
  { source_name: "UNFCCC NDC Registry", source_url_pattern: "unfccc.int" },
  { source_name: "World Bank Carbon Pricing Dashboard", source_url_pattern: "carbonpricingdashboard.worldbank.org" },
  { source_name: "IEA Policies and Measures Database", source_url_pattern: "iea.org" },

  // T4: Expert analysis
  { source_name: "Climate Change Laws of the World", source_url_pattern: "climate-laws.org" },
  { source_name: "ECOLEX", source_url_pattern: "ecolex.org" },
  { source_name: "Sabin Center for Climate Change Law", source_url_pattern: "climate.law.columbia.edu" },
  { source_name: "European Environment Agency", source_url_pattern: "eea.europa.eu" },
  { source_name: "ICCT Freight", source_url_pattern: "theicct.org" },
  { source_name: "International Transport Forum", source_url_pattern: "itf-oecd.org" },

  // T5: Standards and industry
  { source_name: "ISO 14083", source_url_pattern: "iso.org" },
  { source_name: "Smart Freight Centre / GLEC Framework", source_url_pattern: "smartfreightcentre.org" },
  { source_name: "GHG Protocol", source_url_pattern: "ghgprotocol.org" },
  { source_name: "Science Based Targets initiative", source_url_pattern: "sciencebasedtargets.org" },
  { source_name: "CDP Supply Chain", source_url_pattern: "cdp.net" },
  { source_name: "IFRS / ISSB Sustainability Standards", source_url_pattern: "ifrs.org" },
  { source_name: "FIATA Sustainability", source_url_pattern: "fiata.org" },
  { source_name: "IRU Environment", source_url_pattern: "iru.org" },

  // T7: Research
  { source_name: "MIT Climate Machine", source_url_pattern: "climatemachine.mit.edu" },
  { source_name: "MIT Center for Transportation and Logistics", source_url_pattern: "ctl.mit.edu" },
  { source_name: "Tyndall Centre for Climate Research", source_url_pattern: "tyndall.ac.uk" },
  { source_name: "Julie's Bicycle", source_url_pattern: "juliesbicycle.com" },
  { source_name: "REVERB", source_url_pattern: "reverb.org" },

  // Market/data sources
  { source_name: "ICAP Allowance Price Explorer", source_url_pattern: "icapcarbonaction.com" },
  { source_name: "US EIA Open Data API", source_url_pattern: "eia.gov" },
  { source_name: "MarineTraffic", source_url_pattern: "marinetraffic.com" },

  // UK Government
  { source_name: "UK Government", source_url_pattern: "gov.uk" },

  // US Government agencies
  { source_name: "US DOT", source_url_pattern: "transportation.gov" },
  { source_name: "US DOE", source_url_pattern: "driveelectric.gov" },
  { source_name: "NREL", source_url_pattern: "nrel.gov" },

  // California
  { source_name: "CARB", source_url_pattern: "arb.ca.gov" },

  // Intergovernmental
  { source_name: "WTO", source_url_pattern: "wto.org" },
  { source_name: "OECD", source_url_pattern: "oecd.org" },
  { source_name: "UNCTAD", source_url_pattern: "unctad.org" },
  { source_name: "IPCC", source_url_pattern: "ipcc.ch" },
  { source_name: "UN SDGs", source_url_pattern: "sdgs.un.org" },
  { source_name: "World Bank", source_url_pattern: "worldbank.org" },
  { source_name: "IDB", source_url_pattern: "iadb.org" },
  { source_name: "ADB", source_url_pattern: "adb.org" },

  // Regional government portals
  { source_name: "Singapore MPA", source_url_pattern: "mpa.gov.sg" },
  { source_name: "Singapore Green Plan", source_url_pattern: "greenplan.gov.sg" },
  { source_name: "Japan MLIT", source_url_pattern: "mlit.go.jp" },
  { source_name: "South Korea MOF", source_url_pattern: "mof.go.kr" },
  { source_name: "Australia CCA", source_url_pattern: "climatechangeauthority.gov.au" },
  { source_name: "Germany BMDV", source_url_pattern: "bmdv.bund.de" },
  { source_name: "Norway Government", source_url_pattern: "regjeringen.no" },
  { source_name: "Brazil Government", source_url_pattern: "gov.br" },
  { source_name: "Mexico SEMARNAT", source_url_pattern: "gob.mx/semarnat" },
  { source_name: "Colombia Transport", source_url_pattern: "mintransporte.gov.co" },

  // IRENA
  { source_name: "IRENA", source_url_pattern: "irena.org" },

  // Industry and research
  { source_name: "GRI Standards", source_url_pattern: "globalreporting.org" },
  { source_name: "EcoVadis", source_url_pattern: "ecovadis.com" },
  { source_name: "Carbon Trust", source_url_pattern: "carbontrust.com" },
  { source_name: "WRI", source_url_pattern: "wri.org" },
  { source_name: "WEF", source_url_pattern: "weforum.org" },
  { source_name: "DP World", source_url_pattern: "dpworld.com" },
  { source_name: "Port of LA", source_url_pattern: "portoflosangeles.org" },
  { source_name: "ESPO", source_url_pattern: "espo.be" },
  { source_name: "Lloyd's Register", source_url_pattern: "lr.org" },
  { source_name: "ASEAN", source_url_pattern: "asean.org" },
  { source_name: "CER Railways", source_url_pattern: "cer.be" },
  { source_name: "Clean Trucking Alliance", source_url_pattern: "cleantruckingalliance.org" },
  { source_name: "ATA", source_url_pattern: "trucking.org" },
  { source_name: "Sustainable Packaging Coalition", source_url_pattern: "sustainablepackaging.org" },
  { source_name: "Getting to Zero Coalition", source_url_pattern: "getzerocoalition.org" },
  { source_name: "Zero Carbon Shipping", source_url_pattern: "zerocarbonshipping.com" },
  { source_name: "MIT CTL", source_url_pattern: "ctl.mit.edu" },

  // Trade press and news (T6)
  { source_name: "FreightWaves", source_url_pattern: "freightwaves.com" },
  { source_name: "The Loadstar", source_url_pattern: "theloadstar.com" },
  { source_name: "JOC", source_url_pattern: "joc.com" },
  { source_name: "Reuters", source_url_pattern: "reuters.com" },
  { source_name: "GreenBiz", source_url_pattern: "greenbiz.com" },
  { source_name: "Aviation Week", source_url_pattern: "aviationweek.com" },
  { source_name: "Splash247", source_url_pattern: "splash247.com" },

  // Catch-all for EU regulation URLs
  { source_name: "EUR-Lex", source_url_pattern: "europa.eu" },
];

/**
 * Given a resource URL, find the matching source name.
 * Returns null if no match found (resource needs manual mapping).
 */
export function findSourceForUrl(url: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  for (const mapping of URL_TO_SOURCE) {
    if (lower.includes(mapping.source_url_pattern)) {
      return mapping.source_name;
    }
  }
  return null;
}

/**
 * Generate a migration report showing which resources map to which sources.
 * Used during the migration process to verify all 119 resources are linked.
 */
export function generateMigrationReport(
  resources: { id: string; title: string; url: string }[]
): { mapped: { id: string; title: string; source: string; url: string }[]; unmapped: { id: string; title: string; url: string }[] } {
  const mapped: { id: string; title: string; source: string; url: string }[] = [];
  const unmapped: { id: string; title: string; url: string }[] = [];

  for (const r of resources) {
    const source = findSourceForUrl(r.url);
    if (source) {
      mapped.push({ id: r.id, title: r.title, source, url: r.url });
    } else {
      unmapped.push({ id: r.id, title: r.title, url: r.url });
    }
  }

  return { mapped, unmapped };
}
