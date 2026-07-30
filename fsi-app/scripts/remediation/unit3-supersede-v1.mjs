#!/usr/bin/env node
// unit3-supersede-v1.mjs — ADR-016 fabrication remediation step 4. SUPERSEDE the v1 hallucinated verdicts with an
// AUDIT TRAIL (never silent overwrite). The v1 pass classified from bare identifiers -> fabricated freight topics
// (86% false relevance). Here: snapshot every v1 row's disposition+notes to a durable file, then set
// dryrun_disposition=NULL and stamp the note SUPERSEDED so (a) no downstream consumer can read a fabricated
// disposition and (b) the fail-closed v2 re-classifier re-picks the row. Run: --dry-run | --execute
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const EXECUTE = process.argv.includes("--execute");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("census_worklist").select("id, dryrun_disposition, surface_tags, notes").like("notes", "unit3-metadata-classify%").order("id").range(from, from + 999);
    if (error || !data?.length) break; rows.push(...data); if (data.length < 1000) break;
  }
  console.log(`\n===== supersede v1 fabricated pass (${EXECUTE ? "EXECUTE" : "DRY-RUN"}) — ${rows.length} rows =====`);
  const snap = resolve(ROOT, "scripts/tmp/v1-superseded-snapshot.json");
  writeFileSync(snap, JSON.stringify(rows, null, 0));
  console.log(`  audit snapshot -> ${snap} (${rows.length} prior verdicts preserved)`);
  if (!EXECUTE) { console.log("  dry-run: would NULL disposition + stamp SUPERSEDED on all above."); return; }
  let done = 0, idx = 0;
  async function w() { while (idx < rows.length) { const r = rows[idx++]; await sb.from("census_worklist").update({ dryrun_disposition: null, notes: `SUPERSEDED-v1-fabricated(no-title-hallucination; was ${r.dryrun_disposition}); snapshot in v1-superseded-snapshot.json` }).eq("id", r.id).then(() => { done++; }, () => {}); if (done % 500 === 0 && done) console.log(`  superseded ${done}/${rows.length}`); } }
  await Promise.all(Array.from({ length: 12 }, w));
  console.log(`\n  superseded ${done} rows -> dryrun_disposition NULL (re-picked by fail-closed v2), prior verdicts in the snapshot.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
