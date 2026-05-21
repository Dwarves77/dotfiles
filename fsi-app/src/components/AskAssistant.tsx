"use client";

import { useState, useRef, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Send, X, Loader2, Bot, ChevronDown, ChevronRight } from "lucide-react";

// Q8/OBS-28 (Sprint 2 Tier 3 Build 5): Citation rendering on the
// Intelligence Assistant. Backend assembles validated Citation[] per
// response with source attribution, tier, plus migration 088's
// citation_count + recency provenance. Frontend renders the answer text
// with a numbered footnote-style citation list and expandable provenance
// panels per cited source. v1 lists citations after the answer rather
// than inserting inline markers at the LLM-emitted positions; inline
// markers depend on text-position metadata the system prompt does not
// yet emit and iterate post-launch per dispatch brief.

type Citation = {
  item_id: string;
  title: string;
  source_id: string | null;
  source_url: string | null;
  source_name: string | null;
  // Phase 1.5 (Q2 base_tier + effective_tier split): wire format preserved
  // as a single resolved value. Server (api/ask/route.ts) resolves
  // source.effective_tier ?? source.base_tier ?? null per the Assistant
  // signal set (skill Section 8). The client receives the dynamic
  // credibility signal; no client-side fallback needed.
  source_tier: number | null;
  citation_count: number | null;
  recency: string | null;
};

type FlaggedCitation = {
  raw: string;
  reason: string;
};

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  flaggedCitations?: FlaggedCitation[];
}

// Tier label per environmental-policy-and-innovation source hierarchy.
// Numeric tier → short label rendered on the badge alongside the T-token.
function tierLabel(tier: number | null): string {
  if (tier == null) return "Unrated";
  switch (tier) {
    case 1: return "Binding regulator";
    case 2: return "Regulator guidance";
    case 3: return "Standards body";
    case 4: return "Trade association";
    case 5: return "Analytical press";
    case 6: return "Industry press";
    case 7: return "Other";
    default: return `Tier ${tier}`;
  }
}

function formatRecency(recency: string | null): string {
  if (!recency) return "";
  try {
    const d = new Date(recency);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function CitationPanel({ citation, index }: { citation: Citation; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const recencyStr = formatRecency(citation.recency);

  return (
    <div
      className="rounded-md border text-xs"
      style={{
        borderColor: "var(--color-border-subtle)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-2.5 py-2 flex items-start gap-2 cursor-pointer text-left"
        aria-expanded={expanded}
        aria-controls={`citation-${citation.item_id}-panel`}
      >
        <span
          className="font-semibold flex-shrink-0 mt-px"
          style={{ color: "var(--color-text-primary)" }}
        >
          [{index + 1}]
        </span>
        <span className="flex-1 min-w-0">
          <span
            className="font-medium block truncate"
            style={{ color: "var(--color-text-primary)" }}
            title={citation.title}
          >
            {citation.title}
          </span>
          <span className="flex flex-wrap gap-x-2 gap-y-1 mt-1 items-center">
            {citation.source_name && (
              <span style={{ color: "var(--color-text-secondary)" }}>
                {citation.source_name}
              </span>
            )}
            {citation.source_tier != null && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                style={{
                  backgroundColor: "var(--color-surface-raised)",
                  color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border-subtle)",
                }}
                title={tierLabel(citation.source_tier)}
              >
                T{citation.source_tier}
              </span>
            )}
            {typeof citation.citation_count === "number" && citation.citation_count > 0 && (
              <span
                className="text-[10px]"
                style={{ color: "var(--color-text-muted)" }}
                title="Citations to this source across the platform"
              >
                {citation.citation_count} cite{citation.citation_count === 1 ? "" : "s"}
              </span>
            )}
            {recencyStr && (
              <span
                className="text-[10px]"
                style={{ color: "var(--color-text-muted)" }}
                title="Most recent platform content from this source"
              >
                latest {recencyStr}
              </span>
            )}
          </span>
        </span>
        <span
          className="flex-shrink-0 mt-px"
          style={{ color: "var(--color-text-muted)" }}
          aria-hidden="true"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>

      {expanded && (
        <div
          id={`citation-${citation.item_id}-panel`}
          className="px-2.5 pb-2.5 pt-1 border-t space-y-1.5"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <dl className="space-y-1 text-[11px]">
            {citation.source_name && (
              <div className="flex gap-1.5">
                <dt
                  className="flex-shrink-0 font-medium"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Source:
                </dt>
                <dd style={{ color: "var(--color-text-primary)" }}>
                  {citation.source_name}
                </dd>
              </div>
            )}
            {citation.source_tier != null && (
              <div className="flex gap-1.5">
                <dt
                  className="flex-shrink-0 font-medium"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Tier:
                </dt>
                <dd style={{ color: "var(--color-text-primary)" }}>
                  T{citation.source_tier} - {tierLabel(citation.source_tier)}
                </dd>
              </div>
            )}
            {typeof citation.citation_count === "number" && (
              <div className="flex gap-1.5">
                <dt
                  className="flex-shrink-0 font-medium"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Citations:
                </dt>
                <dd style={{ color: "var(--color-text-primary)" }}>
                  {citation.citation_count} platform item
                  {citation.citation_count === 1 ? "" : "s"} reference this source
                </dd>
              </div>
            )}
            {recencyStr && (
              <div className="flex gap-1.5">
                <dt
                  className="flex-shrink-0 font-medium"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Most recent:
                </dt>
                <dd style={{ color: "var(--color-text-primary)" }}>{recencyStr}</dd>
              </div>
            )}
            {citation.source_url && (
              <div className="flex gap-1.5">
                <dt
                  className="flex-shrink-0 font-medium"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  URL:
                </dt>
                <dd className="min-w-0 flex-1">
                  <a
                    href={citation.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline break-all"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {citation.source_url}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

interface AnchorRect {
  top: number;
  left: number;
  width: number;
}

export function AskAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const sectorProfile = useWorkspaceStore((s) => s.sectorProfile);
  const jurisdictionWeights = useWorkspaceStore((s) => s.jurisdictionWeights);

  // Listen for open-ask-assistant events from AiPromptBar.
  // The event may carry { question, anchor } in detail. The anchor (the
  // submitting bar's bounding rect) lets the assistant drop down from the
  // bar's position; absence falls back to a top-center drawer.
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ question?: string; anchor?: AnchorRect | null }>;
      const q = ce.detail?.question?.trim();
      const a = ce.detail?.anchor;
      setIsOpen(true);
      setAnchor(a ?? null);
      if (q) {
        setInput(q);
        setTimeout(() => {
          handleAskWithQuestion(q);
        }, 0);
      }
    };
    window.addEventListener("open-ask-assistant", handler);
    return () => window.removeEventListener("open-ask-assistant", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAskWithQuestion = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Please sign in to use the AI assistant." }]);
        setLoading(false);
        return;
      }

      const resp = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question,
          sectorProfile,
          jurisdictions: Object.keys(jurisdictionWeights || {}),
        }),
      });

      const data = await resp.json();

      if (data.error) {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error}` }]);
      } else {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: data.answer,
          citations: Array.isArray(data.citations) ? data.citations : undefined,
          flaggedCitations: Array.isArray(data.flagged_citations) ? data.flagged_citations : undefined,
        }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to reach the AI assistant. Please try again." }]);
    }

    setLoading(false);
    setTimeout(() => messagesEnd.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleAsk = () => handleAskWithQuestion(input);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg cursor-pointer transition-transform hover:scale-105"
        style={{
          backgroundColor: "var(--color-invert-bg)",
          color: "var(--color-invert-text)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        }}
        aria-label="Open AI assistant"
      >
        <Bot size={18} />
        <span className="text-sm font-medium hidden sm:inline">Ask AI</span>
      </button>
    );
  }

  // Drop-down positioning: if a bar anchor was supplied, drop down from
  // its position (top = anchor.bottom + small gap; horizontally anchored
  // to the bar's left edge + matched width, capped at 768px to avoid
  // overrunning narrow viewports). If no anchor (floating-button launch),
  // render as a top-center drawer below the global header.
  const VIEWPORT_GUTTER = 16;
  const PANEL_MAX_WIDTH = 768;
  const PANEL_HEIGHT = "min(70vh, 560px)";

  const positioningStyle: React.CSSProperties = anchor
    ? {
        position: "fixed",
        top: Math.round(anchor.top + 8),
        left: Math.round(
          Math.max(
            VIEWPORT_GUTTER,
            Math.min(
              anchor.left,
              (typeof window !== "undefined" ? window.innerWidth : 1280) -
                Math.min(anchor.width, PANEL_MAX_WIDTH) -
                VIEWPORT_GUTTER
            )
          )
        ),
        width: Math.min(Math.max(anchor.width, 360), PANEL_MAX_WIDTH),
        maxHeight: PANEL_HEIGHT,
        height: PANEL_HEIGHT,
        zIndex: 50,
      }
    : {
        position: "fixed",
        top: 72,
        left: "50%",
        transform: "translateX(-50%)",
        width: `min(calc(100vw - ${VIEWPORT_GUTTER * 2}px), ${PANEL_MAX_WIDTH}px)`,
        maxHeight: PANEL_HEIGHT,
        height: PANEL_HEIGHT,
        zIndex: 50,
      };

  return (
    <div
      className="rounded-xl border shadow-2xl flex flex-col"
      style={{
        ...positioningStyle,
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b rounded-t-xl"
        style={{ borderColor: "var(--color-border-subtle)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <div className="flex items-center gap-2">
          <Bot size={16} style={{ color: "var(--color-primary)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Intelligence Assistant
          </span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          aria-label="Close assistant"
          className="cursor-pointer"
          style={{ color: "var(--color-text-muted)" }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Bot size={32} style={{ color: "var(--color-text-muted)" }} className="mx-auto mb-3" />
            <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
              Ask me anything about freight sustainability
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
              I can help you surface relevant content across the platform: regulations, market signals, research, jurisdictional operations intelligence, and community discussions. I help you find what is relevant; you make the decision.
            </p>
            <div className="mt-4 space-y-1.5">
              {[
                "How will crude oil prices affect my air freight costs?",
                "What CBAM deadlines do I need to prepare for?",
                "Which EV trucks are viable for 200-mile drayage routes?",
                "Summarize the EU packaging regulation impact on freight",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="block w-full text-left text-xs px-3 py-2 rounded-md cursor-pointer transition-colors"
                  style={{
                    color: "var(--color-text-secondary)",
                    backgroundColor: "var(--color-surface-raised)",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className="max-w-[85%] px-3 py-2 rounded-lg text-xs leading-relaxed"
              style={{
                backgroundColor: msg.role === "user" ? "var(--color-invert-bg)" : "var(--color-surface-raised)",
                color: msg.role === "user" ? "var(--color-invert-text)" : "var(--color-text-primary)",
              }}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                <div
                  className="mt-3 pt-2 border-t space-y-1.5"
                  style={{ borderColor: "var(--color-border-subtle)" }}
                >
                  <div
                    className="text-[10px] uppercase tracking-wide font-semibold"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Sources cited ({msg.citations.length})
                  </div>
                  {msg.citations.map((c, idx) => (
                    <CitationPanel key={c.item_id} citation={c} index={idx} />
                  ))}
                </div>
              )}

              {msg.role === "assistant" && msg.flaggedCitations && msg.flaggedCitations.length > 0 && (
                <div
                  className="mt-2 pt-2 border-t text-[10px]"
                  style={{
                    borderColor: "var(--color-border-subtle)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <span className="font-semibold">
                    {msg.flaggedCitations.length} unverified reference
                    {msg.flaggedCitations.length === 1 ? "" : "s"}
                  </span>{" "}
                  flagged by server-side validation and excluded from the source list above.
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-lg" style={{ backgroundColor: "var(--color-surface-raised)" }}>
              <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-primary)" }} />
            </div>
          </div>
        )}

        <div ref={messagesEnd} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
            placeholder="Ask about regulations, costs, technology..."
            className="flex-1 px-3 py-2 text-sm rounded-md border outline-none"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-background)",
              color: "var(--color-text-primary)",
            }}
          />
          <button
            onClick={handleAsk}
            disabled={loading || !input.trim()}
            className="px-3 py-2 rounded-md cursor-pointer disabled:opacity-40 transition-colors"
            style={{
              backgroundColor: "var(--color-invert-bg)",
              color: "var(--color-invert-text)",
            }}
            aria-label="Send message"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
