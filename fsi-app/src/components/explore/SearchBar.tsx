"use client";

import { useResourceStore } from "@/stores/resourceStore";
import { Search, X } from "lucide-react";
import { useCallback, useRef } from "react";

export function SearchBar() {
  const { filters, setSearch } = useResourceStore();
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
    </div>
  );
}
