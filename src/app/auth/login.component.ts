import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';

/** One page for both logging in and creating an account. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="auth-page">
      <section class="auth-card" aria-labelledby="auth-title">
        <div class="auth-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <h1 id="auth-title">{{ mode === 'login' ? 'Welcome back' : 'Create your account' }}</h1>
        <p class="auth-subtitle">
          {{ mode === 'login' ? 'Log in to see your boards.' : 'Your boards are saved to your account, on every device.' }}
        </p>

        <p class="auth-notice" *ngIf="expired" role="status">Your login expired. Please log in again.</p>
        <p class="auth-success" *ngIf="passwordReset && mode === 'login'" role="status">Your password has been changed. Log in with the new one.</p>

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
          <a *ngIf="mode === 'login'" class="auth-forgot" routerLink="/forgot-password">Forgot password?</a>

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
})
export class LoginComponent implements OnInit {
  mode: 'login' | 'register' = 'login';
  name = '';
  email = '';
  password = '';
  error = '';
  loading = false;
  expired = false;
  passwordReset = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.expired = this.route.snapshot.queryParamMap.get('expired') === 'true';
    this.passwordReset = this.route.snapshot.queryParamMap.get('reset') === 'done';
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
