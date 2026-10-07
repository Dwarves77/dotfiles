/** Tests for scripts/proof/dump-production-schema.mjs (lane PROOF-1). Fixtures and injected deps only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { redact, checkDump, firstWorkingCandidate, runDump, dumpProductionSchema } from "./dump-production-schema.mjs";

const ENV = { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co", SUPABASE_DB_PASSWORD: "p@ss w/rd" };
const GOOD_DUMP = "SET statement_timeout = 0;\nCREATE TABLE public.sources (\n  id uuid\n);\nCREATE TABLE public.intelligence_items (\n id uuid\n);\n";

test("redact removes connection strings and the password, raw and encoded", () => {
  const text = `failed postgresql://postgres:${encodeURIComponent(ENV.SUPABASE_DB_PASSWORD)}@db.x.supabase.co:5432/postgres and raw p@ss w/rd here`;
  const r = redact(text, ENV);
  assert.ok(!r.includes("p@ss") && !r.includes("p%40ss") && !r.includes("supabase.co"), r);
  assert.match(r, /<url>/);
  assert.match(r, /<password>/);
});

test("checkDump accepts a schema-only dump and counts its tables", () => {
  const c = checkDump(GOOD_DUMP);
  assert.equal(c.ok, true);
  assert.equal(c.tables, 2);
});

test("ATTACK: a dump carrying table data or roles, or no tables, is refused", () => {
  assert.equal(checkDump(GOOD_DUMP + "COPY public.sources (id) FROM stdin;\nrow-data\n\\.\n").ok, false);
  assert.equal(checkDump(GOOD_DUMP + "CREATE ROLE reconciler;\n").ok, false);
  assert.equal(checkDump("SET x = 1;\n").ok, false);
});

test("firstWorkingCandidate skips failing candidates and returns the first that connects", async () => {
  const tried = [];
  const connect = async (o) => { tried.push(o.connectionString); if (!o.connectionString.includes("good")) throw new Error("no"); return { end: async () => {} }; };
  const r = await firstWorkingCandidate(["postgresql://a/bad1", "postgresql://a/good", "postgresql://a/later"], connect);
  assert.equal(r.index, 1);
  assert.equal(tried.length, 2);
  assert.equal(await firstWorkingCandidate(["postgresql://a/bad"], connect), null);
});

test("runDump asks the CLI for a plain dump: --db-url and -f only, never --data-only or --role-only", () => {
  let seen;
  runDump({ url: "postgresql://x", out: "/o.sql", spawn: (bin, args) => { seen = { bin, args }; return { status: 0 }; } });
  assert.equal(seen.bin, "supabase");
  assert.deepEqual(seen.args, ["db", "dump", "--db-url", "postgresql://x", "-f", "/o.sql"]);
});

test("dumpProductionSchema: success path through injected deps", async () => {
  const r = await dumpProductionSchema({
    env: ENV, out: "/o.sql",
    connect: async () => ({ end: async () => {} }),
    spawn: () => ({ status: 0, stderr: "" }),
    read: () => GOOD_DUMP, size: () => 99,
  });
  assert.equal(r.ok, true);
  assert.equal(r.tables, 2);
  assert.match(r.message, /candidate 1 of/);
});

test("dumpProductionSchema: no credentials, no connection, CLI failure and a data dump each fail by name, with no secret in the message", async () => {
  const base = { out: "/o.sql", connect: async () => ({ end: async () => {} }), spawn: () => ({ status: 0 }), read: () => GOOD_DUMP, size: () => 1 };
  assert.match((await dumpProductionSchema({ ...base, env: {} })).message, /no production connection candidate/);
  assert.match((await dumpProductionSchema({ ...base, env: ENV, connect: async () => { throw new Error("x"); } })).message, /none of \d+ production candidates connected/);
  const failing = await dumpProductionSchema({ ...base, env: ENV, spawn: () => ({ status: 1, stderr: `error connecting postgresql://postgres:p%40ss%20w%2Frd@db.x.supabase.co/postgres` }) });
  assert.equal(failing.ok, false);
  assert.ok(!failing.message.includes("p%40ss") && !failing.message.includes("supabase.co"), failing.message);
  const dataDump = await dumpProductionSchema({ ...base, env: ENV, read: () => GOOD_DUMP + "COPY public.sources (id) FROM stdin;\n" });
  assert.match(dataDump.message, /not schema only/);
});
