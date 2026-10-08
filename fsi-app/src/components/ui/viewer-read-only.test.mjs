// viewer-read-only.test.mjs -- static proof for lane SEC-3b item 6 (migration 370): the write controls of the six
// workspace tables hide for the viewer role. The database half (policies keyed on user_can_write_in_org) is proven by
// supabase/migrations/370_privilege_table_policies.test.mjs and the PROOF-4 attack sec3b-viewer-cannot-write-workspace-tables;
// this file proves the screens that carry a write control read the same role the other role-gated surfaces read
// (useWorkspaceStore userRole) and withhold the control from a viewer. Source text only: no DOM, no npm package.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

const ROLE_READ = /const isViewer = useWorkspaceStore\(\(s\) => s\.userRole\) === "viewer";/;
const STORE_IMPORT = /import \{ useWorkspaceStore \} from "@\/stores\/workspaceStore";/;

const SCREENS = [
  "components/ui/ActionRow.tsx",
  "components/ui/DetailTagRow.tsx",
  "components/ui/WatchButton.tsx",
  "components/regulations/PriorityDropdown.tsx",
  "components/portfolio/PortfolioIndexView.tsx",
  "components/portfolio/PortfolioDetailView.tsx",
];

for (const rel of SCREENS) {
  test(`${rel} reads the viewer role from the workspace store`, () => {
    const t = read(rel);
    assert.match(t, STORE_IMPORT);
    assert.match(t, ROLE_READ);
    assert.match(t, /^"use client";/);
  });
}

test("the + Tag trigger is withheld from a viewer, and a viewer sees applied tags without the remove control", () => {
  const row = read("components/ui/ActionRow.tsx");
  assert.match(row, /const onTag = isViewer \? undefined : onTagProp;/);
  assert.match(row, /\{onTag && \(/);
  assert.match(read("components/ui/DetailTagRow.tsx"), /onRemove=\{\s*isViewer\s*\?\s*undefined/);
});

test("the team watch control is withheld from a viewer; the personal watch stays", () => {
  const t = read("components/ui/WatchButton.tsx");
  assert.match(t, /const teamWritable = teamAvailable && !isViewer;/);
  assert.match(t, /if \(!teamWritable\) return personalButton;/);
  assert.match(t, /if \(!teamWritable\) \{\s*\/\/ And no team control either/);
});

test("the priority and dismiss items are withheld from a viewer, and a viewer with an empty menu gets no kebab", () => {
  const t = read("components/regulations/PriorityDropdown.tsx");
  assert.match(t, /const showPriorityActions = showPriorityActionsProp && !isViewer;/);
  assert.match(t, /if \(isViewer && !menuTopContent && !onArchive\) return null;/);
});

test("the portfolio screens withhold create, add, remove, rename and delete from a viewer", () => {
  const index = read("components/portfolio/PortfolioIndexView.tsx");
  assert.match(index, /\{!isViewer && \(\s*<form/);
  const detail = read("components/portfolio/PortfolioDetailView.tsx");
  assert.match(detail, /isViewer \? undefined : \(\s*<PriorityDropdown/);
  assert.match(detail, /\{!isViewer && \(\s*<RailCard title="Manage">/);
  assert.match(detail, /\{!isViewer && \(\s*<SectionCard>\s*<SectionHeading title="Add to this portfolio"/);
  assert.match(detail, /action=\{isViewer \? undefined/);
});

test("no screen above hides a control for an unknown role: the gate is viewer-only, so a role still loading keeps today's screen", () => {
  for (const rel of SCREENS) assert.doesNotMatch(read(rel), /userRole\s*!==\s*"(member|admin|owner)"/);
});
