export const storyChapters = [
  { id: 'discovery', start: 0, hold: 0.065, label: ['发现', 'Discovery'] },
  { id: 'source', start: 0.14, hold: 0.33, label: ['出处', 'Sources'] },
  { id: 'calculation', start: 0.37, hold: 0.555, label: ['计算', 'Calculation'] },
  { id: 'questions', start: 0.64, hold: 0.765, label: ['核查', 'Inquiry'] },
  { id: 'research', start: 0.84, hold: 0.97, label: ['开始', 'Begin'] },
] as const;

export function chapterAt(progress: number) {
  let index = 0;
  for (let i = 1; i < storyChapters.length; i++) {
    if (progress >= storyChapters[i]!.start) index = i;
  }
  return index;
}
