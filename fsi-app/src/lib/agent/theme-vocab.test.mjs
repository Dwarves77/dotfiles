// @ts-check
// THEME-VOCAB DRIFT GUARD (Wave-α C3) — parser vocab == DB CHECK vocab == prompt guidance, with
// metadata-vocab.ts as the ONE home (url-canon.test.mjs pattern: parse the migration, assert the
// mirrors). The retired defect: parse-output.ts validated `theme` against the 7 TOPIC-TAG values (a
// vocabulary DISJOINT from the DB CHECK), so toDbTheme() nulled every agent-emitted theme and
// /research theme routing never received pipeline data (CODE-1 F-10).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  DB_THEME_VALUE_LIST,
  THEME_CANDIDATE_DETERMINISTIC_MAP,
  toDbTheme,
  toThemeCandidate,
} from "./metadata-vocab.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(HERE, p), "utf8");

const migration102 = read("../../../supabase/migrations/102_severity_band_theme_columns.sql");
const parseOutput = read("./parse-output.ts");
const systemPrompt = read("./system-prompt.ts");

test("DB SIDE — migration 102 theme CHECK values == DB_THEME_VALUE_LIST exactly", () => {
  const checkBlock = migration102.match(/intelligence_items_theme_check\s+CHECK \(theme IS NULL OR theme IN \(([\s\S]*?)\)\)/);
  assert.ok(checkBlock, "could not locate the theme CHECK in migration 102");
  const sqlValues = [...checkBlock[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(sqlValues, [...DB_THEME_VALUE_LIST].sort(),
    "the DB CHECK vocabulary and metadata-vocab DB_THEME_VALUE_LIST must be the same set");
});

test("PARSER — parse-output.ts imports the vocabulary from metadata-vocab (no disjoint local list)", () => {
  // NB: includes()-based (not a `from "./..."` regex) so the glob-portability guard doesn't read this
  // test's own assertion text as a non-portable import.
  assert.ok(parseOutput.includes("DB_THEME_VALUE_LIST") && parseOutput.includes("metadata-vocab"),
    "parse-output.ts must import DB_THEME_VALUE_LIST from ./metadata-vocab");
  assert.ok(/const THEME_VALUES = DB_THEME_VALUE_LIST/.test(parseOutput),
    "parse-output.ts THEME_VALUES must BE the DB vocabulary");
  assert.ok(!/const THEME_VALUES = TOPIC_TAG_VALUES/.test(parseOutput),
    "the retired disjoint vocabulary (THEME_VALUES = TOPIC_TAG_VALUES) must not return");
});

test("PROMPT — system prompt theme guidance names every DB theme value and no longer mirrors topic_tags", () => {
  for (const v of DB_THEME_VALUE_LIST) {
    assert.ok(systemPrompt.includes(v), `system-prompt.ts theme guidance must name "${v}"`);
  }
  assert.ok(!systemPrompt.includes("same 7 values as topic_tags"),
    "system-prompt.ts must not describe theme as mirroring topic_tags");
});

test("BOUNDARY — toDbTheme passes DB values through and nulls (banks) the retired topic-tag values", () => {
  for (const v of DB_THEME_VALUE_LIST) assert.equal(toDbTheme(v), v);
  for (const legacy of ["emissions", "fuels", "transport", "reporting", "packaging", "corridors", "research"]) {
    assert.equal(toDbTheme(legacy), null, `legacy topic tag "${legacy}" must not force-fit into theme`);
    assert.equal(toThemeCandidate(legacy), legacy, `legacy topic tag "${legacy}" must bank in theme_candidate`);
  }
});

test("BACKFILL MAP — deterministic map targets are DB-valid; keys are legacy-only; ambiguous candidates absent", () => {
  const dbSet = new Set(DB_THEME_VALUE_LIST);
  for (const [legacy, db] of Object.entries(THEME_CANDIDATE_DETERMINISTIC_MAP)) {
    assert.ok(dbSet.has(db), `map target "${db}" must be a DB theme`);
    assert.ok(!dbSet.has(legacy), `map key "${legacy}" must be a legacy candidate, not a DB theme`);
  }
  // The ambiguous legacy values must NOT be mapped (guessing on a customer-routing column is forbidden).
  for (const ambiguous of ["emissions", "reporting", "transport", "corridors", "research"]) {
    assert.ok(!(ambiguous in THEME_CANDIDATE_DETERMINISTIC_MAP),
      `ambiguous legacy candidate "${ambiguous}" must stay banked, never backfilled by guess`);
  }
});
