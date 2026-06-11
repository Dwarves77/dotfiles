/** A6 BACKFILL (pg-direct, robust). Re-stamp every FACT claim's source_tier_at_grounding + source_id from
 *  the canonical resolver (src/lib/sources/institution.ts), then revalidate the corpus. Uses the DIRECT
 *  Postgres connection (not REST) because the per-row set_provenance_status_claims_trg re-validates on every
 *  claim UPDATE and times out PostgREST on batched writes. Approach: disable the claims trigger, bulk-UPDATE
 *  via a temp table (fast, no per-row validate), re-enable, then ONE server-side revalidation
 *  (UPDATE intelligence_items SET provenance_status = (validate_item_provenance(id)).recommended_status).
 *  This ships the corpus revalidation WITH the gate change (status-is-a-cache rule). Snapshots prior stamps
 *  to scripts/_snapshots for reversibility. GOVERNING: source-credibility-model + remediation-discipline.
 *  --apply to commit. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { createJiti } from "jiti";
import pg from "pg";
import { readAll } from "./lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { buildResolver } = await jiti.import("../src/lib/sources/institution.ts");

// 1. resolve every FACT claim in JS
const sources = await readAll("sources", "id,url,base_tier,effective_tier,tier_override");
const claims = await readAll("section_claim_provenance", "id,claim_kind,search_result_id,source_tier_at_grounding,source_id");
const searches = await readAll("agent_run_searches", "id,result_url");
const searchById = new Map(searches.map((r) => [r.id, r]));
const resolver = buildResolver(sources);
const changes = [];
const hist = {};
for (const c of claims) {
  if (c.claim_kind !== "FACT") continue;
  const sr = searchById.get(c.search_result_id);
  const { tier, sourceId } = sr ? resolver.resolveSpan(sr.result_url) : { tier: null, sourceId: null };
  hist[tier ?? "null"] = (hist[tier ?? "null"] || 0) + 1;
  if (c.source_tier_at_grounding !== tier || c.source_id !== sourceId)
    changes.push({ id: c.id, tier, sourceId, oldTier: c.source_tier_at_grounding, oldSource: c.source_id });
}
console.log(`\n===== A6 BACKFILL pg-direct (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`FACT claims ${claims.filter((c) => c.claim_kind === "FACT").length} | re-stamp ${changes.length} | resolved-tier ${JSON.stringify(hist)}`);
if (!APPLY) { console.log("\nDRY-RUN — pass --apply."); process.exit(0); }

// snapshot prior stamps (reversibility)
const snapDir = resolve(ROOT, "scripts/_snapshots"); mkdirSync(snapDir, { recursive: true });
const snapFile = resolve(snapDir, `a6-claim-tiers-prior.jsonl`);
writeFileSync(snapFile, changes.map((c) => JSON.stringify({ id: c.id, source_tier_at_grounding: c.oldTier, source_id: c.oldSource })).join("\n") + "\n");
console.log(`snapshot: ${snapFile} (${changes.length} prior rows)`);

// 2. pg connect (apply-migrations candidate set)
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const candidates = [
  `postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`,
  ...["us-east-1","us-east-2","us-west-1","eu-central-1","eu-west-1","eu-west-2","ap-southeast-1","ap-southeast-2"].map((r) => `postgresql://postgres.${ref}:${pw}@aws-0-${r}.pooler.supabase.com:5432/postgres`),
];
let client;
for (const cs of candidates) {
  const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try { await c.connect(); client = c; console.log(`connected via ${cs.split("@")[1].split("/")[0]}`); break; } catch { try { await c.end(); } catch {} }
}
if (!client) { console.error("no DB connection"); process.exit(1); }

try {
  await client.query("SET statement_timeout = 0");
  // verified-before set (for the flip list)
  const before = (await client.query("SELECT id, legacy_id, title, item_type FROM public.intelligence_items WHERE NOT is_archived AND provenance_status='verified'")).rows;
  const beforeVerified = new Set(before.map((r) => r.id));

  await client.query("BEGIN");
  await client.query("ALTER TABLE public.section_claim_provenance DISABLE TRIGGER set_provenance_status_claims_trg");
  await client.query("CREATE TEMP TABLE _tb (claim_id uuid PRIMARY KEY, tier int, source_id uuid) ON COMMIT DROP");
  // batched parameterized inserts into the temp table
  for (let i = 0; i < changes.length; i += 1000) {
    const batch = changes.slice(i, i + 1000);
    const vals = batch.map((_, j) => `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`).join(",");
    const params = batch.flatMap((c) => [c.id, c.tier, c.sourceId]);
    await client.query(`INSERT INTO _tb (claim_id, tier, source_id) VALUES ${vals}`, params);
  }
  const upd = await client.query("UPDATE public.section_claim_provenance scp SET source_tier_at_grounding=t.tier, source_id=t.source_id FROM _tb t WHERE scp.id=t.claim_id");
  await client.query("ALTER TABLE public.section_claim_provenance ENABLE TRIGGER set_provenance_status_claims_trg");
  console.log(`stamped ${upd.rowCount} claim rows (trigger disabled during bulk).`);

  // 3. corpus revalidation (server-side, one statement)
  await client.query(`UPDATE public.intelligence_items i
      SET provenance_status = v.rec
      FROM (SELECT id, (validate_item_provenance(id)).recommended_status AS rec
              FROM public.intelligence_items WHERE NOT is_archived) v
     WHERE i.id = v.id AND i.provenance_status IS DISTINCT FROM v.rec`);
  await client.query("COMMIT");

  // 4. flip list = verified-before now quarantined
  const afterQ = (await client.query("SELECT id, legacy_id, title, item_type FROM public.intelligence_items WHERE provenance_status='quarantined' AND NOT is_archived")).rows;
  const flips = afterQ.filter((r) => beforeVerified.has(r.id));
  console.log(`\nrevalidation: ${flips.length} item(s) flipped verified->quarantined.`);
  console.log(`=== FLIP LIST (actual) ===`);
  for (const it of flips.sort((a, b) => (a.title || "").localeCompare(b.title || "")))
    console.log(`  ${(it.legacy_id || it.id.slice(0, 8)).padEnd(20)} ${String(it.item_type).padEnd(12)} ${(it.title || "").slice(0, 46)}`);
  console.log(`\nAPPLIED.`);
} catch (e) {
  try { await client.query("ALTER TABLE public.section_claim_provenance ENABLE TRIGGER set_provenance_status_claims_trg"); } catch {}
  try { await client.query("ROLLBACK"); } catch {}
  console.error("FAILED:", e.message);
  process.exit(1);
} finally { await client.end(); }
process.exit(0);
