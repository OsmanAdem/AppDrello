import { Inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark';
/** What the user picked. 'system' = follow the computer (light by day, dark at night if it's set to Auto). */
export type ThemeChoice = Theme | 'system';

/**
 * Light and dark mode.
 * By default the app follows the computer's setting ('system'): the CSS reads it with
 * prefers-color-scheme. When the user picks Light or Dark, the choice is saved and set as
 * data-theme on <html>, which wins over the computer. Picking System removes it again.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'drello-theme';
  private readonly isBrowser: boolean;
  private readonly systemDark?: MediaQueryList;

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    @Inject(DOCUMENT) private document: Document,
    zone: NgZone
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser && typeof window.matchMedia === 'function') {
      this.systemDark = window.matchMedia('(prefers-color-scheme: dark)');
      // When the computer switches (e.g. at sunset), update the icons and pictures that depend on the theme.
      this.systemDark.addEventListener?.('change', () => zone.run(() => undefined));
    }
  }

  /** What the user picked: Light, Dark, or System (the default). */
  get choice(): ThemeChoice {
    return this.readSaved() ?? 'system';
  }

  /** The theme showing right now. */
  get current(): Theme {
    if (!this.isBrowser) return 'light';
    const choice = this.choice;
    if (choice !== 'system') return choice;
    return this.systemDark?.matches ? 'dark' : 'light';
  }

  /** The quick sun/moon button: switches to the opposite of what is showing. */
  toggle(): void {
    this.set(this.current === 'dark' ? 'light' : 'dark');
  }

  set(choice: ThemeChoice): void {
    if (!this.isBrowser) return;

    const root = this.document.documentElement;
    if (choice === 'system') {
      root.removeAttribute('data-theme'); // the CSS follows the computer again
    } else {
      root.setAttribute('data-theme', choice);
    }

    try {
      if (choice === 'system') localStorage.removeItem(this.storageKey);
      else localStorage.setItem(this.storageKey, choice);
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
