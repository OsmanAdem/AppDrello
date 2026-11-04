import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { describeAuthError } from './auth-errors';

/** Step 1 of "forgot password": ask for a reset link. */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="auth-page">
      <section class="auth-card" aria-labelledby="forgot-title">
        <h1 id="forgot-title">Forgot your password?</h1>
        <p class="auth-subtitle">Enter your email and we'll send you a link to choose a new one.</p>

        <ng-container *ngIf="!sent; else sentMessage">
          <form (ngSubmit)="submit()" novalidate>
            <label>
              <span>Email</span>
              <input name="email" type="email" [(ngModel)]="email" autocomplete="email" required>
            </label>
            <p class="auth-error" *ngIf="error" role="alert">{{ error }}</p>
            <button type="submit" class="auth-submit" [disabled]="loading">
              {{ loading ? 'Please wait…' : 'Send reset link' }}
            </button>
          </form>
        </ng-container>

        <ng-template #sentMessage>
          <p class="auth-success" role="status">{{ sent }}</p>
          <p class="auth-subtitle dev-note">
            Check your inbox, and your spam folder. The link works once and expires in 1 hour.
          </p>
          <p class="auth-subtitle dev-note">
            Developing without email settings? Then the link is printed in the server terminal
            (<code>npm run dev</code>) instead.
          </p>
        </ng-template>

        <p class="auth-switch">Remembered it? <a routerLink="/login">Back to log in</a></p>
      </section>
    </main>
  `,
  styles: [`.dev-note { margin: 14px 0 0; } code { font-size: 12px; }`]
})
export class ForgotPasswordComponent {
  email = '';
  error = '';
  sent = '';
  loading = false;

  constructor(private auth: AuthService) {}

  submit(): void {
    this.error = '';
    if (!this.email.trim()) {
      this.error = 'Enter your email address.';
      return;
    }

    this.loading = true;
    this.auth.requestPasswordReset(this.email.trim()).subscribe({
      next: message => {
        this.loading = false;
        this.sent = message;
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.error = describeAuthError(error);
      }
    });
  }
}
