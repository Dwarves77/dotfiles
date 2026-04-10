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
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
