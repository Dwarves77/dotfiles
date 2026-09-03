// Structural proof for src/lib/auth/route-policy.ts (PERF-2 lane, 2026-09-03) — the pure decision
// src/proxy.ts wires supabase.auth.getClaims() into. See that module's header for why the split exists:
// proxy.ts value-imports @supabase/ssr and next/server, neither of which `node --test` can resolve
// outside Next's own bundler, so this is the only part of the middleware's own logic a plain test can
// exercise directly. Covers the matrix the PERF-2 brief asks for: public route, static, api, protected,
// and claim present/absent/expired (the latter two both collapse to `authenticated: false` from this
// function's point of view — proxy.ts's own getClaims() wiring is what tells them apart before calling
// in).
import test from "node:test";
import assert from "node:assert/strict";
import {
  decideRoute,
  isPublicRoute,
  isStaticOrApiRoute,
  isScannerProbe,
} from "./route-policy.ts";

// ── scanner probes ─────────────────────────────────────────────────────
test("scanner probe prefixes 404 before any auth check, authenticated or not", () => {
  for (const authenticated of [true, false]) {
    assert.deepEqual(decideRoute({ pathname: "/wp-admin/setup-config.php", authenticated }), { action: "scanner-404" });
    assert.deepEqual(decideRoute({ pathname: "/wp-content/plugins/x", authenticated }), { action: "scanner-404" });
    assert.deepEqual(decideRoute({ pathname: "/xmlrpc.php", authenticated }), { action: "scanner-404" });
    assert.deepEqual(decideRoute({ pathname: "/anything/at/all.php", authenticated }), { action: "scanner-404" });
  }
});

test("a plausible app route is never mistaken for a scanner probe", () => {
  assert.equal(isScannerProbe("/regulations/g14"), false);
  assert.equal(isScannerProbe("/api/watchlist"), false);
  assert.equal(isScannerProbe("/login"), false);
});

// ── public routes ──────────────────────────────────────────────────────
test("public routes allow through, unauthenticated", () => {
  for (const p of ["/login", "/signup", "/auth/callback", "/auth/callback?code=abc", "/privacy"]) {
    assert.deepEqual(decideRoute({ pathname: p, authenticated: false }), { action: "allow" }, p);
  }
});

test("an authenticated viewer hitting /login or /signup is bounced home, not shown the form again", () => {
  assert.deepEqual(decideRoute({ pathname: "/login", authenticated: true }), { action: "redirect-home" });
  assert.deepEqual(decideRoute({ pathname: "/signup", authenticated: true }), { action: "redirect-home" });
});

test("an authenticated viewer hitting /auth/callback or /privacy is NOT bounced (only /login and /signup are)", () => {
  assert.deepEqual(decideRoute({ pathname: "/auth/callback", authenticated: true }), { action: "allow" });
  assert.deepEqual(decideRoute({ pathname: "/privacy", authenticated: true }), { action: "allow" });
});

test("isPublicRoute matches by prefix, same as the route table", () => {
  assert.equal(isPublicRoute("/login"), true);
  assert.equal(isPublicRoute("/login/foo"), true); // prefix match, same as the pre-extraction behavior
  assert.equal(isPublicRoute("/regulations"), false);
});

// ── static / api passthrough ───────────────────────────────────────────
test("static and api paths pass through regardless of auth state", () => {
  for (const authenticated of [true, false]) {
    assert.deepEqual(decideRoute({ pathname: "/_next/static/chunks/x.js", authenticated }), { action: "allow" });
    assert.deepEqual(decideRoute({ pathname: "/_next/data/x.json", authenticated }), { action: "allow" });
    assert.deepEqual(decideRoute({ pathname: "/api/watchlist", authenticated }), { action: "allow" });
    assert.deepEqual(decideRoute({ pathname: "/robots.txt", authenticated }), { action: "allow" });
    assert.deepEqual(decideRoute({ pathname: "/favicon.ico", authenticated }), { action: "allow" });
  }
});

test("isStaticOrApiRoute is exact for the two literal paths, prefix for the other two", () => {
  assert.equal(isStaticOrApiRoute("/robots.txt"), true);
  assert.equal(isStaticOrApiRoute("/robots.txt.evil"), false);
  assert.equal(isStaticOrApiRoute("/favicon.ico"), true);
  assert.equal(isStaticOrApiRoute("/api/anything/nested"), true);
});

// ── protected routes: the claim present/absent/expired matrix ─────────
test("protected route + authenticated (claim present, valid) -> allow", () => {
  assert.deepEqual(decideRoute({ pathname: "/regulations/g14", authenticated: true }), { action: "allow" });
});

test("protected route + unauthenticated (claim absent) -> redirect to /login preserving the path", () => {
  assert.deepEqual(decideRoute({ pathname: "/regulations/g14", authenticated: false }), {
    action: "redirect-login",
    redirectTo: "/regulations/g14",
  });
});

test("protected route + unauthenticated (claim expired, same boolean as absent from this function's view) -> redirect to /login", () => {
  // proxy.ts's getClaims() wiring maps BOTH "no session cookie" and "session cookie present but the JWT
  // is expired/invalid" to authenticated:false (fail-closed, matching the pre-existing getUser() catch
  // posture) before calling in here — this test proves decideRoute treats that boolean uniformly, so the
  // expired-claim case gets the exact same graceful redirect as the never-logged-in case, never a 503.
  assert.deepEqual(decideRoute({ pathname: "/market/f3510df3", authenticated: false }), {
    action: "redirect-login",
    redirectTo: "/market/f3510df3",
  });
});

test("the root path is protected like any other non-public route", () => {
  assert.deepEqual(decideRoute({ pathname: "/", authenticated: false }), { action: "redirect-login", redirectTo: "/" });
  assert.deepEqual(decideRoute({ pathname: "/", authenticated: true }), { action: "allow" });
});
