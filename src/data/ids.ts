/**
 * UUID v4 generation. Uses `crypto.randomUUID` where available (all target
 * browsers per UX spec §Browser & Platform Support); falls back to a
 * `getRandomValues`-based shim for older environments and tests where
 * `randomUUID` isn't on the test runtime.
 */
export function newId(): string {
  const g = globalThis.crypto;
  if (g?.randomUUID) {
    return g.randomUUID();
  }
  if (g?.getRandomValues) {
    const bytes = new Uint8Array(16);
    g.getRandomValues(bytes);
    // RFC 4122 v4
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
      .slice(6, 8)
      .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }
  throw new Error('No crypto source available for UUID generation');
}

export function nowIso(): string {
  return new Date().toISOString();
}
