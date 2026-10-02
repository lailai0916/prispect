import assert from 'node:assert/strict';
import test from 'node:test';
import { interpretStart } from '../shared/start-intent.js';

test('single input routes public questions using only an extracted company', () => {
  assert.equal(interpretStart('我爱我家').companyQuery, '我爱我家');
  assert.equal(interpretStart('我准备和宁德时代合作，先帮我看看它').companyQuery, '宁德时代');
  assert.deepEqual(interpretStart('查询海康威视2024年的财务'), {
    kind: 'company',
    companyQuery: '海康威视',
    proposedAmount: null,
    year: 2024,
  });
  assert.deepEqual(interpretStart('我想了解宁德时代的财务状况'), {
    kind: 'company',
    companyQuery: '宁德时代',
    proposedAmount: null,
  });
  assert.equal(interpretStart('股票代码300893最近现金流怎么样').companyQuery, '300893');
  assert.equal(interpretStart('Please check Hikvision cash flow').companyQuery, 'Hikvision');
});
test('payment descriptions stay private drafts and do not turn into verified records', () => {
  assert.deepEqual(interpretStart('家人准备向杭州样本有限公司支付6万元预付款'), {
    kind: 'external',
    companyQuery: '杭州样本有限公司',
    proposedAmount: '60000.00',
  });
  assert.equal(interpretStart('接手样本公司的财务').kind, 'handover');
  assert.equal(interpretStart('我的储蓄有300893元，应该怎么付？').companyQuery, null);
  assert.equal(interpretStart('请核查朋友承诺每月退款').proposedAmount, null);
  assert.deepEqual(interpretStart('My family will pay CNY 60000 to this company'), {
    kind: 'external',
    companyQuery: null,
    proposedAmount: '60000.00',
  });
  assert.equal(interpretStart('Take over the company and check the cash gap').kind, 'handover');
});
