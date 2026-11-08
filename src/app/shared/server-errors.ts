import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';

/**
 * What to say when the server can't be reached (status 0: no answer at all).
 * Developers get a hint about starting the server; users online get a plain message.
 */
export const SERVER_UNREACHABLE = environment.production
  ? "Can't reach Drello right now. Check your internet connection and try again in a moment."
  : "Can't reach the server. Is it running? (npm run dev in the server folder)";

/** Turns a failed request into a sentence the user can act on. */
export function describeHttpError(error: unknown): string {
  const http = error as HttpErrorResponse;
  if (http?.status === 0) return SERVER_UNREACHABLE;
  return http?.error?.error || 'Something went wrong. Please try again.';
}
