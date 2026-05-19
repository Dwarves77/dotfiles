// Phase 5 helper: toggle system_state.global_processing_paused
// Usage: node phase-5-toggle-pause.mjs on|off

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const target = process.argv[2];
if (!["on", "off"].includes(target)) {
  console.error("Usage: node phase-5-toggle-pause.mjs on|off");
  process.exit(2);
}
const newValue = target === "on";

const DB_PASSWORD = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
  .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync(resolve(process.cwd(), "supabase/.temp/pooler-url"), "utf8").trim();
const PROJECT_REF = readFileSync(resolve(process.cwd(), "supabase/.temp/project-ref"), "utf8").trim();
const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);

const client = new pg.Client({ connectionString });
await client.connect();
const before = (await client.query(
  `SELECT global_processing_paused FROM public.system_state WHERE id = true`
)).rows[0];
await client.query(
  `UPDATE public.system_state SET global_processing_paused = $1, updated_at = now() WHERE id = true`,
  [newValue]
);
const after = (await client.query(
  `SELECT global_processing_paused, updated_at FROM public.system_state WHERE id = true`
)).rows[0];
await client.end();
console.log(JSON.stringify({ target, before, after }, null, 2));
