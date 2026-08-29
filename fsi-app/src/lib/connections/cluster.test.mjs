// Tests for the cluster engine (flywheel U1). Pure — runs in the no-npm suite via the
// src/lib/connections/*.test.mjs glob (run-test-suite.sh + CI, parity by construction).
// The five proofs named in the build plan: two dense components → two themes; bridge node scores
// max centrality; cross-surface outranks same-surface at equal density; shuffled-input
// determinism (identical output); empty/degenerate inputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterGraph } from "./cluster.mjs";

const node = (id, item_type = "regulation", dates) => ({ id, item_type, ...(dates !== undefined ? { dates } : {}) });
const edge = (source, target, score = 0.5, basis = [{ signal: "shared_scenario", detail: "t", weight: score }]) => ({ source, target, score, basis });

// Two K3 triangles (a1-a2-a3, b1-b2-b3) joined by nothing.
const twoComponents = () => ({
  nodes: [node("a1"), node("a2"), node("a3"), node("b1"), node("b2"), node("b3")],
  edges: [edge("a1", "a2"), edge("a2", "a3"), edge("a1", "a3"), edge("b1", "b2"), edge("b2", "b3"), edge("b1", "b3")],
});

test("two dense components → two themes, stable ids, full membership", () => {
  const { nodes, edges } = twoComponents();
  const out = clusterGraph(nodes, edges);
  assert.equal(out.themes.length, 2);
  const ids = out.themes.map((t) => t.id).sort();
  assert.deepEqual(ids, ["a1", "b1"]); // theme id = lexicographically smallest member
  const memberSets = out.themes.map((t) => t.members.slice().sort());
  assert.ok(memberSets.some((m) => m.join() === "a1,a2,a3"));
  assert.ok(memberSets.some((m) => m.join() === "b1,b2,b3"));
  assert.equal(out.nodesClustered, 6);
  assert.equal(out.edgesUsed, 6);
});

test("bridge node scores max centrality in a barbell graph", () => {
  // Two triangles joined THROUGH bridge node "m": every path between the halves crosses m.
  const nodes = [node("a1"), node("a2"), node("m"), node("z1"), node("z2")];
  const edges = [
    edge("a1", "a2", 0.4), edge("a1", "m", 0.5), edge("a2", "m", 0.5),
    edge("z1", "z2", 0.4), edge("z1", "m", 0.5), edge("z2", "m", 0.5),
  ];
  const out = clusterGraph(nodes, edges);
  assert.equal(out.themes.length, 1); // one connected component
  const pivots = out.themes[0].pivots;
  assert.equal(pivots[0].id, "m"); // the bridge is the top pivot
  assert.ok(pivots[0].centrality > pivots[1].centrality);
});

test("cross-surface theme outranks same-surface at equal density", () => {
  // Identical shape (a pair, one edge, same score): one spans two surfaces, one does not.
  const nodes = [
    node("c1", "regulation"), node("c2", "market_signal"), // cross-surface pair
    node("s1", "regulation"), node("s2", "regulation"),    // same-surface pair
  ];
  const edges = [edge("c1", "c2", 0.5), edge("s1", "s2", 0.5)];
  const surfaceOf = (t) => (t === "regulation" ? "regulations" : "market");
  const out = clusterGraph(nodes, edges, { surfaceOf });
  assert.equal(out.themes.length, 2);
  assert.equal(out.themes[0].id, "c1"); // cross-surface first
  assert.equal(out.themes[0].surfaces.length, 2);
  assert.equal(out.themes[1].surfaces.length, 1);
  assert.ok(out.themes[0].convergence > out.themes[1].convergence);
  assert.equal(out.themes[0].density, out.themes[1].density); // the ONLY differentiator was span
});

test("shuffled-input determinism: identical output under permutation (both nodes and edges)", () => {
  const nodes = [
    node("a1", "regulation", "2026-01-05"), node("a2", "market_signal", "2026-03-01"), node("a3", "research_finding"),
    node("b1", "regulation", "2025-11-20"), node("b2", "regulation", "2026-02-14"), node("b3", "operations"),
    node("lone", "regulation"),
  ];
  const edges = [
    edge("a1", "a2", 0.9), edge("a2", "a3", 0.4), edge("a1", "a3", 0.35),
    edge("b1", "b2", 0.6), edge("b2", "b3", 0.5), edge("b1", "b3", 0.3),
    // duplicate reverse direction with a different score — must collapse to max, not double-count
    edge("a2", "a1", 0.7),
  ];
  const surfaceOf = (t) => (t === "regulation" ? "regulations" : t === "market_signal" ? "market" : t === "research_finding" ? "research" : "operations");
  const baseline = clusterGraph(nodes, edges, { surfaceOf });

  // Deterministic permutations (no Math.random — the test itself must be reproducible).
  const rotations = [1, 2, 3, 5];
  for (const r of rotations) {
    const shuffledNodes = [...nodes.slice(r % nodes.length), ...nodes.slice(0, r % nodes.length)];
    const shuffledEdges = [...edges.slice(r % edges.length), ...edges.slice(0, r % edges.length)].reverse();
    const out = clusterGraph(shuffledNodes, shuffledEdges, { surfaceOf });
    assert.deepEqual(out, baseline);
  }
});

test("F4-basic: members ordered by date ascending, undated last", () => {
  const nodes = [node("x1", "regulation", "2026-05-01"), node("x2", "regulation", "2025-01-01"), node("x3", "regulation")];
  const edges = [edge("x1", "x2"), edge("x2", "x3"), edge("x1", "x3")];
  const out = clusterGraph(nodes, edges);
  assert.equal(out.themes.length, 1);
  assert.deepEqual(out.themes[0].members, ["x2", "x1", "x3"]); // oldest first, undated last
});

test("recency degrades gracefully: no dates ⇒ convergence = span × density exactly", () => {
  const nodes = [node("y1", "regulation"), node("y2", "market_signal")];
  const edges = [edge("y1", "y2", 0.5)];
  const surfaceOf = (t) => (t === "regulation" ? "regulations" : "market");
  const out = clusterGraph(nodes, edges, { surfaceOf });
  assert.equal(out.themes.length, 1);
  assert.equal(out.themes[0].convergence, 2); // span 2 × density 1 × recency 1 (degraded)
});

test("dominantSignals aggregate basis across intra-theme edges, strongest first, grounded", () => {
  const nodes = [node("d1"), node("d2"), node("d3")];
  const edges = [
    { source: "d1", target: "d2", score: 0.9, basis: [{ signal: "shared_source", detail: "i", weight: 0.4 }] },
    { source: "d2", target: "d3", score: 0.3, basis: [{ signal: "shared_scenario", detail: "s", weight: 0.3 }] },
    { source: "d1", target: "d3", score: 0.3, basis: [{ signal: "shared_scenario", detail: "s2", weight: 0.3 }] },
  ];
  const out = clusterGraph(nodes, edges);
  const sig = out.themes[0].dominantSignals;
  // shared_scenario sums to 0.6 across the two edges it appears on (0.3 + 0.3), beating shared_source's
  // single 0.4 — dominantSignals sums weight PER SIGNAL across intra-theme edges, not per edge.
  assert.equal(sig[0].signal, "shared_scenario");
  assert.equal(sig[0].weight, 0.6);
  assert.ok(sig.every((s) => s.weight > 0)); // nothing invented — every signal traces to real basis weight
});

test("empty and degenerate inputs never throw, never invent themes", () => {
  assert.deepEqual(clusterGraph([], []).themes, []);
  assert.deepEqual(clusterGraph(undefined, undefined).themes, []);
  // singleton (no edges) is not a theme
  assert.deepEqual(clusterGraph([node("solo")], []).themes, []);
  // self-loop and unknown-endpoint edges are dropped
  const out = clusterGraph(
    [node("k1"), node("k2")],
    [edge("k1", "k1"), edge("k1", "ghost"), { source: "k1", target: "k2" }, edge("k1", "k2", NaN)],
  );
  assert.deepEqual(out.themes, []); // remaining edges carry no positive score — no theme
  assert.equal(out.edgesUsed, 0);
  // malformed edge objects are ignored
  assert.doesNotThrow(() => clusterGraph([node("k1")], [null, {}, { source: 1, target: 2 }]));
});
