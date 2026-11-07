import './test-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { canAccessBoard, createToken, requireAuth } from '../src/auth';
import { HttpError } from '../src/http';

function runRequireAuth(authorization?: string): unknown {
  const req = { headers: authorization ? { authorization } : {} } as Request;
  const res = { locals: {} } as Response;
  let passed: unknown = 'not called';
  requireAuth(req, res, error => { passed = error; });
  return passed;
}

describe('login tokens', () => {
  it('creates a signed token for the user that expires in 7 days', () => {
    const token = createToken('user-1');
    const payload = jwt.verify(token, process.env['JWT_SECRET']!) as jwt.JwtPayload;

    assert.equal(payload.sub, 'user-1');
    assert.equal(payload.exp! - payload.iat!, 7 * 24 * 60 * 60);
  });

  it('rejects a request without a token', () => {
    const error = runRequireAuth();
    assert.ok(error instanceof HttpError);
    assert.equal((error as HttpError).status, 401);
  });

  it('rejects a token signed with another secret (a fake one)', () => {
    const fake = jwt.sign({ sub: 'user-1' }, 'not-the-real-secret');
    const error = runRequireAuth(`Bearer ${fake}`);
    assert.equal((error as HttpError).status, 401);
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ sub: 'user-1' }, process.env['JWT_SECRET']!, { expiresIn: -10 });
    const error = runRequireAuth(`Bearer ${expired}`);
    assert.equal((error as HttpError).status, 401);
  });
});

describe('canAccessBoard', () => {
  it('lets the owner or a member in, using the given query parameter', () => {
    const sql = canAccessBoard('$7');
    assert.match(sql, /boards\.owner_id = \$7/);
    assert.match(sql, /board_members/);
    assert.match(sql, /m\.user_id = \$7/);
  });
});
