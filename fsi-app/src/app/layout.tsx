import type { Metadata } from "next";
import { headers } from "next/headers";
// SELF-HOSTED FONTS (2026-08-10, Vercel build-reliability fix): next/font/google fetches font
// files from Google's CDN (fonts.gstatic.com) AT BUILD TIME. That live fetch failed the
// `carosledge` Vercel project's build twice on commits that never touched this file (U9 #425,
// U8 #426) while the twin `caros.ledge` project succeeded on the IDENTICAL commit both times —
// a build-environment network flake, not a code defect, but one that recurred. Root-cause fix
// (not a retry): @fontsource ships the actual woff2 files as npm package assets, resolved via
// the npm registry (reachable) instead of Google's font CDN (the thing that was actually
// flaking) — this removes the external-fetch-at-build-time dependency entirely, for both
// Vercel projects, permanently. Weights match the prior next/font/google config exactly
// (Jakarta 400/500/600/700/800 per font-usage-audit-2026-05-11.md; Anton 400 only).
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "@fontsource/anton/400.css";
import { ThemeInitializer } from "@/components/ThemeInitializer";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { GlobalErrorReporter } from "@/components/telemetry/GlobalErrorReporter";
import { resolveServerBootstrap } from "@/lib/api/server-bootstrap";
import { isRscNavigation } from "@/lib/bootstrap/rsc-navigation";
import "./theme.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caro's Ledge — Freight Sustainability Intelligence",
  description:
    "Sustainability intelligence platform for international freight forwarding. Monitors regulatory, technology, and market developments across air, road, and ocean transport.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve auth + workspace + sectors server-side (cached per-request via
  // React.cache). AuthProvider seeds its initial state from these props
  // and skips the mount-time refetch that previously fired on every page.
  // Eliminates 2 client round-trips per render.
  //
  // PERF-3 (2026-09-03, docs/audits/perf-load-times-2026-09-03.md, dispatch item (1) +
  // src/lib/bootstrap/rsc-navigation.ts's own header for the full mechanism): this `await` sits
  // above every route's own loading.tsx Suspense boundary, so on a fully-dynamic route (this one
  // is, transitively, via cookies() inside resolveServerBootstrap) it re-runs and blocks streaming
  // on EVERY client-side navigation between sibling top-nav routes, not just the first load — and
  // AuthProvider structurally discards the result on every render past its own first mount
  // (useState(initialUser)/useEffect(...,[]) — see rsc-navigation.ts). Skip it on a client-side
  // (RSC) navigation, where it is pure waste that was also the entire "no skeleton, page frozen"
  // symptom; still run it on a real document load, where AuthProvider's first-mount seeding needs
  // it (unchanged behavior, no anonymous-flash regression).
  const rscNav = isRscNavigation(await headers());
  const bootstrap = rscNav ? null : await resolveServerBootstrap();
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.setAttribute('data-theme',localStorage.getItem('fsi-theme')||'light');document.documentElement.style.backgroundColor='#fafaf8'}catch(e){}`,
          }}
        />
      </head>
      <body className="antialiased">
        {/* bootstrap is null on a client-side (RSC) navigation — see the rscNav comment above.
            AuthProvider's initial* props are seed-once (useState/useEffect with an empty dep
            array), consumed only on its FIRST mount; on every navigation past that first mount
            AuthProvider already ignores these props, so passing `undefined` here (its own default
            props apply) is exactly as inert as passing bootstrap's real values would have been —
            it is never a real first mount when bootstrap is null. */}
        <AuthProvider
          initialUser={bootstrap?.user}
          initialOrgId={bootstrap?.orgId}
          initialOrgName={bootstrap?.orgName}
          initialRole={bootstrap?.role}
          /* Section 6.8 composition: a per-user override (profiles.sector_overrides) wins when
              present; otherwise the workspace's sector_profile. Until 2026-09-02 this passed
              `bootstrap.sectors` alone, which is empty for every user because nothing has written
              sector_overrides since the 2026-05-18 onboarding fix, so the whole app ran as
              "no sectors configured" (lane HYG-2 root cause, Addendum 84 postscript 15). */
          initialSectors={bootstrap ? (bootstrap.sectors.length ? bootstrap.sectors : bootstrap.workspaceSectors) : undefined}
        >
          <ThemeInitializer />
          {/* R0.2 first-party error tracking: window.onerror + unhandled-
              rejection reporter (renders nothing; per-session rate-limited). */}
          <GlobalErrorReporter />
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
