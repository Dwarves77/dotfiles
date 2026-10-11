// Lane DATA-3a (2026-10-11, backlog B-0053): resource-lookup.ts reads every result WITH its error.
//
// THE DEFECT. resolveItemUuid destructured `{ data }` (a failed read looked like "no such item"), and
// buildResourceLookup read `result.data` off each query and never `result.error`, with a bare `catch {}` that
// swallowed a thrown error without a log. Both functions are DOCUMENTED fail-soft (callers treat a null uuid as
// "skip this block" and a missing lookup entry as the raw-id fallback), so the fix keeps the degrade and makes
// the failure visible: a console.warn naming the site and the database message.
//
// RED WITHOUT THE FIX: against the unchanged file no warning is logged by any case below.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { resolveItemUuid, buildResourceLookup } = await jiti.import("./resource-lookup.ts");

async function withWarnings(fn) {
  const warns = [];
  const original = console.warn;
  console.warn = (...a) => warns.push(a.map(String).join(" "));
  try {
    return { result: await fn(), warns };
  } finally {
    console.warn = original;
  }
}

/** A chain whose every method returns itself and which resolves to `result` when awaited or ended by maybeSingle(). */
function chainOf(result) {
  const chain = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (resolveFn) => resolveFn(result);
        if (prop === "maybeSingle") return async () => result;
        return () => chain;
      },
    }
  );
  return chain;
}

const UUID = "11111111-1111-4111-8111-111111111111";

test("resolveItemUuid: a failed read degrades to null AND is logged with its site", async () => {
  const sb = { from: () => chainOf({ data: null, error: { message: "boom" } }) };
  const { result, warns } = await withWarnings(() => resolveItemUuid(sb, "g2"));
  assert.equal(result, null);
  assert.ok(warns.some((w) => w.includes("resolveItemUuid read failed") && w.includes("boom")), JSON.stringify(warns));
});

test("resolveItemUuid: found and not-found are unchanged and log nothing", async () => {
  const found = await withWarnings(() => resolveItemUuid({ from: () => chainOf({ data: { id: UUID }, error: null }) }, "g2"));
  assert.equal(found.result, UUID);
  assert.deepEqual(found.warns, []);
  const missing = await withWarnings(() => resolveItemUuid({ from: () => chainOf({ data: null, error: null }) }, "g2"));
  assert.equal(missing.result, null);
  assert.deepEqual(missing.warns, []);
  assert.equal(await resolveItemUuid({ from: () => assert.fail("no query for a uuid") }, UUID), UUID);
});

test("buildResourceLookup: a failed query leaves its ids on the raw-id fallback AND is logged", async () => {
  const sb = { from: () => chainOf({ data: null, error: { message: "boom" } }) };
  const { result, warns } = await withWarnings(() => buildResourceLookup(sb, ["g2", UUID]));
  assert.deepEqual(result, {});
  assert.ok(warns.some((w) => w.includes("buildResourceLookup read failed") && w.includes("boom")), JSON.stringify(warns));
});

test("buildResourceLookup: one failed query does not discard the other's rows", async () => {
  let call = 0;
  const sb = {
    from: () => chainOf(call++ === 0 ? { data: null, error: { message: "boom" } } : { data: [{ id: UUID, legacy_id: null, title: "T", priority: "HIGH" }], error: null }),
  };
  const { result, warns } = await withWarnings(() => buildResourceLookup(sb, ["g2", UUID]));
  assert.deepEqual(result, { [UUID]: { id: UUID, title: "T", priority: "HIGH" } });
  assert.equal(warns.length, 1);
});

test("buildResourceLookup: a thrown error is logged, not swallowed", async () => {
  const sb = { from: () => { throw new Error("socket closed"); } };
  const { result, warns } = await withWarnings(() => buildResourceLookup(sb, ["g2"]));
  assert.deepEqual(result, {});
  assert.ok(warns.some((w) => w.includes("buildResourceLookup threw") && w.includes("socket closed")), JSON.stringify(warns));
});
