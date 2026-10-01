import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  boundedBody,
  downloadCompanyPdf,
  listCompanyAnnouncements,
  officialPdfUrl,
  searchCompanies,
} from '../server/company-sources.js';
import type { CompanyIdentity } from '../shared/contracts.js';

const identity: CompanyIdentity = {
  securityCode: '300750',
  orgId: 'GD165627',
  shortName: '宁德时代',
  companyName: null,
  exchange: 'szse',
  sourceUrl: 'https://www.cninfo.com.cn/new/snapshot/companyDetailCn?code=300750',
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const fakeFetch =
  (
    fn: (url: string, init: RequestInit | undefined) => Promise<Response> | Response
  ): typeof fetch =>
  async (url, init) =>
    fn(String(url), init);

test('official identity search filters unsupported markets, preserves distinct A-share candidates and normal empty results', async () => {
  const calls: URLSearchParams[] = [];
  const dependencies = {
    fetch: fakeFetch((url, init) => {
      assert.equal(new URL(url).hostname, 'www.cninfo.com.cn');
      assert.equal(init?.redirect, 'error');
      calls.push(new URLSearchParams(String(init?.body)));
      return json([
        { code: '300750', orgId: 'GD165627', zwjc: '宁德时代', category: 'A股', delisted: 'false' },
        { code: '03750', orgId: 'GD165627', zwjc: '宁德时代', category: '港股', delisted: 'false' },
        {
          code: '600519',
          orgId: 'gssh0600519',
          zwjc: '贵州茅台',
          category: 'A股',
          delisted: 'false',
        },
        { code: '600001', orgId: 'old', zwjc: '退市主体', category: 'A股', delisted: 'true' },
      ]);
    }),
  };
  const found = await searchCompanies(' 宁德 ', dependencies);
  assert.deepEqual(
    found.candidates.map((row) => [row.securityCode, row.exchange]),
    [
      ['300750', 'szse'],
      ['600519', 'sse'],
    ]
  );
  assert.equal(calls[0]!.get('keyWord'), '宁德');
  assert.equal(calls[0]!.get('maxNum'), '20');
  assert.equal(calls[0]!.has('maxSecNum'), false);
  assert.deepEqual(
    (await searchCompanies('未上市公司', { fetch: fakeFetch(() => json([])) })).candidates,
    []
  );
  await assert.rejects(() => searchCompanies('\0bad', dependencies), /请输入/);
});

test('annual announcements require the selected org, specified year and Chinese full report, with Shanghai date boundaries', async () => {
  const rows = (id: string, title: string, time: string, extra: Record<string, unknown> = {}) => ({
    announcementId: id,
    announcementTitle: title,
    announcementTime: Date.parse(time),
    adjunctUrl: `finalpage/2026-01-01/${id}.PDF`,
    secCode: '300750',
    orgId: 'GD165627',
    ...extra,
  });
  const found = await listCompanyAnnouncements(identity, 2025, 'annual', {
    now: () => new Date('2026-01-01T17:00:00Z'),
    fetch: fakeFetch((_url, init) => {
      const form = new URLSearchParams(String(init?.body));
      assert.equal(form.get('seDate'), '2026-01-01~2026-01-02');
      assert.equal(form.has('secDate'), false);
      return json({
        hasMore: false,
        announcements: [
          rows('12', '2025年年度报告（英文版）', '2025-12-31T16:00:00Z'),
          rows('13', '2025年年度报告摘要', '2025-12-31T16:00:00Z'),
          rows('14', '2024年年度报告', '2025-12-31T16:00:00Z'),
          rows('15', '2025年年度报告', '2025-12-31T16:00:00Z'),
          rows('16', '2025年年度报告', '2025-12-31T16:00:00Z', { orgId: 'OTHER' }),
        ],
      });
    }),
  });
  assert.deepEqual(
    found.announcements.map((row) => row.id),
    ['15']
  );
  assert.equal(found.announcements[0]!.publishedAt, '2025-12-31T16:00:00.000Z');
  assert.deepEqual(
    await listCompanyAnnouncements(identity, 2025, 'annual', {
      fetch: fakeFetch(() => json({ totalAnnouncement: 0, announcements: null, hasMore: false })),
    }),
    { announcements: [], truncated: false }
  );
  await assert.rejects(
    () =>
      listCompanyAnnouncements(identity, 2025, 'annual', {
        fetch: fakeFetch(() => json({ announcements: null })),
      }),
    /响应格式改变/
  );
});

test('source restrictions stop immediately, transient failures retry once, and source URLs cannot become arbitrary fetches', async () => {
  for (const status of [403, 429]) {
    let calls = 0;
    await assert.rejects(
      () =>
        searchCompanies('300750', {
          fetch: fakeFetch(() => {
            calls++;
            return new Response('', { status });
          }),
        }),
      /限制访问/
    );
    assert.equal(calls, 1);
  }
  let calls = 0,
    retries = 0;
  const found = await searchCompanies('300750', {
    fetch: fakeFetch(() => {
      calls++;
      return calls === 1 ? new Response('', { status: 503 }) : json([]);
    }),
    onRetry: () => {
      retries++;
    },
  });
  assert.equal(calls, 2);
  assert.equal(retries, 1);
  assert.deepEqual(found.candidates, []);
  for (const url of [
    'http://static.cninfo.com.cn/finalpage/2026-01-01/15.PDF',
    'https://127.0.0.1/a.pdf',
    'https://static.cninfo.com.cn@evil.test/finalpage/2026-01-01/15.PDF',
    'https://static.cninfo.com.cn/finalpage/2026-01-01/15.PDF?token=x',
    'https://static.cninfo.com.cn/other/15.PDF',
  ])
    assert.throws(() => officialPdfUrl(url));
  let downloads = 0;
  await assert.rejects(() =>
    downloadCompanyPdf('https://evil.test/a.pdf', {
      fetch: fakeFetch(() => {
        downloads++;
        return new Response('unused');
      }),
    })
  );
  assert.equal(downloads, 0);
  const bytes = Buffer.from('%PDF-1.7\npublic fixture');
  const downloaded = await downloadCompanyPdf(
    'https://static.cninfo.com.cn/finalpage/2026-01-01/15.PDF',
    {
      fetch: fakeFetch((_url, init) => {
        assert.equal(init?.redirect, 'error');
        return new Response(bytes);
      }),
    }
  );
  assert.equal(downloaded.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(downloaded.buffer, bytes);
});

test('streamed body size is bounded even without Content-Length', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(20));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(() => boundedBody(new Response(body), 32), /超过当前大小限制/);
  assert.equal(cancelled, true);
});
