// cited-item-links.ts (DFIX-1, 2026-10-08, row 05-p2): a cited item links to its own surface's detail page, by the
// UI id (legacy id when it has one), never to a guessed route. Real module through jiti with the app alias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false, alias: { "@": resolve(ROOT, "src") } });
const { citedItemsWithHrefs } = await jiti.import("./cited-item-links.ts");

test("each cited item keeps its id and title and gets the detail href of the surface its type routes to", () => {
  const out = citedItemsWithHrefs([
    { id: "u-reg", legacy_id: "eu-ppwr", title: "Packaging regulation", item_type: "regulation", domain: 1 },
    { id: "u-mkt", legacy_id: null, title: "Carbon price signal", item_type: "market_signal", domain: null },
  ]);
  assert.deepEqual(out.map((o) => [o.id, o.title]), [["u-reg", "Packaging regulation"], ["u-mkt", "Carbon price signal"]]);
  assert.equal(out[0].href, "/regulations/eu-ppwr", "legacy id is the UI id");
  assert.equal(out[1].href, "/market/u-mkt", "no legacy id: the uuid, on the market surface");
});

test("an empty list maps to an empty list", () => {
  assert.deepEqual(citedItemsWithHrefs([]), []);
});
