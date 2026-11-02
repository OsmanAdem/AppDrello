import { Component, EventEmitter, Output } from '@angular/core';
import { ThemeService } from '../shared/theme.service';

export type DrelloPage = 'home' | 'boards' | 'about';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  @Output() pageChange = new EventEmitter<DrelloPage>();

  constructor(public theme: ThemeService) {}

  selectPage(page: DrelloPage): void {
    this.pageChange.emit(page);
  }
}

