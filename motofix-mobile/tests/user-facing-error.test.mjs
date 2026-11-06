import test from 'node:test';
import assert from 'node:assert/strict';
import { getUserFacingError } from '../lib/userFacingError.js';

test('preserves ordinary words containing s and collapses whitespace', () => {
  assert.equal(getUserFacingError('Please   select different parts.'), 'Please select different parts.');
});
test('recognizes session errors after stripping technical labels', () => {
  assert.equal(getUserFacingError({ message: 'error: Session expired' }), 'Your session has expired. Sign in again, then retry the AI preview.');
});
test('extracts nested JSON messages and recognizes network errors', () => {
  assert.equal(getUserFacingError({ context: '{"error":{"message":"Network request failed"}}' }), 'Unable to connect. Check your internet connection, then try again.');
});
test('literal escaped newlines and tabs are removed without removing letters', () => {
  assert.equal(getUserFacingError('Please\\nretry\\tthis request.'), 'Please retry this request.');
});
test('cyclic and technical errors use the supplied fallback', () => {
  const error = {}; error.context = error;
  assert.equal(getUserFacingError(error, 'Try again.'), 'Try again.');
  assert.equal(getUserFacingError({ message: 'TypeError from Supabase' }, 'Try again.'), 'Try again.');
});
