import './test-env';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from '../src/rate-limit';
import { HttpError } from '../src/http';

/** Calls the middleware like Express would, and returns what it passed to next(). */
function call(middleware: ReturnType<typeof rateLimit>, email: string) {
  const headers: Record<string, string> = {};
  const req = { body: { email }, ip: '1.2.3.4' } as Request;
  const res = { setHeader: (name: string, value: string) => { headers[name] = value; } } as unknown as Response;
  let passed: unknown = 'not called';
  middleware(req, res, ((error?: unknown) => { passed = error; }) as NextFunction);
  return { error: passed, headers };
}

describe('rateLimit', () => {
  let now = 1_000_000;

  beforeEach(() => {
    // Control the clock, so the test doesn't have to wait 15 real minutes.
    mock.method(Date, 'now', () => now);
  });
  afterEach(() => mock.restoreAll());

  const limit = () => rateLimit({ max: 3, windowMinutes: 15, key: req => String(req.body.email), message: 'Slow down.' });

  it('lets the first requests through', () => {
    const middleware = limit();
    for (let i = 0; i < 3; i++) assert.equal(call(middleware, 'a@x.com').error, undefined);
  });

  it('answers 429 with Retry-After once the limit is reached', () => {
    const middleware = limit();
    for (let i = 0; i < 3; i++) call(middleware, 'a@x.com');

    const { error, headers } = call(middleware, 'a@x.com');
    assert.ok(error instanceof HttpError);
    assert.equal((error as HttpError).status, 429);
    assert.equal((error as HttpError).message, 'Slow down.');
    assert.equal(headers['Retry-After'], String(15 * 60));
  });

  it('counts each key on its own', () => {
    const middleware = limit();
    for (let i = 0; i < 3; i++) call(middleware, 'a@x.com');
    assert.equal(call(middleware, 'b@x.com').error, undefined);
  });

  it('allows requests again after the window has passed', () => {
    const middleware = limit();
    for (let i = 0; i < 3; i++) call(middleware, 'a@x.com');

    now += 15 * 60 * 1000;
    assert.equal(call(middleware, 'a@x.com').error, undefined);
  });
});
