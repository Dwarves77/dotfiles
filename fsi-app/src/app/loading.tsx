import { ResourceListSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
      {/* Header skeleton */}
      <div className="mb-4">
        <div
          className="h-8 w-48 rounded animate-pulse mb-1"
          style={{ backgroundColor: "var(--color-surface-raised)" }}
        />
        <div
          className="h-3 w-72 rounded animate-pulse"
          style={{ backgroundColor: "var(--color-surface-raised)" }}
        />
      </div>

      {/* Tab bar skeleton */}
      <div
        className="flex gap-1 border-b py-3 mb-4"
        style={{ borderColor: "var(--color-border-subtle)" }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="h-5 rounded animate-pulse"
            style={{
              backgroundColor: "var(--color-surface-raised)",
              width: `${50 + Math.random() * 30}px`,
            }}
          />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="mt-4">
        <ResourceListSkeleton count={6} />
      </div>
    </div>
  );
}
