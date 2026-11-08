import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { IconComponent } from '../shared/icon.component';

describe('NavbarComponent', () => {
  let fixture: ComponentFixture<NavbarComponent>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      declarations: [NavbarComponent],
      imports: [RouterModule.forRoot([]), IconComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    fixture.detectChanges();
  });

  /** Pretends someone is logged in: a token that expires far in the future, and the user. */
  function loginAs(name: string): void {
    const payload = btoa(JSON.stringify({ sub: 'u1', exp: 4102444800 }));
    localStorage.setItem('drello-token', `x.${payload}.y`);
    localStorage.setItem('drello-user', JSON.stringify({ id: 'u1', name, email: 'osman@example.com' }));
    fixture.detectChanges();
  }

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows "Log in" and hides "Boards" when nobody is logged in', () => {
    expect(fixture.nativeElement.textContent).toContain('Log in');
    expect(fixture.nativeElement.textContent).not.toContain('Boards');
  });

  it('shows "Boards" once logged in', () => {
    loginAs('Osman Adem');
    expect(fixture.nativeElement.textContent).toContain('Boards');
  });

  it('shows the logged-in user as initials and first name, with a menu', () => {
    loginAs('Osman Adem');
    const page: HTMLElement = fixture.nativeElement;

    expect(page.querySelector('.user-avatar')?.textContent?.trim()).toBe('OA');
    expect(page.querySelector('.user-first-name')?.textContent?.trim()).toBe('Osman');
    expect(page.querySelector('.user-dropdown')).toBeNull();

    (page.querySelector('.user-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const menu = page.querySelector('.user-dropdown')!;
    expect(menu.textContent).toContain('osman@example.com');
    expect(menu.textContent).toContain('Account settings');
    expect(menu.textContent).toContain('Log out');
  });

  it('closes the user menu when clicking somewhere else on the page', () => {
    loginAs('Osman Adem');
    const page: HTMLElement = fixture.nativeElement;
    (page.querySelector('.user-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(page.querySelector('.user-dropdown')).not.toBeNull();

    // A card that stops clicks from bubbling must still close the menu.
    const card = document.createElement('div');
    card.addEventListener('pointerdown', event => event.stopPropagation());
    document.body.appendChild(card);
    card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    card.remove();
    fixture.detectChanges();

    expect(page.querySelector('.user-dropdown')).toBeNull();
  });

  it('shows the number of invitations on "Boards"', () => {
    loginAs('Osman Adem');
    fixture.componentInstance.invitations.invitations = [
      { boardId: 'b1', boardName: 'Website', ownerName: 'Sara', invitedAt: '2026-11-08' },
      { boardId: 'b2', boardName: 'App', ownerName: 'Omar', invitedAt: '2026-11-08' }
    ];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.nav-badge')?.textContent?.trim()).toBe('2');
  });

    it('switches between light and dark mode', () => {
    const theme = fixture.componentInstance.theme;
    theme.set('light');

    theme.toggle();

    expect(theme.current).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
