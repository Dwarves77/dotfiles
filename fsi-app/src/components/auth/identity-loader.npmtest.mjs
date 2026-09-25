// identity-loader.npmtest.mjs: lane AUTH-IDENTITY (2026-09-24), the provider-level proof.
//
// AuthProvider.tsx's identity lookup runs through createIdentityLoader (identity-loader.ts); this repo
// has no JSX mount harness for a provider (see app-shell-banner.ts's header), so the loop is proven
// here with a fake fetch and a manual scheduler, and a source check pins that AuthProvider actually
// wires it (focus + visibilitychange re-arm, no single-shot fetch). The live defect it closes: one
// failed `fetch("/api/auth/identity")` at 16:51Z seeded "no workspace" for the tab's life.
//
// On origin/master (44187dfa) this file fails: identity-loader.ts does not exist and AuthProvider
// fetches once with `.catch(() => seed(null))`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { createIdentityLoader } = await jiti.import("./identity-loader.ts");
const { IDENTITY_ATTEMPTS_PER_ROUND } = await jiti.import("../shell/bootstrap-seed.ts");

const OWNER_BOOTSTRAP = {
  user: { id: "2b7d21eb", email: "owner@example.com" },
  orgId: "org-1",
  orgName: "Dietl / Rockit",
  role: "owner",
  sectors: [],
  workspaceSectors: ["fine-art"],
  isPlatformAdmin: true,
};

/** Manual scheduler: timers only run when the test flushes them, so every delay is observable. */
function harness(responses) {
  const queue = [...responses];
  const timers = [];
  const seeds = [];
  const retrying = [];
  let fetches = 0;
  const loader = createIdentityLoader({
    fetchIdentity: async () => {
      fetches += 1;
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    onSeed: (s) => seeds.push(s),
    onRetrying: (v) => retrying.push(v),
    schedule: (fn, ms) => {
      const t = { fn, ms, cancelled: false };
      timers.push(t);
      return t;
    },
    cancel: (t) => {
      t.cancelled = true;
    },
  });
  const settle = () => new Promise((r) => setImmediate(r));
  const flushOne = async () => {
    const t = timers.shift();
    assert.ok(t, "expected a scheduled retry");
    if (!t.cancelled) t.fn();
    await settle();
    return t.ms;
  };
  return { loader, seeds, retrying, timers, settle, flushOne, fetchCount: () => fetches };
}

test("AUTH-IDENTITY failing-first: a REJECTED first fetch retries and recovers; no no-org seed is ever applied", async () => {
  const h = harness([new TypeError("Failed to fetch"), OWNER_BOOTSTRAP]);
  h.loader.start();
  await h.settle();
  assert.equal(h.seeds.length, 0, "a failed attempt applies nothing while retries remain");
  assert.equal(h.timers.length, 1, "one retry scheduled");
  await h.flushOne();
  assert.equal(h.fetchCount(), 2);
  assert.equal(h.seeds.length, 1);
  assert.equal(h.seeds[0].status, "resolved");
  assert.equal(h.seeds[0].orgId, "org-1");
  assert.equal(h.seeds[0].isPlatformAdmin, true);
  assert.ok(h.seeds.every((s) => s.orgId !== null), "never the resolved-no-org value");
});

test("AUTH-IDENTITY failing-first: a NON-200 first response (fetchIdentity resolves null) retries, never seeds no-org", async () => {
  const h = harness([null, OWNER_BOOTSTRAP]);
  h.loader.start();
  await h.settle();
  assert.equal(h.seeds.length, 0);
  await h.flushOne();
  assert.equal(h.seeds.length, 1);
  assert.equal(h.seeds[0].orgId, "org-1");
});

test("a 200 whose body is not the bootstrap shape counts as a failed attempt", async () => {
  const h = harness([{ error: "identity_lookup_failed" }, OWNER_BOOTSTRAP]);
  h.loader.start();
  await h.settle();
  assert.equal(h.seeds.length, 0);
  await h.flushOne();
  assert.equal(h.seeds[0].status, "resolved");
});

test("an exhausted round ends in the ERROR state (org unknown), with exactly 3 attempts and backoff, and schedules nothing more", async () => {
  const h = harness([null, null, null]);
  h.loader.start();
  await h.settle();
  const d1 = await h.flushOne();
  const d2 = await h.flushOne();
  assert.ok(d2 > d1, "backoff grows between attempts");
  assert.equal(h.fetchCount(), IDENTITY_ATTEMPTS_PER_ROUND);
  assert.equal(h.seeds.length, 1);
  assert.equal(h.seeds[0].status, "error");
  assert.equal(h.seeds[0].orgId, undefined, "unknown, not 'no workspace'");
  assert.equal(h.timers.length, 0, "no timer after the round: no polling");
  assert.equal(h.loader.status(), "error");
});

test("re-arm after an error runs ONE new round and a success recovers the tab; Retry shows pending while it runs", async () => {
  const h = harness([null, null, null, null, OWNER_BOOTSTRAP]);
  h.loader.start();
  await h.settle();
  await h.flushOne();
  await h.flushOne();
  assert.equal(h.loader.status(), "error");
  h.loader.rearm(); // window focus / visibilitychange / the note's Retry
  assert.deepEqual(h.retrying, [true]);
  h.loader.rearm(); // a second focus event mid-round is ignored
  await h.settle();
  assert.equal(h.fetchCount(), 4, "the duplicate re-arm did not start a second attempt");
  await h.flushOne();
  assert.equal(h.fetchCount(), 5);
  assert.equal(h.loader.status(), "resolved");
  assert.equal(h.seeds.at(-1).orgId, "org-1");
  assert.deepEqual(h.retrying, [true, false]);
});

test("re-arm is a no-op before any failure and after a resolved answer (a real answer is final)", async () => {
  const h = harness([OWNER_BOOTSTRAP, null]);
  h.loader.rearm();
  assert.equal(h.fetchCount(), 0);
  h.loader.start();
  await h.settle();
  assert.equal(h.loader.status(), "resolved");
  h.loader.rearm();
  await h.settle();
  assert.equal(h.fetchCount(), 1);
  assert.equal(h.seeds.length, 1);
});

test("stop() cancels a pending retry, so an unmounted provider never seeds", async () => {
  const h = harness([null, OWNER_BOOTSTRAP]);
  h.loader.start();
  await h.settle();
  h.loader.stop();
  assert.equal(h.timers[0].cancelled, true);
  await h.flushOne();
  assert.equal(h.seeds.length, 0);
});

// Wiring: AuthProvider must run the lookup through the loader and re-arm it on focus and visibility.
{
  const SOURCE = readFileSync(resolve(HERE, "AuthProvider.tsx"), "utf8");
  test("AuthProvider wires the loader: createIdentityLoader, focus + visibilitychange re-arm, no single-shot seed(null)", () => {
    assert.match(SOURCE, /createIdentityLoader\(/);
    assert.match(SOURCE, /addEventListener\("focus", onFocus\)/);
    assert.match(SOURCE, /addEventListener\("visibilitychange", onVisibility\)/);
    assert.doesNotMatch(SOURCE, /seed\(null\)/);
    assert.doesNotMatch(SOURCE, /setInterval\(/);
  });
  const LOADER = readFileSync(resolve(HERE, "identity-loader.ts"), "utf8");
  test("the loader has no polling primitive of its own", () => {
    assert.doesNotMatch(LOADER, /setInterval|setTimeout/);
  });
}
