import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark';

/**
 * Light and dark mode.
 * By default the app follows the computer's setting. When the user picks a theme,
 * the choice is saved and set as data-theme on <html>, which the CSS reads.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'drello-theme';
  private readonly isBrowser: boolean;

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  /** The theme currently showing: the saved choice, otherwise the computer's setting. */
  get current(): Theme {
    if (!this.isBrowser) return 'light';

    const saved = this.readSaved();
    if (saved) return saved;

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  toggle(): void {
    this.set(this.current === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    if (!this.isBrowser) return;

    this.document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(this.storageKey, theme);
    } catch {
      // Storage can be blocked (private mode). The theme still applies for this visit.
    }
  }

  private readSaved(): Theme | null {
    try {
      const value = localStorage.getItem(this.storageKey);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }
}
