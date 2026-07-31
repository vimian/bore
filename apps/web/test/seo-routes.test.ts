import assert from "node:assert/strict";
import test from "node:test";

import nextConfig from "../next.config";
import sitemap from "../src/app/sitemap";
import { SEO_DOCS } from "../src/lib/docs";

test("publishes the canonical developer SEO pages in the sitemap", () => {
  const urls = sitemap().map((entry) => entry.url);

  for (const doc of SEO_DOCS) {
    assert.ok(urls.some((url) => url.endsWith(`/docs/${doc.slug}`)));
  }

  assert.ok(!urls.some((url) => url.endsWith("/guides/https-nextjs-dev")));
  assert.ok(
    !urls.some((url) => url.endsWith("/guides/webhook-testing-localhost")),
  );
});

test("redirects superseded guides to their canonical docs pages", async () => {
  const redirects = await nextConfig.redirects?.();

  assert.deepEqual(redirects, [
    {
      source: "/guides/https-nextjs-dev",
      destination: "/docs/nextjs-localhost",
      permanent: true,
    },
    {
      source: "/guides/webhook-testing-localhost",
      destination: "/docs/webhook-testing",
      permanent: true,
    },
  ]);
});
