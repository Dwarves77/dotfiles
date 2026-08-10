// cluster.mjs — CLUSTER ENGINE (flywheel U1: F1+F2+F3+F4-basic). PURE, no DB, no LLM.
//
// Same discipline as discover.mjs (the scoring home this consumes): plain ESM, zero dependencies,
// deterministic by construction. Input is the graph discover.mjs/write-edges.mjs populated —
// nodes are item provenance signatures (only {id, item_type, dates?} are read here) and edges are
// the grounded connections ({source, target, score, basis}). Output is the theme structure the
// analyze-corpus command (U2) persists and the themes surface (U3) renders.
//
// DETERMINISM IS LOAD-BEARING (build plan U1): the flywheel's fixpoint guarantee ("rests on a
// stable corpus") requires same-input ⇒ same-themes. Guaranteed by construction, not by luck:
//   - all iteration orders derive from sorted node ids, never from input array order or object
//     key order;
//   - label propagation visits nodes in ascending id order with in-place updates, ties broken by
//     lexicographically smallest label, rounds bounded (MAX_ROUNDS) with early stop on stability;
//   - theme ids are the lexicographically smallest member id (stable under shuffling);
//   - every output list carries an explicit sort (themes by convergence desc then id; members by
//     date asc then id; pivots by centrality desc then id; signals by weight desc then name).
// The shuffled-input test in cluster.test.mjs asserts deep equality across permutations.
//
// F1 clustering — weighted label propagation over the undirected graph. Directed duplicate edges
//   (the backfill writes both (A,B) and (B,A) — see write-edges.mjs's directionality note) are
//   collapsed to one undirected pair carrying the max score. Self-loops and edges touching
//   unknown node ids are dropped. Themes are components of size >= 2; singletons are not themes.
// F2 pivots — weighted-degree centrality (sum of incident undirected edge scores) per node,
//   top PIVOT_K per theme. The bridge node of a barbell graph is the canonical max-centrality case.
// F3 convergence — surfaceSpan × density × recency.
//   surfaceSpan: count of distinct surfaces among members (surfaceOf(item_type), or item_type as
//     the proxy when no surfaceOf is supplied — same default as discover.mjs).
//   density: intra-theme undirected edges / possible pairs (n*(n-1)/2), in (0, 1].
//   recency: derived ONLY from member dates, normalized against the min/max date across ALL input
//     nodes (input-derived, no clock — a wall-clock read would break determinism). A theme's
//     recency is the mean normalized date of its dated members. Absent dates degrade gracefully:
//     no dated members in the theme, or no usable date range in the corpus ⇒ recency = 1, i.e.
//     convergence = span × density. Never invented (grounding rule).
// F4-basic trajectory — members ordered by date ascending (undated members last, id tie-break).
//   The full forward-events version arrives with B1 (build plan U5); no partial hack here.
//
// dominantSignals: basis signals aggregated across intra-theme edges (weight summed per signal
// name), strongest first — the theme-level "why these belong together", grounded in the same
// basis objects the edges carry. An edge without basis contributes nothing (no invented links).

const MAX_ROUNDS = 20;
const PIVOT_K = 3;

const lc = (s) => String(s || "").toLowerCase().trim();

/** Parse a node's date fields to an epoch ms, or null. Reads `dates` (first parseable entry if an
 *  array, the value itself otherwise) — tolerant of ISO strings, epoch numbers, Date instances. */
function nodeDateMs(node) {
  const raw = node?.dates;
  const candidates = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  for (const c of candidates) {
    if (c == null) continue;
    const ms = c instanceof Date ? c.getTime() : typeof c === "number" ? c : Date.parse(String(c));
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * Cluster the connection graph into themes.
 * @param {Array<{id:string,item_type?:string,dates?:any}>} nodes
 * @param {Array<{source:string,target:string,score?:number,basis?:Array<{signal:string,detail?:string,weight?:number}>}>} edges
 * @param {{surfaceOf?:(itemType:string)=>string}} [opts]
 * @returns {{themes:Array<{id:string,members:string[],dominantSignals:Array<{signal:string,weight:number}>,surfaces:string[],density:number,convergence:number,pivots:Array<{id:string,centrality:number}>}>,nodesClustered:number,edgesUsed:number,rounds:number}}
 */
export function clusterGraph(nodes, edges, { surfaceOf } = {}) {
  const nodeById = new Map();
  for (const n of Array.isArray(nodes) ? nodes : []) {
    if (n && typeof n.id === "string" && n.id) nodeById.set(n.id, n);
  }

  // Collapse directed/duplicate edges to undirected pairs (max score wins); drop self-loops,
  // unknown endpoints, and non-finite scores. Keep every distinct basis entry per pair for
  // dominant-signal aggregation (first occurrence per signal+detail).
  const pair = new Map(); // "a|b" (a < b) -> { a, b, score, basis: [] }
  for (const e of Array.isArray(edges) ? edges : []) {
    if (!e || typeof e.source !== "string" || typeof e.target !== "string") continue;
    if (e.source === e.target) continue;
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
    const score = typeof e.score === "number" && Number.isFinite(e.score) ? e.score : 0;
    if (score <= 0) continue;
    const [a, b] = e.source < e.target ? [e.source, e.target] : [e.target, e.source];
    const key = `${a}|${b}`;
    const existing = pair.get(key);
    if (existing) {
      existing.score = Math.max(existing.score, score);
      for (const bs of Array.isArray(e.basis) ? e.basis : []) {
        if (bs && bs.signal && !existing.basis.some((x) => x.signal === bs.signal && x.detail === bs.detail)) existing.basis.push(bs);
      }
    } else {
      pair.set(key, { a, b, score, basis: (Array.isArray(e.basis) ? e.basis : []).filter((x) => x && x.signal) });
    }
  }

  // Adjacency (sorted construction so downstream iteration is order-stable).
  const adj = new Map(); // id -> Map(neighborId -> score)
  const touch = (id) => { if (!adj.has(id)) adj.set(id, new Map()); return adj.get(id); };
  for (const key of [...pair.keys()].sort()) {
    const { a, b, score } = pair.get(key);
    touch(a).set(b, score);
    touch(b).set(a, score);
  }
  const connectedIds = [...adj.keys()].sort();

  // F1 — weighted label propagation, deterministic: ascending-id visit order, in-place updates,
  // lexicographically-smallest-label tie-break, bounded rounds, early stop when stable.
  const label = new Map(connectedIds.map((id) => [id, id]));
  let rounds = 0;
  for (; rounds < MAX_ROUNDS; rounds++) {
    let changed = false;
    for (const id of connectedIds) {
      const weightByLabel = new Map();
      for (const [nb, w] of adj.get(id)) {
        const l = label.get(nb);
        weightByLabel.set(l, (weightByLabel.get(l) || 0) + w);
      }
      if (!weightByLabel.size) continue;
      let best = null, bestW = -Infinity;
      for (const l of [...weightByLabel.keys()].sort()) {
        const w = weightByLabel.get(l);
        if (w > bestW) { bestW = w; best = l; }
      }
      if (best !== null && best !== label.get(id)) { label.set(id, best); changed = true; }
    }
    if (!changed) { rounds++; break; }
  }

  // Group members by final label; a theme needs >= 2 members.
  const byLabel = new Map();
  for (const id of connectedIds) {
    const l = label.get(id);
    if (!byLabel.has(l)) byLabel.set(l, []);
    byLabel.get(l).push(id);
  }

  // Corpus-wide date range for recency normalization (input-derived; no wall clock).
  let minMs = Infinity, maxMs = -Infinity;
  for (const id of connectedIds) {
    const ms = nodeDateMs(nodeById.get(id));
    if (ms !== null) { if (ms < minMs) minMs = ms; if (ms > maxMs) maxMs = ms; }
  }
  const dateRangeUsable = Number.isFinite(minMs) && Number.isFinite(maxMs) && maxMs > minMs;

  const themes = [];
  for (const memberIds of byLabel.values()) {
    if (memberIds.length < 2) continue;
    const members = memberIds.slice().sort();
    const memberSet = new Set(members);
    const themeId = members[0]; // lexicographically smallest member id — stable under shuffling

    // Intra-theme pairs (both endpoints inside).
    const intraPairs = [];
    for (const key of [...pair.keys()].sort()) {
      const p = pair.get(key);
      if (memberSet.has(p.a) && memberSet.has(p.b)) intraPairs.push(p);
    }

    // F2 — pivots by weighted-degree centrality within the theme.
    const centrality = new Map(members.map((id) => [id, 0]));
    for (const p of intraPairs) {
      centrality.set(p.a, centrality.get(p.a) + p.score);
      centrality.set(p.b, centrality.get(p.b) + p.score);
    }
    const pivots = members
      .map((id) => ({ id, centrality: Number(centrality.get(id).toFixed(6)) }))
      .sort((x, y) => (y.centrality !== x.centrality ? y.centrality - x.centrality : x.id < y.id ? -1 : 1))
      .slice(0, PIVOT_K);

    // dominantSignals — basis weight summed per signal across intra-theme edges.
    const signalWeight = new Map();
    for (const p of intraPairs) {
      for (const bs of p.basis) {
        const w = typeof bs.weight === "number" && Number.isFinite(bs.weight) ? bs.weight : 0;
        signalWeight.set(bs.signal, (signalWeight.get(bs.signal) || 0) + w);
      }
    }
    const dominantSignals = [...signalWeight.keys()]
      .sort()
      .map((signal) => ({ signal, weight: Number(signalWeight.get(signal).toFixed(6)) }))
      .sort((x, y) => (y.weight !== x.weight ? y.weight - x.weight : x.signal < y.signal ? -1 : 1));

    // F3 — surfaces, density, recency, convergence.
    const surfaceSet = new Set(members.map((id) => {
      const t = nodeById.get(id)?.item_type;
      return lc(surfaceOf ? surfaceOf(t) : t) || "unknown";
    }));
    const surfaces = [...surfaceSet].sort();
    const n = members.length;
    const density = intraPairs.length / ((n * (n - 1)) / 2);
    let recency = 1; // graceful degradation: no dates ⇒ convergence = span × density
    if (dateRangeUsable) {
      const norms = [];
      for (const id of members) {
        const ms = nodeDateMs(nodeById.get(id));
        if (ms !== null) norms.push((ms - minMs) / (maxMs - minMs));
      }
      if (norms.length) recency = norms.reduce((s, x) => s + x, 0) / norms.length;
    }
    const convergence = Number((surfaces.length * density * recency).toFixed(6));

    // F4-basic — members ordered by date ascending, undated last, id tie-break.
    const ordered = members.slice().sort((x, y) => {
      const dx = nodeDateMs(nodeById.get(x));
      const dy = nodeDateMs(nodeById.get(y));
      if (dx !== null && dy !== null && dx !== dy) return dx - dy;
      if (dx !== null && dy === null) return -1;
      if (dx === null && dy !== null) return 1;
      return x < y ? -1 : 1;
    });

    themes.push({
      id: themeId,
      members: ordered,
      dominantSignals,
      surfaces,
      density: Number(density.toFixed(6)),
      convergence,
      pivots,
    });
  }

  themes.sort((x, y) => (y.convergence !== x.convergence ? y.convergence - x.convergence : x.id < y.id ? -1 : 1));

  return { themes, nodesClustered: connectedIds.length, edgesUsed: pair.size, rounds };
}
