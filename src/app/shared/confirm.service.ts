import { Injectable } from '@angular/core';

export interface ConfirmOptions {
  /** The question, e.g. 'Delete board “Website”?' */
  title: string;
  /** What will happen, in one or two sentences. */
  message: string;
  /** Text on the confirm button, e.g. "Delete board". */
  confirmLabel: string;
  /** Red confirm button for actions that delete something. */
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  /** Label above the text field, e.g. "Column name". */
  label: string;
  /** Text already in the field, e.g. the current name when renaming. */
  value?: string;
  placeholder?: string;
  confirmLabel: string;
  maxLength?: number;
  /** Shown when the user tries to save an empty field. */
  emptyError?: string;
}

export interface NoticeOptions {
  title: string;
  message: string;
}

export type DialogKind = 'confirm' | 'prompt' | 'notice';

export interface OpenDialog {
  kind: DialogKind;
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  label: string;
  placeholder: string;
  maxLength: number;
  emptyError: string;
  /** The text in the field (prompt dialogs only). */
  value: string;
  error: string;
  finish: (confirmed: boolean) => void;
}

/**
 * The app's own dialogs, instead of the browser's grey popups:
 * - ask():    "Are you sure?"            → true / false
 * - prompt(): ask for a name or title    → the text, or null if cancelled
 * - notify(): tell the user something    → resolves when they click OK
 * They are shown by ConfirmDialogComponent, placed once in app.component.html.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  current: OpenDialog | null = null;

  ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise(resolve => this.open({
      kind: 'confirm',
      ...options,
      danger: !!options.danger,
      finish: resolve
    }));
  }

  prompt(options: PromptOptions): Promise<string | null> {
    return new Promise(resolve => {
      const dialog = this.open({
        kind: 'prompt',
        title: options.title,
        message: options.message ?? '',
        confirmLabel: options.confirmLabel,
        label: options.label,
        value: options.value ?? '',
        placeholder: options.placeholder ?? '',
        maxLength: options.maxLength ?? 80,
        emptyError: options.emptyError ?? 'This field cannot be empty.',
        finish: confirmed => resolve(confirmed ? dialog.value.trim() : null)
      });
    });
  }

  notify(options: NoticeOptions): Promise<void> {
    return new Promise(resolve => this.open({
      kind: 'notice',
      ...options,
      confirmLabel: 'OK',
      finish: () => resolve()
    }));
  }

  /** Called by the dialog's buttons. An empty text field keeps the dialog open with an error. */
  answer(confirmed: boolean): void {
    const dialog = this.current;
    if (!dialog) return;

    if (confirmed && dialog.kind === 'prompt' && !dialog.value.trim()) {
      dialog.error = dialog.emptyError;
      return;
    }

    this.current = null;
    dialog.finish(confirmed);
  }

  private open(partial: Partial<OpenDialog> & Pick<OpenDialog, 'kind' | 'title' | 'confirmLabel' | 'finish'>): OpenDialog {
    // A new dialog replaces an open one; the old one counts as "Cancel".
    this.current?.finish(false);

    const dialog: OpenDialog = {
      message: '', danger: false, label: '', placeholder: '', maxLength: 80,
      emptyError: '', value: '', error: '',
      ...partial
    };
    this.current = dialog;
    return dialog;
  }
}

/** Puts a name in quotes for a dialog title, and handles empty names. */
export function quoted(name: string | undefined, fallback = 'Untitled'): string {
  const clean = (name ?? '').trim();
  const short = clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
  return `“${short || fallback}”`;
}
