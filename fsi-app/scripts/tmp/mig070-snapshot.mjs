// Migration 070 reconstruction: snapshot live-DB state of the 3 RPCs that
// 070 originally created (per git history blob d51bccf, commit 651ae78).
// Verification artifact only — the reconstructed file uses the original
// git-history blob as canonical source, not this snapshot. The snapshot
// confirms the live functions exist and surfaces their current bodies
// (which reflect 071 + 073 CREATE OR REPLACE layers over 070's original).
//
// Pattern: OBS-12 canonical, session-mode pooler (port 5432). READ-ONLY.
// Reads credentials from the main repo via absolute paths.

import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const FSI_APP = "C:/Users/jason/dotfiles/fsi-app";

const DB_PASSWORD = readFileSync(`${FSI_APP}/.env.local`, "utf8")
  .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync(`${FSI_APP}/supabase/.temp/pooler-url`, "utf8").trim();
const PROJECT_REF = readFileSync(`${FSI_APP}/supabase/.temp/project-ref`, "utf8").trim();
const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);

const RPC_NAMES = [
  "get_workspace_intelligence_dashboard",
  "get_workspace_intelligence_listings",
  "get_market_intel_items",
  "get_research_items",
  "get_operations_items",
];

const client = new pg.Client({ connectionString });
await client.connect();

const result = await client.query(
  `
  SELECT
    p.proname                              AS name,
    pg_get_function_arguments(p.oid)       AS args,
    pg_get_function_result(p.oid)          AS result_type,
    pg_get_functiondef(p.oid)              AS definition,
    p.prosecdef                            AS security_definer,
    l.lanname                              AS language
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language  l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND p.proname = ANY($1::text[])
  ORDER BY p.proname;
  `,
  [RPC_NAMES]
);

await client.end();

const snapshot = {
  generated_at: new Date().toISOString(),
  purpose:
    "Migration 070 reconstruction verification snapshot. The 3 RPCs that 070 originally created are confirmed live; the 2 prior RPCs (dashboard/listings from 064/066) are also captured for context. Function bodies here reflect post-073 state (071+073 CREATE OR REPLACE layers); the reconstructed migration file uses the original git-history source for 070's body.",
  git_history_source: {
    commit: "651ae78",
    blob: "d51bccf2233b19f5cb55853e79d2f5221b2626ec",
    path: "fsi-app/supabase/migrations/070_phase1_routing_rpcs.sql",
    lines: 308,
  },
  expected_070_originals: [
    "get_research_items",
    "get_market_intel_items",
    "get_operations_items",
  ],
  prior_migration_originals: {
    get_workspace_intelligence_dashboard: "064 (LIMIT 50)",
    get_workspace_intelligence_listings: "066 (no LIMIT)",
  },
  found_count: result.rows.length,
  expected_count: RPC_NAMES.length,
  parity: result.rows.length === RPC_NAMES.length ? "OK" : "MISSING",
  functions: result.rows.map((r) => ({
    name: r.name,
    args: r.args,
    result_type: r.result_type,
    security_definer: r.security_definer,
    language: r.language,
    definition_length: r.definition.length,
    definition_first_400: r.definition.slice(0, 400),
  })),
  full_definitions: Object.fromEntries(
    result.rows.map((r) => [r.name, r.definition])
  ),
};

const outPath = "C:/Users/jason/dotfiles-mig070/fsi-app/scripts/tmp/mig070-snapshot.json";
writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
console.log(
  JSON.stringify(
    {
      parity: snapshot.parity,
      found: snapshot.found_count,
      expected: snapshot.expected_count,
      out: outPath,
    },
    null,
    2
  )
);
