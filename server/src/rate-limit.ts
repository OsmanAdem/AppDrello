import { NextFunction, Request, Response } from 'express';
import { HttpError } from './http';

/**
 * A simple rate limiter: allows at most `max` requests per key within `windowMinutes`.
 * It stops someone from guessing passwords or flooding an inbox with reset emails.
 *
 * The counts live in memory, so they reset when the server restarts. That's fine for one
 * server; with several servers you'd keep them in a shared store such as Redis.
 */
export function rateLimit(options: {
  max: number;
  windowMinutes: number;
  /** What to count by, e.g. the email address or the visitor's IP address. */
  key: (req: Request) => string;
  message: string;
}) {
  const windowMs = options.windowMinutes * 60 * 1000;
  const hits = new Map<string, number[]>(); // key → times of recent requests

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = options.key(req);
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter(time => now - time < windowMs);

    if (recent.length >= options.max) {
      const retryAfterSeconds = Math.ceil((recent[0] + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      next(new HttpError(429, options.message));
      return;
    }

    recent.push(now);
    hits.set(key, recent);

    // Forget old entries now and then, so the map doesn't grow forever.
    if (hits.size > 10_000) {
      for (const [storedKey, times] of hits) {
        if (times.every(time => now - time >= windowMs)) hits.delete(storedKey);
      }
    }

    next();
  };
}

/** The email in the request body, in lower case, so "A@x.com" and "a@x.com" count together. */
export const byEmail = (req: Request) => String(req.body?.email ?? '').trim().toLowerCase();
export const byIp = (req: Request) => req.ip ?? 'unknown';
