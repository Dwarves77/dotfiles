import type { Metadata } from "next";
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
import "./theme.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caro's Ledge — Freight Sustainability Intelligence",
  description:
    "Sustainability intelligence platform for international freight forwarding. Monitors regulatory, technology, and market developments across air, road, and ocean transport.",
};

/**
 * PERF-10 (2026-09-04, root-cause fix, docs/decisions/ADR-026-detail-cache-and-viewer-state-split.md
 * Follow-up). PERF-9's `BootstrapResolver` moved `await headers()` into its own async Server
 * Component, rendered only inside a `<Suspense fallback={null}>` boundary — but PERF-9 itself
 * MEASURED, and ADR-026 records [CONFIRMED, REFUTED], that this did NOT move any route off `ƒ`:
 * a rebuild of `/privacy` (zero dynamic APIs of its own) still showed `ƒ`, because Suspense only
 * reorders STREAMING for an already-dynamic render under Next's classical (non-PPR) model — it does
 * not create a static/dynamic split. `headers()`/`cookies()` used ANYWHERE in a route's render
 * tree, Suspense-wrapped or not, still forces the WHOLE route dynamic at build time. That was
 * PERF-9's own honestly-reported limit, not a claim this lane invented.
 *
 * THE ACTUAL FIX (this lane): RootLayout's render tree now calls NO Dynamic API at all —
 * `BootstrapResolver`/`BootstrapBoundary`/`isRscNavigation` (the `headers()` call site) are
 * DELETED, not Suspense-wrapped. AuthProvider seeds itself via a plain client-side `fetch` to
 * `GET /api/auth/identity` (see AuthProvider.tsx's header for the full mechanism and the honestly-
 * stated latency trade-off this makes). A route whose OWN page.tsx (and every component it
 * renders) touches no cookies()/headers()/searchParams of its own can now actually be statically
 * generated — proven by the route table this lane's REPORT pastes, not asserted. Every route that
 * still legitimately needs per-viewer or per-org data in its OWN server render (the four
 * intelligence surfaces' listing/detail pages pre-this-lane, /profile, /settings, /admin,
 * /community, /map, /onboarding) resolves that need in ITS OWN page.tsx and stays dynamic on its
 * own account — unaffected by this file.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        <AuthProvider>
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
