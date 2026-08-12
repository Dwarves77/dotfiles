// The source licence register. WHAT WE MAY LEGALLY EMBED AND RE-SERVE.
//
// WHY THIS FILE EXISTS. The v1 build ships STATIC SEED DATA rather than live APIs, which is the right
// call: it removes runtime dependencies and it is cheaper. But it moves the risk. Reading an open
// dataset is not the same act as embedding it in a database and re-serving it to paying customers, and a
// licence verification pass on 2026-08-12 found that several datasets an initial seed plan named are
// NOT redistributable. Two of them were the centre of that plan.
//
// The distinction that matters, and the one "is it free?" hides, is THREE separate questions:
//   (a) may we REDISTRIBUTE / re-serve it to paying customers?
//   (b) may we embed it in a COMMERCIAL product?
//   (c) what ATTRIBUTION must ship with it?
// A dataset can be free to download and still fail (a) and (b). IEA is the clearest example: free to
// read, explicitly prohibited from redistribution.
//
// THIS IS A GATE, NOT A MEMO. `mayEmbedAsSeed()` is called by the seed loader, which refuses to load a
// red-listed source. A licence policy that lives in a document gets violated by whoever writes the next
// importer at 11pm; a licence policy that throws does not.
//
// NOT LEGAL ADVICE. This register records what published terms SAY, with the URL and the date read, so a
// lawyer can check our reasoning rather than reconstruct it. Every AMBER entry names the question to ask
// and who to ask. Where terms could not be read, the entry is `unverified` and the gate treats
// unverified as REFUSED — the safe default, because the cost of wrongly excluding a dataset is a gap in
// coverage and the cost of wrongly including one is a takedown or a claim.
//
// PLAIN ESM, ZERO DEPENDENCIES, importable by node --test.

/**
 * Redistribution verdict.
 *
 * `permitted`  — an explicit open licence covering commercial redistribution.
 * `conditional`— permitted subject to an act we must actually perform (notify, register, accredit).
 *                Conditional is NOT permitted until the condition is discharged and recorded.
 * `prohibited` — explicit terms against it, or licensed-only.
 * `unverified` — terms not read, or unclear. TREATED AS PROHIBITED by the gate.
 */
export const REDISTRIBUTION = Object.freeze({
  permitted: Object.freeze({ code: "permitted", label: "Redistribution permitted", embeddable: true, order: 1 }),
  conditional: Object.freeze({ code: "conditional", label: "Conditional", embeddable: false, order: 2 }),
  unverified: Object.freeze({ code: "unverified", label: "Terms unverified", embeddable: false, order: 3 }),
  prohibited: Object.freeze({ code: "prohibited", label: "Redistribution prohibited", embeddable: false, order: 4 }),
});

/**
 * THE REGISTER. Verified 2026-08-12 against the URL in each entry.
 *
 * `attribution` is the string that must ship WITH the data, not in a colophon nobody reads. Where a
 * licence prescribes exact wording, that wording is reproduced verbatim.
 */
export const SOURCE_LICENCES = Object.freeze({
  // ─────────────────────────── GREEN: embeddable ───────────────────────────
  desnz_ghg_factors: {
    key: "desnz_ghg_factors", name: "UK DESNZ/Defra GHG conversion factors",
    redistribution: "permitted", licence: "OGL v3.0",
    attribution: "Contains public sector information licensed under the Open Government Licence v3.0.",
    url: "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
    verifiedOn: "2026-08-12",
    note: "THE substitute for GLEC/ISO default factors. Freight tonne-km factors by mode and vehicle class, "
        + "WTT and TTW separated, refrigerant GWPs. OGL v3.0 expressly permits commercial exploitation AND "
        + "sub-licensing, which is the rare combination we need.",
  },
  eurostat: {
    key: "eurostat", name: "Eurostat", redistribution: "permitted", licence: "CC BY 4.0 (Decision 2011/833/EU)",
    attribution: "Source: Eurostat",
    url: "https://ec.europa.eu/eurostat/about-us/policies/copyright", verifiedOn: "2026-08-12",
    note: "Modifications must be flagged to the end user, and a transformation must not imply Eurostat endorsement.",
  },
  eia: {
    key: "eia", name: "US Energy Information Administration", redistribution: "permitted",
    licence: "US public domain (17 USC 105)", attribution: "Source: U.S. Energy Information Administration",
    url: "https://www.eia.gov/about/copyrights_reuse.php", verifiedOn: "2026-08-12",
    note: "Attribution requested, not compelled. The EIA logo IS a trademark: do not use it.",
  },
  bls: {
    key: "bls", name: "US Bureau of Labor Statistics", redistribution: "permitted",
    licence: "US public domain", attribution: "Source: U.S. Bureau of Labor Statistics",
    url: "https://www.bls.gov/bls/linksite.htm", verifiedOn: "2026-08-12",
    note: "Covers OEWS occupation wages, QCEW county wages, ECEC benefit loading.",
  },
  ember: {
    key: "ember", name: "Ember", redistribution: "permitted", licence: "CC BY 4.0",
    attribution: "Source: Ember, licensed under CC BY 4.0",
    url: "https://ember-energy.org/creative-commons/", verifiedOn: "2026-08-12",
    note: "Grid carbon intensity, the IEA substitute. AMBER SUB-QUESTION: Ember compiles from upstream "
        + "sources including EIA, Eurostat and the Energy Institute. Its CC-BY covers ITS compilation; "
        + "confirm no ingested series is an IEA pass-through.",
  },
  eea: {
    key: "eea", name: "European Environment Agency", redistribution: "permitted", licence: "CC BY 4.0",
    attribution: "Source: European Environment Agency (EEA), licensed under CC BY 4.0",
    url: "https://www.eea.europa.eu/en/legal-notice", verifiedOn: "2026-08-12",
    note: "Explicitly includes commercial purposes. Must not distort the original meaning. Third-party "
        + "content inside EEA products is carved out and must be checked per dataset.",
  },
  eurlex: {
    key: "eurlex", name: "EUR-Lex / Official Journal", redistribution: "permitted",
    licence: "CC BY 4.0 (Decision 2011/833/EU)",
    attribution: "© European Union, https://eur-lex.europa.eu — reused under Decision 2011/833/EU. "
               + "Only the Official Journal of the European Union is authentic.",
    url: "https://commission.europa.eu/legal-notice_en", verifiedOn: "2026-08-12",
    note: "The authenticity caveat is not optional: we must never imply our copy is the authentic text. "
        + "UNVERIFIED: the EUR-Lex-specific notice wording (page returned navigation only); the notice "
        + "above is built from the Commission legal notice plus the standard OJ authenticity clause.",
  },
  gleif_lei: {
    key: "gleif_lei", name: "GLEIF LEI", redistribution: "permitted", licence: "CC0 1.0",
    attribution: null,
    url: "https://www.gleif.org/en/meta/lei-data-terms-of-use", verifiedOn: "2026-08-12",
    note: "No attribution required. Must not imply GLEIF endorsement. The clean legal-entity key, and the "
        + "reason organisation identity keys on LEI rather than on a licensed carrier code.",
  },
  pvgis: {
    key: "pvgis", name: "PVGIS (JRC)", redistribution: "permitted", licence: "No restrictions stated",
    attribution: "Source: PVGIS, European Commission Joint Research Centre",
    url: "https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/general-information/usage-conditions-data-protection_en",
    verifiedOn: "2026-08-12",
    note: "JRC states PVGIS output is unrestricted. If we embed raw irradiance rather than PVGIS-COMPUTED "
        + "PV output, the upstream CM SAF / ERA5 terms apply instead and must be checked.",
  },
  worldbank: {
    key: "worldbank", name: "World Bank datasets (excl. CPPI)", redistribution: "permitted",
    licence: "CC BY 4.0", attribution: "The World Bank",
    url: "https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets", verifiedOn: "2026-08-12",
    note: "The acknowledgment obligation must FLOW DOWN to our customers in our own terms if they can "
        + "re-use the data. CPPI is a separate, amber entry.",
  },
  epa_egrid: {
    key: "epa_egrid", name: "US EPA eGRID and GHG Emission Factors Hub", redistribution: "permitted",
    licence: "US public domain", attribution: "Source: U.S. Environmental Protection Agency",
    url: "https://www.epa.gov/egrid", verifiedOn: "2026-08-12",
    note: "US grid subregion factors and US-specific emission factors. Pairs with DESNZ for global coverage.",
  },
  nga_wpi: {
    key: "nga_wpi", name: "NGA World Port Index", redistribution: "permitted", licence: "US public domain",
    attribution: "Source: US National Geospatial-Intelligence Agency, World Port Index",
    url: "https://msi.nga.mil/Publications/WPI", verifiedOn: "2026-08-12",
    note: "The UN/LOCODE substitute for PORTS, with coordinates and facility attributes.",
  },
  geonames: {
    key: "geonames", name: "GeoNames", redistribution: "permitted", licence: "CC BY 4.0",
    attribution: "Source: GeoNames, licensed under CC BY 4.0",
    url: "https://www.geonames.org/about.html", verifiedOn: "2026-08-12",
    note: "General place gazetteer, the other half of the UN/LOCODE substitute.",
  },
  wikidata: {
    key: "wikidata", name: "Wikidata", redistribution: "permitted", licence: "CC0 1.0", attribution: null,
    url: "https://www.wikidata.org/wiki/Wikidata:Licensing", verifiedOn: "2026-08-12",
    note: "Carries UN/LOCODE values as statements under CC0. Useful as an ALIAS RESOLVER: we resolve a "
        + "customer-supplied LOCODE to our own node key without publishing the LOCODE list ourselves.",
  },
  emsa_thetis_mrv: {
    key: "emsa_thetis_mrv", name: "EMSA THETIS-MRV", redistribution: "conditional",
    licence: "EMSA site disclaimer, no dataset-specific licence found",
    attribution: "Source: EMSA THETIS-MRV. Reproduced with acknowledgement of source.",
    url: "https://www.emsa.europa.eu/disclaimer.html", verifiedOn: "2026-08-12",
    askWho: "EMSA information desk, and DG CLIMA Unit B2 (maritime MRV)",
    askWhat: "Does the THETIS-MRV public emission report fall under the EU reuse policy "
           + "(Decision 2011/833/EU / CC BY 4.0)?",
    note: "Strong argument for reuse: publication is a LEGAL OBLIGATION on the Commission under "
        + "Regulation (EU) 2015/757 Art. 21, i.e. it exists to be public. But no dataset licence was "
        + "found, so it stays conditional until confirmed in writing. This is the highest-value amber "
        + "entry: it is the substitute for Clean Cargo carrier factors AND the lawful source of IMO "
        + "numbers, so discharging it unlocks two red entries.",
  },
  worldbank_cppi: {
    key: "worldbank_cppi", name: "World Bank Container Port Performance Index", redistribution: "conditional",
    licence: "CC BY 3.0 IGO with third-party carve-out",
    attribution: "The World Bank, Container Port Performance Index. License: CC BY 3.0 IGO.",
    url: "https://documents1.worldbank.org/curated/en/099060324114539683/txt/P175833-38923075-0337-4387-be64-a5ea7b90e0e6.txt",
    verifiedOn: "2026-08-12",
    askWho: "World Bank Transport Global Practice (CPPI team), pubrights@worldbank.org",
    askWhat: "Does CC BY 3.0 IGO extend to the CPPI index scores and rankings TABLE, or only the narrative?",
    note: "CPPI is co-produced with S&P Global Market Intelligence and the rights notice puts the burden of "
        + "clearing third-party components on the reuser. Interim position: cite rankings sparingly with "
        + "full attribution; do NOT ship the table as a queryable dataset.",
  },
  clean_cargo_aggregate: {
    key: "clean_cargo_aggregate", name: "Clean Cargo aggregate trade-lane averages (public report)",
    redistribution: "conditional", licence: "Proprietary, notification-based",
    attribution: "Smart Freight Centre is acknowledged as the source.",
    url: "https://smart-freight-centre-media.s3.amazonaws.com/documents/Clean_Cargo_-_2023_Global_Ocean_Container_Emissions_Report.pdf",
    verifiedOn: "2026-08-12",
    askWho: "info@smartfreightcentre.org",
    askWhat: "Does the report's written-notification clause operate as a standing licence for a SaaS "
           + "product, or will SFC require a commercial agreement? Also: is the clause still present in "
           + "the current edition?",
    note: "The 2023 report permits resale/commercial use PROVIDED written notification is given in "
        + "advance, i.e. notice rather than consent. Notice must actually be SENT and recorded before this "
        + "moves to permitted. Note the SFC-internal inconsistency: GLEC requires permission, this "
        + "requires only notification, and the stricter clause governs the GLEC tables.",
  },

  // ─────────────────────────── RED: must not embed ───────────────────────────
  glec_framework: {
    key: "glec_framework", name: "GLEC Framework default emission factor tables",
    redistribution: "prohibited", licence: "Proprietary, © Smart Freight Centre",
    attribution: null,
    url: "https://smart-freight-centre-media.s3.amazonaws.com/documents/GLEC_FRAMEWORK_v3.2_21_10_25_1.pdf",
    verifiedOn: "2026-08-12",
    blocker: "\"No use of this publication may be made for resale or for any other commercial purpose "
           + "whatsoever, without prior permission in writing from Smart Freight Centre.\" Free to "
           + "download is not free to reuse.",
    substitute: "desnz_ghg_factors",
    note: "CRITICAL DISTINCTION, and the thing that saves the build: the METHOD is not protected, the "
        + "TABLES and TEXT are. We can be GLEC-conformant in method while populating it from OGL and "
        + "public-domain factors. SFC accreditation may be the legitimate route to the tables, but "
        + "accreditation is UNVERIFIED as conveying a data licence and must not be assumed to.",
  },
  iso_14083: {
    key: "iso_14083", name: "EN ISO 14083:2023 default values and tables",
    redistribution: "prohibited", licence: "ISO single registered end-user licence",
    attribution: null, url: "https://www.iso.org/terms-conditions-licence-agreement.html",
    verifiedOn: "2026-08-12",
    blocker: "The strictest terms in the set. A single NAMED end-user licence that cannot be shared even "
           + "within our own legal entity, and \"integration, embedding, encoding, structuring, "
           + "transformation, or operationalization of the ISO Publication within any digital or "
           + "software-based environment\" requires SEPARATE licensing. Structured extraction and text/data "
           + "mining are also barred.",
    substitute: "desnz_ghg_factors",
    note: "Buy ONE copy for a named engineer to read. Implement the calculation logic, which is not "
        + "copyrightable. Never ship its tables or text.",
  },
  clean_cargo_carrier: {
    key: "clean_cargo_carrier", name: "Clean Cargo carrier-specific trade-lane factors",
    redistribution: "prohibited", licence: "Members-only platform",
    attribution: null, url: "https://www.bsr.org/files/clean-cargo/BSR-Clean-Cargo-Emissions-Report-2021.pdf",
    verifiedOn: "2026-08-12",
    blocker: "Carrier-specific factors are \"only accessible to members\". No public licence. Whether a "
           + "member may re-serve them to its own customers is UNVERIFIED, and membership cost is unpublished.",
    substitute: "emsa_thetis_mrv",
    note: "The Tier 2 slot in the factor hierarchy is DESIGNED for this and stays EMPTY until a membership "
        + "with redistribution rights exists. The schema is pre-wired; the data is not seeded.",
  },
  iea_datasets: {
    key: "iea_datasets", name: "IEA datasets (end-use prices, grid factors, data annexes)",
    redistribution: "prohibited", licence: "IEA Terms of Use for Non-CC Material",
    attribution: null, url: "https://www.iea.org/terms/terms-of-use-for-non-cc-material",
    verifiedOn: "2026-08-12",
    blocker: "Explicit and describes our exact use case: prohibits disseminating in entirety free or for a "
           + "fee, prohibits databases \"substantially derived from\" the material or that \"could "
           + "constitute a substitute\", and caps downloadable raw data at five data points.",
    substitute: "ember",
    note: "NUANCE WORTH KEEPING: IEA NARRATIVE content (reports, articles, standalone graphs) IS CC BY 4.0. "
        + "The prohibition is specifically on datasets, data explorers, data annexes, the Oil Market "
        + "Report and the Policies and Measures databases. We may cite IEA prose; we may not seed IEA data.",
  },
  un_locode: {
    key: "un_locode", name: "UN/LOCODE", redistribution: "prohibited",
    licence: "UN Terms and Conditions of Use", attribution: null,
    url: "https://unlocode.unece.org/terms", verifiedOn: "2026-08-12",
    blocker: "\"personal, non-commercial use, without any right to resell or redistribute them\", and "
           + "compiling or creating derivative works is prohibited. No open licence exists anywhere.",
    substitute: "nga_wpi",
    note: "THE SURPRISE. LOCODE was assumed safe and is not. Counter-arguments exist (a code list is thin "
        + "factual data, arguably uncopyrightable; it is embedded in every logistics platform; no known "
        + "enforcement) but they are arguments for counsel, not a licence. WORKABLE POSTURE: treat LOCODE "
        + "as an INPUT ALIAS we resolve against, never a dataset we publish. Our node keys are our own, "
        + "populated from NGA WPI + GeoNames + Wikidata. A customer-supplied LOCODE resolves to our key. "
        + "Cheap next step: ask UNECE in writing for confirmation of commercial reuse.",
  },
  scac: {
    key: "scac", name: "SCAC codes (NMFTA)", redistribution: "prohibited", licence: "NMFTA proprietary + ®",
    attribution: null, url: "https://nmfta.org/scac/scac-ip/", verifiedOn: "2026-08-12",
    blocker: "\"No part of the SCAC database may be reproduced or utilized in any form or by any means… "
           + "without written permission from NMFTA\", and may not be \"made accessible in any form to any "
           + "outside parties\" without a licence.",
    substitute: "gleif_lei",
    note: "No open substitute exists. DESIGN RULE: SCAC is an OPTIONAL CUSTOMER-SUPPLIED FIELD they "
        + "populate under their own NMFTA licence, never a column we seed. US road carrier identity keys "
        + "on FMCSA USDOT/MC numbers (public domain) plus LEI.",
  },
  iata_codes: {
    key: "iata_codes", name: "IATA airline designators and location identifiers",
    redistribution: "prohibited", licence: "IATA subscription licence", attribution: null,
    url: "https://www.iata.org/contentassets/da0281244bb942feb143a22b0e6b7179/iata-airline-designators-and-location-identifiers--terms-conditions.pdf",
    verifiedOn: "2026-08-12",
    blocker: "The clearest prohibition in the set, and it names our use twice: no redistribution "
           + "\"including without limitation, its clients\", and \"use or integration of the Codes in any "
           + "commercial product or service… is strictly prohibited\".",
    substitute: "gleif_lei",
    note: "OurAirports and OpenFlights publish IATA codes as factual data but cannot grant rights IATA "
        + "asserts, so relying on them does not cure the claim, it only obscures the trail. Prefer ICAO "
        + "codes where possible and airline LEI for identity. If commercially necessary, BUY the "
        + "subscription — it is a known, budgetable cost, not a legal grey area.",
  },
  imo_register: {
    key: "imo_register", name: "IMO ship numbers via the S&P Global register",
    redistribution: "prohibited", licence: "S&P Global permitted-use terms", attribution: null,
    url: "https://www.imonumbers.ihs.com/Home/DataUse", verifiedOn: "2026-08-12",
    blocker: "\"not permitted to use these Numbers in any commercial database, commercial web-site or "
           + "commercial data product\" without prior written agreement; automated extraction \"strictly "
           + "forbidden\".",
    substitute: "emsa_thetis_mrv",
    note: "ELEGANT FIX: acquire IMO numbers from EMSA THETIS-MRV and EU ETS MRV publications, which "
        + "publish them as part of a STATUTORILY MANDATED disclosure. The S&P terms bind users of S&P's "
        + "site; they do not reach identifiers we obtained from the EU's own legal publication. Using an "
        + "IMO number as a foreign key is a different act from redistributing S&P's register.",
  },
  sbti_dashboard: {
    key: "sbti_dashboard", name: "SBTi Target Dashboard", redistribution: "prohibited",
    licence: "No data licence published", attribution: null,
    url: "https://sciencebasedtargets.org/reports/sbti-monitoring-report-2022/important-notice",
    verifiedOn: "2026-08-12",
    blocker: "\"This does not represent a license to repackage or resell any of the data\"; express "
           + "permission required from BOTH SBTi and CDP.",
    substitute: null,
    note: "Costs nothing to ask, and SBTi may grant it. Until then the diffusion/lead-time engine cannot "
        + "seed from the dashboard. Do NOT substitute CDP: its terms are at least as restrictive.",
  },
});

export const SOURCE_KEYS = Object.freeze(Object.keys(SOURCE_LICENCES));

/** Look up a register entry. */
export function licenceFor(sourceKey) {
  return SOURCE_LICENCES[sourceKey] ?? null;
}

/**
 * THE GATE. May this source be embedded as seed data and re-served to paying customers?
 *
 * Fails CLOSED on an unknown key, because an importer referencing a source nobody registered is exactly
 * the path by which unlicensed data enters a product.
 */
export function mayEmbedAsSeed(sourceKey) {
  const e = SOURCE_LICENCES[sourceKey];
  if (!e) return false;
  return REDISTRIBUTION[e.redistribution]?.embeddable === true;
}

/**
 * Assert the gate, with an actionable message. Called by the seed loader; refuses rather than warns.
 * A conditional source names the condition; a prohibited one names its substitute.
 */
export function assertEmbeddable(sourceKey) {
  const e = SOURCE_LICENCES[sourceKey];
  if (!e) {
    throw new Error(
      `unregistered data source "${sourceKey}": add it to SOURCE_LICENCES with its verified terms before seeding. ` +
      `Unregistered sources fail closed by design.`
    );
  }
  if (mayEmbedAsSeed(sourceKey)) return true;
  const sub = e.substitute ? ` Licence-safe substitute: "${e.substitute}".` : "";
  const ask = e.askWhat ? ` To discharge: ask ${e.askWho} — ${e.askWhat}` : "";
  throw new Error(
    `source "${sourceKey}" is ${e.redistribution} for embedding: ${e.blocker || e.note || "see register"}${sub}${ask}`
  );
}

/** The attribution string that must ship with this source's data, or null when none is required. */
export function attributionFor(sourceKey) {
  return SOURCE_LICENCES[sourceKey]?.attribution ?? null;
}

/**
 * Every distinct attribution string for a set of sources, deduplicated and sorted. Rendered with the
 * data, not buried in a colophon: CC-BY requires attribution "in the manner specified", and a footer on
 * a different page does not satisfy it.
 */
export function attributionsFor(sourceKeys) {
  const out = new Set();
  for (const k of sourceKeys || []) {
    const a = attributionFor(k);
    if (a) out.add(a);
  }
  return [...out].sort();
}

/**
 * SQL parity for the register. Emits the `data_sources` seed consumed by migration 258.
 *
 * WHY GENERATED RATHER THAN HAND-WRITTEN. The incoming draft DDL hand-listed seven sources. The register
 * holds twenty-six. A hand-written seed is a SECOND copy of the licence verdicts, and the moment the two
 * disagree the database gate and the application gate enforce different policies while both look correct
 * in isolation. That is the gate_a_* duplication F24 was built to catch, in a domain where the cost of
 * being wrong is a takedown rather than a stale cache.
 *
 * IDEMPOTENT BY CONSTRUCTION. ON CONFLICT DO UPDATE means re-running the migration after a register
 * change re-states the current verdicts rather than failing or silently keeping the old ones. Deliberately
 * NOT a DELETE-then-INSERT: emission_factors references data_sources, and a source removed from the
 * register must be resolved by a human deciding what happens to its factors, not by a cascade.
 */
export function renderDataSourceSeedSql() {
  const lit = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
  const rows = SOURCE_KEYS.map((k) => {
    const e = SOURCE_LICENCES[k];
    const embeddable = REDISTRIBUTION[e.redistribution]?.embeddable === true;
    return "  (" + [
      lit(e.key), lit(e.name), lit(e.redistribution), String(embeddable),
      lit(e.licence ?? null), lit(e.attribution ?? null), lit(e.url ?? null),
      e.verifiedOn ? `${lit(e.verifiedOn)}::date` : "NULL",
      lit(e.blocker ?? null), lit(e.askWho ?? null), lit(e.askWhat ?? null), lit(e.substitute ?? null),
    ].join(", ") + ")";
  }).join(",\n");

  const t = licenceTriage();
  return `-- GENERATED by src/lib/contracts/source-licence.mjs renderDataSourceSeedSql(). DO NOT EDIT BY HAND.
-- Drift-guarded: the guard regenerates this block and byte-compares against the migration.
-- Register verified 2026-08-12. ${SOURCE_KEYS.length} sources: ${t.green.length} embeddable, ${t.amber.length} conditional/unverified, ${t.red.length} prohibited.
INSERT INTO public.data_sources
  (source_key, name, redistribution, embeddable, licence, attribution, url, verified_on, blocker, ask_who, ask_what, substitute)
VALUES
${rows}
ON CONFLICT (source_key) DO UPDATE SET
  name          = EXCLUDED.name,
  redistribution= EXCLUDED.redistribution,
  embeddable    = EXCLUDED.embeddable,
  licence       = EXCLUDED.licence,
  attribution   = EXCLUDED.attribution,
  url           = EXCLUDED.url,
  verified_on   = EXCLUDED.verified_on,
  blocker       = EXCLUDED.blocker,
  ask_who       = EXCLUDED.ask_who,
  ask_what      = EXCLUDED.ask_what,
  substitute    = EXCLUDED.substitute;`;
}

/** The redistribution codes, ordered, for a CHECK constraint that cannot drift from REDISTRIBUTION. */
export const REDISTRIBUTION_CODES = Object.freeze(
  Object.values(REDISTRIBUTION).sort((a, b) => a.order - b.order).map((r) => r.code)
);

/** Register triage, for the seed plan and for review. */
export function licenceTriage() {
  const green = [], amber = [], red = [];
  for (const k of SOURCE_KEYS) {
    const r = SOURCE_LICENCES[k].redistribution;
    if (r === "permitted") green.push(k);
    else if (r === "prohibited") red.push(k);
    else amber.push(k);
  }
  return { green, amber, red };
}
