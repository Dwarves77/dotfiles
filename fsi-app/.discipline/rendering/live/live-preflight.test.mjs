// live-preflight.test.mjs (lane GATES-2, 2026-10-05): a dispatch with a URL and no secrets fails fast with the
// named message. Proven here, never by dispatching.
import test from "node:test";
import assert from "node:assert/strict";
import { preflight, runPreflightCli, ALLOWED_HOSTS } from "./live-preflight.mjs";

const ok = { url: "https://carosledge.com", email: "smoke@example.test", password: "x" };

test("CLEAN: production, a Vercel preview and www all pass and return the origin", () => {
  assert.deepEqual(preflight(ok), { ok: true, errors: [], origin: "https://carosledge.com" });
  assert.equal(preflight({ ...ok, url: "https://fsi-app-git-branch-team.vercel.app/path" }).origin, "https://fsi-app-git-branch-team.vercel.app");
  assert.equal(preflight({ ...ok, url: "https://www.carosledge.com" }).ok, true);
  assert.ok(ALLOWED_HOSTS.includes("carosledge.com"));
});

test("ATTACK: a URL with no secrets fails fast and names LIVE_SMOKE_EMAIL and LIVE_SMOKE_PASSWORD", () => {
  const r = preflight({ url: "https://carosledge.com", email: "", password: undefined });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /^LIVE_SMOKE_EMAIL secret is not set\./);
  assert.match(r.errors[1], /^LIVE_SMOKE_PASSWORD secret is not set\./);
});

test("ATTACK: whitespace-only secrets count as unset", () => {
  assert.equal(preflight({ ...ok, email: "   " }).ok, false);
  assert.equal(preflight({ ...ok, password: "\n" }).ok, false);
});

test("ATTACK: an empty, malformed, plain-http or foreign-host target is refused before any credential is used", () => {
  assert.match(preflight({ ...ok, url: "" }).errors[0], /^target url is empty/);
  assert.match(preflight({ ...ok, url: "not a url" }).errors[0], /^target url is not a valid URL/);
  assert.match(preflight({ ...ok, url: "http://carosledge.com" }).errors[0], /^target url must be https/);
  assert.match(preflight({ ...ok, url: "https://evil.example.com" }).errors[0], /^target host evil\.example\.com is not allowed/);
  assert.match(preflight({ ...ok, url: "https://carosledge.com.evil.test" }).errors[0], /not allowed/);
  assert.match(preflight({ ...ok, url: "https://notvercel.app" }).errors[0], /not allowed/);
});

test("a secret value is never echoed in any message", () => {
  const r = preflight({ url: "https://evil.example.com", email: "hunter2@example.test", password: "hunter2-pass" });
  assert.ok(!JSON.stringify(r).includes("hunter2"));
});

test("runPreflightCli returns 1 and emits GitHub error annotations when secrets are unset, 0 when set", () => {
  const lines = [];
  const code = runPreflightCli({ LIVE_SMOKE_URL: "https://carosledge.com" }, (l) => lines.push(l));
  assert.equal(code, 1);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.startsWith("::error::")));
  assert.equal(runPreflightCli({ LIVE_SMOKE_URL: ok.url, LIVE_SMOKE_EMAIL: ok.email, LIVE_SMOKE_PASSWORD: ok.password }, () => {}), 0);
});
