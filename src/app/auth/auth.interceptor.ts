import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_URL } from '../api.service';
import { AuthService } from './auth.service';

/**
 * Runs for every HTTP request the app makes.
 * 1. Adds "Authorization: Bearer <token>" to requests to our API.
 * 2. If the server says 401 (not logged in, or the login expired), logs out and opens the login page.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const isApiRequest = request.url.startsWith(API_URL);
  const token = auth.token;

  const withToken = token && isApiRequest
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(withToken).pipe(
    catchError((error: HttpErrorResponse) => {
      const isLoginRequest = request.url.startsWith(`${API_URL}/auth/`);
      if (isApiRequest && error.status === 401 && !isLoginRequest) {
        auth.logout();
        router.navigate(['/login'], { queryParams: { expired: 'true' } });
      }
      return throwError(() => error);
    })
  );
};
