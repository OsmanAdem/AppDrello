import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let theme: ThemeService;

  beforeEach(() => {
    localStorage.removeItem('drello-theme');
    document.documentElement.removeAttribute('data-theme');
    theme = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    localStorage.removeItem('drello-theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('follows the computer by default', () => {
    expect(theme.choice).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBeFalse();
  });

  it('remembers Light or Dark', () => {
    theme.set('dark');
    expect(theme.choice).toBe('dark');
    expect(theme.current).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('drello-theme')).toBe('dark');
  });

  it('goes back to following the computer when System is picked', () => {
    theme.set('light');
    theme.set('system');
    expect(theme.choice).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBeFalse();
    expect(localStorage.getItem('drello-theme')).toBeNull();
  });
});
