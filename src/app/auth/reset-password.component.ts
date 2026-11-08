import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { describeAuthError } from './auth-errors';
import { RevealPasswordDirective } from '../shared/reveal-password.directive';
import { PasswordStrengthComponent } from '../shared/password-strength.component';
import { checkPassword } from '../shared/password-strength';

/** Step 2 of "forgot password": the page the reset link opens. */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RevealPasswordDirective, PasswordStrengthComponent],
  template: `
    <main class="auth-page">
      <section class="auth-card" aria-labelledby="reset-title">
        <h1 id="reset-title">Choose a new password</h1>

        <ng-container *ngIf="token; else missingToken">
          <p class="auth-subtitle">Pick something you don't use anywhere else.</p>
          <form (ngSubmit)="submit()" novalidate>
            <label>
              <span>New password</span>
              <input name="password" type="password" appRevealPassword [(ngModel)]="password" autocomplete="new-password" required>
              <app-password-strength [password]="password" />
            </label>
            <label>
              <span>Repeat new password</span>
              <input name="confirm" type="password" appRevealPassword [(ngModel)]="confirm" autocomplete="new-password" required>
            </label>
            <p class="auth-error" *ngIf="error" role="alert">{{ error }}</p>
            <button type="submit" class="auth-submit" [disabled]="loading">
              {{ loading ? 'Please wait…' : 'Save new password' }}
            </button>
          </form>
        </ng-container>

        <ng-template #missingToken>
          <p class="auth-error" role="alert">This link is missing its code. Please open the full link again, or ask for a new one.</p>
        </ng-template>

        <p class="auth-switch"><a routerLink="/forgot-password">Ask for a new link</a></p>
      </section>
    </main>
  `
})
export class ResetPasswordComponent implements OnInit {
  token = '';
  password = '';
  confirm = '';
  error = '';
  loading = false;

  constructor(
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
  }

  submit(): void {
    this.error = '';
    const weakness = checkPassword(this.password).problem;
    if (weakness) {
      this.error = weakness;
      return;
    }
    if (this.password !== this.confirm) {
      this.error = "The two passwords don't match.";
      return;
    }

    this.loading = true;
    this.auth.resetPassword(this.token, this.password).subscribe({
      next: () => {
        // Any old login in this browser is no longer valid, so start clean.
        this.auth.logout();
        this.router.navigate(['/login'], { queryParams: { reset: 'done' } });
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.error = describeAuthError(error);
      }
    });
  }
}
