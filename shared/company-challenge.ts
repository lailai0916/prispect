import type {
  AssessmentEvidence,
  AssessmentJudgment,
  AssessmentMetric,
  AssessmentResearchStep,
  AssessmentText,
} from './company-assessment.js';

/** Fixed public-research questions; private trial state and free-form notes are not inputs. */
export const companyChallengeTargets = [
  'expansion',
  'inventory-pressure',
  'collection-pressure',
] as const;
export type CompanyChallengeTarget = (typeof companyChallengeTargets)[number];
export interface ChallengeMaterial {
  id: string;
  label: AssessmentText;
  purpose: AssessmentText;
  availability: 'not-obtained';
}
export const companyChallengeDefinitions: Record<
  CompanyChallengeTarget,
  {
    title: AssessmentText;
    explanation: AssessmentText;
    competingExplanation: AssessmentText;
    researchGoal: string;
    materials: readonly ChallengeMaterial[];
  }
> = {
  expansion: {
    title: ['扩张备货', 'Inventory for expansion'],
    explanation: [
      '经营现金偏低可能与扩张备货有关。',
      'Weak operating cash may reflect stocking for expansion.',
    ],
    competingExplanation: [
      '存货去化承压也可能占用现金。',
      'Inventory sell-through pressure may also tie up cash.',
    ],
    researchGoal:
      '挑战“经营现金偏低可能与扩张备货有关”的解释。分别检索支持扩张备货与反向的库存去化压力线索；先检查本年和上年存货、营收、经营现金，再定向检索订单、产能扩建、备货、库存、减值、周转的公开公告和新闻，读取相关官方公告原文。区分实际经营扩张、拟投资与已经投产，不能把标题当事实。说明哪些账龄、存货结构、期后销售与订单执行材料未取得；不裁定现金差异的原因。',
    materials: [
      {
        id: 'inventory-aging',
        label: ['存货结构、库龄与减值明细', 'Inventory composition, aging and impairment'],
        purpose: [
          '区分正常备货与积压；年末余额本身不能说明去化质量。',
          'Separate normal stocking from aging inventory; year-end balances do not establish sell-through quality.',
        ],
        availability: 'not-obtained',
      },
      {
        id: 'orders-delivery',
        label: ['订单执行及期后交付、销售记录', 'Order execution, subsequent deliveries and sales'],
        purpose: [
          '核对备货能否对应实际需求及期后去化。',
          'Check whether stocking corresponds to actual demand and subsequent sales.',
        ],
        availability: 'not-obtained',
      },
    ],
  },
  'inventory-pressure': {
    title: ['存货去化压力', 'Inventory sell-through pressure'],
    explanation: [
      '经营现金偏低可能与存货去化压力有关。',
      'Weak operating cash may reflect inventory sell-through pressure.',
    ],
    competingExplanation: [
      '正常扩张备货也可能暂时占用现金。',
      'Normal stocking for expansion may temporarily tie up cash.',
    ],
    researchGoal:
      '挑战“经营现金偏低可能与存货去化压力有关”的解释。分别检索库存积压、减值、周转恶化的支持线索与实际订单增长、期后去化、产能扩张的反向线索。比较本年与上年存货和营收但不由余额确证积压；定向检索库存、减值、周转、订单的公开公告和新闻，读取相关官方公告原文。披露未取得的库龄、产品分类、期后销售与减值测试材料，不把未检索到材料写成不存在风险。',
    materials: [
      {
        id: 'inventory-sell-through',
        label: [
          '存货分类、库龄及期后去化明细',
          'Inventory categories, aging and subsequent sell-through',
        ],
        purpose: [
          '确认库存变化来自品类结构、周转变慢还是正常备货。',
          'Determine whether balances reflect mix changes, slower turnover or normal stocking.',
        ],
        availability: 'not-obtained',
      },
      {
        id: 'impairment-tests',
        label: ['可变现净值与减值测试资料', 'Net realizable value and impairment tests'],
        purpose: [
          '检验可变现能力；未取得测试不能认定无需减值。',
          'Assess realizability; missing tests cannot establish that no impairment is needed.',
        ],
        availability: 'not-obtained',
      },
    ],
  },
  'collection-pressure': {
    title: ['回款压力', 'Collection pressure'],
    explanation: [
      '经营现金偏低可能与回款压力有关。',
      'Weak operating cash may reflect collection pressure.',
    ],
    competingExplanation: [
      '正常结算时点差异也可能暂时占用现金。',
      'Normal settlement timing may also temporarily tie up cash.',
    ],
    researchGoal:
      '挑战“经营现金偏低可能与回款压力有关”的解释。检查同口径本年与上年的应收、营收、经营现金和销售收到现金；分别检索期后回款、正常结算支持线索与信用期延长、账龄、减值、争议的反向线索。定向检索回款、应收、信用期、减值的公开公告和新闻，读取相关官方公告原文。销售现金/营收含税和时点不同不是收款率；年末应收不能确证坏账；明确期后流水、应收账龄及合同条款未取得。',
    materials: [
      {
        id: 'subsequent-collections',
        label: ['期后回款与应收账龄明细', 'Subsequent collections and receivables aging'],
        purpose: [
          '区分结算时点差异与持续未收回；历史现金不能替代期后记录。',
          'Separate timing differences from persistent noncollection; historical cash does not replace subsequent records.',
        ],
        availability: 'not-obtained',
      },
      {
        id: 'credit-terms',
        label: [
          '客户信用期、合同及履约记录',
          'Customer credit terms, contracts and performance records',
        ],
        purpose: [
          '检验回款安排是否变化及相关应收能否核对。',
          'Check changes in payment terms and reconcile the related receivables.',
        ],
        availability: 'not-obtained',
      },
    ],
  },
};

export interface ChallengeClue extends AssessmentJudgment {
  id: string;
  origin: 'rules' | 'model';
}
export interface CompanyChallengeResult {
  version: 1;
  target: CompanyChallengeTarget;
  securityCode: string;
  year: number;
  basis: 'consolidated';
  snapshotFetchedAt: string;
  generatedAt: string;
  applicability: 'applicable' | 'missing-basis' | 'not-applicable';
  status: 'unresolved' | 'supporting-clues' | 'counter-clues' | 'mixed-clues';
  summary: AssessmentText;
  support: ChallengeClue[];
  counter: ChallengeClue[];
  gaps: AssessmentText[];
  distinguishingMaterials: ChallengeMaterial[];
  metrics: AssessmentMetric[];
  evidence: AssessmentEvidence[];
  research: { steps: AssessmentResearchStep[]; modelCalls: number; toolCalls: number };
  model: {
    status: 'completed' | 'not-configured' | 'failed' | 'not-called';
    name?: string;
    provider?: string;
    warning?: string;
    calls: number;
  };
}

export interface CompanyChallengeState {
  status: 'loading' | 'ready' | 'failed';
  target: CompanyChallengeTarget;
  revision: number;
  inputHash: string;
  trace: AssessmentResearchStep[];
  result?: CompanyChallengeResult;
  error?: string;
}
