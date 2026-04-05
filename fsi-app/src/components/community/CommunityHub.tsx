"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { ForumSection, ForumThread, CaseStudy } from "@/types/community";
import {
  MessageSquare, BookOpen, Store, Globe, Hash,
  ChevronRight, Users, Pin, Lock, MessageCircle,
  Eye, ThumbsUp, ArrowLeft,
} from "lucide-react";

interface CommunityHubProps {
  sections: ForumSection[];
  recentThreads: any[];
  caseStudies: CaseStudy[];
  userId: string;
}

export function CommunityHub({ sections, recentThreads, caseStudies, userId }: CommunityHubProps) {
  const [activeView, setActiveView] = useState<"forums" | "vendors" | "case-studies">("forums");
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const regionalSections = sections.filter((s) => s.section_type === "regional");
  const topicalSections = sections.filter((s) => s.section_type === "topical");

  const tabs = [
    { id: "forums" as const, label: "Forums", icon: MessageSquare, count: sections.length },
    { id: "vendors" as const, label: "Vendor Directory", icon: Store, count: 0 },
    { id: "case-studies" as const, label: "Case Studies", icon: BookOpen, count: caseStudies.length },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-background)" }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <a href="/" className="flex items-center gap-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              <ArrowLeft size={12} /> Dashboard
            </a>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            Community
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
            Forums, vendor directory, and peer-validated case studies.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b mb-6" style={{ borderColor: "var(--color-border-subtle)" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setActiveView(t.id); setActiveSection(null); }}
              className="relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium cursor-pointer transition-colors"
              style={{ color: activeView === t.id ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}
            >
              <t.icon size={14} />
              {t.label}
              {t.count > 0 && (
                <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-secondary)" }}>
                  {t.count}
                </span>
              )}
              {activeView === t.id && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{ backgroundColor: "var(--color-primary)" }} />
              )}
            </button>
          ))}
        </div>

        {/* Forums View */}
        {activeView === "forums" && !activeSection && (
          <div className="space-y-6">
            {/* Regional Sections */}
            <div>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
                <Globe size={14} /> Regional Forums
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {regionalSections.map((s) => (
                  <SectionCard key={s.id} section={s} onClick={() => setActiveSection(s.id)} />
                ))}
              </div>
            </div>

            {/* Topical Sections */}
            <div>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
                <Hash size={14} /> Topic Forums
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {topicalSections.map((s) => (
                  <SectionCard key={s.id} section={s} onClick={() => setActiveSection(s.id)} />
                ))}
              </div>
            </div>

            {/* Recent Threads */}
            {recentThreads.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
                  Recent Discussions
                </h2>
                <div className="space-y-2">
                  {recentThreads.map((thread: any) => (
                    <ThreadRow key={thread.id} thread={thread} />
                  ))}
                </div>
              </div>
            )}

            {recentThreads.length === 0 && (
              <div className="text-center py-12">
                <MessageSquare size={24} style={{ color: "var(--color-text-muted)" }} className="mx-auto mb-3" />
                <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                  No discussions yet
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                  Be the first to start a conversation in any section.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Section Detail View */}
        {activeView === "forums" && activeSection && (
          <div>
            <button
              onClick={() => setActiveSection(null)}
              className="flex items-center gap-1 text-xs mb-4 cursor-pointer"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <ArrowLeft size={12} /> All Forums
            </button>
            {(() => {
              const section = sections.find((s) => s.id === activeSection);
              if (!section) return null;
              const sectionThreads = recentThreads.filter((t: any) => t.section_id === activeSection);
              return (
                <div>
                  <h2 className="text-lg font-bold mb-1" style={{ color: "var(--color-text-primary)" }}>
                    {section.name}
                  </h2>
                  <p className="text-xs mb-4" style={{ color: "var(--color-text-secondary)" }}>
                    {section.description}
                  </p>
                  {sectionThreads.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>No threads in this section yet</p>
                      <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>Start a discussion to get the conversation going.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sectionThreads.map((thread: any) => (
                        <ThreadRow key={thread.id} thread={thread} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Vendor Directory View */}
        {activeView === "vendors" && (
          <div className="text-center py-12">
            <Store size={24} style={{ color: "var(--color-text-muted)" }} className="mx-auto mb-3" />
            <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
              Vendor Directory
            </p>
            <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: "var(--color-text-secondary)" }}>
              Searchable by region, category, certification status. Peer-validated listings linked to the regulations they help address. Submit vendor recommendations in the Vendor Reviews forum section.
            </p>
          </div>
        )}

        {/* Case Studies View */}
        {activeView === "case-studies" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Case Studies ({caseStudies.length})
            </h2>
            {caseStudies.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen size={24} style={{ color: "var(--color-text-muted)" }} className="mx-auto mb-3" />
                <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>No case studies yet</p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                  Submit peer-validated documentation of sustainability projects.
                </p>
              </div>
            ) : (
              caseStudies.map((cs) => (
                <CaseStudyCard key={cs.id} caseStudy={cs} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section Card ──

function SectionCard({ section, onClick }: { section: ForumSection; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-lg border text-left cursor-pointer transition-colors"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
            {section.name}
          </span>
          {section.thread_count > 0 && (
            <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-secondary)" }}>
              {section.thread_count}
            </span>
          )}
        </div>
        <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: "var(--color-text-muted)" }}>
          {section.description}
        </p>
      </div>
      <ChevronRight size={14} style={{ color: "var(--color-text-muted)" }} />
    </button>
  );
}

// ── Thread Row ──

function ThreadRow({ thread }: { thread: any }) {
  const author = thread.profiles;
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg border transition-colors"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {thread.is_pinned && <Pin size={10} style={{ color: "var(--color-warning)" }} />}
          {thread.is_locked && <Lock size={10} style={{ color: "var(--color-text-muted)" }} />}
          <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
            {thread.title}
          </span>
        </div>
        {thread.body && (
          <p className="text-xs line-clamp-2 mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
            {thread.body}
          </p>
        )}
        <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          <span>{author?.display_name || "Anonymous"}</span>
          <span className="flex items-center gap-1"><MessageCircle size={10} /> {thread.reply_count}</span>
          <span className="flex items-center gap-1"><Eye size={10} /> {thread.view_count}</span>
          <span className="flex items-center gap-1"><ThumbsUp size={10} /> {thread.upvote_count}</span>
        </div>
      </div>
    </div>
  );
}

// ── Case Study Card ──

function CaseStudyCard({ caseStudy }: { caseStudy: CaseStudy }) {
  const [expanded, setExpanded] = useState(false);
  const statusColors: Record<string, string> = {
    submitted: "var(--color-text-muted)",
    under_review: "var(--color-warning)",
    peer_validated: "var(--color-success)",
    featured: "var(--color-primary)",
  };

  return (
    <div
      className="border rounded-lg overflow-hidden"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
              {caseStudy.title}
            </span>
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
              style={{
                color: statusColors[caseStudy.validation_status],
                backgroundColor: `${statusColors[caseStudy.validation_status]}12`,
                border: `1px solid ${statusColors[caseStudy.validation_status]}30`,
              }}>
              {caseStudy.validation_status.replace("_", " ")}
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {caseStudy.organization} · {caseStudy.industry_segment}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
          <div className="pt-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--color-text-muted)" }}>Challenge</h4>
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{caseStudy.challenge}</p>
          </div>
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--color-text-muted)" }}>Solution</h4>
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{caseStudy.solution}</p>
          </div>
          {caseStudy.measurable_outcome && (
            <div className="p-2.5 rounded-lg" style={{ backgroundColor: "var(--color-active-bg)", borderLeft: "3px solid var(--color-primary)" }}>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--color-primary)" }}>Measurable Outcome</h4>
              <p className="text-xs" style={{ color: "var(--color-text-primary)" }}>{caseStudy.measurable_outcome}</p>
            </div>
          )}
          {caseStudy.source_attribution && (
            <p className="text-[11px] italic" style={{ color: "var(--color-text-muted)" }}>
              Source: {caseStudy.source_attribution}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            {caseStudy.region_tags?.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-secondary)" }}>{t}</span>
            ))}
            {caseStudy.vertical_tags?.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-secondary)" }}>{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
