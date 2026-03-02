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
          className="fixed bottom-6 left-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-[2px] border border-border-medium bg-surface-raised text-text-primary text-xs font-medium hover:bg-[var(--charcoal-light)] cursor-pointer transition-colors shadow-lg"
        >
          <FileText size={14} strokeWidth={2} />
          Export ({selectedIds.length})
        </button>
      )}

      {/* Panel */}
      {isOpen && (
        <div className="fixed bottom-6 left-6 z-50 w-80 border border-border-light rounded-[2px] bg-surface-raised shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <span className="text-xs font-semibold tracking-wider uppercase text-text-primary">
              Export ({orderedItems.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={clearSelection}
                className="text-text-secondary hover:text-[var(--critical)] cursor-pointer"
              >
                <Trash2 size={12} strokeWidth={2} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-text-secondary hover:text-text-primary cursor-pointer"
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
                className="flex items-center gap-2 px-2 py-1.5 rounded-[2px] hover:bg-surface-overlay cursor-grab active:cursor-grabbing"
              >
                <GripVertical size={12} className="text-text-secondary shrink-0" />
                <span className="text-xs text-text-primary truncate flex-1">
                  {r.title}
                </span>
              </div>
            ))}
          </div>

          {/* Format + Download */}
          <div className="px-4 py-3 border-t border-border-subtle space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => setFormat("html")}
                className={cn(
                  "flex-1 px-2 py-1.5 text-xs font-medium rounded-[2px] border cursor-pointer transition-colors",
                  format === "html"
                    ? "border-border-medium bg-active-bg text-text-primary"
                    : "border-border-subtle text-text-secondary"
                )}
              >
                HTML
              </button>
              <button
                onClick={() => setFormat("slack")}
                className={cn(
                  "flex-1 px-2 py-1.5 text-xs font-medium rounded-[2px] border cursor-pointer transition-colors",
                  format === "slack"
                    ? "border-border-medium bg-active-bg text-text-primary"
                    : "border-border-subtle text-text-secondary"
                )}
              >
                Slack
              </button>
            </div>
            <button
              onClick={handleDownload}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-[2px] border border-border-medium text-text-primary hover:bg-invert-bg hover:text-invert-text cursor-pointer transition-all duration-300"
              style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
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
