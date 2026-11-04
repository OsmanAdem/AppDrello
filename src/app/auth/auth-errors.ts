import { HttpErrorResponse } from '@angular/common/http';

/** Turns a failed request into a sentence the user can act on. */
export function describeAuthError(error: HttpErrorResponse): string {
  if (error.status === 0) return "Can't reach the server. Is it running? (npm run dev in the server folder)";
  return error.error?.error || 'Something went wrong. Please try again.';
}
