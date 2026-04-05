"use client";

import { cn } from "@/lib/cn";
import { useExportStore } from "@/stores/exportStore";
import { useResourceStore } from "@/stores/resourceStore";
import { downloadFile } from "@/lib/export/download";
import { toEmailHTML } from "@/lib/export/htmlReport";
import { toSlack } from "@/lib/export/slackFormat";
import type { Resource, ChangeLogEntry, Dispute } from "@/types/resource";
import { X, GripVertical, FileText, Hash, Trash2 } from "lucide-react";
import { useCallback, useRef } from "react";

interface ExportBuilderProps {
  resources: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  onToast: (msg: string) => void;
}

export function ExportBuilder({ resources, changelog, disputes, onToast }: ExportBuilderProps) {
  const {
    selectedIds,
    dragOrder,
    format,
    isOpen,
    setOpen,
    setDragOrder,
    setFormat,
    clearSelection,
  } = useExportStore();

  const dragIdx = useRef<number | null>(null);

  const orderedItems = (dragOrder.length ? dragOrder : selectedIds)
    .map((id) => resources.find((r) => r.id === id))
    .filter(Boolean) as Resource[];

  const handleDragStart = useCallback((idx: number) => {
    dragIdx.current = idx;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const newOrder = [...(dragOrder.length ? dragOrder : selectedIds)];
    const [item] = newOrder.splice(dragIdx.current, 1);
    newOrder.splice(idx, 0, item);
    setDragOrder(newOrder);
    dragIdx.current = idx;
  }, [dragOrder, selectedIds, setDragOrder]);

  const handleDownload = useCallback(() => {
    const date = new Date().toISOString().slice(0, 10);
    if (format === "html") {
      const html = toEmailHTML(orderedItems, "Selected Resources", date, changelog, disputes);
      downloadFile(html, `export_${date}.html`);
    } else {
      const text = toSlack(orderedItems, "Selected Resources", date, changelog, disputes);
      downloadFile(text, `export_${date}_slack.txt`, "text/plain");
    }
    onToast("File downloaded");
  }, [orderedItems, format, changelog, disputes, onToast]);

  if (selectedIds.length === 0) return null;

  return (
    <>
      {/* Floating trigger */}
      {!isOpen && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 left-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text-primary)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}
        >
          <FileText size={14} strokeWidth={2} />
          Export ({selectedIds.length})
        </button>
      )}

      {/* Panel */}
      {isOpen && (
        <div
          className="fixed bottom-6 left-6 z-50 w-80 border rounded-lg"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "var(--color-border-subtle)" }}
          >
            <h3 className="text-xs font-semibold tracking-wider uppercase"
              style={{ color: "var(--color-text-primary)" }}>
              Export ({orderedItems.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={clearSelection}
                aria-label="Clear export selection"
                className="cursor-pointer transition-colors"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <Trash2 size={12} strokeWidth={2} />
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close export panel"
                className="cursor-pointer transition-colors"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Item list */}
          <div className="max-h-60 overflow-y-auto px-2 py-2 space-y-1">
            {orderedItems.map((r, idx) => (
              <div
                key={r.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab active:cursor-grabbing transition-colors"
                style={{ backgroundColor: "transparent" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-raised)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <GripVertical size={12} style={{ color: "var(--color-text-muted)" }} className="shrink-0" />
                <span className="text-xs truncate flex-1" style={{ color: "var(--color-text-primary)" }}>
                  {r.title}
                </span>
              </div>
            ))}
          </div>

          {/* Format + Download */}
          <div
            className="px-4 py-3 border-t space-y-2"
            style={{ borderColor: "var(--color-border-subtle)" }}
          >
            <div className="flex gap-2">
              {(["html", "slack"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className="flex-1 px-2 py-1.5 text-xs font-medium rounded-md border cursor-pointer transition-colors"
                  style={{
                    borderColor: format === f ? "var(--color-active-border)" : "var(--color-border)",
                    backgroundColor: format === f ? "var(--color-active-bg)" : "transparent",
                    color: format === f ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  }}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={handleDownload}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border cursor-pointer transition-all duration-200"
              style={{
                borderColor: "transparent",
                backgroundColor: "var(--color-invert-bg)",
                color: "var(--color-invert-text)",
              }}
            >
              {format === "html" ? <FileText size={12} /> : <Hash size={12} />}
              Download {format.toUpperCase()}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
