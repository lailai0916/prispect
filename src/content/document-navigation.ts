import { DOCUMENT_VERSION, type BilingualText, type ProductDocument } from './document';

// Page names are shared by navigation, document headings and browser titles.
// Keep this separate from document bodies so the app shell stays lightweight.
export const documentTitles = {
  '/docs/about': ['关于析光', 'About Prispect'],
  '/docs/guide': ['使用指南', 'User guide'],
  '/docs/methodology': ['核查方法', 'Review methodology'],
  '/docs/privacy': ['隐私政策', 'Privacy policy'],
  '/docs/terms': ['用户协议', 'Terms of service'],
  '/docs/copyright': ['版权声明', 'Copyright notice'],
} as const satisfies Record<string, BilingualText>;

export const documentationTitle = ['文档', 'Documentation'] as const;
export type DocumentPath = keyof typeof documentTitles;
export const documentPaths = Object.keys(documentTitles) as DocumentPath[];

export const documentMetadata = {
  '/docs/about': {
    title: documentTitles['/docs/about'],
    description: ['产品用途、功能与适用范围。', 'Product purpose, features and scope.'],
    version: '1.2',
    updatedAt: '2026-10-03',
  },
  '/docs/guide': {
    title: documentTitles['/docs/guide'],
    description: [
      '企业财务、来源核对与兼容核查流程。',
      'Company financials, source checks and compatible review workflows.',
    ],
    version: '1.7',
    updatedAt: '2026-10-03',
  },
  '/docs/methodology': {
    title: documentTitles['/docs/methodology'],
    description: [
      '计算口径、证据要求与分析边界。',
      'Calculations, evidence requirements and analysis limits.',
    ],
    version: '1.2',
    updatedAt: '2026-10-03',
  },
  '/docs/privacy': {
    title: documentTitles['/docs/privacy'],
    description: ['数据处理、AI 使用与保存规则。', 'Data processing, AI use and retention.'],
    version: '1.5',
    updatedAt: '2026-10-03',
  },
  '/docs/terms': {
    title: documentTitles['/docs/terms'],
    description: [
      '服务范围、账号使用与双方责任。',
      'Service scope, account use and responsibilities.',
    ],
    version: '1.3',
    updatedAt: '2026-10-03',
  },
  '/docs/copyright': {
    title: documentTitles['/docs/copyright'],
    description: [
      '代码许可、第三方内容与材料权利。',
      'Code licensing, third-party content and material rights.',
    ],
    version: DOCUMENT_VERSION,
    updatedAt: '2026-10-03',
  },
} as const satisfies Record<
  DocumentPath,
  Pick<ProductDocument, 'title' | 'description' | 'version' | 'updatedAt'>
>;

export const documentNavigation = documentPaths.map((path) => ({
  path,
  label: documentMetadata[path].title,
  description: documentMetadata[path].description,
}));

export type DocumentRoute = DocumentPath | '/docs';
