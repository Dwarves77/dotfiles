import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ThemeInitializer } from "@/components/ThemeInitializer";
import { AuthProvider } from "@/components/auth/AuthProvider";
import "./theme.css";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Caro's Ledge — Freight Sustainability Intelligence",
  description:
    "Sustainability intelligence platform for international freight forwarding. Monitors regulatory, technology, and market developments across air, road, and ocean transport.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={jakarta.variable}
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.setAttribute('data-theme',localStorage.getItem('fsi-theme')||'light')}catch(e){}`,
          }}
        />
      </head>
      <body className="antialiased">
        <AuthProvider>
          <ThemeInitializer />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
