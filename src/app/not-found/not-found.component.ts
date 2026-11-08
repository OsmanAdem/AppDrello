import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { IconComponent } from '../shared/icon.component';

/** Shown for addresses that don't exist, e.g. a mistyped or old link. */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  template: `
    <main class="auth-page not-found">
      <section class="auth-card" aria-labelledby="not-found-title">
        <p class="not-found-code" aria-hidden="true">404</p>
        <h1 id="not-found-title">Page not found</h1>
        <p class="auth-subtitle">This page doesn't exist. The link may be mistyped, or the page has been moved or deleted.</p>
        <div class="not-found-actions">
          <a class="auth-submit" [routerLink]="auth.isLoggedIn ? '/boards' : '/home'">
            {{ auth.isLoggedIn ? 'Go to your boards' : 'Go to the home page' }} <app-icon name="arrow-right" />
          </a>
        </div>
      </section>
    </main>
  `,
  styles: [`
    .not-found { text-align: center; }
    .not-found-code { margin: 0 0 6px; color: var(--accent); font-size: 64px; font-weight: 800; letter-spacing: -.04em; line-height: 1; }
    .not-found-actions { display: flex; justify-content: center; margin-top: 22px; }
    .not-found-actions .auth-submit { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: auto; padding: 0 20px; text-decoration: none; }
  `]
})
export class NotFoundComponent {
  constructor(public auth: AuthService) {}
}
