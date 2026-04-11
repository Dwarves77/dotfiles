"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

const NO_SIDEBAR_ROUTES = ["/login", "/auth"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideSidebar = NO_SIDEBAR_ROUTES.some((r) => pathname.startsWith(r));

  if (hideSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-bg-base)" }}>
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
        <footer className="px-6 py-3 text-center" style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
          <p className="text-[10px]">For informational purposes only. Not legal advice. Regulations move fast, always verify with official sources before acting.</p>
        </footer>
      </div>
    </div>
  );
}
