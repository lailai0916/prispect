/** Avoid repeating a rule headline before the same saved core paragraph. */
export function liteSummaryRepeatsHeadline(headline: string, summary?: string | null): boolean {
  const normalize = (value: string) =>
    value
      .normalize('NFKC')
      .replace(/\s+/gu, '')
      .replace(/[，,。！？?；;：:“”"'‘’]/gu, '')
      .replace(/[.!](?!\d)/gu, '')
      .toLowerCase();
  const heading = normalize(headline);
  return Boolean(heading && summary && normalize(summary).startsWith(heading));
}
