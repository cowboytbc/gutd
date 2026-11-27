import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentType, localDateKey, localDateTime, MAX_FILE_SIZE, messageTime, previewKind, splitLinks, validateFile } from '../src/utils.js';

test('links preserve surrounding text and only make web addresses clickable', () => {
  assert.deepEqual(splitLinks('See www.example.com/a, then https://example.com!'), [
    { text: 'See ' }, { text: 'www.example.com/a', url: 'https://www.example.com/a' },
    { text: ', then ' }, { text: 'https://example.com', url: 'https://example.com/' }, { text: '!' }
  ]);
  assert.deepEqual(splitLinks('javascript:alert(1)'), [{ text: 'javascript:alert(1)' }]);
});

test('attachments match the chat bucket formats and size limit', () => {
  assert.deepEqual(attachmentType('SONG.M4A'), { kind: 'audio', contentType: 'audio/mp4', extension: 'm4a' });
  assert.deepEqual(attachmentType('clip.mov'), { kind: 'video', contentType: 'video/quicktime', extension: 'mov' });
  assert.throws(() => attachmentType('file.exe'), /supported/);
  assert.doesNotThrow(() => validateFile({ name: 'file.pdf', size: MAX_FILE_SIZE }));
  assert.throws(() => validateFile({ name: 'file.pdf', size: MAX_FILE_SIZE + 1 }), /50 MB/);
  assert.throws(() => validateFile({ name: '../file.pdf', size: 1 }), /valid name/);
  assert.throws(() => validateFile({ name: 'file.pdf', size: 0 }), /non-empty/);
});

test('calendar uses local dates and rejects invalid input', () => {
  const date = localDateTime('2026-03-20', '19:30');
  assert.equal(localDateKey(date), '2026-03-20');
  assert.equal(date.getHours(), 19);
  assert.throws(() => localDateTime('2026-02-31', '19:30'), /valid date/);
  assert.throws(() => localDateTime('2026-03-20', '25:30'), /valid date/);
});

test('missing and legacy timestamps are not displayed as real message times', () => {
  assert.equal(messageTime('0001-01-01T00:00:00Z'), 'Time unavailable');
  assert.equal(messageTime(null), 'Time unavailable');
  assert.notEqual(messageTime('2026-01-01T15:00:00Z'), 'Time unavailable');
});

test('vault viewer chooses supported media and keeps unknown files as downloads', () => {
  assert.equal(previewKind('SHOW.MOV'), 'video');
  assert.equal(previewKind('song.flac'), 'audio');
  assert.equal(previewKind('photo.jpg'), 'image');
  assert.equal(previewKind('lyrics.txt'), 'text');
  assert.equal(previewKind('notes.pdf'), 'pdf');
  assert.equal(previewKind('session.zip'), null);
});
