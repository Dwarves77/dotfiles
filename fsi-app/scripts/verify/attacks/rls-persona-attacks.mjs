// rls-persona-attacks.mjs -- the targeted, seeded-row attacks of the RLS persona matrix (lane TESTS-1, 2026-10-09).
//
// The matrix (rls-persona-matrix.mjs) covers every public table by every persona by every command, but a cell on a table
// with no rows only proves the grant layer. These attacks run on rows the fixture set DOES seed (one workspace_tags row
// in each of org A and org B) and prove the policy layer in both directions, in the attack engine's step shape
// (scripts/proof/attacks/attack-engine.mjs): "attack" steps are forbidden actions and must be refused, "control" steps are
// the legitimate path and must still work, so a guard that also kills the legitimate path is not a proof.
//
// Personas (rls-personas.mjs): P1 anon, P2 org viewer (viewer_a), P3 member of another org (member_b), P4 org member
// (member_a). Org A owns the attacked rows; org B is the "other organisation".
//
// Expectations are SQLSTATEs, counts and booleans only (the engine never records a database value). Not an automatic
// writer of anything: every statement runs in a transaction the engine always rolls back.

const TAGS_A = "SELECT id FROM public.workspace_tags WHERE org_id = $1::uuid";
const TAGS_N = "SELECT count(*)::int AS n FROM public.workspace_tags WHERE org_id = $1::uuid";
const TAG_UPDATE = "UPDATE public.workspace_tags SET name = name WHERE org_id = $1::uuid";
const TAG_DELETE = "DELETE FROM public.workspace_tags WHERE org_id = $1::uuid";
const TAG_INSERT = "INSERT INTO public.workspace_tags (org_id, name, created_by) VALUES ($1::uuid, 'rls persona tag', $2::uuid)";

const intact = (label = "control: org A still has exactly its one tag (nothing above got through)") => ({
  label,
  kind: "control",
  sql: TAGS_N,
  params: ["@org_a"],
  expect: { equals: { n: "1" } },
});


// Migration 367 (SEC-2): the nine status columns of public.profiles are not writable by the profile's own user. The exact
// attack spec was owed by the SEC-2 session log (2026-10-08-sec2-profile-status-columns.md, "NOT done"): (a) and (b) a
// self-update of each status column is refused 42501, (e) a self-insert that sets one is refused 42501, (f) the same for
// the linkedin_* columns; (c) request_verification() from 'none' returns 'pending' (the one legitimate path), (d) from
// 'active' it is refused 55000. The step that moves the row to 'active' runs as the connection role, which the guard
// trigger sanctions (migration 367 profiles_privilege_guard), inside the engine's rolled-back transaction.
const STATUS_COLUMN_ASSIGNMENTS = Object.freeze([
  "verifier_status = 'active'",
  "verification_tier = 'staff_verified'",
  "membership_tier = 'premium'",
  "contribution_score = 9999",
  "verifier_since = now()",
  "linkedin_verified = true",
  "linkedin_identity_verified = true",
  "linkedin_workplace_verified = true",
  "linkedin_verification_checked_at = now()",
]);
const OWN_STATUS = "SELECT verifier_status AS s FROM public.profiles WHERE id = $1::uuid";
const REQUEST_VERIFICATION = "SELECT public.request_verification()::text AS s";

export const STATUS_COLUMN_ATTACK = Object.freeze({
  id: "rls-persona-status-columns-self-authorise-refused",
  persona: "P4",
  invariant: "An organisation member cannot write their own verifier_status, verification_tier, membership_tier, contribution_score, verifier_since or linkedin_* verification flags, by UPDATE or INSERT; the one legitimate transition, request_verification(), works from none and is refused from active.",
  expected: "Each of the nine self-updates and the self-insert is refused 42501; request_verification() from none returns pending; after the row is moved to active the same call is refused 55000.",
  steps: [
    { label: "control: the org A member's profile starts at verifier_status none", kind: "control", sql: OWN_STATUS, params: ["@member_a"], expect: { equals: { s: "none" } } },
    ...STATUS_COLUMN_ASSIGNMENTS.map((assign) => ({
      label: `attack: the member self-updates ${assign.split(" = ")[0]}`,
      kind: "attack", as: "user:member_a", sql: `UPDATE public.profiles SET ${assign} WHERE id = $1::uuid`, params: ["@member_a"], expect: { error: "42501" },
    })),
    { label: "attack: the member inserts a profile row that sets verifier_status active", kind: "attack", as: "user:member_a", sql: "INSERT INTO public.profiles (id, verifier_status) VALUES ($1::uuid, 'active')", params: ["@member_a"], expect: { error: "42501" } },
    { label: "control: request_verification() from none returns pending", kind: "control", as: "user:member_a", sql: REQUEST_VERIFICATION, params: [], expect: { equals: { s: "pending" } } },
    { label: "control: the connection role (sanctioned by the guard) moves the member's profile to active", kind: "control", sql: "UPDATE public.profiles SET verifier_status = 'active' WHERE id = $1::uuid", params: ["@member_a"], expect: { row_count: 1 } },
    { label: "attack: request_verification() from active is refused 55000", kind: "attack", as: "user:member_a", sql: REQUEST_VERIFICATION, params: [], expect: { error: "55000" } },
  ],
});

// AUD-AT-1 section 4 item 5 (owed): "Layer 2 standing alone (the guard trigger with the column grant restored) was not
// exercised". Layer 1 is the column privilege revoke (364, 367); layer 2 is the BEFORE trigger profiles_privilege_guard.
// This attack restores the column UPDATE grant to authenticated INSIDE the engine's rolled-back transaction, as the
// connection role, so layer 1 no longer answers, and proves the trigger alone still refuses 42501 with its own message.
// The grant never survives: the engine rolls the whole attack back.
const GUARDED_ASSIGNMENTS = Object.freeze([
  ["is_platform_admin", "is_platform_admin = NOT is_platform_admin"],
  ["org_id", "org_id = gen_random_uuid()"],
  ["verifier_status", "verifier_status = 'active'"],
]);

export const GUARD_STANDING_ALONE_ATTACK = Object.freeze({
  id: "rls-persona-profiles-guard-trigger-stands-alone",
  persona: "P4",
  invariant: "With the column UPDATE grant on public.profiles restored to authenticated, the profiles_privilege_guard trigger alone still refuses an organisation member changing their own is_platform_admin, org_id or verifier_status.",
  expected: "Each of the three self-updates is refused 42501 by the trigger (its message names profiles_privilege_guard), and an update of a column the guard does not cover still works.",
  steps: [
    { label: "control: the connection role restores the column UPDATE grant to authenticated (layer 1 removed)", kind: "control", sql: "GRANT UPDATE (is_platform_admin, org_id, verifier_status, display_name) ON public.profiles TO authenticated", params: [], expect: { ok: true } },
    ...GUARDED_ASSIGNMENTS.map(([col, assign]) => ({
      label: `attack: with the grant restored the member self-updates ${col}, the trigger refuses`,
      kind: "attack", as: "user:member_a", sql: `UPDATE public.profiles SET ${assign} WHERE id = $1::uuid`, params: ["@member_a"],
      expect: { error: "42501", message_includes: "profiles_privilege_guard" },
    })),
    { label: "control: with the grant restored the member can still update an unguarded column (display_name)", kind: "control", as: "user:member_a", sql: "UPDATE public.profiles SET display_name = display_name WHERE id = $1::uuid", params: ["@member_a"], expect: { row_count: 1 } },
  ],
});

export const TARGETED_ATTACKS = Object.freeze([
  {
    id: "rls-persona-p3-member-of-another-org-denied",
    persona: "P3",
    invariant: "A member of organisation B cannot read, change, delete or add to organisation A's workspace tags, and still reads organisation B's own.",
    expected: "The cross-org read and the cross-org update and delete match zero rows (or 42501); the cross-org insert is refused 42501; the control read of org B's tag returns a row; org A still has its one tag.",
    steps: [
      { label: "control: the org B member reads org B's own tag", kind: "control", as: "user:member_b", sql: TAGS_A, params: ["@org_b"], expect: { rows_min: 1 } },
      { label: "attack: the org B member reads org A's tags", kind: "attack", as: "user:member_b", sql: TAGS_A, params: ["@org_a"], expect: { denied_or_rows: 0 } },
      { label: "attack: the org B member updates org A's tags", kind: "attack", as: "user:member_b", sql: TAG_UPDATE, params: ["@org_a"], expect: { denied_or_rows: 0 } },
      { label: "attack: the org B member deletes org A's tags", kind: "attack", as: "user:member_b", sql: TAG_DELETE, params: ["@org_a"], expect: { denied_or_rows: 0 } },
      { label: "attack: the org B member adds a tag to org A", kind: "attack", as: "user:member_b", sql: TAG_INSERT, params: ["@org_a", "@member_b"], expect: { error: "42501" } },
      intact(),
    ],
  },
  {
    id: "rls-persona-p2-viewer-is-read-only",
    persona: "P2",
    invariant: "An organisation viewer reads the organisation's workspace tags and cannot add, change or delete one.",
    expected: "The control read returns the org's tag; the viewer's insert is refused 42501 and its update and delete match zero rows (or 42501); org A still has its one tag.",
    steps: [
      { label: "control: the viewer reads org A's tags", kind: "control", as: "user:viewer_a", sql: TAGS_A, params: ["@org_a"], expect: { rows_min: 1 } },
      { label: "attack: the viewer adds a tag", kind: "attack", as: "user:viewer_a", sql: TAG_INSERT, params: ["@org_a", "@viewer_a"], expect: { error: "42501" } },
      { label: "attack: the viewer updates org A's tags", kind: "attack", as: "user:viewer_a", sql: TAG_UPDATE, params: ["@org_a"], expect: { denied_or_rows: 0 } },
      { label: "attack: the viewer deletes org A's tags", kind: "attack", as: "user:viewer_a", sql: TAG_DELETE, params: ["@org_a"], expect: { denied_or_rows: 0 } },
      intact(),
    ],
  },
  {
    id: "rls-persona-p1-anon-sees-no-org-rows",
    persona: "P1",
    invariant: "An anonymous caller reads no organisation's workspace tags and cannot add, change or delete one.",
    expected: "The anonymous read, update and delete match zero rows (or 42501); the insert is refused 42501; org A still has its one tag.",
    steps: [
      { label: "attack: anon reads org A's tags", kind: "attack", as: "anon", sql: TAGS_A, params: ["@org_a"], expect: { denied_or_rows: 0 } },
      { label: "attack: anon adds a tag to org A", kind: "attack", as: "anon", sql: TAG_INSERT, params: ["@org_a", "@owner_a"], expect: { error: "42501" } },
      { label: "attack: anon updates org A's tags", kind: "attack", as: "anon", sql: TAG_UPDATE, params: ["@org_a"], expect: { denied_or_rows: 0 } },
      { label: "attack: anon deletes org A's tags", kind: "attack", as: "anon", sql: TAG_DELETE, params: ["@org_a"], expect: { denied_or_rows: 0 } },
      intact(),
    ],
  },
  {
    id: "rls-persona-p4-member-is-scoped-to-own-org",
    persona: "P4",
    invariant: "An organisation member writes inside their own organisation and nowhere else.",
    expected: "The control insert into org A affects one row; the member's insert into org B is refused 42501 and its update of org B's tags matches zero rows (or 42501).",
    steps: [
      { label: "control: the org A member reads org A's tags", kind: "control", as: "user:member_a", sql: TAGS_A, params: ["@org_a"], expect: { rows_min: 1 } },
      { label: "control: the org A member adds a tag to org A", kind: "control", as: "user:member_a", sql: TAG_INSERT, params: ["@org_a", "@member_a"], expect: { row_count: 1 } },
      { label: "attack: the org A member adds a tag to org B", kind: "attack", as: "user:member_a", sql: TAG_INSERT, params: ["@org_b", "@member_a"], expect: { error: "42501" } },
      { label: "attack: the org A member updates org B's tags", kind: "attack", as: "user:member_a", sql: TAG_UPDATE, params: ["@org_b"], expect: { denied_or_rows: 0 } },
      { label: "attack: the org A member deletes org B's tags", kind: "attack", as: "user:member_a", sql: TAG_DELETE, params: ["@org_b"], expect: { denied_or_rows: 0 } },
    ],
  },
  STATUS_COLUMN_ATTACK,
  GUARD_STANDING_ALONE_ATTACK,
]);
