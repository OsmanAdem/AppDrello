import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL, ApiService } from './api.service';

describe('ApiService', () => {
  let service: ApiService;
  let http: HttpTestingController; // a fake backend: no real requests are sent

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify()); // fails the test if a request was not handled

  it('loads boards with GET /boards', () => {
    service.getBoards().subscribe(boards => expect(boards.length).toBe(1));

    const request = http.expectOne(`${API_URL}/boards`);
    expect(request.request.method).toBe('GET');
    request.flush([{ id: 'b1', name: 'Board', createdAt: new Date(), updatedAt: new Date() }]);
  });

  it('creates a board with POST /boards', () => {
    service.createBoard('New', ['A', 'B']).subscribe();

    const request = http.expectOne(`${API_URL}/boards`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'New', columns: ['A', 'B'] });
    request.flush({});
  });
});
