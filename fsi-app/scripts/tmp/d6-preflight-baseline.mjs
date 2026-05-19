// D6 pre-flight: capture baseline routing (counts + sample ids per category)
// before migration 084 lands, so we can verify parity after.

import { readFileSync } from "node:fs";
import pg from "pg";

const MAIN_REPO_FSI = "C:/Users/jason/dotfiles/fsi-app";
const DB_PASSWORD = readFileSync(`${MAIN_REPO_FSI}/.env.local`, "utf8")
  .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync(`${MAIN_REPO_FSI}/supabase/.temp/pooler-url`, "utf8").trim();
const PROJECT_REF = readFileSync(`${MAIN_REPO_FSI}/supabase/.temp/project-ref`, "utf8").trim();
const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);

const client = new pg.Client({ connectionString });
await client.connect();
const out = {};

try {
  out.rpc_bodies = (await client.query(`
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_market_intel_items', 'get_research_items', 'get_operations_items')
    ORDER BY p.proname
  `)).rows;

  out.sources_role_distribution = (await client.query(`
    SELECT COALESCE(source_role, '__NULL__') AS source_role, COUNT(*)::int AS n
    FROM public.sources
    GROUP BY source_role
    ORDER BY n DESC
  `)).rows;

  out.totals = (await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public.sources) AS sources_total,
      (SELECT COUNT(*)::int FROM public.intelligence_items WHERE is_archived = false) AS active_items
  `)).rows[0];

  const orgId = "a0000000-0000-0000-0000-000000000001";
  out.org_id = orgId;

  for (const rpc of ['get_market_intel_items', 'get_research_items', 'get_operations_items']) {
    try {
      const rows = (await client.query(`SELECT * FROM public.${rpc}($1)`, [orgId])).rows;
      out[`${rpc}_count`] = rows.length;
      out[`${rpc}_sample_ids`] = rows.slice(0, 10).map(r => r.id);
      const sourceIds = Array.from(new Set(rows.map(r => r.source_id).filter(x => x)));
      const names = sourceIds.length === 0 ? [] :
        (await client.query(
          `SELECT id, name FROM public.sources WHERE id = ANY($1)`,
          [sourceIds]
        )).rows;
      out[`${rpc}_source_names`] = names.map(n => n.name);
    } catch (e) {
      out[`${rpc}_error`] = e.message;
    }
  }

  const RESEARCH_BOUND_INTERGOV = ['imo', 'icao'];
  const RESEARCH_BOUND_TRADE_PRESS = [
    'freightwaves', 'loadstar', 'greenbiz', 'environmental finance',
    'splash247', 'supply chain digital', 'edie', 'reuters sustainable business'
  ];
  const RESEARCH_BOUND_STAT_AGENCY = ['carbon trust', 'project drawdown'];

  const matchSources = async (patterns) => {
    const where = patterns.map((_, i) => `LOWER(name) LIKE '%' || $${i + 1} || '%'`).join(' OR ');
    return (await client.query(
      `SELECT id, name, source_role FROM public.sources WHERE ${where} ORDER BY name`,
      patterns
    )).rows;
  };

  out.exception_matches = {
    intergov_to_regs: await matchSources(RESEARCH_BOUND_INTERGOV),
    trade_press_to_research: await matchSources(RESEARCH_BOUND_TRADE_PRESS),
    stat_agency_to_research: await matchSources(RESEARCH_BOUND_STAT_AGENCY),
  };
} catch (err) {
  out.error = err.message;
} finally {
  await client.end();
  console.log(JSON.stringify(out, null, 2));
}
