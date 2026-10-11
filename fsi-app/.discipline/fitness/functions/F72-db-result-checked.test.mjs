// @ts-check
// Red-then-green for F72 (db-result-checked). Every fixture below is a route-shaped source file; a fixture per
// dropped-error shape MUST be flagged, the correct `{ data, error }` shape and an allow-marked line must pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { fitnessFunction, findDroppedResults } from "./F72-db-result-checked.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
const ROUTE = "fsi-app/src/app/api/some/route.ts";
const check = (src) => fitnessFunction.check(ROUTE, src);
const shapes = (src) => findDroppedResults(src).map((s) => s.shape);

test("RED DATA-ONLY: `const { data } = await sb.from(...)` with no error binding is flagged with file:line", () => {
  const src = 'export async function GET() {\n  const { data } = await sb.from("x").select("id");\n  return data;\n}';
  const v = check(src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 2);
  assert.match(v[0].message, /F72 DATA-ONLY/);
});

test("RED DATA-ONLY: a renamed data binding, a count-only binding and a multi-line chain are each flagged", () => {
  assert.deepEqual(shapes('const { data: rows } = await sb.from("x").select("id");'), ["DATA-ONLY"]);
  assert.deepEqual(shapes('const { count } = await sb.from("x").select("id", { count: "exact", head: true });'), ["DATA-ONLY"]);
  const multi = 'const { data } = await sb\n  .from("x")\n  .select("id")\n  .eq("a", 1);\nreturn data;';
  assert.deepEqual(shapes(multi), ["DATA-ONLY"]);
  assert.equal(check(multi)[0].line, 1);
  assert.deepEqual(shapes('const { data } = await supabase.rpc("fn", { a: 1 });'), ["DATA-ONLY"]);
});

test("RED BARE-AWAIT: an awaited write used as a statement is flagged, including a bare await of Promise.all", () => {
  assert.deepEqual(shapes('await sb.from("x").insert({ a: 1 });'), ["BARE-AWAIT"]);
  assert.deepEqual(shapes('await sb.from("x").update({ a: 1 }).eq("id", id);'), ["BARE-AWAIT"]);
  assert.deepEqual(shapes('await sb.from("x").upsert(rows, { onConflict: "id" });'), ["BARE-AWAIT"]);
  assert.deepEqual(shapes('await sb.from("x").delete().eq("id", id);'), ["BARE-AWAIT"]);
  assert.deepEqual(shapes('if (ok) await sb.from("x").insert({ a: 1 });'), ["BARE-AWAIT"]);
  assert.deepEqual(shapes('await Promise.all([sb.from("x").insert({ a: 1 }), sb.from("y").delete()]);'), ["BARE-AWAIT"]);
  const noSemicolon = 'await sb.from("x").insert({ a: 1 })\nreturn NextResponse.json({ ok: true })';
  assert.deepEqual(shapes(noSemicolon), ["BARE-AWAIT"]);
});

test("RED VOID: `void sb.from(...)` fire and forget is flagged", () => {
  const v = check('void sb.from("x").insert({ a: 1 });');
  assert.equal(v.length, 1);
  assert.match(v[0].message, /F72 VOID/);
});

test("RED PROMISEALL: a destructured Promise.all element without an error binding is flagged; one with it is not", () => {
  const bad = 'const [{ data: a }, { data: b }] = await Promise.all([sb.from("x").select("id"), sb.from("y").select("id")]);';
  assert.deepEqual(shapes(bad), ["PROMISEALL"]);
  const half = 'const [{ data: a, error: aErr }, { data: b }] = await Promise.all([sb.from("x").select("id"), sb.from("y").select("id")]);';
  assert.deepEqual(shapes(half), ["PROMISEALL"], "one lacking element is enough");
  const good = 'const [{ data: a, error: aErr }, { data: b, error: bErr }] = await Promise.all([sb.from("x").select("id"), sb.from("y").select("id")]);';
  assert.deepEqual(check(good), []);
  const mixed = 'const [{ data: a }, extra] = await Promise.all([sb.from("x").select("id"), fetchSomething()]);';
  assert.deepEqual(shapes(mixed), ["PROMISEALL"]);
  const nonSupabaseSlot = 'const [{ data: a, error: e }, { x }] = await Promise.all([sb.from("x").select("id"), fetchObj()]);';
  assert.deepEqual(check(nonSupabaseSlot), [], "a slot whose element is not a Supabase call is out of reach");
});

test("GREEN: the correct `{ data, error }` shapes pass", () => {
  assert.deepEqual(check('const { data, error } = await sb.from("x").select("id");'), []);
  assert.deepEqual(check('const { error } = await sb.from("x").insert({ a: 1 });'), []);
  assert.deepEqual(check('const { data: rows, error: rowsErr } = await sb.from("x").select("id");'), []);
  assert.deepEqual(check('const { error: xErr } = await sb.from("x").update({ a: 1 }).eq("id", id);'), []);
  assert.deepEqual(check('const { count, error } = await sb.from("x").select("id", { count: "exact", head: true });'), []);
  assert.deepEqual(check('const { data, ...rest } = await sb.rpc("fn");'), [], "a rest element carries error");
});

test("GREEN: a result that is returned, kept whole or passed on is not a dropped result", () => {
  assert.deepEqual(check('return await sb.from("x").select("id");'), []);
  assert.deepEqual(check('const res = await sb.from("x").select("id");\nif (res.error) throw res.error;'), []);
  assert.deepEqual(check('const run = async () => await sb.from("x").select("id");'), []);
  assert.deepEqual(check('const out = cond ? await sb.from("x").select("id") : null;'), []);
});

test("RED DATA-ONLY: an await that is an arm of a ternary or logical expression is still bound by the statement's pattern", () => {
  assert.deepEqual(shapes('const { data: hm } = host ? await sb.from("x").select("id") : { data: [] };'), ["DATA-ONLY"]);
  assert.deepEqual(check('const { data: hm, error: hmErr } = host ? await sb.from("x").select("id") : { data: [], error: null };'), []);
  assert.deepEqual(shapes('const { data } = (await ok()) && await sb.from("x").select("id");'), ["DATA-ONLY"]);
});

test("GREEN: a capitalised receiver (Array.from, Buffer.from) and non-Supabase awaits are never a query", () => {
  assert.deepEqual(check("const { data } = await Array.from(xs);"), []);
  assert.deepEqual(check("await Buffer.from(body).arrayBuffer();"), []);
  assert.deepEqual(check("const { data } = await fetchThing(Array.from(xs));"), []);
  assert.deepEqual(check('const { data } = await helper(sb.from("x"));'), [], "a .from( inside an argument is not the root chain");
  assert.deepEqual(check("await Promise.all(items.map(async (i) => i));"), []);
});

test("GREEN: a site mentioned inside a string or a comment is not code", () => {
  assert.deepEqual(check('const msg = "const { data } = await sb.from(\\"x\\").select()";'), []);
  assert.deepEqual(check('// await sb.from("x").insert({ a: 1 });\nconst a = 1;'), []);
  assert.deepEqual(check('/* void sb.from("x").insert({}) */\nconst a = 1;'), []);
});

test("RED: a nested callback's own dropped write is flagged even inside a checked outer call", () => {
  const src = [
    'const { error } = await sb.from("x").select("id");',
    "for (const r of rows) {",
    '  await sb.from("y").update({ a: 1 }).eq("id", r.id);',
    "}",
  ].join("\n");
  const v = check(src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 3);
});

test("override: a trailing `// fitness-allow: F72 (reason)` on the site line, or the line above, suppresses it", () => {
  assert.deepEqual(check('await sb.from("x").insert({ a: 1 }); // fitness-allow: F72 (best-effort telemetry; re-derived by the nightly rollup)'), []);
  assert.deepEqual(check('// fitness-allow: F72 (best-effort telemetry; re-derived by the nightly rollup)\nawait sb.from("x").insert({ a: 1 });'), []);
  const multi = 'const { data } = await sb\n  .from("x")\n  .select("id"); // fitness-allow: F72 (read only decorates the response)';
  assert.deepEqual(check(multi), [], "a marker on the last line of a multi-line site counts");
});

test("override attack: a marker for another function, one with no reason, or one inside a string does not suppress", () => {
  assert.equal(check('await sb.from("x").insert({ a: 1 }); // fitness-allow: F39 (not this gate)').length, 1);
  assert.equal(check('await sb.from("x").insert({ a: 1 }); // fitness-allow: F72').length, 1);
  assert.equal(check('const s = "// fitness-allow: F72 (fake)"; await sb.from("x").insert({ a: 1 });').length, 1);
});

test("override scope: a marker suppresses only its own site, not a second site further down", () => {
  const src = 'await sb.from("x").insert({ a: 1 }); // fitness-allow: F72 (telemetry)\nconst a = 1;\nconst b = 2;\nawait sb.from("y").insert({ b: 1 });';
  const v = check(src);
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 4);
});

test("enumerate: only api route sources, never a test or archive file", () => {
  const files = fitnessFunction.enumerate();
  assert.ok(files.length > 0, "api routes are enumerated");
  for (const f of files) {
    assert.match(f, /^fsi-app\/src\/app\/api\/.*\.ts$/);
    assert.doesNotMatch(f, /\.(?:test|selftest|npmtest)\.mjs$/);
    assert.doesNotMatch(f, /\/_archive\//);
  }
});

// This test runs the fitness function against the live repo, which the Fitness functions job already does on
// every pull request. It stays runnable here with FITNESS_LIVE_TESTS=1 (the GATE-4 convention F39 follows).
const LIVE_TREE = process.env.FITNESS_LIVE_TESTS === "1" ? {} : { skip: "live-tree self-test, run by the Fitness functions job; set FITNESS_LIVE_TESTS=1 to run it here" };

test("LIVE: every Supabase result in src/app/api is read with its error", LIVE_TREE, () => {
  const problems = [];
  for (const f of fitnessFunction.enumerate()) {
    const content = readFileSync(resolve(REPO_ROOT, f), "utf8");
    const v = fitnessFunction.check(f, content);
    if (v.length) problems.push(`${f}: ${v.map((x) => `${x.line}: ${x.message.slice(0, 60)}`).join(" | ")}`);
  }
  assert.deepEqual(problems, []);
});
