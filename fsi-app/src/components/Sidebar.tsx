"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import {
  LayoutDashboard, Scale, TrendingUp, Globe,
  GraduationCap, MessageSquare, MapPin, Settings,
  Menu, X,
} from "lucide-react";
import { useState } from "react";
import { UserMenu } from "@/components/auth/UserMenu";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/regulations", label: "Regulations", icon: Scale },
  { href: "/map", label: "Map", icon: MapPin },
  { href: "/market", label: "Market Intel", icon: TrendingUp },
  { href: "/operations", label: "Operations", icon: Globe },
  { href: "/research", label: "Research", icon: GraduationCap },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const navContent = (
    <>
      {/* Logo */}
      <div className="px-4 py-5 border-b" style={{ borderColor: "var(--color-border)" }}>
        <Link href="/" className="block">
          <h1
            className="text-lg uppercase"
            style={{
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            {APP_NAME}
          </h1>
          <p
            className="text-[8px] font-bold tracking-[0.2em] uppercase mt-0.5"
            style={{ color: "var(--color-text-muted)" }}
          >
            {APP_TAGLINE}
          </p>
        </Link>
      </div>

      {/* Main nav */}
      <nav className="py-2 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors",
              isActive(href)
                ? "font-semibold"
                : "hover:bg-[var(--color-bg-raised)]"
            )}
            style={{
              color: isActive(href) ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              backgroundColor: isActive(href) ? "var(--color-active-bg)" : undefined,
              borderLeft: isActive(href) ? "3px solid var(--color-primary)" : "3px solid transparent",
            }}
          >
            <Icon size={18} strokeWidth={isActive(href) ? 2.2 : 1.8} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Spacer — pushes community to middle area */}
      <div className="flex-1" />

      {/* Community — standalone middle section */}
      <div className="px-2 py-2 border-t border-b" style={{ borderColor: "var(--color-border)" }}>
        <Link
          href="/community"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors",
            isActive("/community")
              ? "font-semibold"
              : "hover:bg-[var(--color-bg-raised)]"
          )}
          style={{
            color: isActive("/community") ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            backgroundColor: isActive("/community") ? "var(--color-active-bg)" : undefined,
            borderLeft: isActive("/community") ? "3px solid var(--color-primary)" : "3px solid transparent",
          }}
        >
          <MessageSquare size={18} strokeWidth={isActive("/community") ? 2.2 : 1.8} />
          <span className="hidden lg:inline">Community</span>
        </Link>
      </div>

      {/* Bottom — user menu only (Settings is inside the dropdown) */}
      <div className="px-3 py-3">
        <UserMenu />
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col shrink-0 h-screen sticky top-0 border-r overflow-y-auto"
        style={{
          width: 220,
          backgroundColor: "var(--color-bg-surface)",
          borderColor: "var(--color-border)",
        }}
      >
        {navContent}
      </aside>

      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
        }}
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40"
            style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="md:hidden fixed top-0 left-0 z-50 flex flex-col h-screen w-[220px] overflow-y-auto"
            style={{
              backgroundColor: "var(--color-bg-surface)",
              borderRight: "1px solid var(--color-border)",
            }}
          >
            {navContent}
          </aside>
        </>
      )}
    </>
  );
}
