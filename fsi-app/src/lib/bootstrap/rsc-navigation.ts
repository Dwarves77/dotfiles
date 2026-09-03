// isRscNavigation — the pure predicate behind PERF-3's root layout fix
// (docs/audits/perf-load-times-2026-09-03.md, dispatch item (1): "on every client-side navigation
// between the top-nav routes the previous page stays fully rendered and static for 2-4.5s, then
// the new page appears all at once; NO skeleton or pending state is ever painted, even though
// src/app/{regulations,market,operations,research}/loading.tsx ... exist").
//
// ROOT CAUSE (diagnosed by reading, this lane): src/app/layout.tsx is the ONLY layout in the app —
// every route, including all four top-nav index pages, mounts directly under it, and nothing else
// in the tree sits above the per-route loading.tsx Suspense boundary. RootLayout's own function
// body does `const bootstrap = await resolveServerBootstrap();` BEFORE it returns any JSX. That
// `await` is a plain synchronous block on RootLayout's OWN render, not a Suspense suspension — React
// cannot even construct the element tree below RootLayout (AuthProvider -> AppShell -> {children},
// where {children} is the target route's own loading.tsx-wrapped Suspense boundary) until this
// resolves, so nothing — not even the target route's instant skeleton fallback — can begin
// streaming until it does.
//
// resolveServerBootstrap (src/lib/api/server-bootstrap.ts) transitively reads cookies() (via
// createSupabaseServerClient), which is a Next.js Dynamic API. A route that reads a Dynamic API
// anywhere in its layout chain is rendered dynamically, per-request, for the WHOLE route on EVERY
// request under it — there is no per-segment "skip this unchanged layout" optimization for a fully
// dynamic route without Partial Prerendering (which this app does not use, next.config.ts has no
// `experimental.ppr`). So RootLayout's function body — and its blocking await — genuinely re-runs
// on every client-side navigation between sibling top-nav routes, not just on a cold/full load.
//
// THE FETCH'S RESULT IS ALREADY DISCARDED ON EVERY NAVIGATION PAST THE FIRST: AuthProvider
// (src/components/auth/AuthProvider.tsx) seeds `useState(initialUser)` / `useState(initialOrgId)`
// and hydrates the workspace store in `useEffect(() => {...}, [])` — both React idioms that
// consume the prop ONLY on the component's first mount and structurally ignore updates to it on
// every subsequent render. AuthProvider never unmounts across a soft navigation (only {children}
// changes — AuthProvider/AppShell/Sidebar are a persistent client-side tree above it), so the
// freshly-recomputed `bootstrap` RootLayout produces on navigation #2, #3, ... is provably inert:
// AuthProvider throws it away. Skipping the fetch on those navigations changes no client-visible
// behavior — it removes pure waste that also happens to block the stream.
//
// DETECTION: Next.js's own client router sends the `rsc: 1` request header on every client-side
// (flight/RSC) fetch — this is Next's own request-classification signal, not a heuristic:
// node_modules/next/dist/client/components/app-router-headers.js defines
// `const RSC_HEADER = 'rsc'`, and node_modules/next/dist/client/components/router-reducer/
// fetch-server-response.js sets it on every navigation fetch. A full/cold document load (the
// browser's initial GET, or a hard reload) never carries this header, so resolveServerBootstrap
// still runs there exactly as before — first paint stays correctly seeded, no anonymous-flash
// regression (the bug this bootstrap pattern was built to fix, HYG-2 / 2026-09-02, only applies to
// a component's FIRST mount, which a cold load still gets).
export function isRscNavigation(headers: Pick<Headers, "get">): boolean {
  return headers.get("rsc") === "1";
}
