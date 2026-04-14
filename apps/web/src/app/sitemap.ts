import type { MetadataRoute } from "next";

import { getSiteOrigin } from "@/lib/env";
import { GUIDES } from "@/lib/guide-content";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteOrigin = getSiteOrigin();
  const lastModified = new Date();

  return [
    {
      url: siteOrigin,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteOrigin}/guides`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...GUIDES.map((guide) => ({
      url: `${siteOrigin}/guides/${guide.slug}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
