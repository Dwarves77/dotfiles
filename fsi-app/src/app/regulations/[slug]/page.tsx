import Link from "next/link";

// Phase B placeholder — regulation detail pages
export default async function RegulationDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/regulations"
        className="text-sm mb-4 inline-block"
        style={{ color: "var(--color-primary)" }}
      >
        &larr; Back to Regulations
      </Link>
      <h1 className="cl-page-title mb-2">
        Regulation: {slug}
      </h1>
      <p className="cl-card-body">
        Full regulation detail page coming in Phase B.
        This page will have tabs for Overview, Impact Assessment, Timeline, Discussion, and Related.
      </p>
    </div>
  );
}
