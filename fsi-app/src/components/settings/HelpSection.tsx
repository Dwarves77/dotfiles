"use client";

import {
  BookOpen,
  ExternalLink,
  Mail,
  GitBranch,
  ShieldCheck,
  HelpCircle,
} from "lucide-react";

// ───────────────────────────────────────────────────────────────────────────
// HelpSection (PR-L Settings restoration — Decision #14, F14)
//
// Static help content: documentation links, support contact, version info.
// No data layer. Anchors to existing app routes (/privacy) and an external
// support mailto. Version is read from APP_NAME/APP_TAGLINE constants and
// the build-time package.json version string is reflected in the
// __APP_VERSION__ define added at next.config.ts level — until that's wired,
// we fall back to a static label here.
// ───────────────────────────────────────────────────────────────────────────

const APP_VERSION = "0.1.0"; // mirrors package.json#version
const SUPPORT_EMAIL = "support@carosledge.com";

interface HelpLink {
  label: string;
  href: string;
  description: string;
  icon: React.ReactNode;
  external?: boolean;
}

const LINKS: HelpLink[] = [
  {
    label: "Source intelligence model",
    href: "/sources",
    description: "How sources are vetted, scored, and promoted.",
    icon: <ShieldCheck size={14} />,
  },
  {
    label: "Privacy & data handling",
    href: "/privacy",
    description: "What we collect, where it lives, and your rights.",
    icon: <BookOpen size={14} />,
  },
  {
    label: "Onboarding walkthrough",
    href: "/onboarding",
    description: "Re-run the setup flow for sectors and home view.",
    icon: <HelpCircle size={14} />,
  },
];

export function HelpSection() {
  return (
    <div className="space-y-5">
      <div>
        <p
          className="text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Documentation, support contact, and the build you&apos;re on.
        </p>
      </div>

      {/* Doc links */}
      <ul
        className="rounded-md border divide-y"
        style={{
          borderColor: "var(--color-border-subtle)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        {LINKS.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              target={l.external ? "_blank" : undefined}
              rel={l.external ? "noreferrer" : undefined}
              className="flex items-start gap-3 px-4 py-3 transition-colors group"
              style={{ color: "inherit" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                  "var(--color-surface-raised)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                  "transparent";
              }}
            >
              <span
                className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0"
                style={{
                  backgroundColor: "var(--color-surface-overlay)",
                  color: "var(--color-text-secondary)",
                }}
              >
                {l.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="flex items-center gap-1.5 text-sm font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {l.label}
                  {l.external && (
                    <ExternalLink
                      size={12}
                      className="opacity-60"
                    />
                  )}
                </div>
                <div
                  className="text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {l.description}
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>

      {/* Support contact */}
      <div
        className="rounded-md border p-4 flex items-start gap-3"
        style={{
          borderColor: "var(--color-border-subtle)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0"
          style={{
            backgroundColor: "var(--color-surface-overlay)",
            color: "var(--color-text-secondary)",
          }}
        >
          <Mail size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Need a hand?
          </div>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--color-text-muted)" }}
          >
            Email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              style={{ color: "var(--color-primary)" }}
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            with the surface, the workspace, and what you expected to see.
            We respond within one business day.
          </p>
        </div>
      </div>

      {/* Version */}
      <div
        className="rounded-md border p-4 flex items-center gap-3"
        style={{
          borderColor: "var(--color-border-subtle)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0"
          style={{
            backgroundColor: "var(--color-surface-overlay)",
            color: "var(--color-text-secondary)",
          }}
        >
          <GitBranch size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="text-[10px] font-bold uppercase"
            style={{
              letterSpacing: "0.14em",
              color: "var(--color-text-muted)",
            }}
          >
            Build
          </div>
          <div
            className="text-sm font-mono"
            style={{ color: "var(--color-text-primary)" }}
          >
            Caro&apos;s Ledge · v{APP_VERSION}
          </div>
        </div>
      </div>
    </div>
  );
}
