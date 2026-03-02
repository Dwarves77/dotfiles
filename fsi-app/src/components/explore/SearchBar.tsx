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
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
      />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search title, tags, jurisdiction..."
        defaultValue={filters.search}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full pl-9 pr-8 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 bg-surface-input border border-border-subtle rounded-[2px] outline-none focus:border-border-medium transition-colors duration-200"
      />
      {filters.search && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary cursor-pointer"
        >
          <X size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
