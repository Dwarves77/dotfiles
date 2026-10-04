import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCsvLine, splitCsvText } from "./split.mjs";

test("splitCsvLine handles quoted commas and escaped quotes", () => {
  assert.deepEqual(splitCsvLine('a,"b, c","d""e"'), ["a", "b, c", 'd"e']);
});

test("splitCsvText lower-cases headers, strips BOM, skips blank lines", () => {
  const { header, rows } = splitCsvText("﻿A,B\n1,2\n\n3,4\n");
  assert.deepEqual(header, ["a", "b"]);
  assert.deepEqual(rows, [["1", "2"], ["3", "4"]]);
});
