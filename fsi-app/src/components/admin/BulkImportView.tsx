"use client";

/**
 * BulkImportView — admin sub-tab for uploading a CSV file or pasting a
 * JSON array of candidate sources, validating each row via HEAD requests
 * and (when present) the W2.F verification pipeline, and applying the
 * preview to either `sources` (auto-approve) or `provisional_sources`
 * (queue for review).
 *
 * Backed by:
 *   POST /api/admin/sources/bulk-import
 *
 * Renders:
 *   1. Two-tab toggle: CSV upload / JSON paste
 *   2. Options panel: defaultJurisdictionIso (comma list), dryRun toggle,
 *      autoVerify toggle
 *   3. Preview button → calls API with dryRun=true, renders preview table
 *   4. Commit button (disabled until preview ran) → applies the same input
 *      with dryRun=false, surfaces apply counters in a toast.
 *
 * Visual idiom mirrors IntegrityFlagsView so the sub-tab feels native to
 * the existing admin shell.
 */

import { useCallback, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Copy,
  Eye,
} from "lucide-react";

type Format = "csv" | "json";

interface PreviewRow {
  row_index: number;
  url: string;
  name: string;
  head_status: number | "error";
  head_reason?: string;
  duplicate_of_source_id: string | null;
  validation_errors: string[];
  proposed_action:
    | "auto-approve"
    | "queue-provisional"
    | "reject"
    | "duplicate";
}

interface BulkImportResponse {
  preview: PreviewRow[];
  summary: {
    total_rows: number;
    valid: number;
    invalid: number;
    duplicates: number;
  };
  applied?: {
    sources_inserted: number;
    provisional_inserted: number;
    rejected: number;
  };
}

const CSV_TEMPLATE =
  "url,name,type,jurisdiction_iso,language,notes\n" +
  'https://example.com,Example Source,regulator,"US|EU",en,Optional notes\n';

const JSON_TEMPLATE = JSON.stringify(
  [
    {
      url: "https://example.com",
      name: "Example Source",
      type: "regulator",
      jurisdiction_iso: ["US", "EU"],
      language: "en",
      notes: "Optional notes",
    },
  ],
  null,
  2
);

export function BulkImportView() {
  const [format, setFormat] = useState<Format>("csv");
  const [csvText, setCsvText] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [defaultJurisdiction, setDefaultJurisdiction] = useState("");
  const [autoVerify, setAutoVerify] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulkImportResponse | null>(null);
  const [toast, setToast] = useState("");

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4500);
  };

  const activeData = format === "csv" ? csvText : jsonText;
  const canPreview = activeData.trim().length > 0 && !previewLoading;
  const canCommit =
    !!preview &&
    !committing &&
    !previewLoading &&
    preview.summary.valid > 0;

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        setCsvText(text);
        setPreview(null);
        setError(null);
      } catch (err) {
        setError(
          `Failed to read file: ${(err as Error).message || "unknown error"}`
        );
      }
    },
    []
  );

  const callApi = useCallback(
    async (dryRun: boolean): Promise<BulkImportResponse | null> => {
      const data = format === "csv" ? csvText : jsonText;
      if (!data.trim()) {
        setError("Provide CSV or JSON content before running preview");
        return null;
      }

      const defaultJurisdictionIso = defaultJurisdiction
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const resp = await fetch("/api/admin/sources/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          format,
          data,
          options: {
            dryRun,
            autoVerify,
            defaultJurisdictionIso:
              defaultJurisdictionIso.length > 0
                ? defaultJurisdictionIso
                : undefined,
          },
        }),
      });
      const payload = await resp.json();
      if (!resp.ok) {
        setError(payload?.error || `Request failed (${resp.status})`);
        return null;
      }
      return payload as BulkImportResponse;
    },
    [autoVerify, csvText, defaultJurisdiction, format, jsonText, supabase]
  );

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    setError(null);
    try {
      const result = await callApi(true);
      if (result) setPreview(result);
    } catch (e) {
      setError((e as Error).message || "Network error");
    } finally {
      setPreviewLoading(false);
    }
  }, [callApi]);

  const handleCommit = useCallback(async () => {
    setCommitting(true);
    setError(null);
    try {
      const result = await callApi(false);
      if (result) {
        setPreview(result);
        const a = result.applied;
        if (a) {
          showToast(
            `${a.sources_inserted} source${a.sources_inserted === 1 ? "" : "s"} imported, ${a.provisional_inserted} queued for review, ${a.rejected} rejected.`
          );
        }
      }
    } catch (e) {
      setError((e as Error).message || "Network error");
    } finally {
      setCommitting(false);
    }
  }, [callApi]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Bulk-add sources
          </h2>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Upload a CSV file or paste a JSON array of candidate sources. Each
            row is validated via a HEAD request and checked for duplicates
            against the registry. Preview is the safer default — commit only
            after reviewing the table.
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b" style={{ borderColor: "var(--color-border)" }}>
        <FormatTabButton
          active={format === "csv"}
          onClick={() => {
            setFormat("csv");
            setPreview(null);
            setError(null);
          }}
          label="CSV upload"
          icon={<Upload size={12} />}
        />
        <FormatTabButton
          active={format === "json"}
          onClick={() => {
            setFormat("json");
            setPreview(null);
            setError(null);
          }}
          label="JSON paste"
          icon={<FileText size={12} />}
        />
      </div>

      {format === "csv" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium cursor-pointer"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
                backgroundColor: "var(--color-surface-raised)",
              }}
            >
              <Upload size={12} />
              Choose CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCsvText(CSV_TEMPLATE);
                setPreview(null);
                setError(null);
              }}
              type="button"
            >
              <Copy size={12} />
              Insert template
            </Button>
            <span
              className="text-[11px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              Required header: url,name,type,jurisdiction_iso,language,notes
            </span>
          </div>
          <textarea
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setPreview(null);
            }}
            placeholder="Paste CSV content here, or upload a file above"
            spellCheck={false}
            className="w-full font-mono text-[12px] px-3 py-2 rounded-md border outline-none"
            style={{
              minHeight: 180,
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-background)",
              color: "var(--color-text-primary)",
            }}
          />
        </div>
      )}

      {format === "json" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setJsonText(JSON_TEMPLATE);
                setPreview(null);
                setError(null);
              }}
              type="button"
            >
              <Copy size={12} />
              Insert template
            </Button>
            <span
              className="text-[11px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              Array of objects with {`{ url, name, type?, jurisdiction_iso?, language?, notes? }`}
            </span>
          </div>
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setPreview(null);
            }}
            placeholder='[ { "url": "https://...", "name": "..." } ]'
            spellCheck={false}
            className="w-full font-mono text-[12px] px-3 py-2 rounded-md border outline-none"
            style={{
              minHeight: 220,
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-background)",
              color: "var(--color-text-primary)",
            }}
          />
        </div>
      )}

      <div
        className="p-4 rounded-md border space-y-3"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <h3
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          Options
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="space-y-1">
            <label
              className="block text-[11px] font-semibold"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Default jurisdiction ISO (comma-separated)
            </label>
            <input
              type="text"
              value={defaultJurisdiction}
              onChange={(e) => setDefaultJurisdiction(e.target.value)}
              placeholder="e.g. US,EU,GLOBAL"
              className="w-full px-3 py-1.5 text-xs rounded-md border outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-background)",
                color: "var(--color-text-primary)",
              }}
            />
            <p
              className="text-[10px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              Applied to rows that don&apos;t specify their own jurisdiction.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[12px] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoVerify}
              onChange={(e) => setAutoVerify(e.target.checked)}
            />
            <span style={{ color: "var(--color-text-primary)" }}>
              Run W2.F verification pipeline (when available)
            </span>
          </label>
          <div
            className="text-[11px] flex items-start gap-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            <AlertTriangle size={12} style={{ marginTop: 2 }} />
            <span>
              Preview is always non-destructive. Commit writes to{" "}
              <code>sources</code> or <code>provisional_sources</code> based on
              the proposed action.
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="md"
          onClick={handlePreview}
          disabled={!canPreview}
          type="button"
        >
          <Eye size={14} />
          {previewLoading ? "Validating…" : "Preview"}
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={handleCommit}
          disabled={!canCommit}
          type="button"
        >
          <CheckCircle size={14} />
          {committing ? "Importing…" : "Commit import"}
        </Button>
      </div>

      {error && (
        <div
          className="p-3 rounded-md text-sm"
          style={{
            color: "var(--color-error)",
            border: "1px solid var(--color-error)",
            backgroundColor: "rgba(220,38,38,0.04)",
          }}
        >
          {error}
        </div>
      )}

      {preview && <PreviewBlock preview={preview} />}

      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg border text-sm font-medium shadow-lg"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text-primary)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}
        >
          <CheckCircle size={14} className="inline mr-1.5" />
          {toast}
        </div>
      )}
    </div>
  );
}

function FormatTabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "relative",
        padding: "10px 16px",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
        borderBottom: active
          ? "3px solid var(--color-primary)"
          : "3px solid transparent",
        background: "transparent",
        cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function PreviewBlock({ preview }: { preview: BulkImportResponse }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total rows" value={String(preview.summary.total_rows)} />
        <Stat
          label="Valid"
          value={String(preview.summary.valid)}
          tone="success"
        />
        <Stat
          label="Invalid"
          value={String(preview.summary.invalid)}
          tone={preview.summary.invalid > 0 ? "error" : "neutral"}
        />
        <Stat
          label="Duplicates"
          value={String(preview.summary.duplicates)}
          tone={preview.summary.duplicates > 0 ? "warning" : "neutral"}
        />
      </div>

      {preview.applied && (
        <div
          className="p-3 rounded-md border text-xs"
          style={{
            borderColor: "var(--color-success)",
            backgroundColor: "rgba(22,163,74,0.04)",
            color: "var(--color-text-primary)",
          }}
        >
          <CheckCircle
            size={12}
            className="inline mr-1.5"
            style={{ color: "var(--color-success)" }}
          />
          Applied: {preview.applied.sources_inserted} inserted into sources,{" "}
          {preview.applied.provisional_inserted} queued provisionally,{" "}
          {preview.applied.rejected} rejected.
        </div>
      )}

      <div
        className="rounded-lg overflow-x-auto"
        style={{ border: "1px solid var(--color-border)" }}
      >
        <table className="w-full text-[12px] border-collapse">
          <thead style={{ background: "var(--color-surface-raised)" }}>
            <tr>
              <Th>Row</Th>
              <Th>Name</Th>
              <Th>URL</Th>
              <Th>HEAD</Th>
              <Th>Duplicate</Th>
              <Th>Errors</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {preview.preview.map((row) => (
              <tr
                key={row.row_index}
                style={{ borderTop: "1px solid var(--color-border)" }}
              >
                <Td>
                  <span
                    className="tabular-nums text-[11px]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    #{row.row_index + 1}
                  </span>
                </Td>
                <Td>
                  <span style={{ color: "var(--color-text-primary)" }}>
                    {row.name || "(unnamed)"}
                  </span>
                </Td>
                <Td>
                  <span
                    className="text-[11px] break-all"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {row.url || "—"}
                  </span>
                </Td>
                <Td>
                  <HeadStatusPill
                    status={row.head_status}
                    reason={row.head_reason}
                  />
                </Td>
                <Td>
                  {row.duplicate_of_source_id ? (
                    <span
                      className="text-[10px] font-mono"
                      style={{ color: "var(--color-warning)" }}
                    >
                      {row.duplicate_of_source_id.slice(0, 8)}…
                    </span>
                  ) : (
                    <span style={{ color: "var(--color-text-muted)" }}>—</span>
                  )}
                </Td>
                <Td>
                  {row.validation_errors.length > 0 ? (
                    <ul
                      className="text-[11px] space-y-0.5"
                      style={{ color: "var(--color-error)" }}
                    >
                      {row.validation_errors.map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                    </ul>
                  ) : (
                    <span style={{ color: "var(--color-text-muted)" }}>—</span>
                  )}
                </Td>
                <Td>
                  <ActionBadge action={row.proposed_action} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "error" | "warning" | "neutral";
}) {
  const color =
    tone === "success"
      ? "var(--color-success)"
      : tone === "error"
        ? "var(--color-error)"
        : tone === "warning"
          ? "var(--color-warning)"
          : "var(--color-text-primary)";
  return (
    <div
      className="p-3 rounded-md"
      style={{
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-wider mb-1"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </div>
      <div
        className="text-xl font-semibold tabular-nums"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="text-left px-3 py-2 font-bold text-[10px] uppercase tracking-wide"
      style={{
        color: "var(--color-text-secondary)",
        letterSpacing: "0.06em",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="px-3 py-2 align-top"
      style={{ color: "var(--color-text-primary)" }}
    >
      {children}
    </td>
  );
}

function HeadStatusPill({
  status,
  reason,
}: {
  status: number | "error";
  reason?: string;
}) {
  if (status === "error") {
    return (
      <span
        className="text-[10px] font-mono px-1.5 py-0.5 rounded"
        title={reason || "request failed"}
        style={{
          color: "var(--color-text-muted)",
          backgroundColor: "var(--color-surface-raised)",
        }}
      >
        ERR
      </span>
    );
  }
  const ok = status >= 200 && status < 400;
  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
      style={{
        color: ok ? "var(--color-success)" : "var(--color-error)",
        backgroundColor: ok
          ? "rgba(22,163,74,0.08)"
          : "rgba(220,38,38,0.08)",
        border: ok
          ? "1px solid rgba(22,163,74,0.2)"
          : "1px solid rgba(220,38,38,0.2)",
      }}
    >
      {status}
    </span>
  );
}

function ActionBadge({
  action,
}: {
  action: PreviewRow["proposed_action"];
}) {
  const cfg: Record<
    PreviewRow["proposed_action"],
    { label: string; color: string; bg: string }
  > = {
    "auto-approve": {
      label: "Auto-approve",
      color: "var(--color-success)",
      bg: "rgba(22,163,74,0.08)",
    },
    "queue-provisional": {
      label: "Queue review",
      color: "var(--color-primary)",
      bg: "var(--color-active-bg)",
    },
    duplicate: {
      label: "Duplicate",
      color: "var(--color-warning)",
      bg: "rgba(217, 119, 6, 0.08)",
    },
    reject: {
      label: "Reject",
      color: "var(--color-error)",
      bg: "rgba(220,38,38,0.08)",
    },
  };
  const c = cfg[action];
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
      style={{ color: c.color, backgroundColor: c.bg }}
    >
      {action === "reject" ? (
        <XCircle size={10} className="inline mr-1" />
      ) : (
        <CheckCircle size={10} className="inline mr-1" />
      )}
      {c.label}
    </span>
  );
}
