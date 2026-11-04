import { Directive, ElementRef, OnDestroy, OnInit, Renderer2 } from '@angular/core';

/**
 * Adds a "Show" / "Hide" button inside a password field.
 * Usage: <input type="password" appRevealPassword ...>
 *
 * A directive adds behaviour to an existing element, so every password field
 * in the app gets the same button without repeating any code.
 */
@Directive({
  selector: 'input[appRevealPassword]',
  standalone: true
})
export class RevealPasswordDirective implements OnInit, OnDestroy {
  private button?: HTMLButtonElement;
  private visible = false;
  private stopListening?: () => void;

  constructor(
    private input: ElementRef<HTMLInputElement>,
    private renderer: Renderer2
  ) {}

  ngOnInit(): void {
    const input = this.input.nativeElement;
    const parent = this.renderer.parentNode(input);
    if (!parent) return;

    // Wrap the input so the button can sit inside its right edge.
    const wrapper: HTMLElement = this.renderer.createElement('span');
    this.renderer.addClass(wrapper, 'password-field');
    this.renderer.insertBefore(parent, wrapper, input);
    this.renderer.appendChild(wrapper, input);

    const button: HTMLButtonElement = this.renderer.createElement('button');
    this.renderer.setAttribute(button, 'type', 'button'); // never submits the form
    this.renderer.addClass(button, 'password-toggle');
    this.renderer.appendChild(wrapper, button);
    this.button = button;
    this.update();

    this.stopListening = this.renderer.listen(button, 'click', () => this.toggle());
  }

  ngOnDestroy(): void {
    this.stopListening?.();
  }

  private toggle(): void {
    const input = this.input.nativeElement;
    const start = input.selectionStart;
    const end = input.selectionEnd;

    this.visible = !this.visible;
    this.update();

    // Keep typing where you were.
    input.focus();
    try {
      if (start !== null && end !== null) input.setSelectionRange(start, end);
    } catch {
      // Some input types don't support selection; nothing to restore then.
    }
  }

  private update(): void {
    if (!this.button) return;
    this.renderer.setProperty(this.input.nativeElement, 'type', this.visible ? 'text' : 'password');
    this.renderer.setProperty(this.button, 'textContent', this.visible ? 'Hide' : 'Show');
    this.renderer.setAttribute(this.button, 'aria-label', this.visible ? 'Hide password' : 'Show password');
    this.renderer.setAttribute(this.button, 'aria-pressed', String(this.visible));
  }
}
