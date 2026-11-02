import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ThemeService } from '../shared/theme.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent {
  constructor(private router: Router, public theme: ThemeService) {}

  openBoards(): void {
    this.router.navigate(['/boards']);
  }

  openAbout(): void {
    this.router.navigate(['/about']);
  }
}
