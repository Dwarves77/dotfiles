// Deterministic entity DETECT → RESOLVE → BUCKET (phase-intake-gate, no LLM). Promoted from the proven
// _wave-dedup3 matcher. Detection is WIDER than wiring (fails safe); "confident" is mechanical (the KIND +
// resolution count decide the bucket, never a runtime score). Topical words are structurally never detected,
// so they can never be wired (the "same batteries?" moat, enforced by construction). Pure + dep-injected
// (corpus passed in) — unit-tested in the depless discipline CI.
import { RE_REGNUM, RE_CELEX, RE_STD_SHAPED, NAMED_ENTITIES } from "./canonical-entities.mjs";
// One-url-canonicalizer doctrine (F18): URL identity for dedup routes through the SINGLE sanctioned
// canonicalizer (../sources/url-canonicalize.ts) — no bespoke normalizer lives here.
import { canonicalizeUrl } from "../sources/url-canonicalize.ts";

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

// LINEAGE TYPING (WO-28 phase 1, ADR-021): classify a WIRE-ELIGIBLE mention as a typed lineage
// relationship by the phrase shape EU legislative titles/content use around it, or 'related' (today's
// unchanged default) when no pattern matches. Pure, deterministic. NEVER widens wiring — this only
// changes what relationship an ALREADY-wired edge carries (classifyBucket decided wiring; this decides
// typing); an untyped mention keeps exactly today's behavior ('related', no basis).
//
// Direction is always child (the mentioning/citing item) → parent (the resolved mention target), which is
// already how planLinkWrites emits edges (source=itemId, target=resolved) — typing rides that direction,
// it does not change it.
//
// `derogates_under` is NOT a legal CHECK value yet (item_cross_references_relationship_check, migration
// 004, allows exactly {related, supersedes, implements, conflicts, amends, depends_on} — verified live
// 2026-08-29; the CHECK widening rides the WO-12/19 DDL window). Derogation-shaped mentions therefore
// still emit 'depends_on' so the write stays CHECK-legal today, but the precise verb ("derogates under
// <mention>") is preserved in the edge's own `basis` entry rather than lost — the UI's basisSummary reads
// it verbatim (connection-view-model.mjs), so nothing about WHY the edge exists is silently flattened.
const RE_IMPLEMENTS = /\b(implementing|application of)\b/i;
const RE_SELF_IMPLEMENTING_TITLE = /^\s*commission implementing\b/i;
const RE_AMENDS = /\bamending\b/i;
const RE_SUPPLEMENTS_DELEGATED = /\b(supplementing|delegated)\b/i;
const RE_AUTHORISES = /\bauthoris/i; // authoris(ing/ed/ation) — EN/GB spelling, EUR-Lex convention
const RE_IN_ACCORDANCE = /\bin accordance with\b/i;
const LINEAGE_WINDOW = 200; // chars each side of the mention — "near the mention", not whole-document lore

// content may hold several distinct parent mentions (an act can implement one instrument and reference
// another in passing); windowing around THIS mention's literal occurrence keeps typing mention-specific
// instead of letting one pattern anywhere in the content leak onto every wired edge. Falls back to the
// whole content when the canonical text isn't found verbatim (e.g. a dictionary canonical differs from
// the matched alias) — degrades to the pre-windowing behavior, never throws.
function windowAroundMention(content, mentionCanonical) {
  const text = String(content || "");
  const needle = String(mentionCanonical || "");
  if (!needle) return text;
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return text;
  return text.slice(Math.max(0, idx - LINEAGE_WINDOW), Math.min(text.length, idx + needle.length + LINEAGE_WINDOW));
}

/**
 * @param {string} content the citing item's text (full_brief + grounding pool, as planLinkWrites receives it)
 * @param {string} mentionCanonical the resolved mention's canonical text (the parent instrument's identifier/name)
 * @param {string} [selfTitle] the citing (child) item's own title — fallback signal when the content near
 *   the mention doesn't carry the phrase itself (e.g. "Commission Implementing Regulation ..." titles that
 *   describe themselves rather than repeating "implementing" beside the parent's number in the body)
 * @returns {{relationship: string, basis: Array<{signal:string, detail:string, weight:number}>|null}}
 */
export function classifyRelationship(content, mentionCanonical, selfTitle) {
  const near = windowAroundMention(content, mentionCanonical);
  const title = String(selfTitle || "");
  // derogation shape checked first (most specific — needs BOTH signals present) so a generic "amending" or
  // "delegated" elsewhere in the window can't shadow it.
  if (RE_AUTHORISES.test(near) && RE_IN_ACCORDANCE.test(near)) {
    return { relationship: "depends_on", basis: [{ signal: "lineage", detail: `derogates under ${mentionCanonical}`, weight: 0 }] };
  }
  if (RE_AMENDS.test(near)) {
    return { relationship: "amends", basis: [{ signal: "lineage", detail: `amends ${mentionCanonical}`, weight: 0 }] };
  }
  if (RE_SUPPLEMENTS_DELEGATED.test(near)) {
    return { relationship: "depends_on", basis: [{ signal: "lineage", detail: `supplements ${mentionCanonical}`, weight: 0 }] };
  }
  if (RE_IMPLEMENTS.test(near) || RE_SELF_IMPLEMENTING_TITLE.test(title)) {
    return { relationship: "implements", basis: [{ signal: "lineage", detail: `implements ${mentionCanonical}`, weight: 0 }] };
  }
  return { relationship: "related", basis: null };
}

// One-shot for the linkStep: detect over content, resolve each vs corpus, split into edges-to-wire +
// candidates-to-surface. Never self-links; dedups edges by target. Wire edges carry a typed `relationship`
// (classifyRelationship, identifier mentions only — WO-28) + `basis` when a lineage pattern matched, else
// today's unchanged 'related'/no-basis. `lineageGaps`: identifier mentions that resolve to ZERO items but
// ARE lineage-pattern-shaped (implements/amends/supplements/derogation) — these still land in `surface`
// too (unchanged posture), but are additionally distinguished here because they are a specific, actionable
// discovery target (an enabling/parent act absent from the corpus), not generic ambiguity.
export function planLinks(content, corpus, selfId) {
  const selfRow = (corpus || []).find((c) => c.id === selfId);
  const selfTitle = selfRow ? selfRow.title : "";
  // The item's OWN instrument number almost always appears in its own content/title right beside the
  // lineage phrase that names its PARENT ("Commission Implementing Regulation (EU) 2026/394 ... for the
  // application of Regulation (EU) 2023/1805") — close enough to fall inside the same LINEAGE_WINDOW as
  // the real parent mention. Without this exclusion the self-number, unresolved (it is deliberately
  // excluded from the resolve() pool, never a link target), would ALSO get swept into lineageGaps as a
  // false "missing parent" naming itself. resolve()'s excludeId already keeps the self out of WIRE edges;
  // this keeps it out of the gap feed the same way.
  const selfOwnId = selfRow ? norm(selfRow.instrument_identifier) : "";
  const edges = [], surface = [], lineageGaps = [];
  for (const m of detectMentions(content)) {
    const r = resolve(m, corpus, selfId);
    const bucket = classifyBucket(m, r.count);
    if (bucket === "wire") {
      let relationship = "related", basis = null;
      if (m.kind === "identifier") {
        const typed = classifyRelationship(content, m.canonical, selfTitle);
        relationship = typed.relationship;
        basis = typed.basis;
      }
      edges.push({ target_item_id: r.ids[0], via: m.canonical, kind: m.kind, relationship, basis });
    } else {
      surface.push({ mention: m.canonical, kind: m.kind, resolvedCount: r.count });
      const isSelf = m.kind === "identifier" && selfOwnId && norm(m.canonical) === selfOwnId;
      if (m.kind === "identifier" && r.count === 0 && !isSelf) {
        const typed = classifyRelationship(content, m.canonical, selfTitle);
        if (typed.relationship !== "related") lineageGaps.push({ mention: m.canonical, relationship: typed.relationship });
      }
    }
  }
  return { edges: uniqBy(edges, (e) => e.target_item_id), surface, lineageGaps: uniqBy(lineageGaps, (g) => g.mention) };
}

// SUBJECT-EXISTENCE dedup (phase-intake-gate piece 2) at the mint chokepoint. HIGH-PRECISION only — a new
// item is a duplicate of an existing one iff they share a specific IDENTITY: same instrument_identifier, same
// CANONICAL source_url, or the same EU reg-number in title/instrument. Title-similarity is NOT used here
// (it produces the false matches the whole exercise fights). Returns [{id, how}] — empty means mint.
//
// URL identity routes through the ONE sanctioned canonicalizer (canonicalizeUrl) — NO bespoke _normUrl
// (one-url-canonicalizer doctrine, F18). canonicalizeUrl folds the noise variants (scheme-CASE / www /
// default-port / trailing-slash / query-ORDER / fragment) but PRESERVES query CONTENT, because for API-style
// legal hosts the query IS the instrument identity (eur-lex …?uri=CELEX:32020R1056 vs …?uri=CELEX:52023PC0445
// are DIFFERENT regulations). The prior ad-hoc _normUrl stripped the WHOLE query ([#?].*$), collapsing every
// eur-lex …/legal-content/EN/TXT?uri=… URL to one key → false-dedup of distinct EUR-Lex regs against the first
// corpus item of that path (D1, surfaced by the Unit-0c intake dry-proof 2026-07-12). canonicalizeUrl is also
// STRICTER than _normUrl on two axes the old normalizer folded — http vs https (the scheme is KEPT; only its
// case is normalized) and path CASE (preserved) — which REMOVES false positives without adding false negatives
// of substance: instrument_identifier + reg_number remain the PRIMARY identity signals; this URL matcher only
// supplements them.
/**
 * The instrument's OWN reg-numbers — identity, never references (operator ruling 2026-07-30).
 *
 * DEFECT THIS CLOSES: the previous form scraped RE_REGNUM out of `title + instrument_identifier`, so an
 * implementing/delegated/amending act — whose title ALWAYS names its parent ("…for the application of
 * Regulation (EU) 2023/1805…") — carried the PARENT's number as its own identity and deduped against it.
 * Found live: Implementing Reg (EU) 2026/394 collapsed into the FuelEU 2023/1805 item; Del. Reg 2024/3214
 * into EU MRV 2015/757; Impl. Reg 2025/35 into HDV CO2 2019/1242. Whole classes of EU intake were blocked,
 * and the match asserted "this IS that instrument" when it is not.
 *
 * FIX BY RESTRICTION, not heuristic: when the item carries an explicit instrument_identifier, identity is
 * derived from THAT ALONE (with CELEX normalised to its slash form so 32024R3214 still matches 2024/3214).
 * Free-text reg-numbers are REFERENCES — they describe a relation (amends / implements / applies), never
 * identity. Title scraping survives ONLY as the fallback for items carrying no identifier at all.
 *
 * NOTE (product capability): those references are valuable RELATIONSHIP data — implementing-act →
 * parent-act linkage. Capturing them as edges is built (WO-28 phase 1, ADR-021) — see classifyRelationship
 * below and its use in planLinks/planLinkWrites; this function's job stays making sure they are never
 * mistaken for identity.
 */
function ownRegNums(o) {
  const id = String(o?.instrument_identifier || "").trim();
  if (id) {
    const out = new Set([...id.matchAll(RE_REGNUM)].map((m) => m[0]));
    for (const m of id.matchAll(RE_CELEX)) {
      const t = m[0].replace(/^CELEX[:\s]*/i, "");
      const yr = t.slice(1, 5);
      const num = t.slice(6).replace(/^0+/, "");
      if (yr && num) out.add(`${yr}/${num}`);
    }
    return out;
  }
  return new Set([...String(o?.title || "").matchAll(RE_REGNUM)].map((m) => m[0]));
}

export function matchExistingSubject(item, corpus) {
  const instr = norm(item.instrument_identifier);
  const url = item.source_url ? canonicalizeUrl(String(item.source_url)) : "";
  const regs = ownRegNums(item);
  const out = [];
  for (const c of corpus || []) {
    if (item.id && c.id === item.id) continue;
    if (instr && norm(c.instrument_identifier) === instr) { out.push({ id: c.id, how: "instrument_identifier" }); continue; }
    if (url && c.source_url && canonicalizeUrl(String(c.source_url)) === url) { out.push({ id: c.id, how: "source_url" }); continue; }
    if (regs.size) { const cregs = ownRegNums(c); if ([...regs].some((r) => cregs.has(r))) out.push({ id: c.id, how: "reg_number" }); }
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
// without a DB. Wire edges → item_cross_references (origin=entity_extraction, relationship TYPED per
// classifyRelationship — WO-28); the surface set → ONE aggregated integrity_flags candidate row (never
// one-flag-per-mention spam; never silently dropped); lineageGaps → ONE further aggregated integrity_flags
// row in its own dedup namespace (lineage-gap:absent-parent — link-items.ts's executor dedups it the same
// one-open-flag-per-item way it already dedups the entity-link flag), naming the missing parent
// instrument(s) as an L2 discovery target.
export function planLinkWrites(content, corpus, itemId) {
  const { edges, surface, lineageGaps } = planLinks(content, corpus, itemId);
  const writes = edges.map((e) => ({
    table: "item_cross_references",
    row: {
      source_item_id: itemId, target_item_id: e.target_item_id,
      relationship: e.relationship, origin: "entity_extraction",
      ...(e.basis ? { basis: e.basis } : {}),
    },
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
  if (lineageGaps.length) writes.push({
    table: "integrity_flags",
    row: {
      category: "coverage_gap", subject_type: "item", subject_ref: itemId,
      description: `Enabling/parent instrument(s) named but absent from the corpus: ${lineageGaps.map((g) => `${g.mention} (${g.relationship})`).join(", ")}`.slice(0, 480),
      recommended_actions: lineageGaps.slice(0, 20).map((g) => ({ action: "acquire_parent_instrument", rationale: `item ${g.relationship} ${g.mention}, which does not resolve to any item in the corpus` })),
      status: "open", created_by: "lineage-gap:absent-parent",
    },
  });
  assertMoatBoundary(writes); // belt-and-suspenders: the plan itself can never carry a forbidden write
  return writes;
}
