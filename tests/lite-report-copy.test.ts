import assert from 'node:assert/strict';
import test from 'node:test';
import { liteSummaryRepeatsHeadline } from '../src/showcase/lite-report-copy.js';

test('Lite shows repeated headline/core copy once while retaining the complete core paragraph', () => {
  assert.equal(
    liteSummaryRepeatsHeadline(
      '经营现金低于利润，营运占用也在上升。',
      '经营现金低于利润，营运占用也在上升'
    ),
    true
  );
  assert.equal(
    liteSummaryRepeatsHeadline('经营现金低于利润。', '经营现金低于利润。后续回款资料尚未取得。'),
    true
  );
  assert.equal(
    liteSummaryRepeatsHeadline(
      'Cash trails profit.',
      'Cash trails profit. Check subsequent collections.'
    ),
    true
  );
  assert.equal(liteSummaryRepeatsHeadline(' 经营现金，低于利润。 ', '经营现金低于利润。'), true);
  assert.equal(liteSummaryRepeatsHeadline('利润为 4.6 元。', '利润为 46 元。'), false);
  assert.equal(liteSummaryRepeatsHeadline('利润为 -4.6 元。', '利润为 4.6 元。'), false);
  assert.equal(liteSummaryRepeatsHeadline('利润为 0 元。', '利润为 10 元。'), false);
  assert.equal(liteSummaryRepeatsHeadline('需继续核对', null), false);
  assert.equal(liteSummaryRepeatsHeadline('', '完整核心段落'), false);
});
