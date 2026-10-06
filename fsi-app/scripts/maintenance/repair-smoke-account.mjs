#!/usr/bin/env node
// repair-smoke-account.mjs: one-off repair for the first live smoke account (lane AUTH-2, 2026-10-06).
//
// The account confirmed its email and signed in, but the only creator of its profile
// (/auth/callback) never ran for it, so it has no profiles row and no org_memberships row. This step
// gives it exactly two rows, and nothing else:
//   1. a profiles row (org_id = the "Dietl / Rockit" organisation, found by NAME, is_platform_admin
//      false, job_title left null), skipped when a profile already exists;
//   2. an org_memberships row in that organisation with role member.
//
// REFUSES (exit 1, the reason is in the summary) when: no email argument; no auth user has that email;
// the user is a platform admin; the user already holds ANY membership; the organisation name matches
// zero rows or more than one. Platform admin is never touched. Prints ids and counts only, never the
// email, a name, or a credential.
//
// DRY BY DEFAULT. `--mode apply` (or bare `--apply`) writes through the guarded path in
// scripts/lib/db.mjs (rule 015: cite required, inserted rows snapshotted, reversal = delete the ids).
// Dispatch (coordinator's executor):
//   node fsi-app/scripts/maintenance/repair-smoke-account.mjs --arg <email>            (dry: prints the plan)
//   node fsi-app/scripts/maintenance/repair-smoke-account.mjs --arg <email> --apply    (writes, then reads back)
//
// Dependencies are injected into main(), so the test (repair-smoke-account.test.mjs) runs with no database.

import { readClient, readAll, guardedInsert } from "../lib/db.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const ORG_NAME = "Dietl / Rockit";

export const CITE = Object.freeze({
  skill: "caros-ledge-platform-intent",
  reason:
    "AUTH-2 (2026-10-06): repair the first smoke account, which confirmed its email without /auth/callback " +
    "running and so has no profiles row and no membership. Writes one profiles row and one member " +
    "org_memberships row in the Dietl / Rockit organisation, found by name. Never touches platform admin.",
});

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts  arg = the account's email
 * @param {{
 *   findAuthUserByEmail: (email: string) => Promise<{ id: string, email: string } | null>,
 *   findProfile: (userId: string) => Promise<{ id: string, is_platform_admin?: boolean } | null>,
 *   countMemberships: (userId: string) => Promise<number>,
 *   findOrgsByName: (name: string) => Promise<Array<{ id: string }>>,
 *   insertProfile: (row: object) => Promise<{ snapshot: string | null }>,
 *   insertMembership: (row: object) => Promise<{ snapshot: string | null }>,
 * }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "repair-smoke-account", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };
  const refuse = (reason) => {
    summary.refused = reason;
    summary.exitCode = 1;
    summary.note = `REFUSED: ${reason}. Nothing written.`;
    return summary;
  };

  const email = String(arg || "").trim().toLowerCase();
  if (!email) return refuse("no account email given (pass --arg <email>)");

  const user = await deps.findAuthUserByEmail(email);
  if (!user) return refuse("no auth user has that email");
  summary.user_id = user.id;

  const profile = await deps.findProfile(user.id);
  if (profile && profile.is_platform_admin === true) return refuse("the account is a platform admin; this repair never touches platform admin");

  const memberships = await deps.countMemberships(user.id);
  if (memberships > 0) return refuse(`the account already holds ${memberships} membership(s)`);

  const orgs = await deps.findOrgsByName(ORG_NAME);
  if (orgs.length !== 1) return refuse(`organisation name matched ${orgs.length} rows, exactly 1 is required`);
  const orgId = orgs[0].id;
  summary.org_id = orgId;

  const plan = {
    create_profile: !profile,
    profile_row: profile ? null : { id: user.id, org_id: orgId, is_platform_admin: false, role: "member" },
    membership_row: { org_id: orgId, user_id: user.id, role: "member" },
  };
  summary.counts = {
    auth_users_matched: 1,
    profiles_existing: profile ? 1 : 0,
    memberships_existing: 0,
    orgs_matched: 1,
    profiles_to_create: plan.create_profile ? 1 : 0,
    memberships_to_create: 1,
  };
  summary.plan = plan;

  if (!apply) {
    summary.note =
      `DRY: would ${plan.create_profile ? "create 1 profile and " : ""}insert 1 member membership ` +
      `in org ${orgId} for user ${user.id}. Nothing written.`;
    return summary;
  }

  // Profile first: org_memberships.user_id references profiles.id.
  if (plan.create_profile) {
    const res = await deps.insertProfile({
      id: user.id,
      email: user.email,
      role: "member",
      settings: {},
      org_id: orgId,
      is_platform_admin: false,
    });
    summary.applied += 1;
    summary.profile_snapshot = res && res.snapshot ? res.snapshot : null;
  }
  const mres = await deps.insertMembership({ org_id: orgId, user_id: user.id, role: "member" });
  summary.applied += 1;
  summary.membership_snapshot = mres && mres.snapshot ? mres.snapshot : null;

  const after = await deps.findProfile(user.id);
  const afterMemberships = await deps.countMemberships(user.id);
  summary.read_back = {
    profile_exists: !!after,
    profile_is_platform_admin: after ? after.is_platform_admin === true : null,
    memberships: afterMemberships,
  };
  summary.note = `Applied ${summary.applied} insert(s). Read-back: profile ${after ? "present" : "MISSING"}, ${afterMemberships} membership(s).`;
  if (!after || afterMemberships !== 1) summary.exitCode = 1;
  return summary;
}

if (isMainModule(import.meta.url)) {
  await runCli({
    step: "repair-smoke-account",
    main,
    needsDb: true,
    buildDeps: async () => ({
      findAuthUserByEmail: async (email) => {
        const client = readClient();
        for (let page = 1; page <= 50; page++) {
          const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
          if (error) throw new Error(`listUsers failed: ${error.message}`);
          const hit = (data.users || []).find((u) => (u.email || "").toLowerCase() === email);
          if (hit) return { id: hit.id, email: hit.email };
          if (!data.users || data.users.length < 200) return null;
        }
        return null;
      },
      findProfile: async (userId) => {
        const rows = await readAll("profiles", "id, is_platform_admin", { match: (q) => q.eq("id", userId) });
        return rows[0] ?? null;
      },
      countMemberships: async (userId) => {
        const rows = await readAll("org_memberships", "id", { match: (q) => q.eq("user_id", userId) });
        return rows.length;
      },
      findOrgsByName: (name) => readAll("organizations", "id", { match: (q) => q.eq("name", name) }),
      insertProfile: async (row) => {
        const { snapshot } = await guardedInsert("profiles", row, { cite: CITE, select: "id" });
        return { snapshot };
      },
      insertMembership: async (row) => {
        const { snapshot } = await guardedInsert("org_memberships", row, { cite: CITE, select: "id" });
        return { snapshot };
      },
    }),
  });
}
