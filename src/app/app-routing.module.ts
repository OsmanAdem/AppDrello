import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { HomeComponent } from './home/home.component';
import { BoardComponent } from './board/board.component';
import { BoardGalleryComponent } from './column/board-gallery/board-gallery.component';
import { AboutComponent } from './about/about.component';
import { LoginComponent } from './auth/login.component';
import { authGuard } from './auth/auth.guard';

const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  // The boards need a login: authGuard sends you to /login first.
  { path: 'boards', component: BoardGalleryComponent, canActivate: [authGuard] },
  { path: 'boards/:id', component: BoardComponent, canActivate: [authGuard] },
  { path: 'about', component: AboutComponent },
  { path: '**', redirectTo: 'home' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
