"use client";

/**
 * AuthFrame — the logged-out / setup identity frame (UI system handoff
 * 2026-09-06, README screen 16 "Sign in · Sign up" and screen 17
 * "Onboarding"). Both artboards deviate from the standard §0.3 frame (252px
 * nav card + content grid): a full 1440px split screen, masthead identity on
 * the left, one panel on the right — "same inputs and buttons as Settings"
 * per the artboard's own note. This component is that left panel plus the
 * outer frame chrome; callers render their own right-panel content as
 * `children`.
 *
 * Shared by every route in this lane's scope that needs it: /login,
 * /signup, /onboarding, /workspace/new. Not exported from src/components/ui
 * because it is not used outside logged-out/setup surfaces — it is scoped
 * shared chrome for this lane's four routes, not a general-purpose part.
 *
 * AppShell.tsx (outside this lane's write set) is extended additively —
 * NO_SIDEBAR_ROUTES gains "/signup", "/onboarding", "/workspace/new" — so
 * these routes render this frame instead of the standard Sidebar + content
 * grid, matching the artboards. See DEVIATION-LOG.md for the note.
 */

import type { ReactNode } from "react";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { BAND_ORDER } from "@/lib/urgency/bands";
import { formatLocaleDate } from "@/lib/format";

const EDITORIAL_VOLUME = "IV";

/** ISO 8601 week number (Mon-start, week 1 contains first Thursday) —
 *  mirrors Masthead.tsx's own helper (kept duplicated rather than imported,
 *  same precedent that file itself follows against EditorialMasthead: a
 *  pure 6-line date computation, not a vocabulary at risk of drifting). */
function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function AuthFrame({ children }: { children: ReactNode }) {
  const now = new Date();
  const weekNo = isoWeekNumber(now);
  const dateStr = formatLocaleDate(now, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        background: "var(--desk)",
        padding: "16px 0",
      }}
    >
      <div
        style={{
          width: 1440,
          maxWidth: "100%",
          background: "var(--page)",
          border: "1px solid var(--line-1)",
          boxShadow: "var(--shadow-frame)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          overflow: "hidden",
          minHeight: 900,
        }}
      >
        {/* Identity panel — identical on every logged-out/setup route. */}
        <div
          style={{
            background: "var(--card)",
            borderRight: "1px solid var(--line-1)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px 56px",
          }}
        >
          <div>
            <div
              style={{
                height: 3,
                width: 160,
                background: "var(--brand)",
                borderRadius: 2,
                marginBottom: 22,
              }}
            />
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 30,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                lineHeight: 1,
                color: "var(--ink)",
              }}
            >
              {APP_NAME}
            </div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                fontWeight: 600,
                marginTop: 6,
              }}
            >
              {APP_TAGLINE}
            </div>
          </div>

          <div style={{ maxWidth: 440 }}>
            <div
              style={{
                fontSize: "var(--fs-105)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                fontWeight: 700,
              }}
            >
              VOL {EDITORIAL_VOLUME} · No. {weekNo} · {dateStr}
            </div>
            {/* The mock's headline ("What is binding on you, when it bites,
                and what it costs.") and its "1,434 items..." paragraph are
                the artboard's placeholder marketing copy (README "Fidelity":
                "Copy inside the auth artboard (16) is placeholder and will
                be replaced by the client") plus a fabricated item count —
                neither ships (CLAUDE.md rule 2: never fabricate numbers).
                Kept instead: the approved tagline (already above) and the
                band scale below, which the onboarding artboard (17) calls
                out by name as content that belongs here ("the band scale is
                taught here, once") and which is real vocabulary from
                BAND_ORDER, not sample copy. See DEVIATION-LOG.md. */}
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                fontWeight: 700,
                marginTop: 22,
              }}
            >
              Every item, one of four urgency bands
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 14,
                marginTop: 10,
              }}
            >
              {BAND_ORDER.map((b) => (
                <div key={b.key}>
                  <div
                    style={{
                      fontSize: "var(--fs-95)",
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      color: b.cssVar,
                    }}
                  >
                    {b.label}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--fs-105)",
                      color: "var(--ink-3)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.window}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* The app's ONE legal disclaimer, and the only place it appears
              anywhere in the frame: artboards 16 (auth) and 17 (onboarding)
              draw this line at the foot of the left panel, and nothing else
              draws it (operator ruling 2026-09-08, which removed the page-wide
              bar the in-app shell used to render and withdrew the suggestion of
              a line under the nav Admin row). The approved wording is unchanged;
              only its placement was ruled on. It is the full app wording, not
              the mock's shortened "For informational purposes only. Not legal
              advice. Privacy" placeholder; see DEVIATION-LOG.md. */}
          <div style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>
            For informational purposes only. Not legal advice. Regulations
            move fast, always verify with official sources before acting.{" "}
            <a href="/privacy" style={{ color: "inherit" }}>
              Privacy
            </a>
          </div>
        </div>

        {/* Right panel — caller content (form, wizard step, ...). */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 48,
            overflowY: "auto",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
