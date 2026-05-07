"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { Plus, Trash2, Search, ExternalLink } from "lucide-react";

// ───────────────────────────────────────────────────────────────────────────
// SavedSearchesSection (PR-L Settings restoration — Decision #14, F10)
//
// Named filter combinations the user can recall later. Per L1/L2 split
// noted in PR-L dispatch: no `saved_searches` table exists today, so this
// L1 surface persists to localStorage following the PR-E pattern already
// used by useSettingsStore (`fsi-saved-filters`). Surfacing the gap as a
// candidate L2 backend split — when a real table lands, swap the
// load/save calls and keep the UI shape.
//
// Filter shape mirrors the existing settingsStore.savedFilters object so
// recall is interoperable: { modes, topics, jurisdictions, priorities }.
// Plus a `query` text field for free-text terms.
// ───────────────────────────────────────────────────────────────────────────

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  modes: string[];
  topics: string[];
  jurisdictions: string[];
  priorities: string[];
  createdAt: string;
}

const STORAGE_KEY = "fsi-saved-searches";

function loadFromStorage(): SavedSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(searches: SavedSearch[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
  } catch {
    // Quota / private browsing — silent fail. Surfaces no error because
    // the source-of-truth is local.
  }
}

export function SavedSearchesSection() {
  // Lazy initializer reads localStorage exactly once at first render.
  // The SSR fallback is an empty array (loadFromStorage guards window).
  // After hydration the in-browser render's lazy initializer runs and
  // produces the real list — no useEffect-driven re-render needed.
  const [searches, setSearches] = useState<SavedSearch[]>(() =>
    loadFromStorage()
  );
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{
    name: string;
    query: string;
  }>({ name: "", query: "" });
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });

  const addSearch = () => {
    if (!draft.name.trim()) return;
    const next: SavedSearch = {
      id: typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: draft.name.trim(),
      query: draft.query.trim(),
      modes: [],
      topics: [],
      jurisdictions: [],
      priorities: [],
      createdAt: new Date().toISOString(),
    };
    const updated = [...searches, next];
    setSearches(updated);
    saveToStorage(updated);
    setDraft({ name: "", query: "" });
    setCreating(false);
    setToast({ message: "Saved search created", visible: true });
  };

  const removeSearch = (id: string) => {
    const updated = searches.filter((s) => s.id !== id);
    setSearches(updated);
    saveToStorage(updated);
    setToast({ message: "Saved search removed", visible: true });
  };

  // Build the URL that would re-apply this search against /regulations.
  // Uses the same query-param shape the regulations index already reads.
  const recallHref = (s: SavedSearch): string => {
    const params = new URLSearchParams();
    if (s.query) params.set("q", s.query);
    if (s.topics.length > 0) params.set("topic", s.topics.join(","));
    if (s.jurisdictions.length > 0)
      params.set("jurisdiction", s.jurisdictions.join(","));
    if (s.modes.length > 0) params.set("mode", s.modes.join(","));
    if (s.priorities.length > 0)
      params.set("priority", s.priorities.join(","));
    const qs = params.toString();
    return qs ? `/regulations?${qs}` : "/regulations";
  };

  return (
    <div className="space-y-4">
      <div>
        <p
          className="text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Save filter + query combinations you reuse. Named searches appear
          here and can be re-applied against the Regulations index.
        </p>
        <p
          className="text-[11px] mt-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          Stored locally in this browser. Cross-device sync ships in
          Phase D once the saved_searches table lands.
        </p>
      </div>

      {/* Create new */}
      {!creating ? (
        <div>
          <Button variant="secondary" onClick={() => setCreating(true)}>
            <Plus size={14} />
            New saved search
          </Button>
        </div>
      ) : (
        <div
          className="rounded-md border p-4"
          style={{
            borderColor: "var(--color-border-subtle)",
            backgroundColor: "var(--color-surface-overlay)",
          }}
        >
          <div className="space-y-3">
            <div>
              <label
                className="block text-[10px] font-bold uppercase mb-1"
                style={{
                  letterSpacing: "0.12em",
                  color: "var(--color-text-muted)",
                }}
              >
                Name
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="e.g. EU CBAM watch"
                className="w-full px-3 py-2 text-sm rounded-md border outline-none"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>
            <div>
              <label
                className="block text-[10px] font-bold uppercase mb-1"
                style={{
                  letterSpacing: "0.12em",
                  color: "var(--color-text-muted)",
                }}
              >
                Query (optional)
              </label>
              <input
                type="text"
                value={draft.query}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, query: e.target.value }))
                }
                placeholder="Free-text search across regulations"
                className="w-full px-3 py-2 text-sm rounded-md border outline-none"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text-primary)",
                }}
              />
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Topic / mode / jurisdiction filters can be set on the
                Regulations index and saved from there once the URL-state
                hookup ships in PR-K.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={addSearch}
                disabled={!draft.name.trim()}
              >
                Save
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft({ name: "", query: "" });
                  setCreating(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {searches.length === 0 && !creating && (
        <p
          className="text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          No saved searches yet.
        </p>
      )}

      {searches.length > 0 && (
        <ul
          className="rounded-md border divide-y"
          style={{
            borderColor: "var(--color-border-subtle)",
            backgroundColor: "var(--color-surface)",
          }}
        >
          {searches.map((s) => (
            <li key={s.id} className="px-4 py-3 flex items-start gap-3">
              <span
                className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0"
                style={{
                  backgroundColor: "var(--color-surface-overlay)",
                  color: "var(--color-text-secondary)",
                }}
              >
                <Search size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="text-sm font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {s.name}
                </div>
                <div
                  className="text-xs mt-0.5 truncate"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {s.query ? `"${s.query}"` : "No query"}
                  {countFilters(s) > 0 &&
                    ` · ${countFilters(s)} filter${
                      countFilters(s) === 1 ? "" : "s"
                    }`}
                  {" · saved "}
                  {formatDate(s.createdAt)}
                </div>
              </div>
              <a
                href={recallHref(s)}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-secondary)",
                }}
                aria-label={`Open ${s.name}`}
              >
                <ExternalLink size={12} />
                Open
              </a>
              <button
                type="button"
                onClick={() => removeSearch(s.id)}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md border cursor-pointer"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-muted)",
                }}
                aria-label={`Delete ${s.name}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Toast
        message={toast.message}
        visible={toast.visible}
        onDismiss={() => setToast({ message: "", visible: false })}
      />
    </div>
  );
}

function countFilters(s: SavedSearch): number {
  return (
    s.modes.length +
    s.topics.length +
    s.jurisdictions.length +
    s.priorities.length
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}
