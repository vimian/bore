import assert from "node:assert/strict";
import test from "node:test";

import { DANISH_NAMESPACE_NAMES } from "../src/danish-namespace-names.js";
import { generateRandomSubdomain, generatedSubdomainAtIndex } from "../src/subdomains.js";

test("uses a sorted ASCII-only Danish namespace pool", () => {
  assert.ok(DANISH_NAMESPACE_NAMES.length > 0);
  assert.equal(DANISH_NAMESPACE_NAMES[0], "bo");

  for (let index = 0; index < DANISH_NAMESPACE_NAMES.length; index += 1) {
    const current = DANISH_NAMESPACE_NAMES[index]!;
    assert.match(current, /^[a-z]{2,6}$/);

    const previous = DANISH_NAMESPACE_NAMES[index - 1];

    if (!previous) {
      continue;
    }

    const isSorted =
      previous.length < current.length ||
      (previous.length === current.length && previous.localeCompare(current) <= 0);
    assert.equal(isSorted, true);
  }
});

test("expands into repeated name sequences after single names are exhausted", () => {
  const first = DANISH_NAMESPACE_NAMES[0]!;
  const second = DANISH_NAMESPACE_NAMES[1]!;
  const finalSingle = DANISH_NAMESPACE_NAMES.at(-1)!;
  const singleCount = BigInt(DANISH_NAMESPACE_NAMES.length);

  assert.equal(generatedSubdomainAtIndex(0n), first);
  assert.equal(generatedSubdomainAtIndex(singleCount - 1n), finalSingle);
  assert.equal(generatedSubdomainAtIndex(singleCount), `${first}-${first}`);
  assert.equal(generatedSubdomainAtIndex(singleCount + 1n), `${first}-${second}`);
});

test("reuses the earliest available namespace instead of advancing a counter", () => {
  const first = DANISH_NAMESPACE_NAMES[0]!;
  const second = DANISH_NAMESPACE_NAMES[1]!;
  const singles = [...DANISH_NAMESPACE_NAMES];

  assert.equal(generateRandomSubdomain(singles.slice(1, 6)), first);
  assert.equal(generateRandomSubdomain(singles), `${first}-${first}`);
  assert.equal(
    generateRandomSubdomain([...singles, `${first}-${first}`]),
    `${first}-${second}`,
  );
});
