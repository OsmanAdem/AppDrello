import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { describeAuthError } from './auth-errors';
import { BoardService } from '../board.service';
import { ConfirmService } from '../shared/confirm.service';

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

        <form class="danger-zone" (ngSubmit)="deleteAccount()" novalidate aria-labelledby="delete-title">
          <h2 id="delete-title">Delete account</h2>
          <p>
            This permanently deletes your account and all your boards, cards, sprints and templates.
            It can't be undone.
          </p>
          <label>
            <span>Type your password to confirm</span>
            <input name="deletePassword" type="password" [(ngModel)]="deletePassword" autocomplete="current-password">
          </label>
          <p class="auth-error" *ngIf="deleteError" role="alert">{{ deleteError }}</p>
          <button type="submit" class="danger-button" [disabled]="deleting">
            {{ deleting ? 'Deleting…' : 'Delete my account' }}
          </button>
        </form>
      </section>
    </main>
  `,
  styles: [`
    h2 { margin: 4px 0 2px; color: var(--text-strong); font-size: 16px; }
    .danger-zone { margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--line); }
    .danger-zone h2 { color: var(--danger-strong); }
    .danger-zone > p:not(.auth-error) { margin: 0; color: var(--text-muted); font-size: 13px; line-height: 1.55; }
    .danger-button { height: 44px; border: 1px solid var(--danger); border-radius: 10px; background: var(--surface); color: var(--danger-strong); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; transition: background .15s ease, color .15s ease; }
    .danger-button:hover:not(:disabled) { background: var(--danger); color: #ffffff; }
    .danger-button:disabled { opacity: .6; cursor: progress; }
    .danger-button:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
  `]
})
export class AccountComponent {
  currentPassword = '';
  newPassword = '';
  confirm = '';
  error = '';
  success = '';
  loading = false;

  deletePassword = '';
  deleteError = '';
  deleting = false;

  constructor(
    public auth: AuthService,
    private boards: BoardService,
    private confirmDialog: ConfirmService,
    private router: Router
  ) {}

  async deleteAccount(): Promise<void> {
    this.deleteError = '';
    if (!this.deletePassword) {
      this.deleteError = 'Type your password to confirm.';
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      title: 'Delete your account?',
      message: `Your account (${this.auth.user?.email}) and all your boards will be deleted for good. This can't be undone.`,
      confirmLabel: 'Delete account',
      danger: true
    });
    if (!confirmed) return;

    this.deleting = true;
    // Let any change still on its way finish first, so nothing is sent after the account is gone.
    await this.boards.flushPendingWrites();

    this.auth.deleteAccount(this.deletePassword).subscribe({
      next: () => this.router.navigate(['/home']),
      error: (error: HttpErrorResponse) => {
        this.deleting = false;
        this.deleteError = describeAuthError(error);
      }
    });
  }

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
