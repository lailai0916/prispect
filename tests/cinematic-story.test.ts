import assert from 'node:assert/strict';
import test from 'node:test';
import { chapterAt, sourcePageOpacity, storyChapters } from '../src/cinematic/story';

test('source chapter navigation stops on a fully readable original', () => {
  const source = storyChapters.find((chapter) => chapter.id === 'source')!;
  assert.equal(sourcePageOpacity(source.hold, 0), 1);
  assert.equal(sourcePageOpacity(source.hold, 1), 0);
});

test('turning and extracting the original never leaves a reading copy over the moving paper', () => {
  for (const progress of [0.285, 0.295, 0.31, 0.325, 0.355, 0.375, 0.4]) {
    assert.equal(sourcePageOpacity(progress, 0), 0, `first page at ${progress}`);
    assert.equal(sourcePageOpacity(progress, 1), 0, `second page at ${progress}`);
  }
});

test('chapter navigation holds stay inside their chapter in both scroll directions', () => {
  for (const [index, chapter] of storyChapters.entries()) {
    assert.equal(chapterAt(chapter.hold), index);
  }
});
