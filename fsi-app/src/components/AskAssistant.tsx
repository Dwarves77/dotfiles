"use client";

import { useState, useRef, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { MessageSquare, Send, X, Loader2, Bot } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function AskAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const sectorProfile = useWorkspaceStore((s) => s.sectorProfile);
  const jurisdictionWeights = useWorkspaceStore((s) => s.jurisdictionWeights);

  // Listen for open-ask-assistant events from AiPromptBar.
  // The event may carry { question } in detail; if present we auto-submit.
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ question?: string }>;
      const q = ce.detail?.question?.trim();
      setIsOpen(true);
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
        setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
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

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-xl border shadow-2xl flex flex-col"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
        height: "500px",
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
              I have access to all regulations, market data, and technology intelligence on the platform.
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
