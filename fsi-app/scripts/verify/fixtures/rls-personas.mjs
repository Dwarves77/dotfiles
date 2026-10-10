// rls-personas.mjs -- the persona fixture set of the RLS attack matrix (lane TESTS-1, 2026-10-09; AUD-AT-1 section 4
// items 1 and 2: P2 "org viewer" and P3 "org member of another org" were OWED because no viewer membership and only one
// organisation existed on the production schema).
//
// It EXTENDS the chain-proof fixture set (scripts/proof/attacks/fixtures.mjs: an admin, an owner of org A, a member of
// org B, two organisations, one workspace_tags and one workspace_settings row each) with the two users that set lacks:
//
//   P1  anon                            a database role, no row
//   P2  org viewer      (viewer_a)      role viewer in org A
//   P3  member of another org (member_b) role member in org B, nothing in org A   (already in the base set)
//   P4  org member      (member_a)      role member in org A
//
// They exist ONLY on the disposable local stack (the runner refuses any other environment before it calls this
// module): auth.users rows are written directly, with no password or token, every address on the reserved .invalid
// domain. Fixed ids make a re-run idempotent: setup removes the previous run's rows first, teardown removes them again.
//
// Pure of pg: the client is injected, so the statements and their order are unit-tested against a recording fake.

import { FIXTURE_IDS, fixtureContext, setupFixtures, teardownFixtures } from "../../proof/attacks/fixtures.mjs";

export const PERSONA_IDS = Object.freeze({
  viewer_a: "00000000-0000-4000-8000-0000000004c1",
  member_a: "00000000-0000-4000-8000-0000000004c2",
});

/** The personas the matrix runs, in order. `as` is the attack engine's role syntax (attack-engine.mjs parseRole). */
export const PERSONAS = Object.freeze([
  Object.freeze({ id: "P1", name: "anon", as: "anon", role: "anon" }),
  Object.freeze({ id: "P2", name: "org viewer", as: "user:viewer_a", role: "authenticated" }),
  Object.freeze({ id: "P3", name: "member of another org", as: "user:member_b", role: "authenticated" }),
  Object.freeze({ id: "P4", name: "org member", as: "user:member_a", role: "authenticated" }),
]);

const EXTRA_KEYS = Object.keys(PERSONA_IDS);
const EMAIL = (key) => `rls-persona-${key.replace("_", "-")}@chain-proof.invalid`;

/** The context every persona attack starts from: the base fixture ids plus the two persona users. */
export function personaContext() {
  return { ...fixtureContext(), ...PERSONA_IDS };
}

/** Removal statements for the persona users, in reverse dependency order. Memberships go with the user's profile row. */
export function personaRemovalStatements() {
  const ids = EXTRA_KEYS.map((k) => PERSONA_IDS[k]);
  return [
    { label: "org_memberships personas", sql: "DELETE FROM public.org_memberships WHERE user_id = ANY($1::uuid[])", params: [ids] },
    { label: "profiles personas", sql: "DELETE FROM public.profiles WHERE id = ANY($1::uuid[])", params: [ids] },
    { label: "auth.users personas", sql: "DELETE FROM auth.users WHERE id = ANY($1::uuid[])", params: [ids] },
  ];
}

/** Creation statements for the persona users: auth user, profile, then the org A membership with its role. */
export function personaCreationStatements() {
  const out = [];
  for (const key of EXTRA_KEYS) {
    out.push({
      label: `auth.users ${key}`,
      sql: "INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES ($1::uuid, 'authenticated', 'authenticated', $2::text, now(), now()) ON CONFLICT (id) DO NOTHING",
      params: [PERSONA_IDS[key], EMAIL(key)],
    });
  }
  for (const key of EXTRA_KEYS) {
    out.push({
      label: `profiles ${key}`,
      sql: "INSERT INTO public.profiles (id, email, display_name) VALUES ($1::uuid, $2::text, $3::text)",
      params: [PERSONA_IDS[key], EMAIL(key), `RLS persona ${key}`],
    });
  }
  for (const [key, role] of [["viewer_a", "viewer"], ["member_a", "member"]]) {
    out.push({
      label: `org_memberships ${key}`,
      sql: "INSERT INTO public.org_memberships (org_id, user_id, role) VALUES ($1::uuid, $2::uuid, $3::text)",
      params: [FIXTURE_IDS.org_a, PERSONA_IDS[key], role],
    });
  }
  return out;
}

async function runAll(client, statements, what) {
  for (const s of statements) {
    try {
      await client.query(s.sql, s.params);
    } catch (e) {
      throw new Error(`persona fixture ${what} failed at ${s.label}: ${String(e.code ?? "")} ${String(e.message).split("\n")[0]}`.trim());
    }
  }
}

/** Base fixtures first (they clear any earlier run), then the persona users. Throws naming the failing statement. */
export async function setupPersonaFixtures(client) {
  await setupFixtures(client);
  await runAll(client, personaRemovalStatements(), "clean-up");
  await runAll(client, personaCreationStatements(), "setup");
}

/** Persona users first, then the base fixtures. Throws naming the failing statement. */
export async function teardownPersonaFixtures(client) {
  await runAll(client, personaRemovalStatements(), "teardown");
  await teardownFixtures(client);
}
