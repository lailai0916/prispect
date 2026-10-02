import { DOCUMENT_DATE, DOCUMENT_VERSION, type ProductDocument } from './document';

export const aboutDocument: ProductDocument = {
  title: ['关于析光', 'About Prispect'],
  description: [
    '企业资料核查与条件计算：从公开财报到具体安排。',
    'Company-evidence review and conditional calculations, from public financials to specific arrangements.',
  ],
  version: DOCUMENT_VERSION,
  updatedAt: DOCUMENT_DATE,
  sections: [
    {
      id: 'product',
      title: ['产品与用途', 'Product and purpose'],
      paragraphs: [
        [
          '析光 / Prispect 帮助你在交款、合作或接手公司前，把分散的财务资料、交易条件和收付款安排整理成可追溯的核查事项。你可以从公司名或一句具体安排开始，再逐步补充影响判断的材料。',
          'Prispect helps you organize financial documents, transaction conditions and cash arrangements into traceable reviews before a payment, partnership or company handover. Start with a company name or a specific arrangement, then add the material that affects your decision.',
        ],
        [
          '本产品由析光团队运营。公开公司研究、私人材料、假设计划和所关联记录分别呈现，避免把历史财报、对方承诺和当前资金混成一个结论。',
          'The product is operated by the Prispect team. Public company research, private materials, hypothetical plans and linked records are presented separately, so historical statements, promises and current funds do not become a single unsupported conclusion.',
        ],
      ],
    },
    {
      id: 'company-research',
      title: ['从公开资料理解公司', 'Understand a company from public disclosures'],
      paragraphs: [
        [
          '公司查询当前检索巨潮资讯的大陆 A 股披露。输入代码或公司名称后，析光核对披露主体、读取指定年度完整年报，并按实际可取得的资料检查财务表、附注与近期公告。主体有歧义时需要你选择；没有匹配或来源受限时会说明范围及停止原因。',
          'Company lookup currently covers mainland A-share disclosures on CNINFO. After a code or company name is entered, Prispect checks the disclosure identity, reads the complete annual report for the selected year, and examines financial tables, notes and recent announcements that it can obtain. Ambiguous identities require your selection. Missing matches or restricted sources show their scope and stopping reason.',
        ],
        [
          '结果优先展示取得的财务观察、对应来源和仍缺少的证据。AI 自动协助公开资料检索和解释，金额仍需核对原文及规则计算；候选字段由你确认采用后进入财报核查。',
          'Results prioritize financial observations, their sources and evidence still missing. AI automatically assists public-source retrieval and explanation. Amounts remain subject to source checks and rule calculations; you confirm candidate fields before adopting them into a financial review.',
        ],
      ],
      links: [{ label: ['查询公司', 'Look up a company'], href: '/company' }],
    },
    {
      id: 'financial-review',
      title: ['看懂利润与现金', 'Read profit alongside cash'],
      paragraphs: [
        [
          '财报核查比较同主体、同年度、同币种与合并口径的净利润和经营现金净额，并用有来源的调整项解释现金桥。每个采用的金额可以回到材料文本或原件页码；缺失、口径冲突或加总不一致时，依赖这些字段的解释停止，仍可单独采用的事实保留。',
          'Financial reviews compare net profit and operating cash flow for the same entity, financial year, currency and consolidated scope. Sourced adjustments explain the cash bridge. Adopted amounts link to material text or original pages. Missing fields, scope conflicts or inconsistent totals stop dependent explanations while independently usable facts remain visible.',
        ],
        [
          '现金利润比是经营现金净额除以合并净利润，不是销售回款率、本金安全率或公司评分。年度现金流不能直接填作今天可用的现金；原文定位与文件哈希也不构成材料真实性认证。',
          'The cash-to-profit ratio is operating cash flow divided by consolidated net profit. It is not a sales collection rate, principal-safety measure or company score. Annual cash flow cannot be used as today’s available cash, and source-text location or a file hash does not authenticate a document.',
        ],
      ],
      links: [
        { label: ['导入财务材料', 'Import financial material'], href: '/materials' },
        { label: ['了解核查方法', 'Read the method'], href: '/method' },
      ],
    },
    {
      id: 'perspectives',
      title: ['两种核查视角', 'Two review perspectives'],
      table: {
        columns: [
          ['视角', 'Perspective'],
          ['核心问题', 'Core question'],
          ['需要的当前材料', 'Current material needed'],
        ],
        rows: [
          [
            ['交款前核查', 'Before a payment'],
            [
              '合同、收款与退款责任是谁？本次付款后有多少尚未获得交付或退款抵扣的敞口？',
              'Who is responsible for the contract, receipt and refund? What exposure remains after this payment, after eligible delivery or refund amounts?',
            ],
            [
              '主体及授权、交付与退款条款、已付与已交付记录、已退款记录。对方承诺单独标记。',
              'Entities and authority, delivery and refund terms, payment and delivery records, and completed refund records. Promises are labeled separately.',
            ],
          ],
          [
            ['接手核查', 'Company handover'],
            [
              '哪些财务信号需要问前任？若安排付款，在所填现金与日期条件下，何时低于自设底线？',
              'Which financial signals need questions for the previous operator? If a payment is planned, when does cash fall below your floor under the entered balances and dates?',
            ],
            [
              '当期现金资料、受限资金说明、应收与付款时点、库存与订单、交接责任。未提供金额也可先核查资料。',
              'Current cash information, restrictions, collection and payment timing, inventory and orders, and handover responsibilities. You can review documents before supplying amounts.',
            ],
          ],
        ],
      },
      links: [{ label: ['新建核查事项', 'Create a review'], href: '/decisions?new=external' }],
    },
    {
      id: 'evidence-and-scenarios',
      title: ['让证据改变相应结果', 'Let evidence change the results it supports'],
      paragraphs: [
        [
          '证据记录绑定具体字段、主体、日期和来源。撤回一条记录时，析光重新检查依赖它的结果；没有关联的假设或历史财务资料不会因此被当作当前记录。已知冲突保留在版本历史中，恢复旧输入不能抹去后来发现的问题。',
          'Evidence records attach to specific fields, entities, dates and sources. Withdrawing a record rechecks the results that depend on it. Unrelated assumptions and historical financial documents do not become current records. Known conflicts remain in version history; restoring older inputs does not erase issues discovered later.',
        ],
        [
          '现金路径与压力沙盘用你提供的计划检验日期、回款比例及额外付款等条件。方案比较说明假设变化的影响，不预测未来回款，也不代表交易对方同意延期。未知金额保留未知，只有明确输入的零才按零计算。',
          'Cash paths and the stress sandbox test dates, collection percentages and additional payments using your plan. Comparisons show the impact of changed assumptions; they do not predict collections or establish that a counterparty accepts a delay. Unknown amounts stay unknown. Only explicitly entered zeros are treated as zero.',
        ],
      ],
    },
    {
      id: 'workspace',
      title: ['保存、回看与交接', 'Save, revisit and hand over'],
      bullets: [
        [
          '个人工作区保存材料、公开研究、财报核查和私人事项；私人事项的输入、证据变化与范围更正形成可回看的版本。',
          'Your workspace retains materials, public research, financial reviews and private reviews. Private inputs, evidence changes and scope corrections create versions you can revisit.',
        ],
        [
          '证据问题可记录跟进状态和备注。完成标记表示你的跟进进度，不表示析光认证了该事实。',
          'Evidence questions can carry follow-up status and notes. Completion tracks your follow-up; it does not certify a fact.',
        ],
        [
          '财报核查可比较两份结果，下载 HTML 或 JSON 底稿；私人事项可导出当前版本。导出保留适用条件，不建立公开分享链接。',
          'Financial reviews can be compared and exported as HTML or JSON working papers. Private reviews can export the current version. Exports retain applicable conditions and do not create public sharing links.',
        ],
      ],
      links: [{ label: ['阅读使用文档', 'Read the guide'], href: '/docs' }],
    },
    {
      id: 'limits-and-data',
      title: ['范围与数据使用', 'Scope and data use'],
      paragraphs: [
        [
          '析光提供资料整理、证据追踪与条件计算，不提供全面工商、司法或信用覆盖，也不替代银行存款产品核查、法律尽调、审计或专业财务意见。没有检索到披露不能解释为公司无风险；计算完成不能解释为付款可执行。',
          'Prispect organizes material, traces evidence and calculates conditional results. It does not provide comprehensive corporate-registry, judicial or credit coverage, or replace checks of bank deposit products, legal due diligence, audits or professional financial advice. No matching disclosure does not mean no risk; a completed calculation does not establish that a payment is executable.',
        ],
        [
          'AI 自动参与公司查询、财报核查和企业问答。数据处理范围与外部服务说明见隐私政策。',
          'AI automatically participates in company lookup, financial reviews and company questions. See the privacy policy for data-processing scope and external services.',
        ],
      ],
      links: [
        { label: ['数据与隐私', 'Data and privacy'], href: '/privacy' },
        { label: ['服务条款', 'Terms of service'], href: '/terms' },
      ],
    },
  ],
};
