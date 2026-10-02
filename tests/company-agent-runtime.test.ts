import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runCompanyResearch } from '../server/company-agent.js';
import type { CompanyAgentTrace, CompanyRunInput } from '../shared/contracts.js';

// Small real PDF, with a Unicode map so the same pdf-parse pipeline runs in CI.
// These are synthetic financial inputs used to exercise the service, not public-company facts.
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
const syntheticPdf = (conflict = true) =>
  textPdf([
    '测试股份有限公司\n股票代码：300750\n2025年年度报告\n本报告金额以人民币千元列示',
    '合并财务报表项目注释\n现金流量表补充资料\n单位：千元\n补充资料 本期金额 上期金额\n1.将净利润调节为经营活动现金流量\n净利润 100 80\n加：折旧 10 10',
    `存货的减少 -20 -10\n经营性应收项目的减少 -30 -20\n经营性应付项目的增加 10 10\n经营活动产生的现金流量净额 ${conflict ? '72' : '70'} 70`,
  ]);
const root = fileURLToPath(new URL('../', import.meta.url));
const input: CompanyRunInput = { securityCode: '300750', orgId: 'GD165627', year: 2025 };
const json = (value: unknown) => new Response(JSON.stringify(value));
function publicSource(
  buffer: Buffer,
  overrides: { mismatch?: boolean; empty?: boolean; annualFailure?: boolean } = {}
) {
  const calls: string[] = [];
  const mock: typeof fetch = async (url, init) => {
    const address = String(url);
    calls.push(address);
    assert.equal(init?.redirect, 'error');
    if (address.endsWith('/topSearch/query'))
      return json([
        {
          code: '300750',
          orgId: overrides.mismatch ? 'OTHER' : 'GD165627',
          zwjc: '测试公司',
          category: 'A股',
          delisted: 'false',
        },
      ]);
    if (address.endsWith('/hisAnnouncement/query')) {
      const form = new URLSearchParams(String(init?.body));
      if (!form.get('category'))
        return json({ totalAnnouncement: 0, announcements: null, hasMore: false });
      if (overrides.annualFailure) return new Response('rate limited', { status: 429 });
      if (overrides.empty)
        return json({ totalAnnouncement: 0, announcements: null, hasMore: false });
      return json({
        hasMore: false,
        announcements: [
          {
            announcementId: '15',
            announcementTitle: '2025年年度报告',
            announcementTime: Date.parse('2026-03-09T16:00:00Z'),
            adjunctUrl: 'finalpage/2026-03-10/15.PDF',
            secCode: '300750',
            orgId: 'GD165627',
          },
        ],
      });
    }
    assert.equal(address, 'https://static.cninfo.com.cn/finalpage/2026-03-10/15.PDF');
    return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/pdf' } });
  };
  return { calls, fetch: mock };
}
function traceLog() {
  const records: CompanyAgentTrace[] = [];
  return {
    records,
    onUpdate: (trace: CompanyAgentTrace) => {
      records.push(trace);
    },
  };
}
const modelAnswer = (action: string, pageIds: string[], reason = '核对现金补充表及其续页') =>
  json({ choices: [{ message: { content: JSON.stringify({ action, pageIds, reason }) } }] });

test('real PDF parser, deterministic candidate extraction and actual tool lifecycle run without any model transfer by default', async () => {
  const buffer = syntheticPdf(false),
    source = publicSource(buffer),
    trace = traceLog();
  let modelRequests = 0;
  const result = await runCompanyResearch(input, {
    root,
    fetch: source.fetch,
    onUpdate: trace.onUpdate,
    model: {
      apiKey: 'test-key-not-real',
      fetch: async () => {
        modelRequests++;
        throw new Error('must not call');
      },
    },
  });
  assert.equal(modelRequests, 0);
  assert.equal(source.calls.length, 4);
  assert.equal(result.model.status, 'not-requested');
  assert.equal(result.preview?.material.observations.length, 12);
  assert.equal(result.preview?.material.sha256, createHash('sha256').update(buffer).digest('hex'));
  assert.deepEqual(result.buffer, buffer);
  assert.equal(
    result.preview?.checks.find((check) => check.id === 'source-row-reconciliation-2025')?.status,
    'pass'
  );
  assert.ok(result.preview?.reviewRequired);
  for (const running of trace.records.filter((record) => record.status === 'running')) {
    const completed = trace.records.find(
      (record) => record.id === running.id && record.status === 'completed'
    );
    assert.ok(completed, `real tool ${running.tool} has a final record`);
    assert.ok(Date.parse(completed.finishedAt!) >= Date.parse(running.startedAt));
  }
  assert.equal(trace.records.at(-1)?.status, 'skipped');
});

test('identity mismatch, normal missing annual data and source refusal stop with distinct results and never download substitutes', async () => {
  const buffer = syntheticPdf(),
    mismatch = publicSource(buffer, { mismatch: true });
  await assert.rejects(
    () => runCompanyResearch(input, { root, fetch: mismatch.fetch }),
    /代码与机构ID/
  );
  assert.equal(mismatch.calls.length, 1);
  const empty = publicSource(buffer, { empty: true });
  let emptyModelCalls = 0;
  const stopped = await runCompanyResearch(
    { ...input, useModel: true },
    {
      root,
      fetch: empty.fetch,
      model: {
        apiKey: 'test-key-not-real',
        fetch: async () => {
          emptyModelCalls++;
          throw new Error('must not call');
        },
      },
    }
  );
  assert.equal(stopped.model.status, 'not-called');
  assert.equal(emptyModelCalls, 0);
  assert.match(stopped.stoppedReason!, /没有匹配2025/);
  assert.equal(stopped.buffer, undefined);
  assert.equal(empty.calls.length, 3);
  const denied = publicSource(buffer, { annualFailure: true }),
    trace = traceLog();
  await assert.rejects(
    () => runCompanyResearch(input, { root, fetch: denied.fetch, onUpdate: trace.onUpdate }),
    /来源限制访问/
  );
  assert.equal(
    denied.calls.length,
    3,
    'annual and recent requests start in parallel; refusal is never retried'
  );
  assert.ok(
    trace.records.some((record) => record.tool === 'cninfo_annual' && record.status === 'failed')
  );
  assert.equal(denied.calls.filter((address) => address.includes('static.cninfo')).length, 0);
});

test('page planner rejects invented pages, retries within budget and executes a real constrained second check without erasing source conflicts', async () => {
  const source = publicSource(syntheticPdf()),
    trace = traceLog(),
    payloads: unknown[] = [];
  const responses = [
    modelAnswer('cash_supplement', ['p999']),
    modelAnswer('cash_supplement', ['p2', 'p3']),
  ];
  const result = await runCompanyResearch(
    { ...input, useModel: true },
    {
      root,
      fetch: source.fetch,
      onUpdate: trace.onUpdate,
      model: {
        apiKey: 'test-key-not-real',
        baseUrl: 'https://model.test/v1',
        model: 'test-model',
        fetch: async (url, init) => {
          assert.equal(String(url), 'https://model.test/v1/chat/completions');
          payloads.push(JSON.parse(String(init?.body)));
          return responses.shift()!;
        },
      },
    }
  );
  assert.equal(
    payloads.length,
    2,
    'conflict skips summary instead of recording a fictitious third model call'
  );
  assert.equal(result.model.status, 'completed');
  assert.equal(
    result.preview?.checks.find((check) => check.id === 'agent-selected-pages')?.status,
    'pass'
  );
  assert.equal(
    result.preview?.checks.find((check) => check.id === 'bridge-balance')?.status,
    'fail'
  );
  assert.match(
    result.preview?.checks.find((check) => check.id === 'source-row-reconciliation-2025')
      ?.message || '',
    /2000\.00元（200000分）/
  );
  assert.equal(
    result.preview?.material.observations.find(
      (row) => row.key === 'otherAdjustments' && row.year === 2025
    )?.value,
    '10000.00'
  );
  assert.equal(
    trace.records.filter(
      (record) => record.tool === 'model_page_plan' && record.status === 'failed'
    ).length,
    1
  );
  assert.equal(
    trace.records.find((record) => record.tool === 'model_public_summary')?.status,
    'skipped'
  );
  const recheck = trace.records.find(
    (record) => record.tool === 'revalidate_selected_pages' && record.status === 'completed'
  );
  assert.match(recheck?.outputSummary || '', /6项本年度候选/);
  const sent = JSON.stringify(payloads);
  assert.ok(sent.includes('publicPages'));
  assert.equal(/contextNotes|cashPlan|snapshot|managementExplanation|password/.test(sent), false);
});

test('explicit missing-input plan stops with a completed real planning tool and no amount-generating explanation', async () => {
  const source = publicSource(syntheticPdf()),
    trace = traceLog();
  let requests = 0;
  const result = await runCompanyResearch(
    { ...input, useModel: true },
    {
      root,
      fetch: source.fetch,
      onUpdate: trace.onUpdate,
      model: {
        apiKey: 'test-key-not-real',
        fetch: async () => {
          requests++;
          return modelAnswer('request_missing_input', [], '原件信息不足，请补充表格');
        },
      },
    }
  );
  assert.equal(requests, 1);
  assert.equal(result.model.status, 'completed');
  assert.match(result.stoppedReason!, /本次规划已停止/);
  assert.equal(
    trace.records.find((record) => record.tool === 'model_public_summary')?.status,
    'skipped'
  );
  assert.equal(result.preview?.material.observations.length, 12);
});

test('planner response-size failures and real aborted timeout keep the deterministic candidate and stop within the model budget', async () => {
  for (const failure of ['size', 'timeout']) {
    const source = publicSource(syntheticPdf()),
      trace = traceLog();
    let requests = 0;
    const result = await runCompanyResearch(
      { ...input, useModel: true },
      {
        root,
        fetch: source.fetch,
        onUpdate: trace.onUpdate,
        model: {
          apiKey: 'test-key-not-real',
          timeoutMs: 10,
          fetch: async (_url, init) => {
            requests++;
            if (failure === 'size') return new Response('x'.repeat(256 * 1024 + 1));
            return new Promise((_resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error('test guard: request did not abort')),
                500
              );
              init?.signal?.addEventListener(
                'abort',
                () => {
                  clearTimeout(timer);
                  reject(new DOMException('Aborted', 'AbortError'));
                },
                { once: true }
              );
            });
          },
        },
      }
    );
    assert.equal(requests, 2);
    assert.equal(result.model.status, 'failed');
    assert.equal(result.preview?.material.observations.length, 12);
    assert.equal(
      result.preview?.checks.find((check) => check.id === 'bridge-balance')?.status,
      'fail'
    );
    assert.equal(
      trace.records.filter(
        (record) => record.tool === 'model_page_plan' && record.status === 'failed'
      ).length,
      2
    );
    assert.equal(
      trace.records.find((record) => record.tool === 'model_public_summary')?.status,
      'skipped'
    );
  }
});

test('the selected statements strategy actually limits the second check and never replaces the complete original supplement', async () => {
  const source = publicSource(syntheticPdf()),
    trace = traceLog();
  let requests = 0;
  const result = await runCompanyResearch(
    { ...input, useModel: true },
    {
      root,
      fetch: source.fetch,
      onUpdate: trace.onUpdate,
      model: {
        apiKey: 'test-key-not-real',
        fetch: async () => {
          requests++;
          return modelAnswer('consolidated_statements', ['p2', 'p3'], '复核合并报表是否可用');
        },
      },
    }
  );
  assert.equal(requests, 1);
  assert.equal(
    result.preview?.checks.find((check) => check.id === 'agent-selected-pages')?.status,
    'warn'
  );
  assert.match(
    trace.records.find(
      (record) => record.tool === 'revalidate_selected_pages' && record.status === 'completed'
    )?.outputSummary || '',
    /合并报表页复核取得0项/
  );
  assert.equal(result.preview?.material.observations.length, 12);
  assert.equal(
    result.preview?.checks.find((check) => check.id === 'bridge-balance')?.status,
    'fail'
  );
});

test('a permitted public summary is an actual model request; HTTP failure has a failed tool trace while candidate amounts remain intact', async () => {
  for (const success of [true, false]) {
    const source = publicSource(syntheticPdf(false)),
      trace = traceLog();
    let requests = 0;
    const result = await runCompanyResearch(
      { ...input, useModel: true },
      {
        root,
        fetch: source.fetch,
        onUpdate: trace.onUpdate,
        model: {
          apiKey: 'test-key-not-real',
          baseUrl: 'https://model.test/v1',
          fetch: async (_url, init) => {
            requests++;
            if (!success) return new Response('unavailable', { status: 503 });
            const request = JSON.parse(String(init?.body));
            const publicInput = JSON.parse(request.messages[1].content);
            assert.ok(publicInput.evidence.length);
            assert.equal(
              publicInput.evidence.every(
                (row: { scope: string; year: number }) =>
                  row.scope === 'consolidated' && [2025, 2024].includes(row.year)
              ),
              true
            );
            return json({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      explanations: [
                        {
                          text: '经营现金与利润需结合营运资金调整观察，仍应核查期后回款。',
                          citations: [publicInput.evidence[0].id],
                        },
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
    assert.equal(requests, 1);
    assert.equal(result.model.status, success ? 'completed' : 'failed');
    assert.equal(result.preview?.material.observations.length, 12);
    assert.equal(
      result.preview?.checks.find((check) => check.id === 'bridge-balance')?.status,
      'pass'
    );
    assert.equal(
      trace.records.find(
        (record) => record.tool === 'model_public_summary' && record.status !== 'running'
      )?.status,
      success ? 'completed' : 'failed'
    );
  }
});
