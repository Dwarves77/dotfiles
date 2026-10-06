// create-org.test.mjs: lane AUTH-2 (2026-10-06). Organisation creation with the onboarding profile, plus
// the two attacks the design names: a POST that names another organisation cannot join it, and a
// self-chosen role is ignored. Also pins that accepting an invitation grants the INVITER's role.
//
// Run: node --test fsi-app/src/lib/orgs/create-org.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCreateOrgInput, createOrganisationForSelf } from "./create-org.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI = resolve(HERE, "..", "..", "..");
const SECTORS = ["fine-art", "live-events", "luxury-goods"];
const USER = "user-aaaa";
const OWN_ORG = "org-own";
const OTHER_ORG = "org-victim";

/** Fake client that logs every call. rpc returns OWN_ORG whatever the arguments say. */
function fakeClient({ profileJson = { roles: ["freight forwarder"], org_roles: ["forwarder"] }, rpcError = null, updateError = null } = {}) {
  const log = [];
  return {
    log,
    async rpc(name, args) {
      log.push({ kind: "rpc", name, args });
      return rpcError ? { data: null, error: rpcError } : { data: OWN_ORG, error: null };
    },
    from(table) {
      return {
        select() {
          return { eq: (col, val) => ({ maybeSingle: async () => { log.push({ kind: "select", table, col, val }); return { data: { profile: profileJson }, error: null }; } }) };
        },
        update(patch) {
          return {
            eq: async (col, val) => {
              log.push({ kind: "update", table, patch, col, val });
              return { error: updateError };
            },
          };
        },
        insert() { log.push({ kind: "insert", table }); throw new Error("create-org must not insert directly: " + table); },
        upsert() { log.push({ kind: "upsert", table }); throw new Error("create-org must not upsert"); },
      };
    },
  };
}

const parse = (body) => parseCreateOrgInput(body, { validSectorIds: SECTORS });

test("create-org writes the org (owner via RPC), sector_profile, size, region and job title", async () => {
  const parsed = parse({ name: "  Dietl Test  ", sectors: ["fine-art", "live-events"], headcount_band: "medium", regions: ["EU", "US"], job_title: "Head of operations" });
  assert.equal(parsed.ok, true);
  const client = fakeClient();
  const ensured = [];
  const res = await createOrganisationForSelf({
    supabase: client, userId: USER, email: "a@example.com", input: parsed.input,
    ensureProfile: async (id, email) => { ensured.push([id, email]); return { exists: true }; },
  });
  assert.deepEqual(res, { ok: true, orgId: OWN_ORG, settingsSaved: true, profileSaved: true });
  assert.deepEqual(ensured, [[USER, "a@example.com"]], "profile ensured before the RPC (membership FK)");
  assert.deepEqual(client.log.find((e) => e.kind === "rpc"), { kind: "rpc", name: "create_org_for_self", args: { p_org_name: "Dietl Test", p_org_slug: null } });

  const ws = client.log.find((e) => e.kind === "update" && e.table === "workspace_settings");
  assert.equal(ws.col, "org_id");
  assert.equal(ws.val, OWN_ORG);
  assert.deepEqual(ws.patch.sector_profile, ["fine-art", "live-events"]);
  assert.equal(ws.patch.profile.org_size.headcount_band, "medium");
  assert.deepEqual(ws.patch.profile.roles, ["freight forwarder"], "sibling profile keys kept");
  assert.deepEqual(ws.patch.profile.org_roles, ["forwarder"], "sibling profile keys kept");

  const pr = client.log.find((e) => e.kind === "update" && e.table === "profiles");
  assert.equal(pr.col, "id");
  assert.equal(pr.val, USER);
  assert.equal(pr.patch.job_title, "Head of operations");
  assert.deepEqual(pr.patch.region, ["EU", "US"]);
  assert.equal("is_platform_admin" in pr.patch, false);
});

test("create-org refuses to start when the profile cannot be ensured (no RPC, no writes)", async () => {
  const client = fakeClient();
  const res = await createOrganisationForSelf({
    supabase: client, userId: USER, email: null, input: parse({ name: "X" }).input,
    ensureProfile: async () => ({ exists: false }),
  });
  assert.equal(res.ok, false);
  assert.equal(client.log.length, 0);
});

test("a name-only body creates the org and writes no settings or profile fields", async () => {
  const client = fakeClient();
  const res = await createOrganisationForSelf({ supabase: client, userId: USER, email: null, input: parse({ name: "Solo" }).input, ensureProfile: async () => ({ exists: true }) });
  assert.equal(res.ok, true);
  assert.deepEqual(client.log.map((e) => e.kind), ["rpc"]);
});

test("an RPC failure is returned as a 400 with the database message and writes nothing else", async () => {
  const client = fakeClient({ rpcError: { message: "Org name too long" } });
  const res = await createOrganisationForSelf({ supabase: client, userId: USER, email: null, input: parse({ name: "X" }).input, ensureProfile: async () => ({ exists: true }) });
  assert.deepEqual(res, { ok: false, status: 400, error: "Org name too long" });
  assert.deepEqual(client.log.map((e) => e.kind), ["rpc"]);
});

test("a failed settings write is reported as settingsSaved false, not hidden", async () => {
  const client = fakeClient({ updateError: { message: "rls" } });
  const res = await createOrganisationForSelf({ supabase: client, userId: USER, email: null, input: parse({ name: "X", sectors: ["fine-art"], job_title: "COO" }).input, ensureProfile: async () => ({ exists: true }) });
  assert.equal(res.ok, true);
  assert.equal(res.settingsSaved, false);
  assert.equal(res.profileSaved, false);
});

// ── ATTACK 1: a POST that names another organisation's id cannot join it ───────────────────────────
test("ATTACK: a body naming another organisation (org_id, orgId, organization_id, slug) touches only the org the RPC returned for the caller", async () => {
  const parsed = parse({
    name: "Mine", org_id: OTHER_ORG, orgId: OTHER_ORG, organization_id: OTHER_ORG, slug: "victim-org", sectors: ["fine-art"], headcount_band: "large", user_id: "someone-else",
  });
  assert.equal(parsed.ok, true);
  assert.deepEqual(Object.keys(parsed.input).sort(), ["headcountBand", "jobTitle", "name", "regions", "sectors"], "allowlist: nothing else survives parsing");
  const client = fakeClient();
  await createOrganisationForSelf({ supabase: client, userId: USER, email: null, input: parsed.input, ensureProfile: async () => ({ exists: true }) });
  const serialised = JSON.stringify(client.log);
  assert.equal(serialised.includes(OTHER_ORG), false, "the other organisation's id appears in no call");
  assert.equal(serialised.includes("someone-else"), false);
  assert.equal(client.log.some((e) => e.table === "org_memberships"), false, "no direct membership access at all");
  for (const e of client.log.filter((x) => x.kind === "update" && x.table === "workspace_settings")) assert.equal(e.val, OWN_ORG);
  for (const e of client.log.filter((x) => x.kind === "update" && x.table === "profiles")) assert.equal(e.val, USER);
});

// ── ATTACK 2: a self-chosen role is ignored ────────────────────────────────────────────────────────
test("ATTACK: a self-chosen role (role, org_role, workspace_role, proposed_role) is ignored; the RPC carries no role", async () => {
  const parsed = parse({ name: "Mine", role: "owner", org_role: "admin", workspace_role: "owner", proposed_role: "admin", job_title: "Intern" });
  assert.equal(parsed.ok, true);
  assert.equal(JSON.stringify(parsed.input).toLowerCase().includes("admin"), false);
  const client = fakeClient();
  await createOrganisationForSelf({ supabase: client, userId: USER, email: null, input: parsed.input, ensureProfile: async () => ({ exists: true }) });
  const rpc = client.log.find((e) => e.kind === "rpc");
  assert.deepEqual(Object.keys(rpc.args).sort(), ["p_org_name", "p_org_slug"]);
  const profilePatch = client.log.find((e) => e.table === "profiles").patch;
  assert.equal("role" in profilePatch || "workspace_role" in profilePatch, false);
  assert.equal(profilePatch.job_title, "Intern", "the job title is a label, never a permission");
});

test("validation: unknown sector, band or region, and an over-long name, are refused; absent optionals are fine", () => {
  assert.equal(parse({}).ok, false);
  assert.equal(parse({ name: "X", sectors: ["nope"] }).ok, false);
  assert.equal(parse({ name: "X", headcount_band: "huge" }).ok, false);
  assert.equal(parse({ name: "X", regions: ["MARS"] }).ok, false);
  assert.equal(parse({ name: "x".repeat(201) }).ok, false);
  assert.equal(parse({ name: "X", job_title: "y".repeat(121) }).ok, false);
  const ok = parse({ name: "X", sectors: ["fine-art", "fine-art"] });
  assert.deepEqual(ok.input.sectors, ["fine-art"], "duplicates collapse");
  assert.equal(ok.input.headcountBand, null);
});

// ── Invitation accept joins with the role the inviter granted (source-level pin) ───────────────────
test("accepting an invitation passes only the token and the RPC inserts the inviter's proposed_role", () => {
  const route = readFileSync(resolve(FSI, "src/app/api/invitations/[token]/accept/route.ts"), "utf8");
  assert.match(route, /rpc\("accept_invitation",\s*\{\s*p_token: token,?\s*\}\)/, "the route sends the token and nothing else");
  assert.equal(/request\.json\(|searchParams|body/.test(route.replace(/\/\/.*$/gm, "")), false, "the route reads no role from the request");
  const sql = readFileSync(resolve(FSI, "supabase/migrations/156_org_member_bans.sql"), "utf8");
  assert.match(sql, /INSERT INTO public\.org_memberships \(org_id, user_id, role\)\s*VALUES \(v_invitation\.org_id, v_caller_id, v_invitation\.proposed_role\)/i, "the live accept_invitation body inserts the inviter's role");
});
