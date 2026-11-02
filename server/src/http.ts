import { NextFunction, Request, RequestHandler, Response } from 'express';

/** An error with an HTTP status code, e.g. 404 Not Found or 400 Bad Request. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Express 4 doesn't catch errors thrown in async functions.
 * This wrapper passes them on to the error handler in index.ts.
 */
export function asyncHandler(
  handler: (req: Request, res: Response) => Promise<unknown>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

/** Reads a required, non-empty string from the request body. */
export function requireText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${fieldName} is required.`);
  }
  return value.trim();
}
