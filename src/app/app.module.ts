import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './auth/auth.interceptor';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { NavbarComponent } from './navbar/navbar.component';
import { BoardComponent } from './board/board.component';
import { ColumnComponent } from './column/column.component';
import { CardComponent } from './card/card.component';
import { FooterComponent } from './footer/footer.component';
import { HomeComponent } from './home/home.component';
import { AboutComponent } from './about/about.component';
import { BacklogComponent } from './backlog/backlog.component';
import { ConfirmDialogComponent } from './shared/confirm-dialog.component';
import { IconComponent } from './shared/icon.component';

@NgModule({
  declarations: [
    AppComponent,
    NavbarComponent,
    BoardComponent,
    ColumnComponent,
    CardComponent,
    FooterComponent,
    HomeComponent,
    AboutComponent,
    BacklogComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    DragDropModule,
    ConfirmDialogComponent,
    IconComponent,
    AppRoutingModule
  ],
  providers: [provideHttpClient(withFetch(), withInterceptors([authInterceptor]))],
  bootstrap: [AppComponent]
})
export class AppModule {}
