// Structural regression test for src/components/ui/WatchButton.tsx (L6,
// Defect 1). WatchButton's `itemType` prop used to be a LOCALLY HARDCODED
// 5-value copy of the union whose real home is WatchlistItemType in
// src/lib/supabase-server.ts — a duplicate that drifted the moment
// market_series (WO-23, a 6th value) was added, because nothing tied the
// button's literal union to the vocabulary's real definition. This is
// exactly the class of defect WatchlistItemType's own doc comment already
// records happening once with Landing B ("silently labelled every watched
// research finding a 'Signal'").
//
// WHY A TEXT-LEVEL TEST. `itemType`'s type is compile-time-only — TypeScript
// erases it, so there is no runtime value to assert against, and this repo
// has no JSX test infrastructure (no .test.tsx anywhere, confirmed by grep
// this session) to mount the component and probe its prop types either.
// `npx tsc --noEmit` (already in the required CI-equivalent gate) is the
// authoritative type check that WatchButton actually compiles against the
// full WatchlistItemType union; this test is the narrower, faster regression
// guard that catches the SPECIFIC anti-pattern (a re-hardcoded literal union
// creeping back in) by reading the component's own source text — it fails if
// the file stops importing the shared type, or if an inline string-literal
// union for itemType reappears, even before a `tsc` run would.
//
// THIS FILE IS RED against the pre-L6 WatchButton.tsx: the file read at HEAD
// before this lane's fix defines `itemType: "source" | "reg" | "signal" |
// "research" | "operations";` inline (5 values, no market_series, no import
// of WatchlistItemType) — confirmed by hand this session (see report).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "WatchButton.tsx"),
  "utf8"
);

test("WatchButton imports WatchlistItemType from the shared vocabulary home rather than declaring its own", () => {
  assert.match(
    SOURCE,
    /import\s+type\s*\{\s*WatchlistItemType\s*\}\s*from\s*["']@\/lib\/data["']/,
    "expected a type-only import of WatchlistItemType from @/lib/data (the same precedent watchlist-links.ts already uses), so WatchButton can never drift from the real union again"
  );
});

test("the itemType prop is typed as WatchlistItemType, not an inline hardcoded literal union", () => {
  assert.match(
    SOURCE,
    /itemType\s*:\s*WatchlistItemType\s*;/,
    "expected `itemType: WatchlistItemType;` on the props type"
  );
});

test("no re-hardcoded 5-or-6-value literal union for itemType survives in the source (the exact regression this test guards)", () => {
  // Matches the shape `itemType: "source" | "reg" | ...` — an inline string-literal
  // union assigned directly to itemType, which is what the pre-fix file contained.
  assert.doesNotMatch(
    SOURCE,
    /itemType\s*:\s*"[a-z_]+"\s*\|/,
    "itemType must not be a locally hardcoded string-literal union — import WatchlistItemType instead"
  );
});

test("market_series is not silently missing: the file does not carry a narrower 5-value comment/list that excludes it", () => {
  // Weak but real signal: if a narrower union crept back in, it necessarily would
  // not mention market_series inline (since the whole point of the union is that
  // TypeScript, not this file, enumerates the values). This just confirms the
  // string 'market_series' isn't the ONLY thing missing from an otherwise-present
  // hardcoded list — i.e. that no hardcoded list is present at all (already proven
  // above), stated here as an explicit belt-and-suspenders check on the literal
  // pattern the WO-23 drift actually took.
  assert.doesNotMatch(SOURCE, /"source"\s*\|\s*"reg"\s*\|\s*"signal"/);
});
