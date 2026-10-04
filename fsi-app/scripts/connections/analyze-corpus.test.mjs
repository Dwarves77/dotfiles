// analyze-corpus.test.mjs: structural proofs for the intersection step wired into analyze-corpus.mjs
// (lane S3-A). analyze-corpus.mjs is a bare top-level script (it exits 2 without DB creds and has no
// exports), so, like apply-record-briefs.test.mjs and run-population-flywheel.test.mjs, these read the
// driver's own source for the wiring shape a no-database test cannot reach. The behaviour of each piece is
// proven in src/lib/connections/intersections.test.mjs and write-edges.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "analyze-corpus.mjs"), "utf8");

test("the intersection step runs BEFORE clustering, so themes see intersection edges", () => {
  const ix = SRC.indexOf("detectIntersections(");
  const cluster = SRC.indexOf("clusterGraph(nodes");
  assert.ok(ix > 0, "analyze-corpus calls detectIntersections");
  assert.ok(cluster > 0);
  assert.ok(ix < cluster, "detectIntersections precedes clusterGraph");
  const write = SRC.indexOf("writeIntersectionEdges(");
  assert.ok(write > 0 && write < cluster, "the intersection write precedes clusterGraph");
});

test("dry and apply both run the step; dry is passed through to the writer", () => {
  assert.match(SRC, /writeIntersectionEdges\(DRY \? null : writeClient\(\), intersectionPairs, \{\s*dry: DRY/);
  assert.match(SRC, /intersections\.projected/, "dry clustering reads the projected edge set");
});

test("the item and edge loads carry the columns the detector and the planner need", () => {
  for (const col of ["domain", "priority", "operational_scenario_tags", "compliance_object_tags", "related_items"]) {
    assert.match(SRC, new RegExp(`"id, item_type, [^"]*${col}`), `items select includes ${col}`);
  }
  assert.match(SRC, /"id, source_item_id, target_item_id, relationship, origin, basis, score"/);
});

test("the run ledger row records the intersection counts, on insert and on close-out", () => {
  const hits = SRC.match(/args: \{ dry: false, signals: RUN_SIGNALS, intersections: intersectionCounts \}/g) ?? [];
  assert.equal(hits.length, 2, "both writes of connection_theme_runs.args carry the counts");
});
