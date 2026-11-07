import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { LoginComponent } from './login.component';
import { API_URL } from '../api.service';

@Component({ standalone: true, template: 'Boards page' })
class BoardsStubComponent {}

describe('LoginComponent', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'login', component: LoginComponent, data: { mode: 'login' } },
          { path: 'signup', component: LoginComponent, data: { mode: 'register' } },
          { path: 'boards', component: BoardsStubComponent }
        ])
      ]
    });
    harness = await RouterTestingHarness.create();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => localStorage.clear());

  const text = () => harness.routeNativeElement!.textContent ?? '';

  it('shows the login form on /login', async () => {
    await harness.navigateByUrl('/login');
    expect(text()).toContain('Log in to Drello');
    expect(text()).toContain('Forgot password?');
  });

  it('shows the sign-up form on /signup', async () => {
    await harness.navigateByUrl('/signup');
    expect(text()).toContain('Create your Drello account');
  });

  // The bug we fixed: the navbar's "Log in" link must switch back from the sign-up form.
  it('goes back to the login form when /login is opened from /signup', async () => {
    await harness.navigateByUrl('/signup');
    await harness.navigateByUrl('/login');
    expect(text()).toContain('Log in to Drello');
  });

  it('keeps returnUrl when switching to the other form', async () => {
    const login = await harness.navigateByUrl('/login?returnUrl=%2Fboards%2Fb1', LoginComponent);
    login.switchMode();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/signup?returnUrl=%2Fboards%2Fb1');
  });

  it('shows the server\'s message when the password is wrong', async () => {
    const login = await harness.navigateByUrl('/login', LoginComponent);
    login.email = 'osman@example.com';
    login.password = 'wrong-password';
    login.submit();

    http.expectOne(`${API_URL}/auth/login`).flush(
      { error: 'Wrong email or password.' },
      { status: 401, statusText: 'Unauthorized' }
    );
    harness.detectChanges();

    expect(text()).toContain('Wrong email or password.');
  });

  it('asks for all fields before sending anything', async () => {
    const login = await harness.navigateByUrl('/login', LoginComponent);
    login.submit();
    harness.detectChanges();

    http.expectNone(`${API_URL}/auth/login`);
    expect(text()).toContain('Please fill in all fields.');
  });
});
