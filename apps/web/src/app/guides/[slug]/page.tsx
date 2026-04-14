import type { Metadata } from "next";
import Script from "next/script";
import { notFound } from "next/navigation";

import { GuidePage } from "@/components/guide-page";
import { GUIDES, getGuide } from "@/lib/guide-content";
import { getSiteOrigin } from "@/lib/env";

type GuidePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);

  if (!guide) {
    return {};
  }

  const url = `${getSiteOrigin()}/guides/${guide.slug}`;

  return {
    title: guide.title,
    description: guide.description,
    keywords: guide.queries,
    alternates: {
      canonical: `/guides/${guide.slug}`,
    },
    openGraph: {
      title: `Bore | ${guide.title}`,
      description: guide.description,
      url,
      type: "article",
    },
    twitter: {
      title: `Bore | ${guide.title}`,
      description: guide.description,
    },
  };
}

export default async function GuideDetailPage({ params }: GuidePageProps) {
  const { slug } = await params;
  const guide = getGuide(slug);

  if (!guide) {
    notFound();
  }

  const siteOrigin = getSiteOrigin();
  const url = `${siteOrigin}/guides/${guide.slug}`;
  const relatedGuides = GUIDES.filter((item) => item.slug !== guide.slug).slice(0, 4);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: guide.title,
        description: guide.description,
        url,
        keywords: guide.queries.join(", "),
        author: {
          "@type": "Person",
          name: "Casper Fenger Jensen",
        },
      },
      {
        "@type": "HowTo",
        name: guide.title,
        description: guide.description,
        totalTime: "PT5M",
        step: guide.steps.map((step) => ({
          "@type": "HowToStep",
          name: step.title,
          text: step.body,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: guide.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <>
      <Script
        id={`guide-structured-data-${guide.slug}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <GuidePage guide={guide} relatedGuides={relatedGuides} />
    </>
  );
}
