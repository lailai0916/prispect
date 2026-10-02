import test from 'node:test';
import assert from 'node:assert/strict';
import { date, setDisplayTimeZone } from '../src/format.js';

test('saved account timezone changes timestamp display and reset prevents the next account inheriting it', () => {
  try {
    setDisplayTimeZone('Asia/Shanghai');
    const shanghai = date('2025-12-31T16:30:00Z', 'en');
    assert.match(shanghai, /2026/);
    setDisplayTimeZone('America/Los_Angeles');
    const losAngeles = date('2025-12-31T16:30:00Z', 'en');
    assert.match(losAngeles, /2025/);
    assert.notEqual(shanghai, losAngeles);
    setDisplayTimeZone();
    assert.equal(date('2025-12-31T16:30:00Z', 'en'), shanghai);
    setDisplayTimeZone('Invalid/TimeZone');
    assert.equal(date('2025-12-31T16:30:00Z', 'en'), shanghai);
    assert.equal(date('not-a-timestamp', 'zh-Hans'), '—');
  } finally {
    setDisplayTimeZone();
  }
});
