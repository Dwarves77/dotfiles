// theme-delta.mjs — structured diff between two theme sets (flywheel F6). PURE, no DB, no LLM.
//
// WHY THIS EXISTS. analyze-corpus.mjs's persist step (U2) fully REPLACES connection_themes on every
// run — guardedDelete-all then guardedInsertMany (migration 253's own comment: "not append-only").
// Without a diff computed BEFORE the delete, the fact that theme X dissolved, or that two prior themes
// merged into one, is lost the instant the next pass writes over it; connection_theme_runs (the
// append-only ledger) only ever recorded per-run TOTALS (themes_written, gaps_flagged), never what
// changed between one run and the next. This module computes that diff so analyze-corpus.mjs can
// attach it to the SAME run row as a history-preserving digest, surviving the wholesale replacement it
// documents.
//
// IDENTITY. cluster.mjs sets theme.id to the lexicographically smallest member id — "stable across
// reruns on a stable corpus (fixpoint guarantee)" (migration 253's own column comment). So on an
// UNCHANGED corpus every theme's id is byte-identical run to run: matching by id is correct and
// sufficient for the overwhelmingly common case. It only breaks when the corpus itself changed
// (an item archived/added/re-tagged so a theme's smallest-member anchor shifts, or the graph
// reshapes so members redistribute across themes) — exactly the cases worth a diff. For those, this
// module falls back to MEMBER-OVERLAP matching: a prior theme and a new theme are considered the
// "same real-world cluster" when they share at least OVERLAP_THRESHOLD of the SMALLER theme's members
// (the overlap coefficient |A∩B| / min(|A|,|B|), not Jaccard — Jaccard penalizes a genuine
// merge/split's size mismatch, which is exactly the shape this module needs to detect rather than
// discount).
//
// THRESHOLD, derived from the actual theme row shape (not an invented magic number): connection_themes
// CHECK (array_length(member_ids,1) >= 2) — every theme has at least 2 members, so the smallest
// possible "more than half" overlap for the minimum-size theme (2 members) is 1 shared member, i.e.
// overlap coefficient 0.5. OVERLAP_THRESHOLD = 0.5 ("a MAJORITY of the smaller theme's members carried
// over") is therefore the finest threshold that is still meaningful at the schema's own size floor;
// anything stricter would make a 2-member theme unmatchable by construction, and anything looser would
// call themes "the same" on a minority overlap.
//
// CLASSIFICATION (per theme, both directions):
//   persisted  — prior theme id === new theme id (exact anchor match); membership delta reported.
//   renamed    — prior/new match by member-overlap (>= threshold) but ids differ (anchor drifted);
//                membership delta reported same as persisted.
//   split      — one prior theme's members are the best overlap match for >= 2 new themes.
//   merged     — one new theme is the best overlap match for >= 2 prior themes.
//   dissolved  — a prior theme has no new theme meeting the overlap threshold.
//   appeared   — a new theme has no prior theme meeting the overlap threshold.
// A theme classified split/merged is excluded from persisted/renamed (its "best match" is ambiguous by
// definition — reported once, under its own bucket, not double-counted).

const OVERLAP_THRESHOLD = 0.5;

function normalize(themes) {
  const out = [];
  for (const t of Array.isArray(themes) ? themes : []) {
    if (!t || typeof t.id !== "string") continue;
    const members = Array.isArray(t.member_ids) ? t.member_ids : Array.isArray(t.members) ? t.members : [];
    out.push({ id: t.id, members: [...new Set(members.filter((m) => typeof m === "string" && m))].sort() });
  }
  return out;
}

function overlapCoefficient(a, b) {
  const setA = new Set(a), setB = new Set(b);
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const m of setA) if (setB.has(m)) inter++;
  return inter / Math.min(setA.size, setB.size);
}

function membershipDelta(priorMembers, newMembers) {
  const priorSet = new Set(priorMembers), newSet = new Set(newMembers);
  const added = newMembers.filter((m) => !priorSet.has(m));
  const removed = priorMembers.filter((m) => !newSet.has(m));
  return { added, removed };
}

/**
 * Diff a prior theme set against a new one.
 * @param {Array<{id:string, member_ids?:string[], members?:string[]}>} priorThemes
 * @param {Array<{id:string, member_ids?:string[], members?:string[]}>} newThemes
 * @param {{overlapThreshold?:number}} [opts]
 * @returns {{
 *   persisted: Array<{prior_id:string,new_id:string,added:string[],removed:string[]}>,
 *   renamed: Array<{prior_id:string,new_id:string,added:string[],removed:string[]}>,
 *   split: Array<{prior_id:string,new_ids:string[]}>,
 *   merged: Array<{new_id:string,prior_ids:string[]}>,
 *   dissolved: string[],
 *   appeared: string[],
 *   summary: {prior_count:number,new_count:number,persisted:number,renamed:number,split:number,merged:number,dissolved:number,appeared:number},
 * }}
 */
export function diffThemes(priorThemes, newThemes, opts = {}) {
  const threshold = typeof opts.overlapThreshold === "number" ? opts.overlapThreshold : OVERLAP_THRESHOLD;
  const priors = normalize(priorThemes);
  const news = normalize(newThemes);
  const priorById = new Map(priors.map((t) => [t.id, t]));
  const newById = new Map(news.map((t) => [t.id, t]));

  // For every (prior, new) pair sharing >= threshold overlap, record it — bidirectional candidate map.
  const priorMatches = new Map(priors.map((t) => [t.id, []])); // prior.id -> [{id, coef}]
  const newMatches = new Map(news.map((t) => [t.id, []]));     // new.id -> [{id, coef}]
  for (const p of priors) {
    for (const n of news) {
      const coef = overlapCoefficient(p.members, n.members);
      if (coef >= threshold) {
        priorMatches.get(p.id).push({ id: n.id, coef });
        newMatches.get(n.id).push({ id: p.id, coef });
      }
    }
  }
  for (const list of priorMatches.values()) list.sort((a, b) => (b.coef - a.coef) || (a.id < b.id ? -1 : 1));
  for (const list of newMatches.values()) list.sort((a, b) => (b.coef - a.coef) || (a.id < b.id ? -1 : 1));

  const persisted = [], renamed = [], split = [], merged = [];
  const dissolved = [], appeared = [];
  const claimedPrior = new Set(); // priors consumed by persisted/renamed/split
  const claimedNew = new Set();   // news consumed by persisted/renamed/merged

  // split: a prior theme matched by >= 2 distinct new themes.
  for (const p of priors) {
    const matches = priorMatches.get(p.id);
    if (matches.length >= 2) {
      split.push({ prior_id: p.id, new_ids: matches.map((m) => m.id).sort() });
      claimedPrior.add(p.id);
      for (const m of matches) claimedNew.add(m.id); // daughters of a split are not "appeared"
    }
  }
  // merged: a new theme matched by >= 2 distinct prior themes (excluding priors already claimed by split).
  for (const n of news) {
    const matches = newMatches.get(n.id).filter((m) => !claimedPrior.has(m.id));
    if (matches.length >= 2) {
      merged.push({ new_id: n.id, prior_ids: matches.map((m) => m.id).sort() });
      claimedNew.add(n.id);
      for (const m of matches) claimedPrior.add(m.id);
    }
  }
  // persisted / renamed: remaining priors with exactly one remaining match, mutually best.
  for (const p of priors) {
    if (claimedPrior.has(p.id)) continue;
    const matches = priorMatches.get(p.id).filter((m) => !claimedNew.has(m.id));
    if (matches.length !== 1) continue;
    const nId = matches[0].id;
    const nBest = newMatches.get(nId).filter((m) => !claimedPrior.has(m.id));
    if (nBest.length !== 1 || nBest[0].id !== p.id) continue; // not a mutual 1:1 best match
    const n = newById.get(nId);
    const { added, removed } = membershipDelta(p.members, n.members);
    const row = { prior_id: p.id, new_id: n.id, added, removed };
    if (p.id === n.id) persisted.push(row); else renamed.push(row);
    claimedPrior.add(p.id);
    claimedNew.add(n.id);
  }
  // dissolved: priors never claimed.
  for (const p of priors) if (!claimedPrior.has(p.id)) dissolved.push(p.id);
  // appeared: news never claimed.
  for (const n of news) if (!claimedNew.has(n.id)) appeared.push(n.id);

  dissolved.sort();
  appeared.sort();
  persisted.sort((a, b) => (a.prior_id < b.prior_id ? -1 : 1));
  renamed.sort((a, b) => (a.prior_id < b.prior_id ? -1 : 1));
  split.sort((a, b) => (a.prior_id < b.prior_id ? -1 : 1));
  merged.sort((a, b) => (a.new_id < b.new_id ? -1 : 1));

  return {
    persisted, renamed, split, merged, dissolved, appeared,
    summary: {
      prior_count: priors.length,
      new_count: news.length,
      persisted: persisted.length,
      renamed: renamed.length,
      split: split.length,
      merged: merged.length,
      dissolved: dissolved.length,
      appeared: appeared.length,
    },
  };
}
