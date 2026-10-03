export interface CompanyPageAnchorPosition {
  id: string;
  top: number;
  visible: boolean;
}

/** Read the current chapter from actual, visible DOM positions, not report completion. */
export function currentCompanyPageAnchor(
  positions: readonly CompanyPageAnchorPosition[],
  readingLine: number,
  atBottom = false
): string | null {
  const visible = positions
    .filter((position) => position.visible && Number.isFinite(position.top))
    .sort((left, right) => left.top - right.top);
  if (!visible.length) return null;
  if (atBottom) return visible.at(-1)!.id;
  let current = visible[0]!.id;
  for (const position of visible) {
    if (position.top > readingLine) break;
    current = position.id;
  }
  return current;
}
