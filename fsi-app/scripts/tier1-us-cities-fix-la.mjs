/**
 * tier1-us-cities-fix-la.mjs — corrective fixup for the US-LA collision.
 *
 * BACKGROUND
 *   The Tier 1 Wave C dispatch suggested 3-letter custom codes prefixed
 *   `US-` for cities ("LAX→LA"). After the initial execute, post-write
 *   verification surfaced that `US-LA` is the official ISO 3166-2 code for
 *   the State of Louisiana — and 3 existing Louisiana state sources are
 *   already tagged with it (LDEQ, LA DOTD Freight, LA State Legislature).
 *
 *   This means the city-LA tag we just applied (Los Angeles) is now an
 *   invalid alias that collides with a real ISO state code, creating
 *   permanently ambiguous filtering. ISO collision is a halt-and-surface
 *   condition per the dispatch.
 *
 * FIX
 *   Replace `US-LA` with `US-LAX` (the airport code, matching the
 *   dispatch's parenthetical "LAX→LA" hint and avoiding all ISO-2
 *   collisions) on:
 *     - 2 LA city sources just inserted (Los Angeles departments + LA City Council)
 *     - 1 retagged item (r31 — Port of Los Angeles Green)
 *
 *   Louisiana's existing US-LA tags are LEFT ALONE — that's the correct
 *   ISO 3166-2 code for the state.
 *
 *   Final state for LA city rows: jurisdiction_iso=['US-CA','US-LAX'].
 *
 * Idempotent: safe to re-run.
 */
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const LOG_PATH = resolve("..", "docs", "tier1-us-cities-fix-la-log.json");
const log = [];
function step(name, ok, detail) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, at: new Date().toISOString() });
  if (!ok) {
    writeFileSync(
      LOG_PATH,
      JSON.stringify({ aborted_at: name, log }, null, 2),
      "utf8"
    );
    process.exit(1);
  }
}

const LA_SOURCE_IDS = [
  "49b28864-8179-4107-b518-bf7d9130ce6a", // LA Departments & Bureaus
  "de8eea1b-926b-4fec-9934-0675c4cd02de", // LA City Council
];

// Step 1: Verify the 2 LA city source rows look as expected
for (const id of LA_SOURCE_IDS) {
  const { data: r } = await supabase
    .from("sources")
    .select("id, name, jurisdiction_iso")
    .eq("id", id)
    .maybeSingle();
  const ok =
    r &&
    Array.isArray(r.jurisdiction_iso) &&
    r.jurisdiction_iso.includes("US-CA") &&
    r.jurisdiction_iso.includes("US-LA");
  step(
    `pre_check_${id}`,
    ok,
    `name=${r?.name} jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)}`
  );
}

// Step 2: Verify r31 is at ['US-CA','US-LA']
{
  const { data: r } = await supabase
    .from("intelligence_items")
    .select("legacy_id, jurisdiction_iso")
    .eq("legacy_id", "r31")
    .maybeSingle();
  const ok =
    r &&
    Array.isArray(r.jurisdiction_iso) &&
    r.jurisdiction_iso.includes("US-CA") &&
    r.jurisdiction_iso.includes("US-LA");
  step(
    "pre_check_r31",
    ok,
    `jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)}`
  );
}

// Step 3: Verify Louisiana state sources exist on US-LA (NOT to be touched)
//   Match by jurisdiction_iso=['US-LA'] (ISO 3166-2 for Louisiana state) and
//   filter out the Los Angeles rows we just inserted (which we WILL touch).
{
  const { data: laSrcs } = await supabase
    .from("sources")
    .select("id, name, jurisdiction_iso")
    .contains("jurisdiction_iso", ["US-LA"]);
  const laStateOnly = (laSrcs || []).filter(
    (r) => !LA_SOURCE_IDS.includes(r.id)
  );
  step(
    "louisiana_state_baseline",
    laStateOnly.length >= 1,
    `Louisiana state sources tagged US-LA (excluding LA city rows): ${laStateOnly.length}; ${JSON.stringify(laStateOnly.map((r) => r.name))}`
  );
}

// Step 4: Update LA city sources to ['US-CA','US-LAX']
for (const id of LA_SOURCE_IDS) {
  const { error: e } = await supabase
    .from("sources")
    .update({ jurisdiction_iso: ["US-CA", "US-LAX"] })
    .eq("id", id);
  step(
    `update_source_${id}`,
    !e,
    e?.message ?? "set ['US-CA','US-LAX']"
  );
  const { data: r } = await supabase
    .from("sources")
    .select("id, jurisdiction_iso")
    .eq("id", id)
    .maybeSingle();
  const ok =
    r &&
    Array.isArray(r.jurisdiction_iso) &&
    r.jurisdiction_iso.length === 2 &&
    r.jurisdiction_iso.includes("US-CA") &&
    r.jurisdiction_iso.includes("US-LAX");
  step(
    `verify_source_${id}`,
    ok,
    `jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)}`
  );
}

// Step 5: Update r31 to ['US-CA','US-LAX']
{
  const { error: e } = await supabase
    .from("intelligence_items")
    .update({ jurisdiction_iso: ["US-CA", "US-LAX"] })
    .eq("legacy_id", "r31");
  step("update_r31", !e, e?.message ?? "set ['US-CA','US-LAX']");
  const { data: r } = await supabase
    .from("intelligence_items")
    .select("legacy_id, jurisdiction_iso")
    .eq("legacy_id", "r31")
    .maybeSingle();
  const ok =
    r &&
    Array.isArray(r.jurisdiction_iso) &&
    r.jurisdiction_iso.length === 2 &&
    r.jurisdiction_iso.includes("US-CA") &&
    r.jurisdiction_iso.includes("US-LAX");
  step(
    "verify_r31",
    ok,
    `jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)}`
  );
}

// Step 6: Confirm Louisiana state sources untouched
{
  const { data: laSrcs } = await supabase
    .from("sources")
    .select("id, name, jurisdiction_iso")
    .contains("jurisdiction_iso", ["US-LA"]);
  // Should now ONLY contain Louisiana state sources, no Los Angeles city rows.
  const polluted = (laSrcs || []).filter((r) =>
    /los angeles/i.test(r.name)
  );
  step(
    "louisiana_state_clean",
    polluted.length === 0,
    `US-LA tagged sources after fix: ${laSrcs?.length} | LA-city pollution: ${polluted.length}`
  );
}

// Step 7: Final US-LAX snapshot
{
  const { data: srcs } = await supabase
    .from("sources")
    .select("id, name, jurisdiction_iso")
    .contains("jurisdiction_iso", ["US-LAX"]);
  const { data: items } = await supabase
    .from("intelligence_items")
    .select("legacy_id, title, jurisdiction_iso")
    .contains("jurisdiction_iso", ["US-LAX"]);
  console.log("\nUS-LAX final state:");
  console.log("Sources:", JSON.stringify(srcs, null, 2));
  console.log("Items:", JSON.stringify(items, null, 2));
}

writeFileSync(LOG_PATH, JSON.stringify({ completed: true, log }, null, 2), "utf8");
console.log("\n[OK] LA fix complete. Log: docs/tier1-us-cities-fix-la-log.json");
