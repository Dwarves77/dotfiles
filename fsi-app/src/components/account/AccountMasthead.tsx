"use client";

/**
 * AccountMasthead — shared editorial header for the Account surface
 * (T10, HANDOFF §5 + §6.10, "Pages - 10 Account" mock).
 *
 * Renders the blue editorial eyebrow, the Anton "ACCOUNT" title, a muted
 * sub-line carrying the caller's identity (email · workspace), and the two
 * top tabs — Profile / Settings.
 *
 * /profile and /settings are separate routes; the top tabs are real links
 * so deep-linking and back-navigation keep working. `active` marks which
 * route is current so the 3px orange underline lands on the right tab.
 *
 * The 4px orange→blue brand rule at the very top of the page is shell
 * chrome (AppShell) — NOT reimplemented here, exactly as PageMasthead
 * documents, so we don't stack two bars.
 */

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/** ISO 8601 week number (Mon-start, week 1 contains the year's first
 *  Thursday) — mirrors EditorialMasthead so the edition line matches the
 *  one issue date used app-wide. */
function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

interface AccountMastheadProps {
  active: "profile" | "settings";
  /** Email from the server auth session — avoids a hydration flash. */
  userEmail: string;
}

export function AccountMasthead({ active, userEmail }: AccountMastheadProps) {
  const { user } = useAuth();
  const orgName = useWorkspaceStore((s) => s.orgName);
  const email = user?.email || userEmail;
  const edition = `Personal preferences · Vol IV · No. ${isoWeekNumber(new Date())}`;

  const subLine = [email, orgName || null, "the standard member surface — profile, workspace, and preferences"]
    .filter(Boolean)
    .join(" · ");

  return (
    <header
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <style>{`
        .cl-account-masthead { padding: 26px 36px 0; }
        .cl-account-title { font-size: clamp(28px, 6.5vw, 42px); line-height: 1; }
        @media (max-width: 640px) {
          .cl-account-masthead { padding: 18px 18px 0 64px; }
          .cl-account-eyebrow { font-size: 9px; letter-spacing: 0.18em; }
        }
      `}</style>
      <div className="cl-account-masthead">
        <p
          className="cl-account-eyebrow"
          style={{
            fontSize: "10.5px",
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--accent-blue)",
            margin: "0 0 6px",
          }}
        >
          {edition}
        </p>
        <h1
          className="cl-account-title"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            color: "var(--text)",
            margin: 0,
          }}
        >
          Account
        </h1>
        <p
          style={{
            fontSize: "13.5px",
            color: "var(--color-text-secondary)",
            margin: "8px 0 18px",
          }}
        >
          {subLine}
        </p>
        <nav
          aria-label="Account sections"
          style={{ display: "flex", gap: "2px" }}
        >
          <TopTab href="/profile" label="Profile" active={active === "profile"} />
          <TopTab href="/settings" label="Settings" active={active === "settings"} />
        </nav>
      </div>
    </header>
  );
}

function TopTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "13px",
        fontWeight: active ? 800 : 600,
        padding: "12px 22px",
        borderBottom: `3px solid ${active ? "var(--color-primary)" : "transparent"}`,
        color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Link>
  );
}
