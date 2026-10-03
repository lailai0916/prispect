/** Local, synthetic research walkthrough. This is never a production provider. */
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CompanyIdentity, CompanySearchResponse } from '../shared/contracts.js';
import {
  contextAmountFields,
  type CompanyContextPeriod,
  type CompanyContextSnapshot,
  type ContextAmountField,
} from '../shared/company-workspace.js';
import { deriveCompanyAssessment } from '../shared/company-assessment.js';
import { createApp } from '../server/app.js';
import { deriveChallengeResult } from '../server/company-challenge.js';
import { answerCompanyQuestion } from '../server/company-questions.js';

export const researchDemoIdentity: CompanyIdentity = {
  securityCode: '601234',
  orgId: 'syntheticuiorg',
  shortName: '合成研究样本（非真实企业）',
  companyName: '合成研究样本（非真实企业）',
  exchange: 'sse',
  sourceUrl: 'https://www.cninfo.com.cn/',
};

export function researchDemoSnapshot(now = new Date().toISOString()): CompanyContextSnapshot {
  const period = (
    year: number,
    values: Partial<Record<ContextAmountField, string>>
  ): CompanyContextPeriod => ({
    period: `${year}-12-31`,
    annual: true,
    noticeDate: '2026-03-01',
    amounts: {
      ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
      ...values,
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: Object.fromEntries(
      Object.keys(values).map((field) => [field, `fixture-financial-${year}`])
    ),
    sourceUrls: ['https://datacenter.eastmoney.com/'],
    originalUrl: null,
  });
  const financials = [
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
  ];
  // A hash of these fixture bytes, never a claimed public HTTP response hash.
  const fixtureHash = createHash('sha256').update(JSON.stringify(financials)).digest('hex');
  return {
    version: 1,
    securityCode: researchDemoIdentity.securityCode,
    orgId: researchDemoIdentity.orgId,
    companyName: researchDemoIdentity.companyName!,
    fetchedAt: now,
    status: 'partial',
    financials,
    sources: financials.map((row) => ({
      id: `fixture-financial-${row.period.slice(0, 4)}`,
      provider: '合成第三方字段（离线演练）',
      dimension: 'financial',
      url: 'https://datacenter.eastmoney.com/',
      status: 'available',
      fetchedAt: now,
      latestDate: row.period,
      count: 1,
      note: '合成输入；链接只标明字段格式参照，没有下载公开响应。哈希是演练输入摘要。',
      responseHashes: [fixtureHash],
    })),
    comparisons: [],
    profile: { 公司介绍: '合成工程样本，金额均非真实发行人数据。' },
    shareholders: [],
    announcements: [],
    news: [],
    discussions: [],
    verificationLinks: [],
    warnings: ['离线演练：全部公司字段为合成资料，未检索新闻、公告或公众帖子，未调用 AI。'],
  };
}

export const researchDemoSearch = async (query: string): Promise<CompanySearchResponse> => ({
  query,
  candidates:
    query.trim() &&
    (researchDemoIdentity.shortName.includes(query.trim()) || query.trim() === '601234')
      ? [structuredClone(researchDemoIdentity)]
      : [],
  limitedToListed: true,
  source: 'cninfo',
  truncated: false,
});

/** Explicit, local failure injection. These controls are never an HTTP or production API. */
export interface ResearchDemoFaults {
  context?: boolean;
  assessment?: boolean;
  challenge?: boolean;
}

export async function openResearchDemo(dataDir: string, faults: ResearchDemoFaults = {}) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  return createApp({
    root,
    dataDir,
    model: {},
    registrationEnabled: true,
    companyDirectory: null,
    companyService: {
      searchCompanies: researchDemoSearch,
      runCompanyResearch: async () => ({
        identity: structuredClone(researchDemoIdentity),
        announcements: [],
        stoppedReason: '离线合成演练不读取真实年报；原件请自行导入并确认。',
        model: { requested: true, status: 'not-configured' },
      }),
    },
    companyContextService: {
      searchCompanies: researchDemoSearch,
      context: async (_identity, options) => {
        if (faults.context) throw new Error('离线演练：模拟公开资料读取失败。');
        const snapshot = researchDemoSnapshot();
        await options?.onSnapshot?.(structuredClone(snapshot));
        return snapshot;
      },
      industry: async () => {
        throw new Error('离线演练没有真实同行资料，不发网络请求。');
      },
      question: answerCompanyQuestion,
      research: async (run) => ({
        run: structuredClone(run),
        steps: [],
        modelCalls: 0,
        toolCalls: 0,
      }),
      assessment: async (run) => {
        if (faults.assessment) throw new Error('离线演练：模拟分析服务失败。');
        return deriveCompanyAssessment(run);
      },
    },
    companyChallengeService: {
      challenge: async (run, target) => {
        if (faults.challenge) throw new Error('离线演练：模拟反向核验失败。');
        const result = deriveChallengeResult(run, target);
        result.model = { status: 'not-configured', calls: 0 };
        result.gaps.unshift([
          '离线演练只复核保存的合成金额；未进行定向搜索。',
          'Offline walkthrough checks saved synthetic amounts only; no targeted search was performed.',
        ]);
        return result;
      },
    },
    assistantService: {
      research: async (run) => ({
        run,
        research: { status: 'unavailable', toolCalls: 0, sources: [] },
        warning: '离线演练不检索新资料；已保存资料仍可问答。',
      }),
    },
  });
}

/** A final guard for overlooked source paths and imports, including source-URL uploads. */
export function loopbackDemoFetch(nativeFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username ||
      url.password
    )
      throw new Error('离线演练拒绝对外请求；不会下载原件、新闻或模型回答。');
    return nativeFetch(input, { ...init, redirect: 'error' });
  };
}

async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('演练服务拒绝在 production 模式运行。');
  const port = Number(process.env.PRISPECT_DEMO_PORT || 4336);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('PRISPECT_DEMO_PORT 必须是 1024–65535 的整数。');
  const configured = process.env.PRISPECT_DEMO_DATA_DIR;
  const dataDir = configured
    ? path.resolve(configured)
    : await mkdtemp(path.join(os.tmpdir(), 'prispect-research-demo-'));
  if (configured) {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    if ((await readdir(dataDir)).length)
      throw new Error('演练目录必须为空，拒绝载入已有账号或资料。');
  }
  process.env.APP_ORIGIN = `http://127.0.0.1:${port}`;
  // Never inherit working-account credentials or enable outgoing mail in a fixture service.
  delete process.env.BETTER_AUTH_SECRET;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  delete process.env.MAIL_FROM;
  process.env.TRUST_PROXY = 'false';
  globalThis.fetch = loopbackDemoFetch(globalThis.fetch);
  const service = await openResearchDemo(dataDir);
  if (service.auth.mail.configured) {
    service.auth.close();
    throw new Error('演练服务邮件通道应保持关闭，拒绝启动。');
  }
  const server = service.app.listen(port, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  process.stdout.write(
    `离线合成研究演练（非生产/非实时查询/无模型调用）\nhttp://127.0.0.1:${port}/query\n临时演练资料：${dataDir}\n搜索“601234”；使用本机演练账号，不输入真实账号密码。退出保留资料，原件可手动导入。\n`
  );
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    server.close();
    await service.waitForIdle();
    service.auth.close();
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : '演练服务启动失败。'}\n`);
    process.exitCode = 1;
  });
}
