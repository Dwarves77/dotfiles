"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { SHARE_LEVELS, APP_NAME } from "@/lib/constants";
import { downloadFile, safeName } from "@/lib/export/download";
import { buildShareHTML, buildShareSlack } from "@/lib/export/shareBuilder";
import type { Resource, ChangeLogEntry, Dispute } from "@/types/resource";
import { FileText, Hash, X } from "lucide-react";

interface ShareMenuProps {
  resource: Resource;
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  onClose: () => void;
  onToast: (msg: string) => void;
}

type Level = "summary" | "standard" | "full";
type Format = "html" | "slack";

export function ShareMenu({ resource, changelog, disputes, onClose, onToast }: ShareMenuProps) {
  const [level, setLevel] = useState<Level>("standard");
  const [preview, setPreview] = useState<Format | null>(null);
  const date = new Date().toISOString().slice(0, 10);

  const handleDownload = (fmt: Format) => {
    const name = safeName(resource.title);
    if (fmt === "html") {
      const html = buildShareHTML(resource, level, date, changelog, disputes);
      downloadFile(html, `${name}.html`);
    } else {
      const text = buildShareSlack(resource, level, date, changelog, disputes);
      downloadFile(text, `${name}_slack.txt`, "text/plain");
    }
    onToast("File downloaded");
  };

  return (
    <div
      className="border border-white/10 rounded-[2px] bg-[var(--charcoal)] p-4 space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider uppercase text-white">
          Share
        </span>
        <button onClick={onClose} className="text-[var(--sage)] hover:text-white cursor-pointer">
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>

      {/* Detail Level */}
      <div className="space-y-1.5">
        {(Object.entries(SHARE_LEVELS) as [Level, { label: string; description: string }][]).map(
          ([key, { label, description }]) => (
            <button
              key={key}
              onClick={() => setLevel(key)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-[2px] border text-xs transition-all duration-200 cursor-pointer",
                level === key
                  ? "border-white/15 bg-white/8 text-white"
                  : "border-white/6 text-[var(--sage)] hover:border-white/10"
              )}
            >
              <span className="font-medium">{label}</span>
              <span className="ml-2 text-xs opacity-60">{description}</span>
            </button>
          )
        )}
      </div>

      {/* Download Buttons */}
      <div className="flex gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); handleDownload("html"); }}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-[2px] border border-white/10 text-white hover:bg-white/5 cursor-pointer transition-colors"
        >
          <FileText size={12} strokeWidth={2} />
          HTML
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDownload("slack"); }}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-[2px] border border-white/10 text-white hover:bg-white/5 cursor-pointer transition-colors"
        >
          <Hash size={12} strokeWidth={2} />
          Slack
        </button>
      </div>
    </div>
  );
}
