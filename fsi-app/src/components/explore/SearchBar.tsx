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
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sage)]"
      />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search title, tags, jurisdiction..."
        defaultValue={filters.search}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full pl-9 pr-8 py-2 text-sm text-white placeholder:text-[var(--sage)]/50 bg-white/[0.03] border border-white/6 rounded-[2px] outline-none focus:border-white/15 transition-colors duration-200"
      />
      {filters.search && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sage)] hover:text-white cursor-pointer"
        >
          <X size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
