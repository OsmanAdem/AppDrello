import { Component, ElementRef, EventEmitter, HostListener, Inject, NgZone, OnDestroy, OnInit, Output, PLATFORM_ID, ViewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { InvitationService } from '../shared/invitation.service';
import { ThemeChoice, ThemeService } from '../shared/theme.service';
import { IconName } from '../shared/icon.component';
import { AuthService } from '../auth/auth.service';
import { BoardService } from '../board.service';

export type DrelloPage = 'home' | 'boards' | 'about';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit, OnDestroy {
  @Output() pageChange = new EventEmitter<DrelloPage>();

  constructor(
    public theme: ThemeService,
    public auth: AuthService,
    public boards: BoardService,
    public invitations: InvitationService,
    private router: Router,
    private zone: NgZone,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  showUserMenu = false;

  readonly themeOptions: { value: ThemeChoice; label: string; icon: IconName; hint: string }[] = [
    { value: 'system', label: 'System', icon: 'monitor', hint: "Follow your computer's setting (the default)" },
    { value: 'light', label: 'Light', icon: 'sun', hint: 'Always light' },
    { value: 'dark', label: 'Dark', icon: 'moon', hint: 'Always dark' }
  ];
  private navigationSubscription?: Subscription;

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.addEventListener('pointerdown', this.closeOnOutsidePointer, true);
    }
    // Logging in or out always changes the page, so that's when we check whose invitations to show.
    this.invitations.followLoggedInUser();
    this.navigationSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.showUserMenu = false;
        this.invitations.followLoggedInUser();
      });
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.removeEventListener('pointerdown', this.closeOnOutsidePointer, true);
    }
    this.navigationSubscription?.unsubscribe();
  }

  /** "Osman Adem" → "OA". */
  get initials(): string {
    const parts = (this.auth.user?.name ?? '').trim().split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
    return letters.toUpperCase();
  }

  /** "Osman Adem" → "Osman". The full name is shown in the menu. */
  get firstName(): string {
    return (this.auth.user?.name ?? '').trim().split(/\s+/)[0] || 'Account';
  }

  showLogoutConfirm = false;
  loggingOut = false;

  @ViewChild('confirmButton') confirmButton?: ElementRef<HTMLButtonElement>;

  askToLogout(): void {
    this.showLogoutConfirm = true;
    // Start sending anything still waiting while the user reads the dialog.
    this.boards.flushPendingWrites();
    // Move keyboard focus into the dialog, so Enter confirms and screen readers announce it.
    setTimeout(() => this.confirmButton?.nativeElement.focus());
  }

  @ViewChild('userMenu') userMenu?: ElementRef<HTMLElement>;

  /**
   * A click or tap anywhere outside the user menu closes it, like any native menu.
   * It listens in the "capture" phase, before the page handles the click, because cards,
   * columns and panels stop clicks from travelling further (stopPropagation).
   */
  private readonly closeOnOutsidePointer = (event: Event): void => {
    if (this.showUserMenu && !this.userMenu?.nativeElement.contains(event.target as Node)) {
      this.zone.run(() => (this.showUserMenu = false));
    }
  };

  @HostListener('document:keydown.escape')
  cancelLogout(): void {
    this.showLogoutConfirm = false;
    this.showUserMenu = false;
  }

  /**
   * Waits until every change has reached the server, then logs out.
   * Anything the server couldn't take is kept for this user and sent at the next login.
   */
  async logout(): Promise<void> {
    this.loggingOut = true;
    await this.boards.flushPendingWrites();
    const userId = this.auth.user?.id;
    if (userId) this.boards.keepUnsavedChangesFor(userId);
    this.loggingOut = false;
    this.showLogoutConfirm = false;
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  selectPage(page: DrelloPage): void {
    this.pageChange.emit(page);
  }
}

