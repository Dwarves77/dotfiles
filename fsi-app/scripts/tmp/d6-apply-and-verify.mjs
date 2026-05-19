// D6: apply migration 084, verify parity (counts of items routed per surface).

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

const PRE_MARKET = `
  SELECT ii.id, ii.title, s.name AS source_name
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE ii.is_archived = false
    AND s.source_role IN ('trade_press','industry_data_provider','vendor_corporate','industry_association')
    AND NOT (
      LOWER(s.name) LIKE '%freightwaves%'
      OR LOWER(s.name) LIKE '%loadstar%'
      OR LOWER(s.name) LIKE '%greenbiz%'
      OR LOWER(s.name) LIKE '%environmental finance%'
      OR LOWER(s.name) LIKE '%splash247%'
      OR LOWER(s.name) LIKE '%supply chain digital%'
      OR LOWER(s.name) LIKE '%edie%'
      OR LOWER(s.name) LIKE '%reuters sustainable business%'
    )
`;

const PRE_OPERATIONS = `
  SELECT ii.id, ii.title, s.name AS source_name
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE ii.is_archived = false
    AND s.source_role = 'statistical_data_agency'
    AND NOT (
      LOWER(s.name) LIKE '%carbon trust%'
      OR LOWER(s.name) LIKE '%project drawdown%'
    )
`;

const PRE_RESEARCH = `
  SELECT id, title, source_name FROM (
    SELECT ii.id, ii.title, s.name AS source_name
    FROM public.intelligence_items ii
    JOIN public.sources s ON s.id = ii.source_id
    WHERE ii.is_archived = false
      AND s.source_role IN ('intergovernmental_body', 'academic_research')
      AND NOT (LOWER(s.name) LIKE '%imo%' OR LOWER(s.name) LIKE '%icao%')
    UNION
    SELECT ii.id, ii.title, s.name FROM public.intelligence_items ii JOIN public.sources s ON s.id = ii.source_id
    WHERE ii.is_archived = false AND s.source_role = 'standards_body' AND COALESCE(ii.status, 'monitoring') NOT IN ('in_force', 'adopted')
    UNION
    SELECT ii.id, ii.title, s.name FROM public.intelligence_items ii JOIN public.sources s ON s.id = ii.source_id
    WHERE ii.is_archived = false AND s.source_role = 'primary_legal_authority' AND ii.status = 'proposed'
    UNION
    SELECT ii.id, ii.title, s.name FROM public.intelligence_items ii JOIN public.sources s ON s.id = ii.source_id
    WHERE ii.is_archived = false AND s.source_role = 'trade_press'
      AND (
        LOWER(s.name) LIKE '%freightwaves%' OR LOWER(s.name) LIKE '%loadstar%' OR LOWER(s.name) LIKE '%greenbiz%'
        OR LOWER(s.name) LIKE '%environmental finance%' OR LOWER(s.name) LIKE '%splash247%'
        OR LOWER(s.name) LIKE '%supply chain digital%' OR LOWER(s.name) LIKE '%edie%'
        OR LOWER(s.name) LIKE '%reuters sustainable business%'
      )
    UNION
    SELECT ii.id, ii.title, s.name FROM public.intelligence_items ii JOIN public.sources s ON s.id = ii.source_id
    WHERE ii.is_archived = false AND s.source_role = 'statistical_data_agency'
      AND (LOWER(s.name) LIKE '%carbon trust%' OR LOWER(s.name) LIKE '%project drawdown%')
  ) merged
`;

const POST_MARKET = `
  SELECT ii.id, ii.title, s.name AS source_name
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE ii.is_archived = false AND s.category = 'market_news'
`;

const POST_OPERATIONS = `
  SELECT ii.id, ii.title, s.name AS source_name
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE ii.is_archived = false AND s.category = 'operational_data'
`;

const POST_RESEARCH = `
  SELECT ii.id, ii.title, s.name AS source_name
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE ii.is_archived = false AND (
    s.category = 'research'
    OR (s.source_role = 'standards_body' AND COALESCE(ii.status, 'monitoring') NOT IN ('in_force', 'adopted'))
    OR (s.source_role = 'primary_legal_authority' AND ii.status = 'proposed')
  )
`;

try {
  out.pre = {
    market: (await client.query(PRE_MARKET)).rows,
    research: (await client.query(PRE_RESEARCH)).rows,
    operations: (await client.query(PRE_OPERATIONS)).rows,
  };
  out.pre_counts = {
    market: out.pre.market.length,
    research: out.pre.research.length,
    operations: out.pre.operations.length,
  };

  const migrationSql = readFileSync("supabase/migrations/084_sources_canonical_category.sql", "utf8");
  await client.query(migrationSql);
  out.migration_applied = true;

  out.category_distribution = (await client.query(`
    SELECT COALESCE(category, '__NULL__') AS category, COUNT(*)::int AS n
    FROM public.sources GROUP BY category ORDER BY n DESC
  `)).rows;

  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
     VALUES ('084', 'sources_canonical_category', NULL)
     ON CONFLICT (version) DO NOTHING`
  );

  out.post = {
    market: (await client.query(POST_MARKET)).rows,
    research: (await client.query(POST_RESEARCH)).rows,
    operations: (await client.query(POST_OPERATIONS)).rows,
  };
  out.post_counts = {
    market: out.post.market.length,
    research: out.post.research.length,
    operations: out.post.operations.length,
  };

  const setOf = (arr) => new Set(arr.map(r => r.id));
  const compare = (pre, post) => {
    const preIds = setOf(pre);
    const postIds = setOf(post);
    const onlyInPre = [...preIds].filter(id => !postIds.has(id));
    const onlyInPost = [...postIds].filter(id => !preIds.has(id));
    return {
      pre_count: preIds.size,
      post_count: postIds.size,
      parity: onlyInPre.length === 0 && onlyInPost.length === 0,
      only_in_pre: onlyInPre.slice(0, 5),
      only_in_post: onlyInPost.slice(0, 5),
    };
  };

  out.parity = {
    market: compare(out.pre.market, out.post.market),
    research: compare(out.pre.research, out.post.research),
    operations: compare(out.pre.operations, out.post.operations),
  };

  out.parity_overall = out.parity.market.parity && out.parity.research.parity && out.parity.operations.parity;

  if (!out.parity_overall) {
    out.warning = "Parity FAILED on at least one surface";
  }
} catch (err) {
  out.error = err.message;
  out.error_stack = err.stack;
} finally {
  await client.end();
  const printable = { ...out };
  delete printable.pre;
  delete printable.post;
  console.log(JSON.stringify(printable, null, 2));
  const fs = await import("node:fs");
  fs.writeFileSync("scripts/tmp/d6-apply-and-verify-output.json", JSON.stringify(out, null, 2));
}
