"use client";

import { cn } from "@/lib/cn";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "card" | "circle";
}

export function Skeleton({ className, variant = "text" }: SkeletonProps) {
  const baseStyles = {
    text: "h-4 rounded",
    card: "h-32 rounded-lg",
    circle: "rounded-full",
  };

  return (
    <div
      className={cn(
        "animate-pulse",
        baseStyles[variant],
        className
      )}
      style={{ backgroundColor: "var(--color-surface-raised)" }}
    />
  );
}

// ── Resource Card Skeleton ──

export function ResourceCardSkeleton() {
  return (
    <div
      className="border rounded-lg p-4 space-y-3"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div className="flex items-center gap-2">
        <Skeleton className="w-12 h-5" />
        <Skeleton className="w-16 h-5" />
        <div className="flex-1" />
        <Skeleton className="w-14 h-5" />
      </div>
      <Skeleton className="w-3/4 h-4" />
      <Skeleton className="w-full h-3" />
      <Skeleton className="w-2/3 h-3" />
      <div className="flex gap-1.5">
        <Skeleton className="w-14 h-5" />
        <Skeleton className="w-18 h-5" />
        <Skeleton className="w-12 h-5" />
      </div>
    </div>
  );
}

// ── Resource List Skeleton ──

export function ResourceListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <ResourceCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Source Row Skeleton ──

export function SourceRowSkeleton() {
  return (
    <div
      className="flex items-center gap-3 p-4 border rounded-lg"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <Skeleton variant="circle" className="w-2 h-2" />
      <Skeleton className="w-8 h-5" />
      <Skeleton className="w-48 h-4" />
      <div className="flex-1" />
      <Skeleton className="w-8 h-4" />
    </div>
  );
}

// ── Source List Skeleton ──

export function SourceListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <SourceRowSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Domain View Skeleton ──

export function DomainViewSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="w-64 h-6 mb-2" />
        <Skeleton className="w-96 h-4" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="border rounded-lg p-4 space-y-2"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
          }}
        >
          <div className="flex items-center gap-3">
            <Skeleton variant="circle" className="w-10 h-10" />
            <div className="flex-1">
              <Skeleton className="w-48 h-4 mb-1" />
              <Skeleton className="w-72 h-3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
