import './test-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPassword } from '../src/password-strength';

describe('checkPassword', () => {
  it('refuses short passwords', () => {
    assert.equal(checkPassword('abc12').score, 0);
  });

  it('refuses common passwords, also with numbers or symbols added', () => {
    for (const password of ['password123', 'Password1!', 'P@ssw0rd', 'summer2024!', 'qwerty123', 'iloveyou99']) {
      assert.equal(checkPassword(password).problem !== null, true, password);
    }
  });

  it('refuses simple sequences and repeats', () => {
    for (const password of ['12345678', 'abcdefgh', 'qwertyuiop', '87654321', 'aaaaaaaa', 'abababab']) {
      assert.equal(checkPassword(password).score, 0, password);
    }
  });

  it("refuses the user's own name or email", () => {
    assert.equal(checkPassword('osman-rocks-2026', ['Osman Adem', 'osman@example.com']).score, 0);
    assert.equal(checkPassword('osman-rocks-2026').score > 0, true);
  });

  it('gives longer passwords and passphrases a higher score', () => {
    assert.equal(checkPassword('mxqbtrwz').label, 'Fair');
    assert.equal(checkPassword('Kaffe2026!').label, 'Good');
    assert.equal(checkPassword('Xk9!mPq2#Lw4').label, 'Strong');
    assert.equal(checkPassword('purple-horse-runs-fast').label, 'Strong');
  });
});
