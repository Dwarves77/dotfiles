// relevance.mjs — READ-TIME contextualization core (Option B, mig 251). PURE, no DB, no LLM.
//
// The shared brief is role-generic (correct for shared canonical analysis). This computes, per VIEWER,
// how a given item relates to THEIR workspace profile — "relevance to your operation" — by joining the
// item's own tags (transport_modes, jurisdictions, topics/scenarios) against the profile. Deterministic,
// $0, runs on every read. Level 2 (a cached authored paragraph) layers on top; this is Level 1.
//
// It is a LENS, not a filter: a broad global forwarder matches most items, and that is correct — the value
// is HIGHLIGHTING which of the reader's dimensions each item touches, not narrowing the corpus.
//
// Inputs (all optional-safe):
//   item:    { transport_modes?, jurisdictions?, jurisdiction_iso?, topic_tags?, operational_scenario_tags?,
//              compliance_object_tags?, title?, full_brief? }
//   profile: { verticals?: string[] (sector ids), jurisdictions?: Record<string,number> (weights),
//              transport_modes?: string[], roles?: string[] }
//   sectorDefs: Array<{ id, label, keywords: string[] }>  (from constants ALL_SECTORS; injected to keep pure)
// Output: { band: 'high'|'medium'|'low', matchedModes, matchedVerticals: [{id,label}], matchedJurisdictions,
//           roleSignals: string[], summary: string }

const arr = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === "string" && v.trim()) : []);
const lc = (s) => String(s || "").toLowerCase();
const uniq = (a) => [...new Set(a)];

// import/export/customs signals → the forwarder/importer/exporter roles all engage.
const ROLE_SIGNAL_RE =
  /\b(import|export|customs|declaration|clearance|tariff|duty|duties|hs code|origin|incoterm|manifest|carrier|forwarder|consignee|consignor|transit|cross-border|border)\b/;

export function computeItemRelevance(item = {}, profile = {}, sectorDefs = []) {
  const pModes = arr(profile.transport_modes);
  const iModes = arr(item.transport_modes);
  // Mode match: the item's modes that the workspace operates. If the item declares no modes, a
  // regulation is treated as mode-agnostic (applies across the reader's modes) rather than "no match".
  const matchedModes = iModes.length
    ? iModes.filter((m) => pModes.some((pm) => lc(pm) === lc(m)))
    : [];
  const modeAgnostic = iModes.length === 0;

  // Jurisdiction match: the item's jurisdictions the workspace weights above zero. Global profile → most.
  const weights = profile.jurisdictions && typeof profile.jurisdictions === "object" ? profile.jurisdictions : {};
  const globalScope = (weights.global ?? 0) > 0 || Object.keys(weights).length === 0;
  const iJur = uniq([...arr(item.jurisdictions), ...arr(item.jurisdiction_iso)]);
  const matchedJurisdictions = iJur.filter((j) => {
    if (globalScope) return true; // worldwide operator: every jurisdiction is in scope
    const key = lc(j);
    return Object.keys(weights).some((w) => lc(w) === key && (weights[w] ?? 0) > 0);
  });

  // Vertical match: profile verticals whose sector keywords appear in the item's text/tags.
  const hay = lc([
    item.title,
    ...arr(item.topic_tags),
    ...arr(item.operational_scenario_tags),
    ...arr(item.compliance_object_tags),
  ].join(" "));
  const pVerticals = new Set(arr(profile.verticals).map(lc));
  const matchedVerticals = (Array.isArray(sectorDefs) ? sectorDefs : [])
    .filter((s) => s && pVerticals.has(lc(s.id)) && arr(s.keywords).some((k) => hay.includes(lc(k))))
    .map((s) => ({ id: s.id, label: s.label || s.id }));

  // Role signals: import/export/customs language → the reader's roles engage directly.
  const roleHay = lc([item.title, ...arr(item.compliance_object_tags), ...arr(item.operational_scenario_tags)].join(" "));
  const roleSignals = ROLE_SIGNAL_RE.test(roleHay) ? arr(profile.roles) : [];

  // Band: a lens, not a gate. HIGH when the item touches the reader's modes/jurisdictions AND a vertical
  // or a role signal; MEDIUM on a partial touch; LOW when nothing lines up (rare for a global operator).
  const touchesModes = matchedModes.length > 0 || modeAgnostic;
  const touchesGeo = matchedJurisdictions.length > 0 || globalScope;
  const touchesFocus = matchedVerticals.length > 0 || roleSignals.length > 0;
  const band = touchesModes && touchesGeo && touchesFocus ? "high"
    : (touchesModes || touchesGeo) && (touchesFocus || matchedModes.length || matchedJurisdictions.length) ? "medium"
    : "low";

  // Summary: deterministic "Relevance to your operation" line assembled from the matches.
  const parts = [];
  if (matchedModes.length) parts.push(`your ${matchedModes.join("/")} operations`);
  else if (modeAgnostic) parts.push("your operations across modes");
  if (matchedVerticals.length) parts.push(`the ${matchedVerticals.map((v) => v.label).join(", ")} ${matchedVerticals.length === 1 ? "vertical" : "verticals"}`);
  if (roleSignals.length) parts.push(`your role as ${roleSignals.join("/")}`);
  const geo = globalScope
    ? (matchedJurisdictions.length && matchedJurisdictions.length <= 4 ? ` in ${matchedJurisdictions.join(", ")}` : "")
    : (matchedJurisdictions.length ? ` in ${matchedJurisdictions.slice(0, 4).join(", ")}` : "");
  const summary = parts.length
    ? `Relevance to your operation: affects ${parts.join(", ")}${geo}.`
    : "Relevance to your operation: general applicability to a freight operator.";

  return { band, matchedModes, matchedVerticals, matchedJurisdictions, roleSignals, summary };
}
