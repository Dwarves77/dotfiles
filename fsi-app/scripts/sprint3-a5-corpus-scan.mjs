/**
 * sprint3-a5-corpus-scan.mjs — Pre-step for A5 Path C lock.
 *
 * READ-ONLY. Scans the entire active corpus (D1-D7) to determine
 * whether reasoning + why_matters columns are EMPTY everywhere
 * (locks Path C blanket-hide) or POPULATED on some domains
 * (requires per-row disposition).
 *
 * Output: docs/audits/sprint3-a5-corpus-scan-2026-05-26.json
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const LOG_DIR = resolve("docs", "audits");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const OUT = resolve(LOG_DIR, "sprint3-a5-corpus-scan-2026-05-26.json");

const DOMAIN_LABELS = {
  1: "Regulations", 2: "Energy & Tech", 3: "Regional Ops",
  4: "Geopolitical", 5: "Source Intel", 6: "Facilities", 7: "Research Pipeline",
};

async function main() {
  console.log("[A5 corpus] scanning reasoning + why_matters population across D1-D7...");

  const { data: rows, error } = await supabase
    .from("intelligence_items")
    .select("id, domain, reasoning, why_matters")
    .eq("is_archived", false);

  if (error) {
    console.error("query error:", error);
    process.exit(1);
  }

  const byDomain = {};
  for (let d = 1; d <= 7; d++) {
    byDomain[d] = { total: 0, reasoning_non_empty: 0, why_matters_non_empty: 0, both_non_empty: 0 };
  }

  for (const r of rows ?? []) {
    const d = r.domain;
    if (!byDomain[d]) continue;
    byDomain[d].total++;
    const hasReasoning = (r.reasoning ?? "").length > 0;
    const hasWhyMatters = (r.why_matters ?? "").length > 0;
    if (hasReasoning) byDomain[d].reasoning_non_empty++;
    if (hasWhyMatters) byDomain[d].why_matters_non_empty++;
    if (hasReasoning && hasWhyMatters) byDomain[d].both_non_empty++;
  }

  let totalReasoning = 0, totalWhyMatters = 0, totalBoth = 0, totalRows = 0;
  for (const d of Object.keys(byDomain)) {
    totalRows += byDomain[d].total;
    totalReasoning += byDomain[d].reasoning_non_empty;
    totalWhyMatters += byDomain[d].why_matters_non_empty;
    totalBoth += byDomain[d].both_non_empty;
  }

  const verdict =
    totalReasoning === 0 && totalWhyMatters === 0
      ? "BLANKET_HIDE: empty across entire active corpus. Path C blanket-hide is correct disposition."
      : totalReasoning === totalRows && totalWhyMatters === totalRows
      ? "BLANKET_RENDER: populated across entire active corpus. Render block unconditionally."
      : "PER_ROW_DISPOSITION: mixed population. Block must render conditionally per (reasoning OR why_matters non-empty).";

  const output = {
    run_date: new Date().toISOString(),
    total_active_items: totalRows,
    totals: {
      reasoning_non_empty: totalReasoning,
      why_matters_non_empty: totalWhyMatters,
      both_non_empty: totalBoth,
    },
    per_domain: Object.fromEntries(
      Object.entries(byDomain).map(([d, v]) => [
        `${d} ${DOMAIN_LABELS[d] || ""}`,
        v,
      ])
    ),
    verdict,
  };

  writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`[A5 corpus] wrote ${OUT}`);
  console.log(`\nTotal active items: ${totalRows}`);
  console.log(`reasoning non-empty:    ${totalReasoning} / ${totalRows}`);
  console.log(`why_matters non-empty:  ${totalWhyMatters} / ${totalRows}`);
  console.log(`both non-empty:         ${totalBoth} / ${totalRows}`);
  console.log(`\nPer domain:`);
  for (const [d, v] of Object.entries(byDomain)) {
    console.log(`  D${d} (${DOMAIN_LABELS[d]}): ${v.total} total · reasoning=${v.reasoning_non_empty} · why_matters=${v.why_matters_non_empty} · both=${v.both_non_empty}`);
  }
  console.log(`\nVerdict: ${verdict}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
