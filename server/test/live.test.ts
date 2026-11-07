import './test-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { addListener, announceBoardChanges, listenerCount, notifyBoardChanged } from '../src/live';

/** A pretend response that remembers what was written into it. */
function fakeResponse() {
  const res = new EventEmitter() as EventEmitter & { written: string[]; statusCode: number } & Record<string, any>;
  res.written = [];
  res.statusCode = 200;
  res.status = () => res;
  res.set = () => res;
  res.flushHeaders = () => undefined;
  res.write = (text: string) => { res.written.push(text); return true; };
  return res;
}

describe('live updates', () => {
  it('tells other tabs about a change, but not the tab that made it', () => {
    const req = new EventEmitter();
    const mine = fakeResponse();
    const other = fakeResponse();
    addListener('board-1', 'tab-A', req as unknown as Request, mine as unknown as Response);
    addListener('board-1', 'tab-B', req as unknown as Request, other as unknown as Response);

    notifyBoardChanged('board-1', 'tab-A');

    assert.ok(other.written.some(text => text.startsWith('event: changed')));
    assert.ok(!mine.written.some(text => text.startsWith('event: changed')));
    req.emit('close');
    assert.equal(listenerCount('board-1'), 0);
  });

  it('only announces successful changes to a board', () => {
    const watcher = fakeResponse();
    const watchReq = new EventEmitter();
    addListener('board-2', 'tab-B', watchReq as unknown as Request, watcher as unknown as Response);

    const run = (method: string, status: number) => {
      const res = fakeResponse();
      const req = { method, path: '/board-2/columns', header: () => 'tab-A' } as unknown as Request;
      announceBoardChanges(req, res as unknown as Response, (() => undefined) as NextFunction);
      res.statusCode = status;
      res.emit('finish');
    };

    run('GET', 200);       // reading changes nothing
    run('PUT', 404);       // a failed save changes nothing
    assert.equal(watcher.written.filter(text => text.startsWith('event: changed')).length, 0);

    run('PUT', 200);
    assert.equal(watcher.written.filter(text => text.startsWith('event: changed')).length, 1);
    watchReq.emit('close');
  });
});
