"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { ForumSection, CaseStudy } from "@/types/community";
import {
  MessageSquare, BookOpen, Store, Globe, Hash,
  ChevronRight, ChevronDown, Pin, Lock, MessageCircle,
  Eye, ThumbsUp, ArrowLeft, Plus, Send, Info,
  ExternalLink, Shield, CheckCircle, Package,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

// ── Tag normalization ──
function humanizeTag(tag: string): string {
  return tag
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface CommunityHubProps {
  sections: ForumSection[];
  recentThreads: any[];
  caseStudies: CaseStudy[];
  userId: string;
}

export function CommunityHub({ sections, recentThreads, caseStudies, userId }: CommunityHubProps) {
  const [activeView, setActiveView] = useState<"forums" | "vendors" | "case-studies">("forums");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [showNewThread, setShowNewThread] = useState(false);
  const [forumSearch, setForumSearch] = useState("");
  const [showNewCaseStudy, setShowNewCaseStudy] = useState(false);
  const [showPeerInfo, setShowPeerInfo] = useState(false);

  const regionalSections = sections.filter((s) => s.section_type === "regional");
  const topicalSections = sections.filter((s) => s.section_type === "topical");

  // Count actual threads, not channels
  const totalThreads = recentThreads.length;

  const tabs = [
    { id: "forums" as const, label: "Forums", icon: MessageSquare, count: totalThreads },
    { id: "vendors" as const, label: "Vendor Directory", icon: Store, count: null },
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
            Connect with operators, share what works, and validate your approach against peers.
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
              {t.count !== null && t.count > 0 && (
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

        {/* ══════ FORUMS VIEW ══════ */}
        {activeView === "forums" && !activeSection && (
          <div className="space-y-6">
            {/* Search + New Thread */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search forums by keyword, regulation, or topic..."
                  value={forumSearch}
                  onChange={(e) => setForumSearch(e.target.value)}
                  className="w-full pl-3 pr-3 py-2 text-sm rounded-md border outline-none"
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                />
              </div>
              <Button variant="primary" size="sm" onClick={() => setShowNewThread(true)}>
                <Plus size={14} /> Start a Discussion
              </Button>
            </div>

            {/* New Thread Form */}
            {showNewThread && (
              <NewThreadForm
                sections={sections}
                userId={userId}
                onClose={() => setShowNewThread(false)}
              />
            )}

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

            {recentThreads.length === 0 && !showNewThread && (
              <div className="text-center py-12">
                <MessageSquare size={24} style={{ color: "var(--color-text-muted)" }} className="mx-auto mb-3" />
                <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                  No discussions yet
                </p>
                <p className="text-xs mt-1 mb-3" style={{ color: "var(--color-text-secondary)" }}>
                  Be the first to start a conversation.
                </p>
                <Button variant="primary" size="sm" onClick={() => setShowNewThread(true)}>
                  <Plus size={14} /> Start a Discussion
                </Button>
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
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
                        {section.name}
                      </h2>
                      <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                        {section.description}
                      </p>
                    </div>
                    <Button variant="primary" size="sm" onClick={() => setShowNewThread(true)}>
                      <Plus size={14} /> New Thread
                    </Button>
                  </div>

                  {showNewThread && (
                    <NewThreadForm
                      sections={sections}
                      userId={userId}
                      defaultSectionId={activeSection}
                      onClose={() => setShowNewThread(false)}
                    />
                  )}

                  {sectionThreads.length === 0 && !showNewThread ? (
                    <div className="text-center py-12">
                      <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>No threads in this section yet</p>
                      <p className="text-xs mt-1 mb-3" style={{ color: "var(--color-text-secondary)" }}>Start a discussion to get the conversation going.</p>
                      <Button variant="primary" size="sm" onClick={() => setShowNewThread(true)}>
                        <Plus size={14} /> Start a Discussion
                      </Button>
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

        {/* ══════ VENDOR DIRECTORY ══════ */}
        {activeView === "vendors" && (
          <VendorDirectory />
        )}

        {/* ══════ CASE STUDIES ══════ */}
        {activeView === "case-studies" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Case Studies ({caseStudies.length})
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPeerInfo(!showPeerInfo)}
                  className="flex items-center gap-1 text-xs cursor-pointer"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <Info size={12} /> What is Peer Validation?
                </button>
                <Button variant="primary" size="sm" onClick={() => setShowNewCaseStudy(true)}>
                  <Plus size={14} /> Submit Case Study
                </Button>
              </div>
            </div>

            {/* Peer validation explanation */}
            {showPeerInfo && (
              <div className="p-4 rounded-lg border" style={{ borderColor: "var(--color-primary)", backgroundColor: "var(--color-active-bg)" }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
                  <Shield size={14} className="inline mr-1.5" />
                  Peer Validation Process
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                  <strong>Peer Validated</strong> means two or more industry practitioners with verified credentials (LinkedIn-verified or staff-verified) have reviewed and confirmed the data in this case study. The platform does not certify anyone — community credibility is conferred through peer endorsement. Endorsement types: <em>Technically Sound</em> (data and methodology verified), <em>Replicated</em> (similar results achieved independently), <em>Recommended</em> (approach endorsed for replication).
                </p>
              </div>
            )}

            {/* New Case Study Form */}
            {showNewCaseStudy && (
              <NewCaseStudyForm userId={userId} onClose={() => setShowNewCaseStudy(false)} />
            )}

            {caseStudies.length === 0 && !showNewCaseStudy ? (
              <div className="text-center py-12">
                <BookOpen size={24} style={{ color: "var(--color-text-muted)" }} className="mx-auto mb-3" />
                <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>No case studies yet</p>
                <p className="text-xs mt-1 mb-3" style={{ color: "var(--color-text-secondary)" }}>
                  Submit peer-validated documentation of sustainability projects.
                </p>
                <Button variant="primary" size="sm" onClick={() => setShowNewCaseStudy(true)}>
                  <Plus size={14} /> Submit Case Study
                </Button>
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

// ══════════════════════════════════════════
// Section Card
// ══════════════════════════════════════════

function SectionCard({ section, onClick }: { section: ForumSection; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-lg border text-left cursor-pointer transition-colors hover:bg-[var(--color-surface-raised)]"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
            {section.name}
          </span>
          {section.thread_count > 0 && (
            <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-secondary)" }}>
              {section.thread_count} thread{section.thread_count !== 1 ? "s" : ""}
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

// ══════════════════════════════════════════
// Thread Row
// ══════════════════════════════════════════

function ThreadRow({ thread }: { thread: any }) {
  const author = thread.profiles;
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {thread.is_pinned && <Pin size={10} style={{ color: "var(--color-warning)" }} />}
          {thread.is_locked && <Lock size={10} style={{ color: "var(--color-text-muted)" }} />}
          <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{thread.title}</span>
        </div>
        {thread.body && (
          <p className="text-xs line-clamp-2 mb-1.5" style={{ color: "var(--color-text-secondary)" }}>{thread.body}</p>
        )}
        <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          <span>{author?.display_name || "Anonymous"}</span>
          <span className="flex items-center gap-1"><MessageCircle size={10} /> {thread.reply_count}</span>
          <span className="flex items-center gap-1"><Eye size={10} /> {thread.view_count}</span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// New Thread Form
// ══════════════════════════════════════════

function NewThreadForm({ sections, userId, defaultSectionId, onClose }: {
  sections: ForumSection[];
  userId: string;
  defaultSectionId?: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sectionId, setSectionId] = useState(defaultSectionId || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title || !sectionId) return;
    setSaving(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("forum_threads").insert({
      title,
      body,
      section_id: sectionId,
      author_id: userId,
    });
    setSaving(false);
    onClose();
    window.location.reload();
  };

  return (
    <div className="p-4 rounded-lg border space-y-3 mb-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>New Discussion</h3>
      <select
        value={sectionId}
        onChange={(e) => setSectionId(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-md border"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }}
      >
        <option value="">Select a forum section...</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Thread title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-md border"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }}
      />
      <textarea
        placeholder="Share your question, insight, or experience..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="w-full px-3 py-2 text-sm rounded-md border resize-none"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }}
      />
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving || !title || !sectionId}>
          <Send size={12} /> {saving ? "Posting..." : "Post"}
        </Button>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// New Case Study Form
// ══════════════════════════════════════════

function NewCaseStudyForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [org, setOrg] = useState("");
  const [challenge, setChallenge] = useState("");
  const [solution, setSolution] = useState("");
  const [outcome, setOutcome] = useState("");
  const [timeline, setTimeline] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title || !challenge || !solution) return;
    setSaving(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("case_studies").insert({
      title,
      organization: org,
      challenge,
      solution,
      measurable_outcome: outcome,
      timeline,
      submitter_id: userId,
      validation_status: "submitted",
    });
    setSaving(false);
    onClose();
    window.location.reload();
  };

  return (
    <div className="p-4 rounded-lg border space-y-3 mb-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Submit a Case Study</h3>
      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        Six structured fields. Peer validation requires two endorsements from verified members.
      </p>
      <input type="text" placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-md border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }} />
      <input type="text" placeholder="Organization" value={org} onChange={(e) => setOrg(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-md border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }} />
      <textarea placeholder="Challenge — What problem were you solving? *" value={challenge} onChange={(e) => setChallenge(e.target.value)} rows={3}
        className="w-full px-3 py-2 text-sm rounded-md border resize-none" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }} />
      <textarea placeholder="Solution — What did you implement? *" value={solution} onChange={(e) => setSolution(e.target.value)} rows={3}
        className="w-full px-3 py-2 text-sm rounded-md border resize-none" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }} />
      <input type="text" placeholder="Measurable outcome (e.g., 50% reduction, £146/unit)" value={outcome} onChange={(e) => setOutcome(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-md border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }} />
      <input type="text" placeholder="Timeline (e.g., 2024, Ongoing, Completed)" value={timeline} onChange={(e) => setTimeline(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-md border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }} />
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving || !title || !challenge || !solution}>
          <Send size={12} /> {saving ? "Submitting..." : "Submit for Review"}
        </Button>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// Vendor Directory
// ══════════════════════════════════════════

function VendorDirectory() {
  const [showSubmitForm, setShowSubmitForm] = useState(false);

  // Seed vendors for display (will come from DB once populated)
  const seedVendors = [
    { name: "Mtec Fine Art", region: "UK / Europe", products: ["Sustainable travel frames", "Low-carbon softwood plywood crating", "Recycled packaging materials"], sectors: ["Fine Art", "Museums"], verified: true },
    { name: "Chenue", region: "Europe", products: ["EV art transport fleet", "Biofuel-powered logistics", "Climate-controlled sustainable storage"], sectors: ["Fine Art", "Luxury"], verified: true },
    { name: "DNA Fine Art", region: "UK", products: ["Electric Sprinter couriers", "ULEZ-compliant fine art delivery", "Low-emission last-mile logistics"], sectors: ["Fine Art"], verified: false },
    { name: "Earthcrate", region: "Global", products: ["Reusable exhibition crating system", "Flat-pack sustainable crates", "ISPM 15-exempt materials"], sectors: ["Live Events", "Fine Art"], verified: false },
    { name: "Rokbox", region: "Global", products: ["Reusable artwork shipping cases", "ATA Carnet-compatible cases", "Custom foam-free interiors"], sectors: ["Fine Art", "Museums"], verified: false },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Vendor Directory
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
            Sustainable suppliers, operators, and products searchable by region and sector.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowSubmitForm(true)}>
          <Plus size={14} /> Submit a Vendor
        </Button>
      </div>

      {showSubmitForm && (
        <div className="p-4 rounded-lg border space-y-3" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Recommend a Vendor</h3>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Submit a vendor recommendation for review. Vendors require 3 peer endorsements from verified members to achieve Peer Validated status.
          </p>
          <VendorSubmitForm onClose={() => setShowSubmitForm(false)} />
        </div>
      )}

      {/* Vendor listings */}
      <div className="space-y-2">
        {seedVendors.map((vendor, i) => (
          <div
            key={i}
            className="p-4 rounded-lg border"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {vendor.name}
                </span>
                {vendor.verified && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ color: "var(--color-success)", backgroundColor: "rgba(22, 163, 74, 0.08)", border: "1px solid rgba(22, 163, 74, 0.2)" }}>
                    <CheckCircle size={8} /> Peer Validated
                  </span>
                )}
              </div>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{vendor.region}</span>
            </div>

            {/* Sustainable products — visible immediately */}
            <div className="mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                <Package size={9} className="inline mr-1" />
                Sustainable Products & Services
              </span>
              <ul className="mt-1 space-y-0.5">
                {vendor.products.map((p, j) => (
                  <li key={j} className="text-xs flex items-start gap-1.5" style={{ color: "var(--color-text-secondary)" }}>
                    <span style={{ color: "var(--color-success)" }}>•</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            {/* Sectors */}
            <div className="flex flex-wrap gap-1">
              {vendor.sectors.map((s) => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-md"
                  style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VendorSubmitForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [region, setRegion] = useState("");
  const [products, setProducts] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name) return;
    setSaving(true);
    const supabase = createSupabaseBrowserClient();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    await supabase.from("vendors").insert({
      name,
      slug,
      company_website: website || null,
      hq_region: region || null,
      description: products || null,
      service_regions: region ? [region] : [],
    });
    setSaving(false);
    onClose();
    window.location.reload();
  };

  return (
    <>
      <input type="text" placeholder="Vendor name *" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 text-sm rounded-md border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }} />
      <input type="text" placeholder="Website URL" value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full px-3 py-2 text-sm rounded-md border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }} />
      <input type="text" placeholder="Region (e.g., UK, Europe, Global)" value={region} onChange={(e) => setRegion(e.target.value)} className="w-full px-3 py-2 text-sm rounded-md border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }} />
      <textarea placeholder="What sustainable products or services do they offer?" value={products} onChange={(e) => setProducts(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm rounded-md border resize-none" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }} />
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving || !name}>
          <Send size={12} /> {saving ? "Submitting..." : "Submit for Review"}
        </Button>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </>
  );
}

// ══════════════════════════════════════════
// Case Study Card
// ══════════════════════════════════════════

function CaseStudyCard({ caseStudy }: { caseStudy: CaseStudy }) {
  const [expanded, setExpanded] = useState(false);
  const statusColors: Record<string, string> = {
    submitted: "var(--color-text-muted)",
    under_review: "var(--color-warning)",
    peer_validated: "var(--color-success)",
    featured: "var(--color-primary)",
  };

  return (
    <div className="border rounded-lg overflow-hidden" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-start gap-3 p-4 text-left cursor-pointer">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{caseStudy.title}</span>
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
              style={{ color: statusColors[caseStudy.validation_status], backgroundColor: `${statusColors[caseStudy.validation_status]}12`, border: `1px solid ${statusColors[caseStudy.validation_status]}30` }}>
              {humanizeTag(caseStudy.validation_status)}
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {caseStudy.organization} · {caseStudy.industry_segment}
          </p>
        </div>
        <ChevronDown size={14} className={cn("shrink-0 transition-transform duration-200", expanded && "rotate-180")} style={{ color: "var(--color-text-muted)" }} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
          <div className="pt-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--color-text-muted)" }}>Challenge</h4>
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>{caseStudy.challenge}</p>
          </div>
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--color-text-muted)" }}>Solution</h4>
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>{caseStudy.solution}</p>
          </div>
          {caseStudy.measurable_outcome && (
            <div className="p-2.5 rounded-lg" style={{ backgroundColor: "var(--color-active-bg)", borderLeft: "3px solid var(--color-primary)" }}>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--color-primary)" }}>Measurable Outcome</h4>
              <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-primary)" }}>{caseStudy.measurable_outcome}</p>
            </div>
          )}
          {caseStudy.source_attribution && (
            <p className="text-[11px] italic" style={{ color: "var(--color-text-muted)" }}>
              Data: {caseStudy.source_attribution}
            </p>
          )}
          {/* Normalized tags */}
          <div className="flex flex-wrap gap-1">
            {caseStudy.region_tags?.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-secondary)" }}>{humanizeTag(t)}</span>
            ))}
            {caseStudy.vertical_tags?.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-secondary)" }}>{humanizeTag(t)}</span>
            ))}
            {caseStudy.topic_tags?.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-secondary)" }}>{humanizeTag(t)}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
