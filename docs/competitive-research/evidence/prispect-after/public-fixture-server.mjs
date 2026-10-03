// Synthetic provider fixture for engineering UI verification. No issuer research is claimed.
import { createApp } from '/workspace/prispect-improve/server/app.ts';
import { deriveCompanyAssessment } from '/workspace/prispect-improve/shared/company-assessment.ts';
import { contextAmountFields } from '/workspace/prispect-improve/shared/company-workspace.ts';
import { answerCompanyQuestion } from '/workspace/prispect-improve/server/company-questions.ts';
const now = new Date().toISOString();
const identity = {
  securityCode: '601234',
  orgId: 'syntheticuiorg',
  shortName: '合成研究样本（非真实企业）',
  companyName: '合成研究样本（非真实企业）',
  exchange: 'sse',
  sourceUrl: 'https://www.cninfo.com.cn/',
};
const period = (year, values) => ({
  period: `${year}-12-31`,
  annual: true,
  noticeDate: '2026-03-01',
  amounts: { ...Object.fromEntries(contextAmountFields.map((f) => [f, null])), ...values },
  ratios: { grossMargin: null, roe: null, revenueGrowth: null },
  auditOpinion: null,
  fieldSources: Object.fromEntries(
    Object.keys(values).map((f) => [f, `fixture-financial-${year}`])
  ),
  sourceUrls: ['https://datacenter.eastmoney.com/'],
  originalUrl: null,
});
const hash = 'c'.repeat(64);
const newsUrl = 'https://finance.eastmoney.com/a/202610033001234567.html';
const snapshot = () => ({
  version: 1,
  securityCode: identity.securityCode,
  orgId: identity.orgId,
  companyName: identity.companyName,
  fetchedAt: now,
  status: 'partial',
  financials: [
    period(2024, {
      revenue: '800000',
      netProfit: '80000',
      ocf: '70000',
      cash: '50000',
      shortLoan: '30000',
      currentPortionDebt: '10000',
      receivables: '100000',
      inventory: '80000',
      totalAssets: '500000',
      totalLiabilities: '200000',
    }),
    period(2025, {
      revenue: '1000000',
      netProfit: '100000',
      ocf: '60000',
      cash: '70000',
      shortLoan: '30000',
      currentPortionDebt: '10000',
      receivables: '180000',
      inventory: '120000',
      totalAssets: '600000',
      totalLiabilities: '230000',
    }),
  ],
  sources: [
    ...['2024', '2025'].map((year) => ({
      id: `fixture-financial-${year}`,
      provider: '合成第三方字段（工程fixture）',
      dimension: 'financial',
      url: 'https://datacenter.eastmoney.com/',
      status: 'available',
      fetchedAt: now,
      latestDate: `${year}-12-31`,
      count: 1,
      note: '合成测试来源，没有实际下载公开响应。',
      responseHashes: [hash],
    })),
    {
      id: 'fixture-disclosure',
      provider: '合成官方来源位置（工程fixture）',
      dimension: 'disclosures',
      url: 'https://www.cninfo.com.cn/',
      status: 'partial',
      fetchedAt: now,
      latestDate: '2026-03-01',
      count: 1,
      note: '合成节选，非真实披露。',
      responseHashes: [hash],
    },
  ],
  comparisons: [],
  profile: { 公司介绍: '合成工程样本，所有金额和内容均非真实发行人数据。' },
  shareholders: [],
  announcements: [
    {
      id: 'fixture-announcement',
      title: '合成公告：扩张备货说明（工程样本）',
      date: '2026-03-01',
      url: 'https://static.cninfo.com.cn/finalpage/2026-03-01/fixture.pdf',
      sources: [{ provider: '合成', url: 'https://www.cninfo.com.cn/' }],
      category: '合成公告',
      attention: 'high',
      matched: '合成',
      meaning: '只有工程样本，不是真实事件',
      nextQuestion: '核对真实原件及业务材料',
      excerpt: {
        page: 1,
        quote: '合成节选：计划增加备货；这是测试文本，不代表企业披露或经营原因。',
        url: 'https://static.cninfo.com.cn/finalpage/2026-03-01/fixture.pdf',
        sha256: hash,
        pagesRead: 1,
      },
    },
  ],
  news: [
    {
      id: 'fixture-news-a',
      title: '合成报道：回款与备货变化需要核对',
      date: '2026-03-02',
      media: '合成媒体甲',
      url: newsUrl,
      provider: 'eastmoney',
      digest: '合成摘要；不证明实际事件。',
      contentScope: 'media-excerpt',
      clusterId: 'fixture-repost-family',
      excerpt: {
        text: '合成媒体文本：收入增长与应收余额增加，需要核对期后回款；没有认定坏账。',
        url: newsUrl,
        sha256: hash,
        readAt: now,
      },
    },
    {
      id: 'fixture-news-b',
      title: '合成报道：回款与备货变化需要核对',
      date: '2026-03-03',
      media: '合成转载乙',
      url: 'https://finance.sina.com.cn/stock/s/2026-03-03/doc-fixture.shtml',
      provider: 'sina',
      digest: '同一合成报道转载，不是另一条独立证据。',
      contentScope: 'digest',
      clusterId: 'fixture-repost-family',
    },
    {
      id: 'fixture-news-c',
      title: '合成另一条线索：订单计划不等于已交付',
      date: '2026-03-04',
      media: '合成媒体丙',
      url: 'https://finance.eastmoney.com/a/202603043001234568.html',
      provider: 'eastmoney',
      digest: '合成标题线索；原文未读。',
      contentScope: 'headline',
    },
  ],
  discussions: [
    {
      id: 'guba-12345',
      securityCode: identity.securityCode,
      title: '合成公众观点：交付多久？（非真实帖子）',
      date: '2026-03-05',
      url: 'https://guba.eastmoney.com/news,601234,12345.html',
      provider: 'eastmoney-guba',
      textScope: 'title',
    },
  ],
  verificationLinks: [],
  warnings: ['当前全部公开数据和来源均为合成工程fixture，不是实时查询或真实企业事实。'],
});
const searchCompanies = async (query) => ({
  query,
  candidates: [identity],
  limitedToListed: true,
  source: 'cninfo',
  truncated: false,
});
const service = await createApp({
  root: '/workspace/prispect-improve',
  dataDir: '/workspace/research-envs/prispect-public-fixture-state',
  model: {},
  companyDirectory: null,
  companyService: {
    searchCompanies,
    runCompanyResearch: async () => ({
      identity,
      announcements: [],
      stoppedReason: '合成工程fixture：未实际读取任何公开原件',
      model: { requested: true, status: 'not-configured' },
    }),
  },
  companyContextService: {
    searchCompanies,
    context: async (_identity, options) => {
      const value = snapshot();
      await options?.onSnapshot?.(structuredClone(value));
      return value;
    },
    industry: async () => {
      throw Error('合成fixture没有同行数据，不发网络请求');
    },
    question: answerCompanyQuestion,
    research: async (run) => ({
      run: structuredClone(run),
      steps: [],
      modelCalls: 0,
      toolCalls: 0,
    }),
    assessment: async (run) => deriveCompanyAssessment(run),
  },
});
const server = service.app.listen(4321, '127.0.0.1', () =>
  process.stdout.write('Synthetic public UI fixture: http://127.0.0.1:4321\n')
);
const stop = () =>
  server.close(
    () =>
      void service.waitForIdle().then(() => {
        service.auth.close();
        process.exit(0);
      })
  );
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
