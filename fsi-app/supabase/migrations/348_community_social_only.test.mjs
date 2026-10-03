// 348_community_social_only.test.mjs -- static proof of migration 348 (ADR-041, Community is social
// only), by parsing the SQL file directly: no database, no SQL parser dependency. Same discipline as
// 346_research_assessments_entity_spine_signposts.test.mjs. It proves the migration drops exactly the
// objects ADR-041 names, keeps the repost link, touches no other table, and carries a self-check that
// would abort on a half-applied state.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(
  fileURLToPath(new URL("./348_community_social_only.sql", import.meta.url)),
  "utf8",
);

/** The executable SQL: every `--` line comment removed. */
const SQL = RAW.split("\n")
  .map((l) => {
    const i = l.indexOf("--");
    return i === -1 ? l : l.slice(0, i);
  })
  .join("\n");

const DROPPED_COLUMNS = ["promoted_at", "promoted_to_item_id", "promotion_state", "stance", "origin_class"];

test("header carries a subject line, cites ADR-041, and states it is applied AFTER the PR merges", () => {
  assert.match(RAW, /^-- subject: Migration 348 /);
  assert.match(RAW, /ADR-041/);
  assert.match(RAW, /applied AFTER the C-SOCIAL PR merges/);
  assert.match(RAW, /columns the\n-- OLD code read/);
});

test("runs in one transaction", () => {
  assert.equal((SQL.match(/^BEGIN;/gm) ?? []).length, 1);
  assert.equal((SQL.match(/^COMMIT;/gm) ?? []).length, 1);
  assert.ok(SQL.indexOf("BEGIN;") < SQL.indexOf("COMMIT;"));
});

test("drops post_promotions and nothing else as a table", () => {
  assert.match(SQL, /DROP TABLE IF EXISTS public\.post_promotions;/);
  assert.equal((SQL.match(/^DROP TABLE/gm) ?? []).length, 1);
});

test("drops the two community_posts indexes by their real migration names, before the columns", () => {
  const promotedIdx = SQL.indexOf("DROP INDEX IF EXISTS public.idx_community_posts_promoted_to_item;");
  const stateIdx = SQL.indexOf("DROP INDEX IF EXISTS public.idx_community_posts_promotion_state;");
  const alter = SQL.indexOf("ALTER TABLE public.community_posts");
  assert.ok(promotedIdx >= 0 && stateIdx >= 0 && alter >= 0);
  assert.ok(promotedIdx < alter && stateIdx < alter);
});

test("drops exactly the five columns from community_posts", () => {
  const m = /ALTER TABLE public\.community_posts\s+([\s\S]*?);/.exec(SQL);
  assert.ok(m, "ALTER TABLE public.community_posts block not found");
  const dropped = [...m[1].matchAll(/DROP COLUMN IF EXISTS (\w+)/g)].map((x) => x[1]).sort();
  assert.deepEqual(dropped, [...DROPPED_COLUMNS].sort());
});

test("keeps promoted_from_post_id (the repost link inside Community) and touches no other table", () => {
  assert.doesNotMatch(SQL, /promoted_from_post_id/);
  const altered = [...SQL.matchAll(/ALTER TABLE\s+(\S+)/g)].map((x) => x[1]);
  assert.deepEqual(altered, ["public.community_posts"]);
  assert.doesNotMatch(SQL, /intelligence_items|staged_updates|sources\b/);
});

test("self-check asserts post_promotions is absent and all five columns are gone", () => {
  assert.match(SQL, /to_regclass\('public\.post_promotions'\) IS NOT NULL/);
  for (const c of DROPPED_COLUMNS) assert.ok(SQL.includes(`'${c}'`), `self-check must name ${c}`);
  assert.match(SQL, /RAISE EXCEPTION 'ABORT: post_promotions still exists/);
  assert.match(SQL, /RAISE EXCEPTION 'ABORT: % promotion column\(s\) still exist/);
});
