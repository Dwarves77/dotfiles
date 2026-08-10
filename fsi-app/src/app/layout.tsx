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
import { resolveServerBootstrap } from "@/lib/api/server-bootstrap";
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
  const bootstrap = await resolveServerBootstrap();
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
        <AuthProvider
          initialUser={bootstrap.user}
          initialOrgId={bootstrap.orgId}
          initialOrgName={bootstrap.orgName}
          initialRole={bootstrap.role}
          initialSectors={bootstrap.sectors}
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
