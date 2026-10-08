// rate-limit.npmtest.mjs: lane ROUTES-1 (2026-10-08, coordinator grant), register finding AT2-7d.
// clientKey(request) is the limiter key for callers with no user id: the first x-forwarded-for entry,
// else one shared bucket (fail closed, never skip). Proven with the real limiter module.
//
// Run: node --test fsi-app/src/lib/api/rate-limit.npmtest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false, alias: { "@": resolve(ROOT, "src") } });
const { checkRateLimit, clientKey } = await jiti.import("./rate-limit.ts");

const req = (headers) => new Request("http://x/api/y", { headers });

test("clientKey: the first x-forwarded-for entry, trimmed", () => {
  assert.equal(clientKey(req({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" })), "ip:203.0.113.7");
  assert.equal(clientKey(req({ "x-forwarded-for": "198.51.100.2" })), "ip:198.51.100.2");
});

test("clientKey: an absent or empty header is the one shared anon bucket", () => {
  assert.equal(clientKey(req({})), "anon:unknown");
  assert.equal(clientKey(req({ "x-forwarded-for": "" })), "anon:unknown");
  assert.equal(clientKey(req({ "x-forwarded-for": " , 10.0.0.1" })), "anon:unknown");
});

test("keys are per address: exhausting one address leaves another untouched", () => {
  const a = clientKey(req({ "x-forwarded-for": "192.0.2.10" }));
  const b = clientKey(req({ "x-forwarded-for": "192.0.2.11" }));
  for (let i = 0; i < 60; i++) assert.equal(checkRateLimit(a), null);
  assert.equal(checkRateLimit(a)?.status, 429);
  assert.equal(checkRateLimit(b), null);
});

test("requests with no header share one bucket and are limited, never skipped", () => {
  const k = clientKey(req({}));
  for (let i = 0; i < 60; i++) assert.equal(checkRateLimit(k), null);
  assert.equal(checkRateLimit(clientKey(req({})))?.status, 429);
});
