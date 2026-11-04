import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Protects pages that need a login (the boards).
 * Not logged in → go to the login page, and come back here afterwards (returnUrl).
 */
export const authGuard: CanActivateFn = (_route, state) => {
  // On the server (SSR) there is no login information, so let the browser decide.
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const auth = inject(AuthService);
  if (auth.isLoggedIn) return true;

  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
