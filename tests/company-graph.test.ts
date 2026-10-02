import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { initialCompanyGraphProgress, runCompanyResearch } from '../server/company-agent.js';
import type { CompanyGraphProgress } from '../shared/company-contracts.js';
import { modelFailureDiagnostic } from '../server/model.js';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import type { CompanyIdentity } from '../shared/contracts.js';
function textPdf(pages: string[]): Buffer {
  const hex = (text: string) =>
    [...text].map((char) => char.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  const characters = [...new Set(pages.join('').split(''))].filter((char) => char !== '\n');
  const mapping = characters.map((char) => `<${hex(char)}> <${hex(char)}>`).join('\n');
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Test-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${characters.length} beginbfchar\n${mapping}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  const stream = (content: string) =>
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${7 + i * 2} 0 R`).join(' ')}] >>`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /TestFont /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 6 0 R >>',
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /TestFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /DW 500 /CIDToGIDMap /Identity >>',
    '<< /Type /FontDescriptor /FontName /TestFont /Flags 4 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 80 >>',
    stream(cmap),
  ];
  for (const [index, page] of pages.entries()) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 840] /Resources << /Font << /F1 3 0 R >> >> /Contents ${8 + index * 2} 0 R >>`
    );
    objects.push(
      stream(
        `BT\n/F1 10 Tf\n1 0 0 1 20 810 Tm\n14 TL\n${page
          .split('\n')
          .map((line, i) => `${i ? 'T*\n' : ''}<${hex(line)}> Tj`)
          .join('\n')}\nET`
      )
    );
  }
  let result = '%PDF-1.7\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const input = { securityCode: '300750', orgId: 'GD165627', year: 2025 };
const annualPdf = textPdf([
  '测试股份有限公司\n股票代码：300750\n2025年年度报告\n本报告金额以人民币千元列示',
  '合并财务报表项目注释\n现金流量表补充资料\n单位：千元\n补充资料 本期金额 上期金额\n1.将净利润调节为经营活动现金流量\n净利润 100 80\n加：折旧 10 10',
  '存货的减少 -20 -10\n经营性应收项目的减少 -30 -20\n经营性应付项目的增加 10 10\n经营活动产生的现金流量净额 70 70',
  '财务报表附注\n应收账款账龄\n信用期变化与期后回款仍需核查',
]);
const noticePdf = textPdf([
  '测试股份有限公司\n关于结算安排的公告\n应收账款结算与回款安排，不能代替实际银行流水',
]);
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(
  options: {
    blockNotice?: boolean;
    requireParallel?: boolean;
    annual?: Buffer;
    market?: boolean;
  } = {}
) {
  const calls: string[] = [];
  let releaseRecent!: () => void;
  const recentStarted = new Promise<void>((resolve) => {
    releaseRecent = resolve;
  });
  let noticeBlocked = options.blockNotice;
  let noticeStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    noticeStarted = resolve;
  });
  const fetcher: typeof fetch = async (url, init) => {
    const address = String(url);
    calls.push(address);
    if (address.startsWith('https://datacenter.eastmoney.com/'))
      return options.market
        ? json({
            success: true,
            result: {
              data: [
                {
                  SECUCODE: '300750.SZ',
                  SECURITY_CODE: '300750',
                  ORG_CODE: '10000000001',
                  ORG_TYPE: '通用',
                  CURRENCY: 'CNY',
                  REPORT_TYPE: '年报',
                  REPORT_DATE: '2025-12-31 00:00:00',
                  NETPROFIT: '100000.00',
                  TOTAL_OPERATE_INCOME: '300000.00',
                  NETCASH_OPERATE: '70000.00',
                  NETCASH_INVEST: '-10000.00',
                  NETCASH_FINANCE: '5000.00',
                  MONETARYFUNDS: '40000.00',
                  SHORT_LOAN: null,
                  NONCURRENT_LIAB_1YEAR: '10000.00',
                  ACCOUNTS_RECE: '20000.00',
                  INVENTORY: '30000.00',
                  TOTAL_ASSETS: '500000.00',
                  TOTAL_LIABILITIES: '200000.00',
                },
              ],
            },
          })
        : json({ success: true, result: { data: [] } });
    if (address.endsWith('/topSearch/query'))
      return json([
        { code: '300750', orgId: 'GD165627', zwjc: '测试公司', category: 'A股', delisted: 'false' },
      ]);
    if (address.endsWith('/hisAnnouncement/query')) {
      const form = new URLSearchParams(String(init?.body));
      if (!form.get('category')) {
        releaseRecent();
        return json({
          announcements: [
            {
              announcementId: '16',
              announcementTitle: '关于结算安排的公告',
              announcementTime: Date.now(),
              adjunctUrl: 'finalpage/2026-10-02/16.PDF',
              secCode: '300750',
              orgId: 'GD165627',
            },
          ],
          hasMore: false,
        });
      }
      if (options.requireParallel)
        await Promise.race([
          recentStarted,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('recent branch did not start in parallel')), 500)
          ),
        ]);
      return json({
        announcements: [
          {
            announcementId: '15',
            announcementTitle: '2025年年度报告',
            announcementTime: Date.parse('2026-03-10'),
            adjunctUrl: 'finalpage/2026-03-10/15.PDF',
            secCode: '300750',
            orgId: 'GD165627',
          },
        ],
        hasMore: false,
      });
    }
    if (address.endsWith('/16.PDF')) {
      noticeStarted();
      if (noticeBlocked) {
        noticeBlocked = false;
        await new Promise((_, reject) => {
          const abort = () => reject(new Error('aborted notice'));
          init?.signal?.addEventListener('abort', abort, { once: true });
          if (init?.signal?.aborted) abort();
        });
      }
      return new Response(new Uint8Array(noticePdf));
    }
    assert.ok(address.endsWith('/15.PDF'));
    return new Response(new Uint8Array(options.annual || annualPdf));
  };
  return { fetch: fetcher, calls, started };
}
test('web context is saved separately, never adopted into PDF observations, and completed checkpoints do not refetch it', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-market-graph-'));
  const source = fixture({ market: true });
  const threadId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  try {
    const output = await runCompanyResearch(input, {
      root,
      fetch: source.fetch,
      checkpoint: { directory, threadId },
    });
    assert.equal(output.agent?.financialContext?.status, 'partial');
    assert.equal(output.agent?.financialContext?.years[0]?.amounts.netProfit, '100000.00');
    assert.equal(output.agent?.financialContext?.years[0]?.amounts.shortLoans, null);
    assert.equal(
      output.agent?.branches.find((branch) => branch.id === 'market-data')?.status,
      'completed'
    );
    assert.equal(source.calls.filter((url) => url.includes('datacenter.eastmoney.com')).length, 3);
    assert.ok(
      output.preview?.material.observations.every((row) =>
        [
          'netProfit',
          'operatingCashFlow',
          'inventoryAdjustment',
          'receivablesAdjustment',
          'payablesAdjustment',
          'otherAdjustments',
        ].includes(row.key)
      )
    );
    assert.equal(
      JSON.parse(await readFile(path.join(directory, 'scope.json'), 'utf8')).version,
      'langgraph-v2-market'
    );
    const calls = source.calls.length;
    const published = await runCompanyResearch(input, {
      root,
      fetch: source.fetch,
      checkpoint: { directory, threadId, resume: true },
      previousProgress: output.agent,
    });
    assert.equal(source.calls.length, calls);
    assert.deepEqual(published.agent?.financialContext, output.agent?.financialContext);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a real v1 SQLite checkpoint resumes the old reconciliation topology without scheduling market data', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-legacy-graph-'));
  const threadId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const identity: CompanyIdentity = {
    securityCode: input.securityCode,
    orgId: input.orgId,
    shortName: '测试公司',
    companyName: null,
    exchange: 'szse',
    sourceUrl: 'https://www.cninfo.com.cn/',
  };
  const oldState = Annotation.Root({ identity: Annotation<CompanyIdentity | undefined>() });
  const saver = SqliteSaver.fromConnString(path.join(directory, 'checkpoints.sqlite'));
  const oldGraph = new StateGraph(oldState)
    .addNode('resolve', async () => ({ identity }))
    .addNode('annual_list', async () => {
      throw new Error('fixture v1 interruption');
    })
    .addNode('recent_list', async () => ({}))
    .addNode('acquire', async () => ({}))
    .addNode('financial', async () => ({}))
    .addNode('annual_notes', async () => ({}))
    .addNode('recent_texts', async () => ({}))
    .addNode('reconcile', async () => ({}))
    .addEdge(START, 'resolve')
    .addEdge('resolve', 'annual_list')
    .addEdge('resolve', 'recent_list')
    .addEdge('annual_list', 'acquire')
    .addEdge('acquire', 'financial')
    .addEdge('acquire', 'annual_notes')
    .addEdge(['recent_list', 'acquire'], 'recent_texts')
    .addEdge(['financial', 'annual_notes', 'recent_texts'], 'reconcile')
    .addEdge('reconcile', END)
    .compile({ checkpointer: saver });
  try {
    await assert.rejects(
      () => oldGraph.invoke({}, { configurable: { thread_id: threadId } }),
      /fixture v1 interruption/
    );
  } finally {
    saver.db.close();
  }
  try {
    await writeFile(
      path.join(directory, 'scope.json'),
      JSON.stringify({
        version: 'langgraph-v1',
        input,
        model: 'gpt-6.1-sol',
        provider: 'api.openai.com',
        tier: null,
      })
    );
    const source = fixture();
    const previous = initialCompanyGraphProgress(undefined, false);
    previous.branches[0]!.status = 'completed';
    const output = await runCompanyResearch(input, {
      root,
      fetch: source.fetch,
      checkpoint: { directory, threadId, resume: true },
      previousProgress: previous,
      // Resume the historical scope explicitly even if runtime defaults change.
      model: { model: 'gpt-6.1-sol', baseUrl: 'https://api.openai.com/v1' },
    });
    assert.equal(output.agent?.financialContext, undefined);
    assert.equal(
      output.agent?.branches.some((branch) => branch.id === 'market-data'),
      false
    );
    assert.equal(
      source.calls.some((url) => url.includes('datacenter.eastmoney.com')),
      false
    );
    assert.equal(output.preview?.material.observations.length, 12);
    assert.equal(
      output.agent?.branches.find((branch) => branch.id === 'reconcile')?.status,
      'completed'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('LangGraph executes actual independent official searches in parallel and retains original amounts plus scope limitations', async () => {
  const source = fixture({ requireParallel: true });
  const output = await runCompanyResearch(input, { root, fetch: source.fetch });
  assert.equal(output.agent?.version, 'langgraph-v1');
  assert.equal(output.agent?.coverage.recentFullTexts, 1);
  assert.equal(output.agent?.coverage.annualReports, 1);
  assert.equal(output.agent?.branches.filter((item) => item.status === 'completed').length, 5);
  assert.equal(
    output.preview?.material.observations.find(
      (item) => item.key === 'netProfit' && item.year === 2025
    )?.value,
    '100000.00'
  );
  assert.ok(
    output.agent?.evidence.some(
      (item) => item.kind === 'annual-note' && item.quote.includes('应收账款')
    )
  );
  assert.ok(output.agent?.evidence.some((item) => item.kind === 'announcement'));
  assert.equal(output.agent?.budget.modelRequests, 0);
  assert.ok(output.agent?.coverage.warnings.some((item) => item.includes('合同相对方')));
});
test('durable cancellation resumes only incomplete public nodes, reuses source hash, and refuses another entity or year', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-graph-'));
  const source = fixture({ blockNotice: true });
  const controller = new AbortController();
  let progress: CompanyGraphProgress | undefined;
  const threadId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  try {
    const running = runCompanyResearch(input, {
      root,
      fetch: source.fetch,
      signal: controller.signal,
      checkpoint: { directory, threadId },
      onProgress: (value) => {
        progress = value;
      },
    });
    await source.started;
    await new Promise((resolve) => setTimeout(resolve, 70));
    controller.abort();
    await assert.rejects(running);
    assert.equal(progress?.recoverable, true);
    assert.equal(progress?.cancelRequested, true);
    const before = source.calls.filter((item) => item.endsWith('/15.PDF')).length;
    const resumed = await runCompanyResearch(input, {
      root,
      fetch: source.fetch,
      checkpoint: { directory, threadId, resume: true },
      previousProgress: progress,
    });
    assert.equal(
      source.calls.filter((item) => item.endsWith('/15.PDF')).length,
      before,
      'completed annual acquisition is restored from checkpoint, not fetched again'
    );
    assert.equal(resumed.preview?.material.observations.length, 12);
    assert.equal(resumed.agent?.recoverable, false);
    assert.equal(resumed.agent?.coverage.recentFullTexts, 1);
    const sourceCount = source.calls.length;
    const publishAgain = await runCompanyResearch(input, {
      root,
      fetch: source.fetch,
      checkpoint: { directory, threadId, resume: true },
      previousProgress: resumed.agent,
    });
    assert.equal(
      source.calls.length,
      sourceCount,
      'a completed checkpoint can republish without tool replay'
    );
    assert.deepEqual(
      publishAgain.preview?.material.observations,
      resumed.preview?.material.observations
    );
    assert.equal(publishAgain.agent?.budget.sourceRequests, resumed.agent?.budget.sourceRequests);
    const cachedPath = path.join(directory, `${resumed.preview!.material.sha256}.pdf`);
    const cached = await readFile(cachedPath);
    const mutated = Buffer.from(cached);
    mutated[mutated.length - 10] ^= 1;
    await writeFile(cachedPath, mutated);
    await assert.rejects(
      () =>
        runCompanyResearch(input, {
          root,
          fetch: source.fetch,
          checkpoint: { directory, threadId, resume: true },
          previousProgress: resumed.agent,
        }),
      /哈希不一致/
    );
    assert.equal(
      source.calls.length,
      sourceCount,
      'a filename containing H1 cannot silently fetch or adopt H2'
    );
    await writeFile(cachedPath, cached);
    await assert.rejects(
      () =>
        runCompanyResearch(
          { ...input, year: 2024 },
          { root, fetch: source.fetch, checkpoint: { directory, threadId, resume: true } }
        ),
      /主体、年度或模型选项不同/
    );
    const scope = await readFile(path.join(directory, 'scope.json'), 'utf8');
    assert.ok(!scope.includes('apiKey'));
    assert.ok(!scope.includes('私人'));
    assert.ok(scope.includes('300750'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
for (const legacyChoice of [undefined, false]) {
  test(`legacy AI ${legacyChoice === undefined ? 'omission' : 'opt-out'} upgrades only incomplete checkpoint nodes without relaxing identity or model scope`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-ai-checkpoint-'));
    const source = fixture({ blockNotice: true });
    const controller = new AbortController();
    const threadId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    let progress: CompanyGraphProgress | undefined;
    let financeDone!: () => void;
    const financeCompleted = new Promise<void>((resolve) => {
      financeDone = resolve;
    });
    let modelCalls = 0;
    const model = {
      apiKey: 'fixture-only',
      model: 'grok-4.7-fast',
      baseUrl: 'https://model.invalid/v1',
      fetch: async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        modelCalls++;
        const supplied = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
        const content = supplied.candidates
          ? { action: 'finish', selectedIds: [] }
          : { selections: [] };
        return json({ choices: [{ message: { content: JSON.stringify(content) } }] });
      },
    };
    const oldInput = {
      ...input,
      ...(legacyChoice === undefined ? {} : { useModel: legacyChoice }),
    };
    try {
      const running = runCompanyResearch(oldInput, {
        root,
        fetch: source.fetch,
        model,
        signal: controller.signal,
        checkpoint: { directory, threadId },
        onProgress: (value) => {
          progress = value;
          if (
            value.branches.some(
              (branch) => branch.id === 'finance' && branch.status === 'completed'
            )
          )
            financeDone();
        },
      });
      await Promise.all([source.started, financeCompleted]);
      const reader = SqliteSaver.fromConnString(path.join(directory, 'checkpoints.sqlite'));
      try {
        let savedFinance = false;
        for (let attempt = 0; attempt < 200 && !savedFinance; attempt++) {
          const saved = await reader.getTuple({ configurable: { thread_id: threadId } });
          savedFinance =
            !!saved?.checkpoint.channel_values.finance ||
            !!saved?.pendingWrites?.some(([, channel]) => channel === 'finance');
          if (!savedFinance) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.ok(
          savedFinance,
          'the completed financial result is durably checkpointed before cancellation'
        );
      } finally {
        reader.db.close();
      }
      controller.abort();
      await assert.rejects(running);
      assert.equal(modelCalls, 0);
      const before = source.calls.filter((url) => url.endsWith('/15.PDF')).length;
      const oldScope = await readFile(path.join(directory, 'scope.json'), 'utf8');
      const upgradedInput = { ...oldInput, useModel: true };
      for (const different of [
        { input: { ...upgradedInput, securityCode: '000001' }, model },
        { input: { ...upgradedInput, orgId: 'ANOTHER' }, model },
        { input: { ...upgradedInput, year: 2024 }, model },
        { input: upgradedInput, model: { ...model, model: 'another-model' } },
        { input: upgradedInput, model: { ...model, baseUrl: 'https://another.invalid/v1' } },
        { input: upgradedInput, model: { ...model, serviceTier: 'priority' as const } },
      ]) {
        await assert.rejects(
          () =>
            runCompanyResearch(different.input, {
              root,
              fetch: source.fetch,
              model: different.model,
              checkpoint: { directory, threadId, resume: true },
              previousProgress: progress,
            }),
          /主体、年度或模型选项不同/
        );
        assert.equal(await readFile(path.join(directory, 'scope.json'), 'utf8'), oldScope);
      }
      const resumedTools: string[] = [];
      const resumed = await runCompanyResearch(upgradedInput, {
        root,
        fetch: source.fetch,
        model,
        checkpoint: { directory, threadId, resume: true },
        previousProgress: progress,
        onUpdate: (entry) => {
          resumedTools.push(entry.tool);
        },
      });
      assert.ok(modelCalls > 0, 'incomplete public branches now use the configured model');
      assert.equal(resumed.agent?.budget.modelRequests, modelCalls);
      assert.equal(source.calls.filter((url) => url.endsWith('/15.PDF')).length, before);
      assert.ok(
        !resumedTools.includes('model_public_summary'),
        'saved financial results are not rerun'
      );
      assert.equal(
        resumed.model.status,
        'not-requested',
        'the completed historical financial branch keeps its actual model status'
      );
      assert.equal(
        JSON.parse(await readFile(path.join(directory, 'scope.json'), 'utf8')).input.useModel,
        true
      );
      assert.ok(resumed.preview?.material.observations.length);
      assert.equal(
        resumed.agent?.budget.sourceRequests,
        source.calls.length,
        'source budget remains cumulative'
      );
      await assert.rejects(
        () =>
          runCompanyResearch(oldInput, {
            root,
            model,
            fetch: source.fetch,
            checkpoint: { directory, threadId, resume: true },
          }),
        /主体、年度或模型选项不同/,
        'a checkpoint cannot return to a retired opt-out'
      );
    } finally {
      controller.abort();
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('public model selection accepts only existing references and type-matched hypotheses; no private fields or automatic tier are sent', async () => {
  const source = fixture();
  const bodies: string[] = [];
  const output = await runCompanyResearch(
    { ...input, useModel: true },
    {
      root,
      fetch: source.fetch,
      model: {
        apiKey: 'synthetic-not-real',
        model: 'grok-4.7-fast',
        baseUrl: 'https://model.test/v1',
        fetch: async (_url, init) => {
          const body = String(init?.body);
          bodies.push(body);
          const payload = JSON.parse(body) as {
            model: string;
            messages: { content: string }[];
            service_tier?: string;
          };
          assert.equal(payload.model, 'grok-4.7-fast');
          assert.equal(payload.service_tier, undefined);
          const supplied = JSON.parse(payload.messages[1]!.content) as {
            evidence?: { id: string }[];
            verdict?: string;
          };
          if (supplied.verdict)
            return json({
              service_tier: 'default',
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      explanations: [
                        {
                          text: '经营现金与利润应分别核查，不能直接认定原因。',
                          citations: [supplied.evidence![0]!.id],
                        },
                      ],
                    }),
                  },
                },
              ],
            });
          return json({
            service_tier: 'default',
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    selections: [
                      { hypothesis: 'collection-pressure', evidenceIds: ['invented-reference'] },
                    ],
                  }),
                },
              },
            ],
          });
        },
      },
    }
  );
  assert.ok(bodies.length >= 2);
  assert.equal(output.agent?.budget.modelRequests, bodies.length);
  assert.deepEqual(output.agent?.providerDiagnostics?.actualTiers, ['default']);
  assert.equal(output.agent?.competingExplanations.length, 0);
  for (const body of bodies)
    for (const forbidden of [
      'password',
      'phoneNumber',
      'openingCash',
      'contextNotes',
      'promise',
      'privateContract',
    ])
      assert.ok(!body.includes(forbidden));
  assert.ok(output.agent?.coverage.warnings.some((item) => item.includes('解释未完成')));
});

test('the bounded public follow-up selects a new page and then reads it; financial amounts stay unchanged', async () => {
  const extraNotes = textPdf([
    '测试股份有限公司\n股票代码：300750\n2025年年度报告\n本报告金额以人民币千元列示',
    '合并财务报表项目注释\n现金流量表补充资料\n单位：千元\n补充资料 本期金额 上期金额\n1.将净利润调节为经营活动现金流量\n净利润 100 80\n加：折旧 10 10',
    '存货的减少 -20 -10\n经营性应收项目的减少 -30 -20\n经营性应付项目的增加 10 10\n经营活动产生的现金流量净额 70 70',
    '应收账款账龄\n信用减值与账龄应分别分析',
    '应收账款信用期\n信用期变化与期后回款',
    '存货跌价\n存货跌价与期后销售',
    '应收账款回款安排\n应收账款结算方式',
  ]);
  const source = fixture({ annual: extraNotes });
  const traces: { tool: string; status: string; sources: { page?: number }[] }[] = [];
  const output = await runCompanyResearch(
    { ...input, useModel: true },
    {
      root,
      fetch: source.fetch,
      onUpdate: (trace) => {
        traces.push(trace);
      },
      model: {
        apiKey: 'synthetic-not-real',
        baseUrl: 'https://model.test/v1',
        model: 'gpt-6.1-sol',
        fetch: async (_url, init) => {
          const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
          const supplied = JSON.parse(body.messages[1]!.content) as {
            candidates?: { id: string }[];
            evidence?: { id: string }[];
            verdict?: string;
          };
          const content = supplied.candidates
            ? { action: 'select', selectedIds: [supplied.candidates[0]!.id] }
            : supplied.verdict
              ? {
                  explanations: [
                    {
                      text: '已披露金额仍须结合结算与回款材料核查。',
                      citations: [supplied.evidence![0]!.id],
                    },
                  ],
                }
              : {
                  selections: [
                    { hypothesis: 'collection-pressure', evidenceIds: [supplied.evidence![0]!.id] },
                  ],
                };
          return json({ choices: [{ message: { content: JSON.stringify(content) } }] });
        },
      },
    }
  );
  const followups = traces.filter(
    (entry) => entry.tool === 'read_new_note_pages' && entry.status === 'completed'
  );
  assert.equal(followups.length, 1);
  assert.equal(followups[0]!.sources.length, 1);
  assert.equal(output.agent?.evidence.filter((item) => item.kind === 'annual-note').length, 4);
  assert.ok(
    traces.some((entry) => entry.tool === 'model_announcement_plan' && entry.status === 'completed')
  );
  assert.equal(
    output.preview?.material.observations.find(
      (item) => item.key === 'operatingCashFlow' && item.year === 2025
    )?.value,
    '70000.00'
  );
  assert.ok(output.agent?.competingExplanations.every((item) => item.status === 'hypothesis'));
});

test('one schema correction remains budgeted and duplicate cross-branch hypotheses retain their combined real references', async () => {
  const source = fixture();
  let selections = 0;
  const output = await runCompanyResearch(
    { ...input, useModel: true },
    {
      root,
      fetch: source.fetch,
      model: {
        apiKey: 'test-only',
        baseUrl: 'https://model.invalid/v1',
        model: 'grok-4.7-fast',
        fetch: async (_url, init) => {
          const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
          const supplied = JSON.parse(body.messages[1]!.content) as {
            candidates?: { id: string }[];
            evidence?: { id: string }[];
            verdict?: string;
          };
          const content = supplied.candidates
            ? { action: 'select', selectedIds: [supplied.candidates[0]!.id] }
            : supplied.verdict
              ? {
                  explanations: [
                    { text: '原表仍需核查。', citations: [supplied.evidence![0]!.id] },
                  ],
                }
              : {
                  selections: [
                    {
                      hypothesis:
                        ++selections === 1
                          ? 'collection-pressure|payment-timing'
                          : 'collection-pressure',
                      evidenceIds: [supplied.evidence![0]!.id],
                    },
                  ],
                };
          return json({ choices: [{ message: { content: JSON.stringify(content) } }] });
        },
      },
    }
  );
  assert.equal(selections, 3, 'two evidence branches and one bounded schema correction');
  assert.equal(
    output.agent?.providerDiagnostics?.validationFailures?.filter(
      (item) => item.category === 'schema'
    ).length,
    1
  );
  assert.equal(output.agent?.competingExplanations.length, 1);
  assert.ok(output.agent!.competingExplanations[0]!.evidenceIds.length >= 2);
  assert.ok(
    output.agent!.competingExplanations[0]!.evidenceIds.every((id) =>
      output.agent!.evidence.some((item) => item.id === id)
    )
  );
  assert.ok(output.agent!.budget.modelRequests <= output.agent!.budget.maxModelRequests);
  assert.equal(output.preview?.material.observations.length, 12);
});

test('a large recent appendix stops within its smaller budget while the confirmed annual finance evidence remains available', async () => {
  const source = fixture();
  const traces: { tool: string; status: string }[] = [];
  const output = await runCompanyResearch(input, {
    root,
    fetch: async (url, init) =>
      String(url).endsWith('/16.PDF')
        ? new Response('%PDF-1.7', { headers: { 'Content-Length': String(26 * 1024 * 1024) } })
        : source.fetch(url, init),
    onUpdate: (trace) => {
      traces.push(trace);
    },
  });
  assert.equal(output.preview?.material.observations.length, 12);
  assert.equal(output.agent?.coverage.recentFullTexts, 0);
  assert.ok(
    traces.some((trace) => trace.tool === 'read_announcement_pdf' && trace.status === 'failed')
  );
  assert.ok(output.agent?.coverage.warnings.some((warning) => warning.includes('原件未读完')));
});

test('a recovered model budget stays consumed and cannot silently restart or substitute a model', async () => {
  const source = fixture();
  let requests = 0;
  const previous = initialCompanyGraphProgress();
  previous.budget.modelRequests = 12;
  const output = await runCompanyResearch(
    { ...input, useModel: true },
    {
      root,
      fetch: source.fetch,
      previousProgress: previous,
      model: {
        apiKey: 'synthetic-not-real',
        model: 'gpt-6.1-sol',
        fetch: async () => {
          requests++;
          throw new Error('exhausted budget must not call provider');
        },
      },
    }
  );
  assert.equal(requests, 0);
  assert.equal(output.agent?.budget.modelRequests, 12);
  assert.equal(output.model.name, 'gpt-6.1-sol');
  assert.equal(output.preview?.material.observations.length, 12);
  assert.ok(output.agent?.coverage.warnings.length);
});

test('model failure diagnostics retain only fixed transport and validation codes, never exception details', async () => {
  const privateMarker = 'do-not-persist-test-credential-or-body';
  const source = fixture();
  const output = await runCompanyResearch(
    { ...input, useModel: true },
    {
      root,
      fetch: source.fetch,
      model: {
        apiKey: privateMarker,
        baseUrl: 'https://model.test/v1',
        fetch: async () => {
          throw new TypeError(privateMarker, {
            cause: Object.assign(new Error(privateMarker), { code: 'ECONNRESET' }),
          });
        },
      },
    }
  );
  const diagnostics = output.agent?.providerDiagnostics;
  assert.ok(diagnostics?.requests?.length);
  assert.ok(
    diagnostics.requests.every(
      (request) =>
        request.status === 'failed' &&
        request.failure?.category === 'transport' &&
        request.failure.transportCode === 'ECONNRESET'
    )
  );
  assert.ok(!JSON.stringify(output).includes(privateMarker));
  assert.deepEqual(modelFailureDiagnostic(new SyntaxError(privateMarker)), {
    errorCode: 'MODEL_OUTPUT_PARSE',
    category: 'parse',
  });
  assert.deepEqual(
    modelFailureDiagnostic(Object.assign(new Error(privateMarker), { name: 'TimeoutError' })),
    { errorCode: 'MODEL_TIMEOUT', category: 'timeout' }
  );
  assert.deepEqual(modelFailureDiagnostic(new Error('MODEL_CITATION')), {
    errorCode: 'MODEL_CITATION',
    category: 'validation',
  });
  assert.deepEqual(modelFailureDiagnostic(new Error('MODEL_SECRET_CREDENTIAL')), {
    errorCode: 'MODEL_REQUEST_FAILED',
    category: 'unknown',
  });
});

test('a public request reservation must persist before the request leaves the process', async () => {
  let sent = 0,
    reserved = 0;
  await assert.rejects(
    () =>
      runCompanyResearch(input, {
        root,
        fetch: async () => {
          sent++;
          throw new Error('request must not start');
        },
        onProgress: async (progress) => {
          if (progress.budget.sourceRequests) {
            reserved = progress.budget.sourceRequests;
            throw new Error('fixture reservation persistence failed');
          }
        },
      }),
    /进度保存失败/
  );
  assert.equal(sent, 0);
  assert.equal(reserved, 1);
});

test('a late model reservation cannot send after a parallel progress persistence failure', async () => {
  const source = fixture();
  let releaseFirst!: () => void;
  const delayed = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let reportFailure!: () => void;
  const failed = new Promise<void>((resolve) => {
    reportFailure = resolve;
  });
  let firstBlocked = false;
  let storageFailed = false;
  let modelSent = 0;
  const running = runCompanyResearch(
    { ...input, useModel: true },
    {
      root,
      fetch: source.fetch,
      model: {
        apiKey: 'synthetic-not-real',
        fetch: async () => {
          modelSent++;
          return json({ choices: [] });
        },
      },
      onProgress: async (progress) => {
        if (progress.budget.modelRequests === 1 && !firstBlocked) {
          firstBlocked = true;
          await delayed;
        } else if (firstBlocked && progress.budget.modelRequests >= 2 && !storageFailed) {
          storageFailed = true;
          reportFailure();
          throw new Error('fixture parallel storage failure');
        }
      },
    }
  );
  void running.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      failed,
      new Promise<void>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('fixture second model reservation did not arrive')),
          5000 // Allow concurrent PDF fixtures to finish; this is not a latency assertion.
        );
      }),
    ]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseFirst();
    await assert.rejects(running, /进度保存失败/);
    assert.equal(
      modelSent,
      0,
      'neither the failed reservation nor the late successful emit sends a model request'
    );
  } finally {
    if (timer) clearTimeout(timer);
    releaseFirst();
    await running.catch(() => undefined);
  }
});

test('parallel public branches cannot exceed a cumulative recovered request budget', async () => {
  const source = fixture();
  const previous = initialCompanyGraphProgress();
  previous.budget.sourceRequests = 30;
  let highest = 30;
  await assert.rejects(
    () =>
      runCompanyResearch(input, {
        root,
        fetch: source.fetch,
        previousProgress: previous,
        onProgress: (progress) => {
          highest = Math.max(highest, progress.budget.sourceRequests);
        },
      }),
    /预算/
  );
  assert.equal(
    source.calls.length,
    2,
    'only identity and one of the parallel lists can reserve the remaining attempts'
  );
  assert.equal(highest, 32, 'the budget neither resets nor grows beyond its cap');
});

test('a failing parallel branch keeps the runner and checkpoint open until an abort-ignoring sibling settles', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-company-siblings-'));
  let siblingStarted!: () => void, releaseSibling!: () => void, failureRecorded!: () => void;
  const started = new Promise<void>((resolve) => {
    siblingStarted = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    releaseSibling = resolve;
  });
  const failed = new Promise<void>((resolve) => {
    failureRecorded = resolve;
  });
  const source = fixture();
  let settled = false;
  const running = runCompanyResearch(input, {
    root,
    checkpoint: { directory, threadId: 'dddddddd-dddd-dddd-dddd-dddddddddddd' },
    fetch: async (url, init) => {
      if (String(url).endsWith('/hisAnnouncement/query')) {
        const form = new URLSearchParams(String(init?.body));
        if (form.get('category')) return new Response('', { status: 503 });
        siblingStarted();
        await hold; // Deliberately ignores AbortSignal: an adversarial tool fixture.
        return json({ announcements: [], totalAnnouncement: 0, hasMore: false });
      }
      return source.fetch(url, init);
    },
    onUpdate: (entry) => {
      if (entry.tool === 'cninfo_annual' && entry.status === 'failed') failureRecorded();
    },
  });
  void running.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  try {
    await started;
    await failed;
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(
      settled,
      false,
      'the service promise cannot release the route active lock while a sibling is alive'
    );
    releaseSibling();
    await assert.rejects(running, /官方披露来源暂不可达/);
    assert.equal(settled, true);
  } finally {
    releaseSibling();
    await running.catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});

test('audit-opinion location stays separate from amounts, model evidence and request budgets', async () => {
  const auditMarker = '独立审计段落仅用于原文定位';
  const source = fixture({
    annual: textPdf([
      '测试股份有限公司\n股票代码：300750\n2025年年度报告\n本报告金额以人民币千元列示',
      '合并财务报表项目注释\n现金流量表补充资料\n单位：千元\n补充资料 本期金额 上期金额\n1.将净利润调节为经营活动现金流量\n净利润 100 80\n加：折旧 10 10',
      '存货的减少 -20 -10\n经营性应收项目的减少 -30 -20\n经营性应付项目的增加 10 10\n经营活动产生的现金流量净额 70 70',
      '财务报表附注\n应收账款账龄\n信用期变化与期后回款仍需核查',
      `一、审计意见\n我们审计了测试股份有限公司的财务报表，包括2025年12月31日的合并及母公司资产负债表及2025年度的现金流量表。\n我们认为，${auditMarker}。\n二、形成审计意见的基础`,
    ]),
  });
  const bodies: string[] = [];
  const tools: string[] = [];
  const output = await runCompanyResearch(
    { ...input, useModel: true },
    {
      root,
      fetch: source.fetch,
      onUpdate: (entry) => {
        if (entry.status === 'completed') tools.push(entry.tool);
      },
      model: {
        apiKey: 'synthetic-not-real',
        fetch: async (_url, init) => {
          bodies.push(String(init?.body));
          throw new Error('fixture model unavailable');
        },
      },
    }
  );
  assert.equal(output.agent?.auditOpinion?.status, 'located');
  assert.equal(output.agent?.auditOpinion?.evidence[0]!.page, 5);
  assert.match(output.agent!.auditOpinion!.evidence[0]!.quote, new RegExp(auditMarker));
  assert.ok(tools.includes('read_annual_audit_opinion'));
  assert.ok(bodies.length > 0);
  assert.ok(bodies.every((body) => !body.includes(auditMarker)));
  assert.ok(output.agent!.evidence.every((row) => !row.quote.includes(auditMarker)));
  assert.equal(output.agent!.budget.sourceRequests, source.calls.length);
  assert.equal(output.agent!.budget.modelRequests, bodies.length);
  assert.equal(output.preview!.material.observations.length, 12);
  assert.ok(!JSON.stringify(output.preview).includes(auditMarker));
  const oldProgress = initialCompanyGraphProgress();
  delete oldProgress.auditOpinion;
  assert.equal(initialCompanyGraphProgress(oldProgress).auditOpinion, undefined);
  assert.equal(initialCompanyGraphProgress().auditOpinion?.status, 'pending');
});
