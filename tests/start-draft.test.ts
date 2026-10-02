import test from 'node:test';
import assert from 'node:assert/strict';
import {
  changeComposerOwner,
  clearComposerDraft,
  readComposerDraft,
  writeComposerDraft,
} from '../src/start-draft.js';

test('unsubmitted composer stays private across authentication and clears on owner change', () => {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  try {
    changeComposerOwner(null, null);
    writeComposerDraft({ owner: null, text: 'Private unsubmitted matter', mode: 'handover' });
    changeComposerOwner(null, 'first-user');
    assert.equal(readComposerDraft('first-user')?.text, 'Private unsubmitted matter');
    assert.equal(readComposerDraft('first-user')?.mode, 'handover');
    assert.equal(readComposerDraft(null), null);

    // An ordinary same-owner refresh retains the unsubmitted input.
    changeComposerOwner('first-user', 'first-user');
    assert.equal(readComposerDraft('first-user')?.text, 'Private unsubmitted matter');

    values.set('cashlens.start-draft', 'Submitted private matter');
    changeComposerOwner('first-user', null);
    writeComposerDraft({ owner: 'first-user', text: 'Late old-owner write', mode: 'auto' });
    assert.equal(readComposerDraft(null), null);
    assert.equal(readComposerDraft('first-user'), null);
    assert.equal(values.has('cashlens.start-draft'), false);

    changeComposerOwner(null, 'second-user');
    assert.equal(readComposerDraft('second-user'), null);
    writeComposerDraft({ owner: 'second-user', text: 'Second private matter', mode: 'external' });
    changeComposerOwner('second-user', 'third-user');
    assert.equal(readComposerDraft('third-user'), null);
    clearComposerDraft();
    assert.equal(values.has('cashlens.composer-draft'), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});
