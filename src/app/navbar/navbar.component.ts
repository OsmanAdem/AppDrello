import { Component, ElementRef, EventEmitter, HostListener, Output, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ThemeService } from '../shared/theme.service';
import { AuthService } from '../auth/auth.service';
import { BoardService } from '../board.service';

export type DrelloPage = 'home' | 'boards' | 'about';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  @Output() pageChange = new EventEmitter<DrelloPage>();

  constructor(
    public theme: ThemeService,
    public auth: AuthService,
    public boards: BoardService,
    private router: Router
  ) {}

  showLogoutConfirm = false;
  loggingOut = false;

  @ViewChild('confirmButton') confirmButton?: ElementRef<HTMLButtonElement>;

  askToLogout(): void {
    this.showLogoutConfirm = true;
    // Start saving anything still waiting, so the warning below is up to date.
    this.boards.flushPendingWrites();
    // Move keyboard focus into the dialog, so Enter confirms and screen readers announce it.
    setTimeout(() => this.confirmButton?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  cancelLogout(): void {
    this.showLogoutConfirm = false;
  }

  /** Waits until every change has reached the server, then logs out. */
  async logout(): Promise<void> {
    this.loggingOut = true;
    await this.boards.flushPendingWrites();
    this.loggingOut = false;
    this.showLogoutConfirm = false;
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  selectPage(page: DrelloPage): void {
    this.pageChange.emit(page);
  }
}

