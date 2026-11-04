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

interface OpenDialog extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Shows the app's own "Are you sure?" dialog (see ConfirmDialogComponent).
 * Usage: if (!(await this.confirm.ask({ ... }))) return;
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  current: OpenDialog | null = null;

  ask(options: ConfirmOptions): Promise<boolean> {
    // A new question replaces an open one; the old one counts as "Cancel".
    this.current?.resolve(false);

    return new Promise(resolve => {
      this.current = { ...options, resolve };
    });
  }

  answer(confirmed: boolean): void {
    const dialog = this.current;
    this.current = null;
    dialog?.resolve(confirmed);
  }
}

/** Puts a name in quotes for a dialog title, and handles empty names. */
export function quoted(name: string | undefined, fallback = 'Untitled'): string {
  const clean = (name ?? '').trim();
  const short = clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
  return `“${short || fallback}”`;
}
