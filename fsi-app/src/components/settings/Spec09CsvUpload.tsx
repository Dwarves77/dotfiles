"use client";

/**
 * Spec09CsvUpload — the customer-facing half of the spec-09 CSV upload flow (plan §W5.1, lane SPEC09-B,
 * 2026-09-05). Lets a workspace member (member/admin/owner — a viewer is refused by the API route) upload
 * their own operational data for one of the six customer-data tables: surcharge_audits, tce_data_quality,
 * auxiliary_energy_profiles, eudr_plot_claims, custody_chains, indexation_clauses.
 *
 * Backed by: POST /api/workspace/spec09-upload — { table, csv } in the body; org id is ALWAYS resolved
 * server-side from the caller's own membership, never sent from here.
 *
 * UX CONTRACT (docs/design/ux-laws.md):
 *   - Honest empty state: nothing is claimed until an upload actually runs; the panel opens with a plain
 *     explanation of what this does and why (law 15 — never imply data exists that doesn't).
 *   - Every async step has a distinct, visible state: idle -> uploading -> success/failure (never a silent
 *     spinner-to-nothing).
 *   - Per-row rejection feedback: a rejected row's exact reason is shown next to its row number, not
 *     folded into one generic "some rows failed" line — the same "explain what went wrong" law applied at
 *     row granularity, matching BulkImportView's precedent for the platform-admin upload flow.
 *   - All interactive targets (select, buttons) are >=44px tall.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { InkButton, FieldLabel } from "@/components/account/AccountPrimitives";

// Mirrors src/lib/spec09/csv-upload-contract.mjs's UPLOAD_TABLES/TABLE_CONTRACTS keys and labels — kept as
// plain display data here rather than importing that module client-side (it is written for a Node/server
// runtime; the CLIENT's only job is to pass the raw CSV text through, the SAME contract module on the
// server does the one real parse — no logic is duplicated, only these display labels).
const UPLOAD_TABLES: Array<{ key: string; label: string; requiredHeaders: string }> = [
  { key: "surcharge_audits", label: "Surcharge audits (Market)", requiredHeaders: "corridor_id, carrier_id, invoice_line, billed_eur, statutory_eur, statutory_basis" },
  { key: "tce_data_quality", label: "DQI / data quality (Operations)", requiredHeaders: "tce_id, reliability, completeness, temporal_correlation, geographical_correlation, technological_correlation, primary_data_share" },
  { key: "auxiliary_energy_profiles", label: "Auxiliary energy profiles (Operations)", requiredHeaders: "load_type, kw_draw, duty_cycle, hours_typical" },
  { key: "eudr_plot_claims", label: "EUDR plot claims (Regulations)", requiredHeaders: "consignment_ref, validation_state" },
  { key: "custody_chains", label: "Custody chains (Regulations)", requiredHeaders: "credit_type, scheme, certificate_ref, double_count_check" },
  { key: "indexation_clauses", label: "Indexation clauses (Market)", requiredHeaders: "index_id, base_value, base_date, passthrough_pct, review_cadence, rounding_rule" },
];

interface RejectedRow {
  rowNumber: number;
  errors: string[];
}

interface UploadResponse {
  table: string;
  totalRows: number;
  accepted: number;
  rejected: RejectedRow[];
  inserted: number;
  insertedIds: string[];
}

type Status = "idle" | "uploading" | "success" | "failure";

export function Spec09CsvUpload() {
  const [tableKey, setTableKey] = useState(UPLOAD_TABLES[0].key);
  const [csvText, setCsvText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const activeTable = UPLOAD_TABLES.find((t) => t.key === tableKey) ?? UPLOAD_TABLES[0];

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setCsvText(text);
      setResult(null);
      setError(null);
      setStatus("idle");
    } catch (err) {
      setError(`Could not read that file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!csvText.trim()) {
      setError("Paste or choose a CSV file before uploading.");
      return;
    }
    setStatus("uploading");
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch("/api/workspace/spec09-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ table: tableKey, csv: csvText }),
      });
      const payload = await resp.json();
      if (!resp.ok) {
        setStatus("failure");
        setError(payload?.error || `Upload failed (HTTP ${resp.status})`);
        return;
      }
      setResult(payload as UploadResponse);
      setStatus("success");
    } catch (err) {
      setStatus("failure");
      setError(err instanceof Error ? err.message : "Network error — the upload did not complete.");
    }
  }, [csvText, tableKey, supabase]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p style={{ fontSize: "11.5px", color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.6 }}>
        Upload your own operational data — a carrier invoice line, a shipment&apos;s data-quality inputs, an
        auxiliary equipment profile, an EUDR consignment filing, a custody certificate, or a contract&apos;s
        indexation terms. Nothing is shared outside your organization; rows are visible only to your own
        workspace members. A row that fails validation is rejected with its exact reason below — it is never
        silently dropped or guessed at.
      </p>

      <div>
        <FieldLabel>Table</FieldLabel>
        <select
          value={tableKey}
          onChange={(e) => {
            setTableKey(e.target.value);
            setResult(null);
            setError(null);
            setStatus("idle");
          }}
          style={{
            width: "100%",
            minHeight: 44,
            fontSize: 13,
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border-medium)",
            background: "var(--color-background)",
            color: "var(--color-text-primary)",
          }}
        >
          {UPLOAD_TABLES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <p style={{ fontSize: 10.5, color: "var(--color-text-muted)", margin: "6px 0 0" }}>
          Required columns: {activeTable.requiredHeaders}
        </p>
      </div>

      <div>
        <FieldLabel>CSV</FieldLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              minHeight: 44,
              padding: "0 16px",
              borderRadius: 6,
              border: "1px solid var(--color-border-medium)",
              background: "var(--surface)",
              color: "var(--color-text-primary)",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Choose CSV file
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "none" }} />
          </label>
          <span style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>
            or paste CSV text below
          </span>
        </div>
        <textarea
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value);
            setResult(null);
            setError(null);
            setStatus("idle");
          }}
          placeholder={`${activeTable.requiredHeaders}\n...`}
          spellCheck={false}
          rows={8}
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontFamily: "monospace",
            fontSize: 12,
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border-medium)",
            background: "var(--color-background)",
            color: "var(--color-text-primary)",
            resize: "vertical",
          }}
        />
      </div>

      <div>
        <InkButton onClick={handleUpload} disabled={status === "uploading"} style={{ minHeight: 44 }}>
          {status === "uploading" ? "Uploading…" : "Upload"}
        </InkButton>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-error)",
            background: "rgba(220,38,38,0.05)",
            color: "var(--color-error)",
          }}
        >
          {error}
        </div>
      )}

      {status === "success" && result && (
        <div style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              fontSize: 12,
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid var(--color-success)",
              background: "rgba(22,163,74,0.05)",
              color: "var(--color-text-primary)",
            }}
          >
            {result.inserted} of {result.totalRows} row{result.totalRows === 1 ? "" : "s"} uploaded to{" "}
            <strong>{activeTable.label}</strong>.
            {result.rejected.length > 0 && ` ${result.rejected.length} rejected — see below.`}
          </div>

          {result.rejected.length > 0 && (
            <div>
              <FieldLabel>Rejected rows</FieldLabel>
              <div style={{ display: "grid", gap: 6 }}>
                {result.rejected.map((r) => (
                  <div
                    key={r.rowNumber}
                    style={{
                      fontSize: 11.5,
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-bg-surface)",
                    }}
                  >
                    <strong style={{ color: "var(--color-text-secondary)" }}>Row {r.rowNumber}:</strong>{" "}
                    <span style={{ color: "var(--color-text-primary)" }}>{r.errors.join("; ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
