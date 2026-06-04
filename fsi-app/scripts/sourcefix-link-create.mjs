/**
 * sourcefix-link-create.mjs — close the no-source_id gap.
 *
 * WHY: 28 active intelligence_items have a source_url but no source_id FK (minted
 * by the scan/seed path without enforcing "sources produce items"). Every one has
 * a known source URL — the link is just missing.
 *
 * FIX, two buckets:
 *   A. LINK to an existing registered source (exact-url or same-domain match).
 *   B. CREATE the source (classified by domain), then link. These are real official
 *      portals that belong in the registry.
 *
 * Per-row: UPDATE intelligence_items SET source_id=$src WHERE id=$id AND source_id
 * IS NULL, then read-back assert. Sources created status='active', auto_run_enabled
 * =false (cold-start default — not auto-scanned until enabled).
 *
 * SAFETY: --dry-run (DEFAULT) writes nothing. --execute --confirm persists.
 * Idempotent: skips items that already have a source_id. dev+prod = ONE Supabase.
 *
 *   node scripts/sourcefix-link-create.mjs                 # dry run
 *   node scripts/sourcefix-link-create.mjs --execute --confirm
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
const CONFIRM = argv.includes("--confirm");
if (EXECUTE && !CONFIRM) { console.error("--execute requires --confirm (durable prod write)."); process.exit(2); }

const dom = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } };
const norm = (u) => (u || "").replace(/[/]+$/, "");

// Bucket B classification: unregistered domain -> source registry row.
// gov ministry/regulator -> T2 primary_legal_authority; press portal -> government_press;
// industry alliance -> T4 industry_association; academic -> T5 academic_research; vendor -> T6.
const CLASSIFY = {
  "mas.gov.sg": { name: "Monetary Authority of Singapore (MAS)", base_tier: 2, category: "regulatory", source_role: "primary_legal_authority" },
  "moccae.gov.ae": { name: "UAE Ministry of Climate Change and Environment (MOCCAE)", base_tier: 2, category: "regulatory", source_role: "primary_legal_authority" },
  "pib.gov.in": { name: "Press Information Bureau, Government of India (PIB)", base_tier: 2, category: "regulatory", source_role: "government_press" },
  "infrastructure.gov.au": { name: "Australian Government — Department of Infrastructure, Transport, Regional Development", base_tier: 2, category: "regulatory", source_role: "primary_legal_authority" },
  "meti.go.jp": { name: "Japan Ministry of Economy, Trade and Industry (METI)", base_tier: 2, category: "regulatory", source_role: "primary_legal_authority" },
  "mee.gov.cn": { name: "China Ministry of Ecology and Environment (MEE)", base_tier: 2, category: "regulatory", source_role: "primary_legal_authority" },
  "commerce.gov.in": { name: "India Ministry of Commerce and Industry", base_tier: 2, category: "regulatory", source_role: "primary_legal_authority" },
  "uae.gov.ae": { name: "United Arab Emirates Government Portal (uae.gov.ae)", base_tier: 2, category: "regulatory", source_role: "primary_legal_authority" },
  "canada.ca": { name: "Government of Canada (canada.ca)", base_tier: 2, category: "regulatory", source_role: "primary_legal_authority" },
  "safa.aero": { name: "Sustainable Air Freight Alliance (SAFA)", base_tier: 4, category: "operational_data", source_role: "industry_association" },
  "sciencedirect.com": { name: "ScienceDirect (Elsevier)", base_tier: 5, category: "research", source_role: "academic_research" },
  "ecoenclose.com": { name: "EcoEnclose (sustainable packaging vendor)", base_tier: 6, category: "market_news", source_role: "vendor_corporate" },
};

const client = new pg.Client({ connectionString: CONN });
await client.connect();
const stats = { linked_existing: 0, created_sources: 0, linked_new: 0, unclassified: 0 };
try {
  console.log(`MODE: ${EXECUTE ? "EXECUTE (durable)" : "DRY RUN (nothing written)"}`);
  const { rows: items } = await client.query(
    "SELECT id, legacy_id, title, source_url FROM public.intelligence_items WHERE is_archived=false AND source_id IS NULL AND source_url IS NOT NULL");
  const { rows: srcs } = await client.query("SELECT id, name, url FROM public.sources");
  const byUrl = new Map(), byDom = new Map();
  for (const sr of srcs) { if (sr.url) { byUrl.set(norm(sr.url), sr); const d = dom(sr.url); if (d && !byDom.has(d)) byDom.set(d, sr); } }

  // group items: bucket A (existing match) vs bucket B (by unregistered domain)
  const bucketA = [], bucketBByDom = {};
  for (const it of items) {
    const u = norm(it.source_url), d = dom(it.source_url);
    const match = byUrl.get(u) || byDom.get(d);
    if (match) bucketA.push({ it, src: match });
    else (bucketBByDom[d] = bucketBByDom[d] || []).push(it);
  }
  console.log(`no-source items: ${items.length}  | bucket A (link existing): ${bucketA.length}  | bucket B (create): ${items.length - bucketA.length} across ${Object.keys(bucketBByDom).length} domains\n`);

  // ── Bucket A: link to existing source ──
  for (const { it, src } of bucketA) {
    const tag = `[${it.legacy_id || it.id.slice(0, 8)}]`;
    if (EXECUTE) {
      const r = await client.query("UPDATE public.intelligence_items SET source_id=$1, updated_at=now() WHERE id=$2 AND source_id IS NULL RETURNING source_id", [src.id, it.id]);
      const ok = r.rows[0]?.source_id === src.id;
      if (!ok) { console.error(`${tag} HALT — link read-back mismatch`); process.exit(1); }
      stats.linked_existing++;
      console.log(`${tag} LINKED -> "${src.name}" ✓`);
    } else {
      stats.linked_existing++;
      console.log(`${tag} would link -> "${src.name}"`);
    }
  }

  // ── Bucket B: create source per domain, then link ──
  for (const [d, its] of Object.entries(bucketBByDom)) {
    const c = CLASSIFY[d];
    if (!c) { stats.unclassified++; console.log(`  [domain ${d}] NOT CLASSIFIED — ${its.length} item(s) left unsourced (add to CLASSIFY): ${its.map((x) => x.legacy_id || x.id.slice(0, 8)).join(",")}`); continue; }
    const url = `https://${d}`;
    let srcId;
    if (EXECUTE) {
      const ins = await client.query(
        `INSERT INTO public.sources (name, url, description, base_tier, effective_tier, tier, tier_at_creation, status,
           category, source_role, update_frequency, access_method, admin_only, processing_paused, auto_run_enabled)
         VALUES ($1,$2,$3,$4,$4,$4,$4,'active',$5,$6,'ad-hoc','scrape',false,false,false) RETURNING id`,
        [c.name, url, `Auto-registered to close the no-source gap (sourcefix). ${c.source_role} portal for freight-sustainability intelligence.`, c.base_tier, c.category, c.source_role]);
      srcId = ins.rows[0].id;
      stats.created_sources++;
      console.log(`  CREATED source "${c.name}" (T${c.base_tier} ${c.category}/${c.source_role}) ${url}`);
    } else {
      stats.created_sources++;
      console.log(`  would CREATE "${c.name}" (T${c.base_tier} ${c.category}/${c.source_role}) for ${its.length} item(s)`);
    }
    for (const it of its) {
      const tag = `[${it.legacy_id || it.id.slice(0, 8)}]`;
      if (EXECUTE) {
        const r = await client.query("UPDATE public.intelligence_items SET source_id=$1, updated_at=now() WHERE id=$2 AND source_id IS NULL RETURNING source_id", [srcId, it.id]);
        if (r.rows[0]?.source_id !== srcId) { console.error(`${tag} HALT — link read-back mismatch`); process.exit(1); }
        stats.linked_new++;
        console.log(`    ${tag} LINKED ✓`);
      } else { stats.linked_new++; console.log(`    ${tag} would link`); }
    }
  }

  // verify
  const { rows: remain } = await client.query("SELECT count(*)::int n FROM public.intelligence_items WHERE is_archived=false AND source_id IS NULL");
  console.log(`\n${"=".repeat(56)}`);
  console.log(`linked_existing=${stats.linked_existing} created_sources=${stats.created_sources} linked_new=${stats.linked_new} unclassified=${stats.unclassified}`);
  console.log(`no-source items remaining (live): ${remain[0].n}${EXECUTE ? "" : "  (dry-run — unchanged)"}`);
  console.log(EXECUTE ? "EXECUTE complete." : "DRY RUN — re-run with --execute --confirm.");
} finally { await client.end(); }
