import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { checkPassword, MIN_PASSWORD_LENGTH, PasswordCheck } from './password-strength';

/**
 * The meter under a "new password" field: four bars, a label (Weak, Fair, Good, Strong)
 * and a short tip. Before anything is typed it shows the basic rule instead.
 * Use: <app-password-strength [password]="password" [personal]="[name, email]" />
 */
@Component({
  selector: 'app-password-strength',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <small class="strength-hint" *ngIf="!password">{{ emptyHint }}</small>
    <div class="strength" *ngIf="password" [attr.data-score]="check.score">
      <div class="strength-bars" aria-hidden="true">
        <span *ngFor="let bar of bars" [class.is-on]="bar <= check.score"></span>
      </div>
      <p class="strength-text" aria-live="polite">
        <strong>{{ check.label }}</strong>
        <span *ngIf="check.score > 0 || check.problem">· {{ check.tip }}</span>
      </p>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .strength-hint { color: var(--text-subtle); font-size: 12px; }
    .strength-bars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 2px; }
    .strength-bars span { height: 4px; border-radius: 999px; background: var(--line); transition: background .2s ease; }
    .strength-text { margin: 6px 0 0; color: var(--text-muted); font-size: 12px; line-height: 1.45; }
    .strength-text strong { color: var(--strength-color); font-weight: 750; }
    .strength { --strength-color: var(--danger-strong); }
    .strength[data-score="1"] { --strength-color: #d97706; }
    .strength[data-score="2"] { --strength-color: #65a30d; }
    .strength[data-score="3"] { --strength-color: var(--success-strong); }
    .strength-bars span.is-on { background: var(--strength-color); }
    /* Weak still shows one red bar, so the meter never looks empty while typing. */
    .strength[data-score="0"] .strength-bars span:first-child { background: var(--strength-color); }
    @media (prefers-reduced-motion: reduce) { .strength-bars span { transition: none; } }
  `]
})
export class PasswordStrengthComponent {
  @Input() password = '';
  /** The user's name and email: a password containing them counts as weak. */
  @Input() personal: (string | undefined)[] = [];
  @Input() emptyHint = `At least ${MIN_PASSWORD_LENGTH} characters. A few words together make a strong password.`;

  readonly bars = [1, 2, 3];

  get check(): PasswordCheck {
    return checkPassword(this.password, this.personal.filter((value): value is string => !!value));
  }
}
