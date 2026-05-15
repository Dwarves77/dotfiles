// One-off: list Task 6 source URLs + their auto_run_enabled +
// presence of intelligence_items rows.
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(__dirname, "..", "..", ".env.local"));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const urls = [
  "https://finance.ec.europa.eu/",
  "https://www.esma.europa.eu/",
  "https://www.eba.europa.eu/",
  "https://www.fca.org.uk/",
  "https://www.sec.gov/",
  "https://carbon-pulse.com/",
  "https://galleryclimatecoalition.org/about/",
  "https://galleryclimatecoalition.org/research/",
  "https://www.aam-us.org/",
  "https://www.icom-cc.org/",
  "https://www.iiconservation.org/",
];

const { data: sources } = await supabase
  .from("sources")
  .select("id, name, url, status, auto_run_enabled, processing_paused")
  .in("url", urls);

console.log(JSON.stringify({ count: sources?.length ?? 0, sources }, null, 2));

const ids = (sources ?? []).map((s) => s.id);
const { data: items } = await supabase
  .from("intelligence_items")
  .select("id, source_id, source_url, title, summary, pipeline_stage, full_brief, updated_at")
  .in("source_id", ids);

console.log("\n=== intelligence_items present for these sources ===");
console.log(JSON.stringify(
  (items ?? []).map(i => ({
    source_url: i.source_url,
    title: i.title?.slice(0, 60),
    summary_len: i.summary?.length ?? 0,
    pipeline_stage: i.pipeline_stage,
    brief_len: i.full_brief?.length ?? 0,
    updated_at: i.updated_at,
  })),
  null, 2
));
