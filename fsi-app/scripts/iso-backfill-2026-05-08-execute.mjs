/**
 * iso-backfill-2026-05-08-execute.mjs — authorized writes for the ISO tag
 * backfill, sourced from the investigation report at
 * docs/iso-backfill-2026-05-08-investigation.json.
 *
 * Investigation finding (2026-05-08): the monitoring report's "136 items
 * lacking Tier 1 priority ISO" overstates the backfill opportunity. After
 * conservative content-based derivation, only 9 rows have a clean,
 * non-ambiguous Tier 1 sub-national or country-level signal. The other
 * 132 rows are inherently supranational (IMO, ICAO, EU multi-state, GLOBAL
 * standards like ISSB IFRS S2 / ISO 14083 / Paris Agreement) and are
 * correctly tagged at supranational scope.
 *
 * This script processes ONLY the DERIVABLE bucket. Each row gets ADD-only
 * updates: existing supranational codes are preserved; the derived Tier 1
 * code is appended. Per-row read-back verification confirms the new code
 * landed without disturbing existing tags.
 *
 * Per dispatch:
 *   - No bypass flags
 *   - ADD codes, do NOT REMOVE existing
 *   - Skip rather than wrong-tag on ambiguous rows
 *   - Do NOT merge the PR (Jason adjudicates)
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

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

// ── Tier 1 priority ISO set (mirror of the investigation script) ──
const TIER1_PRIORITY_ISOS = new Set([
  "US-AL","US-AK","US-AZ","US-AR","US-CA","US-CO","US-CT","US-DE","US-FL","US-GA",
  "US-HI","US-ID","US-IL","US-IN","US-IA","US-KS","US-KY","US-LA","US-ME","US-MD",
  "US-MA","US-MI","US-MN","US-MS","US-MO","US-MT","US-NE","US-NV","US-NH","US-NJ",
  "US-NM","US-NY","US-NC","US-ND","US-OH","US-OK","US-OR","US-PA","US-RI","US-SC",
  "US-SD","US-TN","US-TX","US-UT","US-VT","US-VA","US-WA","US-WV","US-WI","US-WY",
  "US-DC","US-PR","US-VI","US-GU","US-MP","US-AS",
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT",
  "LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
  "GB-ENG","GB-SCT","GB-WLS","GB-NIR",
  "CA-ON","CA-QC","CA-BC","CA-AB","CA-MB","CA-SK","CA-NS","CA-NB","CA-NL","CA-PE",
  "CA-YT","CA-NT","CA-NU",
  "AU","AU-NSW","AU-VIC","AU-QLD","AU-WA","AU-SA","AU-TAS","AU-ACT","AU-NT",
  "SG","HK","JP","KR",
  "AE","SA","IL","TR","QA",
  "BR","MX","AR","CL","CO","PE",
  "ZA","EG","KE","NG","MA",
]);

// ── Load investigation report (the authoritative DERIVABLE list) ──
const investigationPath = resolve("..", "docs", "iso-backfill-2026-05-08-investigation.json");
let investigation;
try {
  investigation = JSON.parse(readFileSync(investigationPath, "utf8"));
} catch (e) {
  console.error(
    `Cannot read investigation report at ${investigationPath}.\n` +
    "Run the investigate script first."
  );
  process.exit(1);
}

const derivable = investigation.buckets?.DERIVABLE ?? [];
console.log(`Loaded investigation report: ${derivable.length} DERIVABLE rows.`);

// ── Pre-flight: count of items currently carrying a Tier 1 priority ISO ──
async function countTier1Carriers() {
  const { data, error } = await supabase
    .from("intelligence_items")
    .select("id, jurisdiction_iso")
    .eq("is_archived", false);
  if (error) throw new Error(error.message);
  let n = 0;
  for (const r of data) {
    if ((r.jurisdiction_iso ?? []).some((c) => TIER1_PRIORITY_ISOS.has(c))) n++;
  }
  return { total: data.length, tier1Carriers: n };
}

const preflight = await countTier1Carriers();
console.log(
  `[PRE] active=${preflight.total}  tier1_carriers=${preflight.tier1Carriers}`
);

// ── Per-row backfill with inline read-back verification ──
const log = [];
let updated = 0;
let skipped = 0;

function recordStep(name, ok, detail, extras = {}) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, at: new Date().toISOString(), ...extras });
}

for (const row of derivable) {
  // 1. Read current state
  const { data: cur, error: e1 } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, jurisdiction_iso, title")
    .eq("id", row.id)
    .maybeSingle();

  if (e1 || !cur) {
    recordStep(
      `read_${row.legacy_id ?? row.id}`,
      false,
      `failed to read row: ${e1?.message ?? "not found"}`,
      { id: row.id, legacy_id: row.legacy_id }
    );
    skipped++;
    continue;
  }

  const before = Array.isArray(cur.jurisdiction_iso) ? cur.jurisdiction_iso : [];
  const toAdd = row.derived_iso.filter((c) => !before.includes(c));

  if (toAdd.length === 0) {
    recordStep(
      `skip_${cur.legacy_id ?? cur.id}`,
      true,
      `derived ISOs already present; no-op (existing=${JSON.stringify(before)})`,
      { id: cur.id, legacy_id: cur.legacy_id, before, derived: row.derived_iso }
    );
    skipped++;
    continue;
  }

  // 2. Compute new array — ADD only, preserve existing
  const next = [...before, ...toAdd];

  // 3. Write
  const { error: e2 } = await supabase
    .from("intelligence_items")
    .update({ jurisdiction_iso: next })
    .eq("id", cur.id);

  if (e2) {
    recordStep(
      `write_${cur.legacy_id ?? cur.id}`,
      false,
      `update failed: ${e2.message}`,
      { id: cur.id, legacy_id: cur.legacy_id, before, attempted_next: next }
    );
    skipped++;
    continue;
  }

  // 4. Read back; confirm new ISO present, old codes preserved
  const { data: after, error: e3 } = await supabase
    .from("intelligence_items")
    .select("id, jurisdiction_iso")
    .eq("id", cur.id)
    .maybeSingle();

  if (e3 || !after) {
    recordStep(
      `verify_${cur.legacy_id ?? cur.id}`,
      false,
      `read-back failed: ${e3?.message ?? "not found"}`,
      { id: cur.id, legacy_id: cur.legacy_id }
    );
    skipped++;
    continue;
  }

  const afterArr = Array.isArray(after.jurisdiction_iso) ? after.jurisdiction_iso : [];
  const allOldPreserved = before.every((c) => afterArr.includes(c));
  const allNewPresent = toAdd.every((c) => afterArr.includes(c));
  const ok = allOldPreserved && allNewPresent;

  recordStep(
    `verify_${cur.legacy_id ?? cur.id}`,
    ok,
    ok
      ? `before=${JSON.stringify(before)} after=${JSON.stringify(afterArr)} added=${JSON.stringify(toAdd)}`
      : `read-back mismatch! before=${JSON.stringify(before)} after=${JSON.stringify(afterArr)} expected_to_add=${JSON.stringify(toAdd)}`,
    {
      id: cur.id,
      legacy_id: cur.legacy_id,
      title: cur.title,
      before,
      after: afterArr,
      added: toAdd,
    }
  );

  if (ok) {
    updated++;
  } else {
    skipped++;
    // Halt on verification failure — never silently roll forward.
    console.error(
      `\n[HALT] Per-step verification failed on ${cur.legacy_id ?? cur.id}. ` +
      `Halting before next row.`
    );
    break;
  }
}

// ── Post-flight: re-count Tier 1 carriers ──
const postflight = await countTier1Carriers();
console.log(
  `\n[POST] active=${postflight.total}  tier1_carriers=${postflight.tier1Carriers}` +
  `  delta=${postflight.tier1Carriers - preflight.tier1Carriers}`
);

// ── Per-region breakdown of what was added ──
const perRegion = {};
for (const entry of log) {
  if (entry.added) {
    for (const iso of entry.added) {
      perRegion[iso] = (perRegion[iso] ?? 0) + 1;
    }
  }
}

const summary = {
  generated_at: new Date().toISOString(),
  derivable_count: derivable.length,
  ambiguous_count: investigation.bucket_counts?.AMBIGUOUS ?? 0,
  inherently_supranational_count: investigation.bucket_counts?.INHERENTLY_SUPRANATIONAL ?? 0,
  already_specific_count: investigation.bucket_counts?.ALREADY_SPECIFIC ?? 0,
  updated,
  skipped,
  preflight,
  postflight,
  tier1_carriers_delta: postflight.tier1Carriers - preflight.tier1Carriers,
  per_region_adds: perRegion,
  halts: investigation.halts ?? [],
};

const outPath = resolve("..", "docs", "iso-backfill-2026-05-08-execute-log.json");
writeFileSync(
  outPath,
  JSON.stringify({ ...summary, log }, null, 2),
  "utf8"
);

console.log("\n══ Execute summary ══");
console.log(JSON.stringify(summary, null, 2));
console.log(`\nFull log → ${outPath}`);
