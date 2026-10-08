// fixtures.mjs -- the local fixture users, organisations and workspace rows of the chain-proof attack suite
// (lane PROOF-4, 2026-10-07). Four actors: one platform admin, one organisation owner (org A), one member of a
// different organisation (org B), and one anonymous caller (a database role, no row). They exist ONLY on the
// disposable local stack the runner has already proven to be loopback (run-attacks.mjs assertLocalOnly): the
// user-app testing exception, test values on a local development host, nothing real, every address on the reserved
// .invalid domain. auth.users rows are written directly because the local stack's sign-up is off and the schema
// owner is the connection role; no password or token is created, so none can be used to sign in.
//
// Fixed ids make a re-run idempotent: setup removes the previous run's rows first, and teardown removes them again.

export const FIXTURE_IDS = Object.freeze({
  admin: "00000000-0000-4000-8000-0000000004a1",
  owner_a: "00000000-0000-4000-8000-0000000004a2",
  member_b: "00000000-0000-4000-8000-0000000004a3",
  org_a: "00000000-0000-4000-8000-0000000004b1",
  org_b: "00000000-0000-4000-8000-0000000004b2",
});

const USER_KEYS = ["admin", "owner_a", "member_b"];
const ORG_KEYS = ["org_a", "org_b"];
const EMAIL = (key) => `proof4-${key.replace("_", "-")}@chain-proof.invalid`;

/** The context every SQL attack starts from: fixture name to uuid. */
export function fixtureContext() {
  return { ...FIXTURE_IDS };
}

const ids = (keys) => keys.map((k) => FIXTURE_IDS[k]);

/** Removal statements, in reverse dependency order. Organisation deletion cascades to memberships, settings and tags. */
function removalStatements() {
  return [
    { label: "organizations", sql: "DELETE FROM public.organizations WHERE id = ANY($1::uuid[])", params: [ids(ORG_KEYS)] },
    { label: "profiles", sql: "DELETE FROM public.profiles WHERE id = ANY($1::uuid[])", params: [ids(USER_KEYS)] },
    { label: "auth.users", sql: "DELETE FROM auth.users WHERE id = ANY($1::uuid[])", params: [ids(USER_KEYS)] },
  ];
}

function creationStatements() {
  const out = [];
  for (const key of USER_KEYS) {
    out.push({
      label: `auth.users ${key}`,
      sql: "INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES ($1::uuid, 'authenticated', 'authenticated', $2::text, now(), now()) ON CONFLICT (id) DO NOTHING",
      params: [FIXTURE_IDS[key], EMAIL(key)],
    });
  }
  for (const key of USER_KEYS) {
    out.push({
      label: `profiles ${key}`,
      sql: "INSERT INTO public.profiles (id, email, display_name, is_platform_admin) VALUES ($1::uuid, $2::text, $3::text, $4::boolean)",
      params: [FIXTURE_IDS[key], EMAIL(key), `Proof4 ${key}`, key === "admin"],
    });
  }
  for (const key of ORG_KEYS) {
    out.push({
      label: `organizations ${key}`,
      sql: "INSERT INTO public.organizations (id, name, slug) VALUES ($1::uuid, $2::text, $3::text)",
      params: [FIXTURE_IDS[key], `Proof4 ${key}`, `proof4-${key.replace("_", "-")}`],
    });
  }
  for (const [org, user, role] of [["org_a", "owner_a", "owner"], ["org_b", "member_b", "member"]]) {
    out.push({
      label: `org_memberships ${org}`,
      sql: "INSERT INTO public.org_memberships (org_id, user_id, role) VALUES ($1::uuid, $2::uuid, $3::text)",
      params: [FIXTURE_IDS[org], FIXTURE_IDS[user], role],
    });
  }
  for (const org of ORG_KEYS) {
    out.push({
      label: `workspace_settings ${org}`,
      sql: "INSERT INTO public.workspace_settings (org_id) VALUES ($1::uuid)",
      params: [FIXTURE_IDS[org]],
    });
  }
  for (const org of ORG_KEYS) {
    out.push({
      label: `workspace_tags ${org}`,
      sql: "INSERT INTO public.workspace_tags (org_id, name) VALUES ($1::uuid, $2::text)",
      params: [FIXTURE_IDS[org], `proof4 tag ${org}`],
    });
  }
  return out;
}

async function runAll(client, statements, what) {
  for (const s of statements) {
    try {
      await client.query(s.sql, s.params);
    } catch (e) {
      throw new Error(`fixture ${what} failed at ${s.label}: ${String(e.code ?? "")} ${String(e.message).split("\n")[0]}`.trim());
    }
  }
}

/** Remove any earlier run's fixtures, then create these. Throws a message naming the failing statement. */
export async function setupFixtures(client) {
  await runAll(client, removalStatements(), "clean-up");
  await runAll(client, creationStatements(), "setup");
}

/** Remove the fixtures. Throws a message naming the failing statement. */
export async function teardownFixtures(client) {
  await runAll(client, removalStatements(), "teardown");
}
