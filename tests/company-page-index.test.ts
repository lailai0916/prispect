import test from 'node:test';
import assert from 'node:assert/strict';
import { currentCompanyPageAnchor } from '../src/company-page-index-state.js';

test('company index follows the current chapter in either scroll direction', () => {
  const positions = [
    { id: 'summary', top: -400, visible: true },
    { id: 'process', top: 60, visible: true },
    { id: 'lab', top: 450, visible: true },
  ];
  assert.equal(currentCompanyPageAnchor(positions, 80), 'process');
  assert.equal(
    currentCompanyPageAnchor(
      positions.map((position) => ({ ...position, top: position.top + 500 })),
      80
    ),
    'summary'
  );
  assert.equal(
    currentCompanyPageAnchor(
      positions.map((position) => ({ ...position, top: position.top - 400 })),
      80
    ),
    'lab'
  );
});

test('company index uses real chapter positions and skips content in closed disclosures', () => {
  assert.equal(
    currentCompanyPageAnchor(
      [
        { id: 'lab', top: 400, visible: true },
        { id: 'dimensions', top: 0, visible: false },
        { id: 'summary', top: -200, visible: true },
        { id: 'process', top: 40, visible: true },
      ],
      80
    ),
    'process'
  );
  assert.equal(currentCompanyPageAnchor([{ id: 'missing', top: NaN, visible: true }], 80), null);
  assert.equal(currentCompanyPageAnchor([], 80), null);
});

test('company index marks the final visible chapter at the bottom of a long page', () => {
  assert.equal(
    currentCompanyPageAnchor(
      [
        { id: 'summary', top: -600, visible: true },
        { id: 'lab', top: 220, visible: true },
        { id: 'dimensions', top: 330, visible: true },
      ],
      80,
      true
    ),
    'dimensions'
  );
});
