import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundedComparisonFetch,
  comparisonArguments,
  compareLiveAnalysis,
  depthProbeStatements,
  researchDepthFixture,
  summarizePublicDepth,
} from '../scripts/compare-research-depth.js';
import {
  buildAssessmentPublicPayload,
  analyzeCompanyWithModel,
} from '../server/company-assessment.js';

test('depth comparison needs a pinned baseline and explicit live opt-in', () => {
  assert.deepEqual(comparisonArguments(['--baseline', '/tmp/baseline']), {
    baseline: '/tmp/baseline',
    live: false,
  });
  assert.equal(comparisonArguments(['--baseline', '/tmp/baseline', '--live']).live, true);
  for (const args of [[], ['--baseline'], ['--baseline', '--live'], ['--secret', 'value']])
    assert.throws(() => comparisonArguments(args), /DEPTH_COMPARISON_/);
});

test('depth comparison refuses a third actual request even if the model tries to retry', async () => {
  let external = 0;
  const transport = boundedComparisonFetch(async () => {
    external++;
    return new Response('{}');
  });
  await transport.fetch('https://api.example.test/');
  await transport.fetch('https://api.example.test/');
  await assert.rejects(transport.fetch('https://api.example.test/'), /CALL_LIMIT/);
  assert.equal(transport.count(), 2);
  assert.equal(external, 2);
});

test('missing credentials remain unverified and do not invoke either model or transport', async () => {
  let calls = 0;
  const result = await compareLiveAnalysis(
    researchDepthFixture(),
    {
      fetch: async () => {
        calls++;
        throw Error('must not call');
      },
    },
    async () => {
      calls++;
      throw Error('must not analyze');
    }
  );
  assert.equal(result.status, 'not-configured');
  assert.equal(result.httpCalls, 0);
  assert.equal(calls, 0);
});

test('comparison public input excludes account, private replies and material preview fields', () => {
  const run = researchDepthFixture();
  Object.assign(run, {
    account: { email: 'DEPTH_PRIVATE_ACCOUNT' },
    questions: [{ text: 'DEPTH_PRIVATE_REPLY' }],
    preview: { material: { text: 'DEPTH_PRIVATE_UPLOAD' } },
    privatePlan: 'DEPTH_PRIVATE_PLAN',
  });
  Object.assign(run.context!.profile, { privateSecret: 'DEPTH_PRIVATE_PROFILE' });
  const publicInput = JSON.stringify(buildAssessmentPublicPayload(run));
  assert.equal(publicInput.includes('DEPTH_PRIVATE_'), false);
  const summary = summarizePublicDepth(JSON.parse(publicInput), depthProbeStatements);
  assert.equal(summary.serializedBytes, Buffer.byteLength(publicInput));
  assert.equal(summary.probes.length, 2);
});

test('transport failure returns the real rule fallback and actual call count without provider errors', async () => {
  const result = await compareLiveAnalysis(
    researchDepthFixture(),
    {
      apiKey: 'DEPTH_SECRET_KEY',
      fetch: async () => {
        throw Error('DEPTH_PRIVATE_PROVIDER_ERROR');
      },
    },
    analyzeCompanyWithModel
  );
  assert.equal(result.status, 'failed');
  assert.ok(result.httpCalls > 0 && result.httpCalls <= 2);
  assert.equal(result.validatedNarrative, false);
  assert.equal(JSON.stringify(result).includes('DEPTH_SECRET_KEY'), false);
  assert.equal(JSON.stringify(result).includes('DEPTH_PRIVATE_PROVIDER_ERROR'), false);
});
