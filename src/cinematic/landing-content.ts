import example from '../../data/cases/songyuan-2025.json';
import manifest from '../../data/source-manifest.json';
import { contextFen, contextRatio, contextYuan } from '../../shared/company-analysis';
import { companyChallengeDefinitions } from '../../shared/company-challenge';

export type LandingText = readonly [zh: string, en: string];

export interface LandingSourceRegion {
  /** Fractions of the crop width and height, retaining the original PDF layout. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LandingSourceCrop {
  page: number;
  printedPage: number;
  src: string;
  width: number;
  height: number;
  alt: LandingText;
  caption: LandingText;
  /** Pixel rectangle in the 1273 × 1800 rendering used to make this crop. */
  originalCrop: readonly [x: number, y: number, width: number, height: number];
  highlights: Readonly<Record<string, LandingSourceRegion>>;
}

export interface LandingBridgeComponent {
  originalLabel: string;
  amount: string;
  sourcePage: number;
}

export interface LandingBridgeRow {
  id: string;
  label: LandingText;
  /** Exact decimal CNY amount from the annual consolidated original. */
  amount: string;
  kind: 'reported' | 'derived';
  sourcePages: readonly number[];
  originalLabel?: string;
  components?: readonly LandingBridgeComponent[];
}

export interface LandingHypothesis {
  id: 'expansion' | 'inventory-pressure';
  title: LandingText;
  detail: LandingText;
  materials: readonly LandingText[];
  availability: 'not-obtained';
}

export interface LandingExample {
  company: { name: LandingText; shortName: LandingText; code: string };
  year: number;
  currency: 'CNY';
  basis: 'consolidated';
  summary: {
    profit: string;
    cash: string;
    ratio: string;
    label: LandingText;
    detail: LandingText;
  };
  source: {
    url: string;
    title: LandingText;
    publishedOn: string;
    sha256: string;
    pages: readonly number[];
    crops: readonly LandingSourceCrop[];
  };
  bridgeRows: readonly LandingBridgeRow[];
  hypotheses: readonly LandingHypothesis[];
  notices: {
    sample: LandingText;
    scope: LandingText;
    bridge: LandingText;
    interpretation: LandingText;
  };
}

const source = manifest.sources.find((item) => item.id === example.rawSourceId);
if (!source || source.sha256 !== example.sha256 || source.url !== example.sourceUrl) {
  throw new Error('Landing example must retain its matching source-manifest record.');
}

function observation(key: string) {
  const row = example.observations.find((item) => item.key === key && item.year === 2025);
  if (
    !row ||
    row.scope !== 'consolidated' ||
    row.currency !== 'CNY' ||
    row.unit !== 'yuan' ||
    row.period !== 'annual' ||
    contextFen(row.value) === null
  ) {
    throw new Error(`Landing example has no usable original-report observation: ${key}`);
  }
  return row;
}

const profit = observation('netProfit');
const cash = observation('operatingCashFlow');
const inventory = observation('inventoryAdjustment');
const receivables = observation('receivablesAdjustment');
const payables = observation('payablesAdjustment');
const other = observation('otherAdjustments');
const otherComponents = (other.components || []).map((item) => ({
  originalLabel: item.label,
  amount: item.value,
  sourcePage: item.page,
}));

// The grouped amount comes from all retained source rows, never from a residual.
const groupedFen = otherComponents.reduce((sum, item) => sum + contextFen(item.amount)!, 0n);
const bridgeFen = [profit, inventory, receivables, payables, other].reduce(
  (sum, item) => sum + contextFen(item.value)!,
  0n
);
if (
  !otherComponents.length ||
  groupedFen !== contextFen(other.value) ||
  bridgeFen !== contextFen(cash.value)
) {
  throw new Error('Landing cash bridge must reconcile its independently summed original groups.');
}
const ratio = contextRatio(cash.value, profit.value);
if (ratio === null) throw new Error('Landing cash/profit requires positive annual profit.');

const bridgeRows: readonly LandingBridgeRow[] = [
  {
    id: 'netProfit',
    label: ['合并净利润', 'Consolidated net profit'],
    amount: profit.value,
    kind: 'reported',
    sourcePages: [profit.page],
    originalLabel: '净利润',
  },
  {
    id: 'inventoryAdjustment',
    label: ['存货调整', 'Inventory adjustment'],
    amount: inventory.value,
    kind: 'reported',
    sourcePages: [inventory.page],
    originalLabel: '存货的减少（增加以“－”号填列）',
  },
  {
    id: 'receivablesAdjustment',
    label: ['经营性应收调整', 'Operating receivables adjustment'],
    amount: receivables.value,
    kind: 'reported',
    sourcePages: [receivables.page],
    originalLabel: '经营性应收项目的减少（增加以“－”号填列）',
  },
  {
    id: 'payablesAdjustment',
    label: ['经营性应付调整', 'Operating payables adjustment'],
    amount: payables.value,
    kind: 'reported',
    sourcePages: [payables.page],
    originalLabel: '经营性应付项目的增加（减少以“－”号填列）',
  },
  {
    id: 'otherAdjustments',
    label: ['其余已披露调整', 'Other disclosed adjustments'],
    amount: contextYuan(groupedFen),
    kind: 'derived',
    sourcePages: [190, 191],
    components: otherComponents,
  },
  {
    id: 'operatingCashFlow',
    label: ['经营现金净额', 'Operating cash flow'],
    amount: cash.value,
    kind: 'reported',
    sourcePages: [cash.page],
    originalLabel: '经营活动产生的现金流量净额',
  },
];

export const landingExample: LandingExample = {
  company: {
    name: [example.company, 'Zhejiang Songyuan Automotive Safety Systems Co., Ltd.'],
    shortName: [example.shortName, 'Songyuan'],
    code: source.securityCode,
  },
  year: 2025,
  currency: 'CNY',
  basis: 'consolidated',
  summary: {
    profit: profit.value,
    cash: cash.value,
    ratio: (ratio * 100).toFixed(2),
    label: [
      '利润与经营现金之间，仍有问题需要核对。',
      'Profit and operating cash leave questions to investigate.',
    ],
    detail: [
      '2025 年合并净利润 3.66 亿元，经营现金净额 0.26 亿元。金额反差提出核查问题，不直接证明经营原因。',
      '2025 consolidated net profit was CNY 366.37 million and operating cash flow CNY 26.20 million. The difference motivates inquiry; it does not establish a business cause.',
    ],
  },
  source: {
    url: source.url,
    title: [
      '2025 年年度报告 · 现金流量表补充资料',
      '2025 annual report · cash-flow reconciliation',
    ],
    publishedOn: source.publishedOn,
    sha256: source.sha256,
    pages: source.evidence.pdfPages,
    crops: [
      {
        page: 190,
        printedPage: 190,
        src: '/landing/songyuan-2025-page-190-crop.png',
        width: 1032,
        height: 665,
        alt: [
          '松原 2025 年年度报告第 190 页原件裁片：现金流量表补充资料标题、单位、表头、净利润及部分调整行。',
          'Original crop from page 190 of Songyuan’s 2025 annual report: cash-flow reconciliation heading, unit, columns, profit and adjustment rows. The source remains in Chinese.',
        ],
        caption: ['原件裁片 · 第 190 页 · 单位：元', 'Original crop · page 190 · amounts in CNY'],
        originalCrop: [109, 963, 1032, 665],
        highlights: {
          netProfit: { x: 0, y: 222 / 665, width: 1, height: 35 / 665 },
        },
      },
      {
        page: 191,
        printedPage: 191,
        src: '/landing/songyuan-2025-page-191-crop.png',
        width: 1032,
        height: 495,
        alt: [
          '松原 2025 年年度报告第 191 页原件裁片：存货、经营性应收、经营性应付等调整，以及经营活动产生的现金流量净额。',
          'Original crop from page 191 of Songyuan’s 2025 annual report: inventory, operating receivables and payables adjustments, and operating cash flow. The source remains in Chinese.',
        ],
        caption: ['原件裁片 · 第 191 页 · 续表', 'Original crop · page 191 · table continued'],
        originalCrop: [109, 153, 1032, 495],
        highlights: {
          inventoryAdjustment: { x: 0, y: 242 / 495, width: 1, height: 61 / 495 },
          receivablesAdjustment: { x: 0, y: 303 / 495, width: 1, height: 60 / 495 },
          payablesAdjustment: { x: 0, y: 363 / 495, width: 1, height: 61 / 495 },
          operatingCashFlow: { x: 0, y: 458 / 495, width: 1, height: 36 / 495 },
        },
      },
    ],
  },
  bridgeRows,
  hypotheses: (['expansion', 'inventory-pressure'] as const).map((id) => {
    const definition = companyChallengeDefinitions[id];
    return {
      id,
      title: definition.title,
      detail: definition.explanation,
      materials: definition.materials.map((item) => item.label),
      availability: 'not-obtained',
    };
  }),
  notices: {
    sample: ['固定历史示例 · 松原安全 2025', 'Fixed historical example · Songyuan 2025'],
    scope: ['年度 · 合并口径 · 人民币', 'Annual · consolidated · CNY'],
    bridge: [
      '其余已披露调整由 13 条原表分项独立求和，不等同原表“其他”行。',
      'Other disclosed adjustments independently sum 13 original rows; this is not the source’s single “Other” row.',
    ],
    interpretation: [
      '调整项核对金额的来处；经营原因仍需订单、库龄及期后销售等材料核对。',
      'Reconciliation explains the amounts. Business causes still require orders, inventory aging and subsequent sales records.',
    ],
  },
};
