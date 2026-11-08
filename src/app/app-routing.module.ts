import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { HomeComponent } from './home/home.component';
import { BoardComponent } from './board/board.component';
import { BoardGalleryComponent } from './column/board-gallery/board-gallery.component';
import { AboutComponent } from './about/about.component';
import { LoginComponent } from './auth/login.component';
import { ForgotPasswordComponent } from './auth/forgot-password.component';
import { ResetPasswordComponent } from './auth/reset-password.component';
import { AccountComponent } from './auth/account.component';
import { authGuard } from './auth/auth.guard';
import { NotFoundComponent } from './not-found/not-found.component';

const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'login', component: LoginComponent, data: { mode: 'login' } },
  { path: 'signup', component: LoginComponent, data: { mode: 'register' } },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'account', component: AccountComponent, canActivate: [authGuard] },
  // The boards need a login: authGuard sends you to /login first.
  { path: 'boards', component: BoardGalleryComponent, canActivate: [authGuard] },
  { path: 'boards/:id', component: BoardComponent, canActivate: [authGuard] },
  { path: 'about', component: AboutComponent },
  // Any other address: a clear "Page not found" instead of silently going home.
  { path: '**', component: NotFoundComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
