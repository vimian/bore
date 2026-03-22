import type { MetadataRoute } from "next";

import { getSiteOrigin } from "@/lib/env";

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
  ];
}
