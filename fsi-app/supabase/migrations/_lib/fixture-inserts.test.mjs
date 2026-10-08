// fixture-inserts.test.mjs: proof of the shared fixture checker (lane SEC-3b-F, 2026-10-08) on a synthetic migration
// tree, so the checker itself is attacked: each defect class a self-check fixture can carry (a CHECK-list violation, a
// missing NOT NULL column, an explicit NULL, an unknown column or table, a GENERATED column) is planted and must be
// reported, and the clean fixture must pass. Node builtins only (the no-npm discipline glob).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSchema, columnLists, parseInserts, parseUpdates, checkFixtures, splitTop, stripSql } from "./fixture-inserts.mjs";

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), "fixture-inserts-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

const DIR = tree({
  "001_base.sql": `
    -- a comment with a ; and 'quote
    CREATE TABLE widgets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      kind text NOT NULL CHECK (kind IN ('a', 'b')),
      note text,
      slug text NOT NULL DEFAULT 'x',
      label_key text GENERATED ALWAYS AS (lower(kind)) STORED,
      CONSTRAINT widgets_level_check CHECK (level IN ('lo', 'hi')),
      level text,
      UNIQUE (org_id, kind)
    );
    CREATE TABLE gadgets (id uuid PRIMARY KEY, tag text);
    DO $do$ BEGIN ALTER TABLE widgets ADD COLUMN hidden text NOT NULL; END $do$;`,
  "002_alter.sql": `
    ALTER TABLE widgets ADD COLUMN IF NOT EXISTS extra text NOT NULL DEFAULT '', ADD COLUMN stage text;
    ALTER TABLE public.widgets DROP CONSTRAINT IF EXISTS widgets_widgets_kind_check_unused;
    ALTER TABLE widgets DROP CONSTRAINT IF EXISTS widgets_kind_check;
    ALTER TABLE widgets ADD CONSTRAINT widgets_kind_check
      CHECK (kind = ANY (ARRAY['a'::text, 'b'::text, 'c'::text]));
    ALTER TABLE widgets ALTER COLUMN note SET NOT NULL;
    ALTER TABLE widgets ALTER COLUMN note SET DEFAULT 'n';
    ALTER TABLE widgets DROP COLUMN stage;
    DROP TABLE gadgets;`,
});
const SCHEMA = buildSchema(DIR);

test("schema: columns, NOT NULL, defaults, generated columns and IN-list CHECKs are rebuilt in file order; dollar-quoted bodies are ignored", () => {
  const w = SCHEMA.tables.get("widgets");
  assert.ok(w && !SCHEMA.tables.has("gadgets"), "DROP TABLE removes gadgets");
  assert.deepEqual([...w.columns.keys()], ["id", "org_id", "kind", "note", "slug", "label_key", "level", "extra"]);
  assert.equal(w.columns.get("org_id").notNull, true);
  assert.equal(w.columns.get("id").notNull, true, "a PRIMARY KEY is NOT NULL");
  assert.equal(w.columns.get("note").notNull && w.columns.get("note").hasDefault, true, "SET NOT NULL and SET DEFAULT apply");
  assert.equal(w.columns.get("label_key").generated, true);
  assert.equal(w.columns.has("hidden"), false, "a column added inside a DO block is not modelled");
  assert.deepEqual([...columnLists(SCHEMA, "widgets", "kind")[0].values], ["a", "b", "c"], "the 002 ANY (ARRAY[...]) constraint replaced the inline IN list");
  assert.deepEqual([...columnLists(SCHEMA, "widgets", "level")[0].values], ["lo", "hi"], "a table-level named CHECK on one column");
});

const fixture = (sql, external = {}) => checkFixtures({ inserts: parseInserts(stripSql(sql)), updates: parseUpdates(stripSql(sql)), schema: SCHEMA, external });

test("a clean fixture passes: direct, multi-row, and inside format()", () => {
  assert.deepEqual(fixture(`
    INSERT INTO public.widgets (org_id, kind, level) VALUES (v_org, 'a', 'lo'), (v_org, 'c', NULL) RETURNING id INTO v_w;
    x(format('INSERT INTO public.widgets (org_id, kind) VALUES (%L, %L)', v_org, 'b'));
    UPDATE public.widgets SET kind = 'b' WHERE id = v_w;`), []);
});

test("red: a literal outside a CHECK list is reported, direct and through format() and UPDATE (the 370 apply-3 shape)", () => {
  assert.match(fixture("INSERT INTO public.widgets (org_id, kind) VALUES (v_org, 'zzz');").join("|"), /widgets\.kind: 'zzz' violates widgets_kind_check/);
  assert.match(fixture("x(format('INSERT INTO public.widgets (org_id, kind) VALUES (%L, %L)', v_org, 'zzz'));").join("|"), /'zzz' violates/);
  assert.match(fixture("UPDATE public.widgets SET kind = 'zzz' WHERE true;").join("|"), /update public\.widgets\.kind: 'zzz' violates/);
  assert.match(fixture("INSERT INTO public.widgets (org_id, kind, level) VALUES (v_org, 'a', 'mid');").join("|"), /widgets\.level: 'mid' violates widgets_level_check/);
});

test("red: a NOT NULL column with no default that is not written, an explicit NULL, an unknown column, an unknown table, a generated column", () => {
  assert.match(fixture("INSERT INTO public.widgets (kind) VALUES ('a');").join("|"), /widgets\.org_id: NOT NULL with no default and not written \(23502\)/);
  assert.match(fixture("INSERT INTO public.widgets (org_id, kind) VALUES (NULL, 'a');").join("|"), /widgets\.org_id: explicit NULL into a NOT NULL column/);
  assert.match(fixture("INSERT INTO public.widgets (org_id, kind, nope) VALUES (v, 'a', 1);").join("|"), /widgets\.nope: no such column/);
  assert.match(fixture("INSERT INTO public.nothing (a) VALUES (1);").join("|"), /nothing: the table is not defined by the migration tree/);
  assert.match(fixture("INSERT INTO public.widgets (org_id, kind, label_key) VALUES (v, 'a', 'x');").join("|"), /GENERATED ALWAYS column cannot be written/);
  assert.match(fixture("INSERT INTO public.widgets (org_id, kind) VALUES (v, 'a', 'extra');").join("|"), /a VALUES row has 3 values for 2 columns/);
});

test("external tables: auth.users is judged against the supplied columns, an undeclared non-public table is reported", () => {
  const external = { "auth.users": { columns: ["id", "email"], required: ["id"] } };
  assert.deepEqual(fixture("INSERT INTO auth.users (id, email) VALUES (v, 'e');", external), []);
  assert.match(fixture("INSERT INTO auth.users (email) VALUES ('e');", external).join("|"), /required column id is not written/);
  assert.match(fixture("INSERT INTO auth.users (id, bogus) VALUES (v, 'e');", external).join("|"), /bogus: not a column of the external table/);
  assert.match(fixture("INSERT INTO other.things (id) VALUES (v);").join("|"), /non-public table with no external definition/);
});

test("splitTop honours parens, brackets and quoted commas; stripSql keeps strings with -- and drops dollar bodies on request", () => {
  assert.deepEqual(splitTop("a, f(b, c), 'd, e', ARRAY[1, 2]").map((x) => x.trim()), ["a", "f(b, c)", "'d, e'", "ARRAY[1, 2]"]);
  assert.equal(stripSql("SELECT '--x'; -- gone\nSELECT 2; /* gone */").replace(/\s+/g, " ").trim(), "SELECT '--x'; SELECT 2;");
  assert.equal(stripSql("DO $a$ BODY $a$;", { keepDollarBodies: false }), "DO $a$$a$;");
});
