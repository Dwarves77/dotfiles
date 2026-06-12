/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: source-credibility-model + remediation-discipline.
 *
 *  UNREGISTERED-SPAN-HOST monitor: counts FACT claims whose span host is NOT in the sources registry
 *  (NULL-stamped under the canonical resolver). The register step (generate -> register -> section ->
 *  ground -> credit) should drive NEW grounding toward 0 unregistered spans; a RISING count means the
 *  register step is failing. This is a TREND monitor with a baseline (scripts/verify/_baselines/
 *  unregistered-span.json): exit 1 only if the count INCREASES vs the recorded baseline (regression);
 *  it never fails on the standing backlog (Phase 2 re-ground reduces that). Pass --rebaseline to record
 *  the current count as the new floor (operator action after a deliberate reduction). Read-only otherwise. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createJiti } from "jiti";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { hostOf, buildResolver, hostInstitution } = await jiti.import("../../src/lib/sources/institution.ts");
const BASE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "_baselines");
const BASE_FILE = resolve(BASE_DIR, "unregistered-span.json");
const REBASELINE = process.argv.includes("--rebaseline");

const sources = await readAll("sources", "id,url,base_tier,effective_tier,tier_override");
const claims = await readAll("section_claim_provenance", "id,claim_kind,search_result_id");
const searches = await readAll("agent_run_searches", "id,result_url");
const searchById = new Map(searches.map((r) => [r.id, r]));
const resolver = buildResolver(sources);

let unregistered = 0; const hostHist = {};
for (const c of claims) {
  if (c.claim_kind !== "FACT" || !c.search_result_id) continue;
  const sr = searchById.get(c.search_result_id); if (!sr) continue;
  const { tier } = resolver.resolveSpan(sr.result_url);
  if (tier == null) { unregistered++; const k = hostInstitution(hostOf(sr.result_url)) || "?"; hostHist[k] = (hostHist[k] || 0) + 1; }
}
const top = Object.entries(hostHist).sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log(`[unregistered-span-host] FACT claims grounded on an UNREGISTERED host (NULL-stamp): ${unregistered}`);
console.log(`  top unregistered institutions: ${top.map(([h, n]) => `${h}(${n})`).join(" ")}`);

if (REBASELINE) {
  mkdirSync(BASE_DIR, { recursive: true });
  writeFileSync(BASE_FILE, JSON.stringify({ count: unregistered, recorded: "manual-rebaseline" }, null, 2));
  console.log(`REBASELINED floor -> ${unregistered}.`);
  process.exit(0);
}
const baseline = existsSync(BASE_FILE) ? JSON.parse(readFileSync(BASE_FILE, "utf8")).count : Infinity;
console.log(`  baseline floor: ${baseline === Infinity ? "(none — first run; recording)" : baseline}`);
if (baseline === Infinity) { mkdirSync(BASE_DIR, { recursive: true }); writeFileSync(BASE_FILE, JSON.stringify({ count: unregistered, recorded: "first-run" }, null, 2)); console.log("PASS: baseline recorded (no regression possible on first run)."); process.exit(0); }
if (unregistered > baseline) { console.log(`\nFAIL: unregistered-span count rose ${baseline} -> ${unregistered} — the register step is failing (new grounding NULL-stamping).`); process.exit(1); }
console.log(`PASS: unregistered-span count ${unregistered} <= baseline ${baseline} (no regression; Phase 2 reduces the backlog).`);
process.exit(0);
