// The five list surfaces mount the one workspace-tags hook and feed each row's tags to the row (lane TESTS-2, 2026-10-10;
// docs/ops/session-log.d/2026-10-07-s8b-tag-attribution.md "NOT done": the five ledgers' own row smokes do not mount the tags hook).
//
// useWorkspaceTagsFacet is "the one hook behind the Workspace tags facet group on all five list surfaces". The browser proof that a
// real hook renders real chips on a real row lives in workspace-tags-smoke.mjs; what no gate checked is that EACH of the five
// surfaces still mounts that hook, narrows its rows with matchesSelectedTag, and hands tagsForItem(row id) to the row. A surface
// that silently dropped one of the three would show no tag chips and no tag facet, with every other check green (the TAGS-401
// defect class: a dead tags path fails soft). Static, so it needs no browser and no install; it reads the five source files.
//
// Attacked on a synthetic surface first (each of the three wirings removed in turn), then run on the real five.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FSI_APP = resolve(import.meta.dirname, '..', '..', '..');

export const SURFACES = Object.freeze([
  ['Regulations', 'src/components/regulations/RegulationsLedger.tsx'],
  ['Market Intel', 'src/components/market/MarketIntelLedger.tsx'],
  ['Research', 'src/components/research/ResearchLedger.tsx'],
  ['Operations', 'src/components/operations/OperationsLedger.tsx'],
  ['Watchlist', 'src/components/watchlist/WatchlistSurface.tsx'],
]);

/** PURE. The wiring problems of one surface's source text; an empty list is a fully wired surface. */
export function tagWiringProblems(text) {
  const out = [];
  if (!/import \{ useWorkspaceTagsFacet \} from "@\/lib\/tags\/useWorkspaceTagsFacet";/.test(text)) out.push('does not import useWorkspaceTagsFacet');
  if (!/=\s*useWorkspaceTagsFacet\(\)/.test(text)) out.push('never calls useWorkspaceTagsFacet()');
  if (!/matchesSelectedTag\(/.test(text)) out.push('never narrows rows with matchesSelectedTag');
  if (!/(tagsFacet\.tagsForItem|tagsForItem)\([\w.]+\.id\)/.test(text)) out.push('never passes tagsForItem(<row>.id) to a row');
  if (!/tagsFacet\.tags\.map\(/.test(text)) out.push('never builds the Workspace tags facet options from tagsFacet.tags');
  return out;
}

const WIRED = `import { useWorkspaceTagsFacet } from "@/lib/tags/useWorkspaceTagsFacet";
const tagsFacet = useWorkspaceTagsFacet();
const rows = all.filter((r) => tagsFacet.matchesSelectedTag(r.id));
const options = tagsFacet.tags.map((t) => t);
const row = { tags: tagsFacet.tagsForItem(r.id) };
`;

test('the scanner passes a fully wired surface and names each wiring that is removed (attack on the attacker)', () => {
  assert.deepEqual(tagWiringProblems(WIRED), []);
  const cases = [
    ['import { useWorkspaceTagsFacet } from "@/lib/tags/useWorkspaceTagsFacet";\n', 'does not import'],
    ['const tagsFacet = useWorkspaceTagsFacet();\n', 'never calls'],
    ['const rows = all.filter((r) => tagsFacet.matchesSelectedTag(r.id));\n', 'never narrows'],
    ['const row = { tags: tagsFacet.tagsForItem(r.id) };\n', 'never passes tagsForItem'],
    ['const options = tagsFacet.tags.map((t) => t);\n', 'never builds the Workspace tags facet'],
  ];
  for (const [line, want] of cases) {
    const problems = tagWiringProblems(WIRED.replace(line, ''));
    assert.ok(problems.some((p) => p.startsWith(want)), `${want}: ${problems.join('; ')}`);
  }
});

for (const [name, rel] of SURFACES) {
  test(`${name} mounts the workspace tags hook, narrows by the selected tag, fills the facet and feeds each row its tags`, () => {
    assert.deepEqual(tagWiringProblems(readFileSync(resolve(FSI_APP, rel), 'utf8')), [], `${rel} has lost a tags wiring`);
  });
}

test('the hook still names itself the one hook behind all five list surfaces, so a sixth caller or a fork is noticed', () => {
  const hook = readFileSync(resolve(FSI_APP, 'src/lib/tags/useWorkspaceTagsFacet.ts'), 'utf8');
  assert.match(hook, /the one hook behind the "Workspace tags" facet/);
  assert.match(hook, /all five list surfaces/);
  assert.match(hook, /authedFetch/, 'the hook reads through the authenticated fetcher (TAGS-401)');
});
