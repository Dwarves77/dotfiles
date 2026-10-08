// portfolio-core.mjs: the portfolio object's rules, in one plain-ESM module with no framework imports
// (lane S8-D, 2026-10-07; spec 00 section 5; migration 362). Everything here runs under `node --test`
// with a fake client, the same convention src/lib/entities/*.mjs and src/lib/corrections/*.mjs follow.
//
// WHAT A PORTFOLIO IS. A workspace-owned SELECTION of already-held things: intelligence items by id,
// corridors and other spine entities by entity id. It is lens state, like the watchlist and workspace tags
// (ADR-042 keeps those); the only typed text is its name, and no typed input produces a result (ADR-043).
// Adding the same thing from any surface is the same record (spec 00 section 8 assertion 14): the add is
// idempotent on (portfolio, member).
//
// WHAT THIS MODULE OWNS
//   1. input rules   : name normalisation, member parsing, member kind from an entity id.
//   2. the service   : list / create / rename / delete a portfolio and add / remove a member against a
//                      Supabase-shaped client passed in. EVERY statement is filtered by the caller's org,
//                      resolved on the server from org_memberships by the route, never taken from the client.
//                      A portfolio id from another org is indistinguishable from a missing one (not_found).
//   3. the roll-ups  : computeRollup(), computed at read time from held rows only. Nothing is stored.
//
// ROLL-UP RULES, each traced to the spec (they are the spec's aggregate rules, not new ones):
//   - Denominator beside every aggregate (spec 00 section 8 assertion 13): "held of total", with the
//     members that are not currently held named in `notHeld`, never silently dropped.
//   - Weakest origin class (spec 00 section 3.6, assertion 9): propagated with weakestOriginClass() from
//     src/lib/contracts/vocabularies.mjs, the one lattice; items carrying no class are counted as
//     `unclassified` and are NOT treated as strong.
//   - Counts per surface use the same surface the item's row links to (item-links.ts), so a portfolio
//     group and the list a reader lands on can never disagree.
//   - Band counts are by stored platform priority; the view maps a priority to a band with
//     bandFromPriority() (src/lib/urgency/bands.ts), the one place that does.

import { weakestOriginClass } from "../contracts/vocabularies.mjs";

export const PORTFOLIO_NAME_MAX = 80;
/** Mirrors the migration 362 caps (the database trigger is the authority; these keep reads bounded). */
export const PORTFOLIO_LIST_CAP = 100;
export const PORTFOLIO_MEMBER_CAP = 500;
/** Upper bound of member rows read when counting members for the index. PostgREST returns at most 1000 rows to
 *  a range-less read whatever .limit() asks for (F38), so the bound is stated at 1000 and, when it is hit, the
 *  index says its counts are a lower bound rather than showing a number that looks exact. */
export const INDEX_COUNT_READ_CAP = 1000;

export const MEMBER_KINDS = Object.freeze(["item", "corridor", "entity"]);
export const SURFACE_KEYS = Object.freeze(["regulations", "market", "research", "operations"]);
export const PRIORITY_KEYS = Object.freeze(["CRITICAL", "HIGH", "MODERATE", "LOW"]);

// ── Result shapes, declared once so TypeScript consumers get a discriminated union on `ok` (an object
// literal returned from plain JS widens `ok: false` to boolean, which would break narrowing). ───────────
/** @typedef {{ ok: false, status: number, error: string }} Failure */
/** @typedef {{ id: string, name: string, createdAt: string }} PortfolioRow */
/** @typedef {{ id: string, kind: string, itemId: string | null, entityId: string | null, addedAt: string }} MemberRow */
/** @typedef {{ id: string, member_kind: string, item_id: string | null, entity_id: string | null, added_at: string }} MemberDbRow */
/** @typedef {{ total: number, items: { members: number, held: number, notHeld: string[] },
 *   entities: { corridors: number, other: number },
 *   bySurface: { regulations: number, market: number, research: number, operations: number },
 *   otherSurface: number,
 *   byPriority: { CRITICAL: number, HIGH: number, MODERATE: number, LOW: number, unscored: number },
 *   nextDue: { itemId: string, days: number } | null,
 *   origin: { weakest: string | null, classified: number, unclassified: number } }} Rollup */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// cl:<kind>:<id>, the shape src/lib/entities/entity-id-shape.mjs mints (kind letters, then a non-empty tail).
const ENTITY_ID_RE = /^cl:([a-z]+):(.+)$/;
const MAX_ENTITY_ID_LEN = 200;
const MAX_MERGE_HOPS = 5;

// ── 1. input rules ───────────────────────────────────────────────────────────────────────────────────

/** Trim and collapse whitespace; null when empty or over the limit (the route answers 400 without a trip). */
export function normalizePortfolioName(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0 || trimmed.length > PORTFOLIO_NAME_MAX) return null;
  return trimmed;
}

/** 'corridor' for cl:corridor:*, 'entity' for any other well-formed entity id, null when malformed. */
export function memberKindForEntityId(entityId) {
  if (typeof entityId !== "string" || entityId.length > MAX_ENTITY_ID_LEN) return null;
  const m = ENTITY_ID_RE.exec(entityId);
  if (!m) return null;
  return m[1] === "corridor" ? "corridor" : "entity";
}

/**
 * One member from a request body: exactly one of `itemId` (a uuid; the route resolves a legacy id first)
 * or `entityId`. Returns { ok, member } or { ok:false, error }.
 */
export function parseMemberInput(body) {
  const b = body && typeof body === "object" ? body : {};
  const hasItem = typeof b.itemId === "string" && b.itemId.length > 0;
  const hasEntity = typeof b.entityId === "string" && b.entityId.length > 0;
  if (hasItem === hasEntity) return { ok: false, error: "Send exactly one of itemId or entityId." };
  if (hasItem) {
    if (!UUID_RE.test(b.itemId)) return { ok: false, error: "itemId must be an item id." };
    return { ok: true, member: { kind: "item", itemId: b.itemId.toLowerCase() } };
  }
  const kind = memberKindForEntityId(b.entityId);
  if (!kind) return { ok: false, error: "entityId must look like cl:<kind>:<id>." };
  return { ok: true, member: { kind, entityId: b.entityId } };
}

function memberFilterColumns(member) {
  return member.kind === "item" ? { item_id: member.itemId } : { entity_id: member.entityId };
}

// ── 2. the service (every statement filtered by the caller's org) ─────────────────────────────────────

/** @returns {Failure} */
const notFound = (what) => ({ ok: false, status: 404, error: `${what} not found in your workspace` });
/** @returns {Failure} */
const fail = (status, error) => ({ ok: false, status, error });
const isUnique = (err) => err && (err.code === "23505" || /duplicate key/i.test(err.message ?? ""));
const isCap = (err) => err && /portfolio_(member_)?cap_reached/.test(err.message ?? "");
/** @returns {Failure} */
const dbFail = (err) => fail(500, err?.message ?? "Database error");

/** The portfolios of one workspace, newest first, each with its member count (from a bounded read). */
/**
 * @returns {Promise<Failure | { ok: true, countsTruncated: boolean, portfolios: Array<PortfolioRow & { memberCount: number }> }>}
 */
export async function listPortfolios(sb, orgId) {
  const { data: rows, error } = await sb
    .from("portfolios")
    .select("id, name, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(PORTFOLIO_LIST_CAP);
  if (error) return dbFail(error);
  const { data: memberRows, error: memErr } = await sb
    .from("portfolio_members")
    .select("portfolio_id, member_kind")
    .eq("org_id", orgId)
    .limit(INDEX_COUNT_READ_CAP);
  if (memErr) return dbFail(memErr);
  const counts = new Map();
  for (const m of memberRows ?? []) counts.set(m.portfolio_id, (counts.get(m.portfolio_id) ?? 0) + 1);
  return {
    ok: true,
    countsTruncated: (memberRows ?? []).length >= INDEX_COUNT_READ_CAP,
    portfolios: (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      memberCount: counts.get(r.id) ?? 0,
    })),
  };
}

/** One portfolio row, or null when it is not in this org (another org's id looks exactly like a missing one). */
/**
 * @returns {Promise<Failure | { ok: true, portfolio: PortfolioRow | null }>}
 */
export async function getPortfolio(sb, orgId, portfolioId) {
  if (typeof portfolioId !== "string" || !UUID_RE.test(portfolioId)) return { ok: true, portfolio: null };
  const { data, error } = await sb
    .from("portfolios")
    .select("id, name, created_at")
    .eq("id", portfolioId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) return dbFail(error);
  return {
    ok: true,
    portfolio: data ? { id: data.id, name: data.name, createdAt: data.created_at } : null,
  };
}

/** Create; a case-insensitive duplicate name returns the EXISTING portfolio (`existed: true`), not an error. */
/**
 * @returns {Promise<Failure | { ok: true, existed: boolean, portfolio: PortfolioRow }>}
 */
export async function createPortfolio(sb, { orgId, userId, name }) {
  const clean = normalizePortfolioName(name);
  if (!clean) return fail(400, `name is required (1-${PORTFOLIO_NAME_MAX} characters)`);
  const { data, error } = await sb
    .from("portfolios")
    .insert({ org_id: orgId, name: clean, created_by: userId })
    .select("id, name, created_at")
    .single();
  if (error) {
    if (isUnique(error)) {
      const { data: existing, error: exErr } = await sb
        .from("portfolios")
        .select("id, name, created_at")
        .eq("org_id", orgId)
        .ilike("name", clean)
        .maybeSingle();
      if (exErr || !existing) return dbFail(error);
      return { ok: true, existed: true, portfolio: { id: existing.id, name: existing.name, createdAt: existing.created_at } };
    }
    if (isCap(error)) return fail(409, "A workspace holds at most 100 portfolios.");
    return dbFail(error);
  }
  return { ok: true, existed: false, portfolio: { id: data.id, name: data.name, createdAt: data.created_at } };
}

/**
 * @returns {Promise<Failure | { ok: true, portfolio: PortfolioRow }>}
 */
export async function renamePortfolio(sb, { orgId, portfolioId, name }) {
  const clean = normalizePortfolioName(name);
  if (!clean) return fail(400, `name is required (1-${PORTFOLIO_NAME_MAX} characters)`);
  const found = await getPortfolio(sb, orgId, portfolioId);
  if (!found.ok) return found;
  if (!found.portfolio) return notFound("Portfolio");
  const { error } = await sb.from("portfolios").update({ name: clean }).eq("id", portfolioId).eq("org_id", orgId);
  if (error) {
    if (isUnique(error)) return fail(409, "Another portfolio in your workspace already has that name.");
    return dbFail(error);
  }
  return { ok: true, portfolio: { ...found.portfolio, name: clean } };
}

/**
 * @returns {Promise<Failure | { ok: true }>}
 */
export async function deletePortfolio(sb, { orgId, portfolioId }) {
  const found = await getPortfolio(sb, orgId, portfolioId);
  if (!found.ok) return found;
  if (!found.portfolio) return notFound("Portfolio");
  // Members go with it (ON DELETE CASCADE on the composite FK).
  const { error } = await sb.from("portfolios").delete().eq("id", portfolioId).eq("org_id", orgId);
  if (error) return dbFail(error);
  return { ok: true };
}

/** The members of one portfolio (bounded). */
/**
 * @returns {Promise<Failure | { ok: true, members: MemberDbRow[] }>}
 */
export async function listMembers(sb, { orgId, portfolioId }) {
  const { data, error } = await sb
    .from("portfolio_members")
    .select("id, member_kind, item_id, entity_id, added_at")
    .eq("portfolio_id", portfolioId)
    .eq("org_id", orgId)
    .order("added_at", { ascending: true })
    .limit(PORTFOLIO_MEMBER_CAP);
  if (error) return dbFail(error);
  return { ok: true, members: data ?? [] };
}

/** Resolve an entity for adding: follow a merge tombstone to the survivor (301, never 404), refuse a retired one. */
async function resolveEntityForAdd(sb, entityId) {
  let id = entityId;
  for (let hop = 0; hop <= MAX_MERGE_HOPS; hop++) {
    const { data, error } = await sb
      .from("entities")
      .select("entity_id, kind, status, merged_into")
      .eq("entity_id", id)
      .maybeSingle();
    if (error) return dbFail(error);
    if (!data) return notFound("Entity");
    if (data.status === "merged" && data.merged_into) {
      id = data.merged_into;
      continue;
    }
    if (data.status === "retired") return fail(409, "That entity is retired and cannot be added.");
    return { ok: true, entityId: data.entity_id };
  }
  return fail(409, "That entity's merge chain is too long to follow.");
}

/**
 * Add one HELD item or entity to a portfolio. Held means: the item exists, is verified and is not archived
 * (the customer read gate, CLAUDE.md standing rule 1 / migration 148), or the entity exists and is active.
 * Idempotent: adding what is already a member returns that member with `existed: true`.
 */
/**
 * @returns {Promise<Failure | { ok: true, existed: boolean, member: MemberRow }>}
 */
export async function addMember(sb, { orgId, userId, portfolioId, input }) {
  const parsed = parseMemberInput(input);
  if (!parsed.ok) return fail(400, parsed.error);
  const found = await getPortfolio(sb, orgId, portfolioId);
  if (!found.ok) return found;
  if (!found.portfolio) return notFound("Portfolio");

  let member = parsed.member;
  if (member.kind === "item") {
    const { data, error } = await sb
      .from("intelligence_items")
      .select("id")
      .eq("id", member.itemId)
      .eq("provenance_status", "verified")
      .eq("is_archived", false)
      .maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail(404, "That item is not held by the platform, so it cannot be added.");
  } else {
    const resolved = await resolveEntityForAdd(sb, member.entityId);
    if (!resolved.ok) return resolved;
    member = { kind: memberKindForEntityId(resolved.entityId), entityId: resolved.entityId };
  }

  const existing = await findMember(sb, orgId, portfolioId, member);
  if (!existing.ok) return existing;
  if (existing.row) return { ok: true, existed: true, member: shapeMember(existing.row) };

  const { data, error } = await sb
    .from("portfolio_members")
    .insert({
      portfolio_id: portfolioId,
      org_id: orgId,
      member_kind: member.kind,
      added_by: userId,
      ...memberFilterColumns(member),
    })
    .select("id, member_kind, item_id, entity_id, added_at")
    .single();
  if (error) {
    if (isUnique(error)) {
      // Two adds raced: the other one won, which is the same record.
      const again = await findMember(sb, orgId, portfolioId, member);
      if (again.ok && again.row) return { ok: true, existed: true, member: shapeMember(again.row) };
    }
    if (isCap(error)) return fail(409, `A portfolio holds at most ${PORTFOLIO_MEMBER_CAP} members.`);
    return dbFail(error);
  }
  return { ok: true, existed: false, member: shapeMember(data) };
}

async function findMember(sb, orgId, portfolioId, member) {
  const col = member.kind === "item" ? "item_id" : "entity_id";
  const val = member.kind === "item" ? member.itemId : member.entityId;
  const { data, error } = await sb
    .from("portfolio_members")
    .select("id, member_kind, item_id, entity_id, added_at")
    .eq("portfolio_id", portfolioId)
    .eq("org_id", orgId)
    .eq(col, val)
    .maybeSingle();
  if (error) return dbFail(error);
  return { ok: true, row: data ?? null };
}

function shapeMember(row) {
  return {
    id: row.id,
    kind: row.member_kind,
    itemId: row.item_id ?? null,
    entityId: row.entity_id ?? null,
    addedAt: row.added_at,
  };
}

/** Remove one member (by item or entity id) from a portfolio of this org. Removing what is absent is not an error. */
/**
 * @returns {Promise<Failure | { ok: true }>}
 */
export async function removeMember(sb, { orgId, portfolioId, input }) {
  const parsed = parseMemberInput(input);
  if (!parsed.ok) return fail(400, parsed.error);
  const found = await getPortfolio(sb, orgId, portfolioId);
  if (!found.ok) return found;
  if (!found.portfolio) return notFound("Portfolio");
  const col = parsed.member.kind === "item" ? "item_id" : "entity_id";
  const val = parsed.member.kind === "item" ? parsed.member.itemId : parsed.member.entityId;
  const { error } = await sb
    .from("portfolio_members")
    .delete()
    .eq("portfolio_id", portfolioId)
    .eq("org_id", orgId)
    .eq(col, val);
  if (error) return dbFail(error);
  return { ok: true };
}

// ── 3. roll-ups, computed at read time from held data only ───────────────────────────────────────────

/**
 * @param {object} args
 * @param {Array<{kind:string,itemId:string|null,entityId:string|null}>} args.members  every member of the portfolio
 * @param {Array<{id:string,surface:string,priority:string|null,dueDays:number|null,originClass:string|null}>} args.heldItems
 *        the member items that are currently held (verified, not archived), already classified to a surface
 * @returns {Rollup} the roll-up. Every aggregate carries its denominator.
 */
export function computeRollup({ members, heldItems }) {
  const itemMembers = members.filter((m) => m.kind === "item");
  const corridors = members.filter((m) => m.kind === "corridor").length;
  const otherEntities = members.filter((m) => m.kind === "entity").length;

  const heldIds = new Set(heldItems.map((h) => h.id));
  const notHeld = itemMembers.filter((m) => !heldIds.has(m.itemId)).map((m) => m.itemId);

  const bySurface = Object.fromEntries(SURFACE_KEYS.map((k) => [k, 0]));
  let otherSurface = 0;
  const byPriority = { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0, unscored: 0 };
  let nextDue = null;
  const classes = [];
  for (const h of heldItems) {
    if (h.surface in bySurface) bySurface[h.surface] += 1;
    else otherSurface += 1;
    if (h.priority && h.priority in byPriority) byPriority[h.priority] += 1;
    else byPriority.unscored += 1;
    if (typeof h.dueDays === "number" && h.dueDays >= 0 && (nextDue === null || h.dueDays < nextDue.days)) {
      nextDue = { itemId: h.id, days: h.dueDays };
    }
    if (h.originClass) classes.push(h.originClass);
  }

  return {
    total: members.length,
    items: { members: itemMembers.length, held: heldItems.length, notHeld },
    entities: { corridors, other: otherEntities },
    bySurface,
    otherSurface,
    byPriority,
    nextDue,
    origin: {
      weakest: weakestOriginClass(classes),
      classified: classes.length,
      unclassified: heldItems.length - classes.length,
    },
  };
}
