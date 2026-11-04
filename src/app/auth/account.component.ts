import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from './auth.service';
import { describeAuthError } from './auth-errors';

/** The logged-in user's account page: who you are, and changing your password. */
@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="auth-page">
      <section class="auth-card" aria-labelledby="account-title">
        <h1 id="account-title">Your account</h1>
        <p class="auth-subtitle">{{ auth.user?.name }} · {{ auth.user?.email }}</p>

        <form (ngSubmit)="submit()" novalidate>
          <h2>Change password</h2>
          <label>
            <span>Current password</span>
            <input name="current" type="password" [(ngModel)]="currentPassword" autocomplete="current-password" required>
          </label>
          <label>
            <span>New password</span>
            <input name="new" type="password" [(ngModel)]="newPassword" autocomplete="new-password" required>
            <small>At least 8 characters. You'll be logged out on your other devices.</small>
          </label>
          <label>
            <span>Repeat new password</span>
            <input name="confirm" type="password" [(ngModel)]="confirm" autocomplete="new-password" required>
          </label>

          <p class="auth-error" *ngIf="error" role="alert">{{ error }}</p>
          <p class="auth-success" *ngIf="success" role="status">{{ success }}</p>

          <button type="submit" class="auth-submit" [disabled]="loading">
            {{ loading ? 'Please wait…' : 'Change password' }}
          </button>
        </form>
      </section>
    </main>
  `,
  styles: [`h2 { margin: 4px 0 2px; color: var(--text-strong); font-size: 16px; }`]
})
export class AccountComponent {
  currentPassword = '';
  newPassword = '';
  confirm = '';
  error = '';
  success = '';
  loading = false;

  constructor(public auth: AuthService) {}

  submit(): void {
    this.error = '';
    this.success = '';

    if (!this.currentPassword) {
      this.error = 'Enter your current password.';
      return;
    }
    if (this.newPassword.length < 8) {
      this.error = 'The new password must be at least 8 characters.';
      return;
    }
    if (this.newPassword !== this.confirm) {
      this.error = "The two new passwords don't match.";
      return;
    }
    if (this.newPassword === this.currentPassword) {
      this.error = 'The new password must be different from the current one.';
      return;
    }

    this.loading = true;
    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.loading = false;
        this.success = 'Your password has been changed.';
        this.currentPassword = this.newPassword = this.confirm = '';
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.error = describeAuthError(error);
      }
    });
  }
}
