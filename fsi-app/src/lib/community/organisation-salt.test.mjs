// organisation-salt.test.mjs — the salt resolution order and the derivation's properties, env injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hkdfSync } from "node:crypto";

// The module is TypeScript with no type-only exports the runtime needs; strip types via the same
// loader the rest of the suite uses for .ts under test (node --experimental-strip-types is the
// suite's default on this Node line). Fall back to a direct import.
const mod = await import("./organisation-salt.ts");
const { resolveOrganisationSalt, ORG_SALT_HKDF_INFO } = mod;

test("explicit COMMUNITY_ORG_SALT wins and is used verbatim (trimmed)", () => {
  const r = resolveOrganisationSalt({ COMMUNITY_ORG_SALT: "  explicit-salt-value-0123456789  ", WORKER_SECRET: "worker-secret-value-0123456789" });
  assert.equal(r.source, "COMMUNITY_ORG_SALT");
  assert.equal(r.salt, "explicit-salt-value-0123456789");
});

test("absent COMMUNITY_ORG_SALT derives from WORKER_SECRET with HKDF-SHA256 and the versioned info", () => {
  const worker = "worker-secret-value-0123456789";
  const r = resolveOrganisationSalt({ WORKER_SECRET: worker });
  assert.equal(r.source, "derived-from-WORKER_SECRET");
  const expected = Buffer.from(hkdfSync("sha256", worker, "", ORG_SALT_HKDF_INFO, 32)).toString("hex");
  assert.equal(r.salt, expected);
  assert.equal(r.salt.length, 64);
  assert.notEqual(r.salt, worker, "the derived salt must not equal the secret it came from");
});

test("derivation is deterministic (same WORKER_SECRET -> same salt) and secret-sensitive", () => {
  const a = resolveOrganisationSalt({ WORKER_SECRET: "worker-secret-value-0123456789" });
  const b = resolveOrganisationSalt({ WORKER_SECRET: "worker-secret-value-0123456789" });
  const c = resolveOrganisationSalt({ WORKER_SECRET: "worker-secret-value-0123456780" });
  assert.equal(a.salt, b.salt);
  assert.notEqual(a.salt, c.salt);
});

test("too-short or missing inputs resolve to null (the caller refuses)", () => {
  assert.deepEqual(resolveOrganisationSalt({}), { salt: null, source: null });
  assert.deepEqual(resolveOrganisationSalt({ COMMUNITY_ORG_SALT: "short", WORKER_SECRET: "short" }), { salt: null, source: null });
});
