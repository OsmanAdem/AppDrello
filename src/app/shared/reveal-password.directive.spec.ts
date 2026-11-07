import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RevealPasswordDirective } from './reveal-password.directive';

/** A tiny page with one password field, just for this test. */
@Component({
  standalone: true,
  imports: [RevealPasswordDirective],
  template: `<label>Password <input type="password" appRevealPassword value="secret123"></label>`
})
class HostComponent {}

describe('RevealPasswordDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let input: HTMLInputElement;
  let button: HTMLButtonElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    input = fixture.nativeElement.querySelector('input');
    button = fixture.nativeElement.querySelector('.password-toggle');
  });

  it('adds a "Show" button and keeps the password hidden', () => {
    expect(button).toBeTruthy();
    expect(button.textContent).toBe('Show');
    expect(button.getAttribute('type')).toBe('button'); // never submits the form
    expect(input.type).toBe('password');
  });

  it('shows the password, then hides it again', () => {
    button.click();
    expect(input.type).toBe('text');
    expect(button.textContent).toBe('Hide');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Hide password');

    button.click();
    expect(input.type).toBe('password');
    expect(button.textContent).toBe('Show');
  });
});
