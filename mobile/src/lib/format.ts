/** Human readable size: "0 GB", "420 MB", "1.3 GB". Decimal units, like the stores and the packs list. */
export function formatBytes(bytes: number) {
  const b = Math.max(0, Number(bytes) || 0);
  if (b >= 1_000_000_000) return `${(b / 1_000_000_000).toFixed(b >= 10_000_000_000 ? 0 : 1)} GB`;
  if (b >= 1_000_000) return `${Math.round(b / 1_000_000)} MB`;
  if (b >= 1_000) return `${Math.round(b / 1_000)} KB`;
  return `${b} B`;
}
