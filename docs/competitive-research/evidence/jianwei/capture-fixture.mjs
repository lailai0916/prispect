import { chromium } from '/workspace/prispect/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const out = '/workspace/prispect-improve/docs/competitive-research/evidence/jianwei';
const source = {
  id: 'controlled-source',
  title: '受控交互样例：不是真实公司资料',
  url: 'https://example.com/research-fixture',
  publisher: 'example.com',
  excerpt: '受控样例仅用于研究页面如何展示来源状态；不作为真实企业、金融或来源证据。',
  published_at: null,
  date_semantics: '公开日期未核实',
  fetched_at: new Date().toISOString(),
  verification_status: 'search_excerpt',
  channel: 'community',
  purpose: '受控页面状态研究',
  page_status: '没有抓取外部正文',
  cached: false,
  scope: 'brand_context',
};
const identity = {
  id: 'controlled-company',
  name: '虚构研究演练公司',
  basis: '受控交互样例；门店关联尚未核实',
  source_ids: [source.id],
  relationship_status: '尚未核实',
};
const report = {
  analysis_id: 'controlled-analysis',
  company_id: identity.id,
  generated_at: source.fetched_at,
  evidence_as_of: source.fetched_at,
  mode: 'controlled_fixture',
  fallback: true,
  agent_status: '受控样例：未调用模型',
  coverage_status: 'unverified_leads',
  identity,
  summary: '受控交互样例',
  sources: [source],
  source_stats: { websites: 1 },
  risk: {
    level: 'undetermined',
    decision_level: 'medium',
    decision_basis: 'information_gap',
    model_assessed: false,
    confidence: 'low',
    reasons: [
      {
        explanation: '受控样例：资料尚待核实',
        direction: 'context',
        citations: [{ source_id: source.id, quote: source.excerpt }],
      },
    ],
    limitations: ['受控交互样例'],
    confidence_explanation: '低确信度：日期仍待核实',
    confidence_dimensions: [{ label: '原始支持度', value: '低确信度（日期仍待核实）' }],
  },
  reviews: {
    status: 'completed',
    collected_count: 1,
    reviewed_count: 1,
    independent_content_count: 1,
    counts: { unclear: 1 },
    observations: [
      {
        source_id: source.id,
        kind: 'discussion',
        sentiment: 'unclear',
        summary: '受控演练：无法归属具体门店',
        quote: source.excerpt,
        scope: 'brand_context',
        duplicate_of: null,
      },
    ],
    limitation: '非真实评价统计',
  },
  cashflow: {
    mode: 'sensitivity_only',
    horizon_months: 6,
    unit: '受控条件样例指数，非企业实际金额',
    baseline: { description: '样例：基准100', period: '未取得实际基线' },
    facts: [],
    driver_source_ids: [source.id],
    scenarios: [
      {
        name: '受控条件样例',
        inflow_change_pct: -20,
        outflow_change_pct: 10,
        assumption: '研究页面结构的虚构输入',
        cumulative_net_min: -30,
        cumulative_net_max: 10,
        months: [
          { month: 1, inflow: 100, outflow_min: 90, outflow_max: 110, net_min: -10, net_max: 10 },
        ],
      },
    ],
    limitations: ['未取得实际现金收付款'],
  },
  indicators: [
    {
      id: 'identity',
      label: '门店与企业关系',
      status: 'unknown',
      value: '门店归属待核实',
      explanation: '受控样例：尚待核实',
      source_ids: [source.id],
      missing: ['经营关系材料'],
      agent_findings: [],
    },
  ],
  changes: [
    {
      id: 'controlled-change',
      title: '受控样例变化',
      fact_text: '没有真实事件',
      event_date: null,
      stage: '尚待核实',
      consumer_relevance: '尚未建立联系',
      interpretations: [{ text: '尚待核实' }],
      source_ids: [source.id],
    },
  ],
  questions: ['合同抬头与实际收款方是不是同一主体？'],
  unknowns: ['门店归属待核实', '公开日期仍待核实'],
  counter_source_ids: [source.id],
  counter_search_status: '受控样例，没有实际反方检索',
  criteria: { limitation: '受控样例，不代表真实调查范围' },
  trace: [
    { action: '受控交互研究', detail: '浏览器拦截返回，未调用外部服务', source_ids: [source.id] },
  ],
};
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
await page.route('**/api/consumer/discovery', (route) =>
  route.fulfill({
    json: {
      investigation_id: 'controlled-investigation',
      query: '虚构研究演练',
      location: '',
      generated_at: source.fetched_at,
      mode: 'live_search',
      candidates: [identity],
      sources: [source],
      trace: [],
      unknowns: [],
    },
  })
);
await page.route('**/api/consumer/jobs', (route) =>
  route.fulfill({ status: 202, json: { job_id: 'controlled-job' } })
);
await page.route('**/api/consumer/jobs/controlled-job', (route) =>
  route.fulfill({ json: { status: 'completed', message: '受控交互研究完成', result: report } })
);
await page.goto('http://127.0.0.1:4403/?view=consumer');
await page.getByLabel('门店、品牌或公司名称').fill('虚构研究演练');
await page.getByRole('button', { name: '查找经营主体', exact: true }).click();
await page.getByRole('radio').check();
await page.getByRole('button', { name: '查看企业变化', exact: true }).click();
await page.getByRole('heading', { name: '查询结果', exact: true }).waitFor();
await page.screenshot({ path: `${out}/fixture-report-overview.png`, fullPage: true });
const titles = [
  '这家公司是谁',
  '为什么是这个风险',
  '消费者怎么说',
  '未来收支试算',
  '逐项查看情况',
  '最近有什么变化',
  '还要问门店什么',
  '全部证据',
  '调查范围与局限',
  '调查过程',
];
const inspected = [];
for (let i = 0; i < titles.length; i++) {
  const title = titles[i];
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await page.screenshot({ path: `${out}/fixture-report-${i + 1}.png`, fullPage: true });
  inspected.push({ page: title, visible: await page.locator('body').innerText() });
  await page.getByRole('button', { name: '返回查询结果' }).click();
}
await fs.writeFile(
  `${out}/fixture-report-pages.json`,
  JSON.stringify(
    {
      sha: 'a3274e5ddafbeecf0f5cc8e35093c6d1fe1c4e53',
      mode: 'controlled_browser_response_fixture_no_real_company_or_model',
      report,
      inspected,
    },
    null,
    2
  )
);
await browser.close();
