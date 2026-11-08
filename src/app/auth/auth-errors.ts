import { HttpErrorResponse } from '@angular/common/http';
import { describeHttpError } from '../shared/server-errors';

/** Turns a failed request into a sentence the user can act on. */
export function describeAuthError(error: HttpErrorResponse): string {
  return describeHttpError(error);
}
