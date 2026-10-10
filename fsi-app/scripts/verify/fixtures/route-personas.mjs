// route-personas.mjs -- the signed-in personas of the routes ATTACKED run (lane TESTS-2, 2026-10-10; AUD-AT-2 section 5,
// docs/audits/aud-at2-route-guard-register-2026-10-08.md).
//
// The route guards read a BEARER SESSION (src/lib/api/route-guard.ts requireUserRoute), so an attack on a route needs a
// real access token for each persona, not a database role. This module makes four users on the DISPOSABLE LOCAL STACK
// ONLY, signs each in through the stack's own auth service, and hands back the access tokens:
//
//   admin       platform admin (profiles.is_platform_admin), member of nothing        the positive control of admin routes
//   viewer_a    role viewer in organisation A                                          P2
//   member_b    role member in organisation B, nothing in A                            P3
//   member_a    role member in organisation A                                          P4
//
// (P1, anon, is a request with no Authorization header.) The users are created through the auth service's admin
// interface so its own columns are set the way it expects (a SQL INSERT into auth.users leaves token columns NULL, which
// the service cannot sign in). The email addresses are on the reserved .invalid domain and carry a per-run tag; each
// password is random, held in memory for the sign-in call and never written, printed or logged.
//
// Pure of pg and of the network: the SQL client and the fetch are injected, so the statements and their order are
// unit-tested against recordings.

import { randomBytes } from "node:crypto";

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
  if (!res.ok) throw new Error(`route persona ${what}: auth service answered ${res.status}`);
  return res.json();
}

/**
 * Create the personas and sign each in. Returns { tokens: { key: accessToken }, userIds: { key: uuid } }.
 * `env` supplies the stack's API url and keys; `client` is a connected SQL client (connection role); `fetchImpl` is fetch.
 * Throws a message naming the failing step, never a credential.
 */
export async function setupRoutePersonas({ client, fetchImpl = fetch, env = process.env, tag = String(Date.now()), makePassword = () => randomBytes(18).toString("base64url") }) {
  const api = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!api || !anon || !service) throw new Error("route persona setup: the stack's API url or keys are missing from the environment");
  const adminHeaders = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  const users = {};
  const passwords = {};
  for (const p of ROUTE_PERSONAS) {
    const email = emailFor(p.key, tag);
    passwords[p.key] = makePassword();
    const made = await authCall(fetchImpl, `${api}/auth/v1/admin/users`, {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ email, password: passwords[p.key], email_confirm: true }),
    }, `create ${p.key}`);
    if (!made?.id) throw new Error(`route persona create ${p.key}: the auth service returned no user id`);
    users[p.key] = { id: made.id, email };
  }
  await runAll(client, creationStatements(users), "setup");
  const tokens = {};
  for (const p of ROUTE_PERSONAS) {
    const signedIn = await authCall(fetchImpl, `${api}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email: users[p.key].email, password: passwords[p.key] }),
    }, `sign in ${p.key}`);
    if (!signedIn?.access_token) throw new Error(`route persona sign in ${p.key}: no access token returned`);
    tokens[p.key] = signedIn.access_token;
  }
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
