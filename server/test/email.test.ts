import './test-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSender } from '../src/email';

describe('parseSender (EMAIL_FROM → Brevo sender)', () => {
  it('reads a name and an address', () => {
    assert.deepEqual(parseSender('Drello <osman@example.com>'), { name: 'Drello', email: 'osman@example.com' });
  });

  it('accepts a name in quotes', () => {
    assert.deepEqual(parseSender('"Drello App" <a@b.se>'), { name: 'Drello App', email: 'a@b.se' });
  });

  it('accepts just an address', () => {
    assert.deepEqual(parseSender('osman@example.com'), { email: 'osman@example.com' });
  });
});
