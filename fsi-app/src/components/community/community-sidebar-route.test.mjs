// Regression guard for full-read-audit-2026-08-31.md §2.1: CommunitySidebar linked every
// Starred/Private/Public group row to `/community/groups/${slug}` — a route that does not exist
// (src/app/community/ contains only [slug], browse, moderation). Every click 404'd.
//
// The correct target is `/community/[slug]` (single-group view): its page.tsx resolves the
// `slug` param against `community_groups.slug` — the exact field GroupRow already carries as
// `membership.group.slug` — and every OTHER group link in the codebase already points there
// (GroupCard.tsx, CommunityRooms.tsx, CommunityShell.tsx, CommunitySearchResults.tsx).
//
// Plain text-scan, no JSX import: the discipline test glob runs with no npm deps and this repo
// has no component-render test harness, so this mirrors tier-labels.test.mjs's "no stray
// vocabulary in components" grep-guard rather than rendering the component.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SIDEBAR = resolve(HERE, "CommunitySidebar.tsx");
const GROUP_PAGE = resolve(HERE, "..", "..", "app", "community", "[slug]", "page.tsx");

test("CommunitySidebar group rows link to the real /community/[slug] route, never the 404ing /community/groups/*", () => {
  const src = readFileSync(SIDEBAR, "utf8");
  assert.ok(
    !/\/community\/groups\//.test(src),
    "CommunitySidebar must not link to /community/groups/* — that route does not exist under src/app/community/ (full-read-audit-2026-08-31.md §2.1)"
  );
  assert.match(
    src,
    /href=\{`\/community\/\$\{membership\.group\.slug\}`\}/,
    "GroupRow must link to `/community/${membership.group.slug}` — matching every sibling group link (GroupCard.tsx, CommunityRooms.tsx, CommunityShell.tsx, CommunitySearchResults.tsx)"
  );
});

test("src/app/community/[slug]/page.tsx resolves its param against community_groups.slug (confirms GroupRow's href target is the right route)", () => {
  const src = readFileSync(GROUP_PAGE, "utf8");
  assert.match(
    src,
    /\.from\("community_groups"\)[\s\S]{0,400}\.eq\("slug",\s*slug\)/,
    "[slug] must resolve against community_groups.slug — if this ever changes, CommunitySidebar's link target must be re-verified against it"
  );
});
