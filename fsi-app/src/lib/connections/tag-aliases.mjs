import { FIELD_CAPS, TOPIC_TAG_VALUES, COMPLIANCE_OBJECT_VALUES, SCENARIO_TAG_VALUES } from "./derive-tags.mjs";

const TOPIC_TAG_SET = new Set(TOPIC_TAG_VALUES);
const COMPLIANCE_OBJECT_SET = new Set(COMPLIANCE_OBJECT_VALUES);
const SCENARIO_TAG_SET = new Set(SCENARIO_TAG_VALUES);

/**
 * ALIAS_MAP — the ONLY place a legal-text synonym is associated with an EXISTING tag. Same shape
 * convention as derive-tags.mjs's KEYWORD_MAP (one entry per tag, a `keywords` list of literal,
 * case-insensitive phrases), kept in its own table rather than appended to KEYWORD_MAP because that
 * file is out of this lane's write set.
 */
export const ALIAS_MAP = [
  // operational_scenario_tags:EUDR-due-diligence already covers "EUDR"/"deforestation-free"/
  // "deforestation regulation" (KEYWORD_MAP). "deforestation and forest degradation" is Regulation
  // (EU) 2023/1115's own recital phrase — confirmed present, verbatim, in the EU EUDR annex fixture
  // (population-33749140151 item 15c9dd13, "...export from the Union of certain commodities and
  // products associated with deforestation and forest degradation...").
  { field: "operational_scenario_tags", tag: "EUDR-due-diligence", keywords: ["deforestation and forest degradation"] },

  // operational_scenario_tags:truck-CO2-standard already covers "heavy-duty CO2 standard"/"truck CO2
  // standard"/"HDV CO2 standard" (KEYWORD_MAP) — none of which is how the actual EU regulation names
  // itself. "CO2 emission performance standards for new heavy-duty vehicles" is Regulation (EU)
  // 2019/1242's own title, confirmed present (both with and without the subscript-artifact space
  // "CO 2" that captured EUR-Lex/OJ text carries) in the CO2-standard fixture (item 234d3ba8).
  { field: "operational_scenario_tags", tag: "truck-CO2-standard", keywords: [
    "CO2 emission performance standards for new heavy-duty vehicles",
    "CO 2 emission performance standards for new heavy-duty vehicles",
  ] },

  // topic_tags:packaging already covers "PPWR"/"circular economy packaging" (KEYWORD_MAP) — neither
  // is how the base EU packaging-waste directive family names itself. "packaging waste" is Directive
  // 94/62/EC's own operative phrase, confirmed present in the packaging-directive fixture
  // (item 1d3eb2a8, "...amending Directive 94/62/EC on packaging and packaging waste...").
  { field: "topic_tags", tag: "packaging", keywords: ["packaging waste"] },

  // topic_tags:fuels already covers "alternative maritime fuel"/"e-fuel"/"green hydrogen"/
  // "green ammonia" (KEYWORD_MAP) — all maritime-specific. Sustainability fuel law also runs through
  // RED II biofuel/bioliquid/biomass-fuel language (Directive (EU) 2018/2001), confirmed present in
  // the renewable-fuels-GHG-savings fixture (item 2677e2e6, "...biofuels, bioliquids, and biomass
  // fuels...").
  { field: "topic_tags", tag: "fuels", keywords: ["biofuel", "bioliquid", "biomass fuel", "renewable fuel"] },

  // topic_tags:emissions already covers "carbon pricing"/"emissions trading"/"greenhouse gas
  // strategy" (KEYWORD_MAP). "greenhouse gas emissions" (the plain descriptive phrase, distinct from
  // the existing "emissions trading" keyword) and "emission trading" (the singular variant the
  // existing plural-only keyword does not reach) are both common, confirmed-present real phrasings —
  // "greenhouse gas emissions" in 41/178 of the population's captured text, "emission trading" in the
  // EU-ETS verified-emissions items this module's header explains were redirected here.
  { field: "topic_tags", tag: "emissions", keywords: ["greenhouse gas emissions", "emission trading"] },

  // topic_tags:transport already covers "vehicle emission standard"/"fleet mandate"/"zero emission
  // vehicle" (KEYWORD_MAP). "heavy-duty vehicle" is the plain descriptive term the CO2-standard
  // fixture (item 234d3ba8) also carries, distinct from and broader than the truck-CO2-standard
  // scenario alias above (this one fires even when the exact regulation-title phrase is absent).
  { field: "topic_tags", tag: "transport", keywords: ["heavy-duty vehicle"] },
];

// Self-check, mirroring derive-tags.mjs's own KEYWORD_MAP self-check exactly: every ALIAS_MAP entry
// names a tag that is a real member of its field's LIVE vocabulary, extracted moments ago from the
// real SoT files. A typo or a retired token throws at import time — this table can never silently
// drift ahead of, or invent past, the vocabulary it draws aliases for.
for (const entry of ALIAS_MAP) {
  const set = entry.field === "topic_tags" ? TOPIC_TAG_SET
    : entry.field === "compliance_object_tags" ? COMPLIANCE_OBJECT_SET
    : entry.field === "operational_scenario_tags" ? SCENARIO_TAG_SET
    : null;
  if (!set) throw new Error(`tag-aliases: ALIAS_MAP entry names an unknown field "${entry.field}".`);
  if (!set.has(entry.tag)) {
    throw new Error(
      `tag-aliases: ALIAS_MAP proposes tag "${entry.tag}" for field "${entry.field}", which is not in ` +
      `that field's live vocabulary. ALIAS_MAP may only extend an EXISTING tag's matchable phrases, ` +
      `never introduce one absent from the live vocabulary — update or remove this entry.`,
    );
  }
}

/** Escape a literal string for safe embedding inside a RegExp. Identical mechanics to derive-tags.mjs's own escapeRe. */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive, word-bounded matcher for a literal alias phrase, optional trailing "s". Identical mechanics to derive-tags.mjs's own phraseRegex. */
function phraseRegex(phrase) {
  return new RegExp(`\\b${escapeRe(phrase)}s?\\b`, "i");
}

/**
 * Derive ALIAS-TABLE tag PROPOSALS for one item — same input shape and matching/confidence/cap
 * mechanics as derive-tags.mjs's deriveTags(), applied to ALIAS_MAP instead of KEYWORD_MAP. PURE,
 * deterministic, never mutates `item`.
 * @param {{id:string, title?:string|null, canonical_instrument_key?:string|null, full_brief?:string|null}} item
 * @returns {{itemId:string, proposals:Array<{field:string, tag:string, evidence:string, confidence:"high"|"medium"}>}}
 */
export function deriveAliasTags(item) {
  const it = item || {};
  const titleText = [it.title, it.canonical_instrument_key].filter(Boolean).join(" · ");
  const bodyText = String(it.full_brief || "");

  const best = new Map();
  for (const entry of ALIAS_MAP) {
    const key = `${entry.field}|${entry.tag}`;
    for (const kw of entry.keywords) {
      const re = phraseRegex(kw);
      const titleMatch = titleText.match(re);
      if (titleMatch) {
        const existing = best.get(key);
        if (!existing || existing.confidence !== "high") {
          best.set(key, { field: entry.field, tag: entry.tag, evidence: titleMatch[0], confidence: "high" });
        }
        continue;
      }
      const bodyMatch = bodyText.match(re);
      if (bodyMatch && !best.has(key)) {
        best.set(key, { field: entry.field, tag: entry.tag, evidence: bodyMatch[0], confidence: "medium" });
      }
    }
  }

  const byField = { operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] };
  for (const p of best.values()) byField[p.field].push(p);
  const rank = { high: 0, medium: 1 };
  const proposals = [];
  for (const field of Object.keys(byField)) {
    byField[field].sort((a, b) => (rank[a.confidence] - rank[b.confidence]) || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
    proposals.push(...byField[field].slice(0, FIELD_CAPS[field]));
  }

  return { itemId: it.id, proposals };
}

/**
 * Merge two already-computed proposal lists (e.g. deriveTags()'s and deriveAliasTags()'s, over the
 * SAME item) into one properly-capped list. PURE. Where both name the same field+tag, the
 * higher-confidence proposal wins ("high" beats "medium"); `base` wins a same-confidence tie (it comes
 * from the closed, live-vocabulary-bound KEYWORD_MAP, the stronger-grounded of the two tables). The
 * union is then re-capped per field at FIELD_CAPS (imported from derive-tags.mjs, never hand-copied),
 * highest-confidence-first, tag name ascending as the deterministic tiebreak — identical cap mechanics
 * to deriveTags() itself, applied over the combined candidate set rather than either list alone (a
 * candidate dropped by one table's own cap can still surface here if the other table also proposed it
 * at higher confidence).
 * @param {Array<{field:string, tag:string, evidence:string, confidence:"high"|"medium"}>} base
 * @param {Array<{field:string, tag:string, evidence:string, confidence:"high"|"medium"}>} alias
 * @returns {Array<{field:string, tag:string, evidence:string, confidence:"high"|"medium"}>}
 */
export function mergeTagProposals(base, alias) {
  const rank = { high: 0, medium: 1 };
  const best = new Map();
  for (const p of [...(Array.isArray(base) ? base : []), ...(Array.isArray(alias) ? alias : [])]) {
    const key = `${p.field}|${p.tag}`;
    const existing = best.get(key);
    if (!existing || rank[p.confidence] < rank[existing.confidence]) {
      best.set(key, p);
    }
  }
  const byField = { operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] };
  for (const p of best.values()) (byField[p.field] ||= []).push(p);
  const merged = [];
  for (const field of Object.keys(byField)) {
    byField[field].sort((a, b) => (rank[a.confidence] - rank[b.confidence]) || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
    merged.push(...byField[field].slice(0, FIELD_CAPS[field] ?? Infinity));
  }
  return merged;
}
