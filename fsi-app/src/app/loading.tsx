export default function Loading() {
  return (
    <div className="relative min-h-screen" style={{ backgroundColor: "#fafaf8" }}>
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-6">
        {/* Stat card skeletons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="cl-stat-card animate-pulse"
              style={{ padding: "16px", minHeight: "90px" }}
            >
              <div
                className="h-3 w-16 rounded mx-auto mb-3"
                style={{ backgroundColor: "var(--color-surface-raised)" }}
              />
              <div
                className="h-8 w-10 rounded mx-auto mb-2"
                style={{ backgroundColor: "var(--color-surface-raised)" }}
              />
              <div
                className="h-3 w-20 rounded mx-auto"
                style={{ backgroundColor: "var(--color-surface-raised)" }}
              />
            </div>
          ))}
        </div>

        {/* Accordion skeletons */}
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="cl-card mb-4 animate-pulse"
            style={{ padding: "20px" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div
                  className="h-4 w-40 rounded mb-1"
                  style={{ backgroundColor: "var(--color-surface-raised)" }}
                />
                <div
                  className="h-3 w-24 rounded"
                  style={{ backgroundColor: "var(--color-surface-raised)" }}
                />
              </div>
              <div
                className="h-4 w-4 rounded"
                style={{ backgroundColor: "var(--color-surface-raised)" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
