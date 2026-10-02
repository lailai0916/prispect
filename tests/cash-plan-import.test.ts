import test from 'node:test';
import assert from 'node:assert/strict';
import { CashPlanImportError, parseCashPlanImport } from '../shared/cash-plan-import.js';
import { calculateDatedCash } from '../shared/decision-cash.js';

const defaults = {
  asOf: '2026-10-02',
  cashFloor: '20000',
  proposedAmount: '60000',
  proposedDay: 5,
  alternativeDay: 26,
};
function rejects(source: string, format: 'csv' | 'json', code: string) {
  assert.throws(
    () => parseCashPlanImport(source, format, defaults),
    (error) => error instanceof CashPlanImportError && error.code === code
  );
}
test('CSV explicit calendar dates and exact decimal strings become conditional cash events', () => {
  const parsed = parseCashPlanImport(
    '起点日期,起点现金,自设底线,名称,收付方向,金额（元）,day,日期\n2026-10-02,120000,20000,必须付款,out,100000,10,2026-10-12\n2026-10-02,120000.00,20000.00,客户回款,in,200000,25,2026-10-27',
    'csv',
    defaults
  );
  assert.equal(parsed.input.openingCash, '120000.00');
  assert.deepEqual(
    parsed.input.flows.map((flow) => [flow.direction, flow.day, flow.amount]),
    [
      ['out', 10, '100000.00'],
      ['in', 25, '200000.00'],
    ]
  );
  assert.equal(calculateDatedCash(parsed.input).firstShortfallDay, 10);
  assert.equal(parsed.input.proposedDay, 5);
  const exact = parseCashPlanImport(
    '名称,收付方向,金额,day\n大额,in,99999999999999999999.99,1',
    'csv',
    defaults
  );
  assert.equal(exact.input.flows[0]!.amount, '99999999999999999999.99');
});
test('missing opening and event fields stay null rather than yielding false balances', () => {
  const parsed = parseCashPlanImport('名称,收付方向,金额,day\n待定回款,收款,,', 'csv', defaults);
  assert.equal(parsed.input.openingCash, null);
  assert.equal(parsed.input.flows[0]!.amount, null);
  assert.equal(parsed.input.flows[0]!.day, null);
  assert.equal(calculateDatedCash(parsed.input).status, 'unknown');
  assert.deepEqual(parsed.warnings, ['missing-opening', 'missing-flow-fields']);
  const zero = parseCashPlanImport(
    '名称,方向,金额,day,起点现金\n明确零,流入,0,D1,0',
    'csv',
    defaults
  );
  assert.equal(zero.input.openingCash, '0.00');
  assert.equal(zero.input.flows[0]!.amount, '0.00');
});
test('CSV rejects ambiguous headers, conflicting repeated metadata and malformed quoting', () => {
  rejects('名称,收付方向,金额,amount\nA,in,1,1', 'csv', 'duplicate-header');
  rejects('项目,总金额\nA,1', 'csv', 'unknown-header');
  rejects(
    '起点日期,起点现金,名称,方向\n2026-10-02,100,A,in\n2026-10-03,100,B,out',
    'csv',
    'metadata-conflict'
  );
  rejects('名称,方向,金额\n"unfinished,in,1', 'csv', 'invalid-csv');
  rejects('名称,方向,金额\nA,in,1,2', 'csv', 'invalid-csv');
});
test('invalid dates and date/day disagreement are rejected without guessing the period', () => {
  rejects('名称,方向,日期\nA,in,2026-10-02', 'csv', 'invalid-day');
  rejects('名称,方向,day\nA,in,91', 'csv', 'invalid-day');
  rejects('名称,方向,day,日期\nA,in,10,2026-10-13', 'csv', 'date-day-conflict');
  rejects('名称,方向,日期\nA,in,2026-02-30', 'csv', 'invalid-date');
  assert.throws(
    () => parseCashPlanImport('名称,方向,日期\nA,in,2026-10-12', 'csv', { cashFloor: '0' }),
    (error) => error instanceof CashPlanImportError && error.code === 'invalid-date'
  );
  const leap = parseCashPlanImport('名称,方向,日期\nA,in,2024-03-01', 'csv', {
    asOf: '2024-02-29',
    cashFloor: '0',
  });
  assert.equal(leap.input.flows[0]!.day, 1);
});
test('negative, excess precision, scientific notation and non-CNY units are rejected', () => {
  for (const value of ['-1', '1.001', '1e3', '￥100', '100万元', '123456789012345678901'])
    rejects(`名称,方向,金额\nA,in,${value}`, 'csv', 'invalid-money');
  rejects('名称,方向,金额,币种\nA,in,100,USD', 'csv', 'invalid-currency');
  rejects('名称,方向,金额,币种\nA,in,100,人民币万元', 'csv', 'invalid-currency');
  rejects('名称,方向,金额\nA,收付,100', 'csv', 'invalid-direction');
});
test('typed JSON requires money strings, preserves explicit null and cannot carry private evidence or arbitrary fields', () => {
  const raw = {
    asOf: '2026-10-02',
    openingCash: '120000.01',
    cashFloor: '0',
    proposedAmount: null,
    proposedDay: null,
    alternativeDay: null,
    flows: [
      {
        id: 'r1',
        label: '应收计划',
        direction: 'in',
        day: 25,
        amount: '1000.02',
        flexibility: 'fixed',
      },
    ],
  };
  const parsed = parseCashPlanImport(JSON.stringify(raw), 'json', defaults);
  assert.equal(parsed.input.proposedAmount, null);
  assert.equal(parsed.input.proposedDay, null);
  assert.equal(parsed.input.openingCash, '120000.01');
  assert.equal(raw.openingCash, '120000.01');
  rejects(JSON.stringify({ ...raw, openingCash: 120000.01 }), 'json', 'invalid-money');
  rejects(
    JSON.stringify({ ...raw, evidence: [{ kind: 'source-record' }] }),
    'json',
    'unknown-field'
  );
  rejects(
    JSON.stringify({ ...raw, flows: [{ ...raw.flows[0], sourceUrl: 'https://example.test' }] }),
    'json',
    'unknown-field'
  );
  rejects(
    JSON.stringify({ ...raw, flows: [{ ...raw.flows[0], day: '25' }] }),
    'json',
    'invalid-day'
  );
});
test('bounded inputs reject duplicate IDs, more than 100 events and more than 1MB', () => {
  rejects('id,名称,方向\nr1,A,in\nr1,B,out', 'csv', 'duplicate-id');
  rejects(
    '名称,方向\n' + Array.from({ length: 101 }, (_, i) => `${i},in`).join('\n'),
    'csv',
    'too-many-flows'
  );
  rejects(' '.repeat(1024 * 1024 + 1), 'csv', 'too-large');
  assert.throws(
    () => parseCashPlanImport('名称,方向\nA,in', 'csv', { asOf: '2026-10-02' }),
    (error) => error instanceof CashPlanImportError && error.code === 'missing-floor'
  );
});
