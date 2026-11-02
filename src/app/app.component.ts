import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { DrelloPage } from './navbar/navbar.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  activePage: DrelloPage = 'home';

  constructor(private router: Router) {}

  changePage(page: DrelloPage): void {
    this.activePage = page;

    if (page === 'home') {
      this.router.navigate(['/home']);
    } else if (page === 'boards') {
      this.router.navigate(['/boards']);
    } else if (page === 'about') {
      this.router.navigate(['/about']);
    }
  }
}
