"use client";

/**
 * CommandBarPartsDemo (lane W10-CommandBar-parts, 2026-09-23). The fixture-only scaffolding this
 * ONE page needs to show the real `CommandBar` part (`src/components/ui/CommandBar.tsx`) in its
 * "inline results" state deterministically, without a second row anatomy and without retyping any
 * of CommandBar's own markup (F49): the part is mounted unmodified, and only the two network calls
 * it makes internally (`/api/workspace/bootstrap` via the shared singleton hook, `/api/search` via
 * its own debounced effect) are intercepted, module-wide, for this page only.
 *
 * WHY MODULE-LOAD TIME, NOT A useEffect. `useWorkspaceBootstrap` is a page-wide SINGLETON
 * (useWorkspaceBootstrap.ts): its first consumer's effect fires the one shared fetch for every
 * CommandBar mounted on this page. React commits child effects before parent effects, so patching
 * `window.fetch` inside this component's own `useEffect` would already be too late, a child
 * CommandBar's effect can fire first and capture the REAL `window.fetch` before a parent patch
 * lands. Patching at MODULE EVALUATION time (this file's top level, which runs once, before any
 * component in the tree commits) closes that race.
 *
 * WHY assistantEnabled IS FORCED FALSE FOR THE WHOLE PAGE. The singleton's response is shared by
 * every CommandBar this page mounts, so every one of them (the 1440/375 idle bars, the inline-
 * results demo, the placeholder gallery) sees the SAME assistantEnabled value. Forcing it false is
 * the accurate default: `CommandBar.tsx`'s own header states the client "renders Ask as unavailable
 * until the bootstrap fetch resolves, never as 'enabled' by default (fail-closed)", and no .env
 * lives in this worktree (CLAUDE.md rule 9) to say otherwise. This IS the page's "Ask-disabled
 * state" section, every bar on this page demonstrates it, not just one, which is the honest
 * consequence of Ask being a page-wide flag rather than a per-instance one.
 *
 * KNOWN CAVEAT (disclosed, not silently assumed away): `useWorkspaceBootstrap`'s singleton persists
 * for the lifetime of the client-side module graph. If a prior client-side navigation in the SAME
 * browser tab already resolved the real bootstrap fetch before this page mounted, that resolved
 * state wins and this page's mock is not consulted. A fresh navigation (a full page load, or the
 * first admin route visited in the tab) always sees the mock; this is the only path the UX smoke
 * spec below exercises, and it is the one a reviewer opening this page directly also gets.
 */

import { useEffect, useRef } from "react";
import { CommandBar } from "@/components/ui/CommandBar";
import type { SearchResultRow } from "@/app/api/search/logic";
import { SEARCH_FIXTURE_QUERY, SEARCH_FIXTURE_RESULTS } from "@/components/ui/__fixtures__/search-results-fixture";

const BOOTSTRAP_URL_MARKER = "/api/workspace/bootstrap";
const SEARCH_URL_MARKER = "/api/search";

/** Frozen mock response for the shared bootstrap singleton, see this file's header. Only
 *  `assistantEnabled` is meaningful to CommandBar; the rest are the field's own honest empty
 *  defaults (WorkspaceBootstrapData, useWorkspaceBootstrap.ts), never invented content. */
function mockBootstrapBody() {
  return {
    personalState: [],
    listOrders: {},
    members: null,
    adminAttention: null,
    overrides: [],
    navCounts: undefined,
    assistantEnabled: false,
  };
}

function mockSearchBody(q: string, results: SearchResultRow[]) {
  return { query: q, results };
}

declare global {
  // eslint-disable-next-line no-var
  var __clCommandBarPartsFetchPatched: boolean | undefined;
}

if (typeof window !== "undefined" && !window.__clCommandBarPartsFetchPatched) {
  window.__clCommandBarPartsFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes(BOOTSTRAP_URL_MARKER)) {
      return Promise.resolve(
        new Response(JSON.stringify(mockBootstrapBody()), { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    if (url.includes(SEARCH_URL_MARKER)) {
      const parsed = new URL(url, window.location.origin);
      const q = parsed.searchParams.get("q") ?? "";
      if (q === SEARCH_FIXTURE_QUERY) {
        return Promise.resolve(
          new Response(JSON.stringify(mockSearchBody(q, SEARCH_FIXTURE_RESULTS)), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      // Any other query on this fixture page: an empty result set, never a live network call,
      // this page shows only the one frozen query's rows (operator ruling: fixtures render from a
      // frozen real record, never invented strings).
      return Promise.resolve(
        new Response(JSON.stringify(mockSearchBody(q, [])), { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof window.fetch;
}

/**
 * Mounts the real CommandBar and, once its own debounced search effect is live, types the frozen
 * demo query into ITS OWN input (scoped by a container ref, not `document.getElementById`, the
 * part's input id, `cl-command-bar-input`, is a page-singleton id by production design (TopBar.tsx's
 * own mobile focus affordance depends on exactly one CommandBar per real page), so this fixture page
 * mounts several instances of it; a ref-scoped query keeps each demo typing into its own bar). The
 * native value setter + a real `input` event is the same mechanism the codebase's own Playwright
 * smoke specs use to drive a controlled React input from outside React.
 */
export function CommandBarInlineResultsDemo({ itemCount, scope }: { itemCount: number; scope: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const input = containerRef.current?.querySelector<HTMLInputElement>("#cl-command-bar-input");
    if (!input) return;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (!nativeSetter) return;
    nativeSetter.call(input, SEARCH_FIXTURE_QUERY);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }, []);

  return (
    <div ref={containerRef}>
      <CommandBar itemCount={itemCount} scope={scope} />
    </div>
  );
}
