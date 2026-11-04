import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../api.service';
import { AuthService } from './auth.service';

/** Builds a fake JWT whose payload expires `secondsFromNow` from now. */
function fakeToken(secondsFromNow: number): string {
  const payload = btoa(JSON.stringify({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + secondsFromNow }));
  return `header.${payload}.signature`;
}

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('is logged out at the start', () => {
    expect(auth.isLoggedIn).toBeFalse();
  });

  it('stores the token after logging in', () => {
    auth.login('osman@example.com', 'secret123').subscribe();
    http.expectOne(`${API_URL}/auth/login`).flush({
      token: fakeToken(3600),
      user: { id: 'u1', name: 'Osman', email: 'osman@example.com' }
    });

    expect(auth.isLoggedIn).toBeTrue();
    expect(auth.user?.name).toBe('Osman');
  });

  it('treats an expired token as logged out', () => {
    localStorage.setItem('drello-token', fakeToken(-10));
    expect(auth.isLoggedIn).toBeFalse();
  });

  it('removes the token and saved boards on logout, but keeps the theme', () => {
    localStorage.setItem('drello-token', fakeToken(3600));
    localStorage.setItem('drello-boards', '[]');
    localStorage.setItem('drello-theme', 'dark');

    auth.logout();

    expect(localStorage.getItem('drello-token')).toBeNull();
    expect(localStorage.getItem('drello-boards')).toBeNull();
    expect(localStorage.getItem('drello-theme')).toBe('dark');
  });
});
