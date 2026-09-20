"use client";

/**
 * StatutoryRowsUpload , admin panel for POST /api/admin/statutory-rows (lane M7a, 2026-09-20). The
 * operator's admin-uploaded, schema-validated replacement for write-statutory.mjs's fixture-only
 * --rows-file CLI path (plan row M7's data-layer half): pick a rows-file JSON document, run it dry
 * (default, writes nothing), review the per-row outcome table, then Apply , enabled only after a clean
 * dry run of the SAME file (a file edited after a dry run must be re-checked before Apply unlocks).
 *
 * Mounted on the admin Ingest section (AdminDashboard.tsx), beside the other propagation/ingest
 * controls (CorpusTurnPanel's own "Run intake now" plan/apply pattern is the precedent this panel
 * follows , one dry/apply cycle, no separate approval step once Apply is pressed).
 *
 * UX CONTRACT (docs/design/ux-laws.md, DP-2):
 *   - Primary goal: get one reviewed rows-file's statutory_computations rows into the table. Shortest
 *     path: choose file -> Run dry -> read the per-row table -> Apply.
 *   - One primary action per state: "Run dry" until a clean dry result exists for the CURRENT file
 *     text, then "Apply" (law 7, Von Restorff) , Apply is disabled, not hidden, until that condition
 *     holds, and its own caption says why (law 14, Postel , prevent the mistake, don't just block it).
 *   - Distinct visible state per async step: idle -> running -> result (never a silent spinner-to-
 *     nothing, law 6, Doherty).
 *   - Per-row outcome feedback, not one folded summary line (law 5, Miller; same precedent
 *     Spec09CsvUpload's per-row rejection list already established for this admin surface).
 *   - Editing the file text after a dry run invalidates the Apply gate immediately (law 14/15 ,
 *     prevents applying a file the operator has since changed).
 *   - All interactive targets (buttons, file picker) are >=44px tall (law 2, Fitts).
 */

import { useCallback, useRef, useState } from "react";
import { authHeaders } from "@/lib/api/authed-fetch";
import { Button } from "@/components/ui/Button";
import { UploadCloud, PlayCircle, CheckCircle2 } from "lucide-react";
import { AdminPanelFrame } from "@/components/admin/AdminTableView";
import { FilePickRow } from "@/components/ui/FilePickRow";
import { InlineErrorBanner } from "@/components/ui/InlineErrorBanner";

interface RowOutcome {
  index: number;
  shipKey?: string;
  action: string;
  detail?: unknown;
}

interface RunResult {
  mode: "dry" | "apply";
  total: number;
  counts: { written: number; wouldWrite: number; skippedAlready: number; refused: number; errored: number };
  outcomes: RowOutcome[];
}

interface ValidationFailure {
  error: string;
  violations: string[];
}

type Status = "idle" | "running" | "result" | "failure";

function fieldStyle(): React.CSSProperties {
  return {
    fontFamily: "monospace",
    fontSize: 11.5,
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid var(--color-border-medium)",
    background: "var(--color-background)",
    color: "var(--text)",
    outline: "none",
    resize: "vertical",
    width: "100%",
    boxSizing: "border-box",
  };
}

const ACTION_LABEL: Record<string, string> = {
  written: "Written",
  "would-write": "Would write (dry)",
  "skipped-already-computed": "Already computed - skipped",
  "refused-inadmissible": "Refused - not admissible for filing",
  "refused-structural": "Refused - structural error",
  errored: "Errored",
};

export function StatutoryRowsUpload() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[] | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  // The Apply gate: only true immediately after a clean (no-violation) dry run of the CURRENT text.
  // Any edit to the text (or a fresh file pick) clears it , never lets Apply run against a file the
  // operator has since changed.
  const [dryCleanForText, setDryCleanForText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetRunState = useCallback(() => {
    setError(null);
    setViolations(null);
    setResult(null);
    setStatus("idle");
  }, []);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const raw = await file.text();
        setText(raw);
        setDryCleanForText(null);
        resetRunState();
      } catch (err) {
        setError(`Could not read that file: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [resetRunState]
  );

  const run = useCallback(
    async (mode: "dry" | "apply") => {
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(text);
      } catch (err) {
        setStatus("failure");
        setError(`Not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      setStatus("running");
      resetRunState();
      try {
        const headers = (await authHeaders({ "Content-Type": "application/json" })) ?? undefined;
        const resp = await fetch(`/api/admin/statutory-rows?mode=${mode}`, {
          method: "POST",
          headers,
          body: JSON.stringify(parsedBody),
        });
        const payload = await resp.json();
        if (!resp.ok) {
          setStatus("failure");
          if (Array.isArray((payload as ValidationFailure)?.violations)) {
            setViolations((payload as ValidationFailure).violations);
            setError((payload as ValidationFailure).error);
          } else {
            setError(payload?.error || `Request failed (HTTP ${resp.status})`);
          }
          setDryCleanForText(null);
          return;
        }
        setResult(payload as RunResult);
        setStatus("result");
        if (mode === "dry" && (payload as RunResult).counts.refused === 0 && (payload as RunResult).counts.errored === 0) {
          setDryCleanForText(text);
        } else {
          setDryCleanForText(null);
        }
      } catch (err) {
        setStatus("failure");
        setError(err instanceof Error ? err.message : "Network error , the run did not complete.");
        setDryCleanForText(null);
      }
    },
    [text, resetRunState]
  );

  const canApply = dryCleanForText !== null && dryCleanForText === text && status !== "running";

  return (
    <AdminPanelFrame title="Statutory rows">
      <div style={{ padding: 20, display: "grid", gap: 14 }}>
        <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>
          Upload a reviewed statutory rows-file (FuelEU Maritime Annex IV, ship-year figures with a real
          citation and a rated source per row) to write <code style={{ fontFamily: "monospace" }}>statutory_computations</code>.
          Run dry first , it writes nothing and shows exactly what each row would do. Apply unlocks only
          after a clean dry run of this same file; editing the text re-locks it. A fixture, synthetic, or
          placeholder marker anywhere in the file is refused before any row is read.
        </p>

        <FilePickRow
          label="Choose rows-file JSON"
          hint="or paste JSON below"
          accept=".json,application/json"
          onFile={handleFile}
          icon={<UploadCloud size={14} />}
          inputRef={fileInputRef}
        />

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDryCleanForText(null);
            resetRunState();
          }}
          placeholder='{"rows": [{ "shipKey": "...", "targetYear": 2025, "ghgIntensityActual": {...}, "energyUsedMJ": {...}, "consecutiveDeficitYears": {...} }]}'
          spellCheck={false}
          rows={10}
          style={fieldStyle()}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => run("dry")} disabled={!text.trim() || status === "running"}>
            <PlayCircle size={14} />
            {status === "running" ? "Running..." : "Run dry"}
          </Button>
          <Button variant="primary" onClick={() => run("apply")} disabled={!canApply}>
            <CheckCircle2 size={14} />
            {status === "running" ? "Running..." : "Apply"}
          </Button>
          {!canApply && status !== "running" && (
            <span style={{ fontSize: 10.5, color: "var(--text-2)" }}>
              Apply unlocks after a clean dry run of this exact file text.
            </span>
          )}
        </div>

        {error && (
          <InlineErrorBanner message={error}>
            {violations && violations.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {violations.map((v, i) => (
                  <li key={i} style={{ fontSize: 11.5, lineHeight: 1.6 }}>{v}</li>
                ))}
              </ul>
            )}
          </InlineErrorBanner>
        )}

        {status === "result" && result && (
          <div style={{ display: "grid", gap: 10 }}>
            <div
              style={{
                fontSize: 12,
                padding: "10px 12px",
                borderRadius: 6,
                border: `1px solid ${result.mode === "apply" ? "var(--color-success)" : "var(--color-border-medium)"}`,
                background: result.mode === "apply" ? "rgba(22,163,74,0.05)" : "var(--raised)",
                color: "var(--text)",
              }}
            >
              {result.mode === "apply" ? "Applied" : "Dry run"}: {result.total} row{result.total === 1 ? "" : "s"} ,{" "}
              written {result.counts.written}, would-write {result.counts.wouldWrite}, already computed{" "}
              {result.counts.skippedAlready}, refused {result.counts.refused}, errored {result.counts.errored}.
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              {result.outcomes.map((o) => (
                <div
                  key={o.index}
                  style={{
                    fontSize: 11.5,
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--color-border)",
                    background: "var(--surface)",
                  }}
                >
                  <strong style={{ color: "var(--text-2)" }}>
                    Row {o.index}{o.shipKey ? ` (${o.shipKey})` : ""}:
                  </strong>{" "}
                  <span style={{ color: "var(--text)" }}>{ACTION_LABEL[o.action] ?? o.action}</span>
                  {(o.action === "refused-structural" || o.action === "refused-inadmissible" || o.action === "errored") &&
                    o.detail != null && (
                      <div style={{ marginTop: 4, color: "var(--text-2)" }}>
                        {typeof o.detail === "string" ? o.detail : JSON.stringify(o.detail)}
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminPanelFrame>
  );
}
