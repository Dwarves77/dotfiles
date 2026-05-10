import type { Metadata } from "next";
import { Anton, Plus_Jakarta_Sans } from "next/font/google";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});
import { ThemeInitializer } from "@/components/ThemeInitializer";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { resolveServerBootstrap } from "@/lib/api/server-bootstrap";
import "./theme.css";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  // Weights aligned with Claude Design's actual usage per font-usage-audit-2026-05-11.md.
  // 300 dropped (zero references in src/). 800 added (83 references, includes
  // .cl-page-title + all typeset chrome from PR #84). 900 NOT loaded because
  // Plus_Jakarta_Sans tops out at 800 in next/font/google (available weights:
  // 200, 300, 400, 500, 600, 700, 800, variable). The single .cl-stat-number
  // 900 reference will now faux-bold from 800 instead of 700, an incremental
  // visual improvement; a follow-up CSS edit to change .cl-stat-number to 800
  // would eliminate the faux-bold entirely.
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

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
      className={`${anton.variable} ${jakarta.variable}`}
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
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
