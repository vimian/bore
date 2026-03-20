import { DANISH_NAMESPACE_NAMES } from "./danish-namespace-names.js";

const labelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeDnsLabel(value: string, fieldName = "Label"): string {
  const normalized = value.trim().toLowerCase().replace(/\.+$/, "");

  if (!normalized) {
    throw new Error(`${fieldName} cannot be empty`);
  }

  if (normalized.includes(".")) {
    throw new Error(`${fieldName} must be a single DNS label`);
  }

  if (!labelPattern.test(normalized)) {
    throw new Error(
      `${fieldName} must use lowercase DNS labels with letters, numbers, and hyphens`,
    );
  }

  return normalized;
}

export function generateRandomSubdomain(existing: Iterable<string>): string {
  const reserved = [...existing].map(normalizeReservedSubdomain);

  for (let index = 0n; ; index += 1n) {
    const candidate = generatedSubdomainAtIndex(index);

    if (!reserved.some((value) => namespacesConflict(value, candidate))) {
      return candidate;
    }
  }
}

export function generatedSubdomainAtIndex(index: bigint): string {
  if (index < 0n) {
    throw new Error("index must be non-negative");
  }

  const nameCount = BigInt(DANISH_NAMESPACE_NAMES.length);
  let remaining = index;
  let blockSize = nameCount;
  let sequenceLength = 1;

  while (remaining >= blockSize) {
    remaining -= blockSize;
    blockSize *= nameCount;
    sequenceLength += 1;
  }

  const segments = new Array<string>(sequenceLength);
  let divisor = blockSize / nameCount;

  for (let position = 0; position < sequenceLength; position += 1) {
    const digit = Number(remaining / divisor);
    segments[position] = DANISH_NAMESPACE_NAMES[digit]!;
    remaining %= divisor;
    divisor = divisor > 1n ? divisor / nameCount : 1n;
  }

  return segments.join("-");
}

export function normalizeReservedSubdomain(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^\*\./, "").replace(/\.+$/, "");

  if (!normalized) {
    throw new Error("Subdomain cannot be empty");
  }

  const labels = normalized.split(".");

  if (labels.some((label) => normalizeDnsLabel(label, "Subdomain label") !== label)) {
    throw new Error(
      "Subdomain must use lowercase DNS labels with letters, numbers, and hyphens",
    );
  }

  return normalized;
}

export function namespacesConflict(left: string, right: string): boolean {
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

export function matchesReservedSubdomain(hostNamespace: string, reservedSubdomain: string): boolean {
  return (
    hostNamespace === reservedSubdomain || hostNamespace.endsWith(`.${reservedSubdomain}`)
  );
}

export function nextAvailableSubdomain(base: string, existing: Iterable<string>): string {
  const normalizedBase = normalizeReservedSubdomain(base);
  const used = new Set(existing);

  if (![...used].some((candidate) => namespacesConflict(candidate, normalizedBase))) {
    return normalizedBase;
  }

  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${normalizedBase}-${index}`;

    if (![...used].some((existingCandidate) => namespacesConflict(existingCandidate, candidate))) {
      return candidate;
    }
  }

  throw new Error("Unable to allocate a subdomain");
}
