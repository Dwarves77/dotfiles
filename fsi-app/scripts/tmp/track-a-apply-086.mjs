// Track A E2: apply migration 086 (analytical press routing) to live DB,
// backfill the schema_migrations ledger, re-run the 8-source SELECT to
// verify post-state. Pattern: d16-apply-085.mjs canonical.

import { readFileSync } from "node:fs";
import pg from "pg";

const MAIN_REPO = "C:/Users/jason/dotfiles/fsi-app";

const DB_PASSWORD = readFileSync(`${MAIN_REPO}/.env.local`, "utf8")
  .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync(`${MAIN_REPO}/supabase/.temp/pooler-url`, "utf8").trim();
const PROJECT_REF = readFileSync(`${MAIN_REPO}/supabase/.temp/project-ref`, "utf8").trim();
const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);

const ILIKE_PATTERNS = [
  "%loadstar%",
  "%freightwaves%",
  "%edie%",
  "%greenbiz%",
  "%environmental finance%",
  "%splash247%",
  "%supply chain digital%",
  "%reuters sustainable%",
];

const client = new pg.Client({ connectionString });
await client.connect();
const out = {};

try {
  // 1. Apply migration 086
  const sql = readFileSync(
    "supabase/migrations/086_analytical_press_routing.sql",
    "utf8"
  );
  await client.query(sql);
  out.applied = true;

  // 2. Backfill schema_migrations ledger
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
     VALUES ('086', 'analytical_press_routing', NULL)
     ON CONFLICT (version) DO NOTHING`
  );
  out.ledger_backfilled = true;

  // 3. Post-state verification: ALL rows matched by any of the 8 patterns
  out.post_state = (await client.query(
    `SELECT id, name, category, source_role, tier, tier_at_creation, jurisdictions
     FROM public.sources
     WHERE name ILIKE ANY($1::text[])
     ORDER BY name`,
    [ILIKE_PATTERNS]
  )).rows;

  // 4. Sanity: per-pattern coverage check (every pattern hits at least 1 row)
  const coverage = {};
  for (const pat of ILIKE_PATTERNS) {
    const r = await client.query(
      `SELECT COUNT(*)::int AS n FROM public.sources WHERE name ILIKE $1`,
      [pat]
    );
    coverage[pat] = r.rows[0].n;
  }
  out.per_pattern_coverage = coverage;

  // 5. Compliance check: every matched row should have category='research',
  //    source_role='trade_press', and tier IN (5, 6).
  out.compliance_summary = (await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE category = 'research')::int AS category_research,
       COUNT(*) FILTER (WHERE source_role = 'trade_press')::int AS role_trade_press,
       COUNT(*) FILTER (WHERE tier IN (5, 6))::int AS tier_5_or_6,
       COUNT(*) FILTER (WHERE tier = 5)::int AS tier_5,
       COUNT(*) FILTER (WHERE tier = 6)::int AS tier_6,
       COUNT(*)::int AS total
     FROM public.sources
     WHERE name ILIKE ANY($1::text[])`,
    [ILIKE_PATTERNS]
  )).rows[0];

} catch (err) {
  out.error = err.message;
  out.stack = err.stack;
} finally {
  await client.end();
  console.log(JSON.stringify(out, null, 2));
}
