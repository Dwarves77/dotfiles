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

// flag-namespaces.mjs is the SoT for subject_ref construction (task "flag-namespaces", refactor).
// A gap's subject_ref is always a bare theme.id (a single part), and buildSubjectRef(x) === x for one
// part — so this import changes NO existing gap's subject_ref, it only stops this file hand-rolling
// the same convention flag-namespaces.mjs now owns.
import { buildSubjectRef } from "./flag-namespaces.mjs";

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
            subject_ref: buildSubjectRef(theme.id),
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
        subject_ref: buildSubjectRef(theme.id),
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
        subject_ref: buildSubjectRef(theme.id),
        description: `Theme ${theme.id}'s pivot (${pivots[0].id}, centrality ${pivots[0].centrality}) has no operations-surface counterpart among ${members.length} members.`,
        recommended_actions: ["Review whether this theme has an operational impact that isn't yet captured as an operations-surface item."],
        evidence: { themeId: theme.id, pivotId: pivots[0].id, pivotCentrality: pivots[0].centrality, surfaces: [...surfaces].sort(), memberCount: members.length },
      });
    }
  }

  gaps.sort((x, y) => (x.subject_ref !== y.subject_ref ? (x.subject_ref < y.subject_ref ? -1 : 1) : x.type < y.type ? -1 : x.type > y.type ? 1 : 0));
  return gaps;
}
