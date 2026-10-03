import type { BilingualText } from './document';

// Page names are shared by navigation, document headings and browser titles.
// Keep this separate from document bodies so the app shell stays lightweight.
export const documentTitles = {
  '/about': ['关于析光', 'About Prispect'],
  '/docs': ['使用文档', 'Documentation'],
  '/privacy': ['隐私政策', 'Privacy policy'],
  '/terms': ['用户协议', 'Terms of service'],
  '/copyright': ['版权声明', 'Copyright notice'],
} as const satisfies Record<string, BilingualText>;

export type DocumentPath = keyof typeof documentTitles;
export const documentPaths = Object.keys(documentTitles) as DocumentPath[];

export const documentNavigation = [
  { path: '/about', label: documentTitles['/about'] },
  { path: '/docs', label: documentTitles['/docs'] },
  { path: '/method', label: ['方法', 'Method'] },
  { path: '/privacy', label: documentTitles['/privacy'] },
  { path: '/terms', label: documentTitles['/terms'] },
  { path: '/copyright', label: documentTitles['/copyright'] },
] as const;

export type DocumentRoute = (typeof documentNavigation)[number]['path'];
