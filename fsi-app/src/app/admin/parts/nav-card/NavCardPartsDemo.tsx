"use client";

/**
 * NavCardPartsDemo (lane W10-NavCard, 2026-09-23). Fixture-only scaffolding so this ONE page can
 * show the real `NavCard` part (`src/components/Sidebar.tsx`, `data-part="nav-card"`) with the
 * frozen counts in `nav-counts-fixture.ts`, without retyping any of its own markup (F49): the part
 * is mounted unmodified, and only the one network call it depends on for live counts
 * (`/api/workspace/bootstrap`, via the shared `useWorkspaceBootstrap` singleton) is intercepted,
 * module-wide, for this page only, same mechanism as CommandBarPartsDemo.tsx (reuse before
 * construction; see that file's header for why the patch runs at module-evaluation time rather than
 * inside a `useEffect`, and why it is page-wide rather than per-instance).
 *
 * Identity (Account row / workspace name / role badge) is NOT mocked: this is a platform-admin-only
 * fixture page, so the real signed-in operator's own auth/workspace context renders in the footer,
 * same as every other page under /admin. Only the corpus-wide nav COUNTS are frozen (they are what
 * the brief and parts-brief 2.14 actually specify).
 */

import { useEffect, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { NAV_COUNTS_FIXTURE } from "@/components/ui/__fixtures__/nav-counts-fixture";

const BOOTSTRAP_URL_MARKER = "/api/workspace/bootstrap";

declare global {
  // eslint-disable-next-line no-var
  var __clNavCardPartsFetchPatched: boolean | undefined;
}

if (typeof window !== "undefined" && !window.__clNavCardPartsFetchPatched) {
  window.__clNavCardPartsFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes(BOOTSTRAP_URL_MARKER)) {
      return originalFetch(input as RequestInfo, init).then(async (res) => {
        // The real bootstrap response carries this fixture page's own operator identity fields
        // (members, adminAttention, overrides), only navCounts is overridden with the frozen
        // fixture, so the footer's Account/Admin rows still show the real signed-in context.
        let body: Record<string, unknown> = {};
        try {
          body = await res.clone().json();
        } catch {
          body = {};
        }
        return new Response(JSON.stringify({ ...body, navCounts: NAV_COUNTS_FIXTURE }), {
          status: res.status,
          headers: { "content-type": "application/json" },
        });
      });
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof window.fetch;
}

/** Mounts the real desktop NavCard at a fixed 252px measure so the fixture page can show it beside
 *  explanatory copy without the surrounding app grid. `overflow: visible` on the wrapper, `height`
 *  bounded so the card's own `align-self: stretch` (Sidebar.tsx) has a real box to fill. */
export function NavCardFixtureFrame() {
  const containerRef = useRef<HTMLDivElement>(null);
  // Force a re-render once the patched fetch above has had a tick to resolve, so the frozen counts
  // are visible on first paint of this fixture page rather than only after a live client nav.
  useEffect(() => {
    const t = setTimeout(() => containerRef.current?.dispatchEvent(new Event("cl-noop")), 50);
    return () => clearTimeout(t);
  }, []);
  return (
    <div ref={containerRef} style={{ display: "flex", height: 640, background: "var(--bg)" }}>
      <Sidebar />
    </div>
  );
}
