import { NextFunction, Request, Response, Router } from 'express';
import { assertBoardAccess, userIdOf } from './auth';
import { asyncHandler } from './http';

/**
 * Live updates with Server-Sent Events (SSE).
 *
 * A browser that has a board open keeps one request open:  GET /api/boards/:id/events
 * The server never finishes that answer. Instead, whenever someone saves a change to the
 * board, it writes a short message into it ("changed"), and the browser fetches the board again.
 *
 * Every browser tab sends its own random X-Client-Id, so a tab isn't told about its own saves.
 */

interface Listener {
  res: Response;
  clientId: string;
}

/** boardId → the open connections watching that board. */
const listeners = new Map<string, Set<Listener>>();

/** How many open connections there are (used by the tests). */
export function listenerCount(boardId: string): number {
  return listeners.get(boardId)?.size ?? 0;
}

/** Tells everyone watching the board that it changed, except the tab that made the change. */
export function notifyBoardChanged(boardId: string, fromClientId = ''): void {
  for (const listener of listeners.get(boardId) ?? []) {
    if (fromClientId && listener.clientId === fromClientId) continue;
    listener.res.write(`event: changed\ndata: ${JSON.stringify({ boardId })}\n\n`);
  }
}

/** Starts watching: keeps the response open and registers it until the browser disconnects. */
export function addListener(boardId: string, clientId: string, req: Request, res: Response): void {
  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no' // tells proxies (e.g. nginx) not to hold the messages back
  });
  res.flushHeaders();
  res.write('event: ready\ndata: {}\n\n');

  const listener: Listener = { res, clientId };
  const set = listeners.get(boardId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(boardId, set);

  // Hosting services close connections that stay silent, so send a comment line now and then.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    set.delete(listener);
    if (set.size === 0) listeners.delete(boardId);
  });
}

export const liveRouter = Router();

liveRouter.get('/:id/events', asyncHandler(async (req, res) => {
  await assertBoardAccess(req.params['id'], userIdOf(res));
  addListener(req.params['id'], String(req.header('x-client-id') ?? ''), req, res);
}));

/**
 * Middleware for /api/boards: after every successful change to a board (PUT, POST, DELETE
 * on /api/boards/<id>/...), tell the other people watching it.
 */
export function announceBoardChanges(req: Request, res: Response, next: NextFunction): void {
  const boardId = req.path.split('/')[1];
  if (req.method !== 'GET' && boardId) {
    res.on('finish', () => {
      if (res.statusCode < 400) notifyBoardChanged(boardId, String(req.header('x-client-id') ?? ''));
    });
  }
  next();
}
