// portfolio-core.test.mjs: proof of the portfolio object's rules (lane S8-D, 2026-10-07; migration 362).
// No database: the service runs against an in-memory Supabase-shaped fake that honours every filter the
// service passes, so a missing org filter shows up as a cross-org read or write. The ATTACKS (another
// org's id is a 404 and writes nothing; the add is the same record from any surface; an unheld item or a
// retired entity cannot be added) are the point; the DB-level RLS attacks live in migration 362's own
// self-check and are pinned by 362_portfolios.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMember,
  computeRollup,
  createPortfolio,
  deletePortfolio,
  getPortfolio,
  listMembers,
  listPortfolios,
  memberKindForEntityId,
  normalizePortfolioName,
  parseMemberInput,
  removeMember,
  renamePortfolio,
} from "./portfolio-core.mjs";

const ORG_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const ORG_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const USER_A = "11111111-0000-4000-8000-000000000001";
const USER_B = "22222222-0000-4000-8000-000000000002";
const ITEM_HELD = "c0000000-0000-4000-8000-000000000001";
const ITEM_HELD_2 = "c0000000-0000-4000-8000-000000000002";
const ITEM_UNVERIFIED = "c0000000-0000-4000-8000-000000000003";
const ITEM_ARCHIVED = "c0000000-0000-4000-8000-000000000004";
const CORRIDOR = "cl:corridor:f5bf8ebf91e1298c";
const JURIS = "cl:jurisdiction:0123456789abcdef";
const JURIS_OLD = "cl:jurisdiction:aaaaaaaaaaaaaaaa";
const RETIRED = "cl:organisation:bbbbbbbbbbbbbbbb";

/** An in-memory Supabase-shaped client: select/eq/ilike/in/order/limit/maybeSingle/single/insert/update/delete. */
function makeDb() {
  const tables = {
    portfolios: [],
    portfolio_members: [],
    intelligence_items: [
      { id: ITEM_HELD, provenance_status: "verified", is_archived: false },
      { id: ITEM_HELD_2, provenance_status: "verified", is_archived: false },
      { id: ITEM_UNVERIFIED, provenance_status: "quarantined", is_archived: false },
      { id: ITEM_ARCHIVED, provenance_status: "verified", is_archived: true },
    ],
    entities: [
      { entity_id: CORRIDOR, kind: "corridor", status: "active", merged_into: null },
      { entity_id: JURIS, kind: "jurisdiction", status: "active", merged_into: null },
      { entity_id: JURIS_OLD, kind: "jurisdiction", status: "merged", merged_into: JURIS },
      { entity_id: RETIRED, kind: "organisation", status: "retired", merged_into: null },
    ],
  };
  const writes = [];
  let seq = 0;

  const uniqueError = { code: "23505", message: 'duplicate key value violates unique constraint' };

  function insertRow(table, row) {
    if (table === "portfolios") {
      const key = row.name.toLowerCase().trim();
      if (tables.portfolios.some((p) => p.org_id === row.org_id && p.name.toLowerCase().trim() === key)) return { error: uniqueError };
    }
    if (table === "portfolio_members") {
      const dup = tables.portfolio_members.some(
        (m) => m.portfolio_id === row.portfolio_id && ((row.item_id && m.item_id === row.item_id) || (row.entity_id && m.entity_id === row.entity_id))
      );
      if (dup) return { error: uniqueError };
      // The composite FK: the (portfolio, org) pair must exist.
      if (!tables.portfolios.some((p) => p.id === row.portfolio_id && p.org_id === row.org_id)) {
        return { error: { code: "23503", message: "violates foreign key constraint" } };
      }
    }
    const stored = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, created_at: `2026-10-0${(seq % 9) + 1}T00:00:00Z`, added_at: `2026-10-0${(seq % 9) + 1}T00:00:00Z`, ...row };
    tables[table].push(stored);
    writes.push({ op: "insert", table, row: stored });
    return { data: stored };
  }

  function from(table) {
    const q = { op: "select", filters: [], payload: null, limit: null, wantRows: false };
    const matches = () =>
      tables[table].filter((r) =>
        q.filters.every((f) => {
          if (f.kind === "eq") return r[f.col] === f.val;
          if (f.kind === "ilike") return String(r[f.col]).toLowerCase() === String(f.val).toLowerCase();
          return f.vals.includes(r[f.col]);
        })
      );
    const run = () => {
      if (q.op === "insert") {
        const res = insertRow(table, q.payload);
        return res.error ? { data: null, error: res.error } : { data: [res.data], error: null };
      }
      if (q.op === "update") {
        const rows = matches();
        for (const r of rows) Object.assign(r, q.payload);
        if (rows.length) writes.push({ op: "update", table, count: rows.length });
        return { data: rows, error: null };
      }
      if (q.op === "delete") {
        const rows = matches();
        tables[table] = tables[table].filter((r) => !rows.includes(r));
        if (table === "portfolios") {
          for (const p of rows) tables.portfolio_members = tables.portfolio_members.filter((m) => m.portfolio_id !== p.id);
        }
        if (rows.length) writes.push({ op: "delete", table, count: rows.length });
        return { data: rows, error: null };
      }
      let rows = matches();
      if (q.limit != null) rows = rows.slice(0, q.limit);
      return { data: rows, error: null };
    };
    const api = {
      select() {
        return api;
      },
      insert(payload) {
        q.op = "insert";
        q.payload = payload;
        return api;
      },
      update(payload) {
        q.op = "update";
        q.payload = payload;
        return api;
      },
      delete() {
        q.op = "delete";
        return api;
      },
      eq(col, val) {
        q.filters.push({ kind: "eq", col, val });
        return api;
      },
      ilike(col, val) {
        q.filters.push({ kind: "ilike", col, val });
        return api;
      },
      in(col, vals) {
        q.filters.push({ kind: "in", col, vals });
        return api;
      },
      order() {
        return api;
      },
      limit(n) {
        q.limit = n;
        return api;
      },
      async maybeSingle() {
        const r = run();
        return { data: r.data?.[0] ?? null, error: r.error };
      },
      async single() {
        const r = run();
        return { data: r.data?.[0] ?? null, error: r.error };
      },
      then(resolve, reject) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return api;
  }
  return { from, tables, writes };
}

const mk = async (db, orgId, userId, name) => (await createPortfolio(db, { orgId, userId, name })).portfolio;

// ── input rules ──────────────────────────────────────────────────────────────────────────────────────

test("normalizePortfolioName trims, collapses whitespace, refuses blank and over-long", () => {
  assert.equal(normalizePortfolioName("  Q4   EU   lanes "), "Q4 EU lanes");
  assert.equal(normalizePortfolioName("   "), null);
  assert.equal(normalizePortfolioName(7), null);
  assert.equal(normalizePortfolioName("x".repeat(81)), null);
  assert.equal(normalizePortfolioName("x".repeat(80)), "x".repeat(80));
});

test("memberKindForEntityId: corridor, other entity, malformed", () => {
  assert.equal(memberKindForEntityId(CORRIDOR), "corridor");
  assert.equal(memberKindForEntityId(JURIS), "entity");
  assert.equal(memberKindForEntityId("corridor:abc"), null);
  assert.equal(memberKindForEntityId(""), null);
  assert.equal(memberKindForEntityId(null), null);
});

test("parseMemberInput takes exactly one of itemId (a uuid) or entityId", () => {
  assert.deepEqual(parseMemberInput({ itemId: ITEM_HELD.toUpperCase() }), { ok: true, member: { kind: "item", itemId: ITEM_HELD } });
  assert.deepEqual(parseMemberInput({ entityId: CORRIDOR }), { ok: true, member: { kind: "corridor", entityId: CORRIDOR } });
  assert.equal(parseMemberInput({}).ok, false);
  assert.equal(parseMemberInput({ itemId: ITEM_HELD, entityId: CORRIDOR }).ok, false);
  assert.equal(parseMemberInput({ itemId: "o3" }).ok, false, "a legacy id is resolved by the route first");
  assert.equal(parseMemberInput({ entityId: "not-an-entity" }).ok, false);
  assert.equal(parseMemberInput(null).ok, false);
});

// ── create / list / rename / delete ──────────────────────────────────────────────────────────────────

test("create, then a case-insensitive duplicate name returns the SAME record", async () => {
  const db = makeDb();
  const first = await createPortfolio(db, { orgId: ORG_A, userId: USER_A, name: "Asia lanes" });
  assert.equal(first.ok, true);
  assert.equal(first.existed, false);
  const again = await createPortfolio(db, { orgId: ORG_A, userId: USER_A, name: "  ASIA   lanes " });
  assert.equal(again.ok, true);
  assert.equal(again.existed, true);
  assert.equal(again.portfolio.id, first.portfolio.id);
  assert.equal(db.tables.portfolios.length, 1);
  assert.equal(db.tables.portfolios[0].created_by, USER_A);
  assert.equal(db.tables.portfolios[0].org_id, ORG_A);
});

test("create refuses a blank name with 400 and writes nothing", async () => {
  const db = makeDb();
  const res = await createPortfolio(db, { orgId: ORG_A, userId: USER_A, name: "   " });
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
  assert.equal(db.writes.length, 0);
});

test("the same name in two orgs is two portfolios; list shows only the caller's org, with member counts", async () => {
  const db = makeDb();
  const a = await mk(db, ORG_A, USER_A, "Shared name");
  const b = await mk(db, ORG_B, USER_B, "Shared name");
  assert.notEqual(a.id, b.id);
  await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: a.id, input: { itemId: ITEM_HELD } });
  const listA = await listPortfolios(db, ORG_A);
  assert.equal(listA.portfolios.length, 1);
  assert.equal(listA.portfolios[0].id, a.id);
  assert.equal(listA.portfolios[0].memberCount, 1);
  const listB = await listPortfolios(db, ORG_B);
  assert.deepEqual(listB.portfolios.map((p) => p.id), [b.id]);
  assert.equal(listB.portfolios[0].memberCount, 0);
});

test("rename and delete work inside the org; delete takes the members with it", async () => {
  const db = makeDb();
  const p = await mk(db, ORG_A, USER_A, "Old");
  await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: p.id, input: { itemId: ITEM_HELD } });
  const renamed = await renamePortfolio(db, { orgId: ORG_A, portfolioId: p.id, name: "New" });
  assert.equal(renamed.ok, true);
  assert.equal(db.tables.portfolios[0].name, "New");
  const del = await deletePortfolio(db, { orgId: ORG_A, portfolioId: p.id });
  assert.equal(del.ok, true);
  assert.equal(db.tables.portfolios.length, 0);
  assert.equal(db.tables.portfolio_members.length, 0);
});

// ── ATTACKS: another org's portfolio id ─────────────────────────────────────────────────────────────

test("ATTACK: org B cannot read, rename, delete, fill or empty org A's portfolio by id; nothing is written", async () => {
  const db = makeDb();
  const p = await mk(db, ORG_A, USER_A, "A only");
  await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: p.id, input: { itemId: ITEM_HELD } });
  const writesBefore = db.writes.length;

  assert.equal((await getPortfolio(db, ORG_B, p.id)).portfolio, null);
  const rename = await renamePortfolio(db, { orgId: ORG_B, portfolioId: p.id, name: "hijacked" });
  assert.equal(rename.ok, false);
  assert.equal(rename.status, 404);
  const del = await deletePortfolio(db, { orgId: ORG_B, portfolioId: p.id });
  assert.equal(del.ok, false);
  assert.equal(del.status, 404);
  const add = await addMember(db, { orgId: ORG_B, userId: USER_B, portfolioId: p.id, input: { itemId: ITEM_HELD_2 } });
  assert.equal(add.ok, false);
  assert.equal(add.status, 404);
  const rm = await removeMember(db, { orgId: ORG_B, portfolioId: p.id, input: { itemId: ITEM_HELD } });
  assert.equal(rm.ok, false);
  assert.equal(rm.status, 404);

  assert.equal(db.writes.length, writesBefore, "no write reached the database");
  assert.equal(db.tables.portfolios[0].name, "A only");
  assert.equal(db.tables.portfolio_members.length, 1);
});

test("ATTACK: listing members is filtered by org as well as by portfolio", async () => {
  const db = makeDb();
  const p = await mk(db, ORG_A, USER_A, "A only");
  await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: p.id, input: { itemId: ITEM_HELD } });
  const own = await listMembers(db, { orgId: ORG_A, portfolioId: p.id });
  assert.equal(own.members.length, 1);
  const foreign = await listMembers(db, { orgId: ORG_B, portfolioId: p.id });
  assert.equal(foreign.members.length, 0);
});

test("a malformed portfolio id is a clean not-found, not a database error", async () => {
  const db = makeDb();
  const res = await renamePortfolio(db, { orgId: ORG_A, portfolioId: "not-a-uuid", name: "x" });
  assert.equal(res.status, 404);
});

// ── adding members ──────────────────────────────────────────────────────────────────────────────────

test("ASSERTION 14: adding the same item from two surfaces is ONE record, the second answers existed", async () => {
  const db = makeDb();
  const p = await mk(db, ORG_A, USER_A, "P");
  const first = await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: p.id, input: { itemId: ITEM_HELD } });
  const second = await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: p.id, input: { itemId: ITEM_HELD } });
  assert.equal(first.ok && second.ok, true);
  assert.equal(first.existed, false);
  assert.equal(second.existed, true);
  assert.equal(first.member.id, second.member.id);
  assert.equal(db.tables.portfolio_members.length, 1);
  assert.equal(first.member.kind, "item");
  assert.equal(db.tables.portfolio_members[0].org_id, ORG_A);
  assert.equal(db.tables.portfolio_members[0].added_by, USER_A);
});

test("an item the platform does not hold (unverified, archived, unknown) cannot be added", async () => {
  const db = makeDb();
  const p = await mk(db, ORG_A, USER_A, "P");
  for (const id of [ITEM_UNVERIFIED, ITEM_ARCHIVED, "c0000000-0000-4000-8000-0000000000ff"]) {
    const res = await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: p.id, input: { itemId: id } });
    assert.equal(res.ok, false, id);
    assert.equal(res.status, 404);
  }
  assert.equal(db.tables.portfolio_members.length, 0);
});

test("corridors and entities: kind is set from the id, a merged entity resolves to its survivor, a retired one is refused", async () => {
  const db = makeDb();
  const p = await mk(db, ORG_A, USER_A, "P");
  const corridor = await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: p.id, input: { entityId: CORRIDOR } });
  assert.equal(corridor.member.kind, "corridor");
  const old = await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: p.id, input: { entityId: JURIS_OLD } });
  assert.equal(old.ok, true);
  assert.equal(old.member.entityId, JURIS, "the tombstone is followed to the survivor");
  assert.equal(old.member.kind, "entity");
  const again = await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: p.id, input: { entityId: JURIS } });
  assert.equal(again.existed, true, "adding the survivor directly is the same record");
  const retired = await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: p.id, input: { entityId: RETIRED } });
  assert.equal(retired.status, 409);
  const unknown = await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: p.id, input: { entityId: "cl:corridor:0000000000000000" } });
  assert.equal(unknown.status, 404);
  assert.equal(db.tables.portfolio_members.length, 2);
});

test("a bad member body is a 400 and writes nothing", async () => {
  const db = makeDb();
  const p = await mk(db, ORG_A, USER_A, "P");
  const before = db.writes.length;
  assert.equal((await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: p.id, input: {} })).status, 400);
  assert.equal(db.writes.length, before);
});

test("removeMember removes the one member and tolerates an absent one", async () => {
  const db = makeDb();
  const p = await mk(db, ORG_A, USER_A, "P");
  await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: p.id, input: { itemId: ITEM_HELD } });
  await addMember(db, { orgId: ORG_A, userId: USER_A, portfolioId: p.id, input: { entityId: CORRIDOR } });
  assert.equal((await removeMember(db, { orgId: ORG_A, portfolioId: p.id, input: { itemId: ITEM_HELD } })).ok, true);
  assert.deepEqual(db.tables.portfolio_members.map((m) => m.entity_id), [CORRIDOR]);
  assert.equal((await removeMember(db, { orgId: ORG_A, portfolioId: p.id, input: { itemId: ITEM_HELD } })).ok, true);
});

// ── roll-ups ────────────────────────────────────────────────────────────────────────────────────────

const member = (kind, id) => ({ kind, itemId: kind === "item" ? id : null, entityId: kind === "item" ? null : id });

test("roll-up: per-surface and per-priority counts, the held-over-total denominator and the unheld ids", () => {
  const members = [member("item", "i1"), member("item", "i2"), member("item", "i3"), member("item", "i4"), member("corridor", CORRIDOR), member("entity", JURIS)];
  const heldItems = [
    { id: "i1", surface: "regulations", priority: "CRITICAL", dueDays: 40, originClass: "official" },
    { id: "i2", surface: "regulations", priority: "HIGH", dueDays: 12, originClass: "verified" },
    { id: "i3", surface: "market", priority: null, dueDays: null, originClass: null },
  ];
  const r = computeRollup({ members, heldItems });
  assert.equal(r.total, 6);
  assert.deepEqual(r.items, { members: 4, held: 3, notHeld: ["i4"] });
  assert.deepEqual(r.entities, { corridors: 1, other: 1 });
  assert.deepEqual(r.bySurface, { regulations: 2, market: 1, research: 0, operations: 0 });
  assert.equal(r.byPriority.CRITICAL, 1);
  assert.equal(r.byPriority.HIGH, 1);
  assert.equal(r.byPriority.unscored, 1);
  assert.deepEqual(r.nextDue, { itemId: "i2", days: 12 });
});

test("roll-up: the weakest origin class wins, and an unclassified item is counted, never treated as strong", () => {
  const members = [member("item", "i1"), member("item", "i2"), member("item", "i3")];
  const strong = computeRollup({
    members: members.slice(0, 2),
    heldItems: [
      { id: "i1", surface: "regulations", priority: "LOW", dueDays: null, originClass: "official" },
      { id: "i2", surface: "market", priority: "LOW", dueDays: null, originClass: "modelled" },
    ],
  });
  assert.equal(strong.origin.weakest, "modelled");
  assert.deepEqual([strong.origin.classified, strong.origin.unclassified], [2, 0]);
  const mixed = computeRollup({
    members,
    heldItems: [
      { id: "i1", surface: "regulations", priority: "LOW", dueDays: null, originClass: "official" },
      { id: "i3", surface: "research", priority: "LOW", dueDays: null, originClass: null },
    ],
  });
  assert.equal(mixed.origin.weakest, "official", "only classified items label the class");
  assert.equal(mixed.origin.unclassified, 1, "the one with no class is named in the denominator");
});

test("roll-up of an empty portfolio is empty, with no invented class or date", () => {
  const r = computeRollup({ members: [], heldItems: [] });
  assert.equal(r.total, 0);
  assert.equal(r.nextDue, null);
  assert.equal(r.origin.weakest, null);
  assert.deepEqual(r.items, { members: 0, held: 0, notHeld: [] });
});
