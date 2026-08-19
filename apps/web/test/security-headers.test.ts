import assert from "node:assert/strict";
import test from "node:test";

import nextConfig from "../next.config";

test("denies framing on every web route", async () => {
  const rules = await nextConfig.headers?.();

  assert.deepEqual(rules, [
    {
      source: "/:path*",
      headers: [
        {
          key: "Content-Security-Policy",
          value: "frame-ancestors 'none'",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
      ],
    },
  ]);
});
