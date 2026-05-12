// apply-access-method-3-source-remediation.mjs
//
// Applies the three per-row UPDATEs documented in
// docs/access-method-triage-2026-05-12.md after operator approval.
//
// Uses supabase-js with the service-role key from .env.local. Each row is
// updated independently and read back so the before/after state is visible
// in the script output.
//
// Run from fsi-app root:
//   node supabase/seed/apply-access-method-3-source-remediation.mjs

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const UPDATES = [
  {
    label: "SEC press releases",
    id: "390fb3eb-c17c-474e-9783-d0c71822c37b",
    patch: {
      access_method: "rss",
      rss_feed_url: "https://www.sec.gov/news/pressreleases.rss",
    },
  },
  {
    label: "Carbon Pulse",
    id: "e1cf70bc-7981-4c83-b9f3-bae57b035cee",
    patch: {
      access_method: "rss",
      rss_feed_url: "https://carbon-pulse.com/feed/",
    },
  },
  {
    label: "GCC research",
    id: "f81c2cd0-2627-4e92-aa07-478ef395c2a2",
    patch: {
      url: "https://galleryclimatecoalition.org/resources/",
    },
  },
];

const SELECT_COLS = "id, name, url, access_method, rss_feed_url, source_role";

async function readRow(id) {
  const { data, error } = await supabase
    .from("sources")
    .select(SELECT_COLS)
    .eq("id", id)
    .single();
  if (error) throw new Error(`read ${id}: ${error.message}`);
  return data;
}

async function applyOne({ label, id, patch }) {
  const before = await readRow(id);
  const { error } = await supabase.from("sources").update(patch).eq("id", id);
  if (error) throw new Error(`update ${id}: ${error.message}`);
  const after = await readRow(id);
  return { label, id, before, after };
}

const results = [];
for (const u of UPDATES) {
  // eslint-disable-next-line no-await-in-loop -- run serially so log is ordered
  const r = await applyOne(u);
  results.push(r);
}

console.log(JSON.stringify(results, null, 2));
