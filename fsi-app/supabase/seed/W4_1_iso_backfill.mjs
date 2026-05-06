// W4.1 — ISO backfill for existing intelligence_items
//
// Migration 033 backfilled `intelligence_items.jurisdiction_iso` for ~123 of
// 164 rows using a 13-mapping legacy table (us, eu, uk, global, sg, hk, jp,
// kr, cn, ca, au, imo, icao). The remaining ~41 rows have empty arrays
// because their `jurisdictions` legacy strings did not match any of those
// 13 keys (e.g. "Canada", "Brazil", "South Africa", or content-only hints
// such as "California" or "European Union" embedded in the brief).
//
// This script picks up where the migration stopped:
//
//   1. SELECT every intelligence_items row whose jurisdiction_iso array is
//      empty (or NULL).
//   2. For each row, derive a candidate ISO code list using THREE strategies
//      run in order:
//        (a) Legacy `jurisdictions` array — extended fuzzy mapping with
//            ~30 more country mappings beyond the 13 in migration 033.
//        (b) Source URL hostname hints (e.g. `*.ca.gov` → US-CA,
//            `*.gov.au` → AU, `eur-lex.europa.eu` → EU).
//        (c) Word-boundary regex over the first ~2000 chars of `full_brief`
//            (or `title`+`summary` if `full_brief` is empty).
//   3. UPDATE the row's `jurisdiction_iso` column. If no derivation succeeds
//      (all three strategies returned empty), fall back to ['GLOBAL'] —
//      better than empty, and the integrity_flag system can re-flag it for
//      human review later.
//   4. Write a per-row decision log to docs/W4-1-iso-backfill-log.json so
//      reviewers can spot bad inferences before they propagate.
//
// Idempotency: re-running the script is safe. The query at step 1 only
// returns rows whose jurisdiction_iso is still empty, so already-backfilled
// rows are skipped. Each UPDATE is bounded by the row's id.
//
// Scope guard: this script touches ONLY `intelligence_items.jurisdiction_iso`.
// It does NOT touch `sources`, `provisional_sources`, `staged_updates`, or
// `source_verifications` (those belong to W3 region batches running in
// parallel).
//
// Usage (from fsi-app/):
//   node supabase/seed/W4_1_iso_backfill.mjs

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

// ─── paths ─────────────────────────────────────────────────────────────────
// NOTE: env loading + supabase client creation are deferred into `main()` so
// that this module can be `import`-ed by W4.3 (orphan materializer) for the
// `deriveJurisdictionISO` helper without triggering env-file reads, DB
// client construction, or process.chdir.
const __dirname = dirname(fileURLToPath(import.meta.url));

const LOG_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "docs",
  "W4-1-iso-backfill-log.json"
);

// ─── Extended legacy → ISO mapping ─────────────────────────────────────────
// Keys are lowercased. The 13 from migration 033 PLUS the ~30 extensions
// listed in the W4 spec. ISO 3166-1 alpha-2 where applicable; supranational
// / IGO codes preserved (EU, GLOBAL, IMO, ICAO).
//
// IMPORTANT: matches are made case-insensitively against the legacy string
// AFTER trimming. We also perform a partial/contains match in
// `mapLegacyJurisdiction` below so that "us-california" or "european union"
// can both resolve.
export const LEGACY_TO_ISO = Object.freeze({
  // ─ migration 033 (kept) ─
  us: "US",
  eu: "EU",
  uk: "GB",
  global: "GLOBAL",
  singapore: "SG",
  "hong kong": "HK",
  japan: "JP",
  "south korea": "KR",
  china: "CN",
  canada: "CA",
  australia: "AU",
  imo: "IMO",
  icao: "ICAO",
  // ─ W4 extensions ─
  spain: "ES",
  germany: "DE",
  france: "FR",
  brazil: "BR",
  "south africa": "ZA",
  mexico: "MX",
  argentina: "AR",
  chile: "CL",
  colombia: "CO",
  peru: "PE",
  india: "IN",
  indonesia: "ID",
  vietnam: "VN",
  thailand: "TH",
  malaysia: "MY",
  philippines: "PH",
  turkey: "TR",
  israel: "IL",
  "saudi arabia": "SA",
  uae: "AE",
  "united arab emirates": "AE",
  egypt: "EG",
  morocco: "MA",
  norway: "NO",
  switzerland: "CH",
  iceland: "IS",
  "new zealand": "NZ",
});

// Word-boundary regex tokens for full_brief / title scanning. Order matters:
// state/province codes BEFORE country names so US-CA wins over US.
//
// Each entry: [regex, iso_code, label_for_log].
const CONTENT_PATTERNS = [
  // ── US sub-state agencies — must beat plain "United States" ──
  [/\bcalifornia\b/i, "US-CA", "California"],
  [/\bnew york\b/i, "US-NY", "New York"],
  [/\btexas\b/i, "US-TX", "Texas"],
  [/\bflorida\b/i, "US-FL", "Florida"],
  [/\bwashington\s+state\b/i, "US-WA", "Washington State"],
  [/\boregon\b/i, "US-OR", "Oregon"],
  [/\billinois\b/i, "US-IL", "Illinois"],
  [/\bmassachusetts\b/i, "US-MA", "Massachusetts"],
  [/\bpennsylvania\b/i, "US-PA", "Pennsylvania"],
  [/\bcarb\b/, "US-CA", "CARB"],
  // ── Canada provinces ──
  [/\bquebec\b/i, "CA-QC", "Quebec"],
  [/\bontario\b/i, "CA-ON", "Ontario"],
  [/\bbritish columbia\b/i, "CA-BC", "British Columbia"],
  [/\balberta\b/i, "CA-AB", "Alberta"],
  // ── EU & supranational ──
  [/\beuropean union\b/i, "EU", "European Union"],
  [/\beuropean commission\b/i, "EU", "European Commission"],
  [/\beur-?lex\b/i, "EU", "EUR-Lex"],
  // ── Countries (full name) ──
  [/\bunited kingdom\b/i, "GB", "United Kingdom"],
  [/\b(?:great britain|england|scotland|wales)\b/i, "GB", "UK constituent"],
  [/\bunited states\b/i, "US", "United States"],
  [/\bunited arab emirates\b/i, "AE", "UAE"],
  [/\bsaudi arabia\b/i, "SA", "Saudi Arabia"],
  [/\bsouth africa\b/i, "ZA", "South Africa"],
  [/\bsouth korea\b/i, "KR", "South Korea"],
  [/\bnorth korea\b/i, "KP", "North Korea"],
  [/\bnew zealand\b/i, "NZ", "New Zealand"],
  [/\bhong kong\b/i, "HK", "Hong Kong"],
  [/\bsingapore\b/i, "SG", "Singapore"],
  [/\bcanada\b/i, "CA", "Canada"],
  [/\bbrazil\b/i, "BR", "Brazil"],
  [/\bmexico\b/i, "MX", "Mexico"],
  [/\bargentina\b/i, "AR", "Argentina"],
  [/\bchile\b/i, "CL", "Chile"],
  [/\bcolombia\b/i, "CO", "Colombia"],
  [/\bperu\b/i, "PE", "Peru"],
  [/\bindia\b/i, "IN", "India"],
  [/\bindonesia\b/i, "ID", "Indonesia"],
  [/\bvietnam\b/i, "VN", "Vietnam"],
  [/\bthailand\b/i, "TH", "Thailand"],
  [/\bmalaysia\b/i, "MY", "Malaysia"],
  [/\bphilippines\b/i, "PH", "Philippines"],
  [/\bjapan\b/i, "JP", "Japan"],
  [/\bchina\b/i, "CN", "China"],
  [/\baustralia\b/i, "AU", "Australia"],
  [/\bgermany\b/i, "DE", "Germany"],
  [/\bfrance\b/i, "FR", "France"],
  [/\bspain\b/i, "ES", "Spain"],
  [/\bitaly\b/i, "IT", "Italy"],
  [/\bnorway\b/i, "NO", "Norway"],
  [/\bsweden\b/i, "SE", "Sweden"],
  [/\bdenmark\b/i, "DK", "Denmark"],
  [/\bfinland\b/i, "FI", "Finland"],
  [/\bnetherlands\b/i, "NL", "Netherlands"],
  [/\bbelgium\b/i, "BE", "Belgium"],
  [/\bswitzerland\b/i, "CH", "Switzerland"],
  [/\biceland\b/i, "IS", "Iceland"],
  [/\bturkey\b/i, "TR", "Turkey"],
  [/\bisrael\b/i, "IL", "Israel"],
  [/\begypt\b/i, "EG", "Egypt"],
  [/\bmorocco\b/i, "MA", "Morocco"],
  // ── IGOs ──
  [/\binternational maritime organization\b/i, "IMO", "IMO"],
  [/\b(imo|mepc)\b/, "IMO", "IMO"],
  [
    /\binternational civil aviation organization\b/i,
    "ICAO",
    "ICAO",
  ],
  [/\b(icao|corsia)\b/, "ICAO", "ICAO"],
];

// Hostname → ISO codes lookup. Hostnames are matched as suffix
// (item.host endsWith(needle)) so subdomains automatically resolve.
const HOST_PATTERNS = [
  // ── US sub-state ──
  [".arb.ca.gov", "US-CA"],
  [".ca.gov", "US-CA"],
  [".ny.gov", "US-NY"],
  [".tx.gov", "US-TX"],
  [".fl.gov", "US-FL"],
  [".wa.gov", "US-WA"],
  [".or.gov", "US-OR"],
  [".il.gov", "US-IL"],
  [".ma.gov", "US-MA"],
  [".pa.gov", "US-PA"],
  // ── US federal ──
  [".epa.gov", "US"],
  [".doe.gov", "US"],
  [".energy.gov", "US"],
  [".dot.gov", "US"],
  [".faa.gov", "US"],
  [".whitehouse.gov", "US"],
  [".federalregister.gov", "US"],
  [".regulations.gov", "US"],
  [".gov", "US"], // last-resort US fallback
  // ── EU ──
  ["eur-lex.europa.eu", "EU"],
  ["ec.europa.eu", "EU"],
  ["europa.eu", "EU"],
  // ── UK ──
  [".legislation.gov.uk", "GB"],
  [".gov.uk", "GB"],
  // ── Country gov suffixes ──
  [".gov.au", "AU"],
  [".gov.br", "BR"],
  [".gov.in", "IN"],
  [".gov.cn", "CN"],
  [".gov.sg", "SG"],
  [".gov.hk", "HK"],
  [".gov.kr", "KR"],
  [".go.kr", "KR"],
  [".go.jp", "JP"],
  [".gov.za", "ZA"],
  [".gob.cl", "CL"],
  [".gob.mx", "MX"],
  [".gob.ar", "AR"],
  // ── canada.ca / provinces ──
  ["canada.ca", "CA"],
  [".gc.ca", "CA"],
  [".gov.bc.ca", "CA-BC"],
  [".gov.on.ca", "CA-ON"],
  [".gouv.qc.ca", "CA-QC"],
  // ── IGOs ──
  ["imo.org", "IMO"],
  ["icao.int", "ICAO"],
  ["unfccc.int", "GLOBAL"],
  ["worldbank.org", "GLOBAL"],
  ["iea.org", "GLOBAL"],
  ["iso.org", "GLOBAL"],
];

// ─── helpers ───────────────────────────────────────────────────────────────

function extractHost(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  let s = rawUrl.trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    let h = u.hostname.toLowerCase();
    if (h.endsWith(".")) h = h.slice(0, -1);
    if (h.startsWith("www.")) h = h.slice(4);
    return h || null;
  } catch {
    return null;
  }
}

/**
 * Map a single legacy jurisdiction string to an ISO code, or null.
 * Match strategy:
 *  1. exact lowercased lookup
 *  2. slash/comma-separated tokens — try each token
 *  3. contains-match for any key in LEGACY_TO_ISO
 */
function mapLegacyJurisdiction(raw) {
  if (!raw || typeof raw !== "string") return null;
  const norm = raw.trim().toLowerCase();
  if (!norm) return null;
  if (LEGACY_TO_ISO[norm]) return LEGACY_TO_ISO[norm];

  // Tokenize on common separators
  const tokens = norm.split(/[\/,;|]+/).map((t) => t.trim()).filter(Boolean);
  for (const t of tokens) {
    if (LEGACY_TO_ISO[t]) return LEGACY_TO_ISO[t];
  }

  // Contains-match — only against multi-character keys to avoid spurious "us"
  // matching every word. We sort longer-first so "south korea" beats "korea".
  const keys = Object.keys(LEGACY_TO_ISO).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (k.length < 3) continue; // skip "us", "eu", "uk", "cn" — too risky as substring
    if (norm.includes(k)) return LEGACY_TO_ISO[k];
  }

  return null;
}

function deriveFromLegacyJurisdictions(legacyArr) {
  if (!Array.isArray(legacyArr)) return [];
  const out = new Set();
  for (const j of legacyArr) {
    const iso = mapLegacyJurisdiction(j);
    if (iso) out.add(iso);
  }
  return [...out];
}

function deriveFromHost(host) {
  if (!host) return [];
  const out = new Set();
  // Sort patterns longest-first so `.arb.ca.gov` wins over `.ca.gov` and
  // `.ca.gov` wins over `.gov`.
  const sorted = [...HOST_PATTERNS].sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [needle, iso] of sorted) {
    if (host === needle.replace(/^\./, "") || host.endsWith(needle)) {
      out.add(iso);
      // Stop at the first hit — host_patterns are mutually exclusive for a
      // single host (more specific beats less specific).
      break;
    }
  }
  return [...out];
}

function deriveFromContent(text) {
  if (!text || typeof text !== "string") return [];
  const sample = text.slice(0, 2000);
  const out = new Set();
  for (const [re, iso] of CONTENT_PATTERNS) {
    if (re.test(sample)) out.add(iso);
  }
  return [...out];
}

// Public exported helper used by W4.3 (orphan materialization) so that both
// scripts derive ISO codes the same way.
export function deriveJurisdictionISO({
  legacyJurisdictions,
  sourceUrl,
  briefText,
  titleAndSummary,
}) {
  const decisions = [];

  const fromLegacy = deriveFromLegacyJurisdictions(legacyJurisdictions ?? []);
  if (fromLegacy.length > 0) decisions.push({ strategy: "legacy", iso: fromLegacy });

  const host = extractHost(sourceUrl);
  const fromHost = deriveFromHost(host);
  if (fromHost.length > 0)
    decisions.push({ strategy: "host", host, iso: fromHost });

  const text = briefText || titleAndSummary || "";
  const fromContent = deriveFromContent(text);
  if (fromContent.length > 0)
    decisions.push({ strategy: "content", iso: fromContent });

  // Combine: legacy ∪ host ∪ content. De-dupe.
  const merged = new Set([...fromLegacy, ...fromHost, ...fromContent]);
  const result = [...merged];

  return {
    iso: result.length > 0 ? result : ["GLOBAL"],
    fellBackToGlobal: result.length === 0,
    decisions,
  };
}

// ─── main ──────────────────────────────────────────────────────────────────

async function fetchEmptyIsoRows(supabase) {
  // Fetch in batches; jurisdiction_iso = '{}' is the migration default for
  // unmapped rows. We OR with `is.null` defensively (older rows may lack
  // the column entirely if migration 033 didn't apply, though by spec it has).
  const all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("intelligence_items")
      .select("id, legacy_id, title, summary, source_url, full_brief, jurisdictions, jurisdiction_iso")
      .order("legacy_id", { nullsFirst: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  // Filter client-side: array-empty OR null. Supabase JS doesn't have a
  // clean "array_length is 0" filter; this is robust.
  return all.filter((r) => {
    const a = r.jurisdiction_iso;
    return !Array.isArray(a) || a.length === 0;
  });
}

async function main() {
  // Env loading + DB client deferred to here so that a bare `import` of this
  // module (W4.3 imports `deriveJurisdictionISO`) does NOT touch
  // process.cwd, .env.local, or open any DB connection.
  process.chdir(resolve(__dirname, "..", ".."));
  process.loadEnvFile(".env.local");

  const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const t0 = Date.now();
  console.log("W4.1 — ISO backfill for intelligence_items");
  console.log("─".repeat(60));

  const rows = await fetchEmptyIsoRows(supabase);
  console.log(`Rows with empty jurisdiction_iso: ${rows.length}`);

  const log = {
    generated_at: new Date().toISOString(),
    extended_mapping_count: Object.keys(LEGACY_TO_ISO).length,
    total_candidate_rows: rows.length,
    updated: 0,
    fell_back_to_global: 0,
    errors: 0,
    decisions: [],
  };

  for (const row of rows) {
    const titleAndSummary = `${row.title || ""}\n${row.summary || ""}`;
    const result = deriveJurisdictionISO({
      legacyJurisdictions: row.jurisdictions,
      sourceUrl: row.source_url,
      briefText: row.full_brief,
      titleAndSummary,
    });

    const decision = {
      id: row.id,
      legacy_id: row.legacy_id,
      title: row.title?.slice(0, 100) ?? null,
      legacy_jurisdictions: row.jurisdictions ?? [],
      source_host: extractHost(row.source_url),
      derived_iso: result.iso,
      fell_back_to_global: result.fellBackToGlobal,
      strategies_hit: result.decisions.map((d) => d.strategy),
    };

    const { error: updErr } = await supabase
      .from("intelligence_items")
      .update({ jurisdiction_iso: result.iso })
      .eq("id", row.id);

    if (updErr) {
      decision.update_error = updErr.message;
      log.errors += 1;
      console.warn(
        `  [err] ${row.id} (${row.legacy_id ?? "—"}): ${updErr.message}`
      );
    } else {
      log.updated += 1;
      if (result.fellBackToGlobal) log.fell_back_to_global += 1;
    }

    log.decisions.push(decision);
  }

  log.elapsed_ms = Date.now() - t0;

  mkdirSync(dirname(LOG_PATH), { recursive: true });
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), "utf8");

  console.log("─".repeat(60));
  console.log(`Updated:                 ${log.updated}`);
  console.log(`  …of which → GLOBAL:    ${log.fell_back_to_global}`);
  console.log(`Errors:                  ${log.errors}`);
  console.log(`Elapsed:                 ${log.elapsed_ms} ms`);
  console.log(`Mapping table size:      ${log.extended_mapping_count}`);
  console.log(`Log:                     ${LOG_PATH}`);
  console.log("─".repeat(60));
}

// Run main() only when this file is invoked directly (`node W4_1_iso_backfill.mjs`).
// When imported by W4.3 for the deriveJurisdictionISO helper, main() must not run.
const __thisFile = fileURLToPath(import.meta.url);
const __invokedFile = process.argv[1] ? resolve(process.argv[1]) : null;
if (__invokedFile && __thisFile === __invokedFile) {
  main().catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  });
}
