// gaps.mjs — GAP DETECTION (flywheel U2). PURE, no DB, no LLM.
//
// Same discipline as cluster.mjs (the theme structure this consumes): plain ESM, zero dependencies,
// deterministic by construction — so this joins the src/lib/connections/*.test.mjs glob and runs in
// the no-npm discipline CI unmodified.
//
// The build plan names three illustrative gap shapes without exact formulas: (1) "jurisdiction span
// with no US member", (2) "research+regulation theme with no market signal", (3) "a pivot with no
// operations counterpart". This module implements each as a narrow, literal rule grounded ONLY in
// data cluster.mjs already produced (theme.surfaces, theme.pivots, theme.members) plus two optional,
// caller-supplied inputs — never invented, degrades to zero findings when the input is absent:
//
//   - `profile.jurisdictions` (Record<iso, weight>, from workspace/profile.ts's WorkspaceProfile) —
//     generalizes plan example (1)'s hardcoded "US" to whatever jurisdiction(s) THIS workspace
//     actually weights highest, so the detector is not US-centric by accident. gaps.mjs takes the
//     already-resolved profile object (a plain {jurisdictions: {...}} shape) rather than importing
//     profile.ts directly — profile.ts is a .ts module with a live Supabase client and path aliases,
//     which would break the zero-dependency/no-npm-required contract this file exists to keep.
//   - `jurisdictionsByMember` (Map|object: intelligence_items.id -> iso[] | iso) — cluster.mjs's node
//     objects don't carry jurisdiction (only {id, item_type, dates}), so the caller (analyze-corpus.mjs)
//     supplies it from a real intelligence_items.jurisdiction_iso read. Without it, jurisdiction-span
//     gaps simply don't fire — no guessing.
//
// Every finding's evidence traces to real theme/member data (grounding rule, CLAUDE.md standing rule 2)
// — nothing here fabricates a jurisdiction, surface, or member that isn't already in the input.
//
// subject_type [FIXED 2026-08-31, coordinator-verified defect]: a gap's subject_ref is always
// theme.id (a connection_themes id — this detector operates on clustered themes, never on a single
// intelligence_items row), but every finding here previously stamped subject_type "item". That lied
// about what subject_ref points at and made every emitted coverage_gap flag unresolvable by any
// consumer that reads subject_type:"item" and looks subject_ref up against intelligence_items.id
// (e.g. scripts/verify/deferral-hygiene-audit.mjs's DELETED-SUBJECT check, quarantine-disposition-
// audit.mjs's subject_type="item" read) — the theme id is never a real item id, so those lookups
// always miss. integrity_flags.subject_type is DB-CHECK-constrained (migration 048) to exactly
// {'surface','item','source','jurisdiction','system'} — there is no 'theme' value, and widening the
// constraint is a migration, out of scope for this pure module. "system" is the least-wrong legal
// value: migration 048's own column comment defines subject_type='system' as "free-text component
// name" (not claimed to resolve against any specific table), which is exactly true of a theme id and,
// unlike "item", makes no false claim that lets an item-scoped consumer mis-resolve it.

/** Jurisdiction keys that mean "everywhere" rather than a specific place — never a meaningful "home"
 *  to be missing. Matched case-insensitively (profile keys have been seen as both 'global' (the
 *  DEFAULT_WORKSPACE_PROFILE seed) and real uppercase ISO codes side by side in the same object). */
const GENERIC_JURISDICTIONS = new Set(["global", "worldwide", "all"]);

// KNOWN LIMITATION [CONFIRMED against live data 2026-08-10]: matching is exact string equality
// (case-insensitive only). The live workspace_settings.jurisdiction_weights uses lowercase
// abbreviations ('eu', 'us', 'uk', 'imo', 'icao', ...) while intelligence_items.jurisdiction_iso uses
// uppercase ISO-3166-ish codes ('EU', 'US', 'GB', 'IMO', ...) plus subnational codes ('US-CA',
// 'GB-WLS'). Today's live top-weighted home jurisdictions (eu/imo/icao, all tied at weight 1) happen
// to match cleanly case-insensitively, so this is not currently producing wrong output — but 'uk' has
// no ISO alias to 'GB' here, and a subnational code like 'US-CA' will never satisfy a plain 'us'
// match. Filed as follow-up rather than fixed here: a real ISO-3166 alias table + subnational-parent
// containment check is its own scoped piece of work, not a guess to bury in a string comparison.

const lc = (s) => String(s || "").toLowerCase().trim();

/** Normalize a jurisdictionsByMember lookup (Map or plain object) to a Set of ISO codes for one member.
 *  Tolerant of a single iso string, an array of isos, or an absent entry (empty set). */
function jurisdictionsFor(jurisdictionsByMember, id) {
  if (!jurisdictionsByMember) return new Set();
  const raw = jurisdictionsByMember instanceof Map ? jurisdictionsByMember.get(id) : jurisdictionsByMember[id];
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return new Set(list.filter((x) => typeof x === "string" && x).map((x) => x.trim()));
}

/** The workspace's "home" jurisdictions: the profile's highest-weighted non-generic entries. Ties all
 *  count as home (equally weighted top jurisdictions are equally "ours"). Returns [] when the profile
 *  has no jurisdictions, or only generic ones (e.g. DEFAULT_WORKSPACE_PROFILE's {global: 1}) — there is
 *  no specific home to be missing, so type-A gaps correctly produce nothing rather than a false signal. */
function homeJurisdictions(profile) {
  const map = profile && typeof profile.jurisdictions === "object" ? profile.jurisdictions : null;
  if (!map) return [];
  let maxW = -Infinity;
  const specific = [];
  for (const [iso, w] of Object.entries(map)) {
    if (GENERIC_JURISDICTIONS.has(lc(iso))) continue;
    const weight = typeof w === "number" && Number.isFinite(w) ? w : 0;
    specific.push([iso, weight]);
    if (weight > maxW) maxW = weight;
  }
  if (!specific.length) return [];
  return specific.filter(([, w]) => w === maxW).map(([iso]) => iso).sort();
}

/**
 * Detect coverage gaps in a set of clustered themes (cluster.mjs output).
 * @param {Array<{id:string,members:string[],surfaces:string[],pivots:Array<{id:string,centrality:number}>}>} themes
 * @param {{profile?:{jurisdictions?:Record<string,number>}, jurisdictionsByMember?:Map<string,string|string[]>|Record<string,string|string[]>}} [opts]
 * @returns {Array<{type:string,category:'coverage_gap',subject_type:'system',subject_ref:string,description:string,recommended_actions:string[],evidence:object}>}
 */
export function detectGaps(themes, { profile, jurisdictionsByMember } = {}) {
  const gaps = [];

  for (const theme of Array.isArray(themes) ? themes : []) {
    if (!theme || typeof theme.id !== "string") continue;
    const members = Array.isArray(theme.members) ? theme.members : [];
    const surfaces = new Set(Array.isArray(theme.surfaces) ? theme.surfaces : []);

    // Type A — jurisdiction-span gap: the theme provably spans >= 2 real jurisdictions, but this
    // workspace's home jurisdiction has zero members in it. Generalizes the plan's "no US member"
    // example via profile.jurisdictions instead of a hardcoded country.
    if (jurisdictionsByMember) {
      const spanned = new Set();
      const perMember = new Map();
      for (const id of members) {
        const isos = jurisdictionsFor(jurisdictionsByMember, id);
        if (isos.size) perMember.set(id, isos);
        for (const iso of isos) spanned.add(iso);
      }
      if (spanned.size >= 2) {
        for (const home of homeJurisdictions(profile)) {
          const present = [...spanned].some((iso) => lc(iso) === lc(home));
          if (present) continue;
          gaps.push({
            type: "jurisdiction_span_gap",
            category: "coverage_gap",
            subject_type: "system", // theme id, not an item id — see file-header note
            subject_ref: theme.id,
            description: `Theme ${theme.id} spans ${spanned.size} jurisdictions (${[...spanned].sort().join(", ")}) with no member in ${home}, a jurisdiction this workspace weights as home.`,
            recommended_actions: [`Confirm whether ${home} coverage for this theme exists outside this cluster before treating it as a real gap.`],
            evidence: { themeId: theme.id, spannedJurisdictions: [...spanned].sort(), missingHome: home, memberCount: members.length },
          });
        }
      }
    }

    // Type B — surface gap: theme literally matches the plan's named example (regulation + research
    // present, market absent). A narrow rule, deliberately not generalized to arbitrary surface
    // subsets — the plan names this exact combination, not "any surface the theme doesn't touch".
    if (surfaces.has("regulations") && surfaces.has("research") && !surfaces.has("market")) {
      gaps.push({
        type: "surface_gap",
        category: "coverage_gap",
        subject_type: "system", // theme id, not an item id — see file-header note
        subject_ref: theme.id,
        description: `Theme ${theme.id} connects regulation and research signals (${members.length} members) with no market signal tracked.`,
        recommended_actions: ["Check whether a market-signal item for this theme exists but scored below the discovery threshold."],
        evidence: { themeId: theme.id, surfaces: [...surfaces].sort(), memberCount: members.length },
      });
    }

    // Type C — pivot/operations gap: the theme has a real structural pivot (>= 3 members, so the top
    // pivot's centrality reflects more than one edge) but no operations-surface member at all.
    const pivots = Array.isArray(theme.pivots) ? theme.pivots : [];
    if (pivots.length && members.length >= 3 && !surfaces.has("operations")) {
      gaps.push({
        type: "pivot_operations_gap",
        category: "coverage_gap",
        subject_type: "system", // theme id, not an item id — see file-header note
        subject_ref: theme.id,
        description: `Theme ${theme.id}'s pivot (${pivots[0].id}, centrality ${pivots[0].centrality}) has no operations-surface counterpart among ${members.length} members.`,
        recommended_actions: ["Review whether this theme has an operational impact that isn't yet captured as an operations-surface item."],
        evidence: { themeId: theme.id, pivotId: pivots[0].id, pivotCentrality: pivots[0].centrality, surfaces: [...surfaces].sort(), memberCount: members.length },
      });
    }
  }

  gaps.sort((x, y) => (x.subject_ref !== y.subject_ref ? (x.subject_ref < y.subject_ref ? -1 : 1) : x.type < y.type ? -1 : x.type > y.type ? 1 : 0));
  return gaps;
}
