#!/usr/bin/env node
// P2 PUBLICATION BATCH — step 1+2: register the 8 per-CELEX EUR-Lex source rows, then mint the 8 items
// through the guarded chokepoint (src/lib/intake/mint-item.ts). $0 — no model calls, no fetches.
//
// WHY AN institutionKey OVERRIDE: registerSource dedups on institutionKey(url), which for eur-lex.europa.eu
// (absent from SHARED_PORTAL_KEYDEPTH) collapses to the BARE HOST — so a per-CELEX registration would silently
// return the existing bare-host row instead of creating a per-document source (the "registerSource/eur-lex
// host-collision" logged 2026-07-17). Passing an explicit per-CELEX key is the sanctioned override the function
// already exposes, and it reproduces the per-CELEX convention already in the registry (CBAM 32023R0956, FuelEU
// 32023R1805, HDV 32019R1242). Per-document keying is what RD-40/nothing-generic requires: a FACT must cite the
// instrument it came from, never a bare-host portal row.
//
// TIER: 1, deterministic. source-credibility-model Section 3: Tier 1 = binding law, naming EUR-Lex / the
// Official Journal explicitly; and "europa.eu subdomains are institution-distinct (eur-lex.europa.eu = T1)".
// No guessed tier, SC-13 clean, and it matches the canonical institutional tier rather than adding drift.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { registerSource } from "../lib/db.mjs";
import createJiti from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* pre-loaded */ }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// `@/…` is a tsconfig path alias; jiti needs it declared explicitly or every aliased import fails to resolve.
const jiti = createJiti(fileURLToPath(import.meta.url), { interopDefault: true, esmResolve: true, alias: { "@": resolve(ROOT, "src") } });
const { mintIntelligenceItem } = await jiti.import(resolve(ROOT, "src/lib/intake/mint-item.ts"));

const EXECUTE = process.argv.includes("--execute");
const CITE = {
  skill: "source-credibility-model",
  reason: "P2 publication batch (operator ruling 2026-07-30): register per-CELEX EUR-Lex sources at the canonical T1 institutional tier so the guarded mint can link the 8 selected instruments.",
};

// The 8, operator-accepted. item_type drives format selection (env-policy Format Mapping):
// all are binding EU instruments -> regulation/directive -> regulatory_fact_document.
const BATCH = [
  { celex: "32026R1030", type: "regulation", name: "EUR-Lex / Regulation (EU) 2026/1030 (CountEmissions EU - GHG accounting of transport services)" },
  { celex: "32026R0394", type: "regulation", name: "EUR-Lex / Implementing Regulation (EU) 2026/394 (FuelEU Maritime database)" },
  { celex: "32025R2083", type: "regulation", name: "EUR-Lex / Regulation (EU) 2025/2083 (CBAM simplification and strengthening)" },
  { celex: "32024R3214", type: "regulation", name: "EUR-Lex / Delegated Regulation (EU) 2024/3214 (EU MRV - offshore ships, sustainable-fuel zero-rating)" },
  { celex: "32025L0794", type: "directive", name: "EUR-Lex / Directive (EU) 2025/794 (CSRD/CSDDD application dates)" },
  { celex: "32025R0035", type: "regulation", name: "EUR-Lex / Implementing Regulation (EU) 2025/35 (HDV CO2 in-service verification)" },
  { celex: "32025D0210", type: "regulation", name: "EUR-Lex / Council Implementing Decision (EU) 2025/210 (Spain - reduced electricity tax, berthed vessels)" },
  { celex: "32011L0037", type: "directive", name: "EUR-Lex / Commission Directive 2011/37/EU (End-of-Life Vehicles, Annex II)" },
];
const urlFor = (celex) => `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celex}`;

// Titles come from the catalogue (census_worklist), never invented.
const { data: cat } = await sb.from("census_worklist").select("instrument_identifier,title,document_url")
  .in("instrument_identifier", BATCH.map((b) => b.celex));
const titleOf = new Map((cat || []).map((c) => [c.instrument_identifier, c.title]));
const missing = BATCH.filter((b) => !titleOf.has(b.celex));
if (missing.length) { console.error(`HALT: no catalogue row for ${missing.map((m) => m.celex).join(", ")}`); process.exit(2); }

console.log(`${EXECUTE ? "EXECUTE" : "DRY"} - ${BATCH.length} instruments\n`);
const results = [];
for (const b of BATCH) {
  const url = urlFor(b.celex);
  let sourceId = null, created = false;
  if (EXECUTE) {
    const reg = await registerSource(
      { url, name: b.name, base_tier: 1, institutionKey: `eur-lex.europa.eu/celex/${b.celex}` },
      { cite: CITE },
    );
    sourceId = reg.source_id; created = reg.created;
  }
  const seed = {
    // Schema-audited, not guessed: `domain` is the INTEGER surface key (1 = REGULATIONS_DOMAIN, src/lib/domains.ts)
    // and the column is `jurisdictions` (text[]), not `jurisdiction`. title + domain are the only NOT NULL
    // columns without a default; everything else defaults. mintIntelligenceItem re-canonicalizes domain from
    // the final item_type anyway (canonicalDomainOverride), so this is the honest seed, not the authority.
    title: titleOf.get(b.celex), source_url: url, item_type: b.type, domain: 1,
    jurisdictions: ["eu"], instrument_identifier: b.celex,
    ...(sourceId ? { source_id: sourceId } : {}),
  };
  const res = await mintIntelligenceItem(sb, { seed, origin: "first_fetch" }, { dryRun: !EXECUTE });
  results.push({ celex: b.celex, sourceId, created, ok: res.ok, action: res.action, id: res.itemId ?? res.id ?? null, error: res.error ?? null });
  console.log(`  ${b.celex}: source=${created ? "CREATED" : sourceId ? "reused" : "(dry)"} mint=${res.ok ? res.action : `REJECT ${res.error}`}`);
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${EXECUTE ? "minted/ok" : "would-mint"}: ${results.length - bad.length}/${results.length}`);
if (bad.length) console.log(`BLOCKED:`, JSON.stringify(bad.map((x) => ({ celex: x.celex, action: x.action, error: x.error })), null, 1));
if (EXECUTE) console.log(`ITEM IDS:`, JSON.stringify(results.filter((r) => r.ok).map((r) => ({ celex: r.celex, id: r.id })), null, 0));
