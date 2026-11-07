import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_URL } from '../api.service';
import { AuthService } from './auth.service';
import { CLIENT_ID } from '../shared/live-board.service';

/**
 * Runs for every HTTP request the app makes.
 * 1. Adds "Authorization: Bearer <token>" to requests to our API, plus this tab's id
 *    (X-Client-Id), so live updates aren't sent back to the tab that made the change.
 * 2. If the server says 401 (not logged in, or the login expired), logs out and opens the login page.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const isApiRequest = request.url.startsWith(API_URL);
  const token = auth.token;

  const withToken = token && isApiRequest
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}`, 'X-Client-Id': CLIENT_ID } })
    : request;

  return next(withToken).pipe(
    catchError((error: HttpErrorResponse) => {
      // A wrong password on the login page is a normal 401, not an expired login.
      const isAccountRequest = request.url.startsWith(`${API_URL}/auth/`);
      if (isApiRequest && error.status === 401 && !isAccountRequest) {
        auth.logout();
        router.navigate(['/login'], { queryParams: { expired: 'true' } });
      }
      return throwError(() => error);
    })
  );
};
