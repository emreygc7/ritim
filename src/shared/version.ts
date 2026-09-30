/** Compares dotted versions like "0.2.0" or "v1.10.3"; returns >0 when a is newer. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split(/[.-]/)
      .slice(0, 3)
      .map((x) => Number.parseInt(x, 10) || 0)
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}
