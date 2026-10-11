// route-personas.mjs -- the signed-in personas of the routes ATTACKED run (lane TESTS-2, 2026-10-10; AUD-AT-2 section 5,
// docs/audits/aud-at2-route-guard-register-2026-10-08.md).
//
// The route guards read a BEARER SESSION (src/lib/api/route-guard.ts requireUserRoute), so an attack on a route needs a
// real access token for each persona, not a database role. This module makes four users on the DISPOSABLE LOCAL STACK
// ONLY, mints an access token for each (signed with the stack's own JWT secret), and hands the tokens back:
//
//   admin       platform admin (profiles.is_platform_admin), member of nothing        the positive control of admin routes
//   viewer_a    role viewer in organisation A                                          P2
//   member_b    role member in organisation B, nothing in A                            P3
//   member_a    role member in organisation A                                          P4
//
// (P1, anon, is a request with no Authorization header.) The users are created through the auth service's admin
// interface so its own columns are set the way it expects (a SQL INSERT into auth.users leaves token columns NULL).
// The email addresses are on the reserved .invalid domain and carry a per-run tag. NO PASSWORD EXISTS: the local stack
// runs with [auth.email] enable_signup = false (fsi-app/supabase/config.toml), which makes the auth service refuse every
// email password sign-in with 422, so the tokens are minted (HS256, aud/role authenticated, sub = the user id) with the
// stack's JWT secret, read from ROUTE_PERSONA_JWT_SECRET. The auth service still verifies each token on every request the
// app makes with it, so a token the stack does not accept fails the run loudly (the TOKENS invariant).
//
// Pure of pg and of the network: the SQL client and the fetch are injected, so the statements and their order are
// unit-tested against recordings.

import { createHmac } from "node:crypto";

export const ROUTE_ORG_IDS = Object.freeze({
  org_a: "00000000-0000-4000-8000-0000000004d1",
  org_b: "00000000-0000-4000-8000-0000000004d2",
});

/** Persona key -> { persona id, org it belongs to, role, platform admin }. */
export const ROUTE_PERSONAS = Object.freeze([
  Object.freeze({ key: "admin", persona: "PA", org: null, role: null, admin: true }),
  Object.freeze({ key: "viewer_a", persona: "P2", org: "org_a", role: "viewer", admin: false }),
  Object.freeze({ key: "member_b", persona: "P3", org: "org_b", role: "member", admin: false }),
  Object.freeze({ key: "member_a", persona: "P4", org: "org_a", role: "member", admin: false }),
]);

const emailFor = (key, tag) => `routes-attack-${key.replace("_", "-")}-${tag}@chain-proof.invalid`;

/** Statements that remove everything this module created, in reverse dependency order. PURE. */
export function removalStatements(userIds) {
  return [
    { label: "organizations", sql: "DELETE FROM public.organizations WHERE id = ANY($1::uuid[])", params: [Object.values(ROUTE_ORG_IDS)] },
    { label: "profiles", sql: "DELETE FROM public.profiles WHERE id = ANY($1::uuid[])", params: [userIds] },
  ];
}

/** Statements that create the organisations, then each user's profile and membership. PURE. `users`: key -> { id, email }. */
export function creationStatements(users) {
  const out = [];
  for (const [key, id] of Object.entries(ROUTE_ORG_IDS)) {
    out.push({
      label: `organizations ${key}`,
      sql: "INSERT INTO public.organizations (id, name, slug) VALUES ($1::uuid, $2::text, $3::text) ON CONFLICT (id) DO NOTHING",
      params: [id, `Route attack ${key}`, `route-attack-${key.replace("_", "-")}`],
    });
  }
  for (const org of Object.values(ROUTE_ORG_IDS)) {
    out.push({
      label: "workspace_settings",
      sql: "INSERT INTO public.workspace_settings (org_id) VALUES ($1::uuid) ON CONFLICT DO NOTHING",
      params: [org],
    });
  }
  for (const p of ROUTE_PERSONAS) {
    const u = users[p.key];
    out.push({
      label: `profiles ${p.key}`,
      sql: "INSERT INTO public.profiles (id, email, display_name, is_platform_admin) VALUES ($1::uuid, $2::text, $3::text, $4::boolean) ON CONFLICT (id) DO UPDATE SET is_platform_admin = EXCLUDED.is_platform_admin",
      params: [u.id, u.email, `Route attack ${p.key}`, p.admin],
    });
  }
  for (const p of ROUTE_PERSONAS) {
    if (!p.org) continue;
    out.push({
      label: `org_memberships ${p.key}`,
      sql: "INSERT INTO public.org_memberships (org_id, user_id, role) VALUES ($1::uuid, $2::uuid, $3::text) ON CONFLICT DO NOTHING",
      params: [ROUTE_ORG_IDS[p.org], users[p.key].id, p.role],
    });
  }
  return out;
}

async function runAll(client, statements, what) {
  for (const s of statements) {
    try {
      await client.query(s.sql, s.params);
    } catch (e) {
      throw new Error(`route persona ${what} failed at ${s.label}: ${String(e.code ?? "")} ${String(e.message).split("\n")[0]}`.trim());
    }
  }
}

async function authCall(fetchImpl, url, init, what) {
  let res;
  try {
    res = await fetchImpl(url, init);
  } catch (e) {
    throw new Error(`route persona ${what}: request failed (${String(e?.message ?? e).split("\n")[0]})`);
  }
  if (!res.ok) {
    // The auth service's own error code and message say WHY (for example email_provider_disabled); they carry no credential.
    let why = "";
    try {
      const body = await res.json();
      why = [body?.error_code ?? body?.error, body?.msg ?? body?.message ?? body?.error_description].filter(Boolean).join(": ").replace(/\s+/g, " ").slice(0, 160);
    } catch { /* no JSON body */ }
    throw new Error(`route persona ${what}: auth service answered ${res.status}${why ? ` (${why})` : ""}`);
  }
  return res.json();
}

/** Base64url of a JSON value or a buffer. */
const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

/** An HS256 access token for a user, the shape the auth service issues (aud and role authenticated). PURE given `now`. */
export function mintAccessToken({ secret, userId, email, now = Math.floor(Date.now() / 1000), ttlSeconds = 3600 }) {
  const head = b64url({ alg: "HS256", typ: "JWT" });
  const body = b64url({ aud: "authenticated", role: "authenticated", sub: userId, email, aal: "aal1", iat: now, exp: now + ttlSeconds });
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

/**
 * Create the personas and mint a token for each. Returns { tokens: { key: accessToken }, userIds: { key: uuid } }.
 * `env` supplies the stack's API url and keys and ROUTE_PERSONA_JWT_SECRET; `client` is a connected SQL client (connection
 * role); `fetchImpl` is fetch. Throws a message naming the failing step, never a credential.
 */
export async function setupRoutePersonas({ client, fetchImpl = fetch, env = process.env, tag = String(Date.now()), now }) {
  const api = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = env.ROUTE_PERSONA_JWT_SECRET;
  if (!api || !service) throw new Error("route persona setup: the stack's API url or service key is missing from the environment");
  if (!secret) throw new Error("route persona setup: ROUTE_PERSONA_JWT_SECRET (the local stack's JWT secret) is missing from the environment");
  const adminHeaders = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  const users = {};
  for (const p of ROUTE_PERSONAS) {
    const email = emailFor(p.key, tag);
    const made = await authCall(fetchImpl, `${api}/auth/v1/admin/users`, {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ email, email_confirm: true }),
    }, `create ${p.key}`);
    if (!made?.id) throw new Error(`route persona create ${p.key}: the auth service returned no user id`);
    users[p.key] = { id: made.id, email };
  }
  await runAll(client, creationStatements(users), "setup");
  const tokens = {};
  for (const p of ROUTE_PERSONAS) tokens[p.key] = mintAccessToken({ secret, userId: users[p.key].id, email: users[p.key].email, now });
  return { tokens, userIds: Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.id])) };
}

/** Remove the rows and the auth users. Never throws past the first failing statement's message; auth user deletes are best effort. */
export async function teardownRoutePersonas({ client, userIds, fetchImpl = fetch, env = process.env }) {
  const ids = Object.values(userIds ?? {});
  await runAll(client, removalStatements(ids), "teardown");
  const api = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  for (const id of ids) {
    try {
      await fetchImpl(`${api}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: { apikey: service, Authorization: `Bearer ${service}` } });
    } catch { /* the stack is destroyed at the end of the job; a failed delete leaves nothing durable */ }
  }
}
