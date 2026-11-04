import { Component, EventEmitter, Output } from '@angular/core';
import { Router } from '@angular/router';
import { ThemeService } from '../shared/theme.service';
import { AuthService } from '../auth/auth.service';

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
    private router: Router
  ) {}

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  selectPage(page: DrelloPage): void {
    this.pageChange.emit(page);
  }
}

