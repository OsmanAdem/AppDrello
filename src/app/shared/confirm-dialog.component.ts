import { AfterViewChecked, Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmService, OpenDialog } from './confirm.service';

/** The one "Are you sure?" dialog for the whole app. It's placed once, in app.component.html. */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="confirm-backdrop" *ngIf="dialogs.current as dialog" (click)="dialogs.answer(false)">
      <section
        class="confirm-dialog"
        [attr.role]="dialog.kind === 'prompt' ? 'dialog' : 'alertdialog'"
        aria-modal="true"
        aria-labelledby="confirm-title"
        [attr.aria-describedby]="dialog.message ? 'confirm-message' : null"
        (click)="$event.stopPropagation()">
        <div class="confirm-icon" [class.is-danger]="dialog.danger" aria-hidden="true">{{ icon(dialog) }}</div>
        <h2 id="confirm-title">{{ dialog.title }}</h2>
        <p id="confirm-message" *ngIf="dialog.message">{{ dialog.message }}</p>

        <!-- Text field for prompt dialogs. Enter saves. -->
        <form *ngIf="dialog.kind === 'prompt'" (ngSubmit)="dialogs.answer(true)" novalidate>
          <label class="prompt-field">
            <span>{{ dialog.label }}</span>
            <input
              #promptInput
              name="value"
              [(ngModel)]="dialog.value"
              (ngModelChange)="dialog.error = ''"
              [placeholder]="dialog.placeholder"
              [attr.maxlength]="dialog.maxLength"
              autocomplete="off">
          </label>
          <p class="prompt-error" *ngIf="dialog.error" role="alert">{{ dialog.error }}</p>
        </form>

        <div class="confirm-actions">
          <button type="button" class="confirm-cancel" *ngIf="dialog.kind !== 'notice'" (click)="dialogs.answer(false)" #cancelButton>Cancel</button>
          <button type="button" class="confirm-ok" [class.is-danger]="dialog.danger" (click)="dialogs.answer(true)" #okButton>
            {{ dialog.confirmLabel }}
          </button>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .confirm-backdrop { position: fixed; inset: 0; z-index: 1400; display: grid; place-items: center; padding: 20px; background: rgba(12, 16, 27, .45); backdrop-filter: blur(4px); animation: confirm-fade .14s ease; }
    .confirm-dialog { width: min(100%, 420px); padding: 24px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-lg); animation: confirm-lift .18s ease-out; }
    .confirm-icon { display: grid; width: 40px; height: 40px; margin-bottom: 14px; place-items: center; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font-size: 20px; font-weight: 800; }
    .confirm-icon.is-danger { background: var(--danger-soft); color: var(--danger-strong); }
    h2 { margin: 0 0 8px; color: var(--text-strong); font-size: 18px; line-height: 1.35; letter-spacing: -.02em; overflow-wrap: anywhere; }
    p { margin: 0 0 22px; color: var(--text-muted); font-size: 14px; line-height: 1.55; }
    .confirm-actions { display: flex; justify-content: flex-end; gap: 9px; }
    button { min-height: 40px; padding: 0 16px; border-radius: 10px; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; transition: background .15s ease, border-color .15s ease; }
    .confirm-cancel { border: 1px solid var(--line); background: var(--surface); color: var(--text); }
    .confirm-cancel:hover { background: var(--surface-sunken); }
    .confirm-ok { border: 1px solid var(--accent); background: var(--accent); color: #ffffff; }
    .confirm-ok:hover { border-color: var(--accent-pressed); background: var(--accent-pressed); }
    .confirm-ok.is-danger { border-color: var(--danger); background: var(--danger); }
    .confirm-ok.is-danger:hover { border-color: var(--danger-strong); background: var(--danger-strong); }
    button:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
    @keyframes confirm-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes confirm-lift { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .confirm-backdrop, .confirm-dialog { animation: none; } }
    .prompt-field { display: flex; flex-direction: column; gap: 6px; margin: 0 0 6px; }
    .prompt-field span { color: var(--text-muted); font-size: 12px; font-weight: 700; }
    .prompt-field input { height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--text-strong); font-family: inherit; font-size: 14px; outline: none; transition: border-color .15s ease, box-shadow .15s ease; }
    .prompt-field input:focus { border-color: var(--accent-border); box-shadow: 0 0 0 3px var(--accent-soft); }
    .prompt-error { margin: 4px 0 0; color: var(--danger-strong); font-size: 13px; font-weight: 600; }
    form + .confirm-actions { margin-top: 18px; }
    @media (max-width: 420px) { .confirm-actions { flex-direction: column-reverse; } button { width: 100%; } }
  `]
})
export class ConfirmDialogComponent implements AfterViewChecked {
  @ViewChild('cancelButton') cancelButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('okButton') okButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('promptInput') promptInput?: ElementRef<HTMLInputElement>;
  private focusedDialog: object | null = null;

  constructor(public dialogs: ConfirmService) {}

  icon(dialog: OpenDialog): string {
    if (dialog.danger) return '!';
    return { confirm: '?', prompt: '✎', notice: 'i' }[dialog.kind];
  }

  /**
   * Put the keyboard focus in the right place when a dialog opens:
   * the text field for prompts, OK for notices, and Cancel for confirmations
   * (so Enter never deletes anything by accident).
   */
  ngAfterViewChecked(): void {
    const dialog = this.dialogs.current;
    if (!dialog) {
      this.focusedDialog = null;
      return;
    }
    if (dialog === this.focusedDialog) return;

    const target = dialog.kind === 'prompt' ? this.promptInput
      : dialog.kind === 'notice' ? this.okButton
      : this.cancelButton;
    if (!target) return;

    this.focusedDialog = dialog;
    target.nativeElement.focus();
    if (target === this.promptInput) target.nativeElement.select();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.dialogs.current) this.dialogs.answer(false);
  }
}
