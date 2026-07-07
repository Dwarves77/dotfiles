// Deterministic entity DETECT → RESOLVE → BUCKET (phase-intake-gate, no LLM). Promoted from the proven
// _wave-dedup3 matcher. Detection is WIDER than wiring (fails safe); "confident" is mechanical (the KIND +
// resolution count decide the bucket, never a runtime score). Topical words are structurally never detected,
// so they can never be wired (the "same batteries?" moat, enforced by construction). Pure + dep-injected
// (corpus passed in) — unit-tested in the depless discipline CI.
import { RE_REGNUM, RE_CELEX, RE_STD_SHAPED, NAMED_ENTITIES } from "./canonical-entities.mjs";

const uniqBy = (arr, key) => { const m = new Map(); for (const x of arr) if (!m.has(key(x))) m.set(key(x), x); return [...m.values()]; };
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

// DETECT every entity mention in text. Returns [{kind:'identifier'|'named'|'shaped', value, canonical}].
// identifier = reg#/CELEX (durable); named = a dictionary entity (wire-eligible); shaped = standard-CODE-shaped
// but NOT in the dictionary (NOTICED → surfaced, never wired — this is the wide net that makes fail-safe real).
export function detectMentions(text) {
  const s = String(text || "");
  const out = [];
  for (const m of s.match(RE_REGNUM) || []) out.push({ kind: "identifier", value: m, canonical: m });
  for (const m of s.match(RE_CELEX) || []) out.push({ kind: "identifier", value: m.replace(/^CELEX[:\s]*/i, ""), canonical: m.replace(/^CELEX[:\s]*/i, "") });
  for (const e of NAMED_ENTITIES) if (e.re.test(s)) out.push({ kind: "named", value: e.canonical, canonical: e.canonical });
  // shaped: standard-code-shaped tokens NOT already represented by a dictionary named-entity
  for (const raw of s.match(RE_STD_SHAPED) || []) {
    const val = raw.trim();
    const isNamed = NAMED_ENTITIES.some((e) => e.re.test(val));
    const isRegnum = (val.match(RE_REGNUM) || []).length > 0; // "Regulation (EU) 2023/1805" carries an identifier already
    if (!isNamed && !isRegnum) out.push({ kind: "shaped", value: val, canonical: val });
  }
  return uniqBy(out, (x) => `${x.kind}:${norm(x.canonical)}`);
}

// RESOLVE a mention to specific corpus items. corpus = [{id, title, instrument_identifier}]. excludeId = the
// mentioning item (never self-link). Identifier → items carrying that reg#/CELEX (instrument_identifier or in
// title). Named → items whose title matches the dictionary entity. Shaped → best-effort by value-in-title.
export function resolve(mention, corpus, excludeId = null) {
  const pool = (corpus || []).filter((c) => c.id !== excludeId);
  let ids = [];
  if (mention.kind === "identifier") {
    const v = norm(mention.value);
    ids = pool.filter((c) => norm(c.instrument_identifier) === v || norm(c.title).includes(v) || norm(c.instrument_identifier).includes(v)).map((c) => c.id);
  } else if (mention.kind === "named") {
    const e = NAMED_ENTITIES.find((x) => x.canonical === mention.canonical);
    if (e) ids = pool.filter((c) => e.re.test(String(c.title || "")) || e.re.test(String(c.instrument_identifier || ""))).map((c) => c.id);
  } else { // shaped — unknown standard; try literal title contains, usually empty → surface
    const v = norm(mention.value);
    ids = pool.filter((c) => norm(c.title).includes(v)).map((c) => c.id);
  }
  return { ids: [...new Set(ids)], count: new Set(ids).size };
}

// BUCKET (mechanical): identifier/named resolving to EXACTLY ONE item → WIRE. Everything else specific →
// SURFACE (ambiguous >1, unmatched named/identifier candidate, or unknown standard-shaped). Topical tokens
// never reach here (not detected). Never returns "wire" for a shaped/unknown mention.
export function classifyBucket(mention, resolvedCount) {
  const wireEligibleKind = mention.kind === "identifier" || mention.kind === "named";
  if (wireEligibleKind && resolvedCount === 1) return "wire";
  return "surface"; // ambiguous(>1) / unmatched(0) / shaped-unknown — Admin-research, never guessed
}

// One-shot for the linkStep: detect over content, resolve each vs corpus, split into edges-to-wire +
// candidates-to-surface. Never self-links; dedups edges by target.
export function planLinks(content, corpus, selfId) {
  const edges = [], surface = [];
  for (const m of detectMentions(content)) {
    const r = resolve(m, corpus, selfId);
    const bucket = classifyBucket(m, r.count);
    if (bucket === "wire") edges.push({ target_item_id: r.ids[0], via: m.canonical, kind: m.kind });
    else surface.push({ mention: m.canonical, kind: m.kind, resolvedCount: r.count });
  }
  return { edges: uniqBy(edges, (e) => e.target_item_id), surface };
}

// SUBJECT-EXISTENCE dedup (phase-intake-gate piece 2) at the mint chokepoint. HIGH-PRECISION only — a new
// item is a duplicate of an existing one iff they share a specific IDENTITY: same instrument_identifier, same
// normalized source_url, or the same EU reg-number in title/instrument. Title-similarity is NOT used here
// (it produces the false matches the whole exercise fights). Returns [{id, how}] — empty means mint.
const _normUrl = (u) => !u ? "" : String(u).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[#?].*$/, "").replace(/\/+$/, "");
export function matchExistingSubject(item, corpus) {
  const instr = norm(item.instrument_identifier);
  const url = _normUrl(item.source_url);
  const regs = new Set([...String(`${item.title || ""} ${item.instrument_identifier || ""}`).matchAll(RE_REGNUM)].map((m) => m[0]));
  const out = [];
  for (const c of corpus || []) {
    if (item.id && c.id === item.id) continue;
    if (instr && norm(c.instrument_identifier) === instr) { out.push({ id: c.id, how: "instrument_identifier" }); continue; }
    if (url && _normUrl(c.source_url) === url) { out.push({ id: c.id, how: "source_url" }); continue; }
    if (regs.size) { const cregs = new Set([...String(`${c.title || ""} ${c.instrument_identifier || ""}`).matchAll(RE_REGNUM)].map((m) => m[0])); if ([...regs].some((r) => cregs.has(r))) out.push({ id: c.id, how: "reg_number" }); }
  }
  return out;
}

// ── MOAT BOUNDARY (mechanical) ──
// The link step writes cross-reference EDGES + surface FLAGS, and NOTHING ELSE. Grounding citations
// (section_claim_provenance) stay reserved for the primary instrument — a news mention never becomes a
// grounded fact. assertMoatBoundary is a NEGATIVE self-test primitive: it THROWS on any write outside the
// allow-list, so the guard has a demonstrated failing mode (proven in the test), not just a passing assertion.
export const LINK_ALLOWED_TABLES = ["item_cross_references", "integrity_flags"];
export function assertMoatBoundary(writes) {
  const bad = (writes || []).filter((w) => !LINK_ALLOWED_TABLES.includes(w.table));
  if (bad.length) throw new Error(`moat boundary violated: linkStep may write ONLY ${LINK_ALLOWED_TABLES.join("/")}, got [${bad.map((w) => w.table).join(", ")}] — grounding citations stay reserved for the primary instrument`);
}

// PURE: turn a link plan into the exact DB write ops (no execution) so the moat boundary is checkable
// without a DB. Wire edges → item_cross_references (origin=entity_extraction); the surface set → ONE
// aggregated integrity_flags candidate row (never one-flag-per-mention spam; never silently dropped).
export function planLinkWrites(content, corpus, itemId) {
  const { edges, surface } = planLinks(content, corpus, itemId);
  const writes = edges.map((e) => ({
    table: "item_cross_references",
    row: { source_item_id: itemId, target_item_id: e.target_item_id, relationship: "related", origin: "entity_extraction" },
  }));
  if (surface.length) writes.push({
    table: "integrity_flags",
    row: {
      category: "data_quality", subject_type: "item", subject_ref: itemId,
      description: `Entity mentions needing review (ambiguous / unknown-standard): ${surface.map((s) => `${s.mention}(${s.resolvedCount})`).join(", ")}`.slice(0, 480),
      recommended_actions: surface.slice(0, 20).map((s) => ({ action: "review_entity_mention", rationale: `${s.kind}:${s.mention} resolved to ${s.resolvedCount} item(s)` })),
      status: "open", created_by: "intake-entity-link",
    },
  });
  assertMoatBoundary(writes); // belt-and-suspenders: the plan itself can never carry a forbidden write
  return writes;
}
