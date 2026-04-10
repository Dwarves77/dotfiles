"use client";

import { useResourceStore } from "@/stores/resourceStore";
import { Search, X } from "lucide-react";
import { useCallback, useRef } from "react";
import { cn } from "@/lib/cn";

export function SearchBar() {
  const { filters, setSearch, setSearchScope } = useResourceStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleChange = useCallback(
    (value: string) => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setSearch(value), 300);
    },
    [setSearch]
  );

  const handleClear = useCallback(() => {
    setSearch("");
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.focus();
  }, [setSearch]);

  return (
    <div className="relative">
      <Search
        size={14}
        strokeWidth={2}
        className="absolute left-3 top-1/2 -translate-y-1/2"
        style={{ color: "var(--color-text-secondary)" }}
      />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search title, tags, jurisdiction..."
        defaultValue={filters.search}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full pl-9 pr-8 h-[42px] text-sm rounded-lg border outline-none transition-colors duration-200"
        style={{
          color: "var(--color-text-primary)",
          backgroundColor: "var(--color-surface)",
          borderColor: "var(--color-border)",
        }}
      />
      {filters.search && (
        <button
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors duration-150"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <X size={14} strokeWidth={2} />
        </button>
      )}
      {/* Scope toggle — visible when search is active */}
      {filters.search && (
        <div className="flex items-center gap-2 mt-1.5">
          {(["profile", "all"] as const).map((scope) => (
            <button
              key={scope}
              onClick={() => setSearchScope(scope)}
              className={cn(
                "text-[11px] font-medium px-2.5 py-1 rounded-md border cursor-pointer transition-colors",
              )}
              style={{
                borderColor: filters.searchScope === scope ? "var(--color-active-border)" : "var(--color-border)",
                backgroundColor: filters.searchScope === scope ? "var(--color-active-bg)" : "transparent",
                color: filters.searchScope === scope ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              }}
            >
              {scope === "profile" ? "My Sectors" : "All Sectors"}
            </button>
          ))}
          {filters.searchScope === "all" && (
            <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              Searching all freight sectors
            </span>
          )}
        </div>
      )}
    </div>
  );
}
