import type { Metadata } from "next";
import Script from "next/script";
import { notFound } from "next/navigation";

import { DocPage } from "@/components/docs/doc-page";
import { getSeoDoc, SEO_DOCS } from "@/lib/docs";
import { getSiteOrigin } from "@/lib/env";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return SEO_DOCS.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const doc = getSeoDoc((await params).slug);

  if (!doc) {
    return {};
  }

  const url = `${getSiteOrigin()}/docs/${doc.slug}`;

  return {
    title: doc.title,
    description: doc.description,
    keywords: doc.keywords,
    alternates: { canonical: `/docs/${doc.slug}` },
    openGraph: {
      title: `Bore | ${doc.title}`,
      description: doc.description,
      type: "article",
      url,
      siteName: "Bore",
      publishedTime: doc.updatedAt,
      modifiedTime: doc.updatedAt,
    },
    twitter: {
      card: "summary_large_image",
      title: `Bore | ${doc.title}`,
      description: doc.description,
    },
  };
}

export default async function SeoDocPage({ params }: PageProps) {
  const doc = getSeoDoc((await params).slug);

  if (!doc) {
    notFound();
  }

  const siteOrigin = getSiteOrigin();
  const url = `${siteOrigin}/docs/${doc.slug}`;
  const graph: object[] = [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Bore", item: siteOrigin },
        { "@type": "ListItem", position: 2, name: "Documentation", item: `${siteOrigin}/guides` },
        { "@type": "ListItem", position: 3, name: doc.title, item: url },
      ],
    },
    {
      "@type": "TechArticle",
      headline: doc.title,
      description: doc.description,
      url,
      datePublished: doc.updatedAt,
      dateModified: doc.updatedAt,
      author: { "@type": "Organization", name: "Bore", url: siteOrigin },
      publisher: { "@type": "Organization", name: "Bore", url: siteOrigin },
      keywords: doc.keywords.join(", "),
    },
    {
      "@type": "FAQPage",
      mainEntity: doc.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ];

  if (doc.kind === "how-to" && doc.steps) {
    graph.push({
      "@type": "HowTo",
      name: doc.title,
      description: doc.description,
      step: doc.steps.map((step, index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name: step.title,
        text: step.text,
      })),
    });
  }

  return (
    <>
      <Script
        id={`docs-structured-data-${doc.slug}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
        }}
      />
      <DocPage doc={doc} />
    </>
  );
}
