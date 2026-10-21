const BENGALI_ZERO = 0x09e6

/**
 * Reads a number the way people type it: "25,000", "১২,৫০০.৫০", " 12.50 ", "৳1,250".
 * Returns null for an empty or unreadable entry.
 */
export function parseNumber(text: string): number | null {
  const ascii = String(text)
    .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - BENGALI_ZERO))
    .replace(/[٫]/g, '.')
    .replace(/[\s,'_৳$€£₹]/g, '')
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(ascii)) return null
  const n = Number(ascii)
  return Number.isFinite(n) ? n : null
}

/** Keeps only characters that can be part of a number while typing. */
export function sanitizeNumberText(text: string, allowNegative = false): string {
  let t = text.replace(/[^\d০-৯.,٫\-\s]/g, '')
  if (!allowNegative) t = t.replace(/-/g, '')
  return t
}
