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
import { Suspense } from "react";
import { ThemeInitializer } from "@/components/ThemeInitializer";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { BootstrapBoundary } from "@/components/shell/BootstrapBoundary";
import { AppShell } from "@/components/AppShell";
import { GlobalErrorReporter } from "@/components/telemetry/GlobalErrorReporter";
import { resolveServerBootstrap, type ServerBootstrap } from "@/lib/api/server-bootstrap";
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
  // PERF-4 (2026-09-03, docs/audits/perf-load-times-2026-09-03.md dispatch item (1)): PERF-3
  // already stopped AWAITING resolveServerBootstrap() (auth.getUser + org_memberships + profiles +
  // workspace_settings — a real Supabase round trip) on client-side (RSC) navigations. It still
  // awaited it on a DOCUMENT load (hard reload, first visit, /profile's hard navigation), which sat
  // above every route's own loading.tsx Suspense boundary and blocked the whole RSC stream ~1.5s
  // cold. This lane stops awaiting it there too: the promise is created here (kicked off eagerly,
  // in parallel with everything else) and handed DOWN, UNRESOLVED, to <BootstrapBoundary> — the only
  // thing that actually blocks on it (via React `use()`), and it sits inside its own <Suspense>,
  // as a SIBLING of <AppShell>{children}</AppShell> — not an ancestor of it. Suspense only replaces
  // its own subtree, never a sibling's, so the shell (nav rail, masthead) and the target route's own
  // loading.tsx-wrapped content render and stream immediately, unblocked by this promise. See
  // BootstrapBoundary.tsx's header for the full mechanism and AuthProvider.tsx's header for how the
  // resolved value reaches it afterward without a remount.
  //
  // `headers()` itself stays a real await — it's a cheap, non-network Dynamic API read (not a
  // Supabase round trip), so it adds no meaningful blocking time; only resolveServerBootstrap()'s
  // network cost is the thing being deferred here.
  const rscNav = isRscNavigation(await headers());
  const bootstrapPromise: Promise<ServerBootstrap | null> = rscNav
    ? Promise.resolve(null)
    : resolveServerBootstrap();

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
          {/* The ONLY thing gated behind this Suspense is the tiny, render-nothing boundary that
              feeds AuthProvider's context once the bootstrap resolves. <AppShell>{children}</AppShell>
              below is a SIBLING, outside it — see the comment above and BootstrapBoundary.tsx's
              header. fallback={null}: there is nothing to show here specifically, because the
              consumers of the seeded state (UserMenu, the no-workspace banner, AskAssistant's gate)
              already render nothing for their own pending default (user: null) — the "pending shell"
              the UX contract asks for IS the shell already rendering below, unblocked, with those
              slots simply not yet populated. */}
          <Suspense fallback={null}>
            <BootstrapBoundary bootstrapPromise={bootstrapPromise} />
          </Suspense>
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
