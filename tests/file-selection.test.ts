import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFileDrag, validateFileSelection } from '../src/file-selection';

const policy = { extensions: ['csv', '.json'], maxBytes: 10 };

test('file picker and drop validation rejects batches, folders and empty files', () => {
  const file = new File(['a'], 'plan.csv');
  assert.equal(validateFileSelection([file, file], policy), 'multiple');
  assert.equal(validateFileSelection([], policy), 'directory');
  assert.equal(validateFileSelection([new File([], 'plan.csv')], policy), 'empty');
});

test('file policy matches final extension and checks the exact byte boundary', () => {
  const uppercase = new File(['1234567890'], '计划.JSON', { type: 'application/octet-stream' });
  assert.equal(validateFileSelection([uppercase], policy), uppercase);
  assert.equal(validateFileSelection([new File(['12345678901'], 'plan.csv')], policy), 'size');
  assert.equal(validateFileSelection([new File(['a'], 'plan.csv.exe')], policy), 'type');
  assert.equal(validateFileSelection([new File(['a'], 'csv')], policy), 'type');
});

test('file drags are recognized without consuming ordinary links or selected text', () => {
  assert.equal(isFileDrag({ types: ['Files'], items: [] } as unknown as DataTransfer), true);
  assert.equal(
    isFileDrag({ types: [], items: [{ kind: 'file' }] } as unknown as DataTransfer),
    true
  );
  assert.equal(
    isFileDrag({
      types: ['text/plain', 'text/uri-list'],
      items: [{ kind: 'string' }],
    } as unknown as DataTransfer),
    false
  );
});
