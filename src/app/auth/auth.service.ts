import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, map, tap } from 'rxjs';
import { API_URL } from '../api.service';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

/**
 * Signing up, logging in and out.
 * The server answers a successful login with a token (a JWT). The app keeps it and
 * sends it with every API request (see auth.interceptor.ts), so the server knows who is asking.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenKey = 'drello-token';
  private readonly userKey = 'drello-user';
  private readonly isBrowser: boolean;

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    private http: HttpClient
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  get token(): string | null {
    return this.isBrowser ? localStorage.getItem(this.tokenKey) : null;
  }

  get user(): AuthUser | null {
    if (!this.isBrowser) return null;
    try {
      const stored = localStorage.getItem(this.userKey);
      return stored ? JSON.parse(stored) as AuthUser : null;
    } catch {
      return null;
    }
  }

  /** True when there is a token that hasn't expired yet. */
  get isLoggedIn(): boolean {
    const token = this.token;
    if (!token) return false;

    try {
      // A JWT is three parts separated by dots. The middle part holds the expiry time ("exp", in seconds).
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.http.post<AuthResponse>(`${API_URL}/auth/login`, { email, password })
      .pipe(tap(response => this.startSession(response)), map(response => response.user));
  }

  register(name: string, email: string, password: string): Observable<AuthUser> {
    return this.http.post<AuthResponse>(`${API_URL}/auth/register`, { name, email, password })
      .pipe(tap(response => this.startSession(response)), map(response => response.user));
  }

  /** Changes the password. The server answers with a new token, because older ones stop working. */
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<AuthResponse>(`${API_URL}/auth/change-password`, { currentPassword, newPassword })
      .pipe(
        tap(response => localStorage.setItem(this.tokenKey, response.token)),
        map(() => undefined)
      );
  }

  /** Asks the server to send a reset link. The answer is the same whether or not the email exists. */
  requestPasswordReset(email: string): Observable<string> {
    return this.http.post<{ message: string }>(`${API_URL}/auth/forgot-password`, { email })
      .pipe(map(response => response.message));
  }

  /** Sets a new password using the secret from a reset link. */
  resetPassword(token: string, password: string): Observable<string> {
    return this.http.post<{ message: string }>(`${API_URL}/auth/reset-password`, { token, password })
      .pipe(map(response => response.message));
  }

  /** Logs out and removes this browser's copy of the boards, so the next person can't see them. */
  logout(): void {
    if (!this.isBrowser) return;
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.clearLocalBoardData();
  }

  private startSession(response: AuthResponse): void {
    // Start from an empty copy: the boards are loaded from the server for this user.
    this.clearLocalBoardData();
    localStorage.setItem(this.tokenKey, response.token);
    localStorage.setItem(this.userKey, JSON.stringify(response.user));
  }

  /** Removes every saved board, card, sprint, etc. from this browser. Keeps settings like the theme. */
  private clearLocalBoardData(): void {
    const keep = new Set(['drello-theme', this.tokenKey, this.userKey]);
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      // "drello-kept-<user>" holds that user's changes that never reached the server: keep them.
      if (key?.startsWith('drello-') && !keep.has(key) && !key.startsWith('drello-kept-')) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
  }
}
