/** Public-only context comparison. Live calls require an explicit flag and existing credentials. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CompanyResearchRun } from '../shared/contracts.js';
import {
  buildAssessmentPublicPayload,
  analyzeCompanyWithModel,
} from '../server/company-assessment.js';
import { modelConfigFromEnv, type ModelConfig } from '../server/model.js';
import { researchDemoIdentity, researchDemoSnapshot } from './serve-research-demo.js';

export const researchDepthBaseline = '6e19eb8452abc75b692ba5dc746c0e009747d032';
export const depthProbeStatements = [
  '主要客户期后回款延期，经营现金不足不能只归因于扩张备货。',
  '另一公开说明称主要客户回款已经完成，两个说法仍需核对期间和范围。',
] as const;

export function researchDepthFixture(): CompanyResearchRun {
  const time = '2026-10-03T00:00:00.000Z';
  const context = researchDemoSnapshot(time);
  context.news = depthProbeStatements.map((statement, index) => {
    const text =
      '合成背景段，不包含关于企业的真实事实。\n'.repeat(360) +
      `期间为合成样本所选年度，金额单位人民币，范围为合并报表。\n${statement}\n` +
      '以上是合成资料中的陈述，尚未核对，不代表已经认定的企业事实。';
    return {
      id: `depth-fixture-news-${index}`,
      title: `合成样本：经营现金与回款核查 ${index + 1}`,
      date: '2026-10-03',
      media: `合成媒体 ${index + 1}`,
      provider: '合成语料，未请求外部媒体',
      url: `https://finance.sina.com.cn/stock/synthetic/doc-depth${index}.shtml`,
      digest: '合成对照输入，正文后部包含不同解释，不能作为真实企业资料。',
      contentScope: 'media-excerpt',
      excerpt: {
        text,
        url: `https://finance.sina.com.cn/stock/synthetic/doc-depth${index}.shtml`,
        readAt: time,
        sha256: createHash('sha256').update(text).digest('hex'),
      },
    };
  });
  return {
    id: 'synthetic-depth-comparison',
    input: {
      securityCode: '601234',
      orgId: researchDemoIdentity.orgId,
      year: 2025,
      useModel: true,
    },
    identity: structuredClone(researchDemoIdentity),
    context,
    status: 'ready',
    createdAt: time,
    updatedAt: time,
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-called' },
  };
}

export function summarizePublicDepth(payload: unknown, probes: readonly string[] = []) {
  const serialized = JSON.stringify(payload);
  const record = payload as Record<string, unknown>;
  const coverage = record.publicInformationCoverage as Record<string, unknown> | undefined;
  const compression = record.publicContextCompression as Record<string, unknown> | undefined;
  const numeric = (input: Record<string, unknown> | undefined, keys: string[]) =>
    Object.fromEntries(
      keys.flatMap((key) => (typeof input?.[key] === 'number' ? [[key, input[key]]] : []))
    );
  return {
    serializedBytes: Buffer.byteLength(serialized),
    serializedCharacters: serialized.length,
    probes: probes.map((text) => ({ text, retained: serialized.includes(text) })),
    coverage: numeric(coverage, [
      'newsRecords',
      'discussionRecords',
      'mediaExcerptRecords',
      'textChars',
      'availableTextChars',
      'includedSourceChars',
      'omittedTextChars',
      'selectedCounterCueRecords',
      'textCharLimit',
    ]),
    compression: numeric(compression, ['evidenceQuoteReferences']),
  };
}

/** Only the actual transport calls count against this isolated comparison's fixed budget. */
export function boundedComparisonFetch(transport: typeof fetch, maximum = 2) {
  let calls = 0;
  const guarded: typeof fetch = async (input, init) => {
    if (calls >= maximum) throw Error('DEPTH_COMPARISON_CALL_LIMIT');
    calls++;
    return transport(input, init);
  };
  return { fetch: guarded, count: () => calls };
}

type Analysis = typeof analyzeCompanyWithModel;
export async function compareLiveAnalysis(
  run: CompanyResearchRun,
  config: ModelConfig,
  analyze: Analysis,
  signal?: AbortSignal
) {
  if (!config.apiKey)
    return { status: 'not-configured' as const, httpCalls: 0, elapsedMs: 0, narrative: null };
  const transport = boundedComparisonFetch(config.fetch || fetch);
  const started = performance.now();
  const result = await analyze(structuredClone(run), { ...config, fetch: transport.fetch }, signal);
  return {
    status: result.model.status,
    requestedModel: result.model.name || config.model || null,
    httpCalls: transport.count(),
    elapsedMs: Math.round(performance.now() - started),
    grade: result.grade,
    score: result.score,
    validatedNarrative: Boolean(result.narrative),
    warnings: result.model.warning ? [result.model.warning] : [],
    narrative: result.narrative || null,
  };
}

export function comparisonArguments(args: string[]) {
  const result: { baseline?: string; input?: string; output?: string; live: boolean } = {
    live: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--live') result.live = true;
    else if (arg === '--baseline' || arg === '--input' || arg === '--output') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw Error('DEPTH_COMPARISON_ARGUMENT');
      result[arg.slice(2) as 'baseline' | 'input' | 'output'] = value;
    } else throw Error('DEPTH_COMPARISON_ARGUMENT');
  }
  if (!result.baseline) throw Error('DEPTH_COMPARISON_BASELINE_REQUIRED');
  return result;
}

async function main() {
  const args = comparisonArguments(process.argv.slice(2));
  const baseline = path.resolve(args.baseline!);
  const commit = execFileSync('git', ['-C', baseline, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (commit !== researchDepthBaseline) throw Error('DEPTH_COMPARISON_BASELINE_MISMATCH');
  execFileSync('git', ['-C', baseline, 'diff', '--quiet', 'HEAD', '--', 'server', 'shared'], {
    stdio: 'ignore',
  });
  const previous = (await import(
    pathToFileURL(path.join(baseline, 'server/company-assessment.ts')).href
  )) as {
    buildAssessmentPublicPayload: typeof buildAssessmentPublicPayload;
    analyzeCompanyWithModel: Analysis;
  };
  const run = args.input
    ? (JSON.parse(await readFile(args.input, 'utf8')) as CompanyResearchRun)
    : researchDepthFixture();
  if (
    !/^\d{6}$/.test(run.input?.securityCode || '') ||
    !Number.isInteger(run.input?.year) ||
    run.context?.securityCode !== run.input.securityCode ||
    run.context?.orgId !== run.input.orgId
  )
    throw Error('DEPTH_COMPARISON_PUBLIC_SCOPE');
  const probes = args.input ? [] : depthProbeStatements;
  const before = previous.buildAssessmentPublicPayload(run);
  const after = buildAssessmentPublicPayload(run);
  const output: Record<string, unknown> = {
    kind: args.input ? 'supplied-public-snapshot' : 'explicit-synthetic-context-comparison',
    executedAt: new Date().toISOString(),
    baselineCommit: commit,
    modelConfigured: args.live && Boolean(modelConfigFromEnv().apiKey),
    liveRequested: args.live,
    before: summarizePublicDepth(before, probes),
    after: summarizePublicDepth(after, probes),
    boundaries: [
      'Context retention does not establish the truth of a source or prove narrative quality.',
      'No private workspace or account data is loaded; full model prompts and credentials are not saved.',
      'Model results use the existing numeric and citation validator; semantic review remains necessary.',
      ...(args.input
        ? []
        : ['All companies, amounts and news here are synthetic, not live research.']),
    ],
  };
  if (args.live) {
    const config = modelConfigFromEnv();
    output.liveBefore = await compareLiveAnalysis(
      run,
      config,
      previous.analyzeCompanyWithModel,
      AbortSignal.timeout(180_000)
    );
    output.liveAfter = await compareLiveAnalysis(
      run,
      config,
      analyzeCompanyWithModel,
      AbortSignal.timeout(180_000)
    );
  }
  const text = JSON.stringify(output, null, 2) + '\n';
  if (args.output) await writeFile(args.output, text, { mode: 0o600, flag: 'wx' });
  process.stdout.write(text);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Avoid echoing external errors, filenames, response text or credentials.
    process.stderr.write(
      'Research-depth comparison failed; check arguments, scope and baseline.\n'
    );
    process.exitCode = 1;
  });
}
