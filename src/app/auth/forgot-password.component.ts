import { Component, OnDestroy, isDevMode } from '@angular/core';
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

        <ng-container *ngIf="!sentTo; else sentMessage">
          <h1 id="forgot-title">Forgot your password?</h1>
          <p class="auth-subtitle">Enter your email and we'll send you a link to choose a new one.</p>

          <form (ngSubmit)="submit()" novalidate>
            <label>
              <span>Email</span>
              <input name="email" type="email" [(ngModel)]="email" autocomplete="email" required>
            </label>
            <p class="auth-error" *ngIf="error" role="alert">{{ error }}</p>
            <button type="submit" class="auth-submit" [disabled]="loading">
              {{ loading ? 'Sending…' : 'Send reset link' }}
            </button>
          </form>
        </ng-container>

        <ng-template #sentMessage>
          <h1 id="forgot-title">Check your email</h1>
          <p class="auth-subtitle" role="status">
            If there's an account for <strong>{{ sentTo }}</strong>, we've sent a link to reset your password.
          </p>
          <p class="auth-subtitle">
            The link works once and expires in 1 hour. Can't find it? Check your spam folder, or
            <button type="button" class="inline-link" (click)="sendAgain()" [disabled]="loading || cooldown > 0">
              {{ cooldown > 0 ? 'send it again in ' + cooldown + ' s' : 'send it again' }}</button>.
          </p>
          <p class="auth-success" *ngIf="resent" role="status">We've sent a new link.</p>
          <p class="auth-error" *ngIf="error" role="alert">{{ error }}</p>

          <!-- Only while developing (npm start), never in the published app -->
          <p class="dev-note" *ngIf="devMode">
            <strong>Developer note:</strong> if the server has no email settings in <code>server/.env</code>,
            the link is printed in the server terminal instead of being emailed.
          </p>
        </ng-template>

        <p class="auth-switch">Remembered it? <a routerLink="/login">Back to log in</a></p>
      </section>
    </main>
  `,
  styles: [`
    .inline-link { padding: 0; border: 0; background: none; color: var(--accent); font: inherit; font-weight: 700; cursor: pointer; }
    .inline-link:hover:not(:disabled) { text-decoration: underline; }
    .inline-link:disabled { color: var(--text-subtle); cursor: default; }
    .inline-link:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; border-radius: 3px; }
    .dev-note { margin: 18px 0 0; padding: 10px 12px; border: 1px dashed var(--line); border-radius: var(--radius-sm); color: var(--text-subtle); font-size: 12px; line-height: 1.5; }
    code { font-size: 12px; }
  `]
})
export class ForgotPasswordComponent implements OnDestroy {
  readonly devMode = isDevMode();
  email = '';
  sentTo = '';
  error = '';
  loading = false;
  resent = false;
  /** Seconds left before "send it again" can be used, so the button can't be spammed. */
  cooldown = 0;
  private cooldownTimer?: ReturnType<typeof setInterval>;

  constructor(private auth: AuthService) {}

  ngOnDestroy(): void {
    clearInterval(this.cooldownTimer);
  }

  submit(): void {
    this.error = '';
    if (!this.email.trim()) {
      this.error = 'Enter your email address.';
      return;
    }
    this.send(this.email.trim());
  }

  sendAgain(): void {
    this.error = '';
    this.resent = false;
    this.send(this.sentTo, true);
  }

  private send(email: string, again = false): void {
    this.loading = true;
    this.auth.requestPasswordReset(email).subscribe({
      next: () => {
        this.loading = false;
        this.sentTo = email;
        this.resent = again;
        this.startCooldown();
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.error = describeAuthError(error);
      }
    });
  }

  private startCooldown(): void {
    clearInterval(this.cooldownTimer);
    this.cooldown = 30;
    this.cooldownTimer = setInterval(() => {
      this.cooldown--;
      if (this.cooldown <= 0) clearInterval(this.cooldownTimer);
    }, 1000);
  }
}
