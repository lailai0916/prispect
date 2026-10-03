export const storyChapters = [
  { id: 'discovery', start: 0, hold: 0, label: ['发现', 'Discovery'] },
  { id: 'source', start: 0.18, hold: 0.26, label: ['出处', 'Sources'] },
  { id: 'calculation', start: 0.4, hold: 0.555, label: ['计算', 'Calculation'] },
  { id: 'questions', start: 0.65, hold: 0.775, label: ['核查', 'Inquiry'] },
  { id: 'research', start: 0.9, hold: 0.95, label: ['开始', 'Begin'] },
] as const;

export function chapterAt(progress: number) {
  let index = 0;
  for (let i = 1; i < storyChapters.length; i++) {
    if (progress >= storyChapters[i]!.start) index = i;
  }
  return index;
}

/** Shared with the canvas so a source page never moves beneath its reading copy. */
export function sourcePageOpacity(progress: number, page: number) {
  const ramp = (start: number, end: number) => {
    const value = Math.max(0, Math.min(1, (progress - start) / (end - start)));
    return value * value * (3 - 2 * value);
  };
  return page === 0
    ? ramp(0.23, 0.25) * (1 - ramp(0.275, 0.28))
    : ramp(0.335, 0.345) * (1 - ramp(0.35, 0.355));
}
