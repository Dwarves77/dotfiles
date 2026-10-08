// Tests for the workspace item notes and assignments handlers (lane S8-A, 2026-10-07). No database: a small
// in-memory fake of the supabase query builder (only the calls the handlers make), so the QUERY SCOPING is what is
// attacked. The routes run on a service-role client where RLS does not apply, so the cross-org boundary is the
// `.eq("org_id", ctx.orgId)` on every read and write; each attack below fails if one of those is removed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addNote,
  deleteNote,
  editNote,
  listNotes,
  parseNoteBody,
} from "./item-notes.mjs";
import {
  assignMembers,
  isIsoDate,
  listAssignments,
  parseAssignInput,
  removeAssignment,
  setAssignmentState,
} from "./item-assignments.mjs";
import { NOTE_MAX_LENGTH, MAX_ASSIGNEES_PER_REQUEST, canWrite, isOrgAdmin, itemIdFromDetailPath } from "./item-collab-shared.mjs";

const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG_A = u(1);
const ORG_B = u(2);
const ALICE = u(11); // org A admin
const BOB = u(12); // org A member
const CAROL = u(13); // org A viewer
const DAVE = u(21); // org B member
const ERIN = u(14); // org A member
const ITEM = u(100);
const OTHER_ITEM = u(101);

function makeDb() {
  const tables = {
    org_memberships: [
      { user_id: ALICE, org_id: ORG_A, role: "admin", created_at: "2026-01-01", user: { full_name: "Alice Admin" } },
      { user_id: BOB, org_id: ORG_A, role: "member", created_at: "2026-01-02", user: { display_name: "Bob Member" } },
      { user_id: CAROL, org_id: ORG_A, role: "viewer", created_at: "2026-01-03", user: { email: "carol@example.test" } },
      { user_id: ERIN, org_id: ORG_A, role: "member", created_at: "2026-01-04", user: { full_name: "Erin Member" } },
      { user_id: DAVE, org_id: ORG_B, role: "member", created_at: "2026-01-05", user: { full_name: "Dave Other" } },
    ],
    item_notes: [],
    item_assignments: [],
  };
  let seq = 0;
  const nextId = () => u(1000 + ++seq);
  const clock = () => `2026-10-07T00:00:${String(seq).padStart(2, "0")}.000Z`;

  class Query {
    constructor(name) {
      this.name = name;
      this.op = "select";
      this.filters = [];
      this.orderBy = null;
      this.max = null;
      this.returning = false;
    }
    select() {
      if (this.op !== "select") this.returning = true;
      return this;
    }
    insert(payload) {
      this.op = "insert";
      this.payload = payload;
      return this;
    }
    update(patch) {
      this.op = "update";
      this.patch = patch;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    eq(col, val) {
      this.filters.push((r) => r[col] === val);
      return this;
    }
    is(col, val) {
      this.filters.push((r) => (val === null ? r[col] == null : r[col] === val));
      return this;
    }
    in(col, vals) {
      this.filters.push((r) => vals.includes(r[col]));
      return this;
    }
    order(col, { ascending = true } = {}) {
      this.orderBy = { col, ascending };
      return this;
    }
    limit(n) {
      this.max = n;
      return this;
    }
    run() {
      const rows = tables[this.name];
      if (this.op === "insert") {
        const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
        const made = [];
        for (const p of incoming) {
          const row =
            this.name === "item_notes"
              ? { id: nextId(), edited_at: null, deleted_at: null, created_at: clock(), ...p }
              : { id: nextId(), due_on: null, state: "open", created_at: clock(), ...p };
          if (
            this.name === "item_assignments" &&
            rows.some((r) => r.org_id === row.org_id && r.item_id === row.item_id && r.assignee_user_id === row.assignee_user_id)
          ) {
            return { data: null, error: { message: "duplicate key value violates unique constraint" } };
          }
          rows.push(row);
          made.push(row);
        }
        return { data: this.returning ? made.map((r) => ({ ...r })) : null, error: null };
      }
      const matched = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "update") {
        for (const r of matched) Object.assign(r, this.patch);
        return { data: this.returning ? matched.map((r) => ({ ...r })) : null, error: null };
      }
      if (this.op === "delete") {
        tables[this.name] = rows.filter((r) => !matched.includes(r));
        return { data: null, error: null };
      }
      let out = matched.map((r) => ({ ...r }));
      if (this.orderBy) {
        const { col, ascending } = this.orderBy;
        out.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (ascending ? 1 : -1));
      }
      if (this.max != null) out = out.slice(0, this.max);
      return { data: out, error: null };
    }
    maybeSingle() {
      const r = this.run();
      return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error });
    }
    single() {
      const r = this.run();
      if (r.error) return Promise.resolve(r);
      if (!r.data?.[0]) return Promise.resolve({ data: null, error: { message: "no row" } });
      return Promise.resolve({ data: r.data[0], error: null });
    }
    then(resolve, reject) {
      return Promise.resolve(this.run()).then(resolve, reject);
    }
  }

  const db = {
    tables,
    from(name) {
      if (!tables[name]) throw new Error(`fake db: unknown table ${name}`);
      return new Query(name);
    },
  };
  return db;
}

const ITEM_ROW = { id: ITEM, legacyId: "r42", title: "EU packaging rule", type: "regulation", domain: 1 };
const ctxFor = (userId, orgId, role, item = ITEM_ROW) => ({ userId, orgId, role, item });
const asAlice = () => ctxFor(ALICE, ORG_A, "admin");
const asBob = () => ctxFor(BOB, ORG_A, "member");
const asCarol = () => ctxFor(CAROL, ORG_A, "viewer");
const asDave = () => ctxFor(DAVE, ORG_B, "member");

// ── helpers ────────────────────────────────────────────────────────────────

test("canWrite and isOrgAdmin: viewer reads only, owner and admin administer", () => {
  assert.equal(canWrite("viewer"), false);
  for (const r of ["owner", "admin", "member"]) assert.equal(canWrite(r), true);
  assert.equal(isOrgAdmin("owner"), true);
  assert.equal(isOrgAdmin("admin"), true);
  assert.equal(isOrgAdmin("member"), false);
  assert.equal(isOrgAdmin("viewer"), false);
});

test("itemIdFromDetailPath reads the id off the four detail routes only", () => {
  assert.equal(itemIdFromDetailPath("/regulations/r42"), "r42");
  assert.equal(itemIdFromDetailPath("/market/some%20slug"), "some slug");
  assert.equal(itemIdFromDetailPath("/operations/o1/"), "o1");
  assert.equal(itemIdFromDetailPath("/research/f8268063-0e07-4562-82da-a1373d6dd797"), "f8268063-0e07-4562-82da-a1373d6dd797");
  assert.equal(itemIdFromDetailPath("/regulations"), null);
  assert.equal(itemIdFromDetailPath("/regulations/a/b"), null);
  assert.equal(itemIdFromDetailPath("/community/smoke-test"), null);
  assert.equal(itemIdFromDetailPath("/admin/items/x"), null);
  assert.equal(itemIdFromDetailPath(null), null);
  assert.equal(itemIdFromDetailPath("/regulations/%E0%A4%A"), null);
});

// ── notes ──────────────────────────────────────────────────────────────────

test("parseNoteBody trims, refuses blank and over-length with a plain message", () => {
  assert.deepEqual(parseNoteBody("  hello  "), { body: "hello" });
  assert.match(parseNoteBody("   ").error, /Write a note/);
  assert.match(parseNoteBody(undefined).error, /Write a note/);
  const long = parseNoteBody("x".repeat(NOTE_MAX_LENGTH + 1));
  assert.match(long.error, new RegExp(`${NOTE_MAX_LENGTH}`));
  assert.match(long.error, /Shorten/);
});

test("a member adds a note; the list shows it with the author's name and the caller's rights", async () => {
  const db = makeDb();
  const added = await addNote({ supabase: db }, asBob(), { body: "  Check with the broker before the 14th.  " });
  assert.equal(added.status, 201);
  assert.equal(added.body.note.body, "Check with the broker before the 14th.");
  assert.equal(added.body.note.author_name, "Bob Member");
  assert.equal(added.body.note.mine, true);
  assert.equal(added.body.note.can_edit, true);
  assert.equal(added.body.note.can_delete, false);
  assert.equal(db.tables.item_notes[0].org_id, ORG_A);
  assert.equal(db.tables.item_notes[0].author_user_id, BOB);

  await addNote({ supabase: db }, asAlice(), { body: "Second note" });
  const asAdmin = await listNotes({ supabase: db }, asAlice());
  assert.equal(asAdmin.status, 200);
  assert.deepEqual(asAdmin.body.notes.map((n) => n.body), ["Second note", "Check with the broker before the 14th."], "newest first");
  assert.equal(asAdmin.body.notes[0].can_delete, true);
  assert.equal(asAdmin.body.notes[1].can_edit, false, "an admin does not get edit on another member's note");
  assert.deepEqual(asAdmin.body.viewer, { role: "admin", can_write: true, can_delete: true });
});

test("a blank or over-length note writes nothing", async () => {
  const db = makeDb();
  assert.equal((await addNote({ supabase: db }, asBob(), { body: "  " })).status, 400);
  assert.equal((await addNote({ supabase: db }, asBob(), null)).status, 400);
  assert.equal((await addNote({ supabase: db }, asBob(), { body: "y".repeat(NOTE_MAX_LENGTH + 1) })).status, 400);
  assert.equal(db.tables.item_notes.length, 0);
});

test("a viewer can read notes but not add or edit", async () => {
  const db = makeDb();
  await addNote({ supabase: db }, asBob(), { body: "visible to the viewer" });
  const list = await listNotes({ supabase: db }, asCarol());
  assert.equal(list.body.notes.length, 1);
  assert.equal(list.body.viewer.can_write, false);
  assert.equal((await addNote({ supabase: db }, asCarol(), { body: "nope" })).status, 403);
  assert.equal(db.tables.item_notes.length, 1);
});

test("ATTACK cross-org read: another org's member sees none of org A's notes", async () => {
  const db = makeDb();
  await addNote({ supabase: db }, asBob(), { body: "org A private" });
  const list = await listNotes({ supabase: db }, asDave());
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.notes, []);
});

test("ATTACK cross-org write: org B cannot edit or delete org A's note by id", async () => {
  const db = makeDb();
  const { body } = await addNote({ supabase: db }, asBob(), { body: "org A private" });
  const noteId = body.note.id;
  const edit = await editNote({ supabase: db }, asDave(), { noteId, body: "tampered" });
  assert.equal(edit.status, 404);
  const adminB = ctxFor(DAVE, ORG_B, "admin");
  const del = await deleteNote({ supabase: db }, adminB, { noteId });
  assert.equal(del.status, 404, "even an admin of another org cannot reach it");
  assert.equal(db.tables.item_notes[0].body, "org A private");
  assert.equal(db.tables.item_notes[0].deleted_at, null);
});

test("ATTACK item scoping: a note is not reachable through a different item", async () => {
  const db = makeDb();
  const { body } = await addNote({ supabase: db }, asBob(), { body: "on item one" });
  const other = ctxFor(BOB, ORG_A, "member", { ...ITEM_ROW, id: OTHER_ITEM });
  assert.deepEqual((await listNotes({ supabase: db }, other)).body.notes, []);
  assert.equal((await editNote({ supabase: db }, other, { noteId: body.note.id, body: "x" })).status, 404);
});

test("ATTACK author-only edit: an admin and another member are refused, the author succeeds and is marked edited", async () => {
  const db = makeDb();
  const { body } = await addNote({ supabase: db }, asBob(), { body: "original" });
  const noteId = body.note.id;
  assert.equal((await editNote({ supabase: db }, asAlice(), { noteId, body: "admin rewrite" })).status, 403);
  assert.equal((await editNote({ supabase: db }, ctxFor(ERIN, ORG_A, "member"), { noteId, body: "peer rewrite" })).status, 403);
  assert.equal(db.tables.item_notes[0].body, "original");
  assert.equal(db.tables.item_notes[0].edited_at, null);

  const ok = await editNote({ supabase: db }, asBob(), { noteId, body: "  revised  " });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.note.body, "revised");
  assert.ok(ok.body.note.edited_at, "edited_at is stamped");
  assert.equal(db.tables.item_notes[0].body, "revised");
});

test("an edit with a blank body is refused and keeps the stored note", async () => {
  const db = makeDb();
  const { body } = await addNote({ supabase: db }, asBob(), { body: "keep me" });
  const r = await editNote({ supabase: db }, asBob(), { noteId: body.note.id, body: "   " });
  assert.equal(r.status, 400);
  assert.equal(db.tables.item_notes[0].body, "keep me");
});

test("delete is owner or admin only and soft: the row stays, the list drops it, an edit then 404s", async () => {
  const db = makeDb();
  const { body } = await addNote({ supabase: db }, asBob(), { body: "to be removed" });
  const noteId = body.note.id;
  assert.equal((await deleteNote({ supabase: db }, asBob(), { noteId })).status, 403, "the author alone cannot delete");
  assert.equal(db.tables.item_notes[0].deleted_at, null);

  assert.equal((await deleteNote({ supabase: db }, asAlice(), { noteId })).status, 200);
  assert.equal(db.tables.item_notes.length, 1, "soft delete keeps the row");
  assert.ok(db.tables.item_notes[0].deleted_at);
  assert.deepEqual((await listNotes({ supabase: db }, asAlice())).body.notes, []);
  assert.equal((await editNote({ supabase: db }, asBob(), { noteId, body: "zombie" })).status, 404);
  assert.equal((await deleteNote({ supabase: db }, asAlice(), { noteId })).status, 404, "deleting twice is a plain 404");
});

test("a moved legacy note has no author: nobody edits it, an admin deletes it", async () => {
  const db = makeDb();
  db.tables.item_notes.push({
    id: u(9001), org_id: ORG_A, item_id: ITEM, author_user_id: null, body: "from the old single field",
    created_at: "2026-01-01", edited_at: null, deleted_at: null, legacy_override_id: u(5),
  });
  const list = await listNotes({ supabase: db }, asBob());
  assert.equal(list.body.notes[0].author_name, null);
  assert.equal(list.body.notes[0].can_edit, false);
  assert.equal((await editNote({ supabase: db }, asBob(), { noteId: u(9001), body: "x" })).status, 403);
  assert.equal((await editNote({ supabase: db }, asAlice(), { noteId: u(9001), body: "x" })).status, 403);
  assert.equal((await deleteNote({ supabase: db }, asAlice(), { noteId: u(9001) })).status, 200);
});

// ── assignments ────────────────────────────────────────────────────────────

test("parseAssignInput and isIsoDate validate ids, count and the due date", () => {
  assert.deepEqual(parseAssignInput({ assignees: [BOB, BOB, CAROL], dueOn: "2026-11-01" }), { assignees: [BOB, CAROL], dueOn: "2026-11-01" });
  assert.deepEqual(parseAssignInput({ assignees: [BOB] }), { assignees: [BOB], dueOn: null });
  assert.deepEqual(parseAssignInput({ assignees: [BOB], dueOn: "" }), { assignees: [BOB], dueOn: null });
  assert.match(parseAssignInput({ assignees: [] }).error, /at least one/);
  assert.match(parseAssignInput(null).error, /at least one/);
  assert.match(parseAssignInput({ assignees: ["not-a-uuid"] }).error, /member id/);
  assert.match(parseAssignInput({ assignees: [BOB], dueOn: "2026-02-30" }).error, /real date/);
  assert.match(parseAssignInput({ assignees: [BOB], dueOn: "next week" }).error, /real date/);
  const many = Array.from({ length: MAX_ASSIGNEES_PER_REQUEST + 1 }, (_, i) => u(500 + i));
  assert.match(parseAssignInput({ assignees: many }).error, /at most/);
  assert.equal(isIsoDate("2026-10-07"), true);
  assert.equal(isIsoDate("2026-13-01"), false);
});

test("an admin assigns two members with a due date; each is notified once with a link to the item", async () => {
  const db = makeDb();
  const sent = [];
  const notify = async (n) => { sent.push(n); return null; };
  const r = await assignMembers({ supabase: db, notify }, asAlice(), { assignees: [BOB, ERIN], dueOn: "2026-11-01" });
  assert.equal(r.status, 201);
  assert.equal(r.body.assignments.length, 2);
  assert.equal(r.body.notified, 2);
  assert.equal(r.body.notify_failed, 0);
  assert.deepEqual(db.tables.item_assignments.map((a) => [a.assignee_user_id, a.assigned_by, a.due_on, a.state, a.org_id]), [
    [BOB, ALICE, "2026-11-01", "open", ORG_A],
    [ERIN, ALICE, "2026-11-01", "open", ORG_A],
  ]);
  assert.deepEqual(sent.map((s) => s.userId), [BOB, ERIN]);
  for (const s of sent) {
    assert.equal(s.kind, "assignment");
    assert.equal(s.payload.link, "/regulations/r42");
    assert.equal(s.payload.item_id, ITEM);
    assert.equal(s.payload.assigned_by, ALICE);
    assert.match(s.payload.body, /Alice Admin assigned you "EU packaging rule", due 2026-11-01/);
  }
});

test("assigning yourself notifies nobody", async () => {
  const db = makeDb();
  const sent = [];
  const r = await assignMembers({ supabase: db, notify: async (n) => { sent.push(n); return null; } }, asBob(), { assignees: [BOB] });
  assert.equal(r.status, 201);
  assert.equal(r.body.notified, 0);
  assert.equal(sent.length, 0);
  assert.equal(db.tables.item_assignments.length, 1);
});

test("ATTACK assign outside the org: an id from another org refuses the whole request, nothing is written or sent", async () => {
  const db = makeDb();
  const sent = [];
  const r = await assignMembers({ supabase: db, notify: async (n) => { sent.push(n); return null; } }, asAlice(), { assignees: [BOB, DAVE] });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /member of your workspace/);
  assert.equal(db.tables.item_assignments.length, 0);
  assert.equal(sent.length, 0);
});

test("ATTACK non-member write: a caller with no role in the workspace cannot assign; a viewer cannot assign", async () => {
  const db = makeDb();
  assert.equal((await assignMembers({ supabase: db }, asCarol(), { assignees: [BOB] })).status, 403);
  assert.equal((await assignMembers({ supabase: db }, ctxFor(DAVE, ORG_A, "none"), { assignees: [BOB] })).status, 403);
  assert.equal(db.tables.item_assignments.length, 0);
});

test("ATTACK cross-org read: org B sees none of org A's assignments, and only its own roster", async () => {
  const db = makeDb();
  await assignMembers({ supabase: db, notify: async () => null }, asAlice(), { assignees: [BOB] });
  const view = await listAssignments({ supabase: db }, asDave());
  assert.deepEqual(view.body.assignments, []);
  assert.deepEqual(view.body.members.map((m) => m.user_id), [DAVE]);
});

test("assigning someone already assigned reports it and does not duplicate or re-notify", async () => {
  const db = makeDb();
  const sent = [];
  const deps = { supabase: db, notify: async (n) => { sent.push(n); return null; } };
  await assignMembers(deps, asAlice(), { assignees: [BOB] });
  const again = await assignMembers(deps, asAlice(), { assignees: [BOB, ERIN] });
  assert.equal(again.status, 201);
  assert.deepEqual(again.body.already_assigned, [BOB]);
  assert.equal(again.body.assignments.length, 1);
  assert.equal(db.tables.item_assignments.length, 2);
  assert.deepEqual(sent.map((s) => s.userId), [BOB, ERIN]);
});

test("a failing notification never undoes the assignment and is reported", async () => {
  const db = makeDb();
  const r = await assignMembers({ supabase: db, notify: async () => "inbox write failed" }, asAlice(), { assignees: [BOB] });
  assert.equal(r.status, 201);
  assert.equal(r.body.notified, 0);
  assert.equal(r.body.notify_failed, 1);
  assert.equal(db.tables.item_assignments.length, 1);
});

test("invalid assign input writes nothing", async () => {
  const db = makeDb();
  assert.equal((await assignMembers({ supabase: db }, asAlice(), { assignees: [] })).status, 400);
  assert.equal((await assignMembers({ supabase: db }, asAlice(), { assignees: [BOB], dueOn: "soon" })).status, 400);
  assert.equal(db.tables.item_assignments.length, 0);
});

test("state toggle: the assignee, the assigner and an admin may; a bystander member may not; bad state is 400", async () => {
  const db = makeDb();
  await assignMembers({ supabase: db, notify: async () => null }, asBob(), { assignees: [ERIN] });
  const row = () => db.tables.item_assignments[0];

  assert.equal((await setAssignmentState({ supabase: db }, ctxFor(ERIN, ORG_A, "member"), { assignee: ERIN, state: "done" })).status, 200);
  assert.equal(row().state, "done");
  assert.equal((await setAssignmentState({ supabase: db }, asBob(), { assignee: ERIN, state: "open" })).status, 200, "the assigner reopens");
  assert.equal(row().state, "open");

  const bystander = ctxFor(u(15), ORG_A, "member");
  assert.equal((await setAssignmentState({ supabase: db }, bystander, { assignee: ERIN, state: "done" })).status, 403);
  assert.equal(row().state, "open");
  assert.equal((await setAssignmentState({ supabase: db }, asAlice(), { assignee: ERIN, state: "done" })).status, 200, "an admin may");
  assert.equal((await setAssignmentState({ supabase: db }, asAlice(), { assignee: ERIN, state: "finished" })).status, 400);
  assert.equal((await setAssignmentState({ supabase: db }, asAlice(), { assignee: "nope", state: "done" })).status, 400);
});

test("ATTACK cross-org state change and removal: org B cannot reach org A's assignment", async () => {
  const db = makeDb();
  await assignMembers({ supabase: db, notify: async () => null }, asAlice(), { assignees: [BOB] });
  const adminB = ctxFor(DAVE, ORG_B, "admin");
  assert.equal((await setAssignmentState({ supabase: db }, adminB, { assignee: BOB, state: "done" })).status, 404);
  assert.equal((await removeAssignment({ supabase: db }, adminB, { assignee: BOB })).status, 404);
  assert.equal(db.tables.item_assignments[0].state, "open");
  assert.equal(db.tables.item_assignments.length, 1);
});

test("remove: the assigner and the assignee may, a bystander may not; the list then drops it", async () => {
  const db = makeDb();
  await assignMembers({ supabase: db, notify: async () => null }, asBob(), { assignees: [ERIN, ALICE] });
  assert.equal((await removeAssignment({ supabase: db }, ctxFor(u(15), ORG_A, "member"), { assignee: ERIN })).status, 403);
  assert.equal(db.tables.item_assignments.length, 2);
  assert.equal((await removeAssignment({ supabase: db }, asBob(), { assignee: ERIN })).status, 200);
  assert.equal((await removeAssignment({ supabase: db }, asAlice(), { assignee: ALICE })).status, 200, "the assignee declines");
  assert.equal(db.tables.item_assignments.length, 0);
  assert.equal((await removeAssignment({ supabase: db }, asBob(), { assignee: ERIN })).status, 404);
});

test("the list carries names, the picker roster and per-row can_change", async () => {
  const db = makeDb();
  await assignMembers({ supabase: db, notify: async () => null }, asAlice(), { assignees: [BOB, ERIN], dueOn: "2026-11-01" });
  const view = await listAssignments({ supabase: db }, asBob());
  assert.equal(view.status, 200);
  assert.deepEqual(view.body.assignments.map((a) => [a.assignee_name, a.assigned_by_name, a.due_on, a.can_change]), [
    ["Bob Member", "Alice Admin", "2026-11-01", true],
    ["Erin Member", "Alice Admin", "2026-11-01", false],
  ]);
  assert.equal(view.body.members.length, 4, "the picker lists the org's members only");
  assert.deepEqual(view.body.viewer, { role: "member", can_write: true });
});
