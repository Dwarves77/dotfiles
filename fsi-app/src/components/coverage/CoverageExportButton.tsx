"use client";

/**
 * CoverageExportButton: download the CSV for the axes on screen (lane COV-1, 2026-10-08).
 *
 * The one client island of the Coverage page besides the request control. It calls GET /api/dashboard/coverage/matrix?format=csv
 * through authedFetch and saves the answer with the repo's Blob download convention (src/lib/coverage/client.ts). The
 * file carries the matrix version, the generation instant and the data as-of as COLUMNS, so a spreadsheet keeps them.
 *
 * Reader's goal: take this view away as a file. Path: one press. Feedback: the button reads "Preparing the file..." the
 * moment it is pressed, then states that the file was saved and which view it holds; a failure says what went wrong and
 * leaves the button in place to try again (ux-laws 6, 10, 15). The target is 44 px tall (law 2).
 */

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { downloadCoverageCsv } from "@/lib/coverage/client";

export function CoverageExportButton({ query, label }: { query: { mode?: string; dataClass?: string; geography?: string }; label: string }) {
  const [phase, setPhase] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (phase === "sending") return;
    setPhase("sending");
    setError(null);
    const res = await downloadCoverageCsv(query);
    if (!res.ok) {
      setPhase("idle");
      setError(res.error ?? "The export could not be made. Try again.");
      return;
    }
    setPhase("done");
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
      <Button type="button" variant="primary" disabled={phase === "sending"} onClick={() => void run()} style={{ minHeight: 44 }}>
        {phase === "sending" ? "Preparing the file..." : "Download CSV"}
      </Button>
      {phase === "done" && (
        <span role="status" style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)" }}>
          Saved. The file holds {label}, with its version and dates in columns.
        </span>
      )}
      {error && (
        <span role="alert" style={{ fontSize: "var(--fs-11)", color: "var(--color-error)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
