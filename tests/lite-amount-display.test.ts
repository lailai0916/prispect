import assert from 'node:assert/strict';
import test from 'node:test';
import { liteAmountDisplay, liteAmountScale } from '../src/showcase/lite-amount-display.js';

test('compact financial values stay approximate and preserve the complete exact fen amount', () => {
  const original = '366373098.93';
  assert.deepEqual(liteAmountDisplay(original, 'zh-Hans'), {
    text: '约3.66亿元',
    exactText: '366,373,098.93 元',
    exactYuan: original,
    approximate: true,
    scale: 'yi',
    unit: '亿元',
  });
  assert.equal(liteAmountDisplay(original, 'en')!.text, 'approx CNY 366.37M');
  assert.equal(liteAmountDisplay(original, 'en', { compact: false })!.text, 'CNY 366,373,098.93');
});

test('related chart amounts share one explicitly selected scale, with integer rounding on both signs', () => {
  const values = ['366373098.93', '26197123.70'];
  const scale = liteAmountScale(values, 'zh-Hans');
  assert.equal(scale, 'yi');
  assert.deepEqual(
    values.map((value) => liteAmountDisplay(value, 'zh-Hans', { scale })!.text),
    ['约3.66亿元', '约0.26亿元']
  );
  assert.equal(liteAmountDisplay('100500000', 'zh-Hans', { scale: 'yi' })!.text, '约1.01亿元');
  assert.equal(liteAmountDisplay('-100500000', 'zh-Hans', { scale: 'yi' })!.text, '约-1.01亿元');
});

test('zero, negative values and amounts beyond safe floating-point precision retain exact pennies', () => {
  assert.equal(liteAmountDisplay('0.00', 'zh-Hans')!.text, '约0.00元');
  const amount = '-9007199254740993.01';
  const zh = liteAmountDisplay(amount, 'zh-Hans')!;
  const en = liteAmountDisplay(amount, 'en')!;
  assert.equal(zh.text, '约-9007.20万亿元');
  assert.equal(en.text, 'approx CNY -9007.20T');
  assert.equal(zh.exactText, '-9,007,199,254,740,993.01 元');
  assert.equal(en.exactYuan, amount);
  assert.equal(liteAmountDisplay('0.01', 'en')!.exactText, 'CNY 0.01');
});

test('missing or malformed amounts remain unavailable rather than becoming zero', () => {
  for (const value of [
    null,
    undefined,
    '',
    '1e8',
    '1,000.00',
    '12.345',
    '+1',
    'NaN',
    '100000000000000000000',
  ])
    assert.equal(liteAmountDisplay(value, 'zh-Hans'), null);
  assert.equal(liteAmountScale([null, 'invalid', '-100000000.01'], 'zh-Hans'), 'yi');
});
