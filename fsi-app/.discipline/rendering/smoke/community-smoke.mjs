// UX smoke spec: Community surface (Lane COMMUNITY-B, wave3, 2026-09-03). Mounts the REAL
// `src/components/community/PostList.tsx` (which itself mounts the real `Post.tsx` for every post,
// `PostComposer.tsx` — with the real `EntityPicker.tsx` — for group members, and `PromotePostButton`
// / `PromotePostDialog` for a post's own promote control) and the REAL
// `src/components/shared/PeersDiscussingStrip.tsx`, exactly as the wave3 dispatch requires ("mounting
// the REAL PostList and Post plus your composer/strip"). Built on `ux-harness.mjs`'s `runUxSpec` for
// the standard guard+UX measurement across states (F35 `row-ux-coverage`'s coverage requirement:
// PostList.tsx and Post.tsx are both in `ROW_COMPONENTS`), plus a handful of custom interaction
// proofs (guard refusal + draft preservation, pagination, the strip's "renders nothing" contract)
// built directly on `harness.mjs`'s lower-level primitives — the same posture list-order-smoke.mjs and
// notifications-smoke.mjs use for their own click-fire proofs.
//
// SUPERSEDES fixtures-community/ (deleted this commit). That directory hand-reproduced the exact
// same three components' markup as static HTML pairs (a GREEN "has the overflow-safety CSS" fixture
// and a RED "doesn't" sibling) to prove the layout contract without a real render. This spec proves
// the same defect class — unbounded, entity/DB-sourced text (a pseudonymous identity line, an
// entity's canonical_name, a thread title) inside a CSS flex row — against the REAL mounted
// component instead, which is strictly stronger evidence (a hand-reproduction can silently drift from
// the component it was copied from; a real mount cannot). See EXTREME_* below for the same
// unbroken-token stress case the deleted fixtures used.
//
// TWO ENTRY PAGES, not one. `runUxSpec` hardcodes its mount call to `window.__mount(...)`
// (ux-harness.mjs), so one spec object can only ever define one entry/mount function; PostList and
// PeersDiscussingStrip are mounted by two different entry pages accordingly (ENTRY_POSTLIST,
// ENTRY_PEERS), and this file's exported `runSmoke` sums every call's `{checks, failures}` — one
// `runUxSpec` call (the async-fetch-in-flight "loading" placeholder measurement) plus several
// `settledContentProof` calls (the real, loaded-content measurement `runUxSpec` alone can't reach —
// see that function's own header) plus the custom interaction proofs below it.
//
// ALIAS NOTES.
//   `@/components/community/community.css` -> stub-community-css.mjs: Post.tsx and
//   EntityDiscoveryPanel.tsx import this file (the mobile-rule `.cl-comm-row`/`.cl-comm-row-aside`
//   stacking rules) via the `@/` form specifically so it CAN be aliased here — esbuild's plain
//   `write:false` bundle (harness.mjs's `bundleEntry`, coordinator-owned, not this lane's to edit) has
//   no `outdir` configured, so bundling a real `.css` import is a build error ("Cannot import ...
//   without an output path configured"), and esbuild's `alias` option only accepts bare/`@/`-style
//   specifiers, not relative `./...` paths (a relative alias key is itself a build error: "Invalid
//   alias name") — both confirmed empirically while building this spec (see this lane's report). The
//   real Next.js app bundles the CSS file natively regardless; only this esbuild-CLI harness needs
//   the stand-in.
//   `next/navigation` -> stub-next-navigation.mjs: PostComposer.tsx (EntityPicker's search
//   round-trip) and PromotePostDialog.tsx (mounted transitively via Post.tsx's PromotePostButton) call
//   `useRouter`/`usePathname`/`useSearchParams`, which throw ("invariant expected app router to be
//   mounted") outside a real Next App Router tree — same rationale as harness.mjs's own
//   stub-next-link.mjs/stub-supabase-browser.mjs.

import { fileURLToPath } from "node:url";
import {
  bundleEntry,
  newSmokePage,
  mountBundle,
  measureGuard,
  assertGuardClean,
} from "./harness.mjs";
import { runUxSpec, MOBILE_VIEWPORT, DESKTOP_VIEWPORT } from "./ux-harness.mjs";
import { measureUx, assertUxClean } from "../ux-assert.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ALIAS = {
  "@/components/community/community.css": `${HERE}stub-community-css.mjs`,
  "next/navigation": `${HERE}stub-next-navigation.mjs`,
};

// A single unbroken ~100-char token — the extreme-data case a free-text sector/org-type field, an
// entity canonical_name (a corridor's via-list), or a member-authored title could plausibly produce,
// with no natural break point (unlike normal prose, which wraps at spaces regardless of
// overflow-wrap). Same stress case the deleted fixtures-community/ fixtures.mjs used.
const LONG_UNBROKEN =
  "freightforwarderaffiliationtypewithnowhitespaceatallandnomeaningfulbreakpointforawrappingengine1234567890";

function author(overrides = {}) {
  return {
    orgType: "Freight forwarder",
    role: "Trade lane manager",
    sector: "Apparel",
    region: "EU",
    verified: true,
    ...overrides,
  };
}

function post(overrides = {}) {
  return {
    id: "post-1",
    group_id: "group-1",
    parent_post_id: null,
    author_user_id: "user-1",
    author: { user_id: "user-1", name: "A. Member", headshot_url: null },
    title: "SAF premium creeping up on EU-US air lanes this quarter",
    body: "Seeing a step change on bunker pass-through this quarter across three separate carriers.",
    created_at: "2026-08-01T00:00:00.000Z",
    last_reply_at: "2026-08-20T00:00:00.000Z",
    reply_count: 4,
    attribution: null,
    promoted_from_post_id: null,
    promotion_state: "community-corroborated",
    origin_class: "community-corroborated",
    author_identity: author(),
    evidence_chip: "3 mo old · 80% weight",
    ...overrides,
  };
}

function extremePosts(n) {
  return Array.from({ length: n }, (_, i) => {
    const legacy = i % 4 === 0; // a mix of legacy (no wave3 fields) and entity-bound posts
    return post({
      id: `post-${i}`,
      title: `${LONG_UNBROKEN} extreme-data post title #${i}`,
      author: { user_id: `user-${i}`, name: `Member ${i}`, headshot_url: null },
      author_user_id: `user-${i}`,
      promotion_state: legacy ? undefined : ["community", "community-corroborated", "under-review", "verified"][i % 4],
      origin_class: legacy ? undefined : ["community", "community-corroborated", "under-review", "verified"][i % 4],
      author_identity: legacy
        ? undefined
        : author({ orgType: LONG_UNBROKEN, sector: "Electronics & apparel logistics" }),
      evidence_chip: legacy ? undefined : `${i} mo old · ${100 - i}% weight`,
      reply_count: i,
    });
  });
}

const CANDIDATE_ENTITIES = [
  { entity_id: "cl:corridor:1", kind: "corridor", canonical_name: "Shanghai to Rotterdam, ocean" },
  { entity_id: "cl:jurisdiction:eu", kind: "jurisdiction", canonical_name: "European Union" },
  {
    entity_id: "cl:corridor:2",
    kind: "corridor",
    canonical_name: `${LONG_UNBROKEN} to Rotterdam via Suez, ocean`,
  },
];

// ── /api/community/posts + /api/community/threads/[id]/corroboration route stub ──────────────────
function postsApiRoutes({ posts, nextCursor = null, onPost, corroboration } = {}) {
  return [
    {
      urlGlob: "**/api/community/posts**",
      handler: (route) => {
        const req = route.request();
        const { pathname, searchParams } = new URL(req.url());
        if (req.method() === "POST" && /\/api\/community\/posts$/.test(pathname)) {
          return onPost ? onPost(route) : route.fulfill({ json: { post: {} } });
        }
        if (req.method() === "GET" && /\/api\/community\/posts$/.test(pathname)) {
          if (searchParams.get("before")) {
            return route.fulfill({ json: { posts: [], next_cursor: null } });
          }
          return route.fulfill({ json: { posts: posts ?? [], next_cursor: nextCursor } });
        }
        // /replies, /promote, unrecognized — fulfil empty rather than let it fall through to a real
        // network request against the fake origin (which would hang/error, not "do nothing").
        return route.fulfill({ json: {} });
      },
    },
    {
      urlGlob: "**/api/community/threads/*/corroboration",
      handler: (route) =>
        route.fulfill({
          json: corroboration ?? { thread_id: "any", organisations: 4, posts: 6, consistent: true },
        }),
    },
  ];
}

// ── PostList entry ─────────────────────────────────────────────────────────────────────────────
const ENTRY_POSTLIST = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PostList } from '@/components/community/PostList';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(PostList, props));
};
`;

function postListProps(overrides = {}) {
  return {
    groupId: "group-1",
    currentUserId: "user-1",
    isGroupMember: true,
    isGroupAdmin: false,
    candidateEntities: CANDIDATE_ENTITIES,
    ...overrides,
  };
}

// ── Post entry (coordinator, integration 2026-09-03): F35's coverage check is a DIRECT import match
//    (a spec that imports PostList covers PostList; Post is rendered by it but not named), so Post is
//    mounted standalone here with an explicit corroboration prop (no self-fetch) in one, extreme states. ──
const ENTRY_POST = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Post } from '@/components/community/Post';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement('div', { 'data-guard-container': 'post-standalone', style: { maxWidth: '100%' } }, React.createElement(Post, props)));
};
`;

function postProps(overrides = {}) {
  return {
    post: post(),
    currentUserId: "user-1",
    isGroupAdmin: false,
    isGroupMember: true,
    authorIdentity: author(),
    promotionState: "community-corroborated",
    originClass: "community-corroborated",
    corroboration: { thread_id: "post-1", organisations: 3, posts: 4, consistent: true },
    ...overrides,
  };
}

// ── PeersDiscussingStrip entry ─────────────────────────────────────────────────────────────────
const ENTRY_PEERS = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PeersDiscussingStrip } from '@/components/shared/PeersDiscussingStrip';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(PeersDiscussingStrip, props));
};
`;

function threadsApiRoute(threads) {
  return {
    urlGlob: "**/api/community/entities/*/threads**",
    handler: (route) =>
      route.fulfill({ json: { entity_id: "cl:corridor:1", threads, next_cursor: null } }),
  };
}

function thread(overrides = {}) {
  return {
    id: "thread-1",
    group_id: "group-1",
    title: `${LONG_UNBROKEN} SAF premium creeping up on this corridor this quarter`,
    body: "Seeing a step change on bunker pass-through this quarter.",
    author_user_id: "user-1",
    created_at: "2026-08-01T00:00:00.000Z",
    last_reply_at: "2026-08-20T00:00:00.000Z",
    reply_count: 4,
    promotion_state: "community-corroborated",
    origin_class: "community-corroborated",
    entity_id: "cl:corridor:1",
    entity_kind: "corridor",
    author_identity: author(),
    evidence_chip: "3 mo old · 80% weight",
    ...overrides,
  };
}

// ── custom interaction proofs (outside runUxSpec — same posture as list-order-smoke.mjs /
// notifications-smoke.mjs's own click-fire blocks) ─────────────────────────────────────────────

const GUARD_REFUSAL = {
  error:
    "This field is commercially sensitive and has fewer than five contributors this quarter. Refused at write time.",
  aggregate_route: { instrumentKey: "saf-premium-eu-us-air-2026q3", pending: true },
};

/** Antitrust guard refusal (spec 05 §1, §5 component 12) + draft preservation (UX law 15). Types a
 * title/body, binds an entity, submits, and asserts: the refusal explanation renders, the aggregate
 * route is offered, and the composer's own inputs (title/body/entity) still hold what was typed —
 * "explain what went wrong... offer... preserve the reader's input" is not provable by reading
 * source; it has to be watched happen against the real DOM. */
async function refusalAndDraftPreservationProof(browser, bundleJs) {
  const failures = [];
  let checks = 0;
  const page = await newSmokePage(browser, {
    apiRoutes: postsApiRoutes({
      posts: [],
      onPost: (route) => route.fulfill({ status: 403, json: GUARD_REFUSAL }),
    }),
  });
  try {
    await mountBundle(page, bundleJs, "__mount", postListProps());
    await page.waitForTimeout(150);

    await page.fill("#post-title", "SAF premium on EU-US air");
    await page.fill("#post-body", "We are seeing $2.10/kg this quarter.");
    await page.fill("#post-sensitivity-field", "saf_premium_usd_per_kg");
    // Bind an entity so the client-side guard doesn't refuse before the network round-trip.
    await page.fill("#entity-picker-search", "Shanghai");
    await page.waitForTimeout(80);
    const candidate = await page.$('#smoke-root ul button:has-text("Shanghai")');
    checks++;
    if (!candidate) {
      failures.push("refusal-proof: entity candidate did not render in the picker dropdown.");
    } else {
      await candidate.click();
    }

    const submit = await page.$('form[aria-label="New post"] button[type="submit"]');
    checks++;
    if (!submit) {
      failures.push("refusal-proof: submit button is missing.");
      return { checks, failures };
    }
    await submit.click();
    await page.waitForTimeout(300);

    const alertText = await page.textContent('[role="alert"]');
    checks++;
    if (!alertText || !alertText.includes(GUARD_REFUSAL.error)) {
      failures.push(
        `refusal-proof: guard refusal message did not render (got: ${JSON.stringify(alertText)}).`
      );
    }
    checks++;
    const aggregateLink = await page.$('a[href="/community/benchmarks"]');
    if (!aggregateLink) {
      failures.push("refusal-proof: the aggregate-only route was not offered on refusal.");
    }

    // Draft preservation (law 15): title/body/entity must still be present, never cleared on refusal.
    const titleVal = await page.inputValue("#post-title");
    const bodyVal = await page.inputValue("#post-body");
    checks++;
    if (titleVal !== "SAF premium on EU-US air" || bodyVal !== "We are seeing $2.10/kg this quarter.") {
      failures.push(
        `refusal-proof: composer draft was NOT preserved after refusal (title=${JSON.stringify(titleVal)}, body=${JSON.stringify(bodyVal)}).`
      );
    }
    const entityChip = await page.$('#smoke-root span:has-text("Shanghai")');
    checks++;
    if (!entityChip) {
      failures.push("refusal-proof: the bound entity chip was cleared after refusal (should be preserved).");
    }

    failures.push(...assertGuardClean("community-postlist[refusal]", await measureGuard(page)));
  } finally {
    await page.close();
  }
  return { checks, failures };
}

/** "Load older posts" pagination (spec 05 §5 component 2's feed carried forward from Phase C) —
 * click-fire proof that the cursor round-trip actually swaps the button to its loading state and
 * back, not just that the handler exists. */
async function paginationProof(browser, bundleJs) {
  const failures = [];
  let checks = 0;
  const page = await newSmokePage(browser, {
    apiRoutes: postsApiRoutes({ posts: [post()], nextCursor: "2026-08-01T00:00:00.000Z" }),
  });
  try {
    await mountBundle(page, bundleJs, "__mount", postListProps());
    await page.waitForTimeout(150);

    const loadOlder = await page.$('button:has-text("Load older posts")');
    checks++;
    if (!loadOlder) {
      failures.push("pagination-proof: 'Load older posts' control did not render with a next_cursor.");
      return { checks, failures };
    }
    await loadOlder.click();
    await page.waitForTimeout(250);
    const stillThere = await page.$('button:has-text("Load older posts")');
    checks++;
    // The stubbed second page has next_cursor:null, so the button must be GONE after the load — its
    // disappearance is the observable proof the click actually round-tripped and updated state.
    if (stillThere) {
      failures.push("pagination-proof: 'Load older posts' click did not clear the cursor (button still renders after the last page).");
    }
  } finally {
    await page.close();
  }
  return { checks, failures };
}

/**
 * Guard + UX measurement of PostList's SETTLED content (after its own async
 * `GET /api/community/posts` resolves), at both viewports — `runUxSpec` measures one animation
 * frame after mount (ux-harness.mjs), which is enough for a purely prop-driven row component but not
 * for PostList, which fetches its own data; the "one-row"/"extreme" runUxSpec calls above therefore
 * only ever observe the brief "Loading posts…" placeholder, not the real post content those states
 * exist to stress. This proof mounts the same bundle, waits for the fetch to genuinely settle, then
 * runs the SAME detectors (`measureGuard`/`assertGuardClean`, `measureUx`/`assertUxClean`) `runUxSpec`
 * itself is built from (ux-harness.mjs imports both from the same two modules this file does) against
 * the real, loaded DOM — the actual defect class fixtures-community/ used to hand-reproduce (see this
 * file's header), now proven against a real mount instead. */
async function settledContentProof(browser, bundleJs, { apiRoutes, props, expectTitles, label }) {
  const failures = [];
  let checks = 0;
  for (const vp of [MOBILE_VIEWPORT, DESKTOP_VIEWPORT]) {
    const page = await newSmokePage(browser, { apiRoutes });
    try {
      await page.setViewportSize(vp);
      await mountBundle(page, bundleJs, "__mount", props);
      await page.waitForTimeout(350); // let the mocked GET (real IPC round-trip) and re-render settle
      checks++;
      failures.push(...assertGuardClean(`${label}@${vp.width}`, await measureGuard(page)));
      checks++;
      failures.push(...assertUxClean(`${label}@${vp.width}`, await measureUx(page)));
      const titles = await page.$$("[data-guard-title]");
      checks++;
      if (titles.length < expectTitles) {
        failures.push(
          `${label}@${vp.width}: expected ≥${expectTitles} [data-guard-title] element(s) once settled, found ${titles.length}.`
        );
      }
    } finally {
      await page.close();
    }
  }
  return { checks, failures };
}

/** PeersDiscussingStrip's "renders nothing" contract (wave3 dispatch: "renders nothing (no empty
 * box) when there are no threads") — proven for both the no-entity and the zero-threads case, since
 * neither is provable by `runUxSpec`'s guard/UX measurement alone (an empty page has nothing to
 * measure either way; this asserts the page really is empty, not merely defect-free). */
async function stripRendersNothingProof(browser, bundleJs) {
  const failures = [];
  let checks = 0;

  for (const [label, props, apiRoutes] of [
    ["no-entity", { entityId: null }, []],
    ["zero-threads", { entityId: "cl:corridor:1" }, [threadsApiRoute([])]],
  ]) {
    const page = await newSmokePage(browser, { apiRoutes });
    try {
      await mountBundle(page, bundleJs, "__mount", props);
      await page.waitForTimeout(200);
      const text = (await page.textContent("body"))?.trim() ?? "";
      checks++;
      if (text.length > 0) {
        failures.push(
          `strip-empty-proof[${label}]: expected no visible text (renders nothing), found ${JSON.stringify(text.slice(0, 80))}.`
        );
      }
      const section = await page.$('section[aria-label="Peers are discussing this"]');
      checks++;
      if (section) {
        failures.push(`strip-empty-proof[${label}]: the strip's section element rendered when it should not have.`);
      }
    } finally {
      await page.close();
    }
  }
  return { checks, failures };
}

// ── Lane COMMUNITY-C additions (2026-09-03): the benchmark response form (BenchmarksPanel.tsx) and
// the self-service profile page (ProfileForm.tsx) — the write path this dispatch names as the gap
// ("no write path for community_benchmark_responses / organisation_key derivation"). Neither
// component imports community.css or next/navigation, so ALIAS above is unused by these two entries;
// neither imports @/lib/supabase-browser either (both talk to the API only through api-client.ts's
// fetch wrappers), so no extra alias is needed beyond harness.mjs's own DEFAULT_ALIAS.

const ENTRY_BENCHMARKS = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BenchmarksPanel } from '@/components/community/BenchmarksPanel';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(BenchmarksPanel));
};
`;

const ENTRY_PROFILE = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProfileForm } from '@/components/community/ProfileForm';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(ProfileForm));
};
`;

function openBenchmark(overrides = {}) {
  return {
    key: "saf-premium-air-2026-q3",
    title: "SAF premium on air lanes — 2026-q3",
    question: "What sustainable-aviation-fuel premium are you seeing on your air freight lanes this quarter?",
    field_key: "saf_premium_pct",
    unit: "%",
    sector_profile: null,
    region: "GLOBAL",
    calendar_cycle: "quarterly",
    opens_at: "2026-07-01T00:00:00.000Z",
    closes_at: "2026-09-30T00:00:00.000Z",
    period_end: "2026-06-30",
    status: "open",
    aggregate: {
      publishable: false,
      value: null,
      distinct_organisations: 3,
      min_contributors: 5,
      response_count: 4,
      reason: "not yet publishable: k-anonymity (3/5 organisations)",
    },
    ...overrides,
  };
}

function benchmarksApiRoutes({ benchmarks = [openBenchmark()], onRespond } = {}) {
  return [
    {
      urlGlob: "**/api/community/benchmarks/current",
      handler: (route) => route.fulfill({ json: { benchmarks } }),
    },
    {
      urlGlob: "**/api/community/benchmarks/*/respond",
      handler: (route) => (onRespond ? onRespond(route) : route.fulfill({ json: { accepted: false, error: "no handler" } })),
    },
  ];
}

/** BenchmarksPanel, settled (its GET fetches on mount — same async-first-paint reasoning as PostList
 * above): guard + UX clean at both viewports, with the response form's [data-guard-title] present. */
async function benchmarksSettledProof(browser, bundleJs) {
  const failures = [];
  let checks = 0;
  for (const vp of [MOBILE_VIEWPORT, DESKTOP_VIEWPORT]) {
    const page = await newSmokePage(browser, { apiRoutes: benchmarksApiRoutes() });
    try {
      await page.setViewportSize(vp);
      await mountBundle(page, bundleJs, "__mount");
      await page.waitForTimeout(300);
      checks++;
      failures.push(...assertGuardClean(`community-benchmarks[open]@${vp.width}`, await measureGuard(page)));
      checks++;
      failures.push(...assertUxClean(`community-benchmarks[open]@${vp.width}`, await measureUx(page)));
      const titles = await page.$$("[data-guard-title]");
      checks++;
      if (titles.length < 1) {
        failures.push(`community-benchmarks[open]@${vp.width}: expected >=1 [data-guard-title], found ${titles.length}`);
      }
      const form = await page.$('form[aria-label^="Submit your value for"]');
      checks++;
      if (!form) {
        failures.push(`community-benchmarks[open]@${vp.width}: response form did not render for an open instrument`);
      }
    } finally {
      await page.close();
    }
  }
  return { checks, failures };
}

/** Response form refusal (unverified) — law 15: the entered value is preserved, the refusal names the
 * fix, and a link to /community/profile is offered. */
async function benchmarkResponseRefusalProof(browser, bundleJs) {
  const failures = [];
  let checks = 0;
  const page = await newSmokePage(browser, {
    apiRoutes: benchmarksApiRoutes({
      onRespond: (route) =>
        route.fulfill({
          status: 403,
          json: { error: "unverified: verify a corporate email first", verify_url: "/community/profile" },
        }),
    }),
  });
  try {
    await mountBundle(page, bundleJs, "__mount");
    await page.waitForTimeout(300);

    const input = await page.$("#benchmark-response-saf-premium-air-2026-q3");
    checks++;
    if (!input) {
      failures.push("refusal-proof: response input did not render.");
      return { checks, failures };
    }
    await input.fill("4.5");
    const submit = await page.$('form[aria-label^="Submit your value for"] button[type="submit"]');
    checks++;
    if (!submit) {
      failures.push("refusal-proof: submit button is missing.");
      return { checks, failures };
    }
    await submit.click();
    await page.waitForTimeout(300);

    const alertText = await page.textContent('[role="alert"]');
    checks++;
    if (!alertText || !alertText.includes("verify a corporate email first")) {
      failures.push(`refusal-proof: refusal message did not render (got ${JSON.stringify(alertText)}).`);
    }
    const verifyLink = await page.$('a[href="/community/profile"]');
    checks++;
    if (!verifyLink) {
      failures.push("refusal-proof: the verify-profile link was not offered on refusal.");
    }
    const preserved = await input.inputValue();
    checks++;
    if (preserved !== "4.5") {
      failures.push(`refusal-proof: entered value was not preserved after refusal (got ${JSON.stringify(preserved)}).`);
    }
  } finally {
    await page.close();
  }
  return { checks, failures };
}

/** Response form acceptance — success shows the organisation count, NEVER a value (spec 05 §1). */
async function benchmarkResponseAcceptedProof(browser, bundleJs) {
  const failures = [];
  let checks = 0;
  const page = await newSmokePage(browser, {
    apiRoutes: benchmarksApiRoutes({
      onRespond: (route) =>
        route.fulfill({
          status: 201,
          json: {
            accepted: true,
            aggregate: {
              publishable: false,
              value: null,
              distinct_organisations: 4,
              min_contributors: 5,
              response_count: 5,
              reason: "not yet publishable: k-anonymity (4/5 organisations)",
            },
          },
        }),
    }),
  });
  try {
    await mountBundle(page, bundleJs, "__mount");
    await page.waitForTimeout(300);
    const input = await page.$("#benchmark-response-saf-premium-air-2026-q3");
    checks++;
    if (!input) {
      failures.push("accepted-proof: response input did not render.");
      return { checks, failures };
    }
    await input.fill("4.5");
    await page.click('form[aria-label^="Submit your value for"] button[type="submit"]');
    await page.waitForTimeout(300);

    const status = await page.textContent('[role="status"]');
    checks++;
    if (!status || !status.includes("counted") || !status.includes("4 of 5")) {
      failures.push(`accepted-proof: success message did not render the organisation count (got ${JSON.stringify(status)}).`);
    }
    checks++;
    if (status && status.includes("4.5")) {
      failures.push("accepted-proof: success message must never echo the submitted value (spec 05 §1).");
    }
  } finally {
    await page.close();
  }
  return { checks, failures };
}

// ── ProfileForm ────────────────────────────────────────────────────────────────────────────────

function profileApiRoutes({ profile, onVerify, onSave } = {}) {
  return [
    {
      urlGlob: "**/api/community/profile",
      handler: (route) => {
        const req = route.request();
        if (req.method() === "GET") {
          return route.fulfill({ json: { profile: profile ?? unverifiedProfile() } });
        }
        if (req.method() === "PUT") {
          return onSave ? onSave(route) : route.fulfill({ json: { profile: profile ?? unverifiedProfile() } });
        }
        return route.fulfill({ json: {} });
      },
    },
    {
      urlGlob: "**/api/community/profile/verify",
      handler: (route) => (onVerify ? onVerify(route) : route.fulfill({ status: 500, json: { error: "no handler" } })),
    },
  ];
}

function unverifiedProfile(overrides = {}) {
  return {
    orgType: null, role: null, sector: null, region: null,
    verified: false, verifiedAt: null, verificationMethod: null,
    ...overrides,
  };
}

function verifiedProfile(overrides = {}) {
  return {
    orgType: "forwarder", role: "Trade lane manager", sector: "cold-chain", region: "EU",
    verified: true, verifiedAt: "2026-08-01T00:00:00.000Z", verificationMethod: "corporate-email",
    ...overrides,
  };
}

/** ProfileForm, settled, both the unverified and verified states, both viewports — guard + UX clean,
 * with the two section headings' [data-guard-title] present. */
async function profileSettledProof(browser, bundleJs) {
  const failures = [];
  let checks = 0;
  for (const [label, profile] of [["unverified", unverifiedProfile()], ["verified", verifiedProfile()]]) {
    for (const vp of [MOBILE_VIEWPORT, DESKTOP_VIEWPORT]) {
      const page = await newSmokePage(browser, { apiRoutes: profileApiRoutes({ profile }) });
      try {
        await page.setViewportSize(vp);
        await mountBundle(page, bundleJs, "__mount");
        await page.waitForTimeout(300);
        checks++;
        failures.push(...assertGuardClean(`community-profile[${label}]@${vp.width}`, await measureGuard(page)));
        checks++;
        failures.push(...assertUxClean(`community-profile[${label}]@${vp.width}`, await measureUx(page)));
        const titles = await page.$$("[data-guard-title]");
        checks++;
        if (titles.length < 2) {
          failures.push(`community-profile[${label}]@${vp.width}: expected >=2 [data-guard-title] (declare + verify sections), found ${titles.length}`);
        }
      } finally {
        await page.close();
      }
    }
  }
  return { checks, failures };
}

/** Verify action success — the pending state (law 6) then a visible verified confirmation. */
async function profileVerifySuccessProof(browser, bundleJs) {
  const failures = [];
  let checks = 0;
  const page = await newSmokePage(browser, {
    apiRoutes: profileApiRoutes({
      profile: unverifiedProfile({ orgType: "forwarder" }),
      onVerify: (route) => route.fulfill({ json: { profile: verifiedProfile() } }),
    }),
  });
  try {
    await mountBundle(page, bundleJs, "__mount");
    await page.waitForTimeout(300);
    const verifyBtn = await page.$('button:has-text("Verify")');
    checks++;
    if (!verifyBtn) {
      failures.push("verify-proof: Verify button did not render for an unverified profile.");
      return { checks, failures };
    }
    await verifyBtn.click();
    await page.waitForTimeout(300);
    const bodyText = (await page.textContent("body")) ?? "";
    checks++;
    if (!bodyText.includes("Verified via corporate email")) {
      failures.push("verify-proof: verified confirmation did not render after a successful verify.");
    }
  } finally {
    await page.close();
  }
  return { checks, failures };
}

/** Save-profile error — law 15: form values are preserved, the error names what to fix. */
async function profileSaveErrorProof(browser, bundleJs) {
  const failures = [];
  let checks = 0;
  const page = await newSmokePage(browser, {
    apiRoutes: profileApiRoutes({
      profile: unverifiedProfile(),
      onSave: (route) => route.fulfill({ status: 400, json: { error: "region must be one of: EU, UK, US, LATAM, APAC, HK, MEA, GLOBAL" } }),
    }),
  });
  try {
    await mountBundle(page, bundleJs, "__mount");
    await page.waitForTimeout(300);
    await page.selectOption("#profile-org-type", "forwarder");
    await page.fill("#profile-role", "Trade lane manager");
    await page.click('form[aria-label="Community profile"] button[type="submit"]');
    await page.waitForTimeout(300);

    const alertText = await page.textContent('[role="alert"]');
    checks++;
    if (!alertText || !alertText.includes("region must be one of")) {
      failures.push(`save-error-proof: error message did not render (got ${JSON.stringify(alertText)}).`);
    }
    const roleVal = await page.inputValue("#profile-role");
    checks++;
    if (roleVal !== "Trade lane manager") {
      failures.push(`save-error-proof: role input was not preserved after a save error (got ${JSON.stringify(roleVal)}).`);
    }
  } finally {
    await page.close();
  }
  return { checks, failures };
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;

  const postListBundle = await bundleEntry(ENTRY_POSTLIST, { alias: ALIAS });
  const peersBundle = await bundleEntry(ENTRY_PEERS, { alias: ALIAS });

  // ── PostList + Post + PostComposer + EntityPicker + PromotePostButton ────────────────────────
  // `runUxSpec` measures one animation frame after mount (ux-harness.mjs) — right for a purely
  // prop-driven row, but PostList fetches its own data, so its FIRST paint is always the "Loading
  // posts…" placeholder regardless of state; runUxSpec still proves that placeholder itself never
  // overflows (worth keeping), and `settledContentProof` below proves the REAL, loaded content each
  // state exists to stress (see that function's own header for why runUxSpec alone can't).
  const loadingPlaceholder = await runUxSpec(browser, {
    name: "community-postlist-loading",
    entry: ENTRY_POSTLIST,
    alias: ALIAS,
    apiRoutes: postsApiRoutes({ posts: extremePosts(15) }), // resolves too slowly (real Playwright IPC) for runUxSpec's one-rAF window to observe — this state captures the "Loading posts…" placeholder, by construction
    states: [{ label: "loading", props: postListProps() }],
  });
  checks += loadingPlaceholder.checks;
  failures.push(...loadingPlaceholder.failures);

  const empty = await settledContentProof(browser, postListBundle, {
    apiRoutes: postsApiRoutes({ posts: [] }),
    props: postListProps(),
    expectTitles: 1, // "Discussion" only — "No posts yet." carries no [data-guard-title]
    label: "community-postlist[empty]",
  });
  checks += empty.checks;
  failures.push(...empty.failures);

  const oneRow = await settledContentProof(browser, postListBundle, {
    apiRoutes: postsApiRoutes({ posts: [post()] }),
    props: postListProps(),
    expectTitles: 2, // "Discussion" + the one post's own title
    label: "community-postlist[one-row]",
  });
  checks += oneRow.checks;
  failures.push(...oneRow.failures);

  const extreme = await settledContentProof(browser, postListBundle, {
    apiRoutes: postsApiRoutes({ posts: extremePosts(15) }),
    props: postListProps(),
    expectTitles: 16, // "Discussion" + 15 extreme-data post titles
    label: "community-postlist[extreme]",
  });
  checks += extreme.checks;
  failures.push(...extreme.failures);

  // ── Post, standalone (prop-driven, no fetch: runUxSpec's one-rAF window is exact here) ────────
  const postStandalone = await runUxSpec(browser, {
    name: "community-post",
    entry: ENTRY_POST,
    alias: ALIAS,
    apiRoutes: postsApiRoutes({ posts: [] }),
    states: [
      { label: "one", props: postProps(), expectTitles: 1 },
      { label: "extreme", props: postProps({ post: extremePosts(1)[0] }), expectTitles: 1 },
    ],
  });
  checks += postStandalone.checks;
  failures.push(...postStandalone.failures);

  // ── PeersDiscussingStrip — same async-first-paint reasoning as PostList above ─────────────────
  const peers = await settledContentProof(browser, peersBundle, {
    apiRoutes: [
      threadsApiRoute([
        thread(),
        thread({
          id: "thread-2",
          title: null,
          body: "No title on this one, so the body preview stands in as the row's own title.",
        }),
      ]),
    ],
    props: { entityId: "cl:corridor:1", limit: 3 },
    expectTitles: 2,
    label: "community-peers-strip[with-threads]",
  });
  checks += peers.checks;
  failures.push(...peers.failures);

  // ── custom interaction proofs ─────────────────────────────────────────────────────────────────
  const refusal = await refusalAndDraftPreservationProof(browser, postListBundle);
  checks += refusal.checks;
  failures.push(...refusal.failures);

  const pagination = await paginationProof(browser, postListBundle);
  checks += pagination.checks;
  failures.push(...pagination.failures);

  const stripEmpty = await stripRendersNothingProof(browser, peersBundle);
  checks += stripEmpty.checks;
  failures.push(...stripEmpty.failures);

  // ── lane COMMUNITY-C additions: BenchmarksPanel's response form + the profile page (ProfileForm) ──
  const benchmarksBundle = await bundleEntry(ENTRY_BENCHMARKS, { alias: ALIAS });
  const profileBundle = await bundleEntry(ENTRY_PROFILE, { alias: ALIAS });

  const benchmarksSettled = await benchmarksSettledProof(browser, benchmarksBundle);
  checks += benchmarksSettled.checks;
  failures.push(...benchmarksSettled.failures);

  const responseRefusal = await benchmarkResponseRefusalProof(browser, benchmarksBundle);
  checks += responseRefusal.checks;
  failures.push(...responseRefusal.failures);

  const responseAccepted = await benchmarkResponseAcceptedProof(browser, benchmarksBundle);
  checks += responseAccepted.checks;
  failures.push(...responseAccepted.failures);

  const profileSettled = await profileSettledProof(browser, profileBundle);
  checks += profileSettled.checks;
  failures.push(...profileSettled.failures);

  const profileVerify = await profileVerifySuccessProof(browser, profileBundle);
  checks += profileVerify.checks;
  failures.push(...profileVerify.failures);

  const profileSaveError = await profileSaveErrorProof(browser, profileBundle);
  checks += profileSaveError.checks;
  failures.push(...profileSaveError.failures);

  return { checks, failures };
}
