import type { MetadataRoute } from "next";

import { SEO_DOCS } from "@/lib/docs";
import { getSiteOrigin } from "@/lib/env";
import { GUIDES } from "@/lib/guide-content";

const HOME_UPDATED_AT = new Date("2026-07-31");

export default function sitemap(): MetadataRoute.Sitemap {
  const siteOrigin = getSiteOrigin();

  return [
    {
      url: siteOrigin,
      lastModified: HOME_UPDATED_AT,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteOrigin}/guides`,
      lastModified: HOME_UPDATED_AT,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...GUIDES.map((guide) => ({
      url: `${siteOrigin}/guides/${guide.slug}`,
      lastModified: new Date(guide.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...SEO_DOCS.map((doc) => ({
      url: `${siteOrigin}/docs/${doc.slug}`,
      lastModified: new Date(doc.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.85,
    })),
  ];
}
