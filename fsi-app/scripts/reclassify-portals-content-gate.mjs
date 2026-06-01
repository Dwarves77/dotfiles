// 156/231-portal cleanup — ONE consistent criterion: the LIVE content gate (firstFetchClassify
// entity_verdict) run over EACH candidate's own stored content. Nothing archived on the
// title/urlIsRoot proxy alone. urlIsRoot is TRIAGE (which items to re-judge); the ARCHIVE
// decision is the content gate for all of them.
//
//   keep    : entity_verdict = specific_document (legit content, e.g. a research finding /
//             market signal that merely carries a homepage source_url) -> NOT archived.
//   archive : entity_verdict = portal | uncertain, OR a detected error-page artifact.
//   skip    : a classify FAILURE (Haiku 429/error) is INCONCLUSIVE (the fetchOk discipline,
//             applied to my own cleanup) -> NOT archived; flagged for a re-run.
//
// Archive = tombstone the false ITEM-hood (is_archived=true), NEVER touch the SOURCE row.
// Verify by read-back of stored state. --dry-run default; --execute archives.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { assertExecutedDataOp } from "./_dataops/interlock.mjs";
assertExecutedDataOp("reclassify-portals-content-gate", { applied: "2026-06-01", commit: "e4f801d", effect: "archive 210 root-URL intelligence_items (is_archived=true)", idempotent: true });
import esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { urlIsRoot } from "../src/lib/sources/entity-gate.mjs";
import { assertReadBack, VERDICT } from "./lib/verify.mjs";

const EXECUTE = process.argv.includes("--execute");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
// firstFetchClassify is TS with an @/ import — bundle it so plain node can call the live classifier.
const FFC_BUNDLE = resolve(ROOT, "scripts/tmp/_ffc-bundle.mjs");
await esbuild.build({ entryPoints: [resolve(ROOT, "src/lib/llm/first-fetch-classify.ts")], bundle: true, format: "esm", platform: "node", packages: "external", tsconfig: resolve(ROOT, "tsconfig.json"), outfile: FFC_BUNDLE, logLevel: "silent" });
const { firstFetchClassify } = await import(pathToFileURL(FFC_BUNDLE));
const KEY = process.env.ANTHROPIC_API_KEY;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);

// error-page-as-item (SECOND leak class: a bot-block/error body captured as content).
const ARTIFACT = /\b(cloudfront|403 forbidden|forbidden|access denied|temporarily inaccessible|are you a robot|captcha|enable javascript|service unavailable|429 too many|rate limit|bad gateway|gateway timeout|not found|error 5\d\d|page (not )?found)\b/i;

const pc = new pg.Client({ connectionString: CONN }); await pc.connect();
const items = (await pc.query(`
  SELECT ii.id, ii.legacy_id, ii.title, ii.source_url, ii.provenance_status,
         coalesce(ii.summary,'') AS summary, left(coalesce(ii.full_brief,''), 3000) AS brief, ii.item_type,
         EXISTS (SELECT 1 FROM public.sources s WHERE regexp_replace(lower(s.url),'/+$','') = regexp_replace(lower(ii.source_url),'/+$','')) AS in_registry
  FROM public.intelligence_items ii WHERE ii.is_archived = false`)).rows;
const portals = items.filter((i) => i.source_url && urlIsRoot(i.source_url));
console.log(`active items: ${items.length}  | root-URL triage set (urlIsRoot): ${portals.length}  | deep-URL kept: ${items.length - portals.length}`);
console.log(`provenance of the triage set: ${JSON.stringify(portals.reduce((a,p)=>{a[p.provenance_status]=(a[p.provenance_status]||0)+1;return a;},{}))} (Phase-2 reconciliation ran this session, commit 0571c11 — verified is expected)\n`);

const verdicts = {};
let artifacts = 0, classified = 0, inconclusive = 0;
const CONC = 4;
let idx = 0;
async function worker() {
  while (idx < portals.length) {
    const p = portals[idx++];
    const text = `${p.title}\n${p.summary}\n${p.brief}`.trim();
    if (ARTIFACT.test(`${p.title} ${p.summary}`)) { verdicts[p.id] = "artifact"; artifacts++; continue; }
    // classify the ITEM's own content through the live gate's classifier.
    let attempt = 0, res = null;
    while (attempt++ < 3) {
      res = await firstFetchClassify({ source_id: p.id, source_url: p.source_url, source_name: p.title, source_tier: null, source_category: null, text: text.slice(0, 6000) }, KEY);
      if (res.ok) break;
      if (/\b429\b/.test(res.error || "")) { await sleep(2000 * attempt); continue; } // non-answer -> retry
      break;
    }
    if (!res?.ok) { verdicts[p.id] = "inconclusive"; inconclusive++; continue; } // INCONCLUSIVE: never auto-archive
    verdicts[p.id] = res.result.entity_verdict; classified++;
    if (classified % 25 === 0) console.log(`  classified ${classified}/${portals.length}`);
    await sleep(120);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

const dist = Object.values(verdicts).reduce((a, v) => { a[v] = (a[v] || 0) + 1; return a; }, {});
// ARCHIVE only what the gate CONFIRMS is not an item: portal + error-page artifact. 'uncertain'
// is NOT archived (archiving on uncertainty is the bug-class inverted) — flagged for review,
// same as a classify-inconclusive. KEEP specific_document (legit content).
const toArchive = portals.filter((p) => ["portal", "artifact"].includes(verdicts[p.id]));
const keep = portals.filter((p) => verdicts[p.id] === "specific_document");
const flagged = portals.filter((p) => ["uncertain", "inconclusive"].includes(verdicts[p.id]));
console.log(`\n=== content-gate split across ${portals.length} root-URL items ===`);
console.log(`  verdict distribution: ${JSON.stringify(dist)}`);
console.log(`  -> ARCHIVE (portal + error-page artifact): ${toArchive.length}   (artifacts: ${artifacts})`);
console.log(`  -> KEEP (specific_document, legit content): ${keep.length}`);
console.log(`  -> FLAG for review, NOT archived (uncertain/inconclusive — don't conclude on uncertainty): ${flagged.length}`);
console.log(`\n  KEEP sample (legit content with a homepage source_url):`);
for (const p of keep.slice(0, 10)) console.log(`    - ${(p.title || "").slice(0, 60)} | ${p.source_url}`);

const sourcesBefore = (await pc.query(`SELECT count(*)::int n FROM public.sources`)).rows[0].n;
if (!EXECUTE) {
  console.log(`\nDRY-RUN — zero writes. Re-run with --execute to archive ${toArchive.length} (sources untouched, ${keep.length} legit kept, ${flagged.length} flagged (uncertain), not archived).`);
  await pc.end(); process.exit(0);
}

const NOTE = "[entity-gate content-cleanup 2026-06-01] Root-URL source wrongly minted as an item by the pre-gate first-fetch leak. Run through the live content gate (firstFetchClassify entity_verdict): classified portal/uncertain/error-page-artifact. Item-hood archived; SOURCE row untouched. Leak fixed at ingestion (commit 569e7f7).";
let archived = 0, held = 0;
const today = new Date().toISOString().slice(0, 10);
for (const p of toArchive) {
  if (p.provenance_status === "unverified") { held++; console.log(`  [skip-unverified #43] ${p.legacy_id || p.id.slice(0,8)}`); continue; }
  const reason = verdicts[p.id] === "artifact" ? "error_page_artifact" : "reclassified_to_source";
  const { error } = await sb.from("intelligence_items").update({ is_archived: true, archive_reason: reason, archive_note: NOTE, archived_date: today }).eq("id", p.id);
  if (error) { held++; console.log(`  [held] ${p.id}: ${error.message}`); continue; }
  const rb = await assertReadBack(`rb ${p.legacy_id || p.id.slice(0,8)}`, async () => (await sb.from("intelligence_items").select("is_archived").eq("id", p.id).maybeSingle()).data?.is_archived, true);
  if (rb.verdict === VERDICT.PASS) archived++; else { held++; console.log(`  [readback-FAIL] ${p.id}`); }
}
const sourcesAfter = (await pc.query(`SELECT count(*)::int n FROM public.sources`)).rows[0].n;
console.log(`\n=== EXECUTED ===`);
console.log(`  archived (read-back confirmed): ${archived}   held: ${held}`);
console.log(`  KEPT legit (specific_document): ${keep.length}   FLAGGED (uncertain, not archived): ${flagged.length}`);
console.log(`  SOURCE rows: before=${sourcesBefore} after=${sourcesAfter} -> untouched: ${sourcesBefore === sourcesAfter}`);
await pc.end();
process.exit(sourcesBefore === sourcesAfter && held === 0 ? 0 : 1);
