import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** One page for both logging in and creating an account. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="auth-page">
      <section class="auth-card" aria-labelledby="auth-title">
        <div class="auth-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <h1 id="auth-title">{{ mode === 'login' ? 'Welcome back' : 'Create your account' }}</h1>
        <p class="auth-subtitle">
          {{ mode === 'login' ? 'Log in to see your boards.' : 'Your boards are saved to your account, on every device.' }}
        </p>

        <p class="auth-notice" *ngIf="expired" role="status">Your login expired. Please log in again.</p>

        <form (ngSubmit)="submit()" novalidate>
          <label *ngIf="mode === 'register'">
            <span>Name</span>
            <input name="name" [(ngModel)]="name" autocomplete="name" maxlength="80" required>
          </label>
          <label>
            <span>Email</span>
            <input name="email" type="email" [(ngModel)]="email" autocomplete="email" required>
          </label>
          <label>
            <span>Password</span>
            <input
              name="password"
              type="password"
              [(ngModel)]="password"
              [attr.autocomplete]="mode === 'login' ? 'current-password' : 'new-password'"
              required>
            <small *ngIf="mode === 'register'">At least 8 characters.</small>
          </label>

          <p class="auth-error" *ngIf="error" role="alert">{{ error }}</p>

          <button type="submit" class="auth-submit" [disabled]="loading">
            {{ loading ? 'Please wait…' : (mode === 'login' ? 'Log in' : 'Create account') }}
          </button>
        </form>

        <p class="auth-switch">
          {{ mode === 'login' ? 'New to Drello?' : 'Already have an account?' }}
          <button type="button" (click)="switchMode()">{{ mode === 'login' ? 'Create an account' : 'Log in' }}</button>
        </p>
      </section>
    </main>
  `,
  styles: [`
    .auth-page { display: grid; min-height: calc(100vh - 160px); place-items: center; padding: 40px 16px; }
    .auth-card { width: min(100%, 420px); padding: 32px 28px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-md); }
    .auth-mark { display: grid; grid-template-columns: repeat(2, 8px); gap: 3px; place-content: center; width: 44px; height: 44px; margin-bottom: 18px; border-radius: 12px; background: var(--accent-soft); }
    .auth-mark span { height: 8px; border-radius: 2px; background: var(--accent); }
    .auth-mark span:nth-child(2), .auth-mark span:nth-child(3) { opacity: .55; }
    h1 { margin: 0 0 6px; color: var(--text-strong); font-size: 24px; letter-spacing: -.03em; }
    .auth-subtitle { margin: 0 0 22px; color: var(--text-muted); font-size: 13px; line-height: 1.5; }
    .auth-notice { margin: 0 0 16px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--warning-soft); color: var(--text); font-size: 13px; }
    form { display: flex; flex-direction: column; gap: 14px; }
    label { display: flex; flex-direction: column; gap: 6px; }
    label span { color: var(--text-muted); font-size: 12px; font-weight: 700; }
    label small { color: var(--text-subtle); font-size: 12px; }
    input { height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--text-strong); font: inherit; font-size: 14px; outline: none; transition: border-color .15s ease, box-shadow .15s ease; }
    input:focus { border-color: var(--accent-border); box-shadow: 0 0 0 3px var(--accent-soft); }
    .auth-error { margin: 0; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--danger-soft); color: var(--danger-strong); font-size: 13px; font-weight: 600; }
    .auth-submit { height: 44px; margin-top: 4px; border: 1px solid var(--accent); border-radius: 10px; background: var(--accent); color: #ffffff; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; transition: background .15s ease; }
    .auth-submit:hover:not(:disabled) { border-color: var(--accent-pressed); background: var(--accent-pressed); }
    .auth-submit:disabled { opacity: .6; cursor: progress; }
    .auth-submit:focus-visible, .auth-switch button:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
    .auth-switch { margin: 20px 0 0; color: var(--text-muted); font-size: 13px; text-align: center; }
    .auth-switch button { padding: 2px 4px; border: 0; border-radius: 4px; background: none; color: var(--accent); font: inherit; font-weight: 700; cursor: pointer; }
    .auth-switch button:hover { text-decoration: underline; }
  `]
})
export class LoginComponent implements OnInit {
  mode: 'login' | 'register' = 'login';
  name = '';
  email = '';
  password = '';
  error = '';
  loading = false;
  expired = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.expired = this.route.snapshot.queryParamMap.get('expired') === 'true';
    if (this.auth.isLoggedIn) this.goToBoards();
  }

  switchMode(): void {
    this.mode = this.mode === 'login' ? 'register' : 'login';
    this.error = '';
  }

  submit(): void {
    this.error = '';

    if ((this.mode === 'register' && !this.name.trim()) || !this.email.trim() || !this.password) {
      this.error = 'Please fill in all fields.';
      return;
    }
    if (this.mode === 'register' && this.password.length < 8) {
      this.error = 'The password must be at least 8 characters.';
      return;
    }

    this.loading = true;
    const request = this.mode === 'login'
      ? this.auth.login(this.email.trim(), this.password)
      : this.auth.register(this.name.trim(), this.email.trim(), this.password);

    request.subscribe({
      next: () => this.goToBoards(),
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.error = error.status === 0
          ? "Can't reach the server. Is it running? (npm run dev in the server folder)"
          : error.error?.error || 'Something went wrong. Please try again.';
      }
    });
  }

  private goToBoards(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    // Only follow addresses inside the app, never a link to another site.
    this.router.navigateByUrl(returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/boards');
  }
}
